/* timeline-layer.js — 🛣 移動タイムライン画層(Googleマップのタイムラインをシステムの地図上に青い線で表示) v20260922e
 *
 * 目的(ドクター指示 2026-09-22): 「バラバラのweb画面ではなくシステム上に、Googleタイムラインと一緒で青い線画が表示される様に」。
 *   iPhoneのGoogleマップからエクスポートした Timeline.json(端末内保存・Web版タイムラインは廃止済)を、
 *   トラッカーの地図に画層として重ねる。移動の軌跡=青線、滞在=白丸(青縁)、移動区間=灰破線。
 *
 * 使い方: 左パネル最下部の「🛣 移動タイムライン」を押す → 画層ON＋操作欄が開く → 「📂 Timeline.json 読込」で
 *   ファイルを選ぶ(地図へドラッグ＆ドロップでも可)。日付を選ぶとその日の軌跡を描画。「全期間の訪問地」で全訪問先を集約表示。
 *   読み込んだデータは このブラウザ内(IndexedDB) に保持=次回はファイル選択不要。新しいエクスポートは「🔄 再読込」(Chrome/Edge)
 *   または再度ファイル選択で置き換え。位置履歴はどこにも送信しない(Supabase/サーバー書込なし)。
 *
 * 依存: Leaflet(window.L)・window.map・左パネル(.hazard-body 内の #hzFarmlandFlag)。無ければ何もしない。
 * 単一実装(INDEX§0 複製禁止): 解析/描画はこのファイルだけ。他ページで使う時は <script src="timeline-layer.js"> を1行足す。
 */
(function(){
  'use strict';
  if (window.__timelineLayer) return;
  var TL = window.__timelineLayer = { data: null, on: false };

  /* ---------- 辞書 ---------- */
  var TZ = 'Asia/Tokyo';
  var SEM = { Home:'自宅', Work:'職場', 'Inferred Home':'自宅(推定)', 'Inferred Work':'職場(推定)', 'Searched Address':'検索した住所', 'Aliased Location':'登録地点', Unknown:'不明' };
  var ACT = { 'in passenger vehicle':'自動車', walking:'徒歩', 'in train':'電車', 'in bus':'バス', cycling:'自転車', running:'ランニング', 'in subway':'地下鉄', flying:'飛行機', 'in ferry':'フェリー', motorcycling:'バイク', 'in tram':'路面電車', still:'停止', unknown:'不明', 'in vehicle':'車両' };
  var WD = ['日','月','火','水','木','金','土'];
  var COLOR_PATH = '#1a73e8', COLOR_ACT = '#9aa0a6';
  var PANE = 'timelinePane', PANE_Z = 615; // ピン(610)より上・開拓候補(640)より下=候補フラグのクリックを妨げない

  /* ---------- IndexedDB(kv) ---------- */
  function idb(){ return new Promise(function(res, rej){ var r = indexedDB.open('gridland_timeline', 1); r.onupgradeneeded = function(){ r.result.createObjectStore('kv'); }; r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); }; }); }
  function kvGet(k){ return idb().then(function(db){ return new Promise(function(res, rej){ var t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = function(){ res(t.result); }; t.onerror = function(){ rej(t.error); }; }); }).catch(function(){ return undefined; }); }
  function kvSet(k, v){ return idb().then(function(db){ return new Promise(function(res, rej){ var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = function(){ res(); }; t.onerror = function(){ rej(t.error); }; }); }).catch(function(){}); }
  function lsGet(k){ try { return localStorage.getItem(k); } catch(_) { return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch(_) {} }

  /* ---------- ユーティリティ ---------- */
  var fmtDay = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' });
  var fmtTime = new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, hour:'2-digit', minute:'2-digit', hour12:false });
  function dayKey(d){ return fmtDay.format(d); }
  function hm(d){ return fmtTime.format(d); }
  function geo(s){ if (!s) return null; var m = /geo:(-?[\d.]+),(-?[\d.]+)/.exec(s); return m ? [+m[1], +m[2]] : null; }
  function km(m){ return m >= 1000 ? (m/1000).toFixed(1) + ' km' : Math.round(m) + ' m'; }
  function dur(ms){ var mi = Math.round(ms/60000); if (mi < 60) return mi + '分'; return Math.floor(mi/60) + '時間' + (mi%60 ? (mi%60) + '分' : ''); }
  function distM(a, b){ var R = 6371000, dLat = (b[0]-a[0])*Math.PI/180, dLng = (b[1]-a[1])*Math.PI/180, la1 = a[0]*Math.PI/180, la2 = b[0]*Math.PI/180; var h = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)*Math.sin(dLng/2); return 2*R*Math.asin(Math.sqrt(h)); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function dayLabel(key){ var p = key.split('-'); var dt = new Date(+p[0], +p[1]-1, +p[2]); return p[0] + '/' + (+p[1]) + '/' + (+p[2]) + '(' + WD[dt.getDay()] + ')'; }

  /* ---------- 解析(Googleマップ Timeline.json 形式: visit / activity / timelinePath) ---------- */
  function parse(raw){
    if (!Array.isArray(raw)) throw new Error('配列ではありません。Googleマップ「タイムラインデータをエクスポート」のJSONを選んでください');
    var days = {}, visits = [], nV = 0, nA = 0, nP = 0;
    function day(k){ return days[k] || (days[k] = { items: [], points: [] }); }
    raw.forEach(function(e){
      var st = new Date(e.startTime), en = new Date(e.endTime);
      if (isNaN(st)) return;
      if (e.visit) {
        nV++; var tc = e.visit.topCandidate || {}; var ll = geo(tc.placeLocation); if (!ll) return;
        var it = { type:'visit', st:st, en:en, ll:ll, sem: tc.semanticType || 'Unknown', placeID: tc.placeID || '' };
        day(dayKey(st)).items.push(it); var ek = dayKey(en); if (ek !== dayKey(st)) day(ek).items.push(it);
        visits.push(it);
      } else if (e.activity) {
        nA++; var a = e.activity, s = geo(a.start), t = geo(a.end); if (!s || !t) return;
        var it2 = { type:'activity', st:st, en:en, s:s, e:t, mode: (a.topCandidate || {}).type || 'unknown', m: +(a.distanceMeters || 0) };
        day(dayKey(st)).items.push(it2); var ek2 = dayKey(en); if (ek2 !== dayKey(st)) day(ek2).items.push(it2);
      } else if (e.timelinePath) {
        nP++; e.timelinePath.forEach(function(p){
          var ll = geo(p.point); if (!ll) return; var t = new Date(st.getTime() + (+(p.durationMinutesOffsetFromStartTime || 0)) * 60000);
          day(dayKey(t)).points.push({ t:t, ll:ll });
        });
      }
    });
    var keys = Object.keys(days).sort();
    keys.forEach(function(k){ days[k].items.sort(function(a, b){ return a.st - b.st; }); days[k].points.sort(function(a, b){ return a.t - b.t; }); });
    return { days: days, keys: keys, visits: visits, nVisit: nV, nAct: nA, nPath: nP };
  }

  /* ---------- 描画 ---------- */
  var map, group = null, selKey = null, allMode = false;
  function ensurePane(){ if (!map.getPane(PANE)) { var p = map.createPane(PANE); p.style.zIndex = PANE_Z; } }
  function clear(){ if (group) group.clearLayers(); }
  function visitStyle(){ return { pane: PANE, radius: 7, color: COLOR_PATH, weight: 3, fillColor: '#ffffff', fillOpacity: 1 }; }
  function popupVisit(it){
    var h = '<div style="font:12px/1.5 sans-serif;color:#111"><b>' + esc(SEM[it.sem] || it.sem) + '</b><br>' + dayLabel(dayKey(it.st)) + ' ' + hm(it.st) + ' – ' + hm(it.en) + ' (' + dur(it.en - it.st) + ')<br>' + it.ll[0].toFixed(6) + ', ' + it.ll[1].toFixed(6);
    h += '<br><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + it.ll[0] + ',' + it.ll[1] + '">Googleマップで開く(目視)</a></div>';
    return h;
  }
  function drawDay(key, fit){
    clear(); selKey = key; allMode = false; lsSet('tlLayerDay', key);
    var d = TL.data && TL.data.days[key]; if (!d) { setSummary('この日のデータなし'); return; }
    var bounds = [], seg = [], prev = null;
    function flush(){ if (seg.length > 1) L.polyline(seg, { pane: PANE, color: COLOR_PATH, weight: 4, opacity: 0.9, interactive: false }).addTo(group); seg = []; }
    d.points.forEach(function(p){ if (prev && ((p.t - prev.t) > 90*60000 || distM(prev.ll, p.ll) > 50000)) flush(); seg.push(p.ll); bounds.push(p.ll); prev = p; }); flush();
    var meters = 0, nv = 0;
    d.items.forEach(function(it){ if (it.type === 'activity') { meters += it.m; L.polyline([it.s, it.e], { pane: PANE, color: COLOR_ACT, weight: 2, dashArray: '6 6', opacity: 0.8, interactive: false }).addTo(group); bounds.push(it.s, it.e); } });
    d.items.forEach(function(it){ if (it.type === 'visit') { nv++; L.circleMarker(it.ll, visitStyle()).bindPopup(popupVisit(it)).addTo(group); bounds.push(it.ll); } });
    setSummary(dayLabel(key) + '：滞在' + nv + ' / 移動' + km(meters) + ' / 軌跡' + d.points.length + '点');
    if (fit && bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }
  function drawAll(fit){
    clear(); allMode = true;
    var buckets = {}, bounds = [];
    TL.data.visits.forEach(function(v){ var k = v.ll[0].toFixed(4) + ',' + v.ll[1].toFixed(4); var b = buckets[k] || (buckets[k] = { ll: v.ll, n: 0, sem: v.sem, ms: 0, first: v.st, last: v.st }); b.n++; b.ms += (v.en - v.st); if (v.st < b.first) b.first = v.st; if (v.st > b.last) b.last = v.st; });
    var ks = Object.keys(buckets);
    ks.forEach(function(k){ var b = buckets[k]; var st = visitStyle(); st.radius = Math.min(6 + Math.sqrt(b.n) * 2, 20); st.fillColor = COLOR_PATH; st.fillOpacity = 0.55; st.color = '#fff'; st.weight = 1.5;
      L.circleMarker(b.ll, st).bindPopup('<div style="font:12px/1.5 sans-serif;color:#111"><b>' + esc(SEM[b.sem] || b.sem) + '</b><br>訪問 ' + b.n + ' 回 / 滞在合計 ' + dur(b.ms) + '<br>' + dayLabel(dayKey(b.first)) + ' 〜 ' + dayLabel(dayKey(b.last)) + '<br>' + b.ll[0].toFixed(6) + ', ' + b.ll[1].toFixed(6) + '</div>').addTo(group); bounds.push(b.ll); });
    setSummary('全期間の訪問地 ' + ks.length + '地点(円の大きさ=訪問回数)');
    if (fit && bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
  }

  /* ---------- UI(左パネル) ---------- */
  var ui = {};
  function el(tag, css, html){ var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function setSummary(t){ if (ui.sum) ui.sum.textContent = t; }
  function setMsg(t, bad){ if (ui.msg) { ui.msg.textContent = t || ''; ui.msg.style.color = bad ? '#f87171' : 'var(--text-muted)'; } }
  function buildUI(anchor){
    var body = anchor.parentNode;
    var div = el('div'); div.className = 'hazard-divider'; body.appendChild(div);
    ui.btn = el('button'); ui.btn.className = 'hazard-btn'; ui.btn.id = 'hzTimeline'; ui.btn.innerHTML = '&#128739; 移動タイムライン'; ui.btn.title = 'Googleマップのタイムライン(Timeline.json)を地図上に青い線で表示';
    ui.btn.onclick = function(){ setOn(!TL.on); };
    body.appendChild(ui.btn);
    ui.box = el('div', 'display:none;margin-top:4px;padding:8px 6px;background:var(--surface2);border-radius:6px;border:1px solid var(--border);font-size:10px;');
    ui.box.id = 'timelineLegend';
    var row1 = el('div', 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;');
    ui.load = el('button', 'font-size:10px;padding:3px 8px;cursor:pointer;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--text);', '&#128194; Timeline.json 読込');
    ui.reload = el('button', 'display:none;font-size:10px;padding:3px 8px;cursor:pointer;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--text);', '&#128260; 再読込');
    ui.file = el('input'); ui.file.type = 'file'; ui.file.accept = '.json,application/json'; ui.file.style.display = 'none';
    row1.appendChild(ui.load); row1.appendChild(ui.reload); row1.appendChild(ui.file); ui.box.appendChild(row1);
    var row2 = el('div', 'display:flex;gap:4px;align-items:center;margin-bottom:6px;');
    ui.prev = el('button', 'font-size:11px;padding:2px 7px;cursor:pointer;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--text);', '&#9664;');
    ui.sel = el('select', 'flex:1;min-width:0;font-size:10px;padding:2px 4px;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--text);');
    ui.next = el('button', 'font-size:11px;padding:2px 7px;cursor:pointer;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--text);', '&#9654;');
    row2.appendChild(ui.prev); row2.appendChild(ui.sel); row2.appendChild(ui.next); ui.box.appendChild(row2);
    var row3 = el('div', 'display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;');
    ui.fit = el('button', 'font-size:10px;padding:3px 8px;cursor:pointer;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--text);', '&#128205; この日へ移動');
    var lab = el('label', 'display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--text);');
    ui.all = el('input'); ui.all.type = 'checkbox'; lab.appendChild(ui.all); lab.appendChild(document.createTextNode('全期間の訪問地'));
    row3.appendChild(ui.fit); row3.appendChild(lab); ui.box.appendChild(row3);
    ui.sum = el('div', 'color:var(--text);margin-bottom:4px;line-height:1.4;', 'データ未読込');
    ui.box.appendChild(ui.sum);
    ui.msg = el('div', 'color:var(--text-muted);margin-bottom:6px;line-height:1.3;word-break:break-all;');
    ui.box.appendChild(ui.msg);
    ui.box.appendChild(el('div', 'display:flex;flex-direction:column;gap:3px;color:var(--text);',
      '<div style="display:flex;align-items:center;gap:5px;"><div style="width:14px;height:3px;background:' + COLOR_PATH + ';flex-shrink:0"></div>移動の軌跡</div>' +
      '<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;background:#fff;border:2px solid ' + COLOR_PATH + ';border-radius:50%;flex-shrink:0"></div>滞在地点(クリックで時刻)</div>' +
      '<div style="display:flex;align-items:center;gap:5px;"><div style="width:14px;height:0;border-top:2px dashed ' + COLOR_ACT + ';flex-shrink:0"></div>移動区間(始点→終点)</div>'));
    ui.box.appendChild(el('div', 'font-size:9px;color:var(--text-muted);margin-top:6px;line-height:1.3;',
      '※ iPhone Googleマップ→プロフィール→タイムライン→⋯→位置情報とプライバシーの設定→タイムラインデータをエクスポート→OneDriveのデスクトップへ保存<br>※ 地図へドラッグ＆ドロップでも読込可。データはこのブラウザ内だけに保持(送信なし)'));
    body.appendChild(ui.box);

    ui.load.onclick = pickFile;
    ui.reload.onclick = reloadHandle;
    ui.file.onchange = function(){ if (ui.file.files[0]) loadFile(ui.file.files[0]); ui.file.value = ''; };
    ui.sel.onchange = function(){ ui.all.checked = false; drawDay(ui.sel.value, true); };
    ui.prev.onclick = function(){ step(-1); };
    ui.next.onclick = function(){ step(1); };
    ui.fit.onclick = function(){ if (!TL.data) return; if (ui.all.checked) drawAll(true); else if (ui.sel.value) drawDay(ui.sel.value, true); };
    ui.all.onchange = function(){ if (!TL.data) return; if (ui.all.checked) drawAll(true); else drawDay(ui.sel.value || TL.data.keys[TL.data.keys.length-1], true); };
  }
  function step(dir){ if (!TL.data) return; var ks = TL.data.keys; var i = ks.indexOf(ui.sel.value); var j = i < 0 ? ks.length - 1 : Math.min(ks.length - 1, Math.max(0, i + dir)); if (j === i) return; ui.sel.value = ks[j]; ui.all.checked = false; drawDay(ks[j], true); }
  function fillSelect(){
    ui.sel.innerHTML = '';
    var ks = TL.data ? TL.data.keys : [];
    for (var i = ks.length - 1; i >= 0; i--) { var o = document.createElement('option'); o.value = ks[i]; o.textContent = dayLabel(ks[i]); ui.sel.appendChild(o); }
  }

  /* ---------- 読み込み ---------- */
  var fileHandle = null;
  function applyRaw(raw, label, fit){
    TL.data = parse(raw);
    fillSelect();
    var ks = TL.data.keys;
    if (!ks.length) { setSummary('データなし'); return; }
    var saved = lsGet('tlLayerDay'); var key = (saved && TL.data.days[saved]) ? saved : ks[ks.length-1];
    ui.sel.value = key; ui.all.checked = false;
    if (TL.on) drawDay(key, fit);
    setMsg(label + '：' + ks[0] + '〜' + ks[ks.length-1] + '・' + ks.length + '日・滞在' + TL.data.nVisit + '/移動' + TL.data.nAct + '/軌跡' + TL.data.nPath);
  }
  function loadText(text, label){
    try { var raw = JSON.parse(text); applyRaw(raw, '読込 ' + label, true); kvSet('raw', raw); kvSet('label', label + ' (' + new Date().toLocaleString('ja-JP') + ')'); }
    catch(e) { setMsg('読み込めませんでした: ' + e.message, true); }
  }
  function loadFile(f){ f.text().then(function(t){ loadText(t, f.name); }); }
  TL.loadText = loadText; // 動作確認用
  function pickFile(){
    if (window.showOpenFilePicker) {
      window.showOpenFilePicker({ types: [{ description: 'Timeline JSON', accept: { 'application/json': ['.json'] } }] }).then(function(hs){
        fileHandle = hs[0]; kvSet('handle', fileHandle); ui.reload.style.display = ''; return fileHandle.getFile();
      }).then(function(f){ if (f) loadFile(f); }).catch(function(e){ if (e && e.name !== 'AbortError') ui.file.click(); });
    } else ui.file.click();
  }
  function reloadHandle(){
    if (!fileHandle) return;
    fileHandle.requestPermission({ mode: 'read' }).then(function(p){ if (p !== 'granted') throw new Error('許可されませんでした'); return fileHandle.getFile(); })
      .then(loadFile).catch(function(e){ setMsg('再読込できませんでした(' + e.message + ')。「Timeline.json 読込」から選び直してください', true); });
  }
  function restore(){
    kvGet('raw').then(function(raw){ if (raw) kvGet('label').then(function(lb){ try { applyRaw(raw, '前回の読込 ' + (lb || ''), false); } catch(e) { setMsg('保存データを読めません: ' + e.message, true); } }); else setMsg('Timeline.json を読み込んでください'); });
    kvGet('handle').then(function(h){ if (h && h.getFile) { fileHandle = h; ui.reload.style.display = ''; } });
  }

  /* ---------- 画層ON/OFF ---------- */
  var restored = false;
  function setOn(on){
    TL.on = on; lsSet('tlLayerOn', on ? '1' : '0');
    ui.btn.classList.toggle('active', on);
    ui.box.style.display = on ? '' : 'none';
    if (on) {
      ensurePane(); if (!group) group = L.layerGroup(); group.addTo(map);
      if (!restored) { restored = true; restore(); }
      else if (TL.data) { if (ui.all.checked) drawAll(false); else drawDay(ui.sel.value || TL.data.keys[TL.data.keys.length-1], false); }
    } else { clear(); if (group) map.removeLayer(group); }
  }
  /* 地図へのドラッグ＆ドロップ(画層ON中のみ) */
  function bindDrop(){
    var c = map.getContainer();
    c.addEventListener('dragover', function(e){ if (TL.on && e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types || [], function(t){ return t === 'Files'; })) e.preventDefault(); });
    c.addEventListener('drop', function(e){ if (!TL.on) return; var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /\.json$/i.test(f.name)) { e.preventDefault(); loadFile(f); } });
  }

  /* ---------- 起動 ---------- */
  function boot(){
    var tries = 0;
    (function wait(){
      var m = window.map, anchor = document.getElementById('hzFarmlandFlag') || document.getElementById('hzFudeAgri');
      if (m && m.getPane && window.L && anchor) {
        map = m;
        try { buildUI(anchor); bindDrop(); if (lsGet('tlLayerOn') === '1') setOn(true); } catch(e) { try { console.warn('timeline-layer boot failed', e); } catch(_) {} }
        return;
      }
      if (++tries < 150) setTimeout(wait, 200);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

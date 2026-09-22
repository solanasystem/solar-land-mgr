/* map-perf-hud.js — 地図の移動/ズーム1回ごとの所要時間を画面に表示する共通計測バッジ (v20260922c)
 *
 * v20260922c(ドクター「不要な内容は非表示にしてくれ」): 既定=非表示(計測もしない)。ラグ根治(v20260922a)後は
 *   常時出す必要が無いため、必要な時だけ ⚙取込・診断メニューの「⏱ 地図性能バッジ」で ON/OFF する。
 *   状態は localStorage['mapPerfHud']('1'=表示)。ONにすると同メニュー内の表示が「表示中」に変わる。console不要。
 *
 * 目的(ドクター指示 2026-09-22): 「拡大縮小/移動で表示完了まで時間が掛かる」の真犯人を、
 *   ドクターの実ブラウザで数字として見えるようにする。DevTools/console操作は一切不要
 *   (SWルーム §0.-1: 診断は画面上の常時バッジで行う)。
 *
 * 計測方法:
 *   - window.map(Leaflet)の moveend/zoomend/move/zoom/zoomanim/viewreset/layeradd の全ハンドラを
 *     ラップして所要msを名前別に集計(既存コードは無改変・ラップは透過)。
 *   - ハンドラ内から setTimeout / requestAnimationFrame で遅延実行される処理(各レイヤーのデバウンス
 *     再描画)は、予約時のハンドラ名を引き継いで同じ名前に加算(=誰が重いかが分かる)。
 *   - 長時間タスク(PerformanceObserver longtask)の合計=メインスレッドが固まった総時間。
 *   - タイル待ち = 全GridLayer(地図タイル/PMTiles)の _loading が消えるまでの時間。
 *   - 通信件数 = 計測窓の間に発生した resource エントリ数。
 *   計測窓: movestart/zoomstart で開き、起点t0=最初の moveend/zoomend 系ハンドラ開始。
 *   終了判定=タイル完了かつ遅延処理が500ms静止(上限8秒)。「全体ms」=t0→最後のJS処理終了 or タイル完了(静止待ちは含めない)。
 *
 * 表示: 左下の小バッジ。クリックで内訳パネル(ハンドラ別上位・直近5回)。「📋コピー」でJSONを
 *   クリップボードへ(チャットに貼れる)。localStorage['mapPerfHud']='0' で非表示。
 * 依存: Leaflet(window.L)・window.map。無ければ何もしない(例外を外に出さない)。
 */
(function(){
  'use strict';
  if (window.__mapPerfHud) return;
  var HUD = window.__mapPerfHud = { history: [], current: null, wrapped: 0 };
  var EVENTS = ['moveend','zoomend','move','zoom','zoomanim','viewreset','layeradd'];
  var curTag = null;            // 実行中のハンドラ名(遅延処理へ引き継ぐ)
  var pendingDeferred = 0;      // 予約済み・未実行の遅延処理数(計測窓の静止判定)
  var lastDeferredEnd = 0;

  function now(){ return performance.now(); }

  /* ---- 集計 ---- */
  function bucket(tag, ms, tStart){
    var c = HUD.current; if (!c || c.done) return;
    if (c.t0 === null && /^(moveend|zoomend)/.test(tag)) c.t0 = tStart; // 最初のmoveend/zoomend系ハンドラ開始=計測起点
    var h = c.handlers; var b = h[tag] = h[tag] || { n:0, ms:0, max:0 };
    b.n++; b.ms += ms; if (ms > b.max) b.max = ms; c.jsMs += ms; c.lastAct = now();
  }
  function runTagged(tag, fn, self, args){
    var prev = curTag; curTag = tag; var t0 = now();
    try { return fn.apply(self, args); }
    finally { var dt = now() - t0; curTag = prev; bucket(tag, dt, t0); }
  }

  /* ---- setTimeout / rAF の遅延処理へタグを引き継ぐ ---- */
  // デバウンス(clearTimeoutで捨てられる予約)も数えるため、予約IDを控えて clear 時に pending を戻す。
  var _st = window.setTimeout, _ct = window.clearTimeout, _raf = window.requestAnimationFrame, _caf = window.cancelAnimationFrame;
  var pendingT = {}, pendingR = {};
  window.setTimeout = function(fn, ms){
    if (typeof fn !== 'function' || !curTag) return _st.apply(window, arguments);
    var tag = curTag + '→timer'; var rest = Array.prototype.slice.call(arguments, 2);
    var id = _st.call(window, function(){ if (pendingT[id]) { delete pendingT[id]; pendingDeferred--; } lastDeferredEnd = now(); runTagged(tag, fn, this, rest); lastDeferredEnd = now(); }, ms);
    pendingT[id] = true; pendingDeferred++;
    return id;
  };
  window.clearTimeout = function(id){ if (pendingT[id]) { delete pendingT[id]; pendingDeferred--; } return _ct.call(window, id); };
  window.requestAnimationFrame = function(fn){
    if (typeof fn !== 'function' || !curTag) return _raf.call(window, fn);
    var tag = curTag + '→raf';
    var id = _raf.call(window, function(ts){ if (pendingR[id]) { delete pendingR[id]; pendingDeferred--; } lastDeferredEnd = now(); runTagged(tag, fn, this, [ts]); lastDeferredEnd = now(); });
    pendingR[id] = true; pendingDeferred++;
    return id;
  };
  window.cancelAnimationFrame = function(id){ if (pendingR[id]) { delete pendingR[id]; pendingDeferred--; } return _caf.call(window, id); };

  /* ---- Leaflet ハンドラのラップ ---- */
  // 注意: rec.fn を差し替えると Leaflet の off(type, fn) が元関数で照合できず解除に失敗する。
  //   → 元関数→ラッパの対応表(WeakMap)を持ち、_off/_listens で元関数をラッパへ読み替える(解除は従来通り効く)。
  var wrapOf = (typeof WeakMap === 'function') ? new WeakMap() : null;
  function patchOff(m){
    if (m.__perfOffPatched || !wrapOf) return;
    var _off = m._off, _listens = m._listens;
    m._off = function(type, fn, context){ if (typeof fn === 'function' && wrapOf.has(fn)) fn = wrapOf.get(fn); return _off.call(this, type, fn, context); };
    if (typeof _listens === 'function') m._listens = function(type, fn, context){ if (typeof fn === 'function' && wrapOf.has(fn)) fn = wrapOf.get(fn); return _listens.call(this, type, fn, context); };
    m.__perfOffPatched = true;
  }
  function wrapMap(m){
    if (!wrapOf) return;
    patchOff(m);
    var ev = m._events || {}; var n = 0;
    EVENTS.forEach(function(name){
      var arr = ev[name] || [];
      for (var i = 0; i < arr.length; i++) (function(rec){
        if (!rec || typeof rec.fn !== 'function' || rec.fn.__perfWrapped) return;
        var orig = rec.fn; var tag = name + ':' + (orig.name || 'anon');
        var w = function(){ return runTagged(tag, orig, this, arguments); };
        w.__perfWrapped = true; w.__perfOrig = orig; wrapOf.set(orig, w); rec.fn = w; n++;
      })(arr[i]);
    });
    HUD.wrapped += n;
  }

  /* ---- 長時間タスク ---- */
  var longTotal = 0, longMax = 0, longN = 0;
  try {
    new PerformanceObserver(function(list){
      list.getEntries().forEach(function(e){ if (HUD.current){ longTotal += e.duration; longN++; if (e.duration > longMax) longMax = e.duration; } });
    }).observe({ entryTypes: ['longtask'] });
  } catch(_) {}
  var netN = 0;
  try {
    new PerformanceObserver(function(list){ if (HUD.current) netN += list.getEntries().length; }).observe({ entryTypes: ['resource'] });
  } catch(_) {}

  /* ---- 計測窓 ---- */
  function tilesLoading(m){
    var any = false;
    try { m.eachLayer(function(l){ if (!any && window.L && L.GridLayer && l instanceof L.GridLayer && l._loading) any = true; }); } catch(_) {}
    return any;
  }
  function countLayers(m){ var n = 0; try { m.eachLayer(function(){ n++; }); } catch(_) {} return n; }

  // 計測窓の開始=movestart/zoomstart(既存の moveend/zoomend ハンドラより必ず先に来る)。
  // 起点t0=最初の moveend/zoomend 系ハンドラ開始時刻(bucketで設定)。終了=タイル完了+遅延処理500ms静止。
  function open(m, kind){
    var c = HUD.current;
    if (c && !c.done) { if (c.kinds.indexOf(kind) < 0) c.kinds.push(kind); return; }
    longTotal = 0; longMax = 0; longN = 0; netN = 0;
    HUD.current = { tOpen: now(), t0: null, lastAct: now(), ended: false, kinds: [kind], handlers: {}, jsMs: 0, tileMs: null, done: false, zoom: m.getZoom() };
    setBadge('⏱ 計測中…');
    poll(m);
  }
  function ended(m, kind){
    var c = HUD.current;
    if (!c || c.done) { open(m, kind); c = HUD.current; }
    if (c.t0 === null) c.t0 = now();
    c.ended = true;
  }
  function poll(m){
    var c = HUD.current; if (!c || c.done) return;
    if (!c.ended) { if (now() - c.tOpen > 30000) { HUD.current = null; setBadge('⏱ (中断)'); return; } return _st.call(window, function(){ poll(m); }, 100); }
    var t = now() - c.t0;
    if (c.tileMs === null && !tilesLoading(m)) { c.tileMs = Math.round(t); c.lastAct = Math.max(c.lastAct, now()); }
    var idle = pendingDeferred === 0 && (now() - lastDeferredEnd) > 500;
    if ((c.tileMs !== null && idle && t > 600) || t > 8000) return finish(m);
    _st.call(window, function(){ poll(m); }, 100);
  }
  function finish(m){
    var c = HUD.current; c.done = true;
    // 全体 = 起点から「最後にJS処理が終わった時刻 or タイル完了時刻」まで(静止待ちの500msは含めない)
    c.totalMs = Math.round(Math.max(c.lastAct, lastDeferredEnd) - c.t0);
    if (c.totalMs < 0) c.totalMs = 0;
    c.longMs = Math.round(longTotal); c.longMax = Math.round(longMax); c.longN = longN; c.net = netN;
    c.layers = countLayers(m); c.zoomEnd = m.getZoom();
    c.jsMs = Math.round(c.jsMs);
    var top = Object.keys(c.handlers).map(function(k){ return { tag:k, n:c.handlers[k].n, ms:Math.round(c.handlers[k].ms), max:Math.round(c.handlers[k].max) }; })
      .sort(function(a,b){ return b.ms - a.ms; });
    c.top = top.slice(0, 12); c.at = new Date().toLocaleTimeString();
    HUD.history.unshift({ at:c.at, kinds:c.kinds.join('+'), zoom:c.zoom+'→'+c.zoomEnd, totalMs:c.totalMs, jsMs:c.jsMs, longMs:c.longMs, longMax:c.longMax, tileMs:c.tileMs, net:c.net, layers:c.layers, top:c.top });
    if (HUD.history.length > 5) HUD.history.length = 5;
    render(c);
  }

  /* ---- 表示 ---- */
  var badge, panel;
  function css(){
    var s = document.createElement('style');
    s.textContent = '#mapPerfHud{position:fixed;left:8px;bottom:8px;z-index:9000;font:11px/1.4 ui-monospace,Consolas,monospace;color:#dfe7f1;background:rgba(10,16,26,.88);border:1px solid #2b3a4d;border-radius:6px;padding:4px 8px;cursor:pointer;max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,.4)}' +
      '#mapPerfHud.slow{border-color:#e5a50a;color:#ffe08a}#mapPerfHud.bad{border-color:#e0443e;color:#ffb3b0}' +
      '#mapPerfHudPanel{position:fixed;left:8px;bottom:36px;z-index:9000;font:11px/1.45 ui-monospace,Consolas,monospace;color:#dfe7f1;background:rgba(10,16,26,.96);border:1px solid #2b3a4d;border-radius:8px;padding:8px 10px;max-width:min(560px,90vw);max-height:60vh;overflow:auto;display:none}' +
      '#mapPerfHudPanel table{border-collapse:collapse}#mapPerfHudPanel td,#mapPerfHudPanel th{padding:1px 6px;text-align:right;border-bottom:1px solid #1f2a38}#mapPerfHudPanel td:first-child,#mapPerfHudPanel th:first-child{text-align:left}' +
      '#mapPerfHudPanel button{font:11px ui-monospace,Consolas,monospace;background:#1c2a3b;color:#dfe7f1;border:1px solid #2b3a4d;border-radius:4px;padding:2px 8px;cursor:pointer;margin-right:6px}';
    document.head.appendChild(s);
  }
  function setBadge(txt, cls){ if (!badge) return; badge.textContent = txt; badge.className = cls || ''; }
  function render(c){
    var worst = c.top[0] ? (c.top[0].tag + ' ' + c.top[0].ms + 'ms') : '—';
    var cls = c.totalMs > 2000 || c.longMs > 800 ? 'bad' : (c.totalMs > 800 || c.longMs > 250 ? 'slow' : '');
    setBadge('⏱ ' + c.kinds.join('+') + ' z' + c.zoomEnd + ' 全体' + c.totalMs + 'ms | JS' + c.jsMs + 'ms(固まり' + c.longMs + ') | タイル' + (c.tileMs === null ? '>8000' : c.tileMs) + 'ms | 通信' + c.net + ' | 層' + c.layers + ' | 最重:' + worst, cls);
    if (panel && panel.style.display !== 'none') renderPanel();
  }
  function renderPanel(){
    var h = HUD.history; if (!h.length) { panel.innerHTML = 'まだ計測なし(地図を動かしてください)'; return; }
    var c = h[0];
    var html = '<div style="margin-bottom:6px"><button id="mapPerfHudCopy">📋 コピー(JSON)</button><button id="mapPerfHudClose">閉じる</button> 直近: ' + c.at + ' ' + c.kinds + ' z' + c.zoom + '</div>';
    html += '<table><tr><th>処理(ハンドラ→遅延)</th><th>回</th><th>合計ms</th><th>最大ms</th></tr>';
    c.top.forEach(function(r){ html += '<tr><td>' + esc(r.tag) + '</td><td>' + r.n + '</td><td>' + r.ms + '</td><td>' + r.max + '</td></tr>'; });
    html += '</table><div style="margin-top:6px;color:#9fb0c3">全体' + c.totalMs + ' / JS' + c.jsMs + ' / 固まり' + c.longMs + '(最大' + c.longMax + ') / タイル' + c.tileMs + ' / 通信' + c.net + '件 / Leaflet層' + c.layers + '</div>';
    html += '<div style="margin-top:6px;border-top:1px solid #1f2a38;padding-top:4px;color:#9fb0c3">直近5回: ' + h.map(function(x){ return x.kinds + ' ' + x.totalMs + 'ms(JS' + x.jsMs + '/固' + x.longMs + '/タ' + x.tileMs + ')'; }).join(' ｜ ') + '</div>';
    panel.innerHTML = html;
    var cp = document.getElementById('mapPerfHudCopy'); if (cp) cp.onclick = function(e){ e.stopPropagation(); copyJson(); };
    var cl = document.getElementById('mapPerfHudClose'); if (cl) cl.onclick = function(e){ e.stopPropagation(); panel.style.display = 'none'; };
  }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  function copyJson(){
    var txt = JSON.stringify({ page: location.pathname, ua: navigator.userAgent, wrapped: HUD.wrapped, history: HUD.history }, null, 1);
    var ok = function(){ setBadge('📋 コピーしました(チャットに貼り付け可)'); };
    try { navigator.clipboard.writeText(txt).then(ok, function(){ fallback(); }); } catch(_) { fallback(); }
    function fallback(){ try { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); ok(); } catch(e) { setBadge('コピー失敗'); } }
  }
  function ui(){
    css();
    badge = document.createElement('div'); badge.id = 'mapPerfHud'; badge.textContent = '⏱ 地図を動かすと所要時間を表示';
    panel = document.createElement('div'); panel.id = 'mapPerfHudPanel';
    badge.onclick = function(){ panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'block' : 'none'; renderPanel(); };
    document.body.appendChild(badge); document.body.appendChild(panel);
  }

  /* ---- 起動: window.map を待つ ---- */
  function attach(m){
    wrapMap(m);
    // 自前のリスナーは計測対象外(__perfWrapped=true でラップをスキップ)
    function own(fn){ fn.__perfWrapped = true; return fn; }
    m.on('movestart', own(function(){ open(m, 'move'); }));
    m.on('zoomstart', own(function(){ open(m, 'zoom'); }));
    m.on('zoomend', own(function(){ ended(m, 'zoom'); }));
    m.on('moveend', own(function(){ ended(m, 'move'); wrapMap(m); }));
    // 後から登録されるハンドラ(レイヤーON時)も拾う: layeradd時に再ラップ
    m.on('layeradd', own(function(){ wrapMap(m); }));
    ui();
  }
  /* ---- 表示ON/OFF(既定OFF・localStorage永続・メニューから切替) ---- */
  var attached = false;
  function isOn(){ try { return localStorage.getItem('mapPerfHud') === '1'; } catch(_) { return false; } }
  function startMeasure(){
    if (attached) { if (badge) { badge.style.display = ''; } return; }
    var tries = 0;
    (function wait(){
      var m = window.map;
      if (m && m.on && m._events) { try { attach(m); attached = true; } catch(e) { try { console.warn('map-perf-hud attach failed', e); } catch(_) {} } return; }
      if (++tries < 100) _st.call(window, wait, 200);
    })();
  }
  HUD.setVisible = function(on){
    try { localStorage.setItem('mapPerfHud', on ? '1' : '0'); } catch(_) {}
    if (on) startMeasure();
    else { if (badge) badge.style.display = 'none'; if (panel) panel.style.display = 'none'; }
    paintToggle();
  };
  HUD.isVisible = isOn;
  /* ⚙取込・診断メニュー(farmland-tracker-analysis.html consolidateToolbar)があれば切替ボタンを1つ差し込む。無いページでは何もしない */
  var toggleBtn = null;
  function paintToggle(){ if (toggleBtn) toggleBtn.textContent = '⏱ 地図性能バッジ: ' + (isOn() ? '表示中(押すと非表示)' : '非表示(押すと表示)'); }
  function injectToggle(){
    var tries = 0;
    (function wait(){
      var trg = document.getElementById('tbMenuMisc');
      var dd = trg && trg.parentNode ? trg.parentNode.querySelector('.tbMenuDD') : null;
      if (dd) {
        if (document.getElementById('btnMapPerfHudToggle')) return;
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'btnMapPerfHudToggle';
        toggleBtn.className = 'btn btn-ghost';
        toggleBtn.style.cssText = 'width:100%;text-align:left;margin:0;font-size:12px';
        toggleBtn.title = '地図の移動/ズーム1回ごとの所要時間(JS/固まり/タイル/通信/最重処理)を左下に表示する診断バッジ';
        toggleBtn.onclick = function(e){ e.stopPropagation(); HUD.setVisible(!isOn()); };
        dd.appendChild(toggleBtn); paintToggle();
        return;
      }
      if (++tries < 50) _st.call(window, wait, 200);
    })();
  }
  function boot(){
    injectToggle();
    if (isOn()) startMeasure();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

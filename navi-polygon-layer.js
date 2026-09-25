/* navi-polygon-layer.js — 🧭 農地ナビ区画(台帳ポリゴン)層  共通include・単一実装 (2026-09-25 Dr.「進めてくれ」)
 *
 * なにを描くか: 農地ナビから「ズーム16・筆ポリゴン表示中」でDLした 農地ポリゴン_*.geojson を
 *   farmland_polygons(DaichoIdで農地ピン=farmland_pointsと1対1)へ投入したもの。台帳1筆ごとの境界。
 *   農水省の筆ポリゴン(衛星由来・粗い)とは別物。合筆(隣接筆の束ね)の判定に使う形はこちら。
 * 読み方: RPC get_farmland_polygons_in_bbox(画面bbox) — 取得上限なし(Dr.「上限を設けるな」)。ズーム15以上で描く。
 * 隣接: 画面内のポリゴン同士で辺を共有する筆をその場で求め(turf)、ポップアップに「隣接筆と合計面積」を出す。
 *   ≥800㎡になる組み合わせは太字。バッチ版は satellite/area_pipeline/gappitsu_adjacency.py。
 * 依存(ページ側の既存グローバル): map, db(supabase client), showToast, turf, window.__gacho.hoverBind(任意)
 */
(function(){
  'use strict';
  var MIN_ZOOM = 15;
  var PANE = 'naviPolyPane', PANE_Z = 455; // 農水省筆ポリゴン(450)より上・農地フラグ点(465)より下
  var enabled = false, layer = null, canvasR = null, timer = null, lastCount = null;
  var COLOR = { '1': { c: '#38bdf8', f: '#38bdf8', n: '農業委員会管理' }, '2': { c: '#f87171', f: '#f87171', n: '登記簿から作成' }, 'x': { c: '#c084fc', f: '#c084fc', n: 'その他' } };
  function col(sec){ return COLOR[sec] || COLOR.x; }
  function m(){ return (typeof map !== 'undefined' && map) ? map : window.map; }
  function client(){ return (typeof db !== 'undefined' && db) ? db : (window.db || null); }
  function toast(s, t){ try { if (typeof showToast === 'function') showToast(s, t || 'success'); } catch(_){} }

  function ensureUI(){
    if (document.getElementById('hzNaviPoly')) return;
    var anchor = document.getElementById('agriFudeLegend') || document.getElementById('hzFudeAgri');
    if (!anchor || !anchor.parentNode) return;
    var btn = document.createElement('button');
    btn.className = 'hazard-btn'; btn.id = 'hzNaviPoly'; btn.innerHTML = '&#129517; 農地ナビ区画（台帳ポリゴン）';
    btn.onclick = toggle;
    var legend = document.createElement('div');
    legend.id = 'naviPolyLegend';
    legend.style.cssText = 'display:none;margin-top:4px;padding:8px 6px;background:var(--surface2);border-radius:6px;border:1px solid var(--border);';
    legend.innerHTML =
      '<div style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px;">ポリゴン区分（農地ナビ）</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;font-size:10px;">' +
        '<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;background:#38bdf8;opacity:0.35;border:1px solid #38bdf8;flex-shrink:0"></div>農業委員会管理のポリゴン</div>' +
        '<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;background:#f87171;opacity:0.35;border:1px solid #f87171;flex-shrink:0"></div>不動産登記簿から作成</div>' +
        '<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;background:#c084fc;opacity:0.35;border:1px solid #c084fc;flex-shrink:0"></div>その他</div>' +
      '</div>' +
      '<div id="naviPolyCount" style="font-size:10px;color:var(--text);margin-top:6px;"></div>' +
      '<div style="font-size:9px;color:var(--text-muted);margin-top:4px;line-height:1.3;">※ ズーム15以上・画面内は全件表示（上限なし）<br>※ 出典: eMAFF農地ナビ 農地ポリゴン（ズーム16・筆ポリゴン表示中でDLしたもの）<br>※ クリック=地番/面積/隣接筆と合計面積（合筆の当たり）<br>※ 農水省の🌾筆ポリゴン（耕区）とは排他表示（片方をONにするともう片方はOFF）</div>';
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    anchor.parentNode.insertBefore(legend, btn.nextSibling);
  }

  function toggle(){
    var mp = m(); if (!mp) return;
    var btn = document.getElementById('hzNaviPoly'), legend = document.getElementById('naviPolyLegend');
    if (enabled) {
      enabled = false; if (btn) btn.classList.remove('active'); if (legend) legend.style.display = 'none';
      if (layer) { mp.removeLayer(layer); layer = null; }
      mp.off('moveend', schedule); mp.off('zoomend', schedule);
      toast('農地ナビ区画を非表示にしました'); return;
    }
    // v20260925b(Dr.「農水省と農業委員会の筆ポリゴンはトグルスイッチにして、片方が表示されている時もう片方は非表示に」):
    //   こちらをONにする時、農水省筆ポリゴン(耕区)がONなら消す(排他表示)。逆方向はページ側 toggleAgriFude() が担当。
    try { if (typeof agriFudeEnabled !== 'undefined' && agriFudeEnabled && typeof toggleAgriFude === 'function') toggleAgriFude(); } catch(_e) {}
    enabled = true; if (btn) btn.classList.add('active'); if (legend) legend.style.display = 'block';
    mp.on('moveend', schedule); mp.on('zoomend', schedule);
    schedule();
  }
  function schedule(){ if (timer) clearTimeout(timer); timer = setTimeout(render, 200); }

  async function render(){
    var mp = m(); if (!enabled || !mp) return;
    var cnt = document.getElementById('naviPolyCount');
    if (mp.getZoom() < MIN_ZOOM) { if (layer) { mp.removeLayer(layer); layer = null; } if (cnt) cnt.textContent = 'ズーム15以上で表示'; return; }
    var d = client(); if (!d) { if (cnt) cnt.textContent = 'DB未接続'; return; }
    var b = mp.getBounds().pad(0.05);
    var res;
    try {
      var bbox = { lat_min: b.getSouth(), lat_max: b.getNorth(), lng_min: b.getWest(), lng_max: b.getEast() };
      // v20260925c(Dr.が画面で発見「画面内 1,000 筆」=サーバーのRPC上限1,000で残りが消えていた): 上限に当たったら
      //   bboxを4分割して再帰取得する共通ヘルパー rpc-bbox-all.js で全件にする。無ければ従来の1回呼び出し。
      res = (window.rpcBboxAll) ? await window.rpcBboxAll(d, 'get_farmland_polygons_in_bbox', bbox, {}, 'daicho_id')
                                : await d.rpc('get_farmland_polygons_in_bbox', bbox);
    } catch (e) { if (cnt) cnt.textContent = '取得失敗: ' + (e && e.message || e); return; }
    if (!res || res.error) { if (cnt) cnt.textContent = '取得失敗: ' + (res && res.error && res.error.message || '—') + '（farmland_polygons/RPC未作成なら sql/farmland_polygons_setup.sql）'; return; }
    var rows = res.data || [];
    if (!mp.getPane(PANE)) { var p = mp.createPane(PANE); p.style.zIndex = PANE_Z; }
    if (!canvasR) canvasR = L.canvas({ pane: PANE, padding: 0.5 });
    if (layer) { mp.removeLayer(layer); layer = null; }
    var feats = rows.map(function(r){ return { type: 'Feature', geometry: { type: 'Polygon', coordinates: r.geom_json || [] }, properties: r }; })
                    .filter(function(f){ return f.geometry.coordinates.length; });
    // 隣接(辺を共有)を画面内で計算: turf.booleanIntersects＋交差の長さ>0 を隣接とみなす(点接触は除く)
    var adj = {};
    try {
      if (typeof turf !== 'undefined' && feats.length <= 6000) {
        var bb = feats.map(function(f){ return turf.bbox(f); });
        for (var i = 0; i < feats.length; i++) {
          for (var j = i + 1; j < feats.length; j++) {
            if (bb[i][0] > bb[j][2] || bb[j][0] > bb[i][2] || bb[i][1] > bb[j][3] || bb[j][1] > bb[i][3]) continue;
            var inter = null; try { inter = turf.intersect(feats[i], feats[j]); } catch(_) {}
            var touching = false;
            if (inter) touching = true;
            else { try { touching = turf.booleanTouches ? turf.booleanTouches(feats[i], feats[j]) : turf.booleanIntersects(feats[i], feats[j]); } catch(_) {} }
            if (touching) {
              var a = feats[i].properties.daicho_id, c = feats[j].properties.daicho_id;
              (adj[a] = adj[a] || []).push(feats[j].properties); (adj[c] = adj[c] || []).push(feats[i].properties);
            }
          }
        }
      }
    } catch(_) {}
    layer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      renderer: canvasR, pane: PANE,
      style: function(f){ var k = col(f.properties.polygon_section); return { color: k.c, weight: 1.2, fillColor: k.f, fillOpacity: 0.12 }; },
      onEachFeature: function(f, ly){
        var r = f.properties;
        try { if (window.__gacho && window.__gacho.hoverBind) window.__gacho.hoverBind(ly, r.lat, r.lng); } catch(_) {}
        ly.on('click', function(){
          var nb = adj[r.daicho_id] || [];
          var own = nb.filter(function(x){ return r.farmer_hash && x.farmer_hash === r.farmer_hash; });
          var area = Number(r.area_sqm || 0);
          var rowsHtml = nb.map(function(x){
            var sum = area + Number(x.area_sqm || 0);
            var same = (r.farmer_hash && x.farmer_hash === r.farmer_hash) ? ' <span style="color:#fbbf24">同一耕作者</span>' : '';
            var b = sum >= 800 ? 'font-weight:800;color:#3fb950' : 'color:#c9d1d9';
            return '<div style="font-size:11px;' + b + '">' + (x.tiban || x.address || x.daicho_id) + '（' + Math.round(Number(x.area_sqm || 0)).toLocaleString() + '㎡）→ 合計 ' + Math.round(sum).toLocaleString() + '㎡' + same + '</div>';
          }).join('');
          var allSum = area + nb.reduce(function(s, x){ return s + Number(x.area_sqm || 0); }, 0);
          ly.bindPopup(
            '<div class="popup-body">' +
              '<div class="popup-case-no"><span>🧭 農地ナビ区画（台帳ポリゴン）</span></div>' +
              '<div class="popup-info">' +
                '<div class="popup-row"><span class="popup-label">所在</span><span class="popup-value">' + (r.address || '—') + '</span></div>' +
                '<div class="popup-row"><span class="popup-label">登記面積</span><span class="popup-value">' + (r.area_sqm != null ? Math.round(Number(r.area_sqm)).toLocaleString() + ' ㎡' : '—') + '</span></div>' +
                '<div class="popup-row"><span class="popup-label">地目</span><span class="popup-value">' + (r.land_class || '—') + '</span></div>' +
                '<div class="popup-row"><span class="popup-label">農振</span><span class="popup-value">' + (r.noushin_name || '—') + '</span></div>' +
                '<div class="popup-row"><span class="popup-label">都市計画</span><span class="popup-value">' + (r.toshi_keikaku || '—') + '</span></div>' +
                '<div class="popup-row"><span class="popup-label">区分</span><span class="popup-value">' + (r.polygon_section_name || col(r.polygon_section).n) + '</span></div>' +
              '</div>' +
              '<hr class="popup-divider">' +
              '<div style="font-size:11px;font-weight:700;margin-bottom:4px;">隣接筆 ' + nb.length + '件' + (own.length ? '（同一耕作者 ' + own.length + '）' : '') + '　隣接すべて合計 ' + Math.round(allSum).toLocaleString() + '㎡</div>' +
              (rowsHtml || '<div style="font-size:11px;color:#8b949e">画面内に隣接筆なし（画面外の筆は含まれません）</div>') +
              '<div style="font-size:9px;color:#8b949e;margin-top:6px;">※ 隣接=境界を共有する筆（画面内で計算）。緑太字=2筆で800㎡以上。</div>' +
            '</div>', { maxWidth: 340, minWidth: 240 }).openPopup();
        });
      }
    }).addTo(mp);
    lastCount = feats.length;
    if (cnt) cnt.textContent = feats.length ? ('画面内 ' + feats.length.toLocaleString() + ' 筆（隣接ペア ' + Object.keys(adj).length + ' 筆に検出）') : '画面内 0 筆 ─ この範囲は農地ポリゴン未投入（ズーム16・筆ポリゴン表示中でDL→loadpolygons）';
  }

  window.NaviPolygonLayer = { toggle: toggle, render: render, isEnabled: function(){ return enabled; }, count: function(){ return lastCount; } };
  function boot(){ ensureUI(); if (!document.getElementById('hzNaviPoly')) setTimeout(boot, 300); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* road-overlay.js — 🛣 道路を衛星に重ねる(線の色を選べる) 共通実装 v20260922f
 *
 * 経緯: v20260822p(適地候補パネル)で「地理院 標準地図タイルを乗算(multiply)で衛星に重ねる」方式を実装。乗算は
 *   白=透ける/黒=残るため、細い道路(白い路面＋黒い縁線)は黒い2本線として見えていた(ドクター報告 2026-09-22)。
 * ドクター指示(2026-09-22): 「道の色を選べる設計に。時と場合で白、シアンなど、重なっているフィルターの色により選択したい。
 *   モーダルの中にクリックして色を選べるように」。
 *
 * 方式(データ源は地理院 標準地図のまま=網羅度を落とさない):
 *   タイルpaneに SVGフィルター(#cyRoadTint)を掛け、①色反転(黒い線→白)→②輝度化→③薄い塗り(森/田/水/建物)を切り捨て
 *   →④選んだ色で着色。paneは mix-blend-mode:screen(黒=透明) で衛星に重ねる。結果、道路の縁線・地名だけが選んだ色で衛星上に出る。
 *   色は任意(HEX)。localStorage['cyRoadColor']に永続。ON/OFFは従来どおりセッション内のみ。
 *
 * API(window.__roadOverlay): toggle(force?) / setColor(hex) / state() -> {on,color} / onChange(fn) / PRESETS
 * 依存: Leaflet(window.L)・window.map・window.BASE_TILES.map(地理院標準)。単一実装(INDEX§0 複製禁止)。
 */
(function(){
  'use strict';
  if (window.__roadOverlay) return;
  var PANE = 'cyRoadPane', PANE_Z = 250, FILTER_ID = 'cyRoadTint', LS_KEY = 'cyRoadColor';
  var TILE_STD = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
  // 薄い塗りの切り捨て(反転後の輝度 v → slope*v+intercept を0..1にクランプ)。地理院標準の塗り(森#c8e6c9/田#f7f5d0/水#bee3f4/建物#d9d9d9)は
  // 反転後 0.06〜0.15 → 0 に落ち、道路縁線(反転後 ≥0.4)・文字(1.0)は残る。値を変える時はここ1箇所。
  var CRUSH_SLOPE = 1.6, CRUSH_INTERCEPT = -0.35;
  var PRESETS = [ ['白', '#ffffff'], ['シアン', '#00e5ff'], ['黄', '#fcd34d'], ['マゼンタ', '#ff4dd2'], ['緑', '#4ade80'], ['赤', '#ff5252'] ];

  var st = { on: false, color: '#ffffff' };
  try { var c = localStorage.getItem(LS_KEY); if (c && /^#[0-9a-f]{6}$/i.test(c)) st.color = c.toLowerCase(); } catch(_) {}
  var layer = null, tint = null, listeners = [];

  function hexRGB(hex){ var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); return m ? [parseInt(m[1],16)/255, parseInt(m[2],16)/255, parseInt(m[3],16)/255] : [1,1,1]; }
  function ensureFilter(){
    if (document.getElementById(FILTER_ID)) { tint = document.getElementById(FILTER_ID + 'Tint'); return; }
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    var f = document.createElementNS(NS, 'filter'); f.setAttribute('id', FILTER_ID); f.setAttribute('color-interpolation-filters', 'sRGB');
    // ① 反転
    var inv = document.createElementNS(NS, 'feComponentTransfer');
    ['R','G','B'].forEach(function(ch){ var fn = document.createElementNS(NS, 'feFunc' + ch); fn.setAttribute('type', 'table'); fn.setAttribute('tableValues', '1 0'); inv.appendChild(fn); });
    f.appendChild(inv);
    // ② 輝度化(全チャンネルに同じ輝度)
    var lum = document.createElementNS(NS, 'feColorMatrix'); lum.setAttribute('type', 'matrix');
    lum.setAttribute('values', '0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0');
    f.appendChild(lum);
    // ③ 薄い塗りを切り捨て
    var crush = document.createElementNS(NS, 'feComponentTransfer');
    ['R','G','B'].forEach(function(ch){ var fn = document.createElementNS(NS, 'feFunc' + ch); fn.setAttribute('type', 'linear'); fn.setAttribute('slope', String(CRUSH_SLOPE)); fn.setAttribute('intercept', String(CRUSH_INTERCEPT)); crush.appendChild(fn); });
    f.appendChild(crush);
    // ④ 着色(輝度×選択色)
    tint = document.createElementNS(NS, 'feColorMatrix'); tint.setAttribute('id', FILTER_ID + 'Tint'); tint.setAttribute('type', 'matrix');
    f.appendChild(tint);
    svg.appendChild(f); document.body.appendChild(svg);
    applyTint();
  }
  function applyTint(){
    if (!tint) return; var c = hexRGB(st.color);
    tint.setAttribute('values', c[0] + ' 0 0 0 0  0 ' + c[1] + ' 0 0 0  0 0 ' + c[2] + ' 0 0  0 0 0 1 0');
  }
  function ensurePane(m){
    if (!m.getPane(PANE)) { var pn = m.createPane(PANE); pn.style.zIndex = PANE_Z; pn.style.pointerEvents = 'none'; }
    var p = m.getPane(PANE); p.style.mixBlendMode = 'screen'; p.style.filter = 'url(#' + FILTER_ID + ')';
    return p;
  }
  function emit(){ listeners.forEach(function(fn){ try { fn(state()); } catch(_) {} }); }
  function state(){ return { on: st.on, color: st.color }; }

  function toggle(force){
    var m = window.map; if (!m || !m.createPane || !window.L) return state();
    ensureFilter(); ensurePane(m);
    st.on = (force != null) ? !!force : !st.on;
    if (st.on) {
      if (!layer) { var url = (window.BASE_TILES && window.BASE_TILES.map) || TILE_STD; layer = L.tileLayer(url, { pane: PANE, opacity: 1, maxZoom: 22, maxNativeZoom: 18 }); }
      layer.addTo(m);
    } else if (layer) { m.removeLayer(layer); }
    emit(); return state();
  }
  function setColor(hex){
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return state();
    st.color = hex.toLowerCase(); try { localStorage.setItem(LS_KEY, st.color); } catch(_) {}
    ensureFilter(); applyTint();
    if (!st.on) toggle(true); else emit();
    return state();
  }
  window.__roadOverlay = { toggle: toggle, setColor: setColor, state: state, onChange: function(fn){ if (typeof fn === 'function') listeners.push(fn); }, PRESETS: PRESETS, FILTER_ID: FILTER_ID, PANE: PANE };
})();

// ============================================================
// mode-back.js v20260515k
// 各ページに自動注入される共通スクリプト:
//   1) MODE SELECT 戻るボタン（縦2段、コンパクト）
//   2) CNT カーボンナノチューブ 3D 背景アニメーション
// ------------------------------------------------------------
// v20260515k (2026-05-15):
//   - 全管理画面の背景に CNT 3D 構造体アニメーションを自動注入
//   - 既存の #cnt-bg がある場合（settings.html 等）はスキップ
//   - 円筒中心線まわり自転 + 画面平面公転（時計回り）
//   - opacity 0.08 で薄く控えめ
// v20260515j (2026-05-15):
//   - MODE SELECT ボタンを縦2段表示・コンパクト化
// ============================================================

(function () {
  'use strict';

  // ====== 除外ページの判定 ======
  var path = (location.pathname || '').toLowerCase();
  var EXCLUDED = [
    'mode-select.html',
    'mode-select-debug.html',
    'index.html',
    'login.html'
  ];
  var isExcluded = false;
  for (var i = 0; i < EXCLUDED.length; i++) {
    if (path.endsWith(EXCLUDED[i])) { isExcluded = true; break; }
  }
  if (path === '/' || path.endsWith('/solar-land-mgr/') || path.endsWith('/solar-land-mgr')) {
    isExcluded = true;
  }
  if (isExcluded) return;

  // ====== クローバSVG（MODE SELECTボタン内） ======
  var CLOVER_SVG = '<svg viewBox="0 0 64 64" width="18" height="18" xmlns="http://www.w3.org/2000/svg">'
    + '<defs>'
    + '<linearGradient id="msb-ne" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#86efac"/><stop offset="50%" stop-color="#22c55e"/><stop offset="100%" stop-color="#15803d"/></linearGradient>'
    + '<linearGradient id="msb-nw" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#86efac"/><stop offset="50%" stop-color="#22c55e"/><stop offset="100%" stop-color="#15803d"/></linearGradient>'
    + '<linearGradient id="msb-se" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#16a34a"/><stop offset="50%" stop-color="#22c55e"/><stop offset="100%" stop-color="#86efac"/></linearGradient>'
    + '<linearGradient id="msb-sw" x1="100%" y1="100%" x2="0%" y2="0%"><stop offset="0%" stop-color="#16a34a"/><stop offset="50%" stop-color="#22c55e"/><stop offset="100%" stop-color="#86efac"/></linearGradient>'
    + '</defs>'
    + '<polygon points="30,30 16,8 4,22 18,30" fill="url(#msb-nw)" stroke="#0F7B3E" stroke-width="0.8"/>'
    + '<line x1="6" y1="22" x2="16" y2="12" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round"/>'
    + '<polygon points="34,30 48,8 60,22 46,30" fill="url(#msb-ne)" stroke="#0F7B3E" stroke-width="0.8"/>'
    + '<line x1="48" y1="12" x2="58" y2="22" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round"/>'
    + '<polygon points="30,34 16,56 4,42 18,34" fill="url(#msb-sw)" stroke="#0F7B3E" stroke-width="0.8"/>'
    + '<polygon points="34,34 48,56 60,42 46,34" fill="url(#msb-se)" stroke="#0F7B3E" stroke-width="0.8"/>'
    + '<circle cx="32" cy="32" r="2.5" fill="#064E2A"/>'
    + '<line x1="32" y1="34" x2="32" y2="58" stroke="#15803d" stroke-width="1.5" stroke-linecap="round"/>'
    + '</svg>';

  // ====== スタイル注入 ======
  var css = ''
    + '.header{padding-left:120px !important;}'
    + '.logo > .logo-icon{display:none !important;}'
    + '.logo .logo-icon:has(svg){display:none !important;}'
    + '#ms-back-btn{'
    + 'position:fixed;left:10px;z-index:9999;'
    + 'top:10px;'
    + 'display:inline-flex;align-items:center;gap:5px;'
    + 'height:28px;padding:0 9px 0 7px;'
    + 'background:linear-gradient(135deg,#0F7B3E,#064E2A);'
    + 'border:1px solid rgba(34,197,94,0.5);'
    + 'border-radius:6px;'
    + 'color:#ffffff;text-decoration:none;cursor:pointer;'
    + 'font-family:inherit;'
    + 'line-height:1;white-space:nowrap;'
    + 'box-shadow:inset 0 1px 2px rgba(255,255,255,0.18),0 2px 5px rgba(0,0,0,0.35);'
    + 'transition:transform 0.15s ease,box-shadow 0.15s ease,border-color 0.15s ease;'
    + '}'
    + '#ms-back-btn:hover{'
    + 'transform:translateX(-2px);'
    + 'border-color:rgba(134,239,172,0.75);'
    + 'box-shadow:inset 0 1px 2px rgba(255,255,255,0.22),0 4px 10px rgba(0,0,0,0.45);'
    + '}'
    + '#ms-back-btn .arr{color:#86efac;font-size:11px;line-height:1;transition:transform 0.15s;display:inline-block;}'
    + '#ms-back-btn:hover .arr{transform:translateX(-2px);}'
    + '#ms-back-btn .ms-clover{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex-shrink:0;}'
    + '#ms-back-btn .ms-clover svg{width:100%;height:100%;display:block;}'
    + '#ms-back-btn .stack{display:inline-flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:1px;line-height:1;margin-left:1px;}'
    + '#ms-back-btn .lbl{color:#ffffff;font-weight:700;font-size:9.5px;letter-spacing:0.05em;line-height:1;}'
    + '#ms-back-btn .sub{color:#86efac;font-size:7px;font-weight:700;letter-spacing:0.18em;opacity:0.92;line-height:1;}'
    + '@media (max-width:640px){'
    + '#ms-back-btn{left:7px;height:26px;padding:0 7px 0 5px;gap:4px;}'
    + '#ms-back-btn .ms-clover{width:16px;height:16px;}'
    + '#ms-back-btn .arr{font-size:10px;}'
    + '#ms-back-btn .lbl{font-size:9px;}'
    + '#ms-back-btn .sub{font-size:6.5px;}'
    + '.header{padding-left:100px !important;}'
    + '}'
    + '@media print{#ms-back-btn{display:none !important;}}'
    // CNT 背景レイヤー（既存設定があれば優先）
    + '#cnt-bg{position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none;opacity:0.08;mix-blend-mode:screen;will-change:contents;}'
    + '@media (prefers-reduced-motion:reduce){#cnt-bg{opacity:0.04;}}';

  var styleEl = document.createElement('style');
  styleEl.setAttribute('data-mode-back', 'true');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ====== MODE SELECT ボタン生成 ======
  function createButton() {
    if (document.getElementById('ms-back-btn')) return;

    var btn = document.createElement('a');
    btn.id = 'ms-back-btn';
    btn.href = 'mode-select.html';
    btn.title = 'モード選択画面へ戻る';
    btn.setAttribute('aria-label', 'モード選択画面へ戻る');
    btn.innerHTML =
      '<span class="arr">◂</span>' +
      '<span class="ms-clover">' + CLOVER_SVG + '</span>' +
      '<span class="stack">' +
        '<span class="lbl">MODE</span>' +
        '<span class="sub">SELECT</span>' +
      '</span>';
    document.body.appendChild(btn);

    alignVerticalCenter(btn);
    var rafId = null;
    window.addEventListener('resize', function() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function() { alignVerticalCenter(btn); });
    });
  }

  function alignVerticalCenter(btn) {
    var header = document.querySelector('header.header, .header, header');
    if (!header) return;
    var headerRect = header.getBoundingClientRect();
    var btnHeight = btn.offsetHeight || 28;
    var topPx = headerRect.top + (headerRect.height - btnHeight) / 2;
    if (topPx < 0) topPx = 3;
    btn.style.top = topPx + 'px';
  }

  // ====== CNT 背景の自動注入 ======
  function injectCNTBackground() {
    // 既存の #cnt-bg があるページ（settings.html等）はスキップ
    if (document.getElementById('cnt-bg')) {
      console.log('[mode-back] #cnt-bg already exists, skip injection');
      return;
    }

    // SVG コンテナを生成
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.id = 'cnt-bg';
    svg.setAttribute('viewBox', '-12 -10 24 20');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('aria-hidden', 'true');

    var defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML =
      '<radialGradient id="cntbg-atom-near" cx="35%" cy="32%" r="65%">'
      + '<stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>'
      + '<stop offset="22%" stop-color="#e0f2fe" stop-opacity="0.98"/>'
      + '<stop offset="55%" stop-color="#7dd3fc" stop-opacity="0.85"/>'
      + '<stop offset="85%" stop-color="#1e3a8a" stop-opacity="0.6"/>'
      + '<stop offset="100%" stop-color="#0c1733" stop-opacity="0.2"/>'
      + '</radialGradient>'
      + '<linearGradient id="cntbg-bond-grad" x1="0%" y1="0%" x2="100%" y2="0%">'
      + '<stop offset="0%" stop-color="#dbeafe" stop-opacity="0.9"/>'
      + '<stop offset="50%" stop-color="#ffffff" stop-opacity="1"/>'
      + '<stop offset="100%" stop-color="#dbeafe" stop-opacity="0.9"/>'
      + '</linearGradient>';
    svg.appendChild(defs);

    var grp = document.createElementNS(SVG_NS, 'g');
    grp.id = 'cntbg-group';
    svg.appendChild(grp);

    document.body.insertBefore(svg, document.body.firstChild);

    // CNT 構造 + アニメーション
    initCNTAnimation(grp);
  }

  function initCNTAnimation(grp) {
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var SQRT3 = Math.sqrt(3);
    var N_CIRC   = 16;
    var CIRC     = N_CIRC * SQRT3;
    var R        = CIRC / (2 * Math.PI);
    var NUM_ROWS = 2;
    var Y_OFFSET = -1.25;

    // 原子座標生成（zigzag CNT (16,0) ハニカム展開）
    var atoms = [];
    for (var j = -NUM_ROWS; j <= NUM_ROWS; j++) {
      for (var i = 0; i < N_CIRC; i++) {
        var uA = i * SQRT3;
        var thA = uA / R;
        atoms.push([R * Math.cos(thA), j * 3 + Y_OFFSET,       R * Math.sin(thA)]);
        atoms.push([R * Math.cos(thA), j * 3 + 1 + Y_OFFSET,   R * Math.sin(thA)]);
        var uC = (i + 0.5) * SQRT3;
        var thC = uC / R;
        atoms.push([R * Math.cos(thC), j * 3 + 1.5 + Y_OFFSET, R * Math.sin(thC)]);
        atoms.push([R * Math.cos(thC), j * 3 + 2.5 + Y_OFFSET, R * Math.sin(thC)]);
      }
    }

    // 結合検出（距離 ≈ 1.0）
    var bonds = [];
    for (var a = 0; a < atoms.length; a++) {
      for (var b = a + 1; b < atoms.length; b++) {
        var dx = atoms[a][0] - atoms[b][0];
        var dy = atoms[a][1] - atoms[b][1];
        var dz = atoms[a][2] - atoms[b][2];
        var d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (d > 0.85 && d < 1.15) bonds.push([a, b]);
      }
    }
    console.log('[CNT-BG] atoms=' + atoms.length + ', bonds=' + bonds.length);

    // SVG 要素生成（軽量化）
    var bondLines = [];
    for (var k = 0; k < bonds.length; k++) {
      var l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('stroke', 'url(#cntbg-bond-grad)');
      l.setAttribute('stroke-width', '0.04');
      l.setAttribute('stroke-linecap', 'round');
      grp.appendChild(l);
      bondLines.push(l);
    }
    var atomCores = [];
    for (var m = 0; m < atoms.length; m++) {
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('r', '0.18');
      c.setAttribute('fill', 'url(#cntbg-atom-near)');
      grp.appendChild(c);
      atomCores.push(c);
    }

    // アニメーション
    var angY    = 0.3;
    var angRoll = 0;
    var lastT   = performance.now();
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var CAM_DIST = 9.0;
    var FOCAL    = 6.5;

    function frame(t) {
      var dt = Math.min((t - lastT) / 1000, 0.1);
      lastT = t;
      if (!reduced) {
        angY    += dt * 0.15;
        angRoll += dt * 0.05;
      }
      var tilt = 0.18;
      var cosY = Math.cos(angY), sinY = Math.sin(angY);
      var cosT = Math.cos(tilt), sinT = Math.sin(tilt);

      // 投影
      var proj = [];
      for (var i = 0; i < atoms.length; i++) {
        var p = atoms[i];
        var x1 = p[0] * cosY + p[2] * sinY;
        var z1 = -p[0] * sinY + p[2] * cosY;
        var y2 = p[1] * cosT - z1 * sinT;
        var z2 = p[1] * sinT + z1 * cosT;
        var persp = FOCAL / Math.max(2.0, CAM_DIST - z2);
        proj.push([x1 * persp, y2 * persp, z2]);
      }

      // 結合
      for (var k = 0; k < bonds.length; k++) {
        var ai = bonds[k][0], bi = bonds[k][1];
        var pa = proj[ai], pb = proj[bi];
        var ln = bondLines[k];
        ln.setAttribute('x1', pa[0].toFixed(2));
        ln.setAttribute('y1', pa[1].toFixed(2));
        ln.setAttribute('x2', pb[0].toFixed(2));
        ln.setAttribute('y2', pb[1].toFixed(2));
        var depth = (pa[2] + pb[2]) * 0.05 + 0.5;
        if (depth < 0) depth = 0; else if (depth > 1) depth = 1;
        ln.setAttribute('stroke-opacity', (0.15 + depth * 0.55).toFixed(2));
      }

      // 原子
      for (var n = 0; n < atoms.length; n++) {
        var pp = proj[n];
        var cc = atomCores[n];
        cc.setAttribute('cx', pp[0].toFixed(2));
        cc.setAttribute('cy', pp[1].toFixed(2));
        var d2 = pp[2] * 0.1 + 0.5;
        if (d2 < 0) d2 = 0; else if (d2 > 1) d2 = 1;
        cc.setAttribute('r', (0.08 + d2 * 0.14).toFixed(2));
        cc.setAttribute('opacity', (0.30 + d2 * 0.65).toFixed(2));
      }

      // 公転（GPU加速で滑らか）
      var rollDeg = (angRoll * 180 / Math.PI) % 360;
      grp.setAttribute('transform', 'rotate(' + rollDeg.toFixed(2) + ')');

      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ====== 初期化 ======
  function init() {
    createButton();
    injectCNTBackground();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

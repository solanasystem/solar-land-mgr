// ============================================================
// mode-back.js v20260515j
// 各ページに「モード選択へ戻る」フローティングボタンを自動注入
// ------------------------------------------------------------
// v20260515j 変更点 (2026-05-15):
//   - MODE と SELECT を縦2段表示に変更（centered column配置）
//   - ボタン全体を大幅にコンパクト化（高さ 36px → 28px / 幅 ~155 → ~95px）
//   - クローバアイコン 24px → 18px
//   - ヘッダー左padding 175px → 120px に調整
//   - 配色・グラデは v20260515h のロゴ統一スタイルを継承
// v20260515h 変更点 (2026-05-15):
//   - クローバSVGをMODE SELECTボタン内部に統合
//   - ボタンの縦中心線をヘッダー高さから JS で動的計算
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
  for (var i = 0; i < EXCLUDED.length; i++) {
    if (path.endsWith(EXCLUDED[i])) return;
  }
  if (path === '/' || path.endsWith('/solar-land-mgr/') || path.endsWith('/solar-land-mgr')) return;

  // ====== クローバSVG ======
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
    // v20260515j: ヘッダー左パディング 175 → 120
    + '.header{padding-left:120px !important;}'
    // ページ側の元クローバアイコンを非表示
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
    // 2段表示：column 方向に並べる
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
    + '@media print{#ms-back-btn{display:none !important;}}';

  var styleEl = document.createElement('style');
  styleEl.setAttribute('data-mode-back', 'true');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ====== ボタン本体の生成 ======
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
  } else {
    createButton();
  }
})();

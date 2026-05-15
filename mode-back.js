// ============================================================
// mode-back.js v20260515h
// 各ページに「モード選択へ戻る」フローティングボタンを自動注入
// ------------------------------------------------------------
// v20260515h 変更点 (2026-05-15):
//   - クローバSVGをMODE SELECTボタン内部に統合
//     ボタンとロゴアイコンが「1つの緑グラデ枠」に完全一体化。
//   - ページ側の元 .logo > .logo-icon (SVGクローバ) を CSS で非表示化。
//   - ボタンの縦中心線をヘッダー高さから JS で動的計算（getBoundingClientRect）。
//     pageごとのヘッダー高さの違い(52/56px)を吸収し、完全に縦中心一致。
// v20260515g 変更点:
//   - 配色をサイバーパンク調(黒/シアン) → ロゴと同系統(緑グラデ)に変更
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

  // ====== クローバSVG（gradient ID を msb- 接頭辞でリネームしてページ側と衝突回避） ======
  var CLOVER_SVG = '<svg viewBox="0 0 64 64" width="22" height="22" xmlns="http://www.w3.org/2000/svg">'
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
    // v20260515h: ヘッダー左パディング（クローバ統合ボタン幅~155px対応）
    + '.header{padding-left:175px !important;}'
    // v20260515h: ページ側の元クローバアイコンを非表示（ボタン内クローバと重複排除）
    + '.logo > .logo-icon{display:none !important;}'
    + '.logo .logo-icon:has(svg){display:none !important;}'
    + '#ms-back-btn{'
    + 'position:fixed;left:14px;z-index:9999;'
    // top は JS で動的計算して上書き（初期値だけ書いておく）
    + 'top:12px;'
    + 'display:inline-flex;align-items:center;gap:8px;'
    + 'height:36px;padding:0 12px 0 10px;'
    + 'background:linear-gradient(135deg,#0F7B3E,#064E2A);'
    + 'border:1px solid rgba(34,197,94,0.5);'
    + 'border-radius:8px;'
    + 'color:#ffffff;text-decoration:none;cursor:pointer;'
    + 'font-family:inherit;'
    + 'font-size:11px;font-weight:700;letter-spacing:0.08em;'
    + 'line-height:1;white-space:nowrap;'
    + 'box-shadow:inset 0 1px 2px rgba(255,255,255,0.18),0 2px 6px rgba(0,0,0,0.35);'
    + 'transition:transform 0.15s ease,box-shadow 0.15s ease,border-color 0.15s ease;'
    + '}'
    + '#ms-back-btn:hover{'
    + 'transform:translateX(-2px);'
    + 'border-color:rgba(134,239,172,0.75);'
    + 'box-shadow:inset 0 1px 2px rgba(255,255,255,0.22),0 4px 12px rgba(0,0,0,0.45);'
    + '}'
    + '#ms-back-btn .arr{color:#86efac;font-size:14px;line-height:1;transition:transform 0.15s;display:inline-block;}'
    + '#ms-back-btn:hover .arr{transform:translateX(-3px);}'
    + '#ms-back-btn .ms-clover{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex-shrink:0;}'
    + '#ms-back-btn .ms-clover svg{width:100%;height:100%;display:block;}'
    + '#ms-back-btn .lbl{color:#ffffff;font-weight:700;}'
    + '#ms-back-btn .sub{color:#86efac;font-size:9px;font-weight:600;letter-spacing:0.12em;opacity:0.9;}'
    + '#ms-back-btn .stack{display:inline-flex;flex-direction:row;align-items:baseline;gap:5px;line-height:1;margin-left:2px;}'
    + '@media (max-width:640px){'
    + '#ms-back-btn{left:8px;height:32px;padding:0 10px 0 8px;font-size:10px;gap:6px;}'
    + '#ms-back-btn .ms-clover{width:22px;height:22px;}'
    + '#ms-back-btn .sub{display:none;}'
    + '.header{padding-left:115px !important;}'
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

    // v20260515h: ヘッダー高さからボタンの top を動的計算（縦中心線を完全一致）
    alignVerticalCenter(btn);
    // ウィンドウリサイズ時にも追従
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
    var btnHeight = btn.offsetHeight || 36;
    // ヘッダーの上端＋(ヘッダー高さ − ボタン高さ)/2 で完全な縦中央
    var topPx = headerRect.top + (headerRect.height - btnHeight) / 2;
    // ヘッダーが画面外（マイナス）ならスクロール中なので調整
    if (topPx < 0) topPx = 4;
    btn.style.top = topPx + 'px';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
  } else {
    createButton();
  }
})();

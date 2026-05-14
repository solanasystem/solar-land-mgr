// ============================================================
// mode-back.js v20260514e
// 各ページに「モード選択へ戻る」フローティングボタンを自動注入
// 使い方: 各HTMLの <head> または </body> 直前で
//   <script src="mode-back.js"></script>
// を読み込むだけ。ボタンは自動生成される。
// 除外ページ: mode-select.html / index.html / login.html
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
  // ルートやサイトトップ（index.html扱い）も除外
  if (path === '/' || path.endsWith('/solar-land-mgr/') || path.endsWith('/solar-land-mgr')) return;

  // ====== スタイル注入 ======
  var css = ''
    + '#ms-back-btn{'
    + 'position:fixed;top:14px;left:14px;z-index:9999;'
    + 'display:inline-flex;align-items:center;gap:8px;'
    + 'padding:9px 14px 9px 12px;'
    + 'background:linear-gradient(180deg,rgba(7,10,19,0.92),rgba(7,10,19,0.78));'
    + '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);'
    + 'border:1px solid rgba(0,212,255,0.45);border-radius:6px;'
    + 'color:#eef2ff;text-decoration:none;cursor:pointer;'
    + "font-family:'JetBrains Mono','Share Tech Mono','Courier New',monospace;"
    + 'font-size:11px;font-weight:600;letter-spacing:0.18em;'
    + 'box-shadow:0 4px 14px rgba(0,0,0,0.5),0 0 0 1px rgba(0,212,255,0.15);'
    + 'transition:all 0.2s cubic-bezier(0.4,0,0.2,1);'
    + 'overflow:hidden;'
    + '}'
    + '#ms-back-btn::before{'
    + 'content:"";position:absolute;top:0;left:0;right:0;height:1px;'
    + 'background:linear-gradient(90deg,transparent 0%,transparent 30%,#00d4ff 48%,#fff 50%,#00d4ff 52%,transparent 70%,transparent 100%);'
    + 'background-size:50% 100%;background-repeat:no-repeat;'
    + 'animation:ms-back-flow 4s linear infinite;'
    + 'filter:drop-shadow(0 0 3px #00d4ff);'
    + '}'
    + '#ms-back-btn:hover{'
    + 'transform:translateX(-2px);'
    + 'border-color:#00d4ff;'
    + 'box-shadow:0 6px 18px rgba(0,0,0,0.55),0 0 0 1px #00d4ff,0 0 24px rgba(0,212,255,0.35);'
    + '}'
    + '#ms-back-btn .arr{color:#00d4ff;font-size:14px;line-height:1;transition:transform 0.15s;display:inline-block;}'
    + '#ms-back-btn:hover .arr{transform:translateX(-4px);}'
    + '#ms-back-btn .lbl{font-style:italic;text-shadow:0 0 8px rgba(0,212,255,0.3);}'
    + '#ms-back-btn .sub{'
    + 'font-size:8px;letter-spacing:0.3em;opacity:0.55;'
    + 'display:block;margin-top:2px;font-style:italic;color:#7dd3fc;'
    + '}'
    + '#ms-back-btn .stack{display:flex;flex-direction:column;line-height:1.1;}'
    + '@keyframes ms-back-flow{'
    + '0%{background-position:-50% 0;}'
    + '100%{background-position:150% 0;}'
    + '}'
    + '@media (max-width:640px){'
    + '#ms-back-btn{top:8px;left:8px;padding:7px 11px 7px 9px;font-size:10px;}'
    + '#ms-back-btn .sub{display:none;}'
    + '}'
    + '@media print{#ms-back-btn{display:none !important;}}'
    + '@media (prefers-reduced-motion:reduce){'
    + '#ms-back-btn::before{animation:none;background-position:50% 0;}'
    + '}';

  var styleEl = document.createElement('style');
  styleEl.setAttribute('data-mode-back', 'true');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ====== ボタン本体の生成 ======
  function createButton() {
    if (document.getElementById('ms-back-btn')) return; // 二重生成防止

    var btn = document.createElement('a');
    btn.id = 'ms-back-btn';
    btn.href = 'mode-select.html';
    btn.title = 'モード選択画面へ戻る';
    btn.setAttribute('aria-label', 'モード選択画面へ戻る');
    btn.innerHTML =
      '<span class="arr">◂</span>' +
      '<span class="stack">' +
        '<span class="lbl">MODE</span>' +
        '<span class="sub">SELECT</span>' +
      '</span>';
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
  } else {
    createButton();
  }
})();

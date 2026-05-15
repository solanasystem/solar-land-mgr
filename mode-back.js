// ============================================================
// mode-back.js v20260515g
// 各ページに「モード選択へ戻る」フローティングボタンを自動注入
// 使い方: 各HTMLの <head> または </body> 直前で
//   <script src="mode-back.js"></script>
// を読み込むだけ。ボタンは自動生成される。
// 除外ページ: mode-select.html / index.html / login.html
// ------------------------------------------------------------
// v20260515g 変更点 (2026-05-15):
//   - 配色をサイバーパンク調(黒/シアン) → ロゴと同系統(緑グラデ)に変更
//     ボタンとクローバマークを視覚的に「一体化」させた。
//   - 流れる白ラインのアニメ装飾を撤廃、影もロゴと同じ控えめなスタイルに統一。
//   - フォントの italic / letter-spacing を抑制、太字でクリーン表示。
//   - 角丸を 6px → 8px に統一（ロゴアイコンと一致）。
// v20260515f 変更点:
//   - 2行スタック表示 → 1行横並びでヘッダー縦中心線と一致
// v20260515e 変更点:
//   - 全ページの .header に padding-left を強制注入（ロゴ重なり回避）
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
    // v20260515g: ヘッダーの左パディングを強制注入（新ボタン幅~115px に対応）
    + '.header{padding-left:130px !important;}'
    + '#ms-back-btn{'
    // top:12 + height:32 でヘッダー高さ56pxの縦中心線(28px)と一致
    + 'position:fixed;top:12px;left:14px;z-index:9999;'
    + 'display:inline-flex;align-items:center;gap:7px;'
    + 'height:32px;padding:0 12px;'
    // v20260515g: ロゴアイコンと同じ緑グラデ・同じ角丸・同じシャドウで「一体化」
    + 'background:linear-gradient(135deg,#0F7B3E,#064E2A);'
    + 'border:1px solid rgba(34,197,94,0.45);'
    + 'border-radius:8px;'
    + 'color:#ffffff;text-decoration:none;cursor:pointer;'
    + 'font-family:inherit;'
    + 'font-size:11px;font-weight:700;letter-spacing:0.08em;'
    + 'line-height:1;white-space:nowrap;'
    + 'box-shadow:inset 0 1px 2px rgba(255,255,255,0.15),0 2px 4px rgba(0,0,0,0.3);'
    + 'transition:transform 0.15s ease,box-shadow 0.15s ease,border-color 0.15s ease;'
    + '}'
    + '#ms-back-btn:hover{'
    + 'transform:translateX(-2px);'
    + 'border-color:rgba(134,239,172,0.7);'
    + 'box-shadow:inset 0 1px 2px rgba(255,255,255,0.2),0 4px 10px rgba(0,0,0,0.4);'
    + '}'
    + '#ms-back-btn .arr{color:#86efac;font-size:13px;line-height:1;transition:transform 0.15s;display:inline-block;}'
    + '#ms-back-btn:hover .arr{transform:translateX(-3px);}'
    + '#ms-back-btn .lbl{color:#ffffff;font-weight:700;}'
    + '#ms-back-btn .sub{color:#86efac;font-size:9px;font-weight:600;letter-spacing:0.12em;opacity:0.85;}'
    + '#ms-back-btn .stack{display:inline-flex;flex-direction:row;align-items:baseline;gap:5px;line-height:1;}'
    + '@media (max-width:640px){'
    + '#ms-back-btn{top:8px;left:8px;height:28px;padding:0 10px;font-size:10px;gap:6px;}'
    + '#ms-back-btn .sub{display:none;}'
    + '.header{padding-left:85px !important;}'
    + '}'
    + '@media print{#ms-back-btn{display:none !important;}}';

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

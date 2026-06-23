// ============================================================
// mode-back.js v20260623b
// 各ページに「モード選択へ戻る」+「⇐ 戻る (業務上の前モード画面へ)」 フローティングボタンを自動注入
// ------------------------------------------------------------
// v20260623b (2026-06-24):
//   - 「⇐ 戻る」の動作を sessionStorage 独自スタック方式に再設計（v20260623a は history.back()+referrer 方式で
//     mode-select.html を経由するルートでは緑と同じ動作になる致命欠陥があったため）
//   - 業務上のモード画面の訪問履歴を sessionStorage('ms_back_stack') に積む
//   - mode-select.html / index.html / login.html は EXCLUDED で return しているのでスタックに積まれない
//     → 「案件マスター→mode-select→農地変化トラッカー」で ⇐ 戻る を押すと案件マスターに直接ジャンプ
//   - スタックが 2 件未満（新規タブ・直接URL）の場合は「⇐ 戻る」ボタン自体を表示しない（緑と被らない）
//   - 同一ページのリロード等で重複 push されないよう、直前 entry と同一なら push しない
//   - スタック暴走防止に最大 50 件で打ち切り
//
// v20260623a (2026-06-23):
//   - MODE SELECT の右隣に「⇐ 戻る」ボタンを追加（青系・1つ前の画面へ）
//   - history.length>1 なら history.back()、無ければ mode-select.html へフォールバック
//   - 全画面共通(mode-back.js 1ファイル改修で全画面に反映)
//   - ヘッダー左padding 120px → 200px (2ボタン分の幅)
//
// v20260515j (2026-05-15):
//   - MODE と SELECT を縦2段表示に変更
//   - ボタン全体をコンパクト化（高さ 36px → 28px / 幅 ~155 → ~95px）
//   - クローバアイコン 24px → 18px
//   - ヘッダー左padding 175px → 120px
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

  // ====== v20260623b: 業務履歴スタック(sessionStorage) ======
  var STACK_KEY = 'ms_back_stack';
  var STACK_MAX = 50;

  function _loadStack() {
    try {
      var raw = sessionStorage.getItem(STACK_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function _saveStack(arr) {
    try { sessionStorage.setItem(STACK_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function _currentEntry() {
    // pathname + search を保存（ハッシュは省略：地図位置など揮発情報を含むため）
    return (location.pathname || '') + (location.search || '');
  }
  function _pushCurrentPage() {
    var stack = _loadStack();
    var cur = _currentEntry();
    // 直前 entry と同じなら push しない（リロード・popstate を含む重複防止）
    if (stack.length > 0 && stack[stack.length - 1] === cur) return stack;
    stack.push(cur);
    if (stack.length > STACK_MAX) stack = stack.slice(-STACK_MAX);
    _saveStack(stack);
    return stack;
  }
  function _popAndGetPrev() {
    var stack = _loadStack();
    if (stack.length >= 2) {
      stack.pop(); // 末尾=現ページを除去
      var prev = stack[stack.length - 1];
      _saveStack(stack);
      return prev;
    }
    return null;
  }

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
    + '.header, .topbar{padding-left:200px !important;}'
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
    + '#ms-prev-btn{position:fixed;z-index:9999;top:10px;left:115px;display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;background:linear-gradient(135deg,#1e3a8a,#0c1d52);border:1px solid rgba(96,165,250,0.55);border-radius:6px;color:#fff;cursor:pointer;font-family:inherit;line-height:1;white-space:nowrap;box-shadow:inset 0 1px 2px rgba(255,255,255,0.18),0 2px 5px rgba(0,0,0,0.35);transition:transform 0.15s ease,box-shadow 0.15s ease,border-color 0.15s ease;}'
    + '#ms-prev-btn:hover{transform:translateX(-2px);border-color:rgba(147,197,253,0.85);box-shadow:inset 0 1px 2px rgba(255,255,255,0.22),0 4px 10px rgba(0,0,0,0.45);}'
    + '#ms-prev-btn .arr{color:#93c5fd;font-size:12px;line-height:1;transition:transform 0.15s;display:inline-block;}'
    + '#ms-prev-btn:hover .arr{transform:translateX(-2px);}'
    + '#ms-prev-btn .lbl{color:#fff;font-weight:700;font-size:11px;letter-spacing:0.06em;line-height:1;}'
    + '@media (max-width:640px){'
    + '#ms-back-btn{left:7px;height:26px;padding:0 7px 0 5px;gap:4px;}'
    + '#ms-back-btn .ms-clover{width:16px;height:16px;}'
    + '#ms-back-btn .arr{font-size:10px;}'
    + '#ms-back-btn .lbl{font-size:9px;}'
    + '#ms-back-btn .sub{font-size:6.5px;}'
    + '#ms-prev-btn{left:100px;height:26px;padding:0 8px;}'
    + '#ms-prev-btn .lbl{font-size:10px;}'
    + '.header, .topbar{padding-left:170px !important;}'
    + '}'
    + '@media print{#ms-back-btn,#ms-prev-btn{display:none !important;}}';

  var styleEl = document.createElement('style');
  styleEl.setAttribute('data-mode-back', 'true');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // v20260623b: 現ページを業務履歴スタックに push（DOM 構築前でも sessionStorage は使えるのでここで実行）
  var STACK_AFTER_PUSH = _pushCurrentPage();

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

    // v20260623b: 業務履歴スタックが 2 件以上ある時だけ「⇐ 戻る」を表示
    //   （新規タブ・直接URLアクセス時は緑(MODE SELECT)と同動作になるのを防ぐため非表示）
    if (STACK_AFTER_PUSH.length >= 2) {
      var prev = document.createElement('button');
      prev.id = 'ms-prev-btn';
      prev.type = 'button';
      prev.title = '業務上の前モード画面に戻る';
      prev.setAttribute('aria-label', '業務上の前モード画面に戻る');
      prev.innerHTML = '<span class="arr">⇐</span><span class="lbl">戻る</span>';
      prev.addEventListener('click', function (e) {
        e.preventDefault();
        var prevUrl = _popAndGetPrev();
        if (prevUrl) {
          // 同オリジン相対パスへ遷移（ホスト直下の絶対パスを保存しているため）
          window.location.href = prevUrl;
        } else {
          // フォールバック（通常ここには来ない：表示時点で長さ>=2を確認済）
          window.location.href = 'mode-select.html';
        }
      });
      document.body.appendChild(prev);
    }

    alignVerticalCenter(btn);
    var rafId = null;
    window.addEventListener('resize', function () {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function () { alignVerticalCenter(btn); });
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
    var prev = document.getElementById('ms-prev-btn');
    if (prev) {
      var prevHeight = prev.offsetHeight || 28;
      var prevTop = headerRect.top + (headerRect.height - prevHeight) / 2;
      if (prevTop < 0) prevTop = 3;
      prev.style.top = prevTop + 'px';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
  } else {
    createButton();
  }
})();

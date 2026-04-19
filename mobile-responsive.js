/* ============================================================
   SOLAR LAND MGR - 共通モバイル対応 JavaScript
   ============================================================
   機能：
   1. 折りたたみパネルをドラッグで移動可能に
   2. ヘッダー全体を☰ボタンで折りたたみ可能に

   各HTMLの<body>最後に以下を追加するだけ：
     <script src="mobile-responsive.js"></script>

   PC（1025px以上）では一切動作しない。
   ============================================================ */

(function() {
  'use strict';

  // PC版では何もしない
  if (window.innerWidth > 1024) return;

  // DOM読み込み後に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // 既にDOM読み込み済みの場合は即実行
    init();
  }

  function init() {
    initDraggablePanels();
    initHeaderToggle();
  }

  // =========================================================
  // 【1】 ドラッグ機能
  // =========================================================
  function initDraggablePanels() {
    const selectors = [
      '.mc-collapsible',
      '.layer-control',
      '.hazard-controls'
    ];

    selectors.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(panel) {
        // ヘッダー要素（ドラッグハンドル）を探す
        const handle = panel.querySelector(
          '.mc-panel-header, .layer-panel-header, .hazard-panel-header'
        );
        if (!handle) return;
        makeDraggable(panel, handle);
      });
    });
  }

  function makeDraggable(el, handle) {
    let startX = null, startY = null;
    let initialLeft = 0, initialTop = 0;
    let isDragging = false;
    let clickBlocked = false;

    // ドラッグハンドルのタッチ操作でスクロールしない
    handle.style.touchAction = 'none';

    handle.addEventListener('touchstart', function(e) {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const rect = el.getBoundingClientRect();
      startX = touch.clientX;
      startY = touch.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;
      isDragging = false;
      clickBlocked = false;
    }, { passive: true });

    handle.addEventListener('touchmove', function(e) {
      if (startX === null || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // 5px以上動いたらドラッグ開始と判定
      if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        isDragging = true;
        clickBlocked = true;

        // 初回のみ position を fixed に切り替え
        el.style.position = 'fixed';
        el.style.left = initialLeft + 'px';
        el.style.top = initialTop + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transition = 'none';
        el.style.zIndex = '600';
      }

      if (isDragging) {
        e.preventDefault(); // スクロール防止
        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        // 画面外に完全に出ないよう制限（一部は見える状態を維持）
        const maxLeft = window.innerWidth - 40;
        const maxTop = window.innerHeight - 40;
        const minLeft = -(el.offsetWidth - 40);
        const minTop = 0;
        newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
        newTop = Math.max(minTop, Math.min(newTop, maxTop));

        el.style.left = newLeft + 'px';
        el.style.top = newTop + 'px';
      }
    }, { passive: false });

    handle.addEventListener('touchend', function() {
      startX = null;
      startY = null;
      isDragging = false;

      // ドラッグしていたら、直後のclickイベントをキャンセル
      // （折りたたみトグルが誤発火しないように）
      if (clickBlocked) {
        const oneShot = function(evt) {
          evt.stopImmediatePropagation();
          evt.preventDefault();
          handle.removeEventListener('click', oneShot, true);
        };
        handle.addEventListener('click', oneShot, true);
        // 念のため次のフレームで解除
        setTimeout(function() {
          handle.removeEventListener('click', oneShot, true);
          clickBlocked = false;
        }, 300);
      }
    });
  }

  // =========================================================
  // 【2】 ヘッダー折りたたみ機能
  // =========================================================
  function initHeaderToggle() {
    const header = document.querySelector('header.header');
    if (!header) return;

    // 既に追加されているか確認（重複防止）
    if (document.querySelector('.mobile-header-toggle')) return;

    // ☰ボタンを作成
    const btn = document.createElement('button');
    btn.className = 'mobile-header-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'ヘッダー開閉');

    btn.addEventListener('click', function() {
      const isCollapsed = header.classList.toggle('mobile-header-hidden');
      btn.innerHTML = isCollapsed ? '☰' : '×';
    });

    document.body.appendChild(btn);

    // 初期状態：ヘッダーは折りたたみ状態（地図を最大化）
    header.classList.add('mobile-header-hidden');
    btn.innerHTML = '☰';
  }

})();

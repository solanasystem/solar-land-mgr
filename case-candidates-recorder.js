/* ============================================================
   GRID LAND MGR - 案件候補レコーダー（PC地図クリック + モバイルGPS）
   ============================================================
   役割：
     1. PC地図クリック → 確認モーダル → case_candidates へ INSERT
     2. モバイルGPS FAB → 現在地取得 → 確認 → INSERT

   使い方（各3マップHTMLの末尾で）：
     1. <script src="case-candidates-recorder.js"></script> を読み込む
     2. 地図初期化後に CaseCandidatesRecorder.init(map, db, sourcePage) を呼ぶ
        - map: Leaflet map インスタンス
        - db: Supabase クライアント
        - sourcePage: 'field-survey' | 'landowner-visit' | 'farmland-tracker'
   ============================================================ */

(function() {
  'use strict';

  // ダミー organization_id（Auth未導入時）
  // SQL の current_organization_id() のフォールバック値と一致させること
  const DUMMY_ORG_ID = '00000000-0000-0000-0000-000000000001';

  let _map = null;
  let _db = null;
  let _sourcePage = null;
  let _initialized = false;

  /* ----------------------------------------------------------
     初期化（各HTMLから呼ぶ）
     ---------------------------------------------------------- */
  function init(map, db, sourcePage) {
    if (_initialized) return;
    if (!map || !db || !sourcePage) {
      console.warn('[CaseCandidatesRecorder] init: 引数不足', { map, db, sourcePage });
      return;
    }
    _map = map;
    _db = db;
    _sourcePage = sourcePage;
    _initialized = true;

    setupModal();
    setupPcClickHandler();
    setupMobileGpsFab();
  }

  /* ----------------------------------------------------------
     モーダル要素を生成（共通：PC/モバイル両用）
     ---------------------------------------------------------- */
  function setupModal() {
    if (document.getElementById('candidateConfirmModal')) return;
    const html = `
      <div class="cc-modal-overlay" id="candidateConfirmModal" style="display:none">
        <div class="cc-modal">
          <div class="cc-modal-title" id="ccModalTitle">📍 ここを記録しますか？</div>
          <div class="cc-modal-body">
            <div class="cc-modal-row">
              <span class="cc-modal-label">緯度</span>
              <span class="cc-modal-val" id="ccModalLat">—</span>
            </div>
            <div class="cc-modal-row">
              <span class="cc-modal-label">経度</span>
              <span class="cc-modal-val" id="ccModalLng">—</span>
            </div>
            <div class="cc-modal-row" id="ccModalAccuracyRow" style="display:none">
              <span class="cc-modal-label">GPS精度</span>
              <span class="cc-modal-val" id="ccModalAccuracy">—</span>
            </div>
            <div class="cc-modal-row" id="ccModalSourceRow">
              <span class="cc-modal-label">記録元</span>
              <span class="cc-modal-val" id="ccModalSource">—</span>
            </div>
            <div class="cc-modal-memo-wrap">
              <label for="ccModalMemo" class="cc-modal-label">メモ（任意）</label>
              <textarea id="ccModalMemo" class="cc-modal-memo" rows="2" placeholder="例：ソーラー候補地"></textarea>
            </div>
          </div>
          <div class="cc-modal-actions">
            <button class="cc-btn cc-btn-cancel" type="button" onclick="CaseCandidatesRecorder._close()">キャンセル</button>
            <button class="cc-btn cc-btn-ok" type="button" onclick="CaseCandidatesRecorder._save()">記録する</button>
          </div>
        </div>
      </div>
    `;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);

    // 共通CSSをinjectする
    if (!document.getElementById('ccRecorderStyles')) {
      const style = document.createElement('style');
      style.id = 'ccRecorderStyles';
      style.textContent = `
        .cc-modal-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 9999;
          display: flex !important;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .cc-modal-overlay[style*="display:none"],
        .cc-modal-overlay[style*="display: none"] {
          display: none !important;
        }
        .cc-modal {
          background: var(--surface, #161b22);
          border: 1px solid var(--border, #30363d);
          border-radius: 10px;
          padding: 20px;
          max-width: 360px;
          width: 100%;
          color: var(--text, #e6edf3);
          font-family: var(--font-main, system-ui);
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .cc-modal-title {
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 14px;
        }
        .cc-modal-body { margin-bottom: 16px; }
        .cc-modal-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          font-size: 13px;
        }
        .cc-modal-label {
          color: var(--text-muted, #8b949e);
          font-size: 12px;
        }
        .cc-modal-val {
          font-family: var(--font-mono, monospace);
          color: var(--text, #e6edf3);
          font-size: 13px;
        }
        .cc-modal-memo-wrap {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 10px;
        }
        .cc-modal-memo {
          width: 100%;
          background: var(--bg, #0d1117);
          border: 1px solid var(--border, #30363d);
          color: var(--text, #e6edf3);
          font-family: var(--font-main, system-ui);
          font-size: 13px;
          padding: 6px 8px;
          border-radius: 5px;
          resize: vertical;
          box-sizing: border-box;
        }
        .cc-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .cc-btn {
          padding: 8px 16px;
          border-radius: 5px;
          font-family: var(--font-main, system-ui);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--border, #30363d);
          background: transparent;
          color: var(--text, #e6edf3);
        }
        .cc-btn-cancel:hover { background: var(--surface2, #1c2333); }
        .cc-btn-ok {
          background: var(--accent, #f0b429);
          color: #000;
          border-color: var(--accent, #f0b429);
        }
        .cc-btn-ok:hover { background: #e0a820; }
        .cc-btn-ok:disabled { opacity: 0.5; cursor: wait; }

        /* GPS FAB（モバイルのみ） - 初期位置：左下、ドラッグで自由移動可能 */
        .cc-gps-fab {
          display: none;
          position: fixed;
          bottom: 20px;
          left: 20px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: var(--accent, #f0b429);
          color: #000;
          border: none;
          font-size: 24px;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          cursor: pointer;
          z-index: 1000;
          -webkit-tap-highlight-color: transparent;
          touch-action: none; /* ドラッグ時のスクロールを抑制 */
        }
        .cc-gps-fab:active {
          transform: scale(0.95);
          background: #e0a820;
        }
        .cc-gps-fab:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        @media (max-width: 1024px) {
          .cc-gps-fab { display: flex; align-items: center; justify-content: center; }
        }

        /* トースト */
        .cc-toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--surface, #161b22);
          border: 1px solid var(--border, #30363d);
          border-radius: 6px;
          padding: 10px 18px;
          color: var(--text, #e6edf3);
          font-family: var(--font-main, system-ui);
          font-size: 13px;
          z-index: 10000;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          animation: ccToastIn 0.2s ease-out;
        }
        .cc-toast.cc-success { border-color: #3fb950; color: #3fb950; }
        .cc-toast.cc-error   { border-color: #f85149; color: #f85149; }
        @keyframes ccToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /* ----------------------------------------------------------
     PC地図クリックハンドラ
     ---------------------------------------------------------- */
  function setupPcClickHandler() {
    if (!_map) return;
    _map.on('click', function(e) {
      // モバイル時はクリックでは記録しない（GPS FAB経由のみ）
      if (window.innerWidth <= 1024) return;
      // モーダルを開く
      openConfirmModal({
        latitude: e.latlng.lat,
        longitude: e.latlng.lng,
        source: 'pc_click',
        accuracy: null
      });
    });
  }

  /* ----------------------------------------------------------
     モバイルGPS FAB
     ---------------------------------------------------------- */
  function setupMobileGpsFab() {
    if (document.getElementById('ccGpsFab')) return;
    const btn = document.createElement('button');
    btn.id = 'ccGpsFab';
    btn.className = 'cc-gps-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', '現在地を案件候補に記録');
    btn.textContent = '📍';
    btn.addEventListener('click', handleGpsClick);
    document.body.appendChild(btn);
    // ドラッグ機能を有効化（モバイルのみ実効）
    makeFabDraggable(btn);
  }

  /* ----------------------------------------------------------
     FABのドラッグ機能（mobile-responsive.js の方式に準拠）
     - 5px以上動いたらドラッグと判定
     - ドラッグ中はpositionをfixedで実座標に上書き
     - ドラッグ後の click イベントは1回キャンセル
     - PC（1025px以上）では何もしない
     ---------------------------------------------------------- */
  function makeFabDraggable(el) {
    if (window.innerWidth > 1024) return;

    let startX = null, startY = null;
    let initialLeft = 0, initialTop = 0;
    let isDragging = false;
    let clickBlocked = false;

    el.addEventListener('touchstart', function(e) {
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

    el.addEventListener('touchmove', function(e) {
      if (startX === null || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // 5px以上動いたらドラッグ開始
      if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        isDragging = true;
        clickBlocked = true;
        // bottom/right指定を解除し、left/topの実座標に切り替え
        el.style.setProperty('left', initialLeft + 'px', 'important');
        el.style.setProperty('top', initialTop + 'px', 'important');
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('bottom', 'auto', 'important');
        el.style.setProperty('transition', 'none', 'important');
      }

      if (isDragging) {
        e.preventDefault(); // スクロール防止
        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;
        // 画面外に完全に出ないよう40px以上は見える状態を維持
        const maxLeft = window.innerWidth - 40;
        const maxTop = window.innerHeight - 40;
        const minLeft = -(el.offsetWidth - 40);
        const minTop = 0;
        newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
        newTop = Math.max(minTop, Math.min(newTop, maxTop));
        el.style.setProperty('left', newLeft + 'px', 'important');
        el.style.setProperty('top', newTop + 'px', 'important');
      }
    }, { passive: false });

    el.addEventListener('touchend', function() {
      startX = null;
      startY = null;
      isDragging = false;
      // ドラッグしていたら直後のclickイベントをキャンセル
      // （GPS取得が誤発火しないよう）
      if (clickBlocked) {
        const oneShot = function(evt) {
          evt.stopImmediatePropagation();
          evt.preventDefault();
          el.removeEventListener('click', oneShot, true);
        };
        el.addEventListener('click', oneShot, true);
        setTimeout(function() {
          el.removeEventListener('click', oneShot, true);
          clickBlocked = false;
        }, 300);
      }
    });
  }

  function handleGpsClick() {
    const btn = document.getElementById('ccGpsFab');
    if (!navigator.geolocation) {
      showToast('このブラウザは位置情報に対応していません', 'error');
      return;
    }
    if (btn) btn.disabled = true;
    showToast('現在地を取得中…');
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        if (btn) btn.disabled = false;
        openConfirmModal({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          source: 'mobile_gps',
          accuracy: pos.coords.accuracy
        });
      },
      function(err) {
        if (btn) btn.disabled = false;
        let msg = '位置情報取得に失敗しました';
        if (err.code === err.PERMISSION_DENIED) msg = '位置情報の利用が許可されていません';
        if (err.code === err.POSITION_UNAVAILABLE) msg = '位置情報を取得できませんでした';
        if (err.code === err.TIMEOUT) msg = '位置情報の取得がタイムアウトしました';
        showToast(msg, 'error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  /* ----------------------------------------------------------
     確認モーダル：開く / 閉じる / 保存
     ---------------------------------------------------------- */
  let _pendingRecord = null;

  function openConfirmModal(rec) {
    _pendingRecord = rec;
    const overlay = document.getElementById('candidateConfirmModal');
    if (!overlay) return;
    document.getElementById('ccModalLat').textContent = rec.latitude.toFixed(6);
    document.getElementById('ccModalLng').textContent = rec.longitude.toFixed(6);
    const accRow = document.getElementById('ccModalAccuracyRow');
    if (rec.accuracy != null) {
      accRow.style.display = '';
      document.getElementById('ccModalAccuracy').textContent = '±' + Math.round(rec.accuracy) + ' m';
    } else {
      accRow.style.display = 'none';
    }
    const sourceLabel = rec.source === 'pc_click' ? 'PC地図クリック' : 'モバイルGPS';
    document.getElementById('ccModalSource').textContent = sourceLabel + '（' + _sourcePage + '）';
    document.getElementById('ccModalMemo').value = '';
    overlay.style.display = '';
  }

  function closeModal() {
    const overlay = document.getElementById('candidateConfirmModal');
    if (overlay) overlay.style.display = 'none';
    _pendingRecord = null;
  }

  async function save() {
    if (!_pendingRecord || !_db) {
      showToast('記録できません（初期化エラー）', 'error');
      return;
    }
    const memo = document.getElementById('ccModalMemo').value.trim() || null;
    const okBtn = document.querySelector('.cc-btn-ok');
    if (okBtn) okBtn.disabled = true;

    const payload = {
      organization_id: DUMMY_ORG_ID,
      latitude: _pendingRecord.latitude,
      longitude: _pendingRecord.longitude,
      source: _pendingRecord.source,
      source_page: _sourcePage,
      accuracy: _pendingRecord.accuracy,
      memo: memo,
      status: 'new'
    };

    try {
      const { data, error } = await _db.from('case_candidates').insert(payload).select();
      if (error) {
        console.error('[CaseCandidatesRecorder] insert error:', error);
        showToast('記録に失敗：' + error.message, 'error');
      } else {
        showToast('案件候補を記録しました', 'success');
        closeModal();
      }
    } catch (e) {
      console.error('[CaseCandidatesRecorder] save exception:', e);
      showToast('予期しないエラー：' + e.message, 'error');
    } finally {
      if (okBtn) okBtn.disabled = false;
    }
  }

  /* ----------------------------------------------------------
     トースト通知
     ---------------------------------------------------------- */
  function showToast(message, type) {
    const existing = document.querySelector('.cc-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'cc-toast' + (type ? ' cc-' + type : '');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(function() { toast.remove(); }, 300);
    }, type === 'error' ? 4000 : 2500);
  }

  /* ----------------------------------------------------------
     公開API
     ---------------------------------------------------------- */
  window.CaseCandidatesRecorder = {
    init: init,
    _close: closeModal,
    _save: save
  };

})();

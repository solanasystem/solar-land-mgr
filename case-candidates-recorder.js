/* ============================================================
   GRID LAND MGR - 案件候補レコーダー（PC地図クリック + モバイルGPS）
   ============================================================
   役割：
     1. PC地図クリック → 確認モーダル → case_candidates へ INSERT
     2. モバイルGPS FAB → 現在地取得 → 確認 → INSERT
     3. [v20260702m] 保存済み case_candidates を地図上にピンで可視化
        - ページ読み込み時に全件取得 → マーカー表示
        - 記録成功時に即マーカー追加（リロード不要）
        - ピンクリックで memo/日時/記録元/状態を popup 表示
        - popup内の削除ボタンで1件削除

   使い方（各3マップHTMLの末尾で）：
     1. <script src="case-candidates-recorder.js"></script> を読み込む
     2. 地図初期化後に CaseCandidatesRecorder.init(map, db, sourcePage) を呼ぶ
        - map: Leaflet map インスタンス
        - db: Supabase クライアント
        - sourcePage: 'field-survey' | 'landowner-visit' | 'farmland-tracker'

   ステータス色分け:
     - new (デフォルト): マゼンタ #ec4899 (変遷分析★と同色・v20260801a)
     - reviewed:        黄 #f0b429
     - adopted:         緑 #3fb950
     - ng:              グレー #6e7681 (半透明)
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
  // v20260702m: 候補ピン関連
  let _candidateLayer = null;      // Leaflet layerGroup
  let _candidateMarkers = {};      // id -> marker
  let _candidatesLoaded = false;

  /* ----------------------------------------------------------
     初期化（各HTMLから呼ぶ）
     ---------------------------------------------------------- */
  function init(map, db, sourcePage, opts) {
    if (_initialized) return;
    if (!map || !db || !sourcePage) {
      console.warn('[CaseCandidatesRecorder] init: 引数不足', { map, db, sourcePage });
      return;
    }
    _map = map;
    _db = db;
    _sourcePage = sourcePage;
    _initialized = true;
    opts = opts || {};

    setupModal();
    setupPcClickHandler();
    setupMobileGpsFab();
    // v20260806e: レイヤー生成(setupCandidateLayer)は常に行う=記録した新ピンが即表示され保存が「動く」。
    //   opts.render===false のときは既存ピンの一括描画(loadExistingCandidates)だけスキップ。
    //   farmland-tracker側は既存の案件候補を用途別レイヤー(太陽光1筆)に統合表示するため、常時の一括ピンは出さない。
    setupCandidateLayer();
    if (opts.render !== false) {
      loadExistingCandidates();
    }
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

        /* v20260702m3: 案件候補ピンは L.circleMarker を使うため、CSS 定義は不要 */

        /* popup 中身 */
        .cc-popup {
          font-family: var(--font-main, system-ui);
          color: var(--text, #e6edf3);
          min-width: 220px;
          padding: 4px 2px;
        }
        .cc-popup-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--accent, #f0b429);
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .cc-popup-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 4px 0;
          font-size: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .cc-popup-row:last-of-type { border-bottom: none; }
        .cc-popup-label {
          color: var(--text-muted, #8b949e);
          font-size: 11px;
          flex-shrink: 0;
        }
        .cc-popup-val {
          text-align: right;
          font-size: 12px;
          word-break: break-word;
        }
        .cc-popup-memo-block {
          margin: 8px 0;
          padding: 8px;
          background: var(--bg, #0d1117);
          border-radius: 5px;
          border: 1px solid var(--border, #30363d);
          font-size: 12px;
          line-height: 1.5;
          max-height: 120px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .cc-popup-actions {
          display: flex;
          gap: 6px;
          margin-top: 12px;
        }
        .cc-popup-btn {
          flex: 1;
          padding: 6px 10px;
          border: 1px solid var(--border, #30363d);
          background: var(--surface2, #1c2333);
          color: var(--text, #e6edf3);
          border-radius: 5px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
        }
        .cc-popup-btn:hover { background: var(--surface, #161b22); }
        .cc-popup-btn.cc-danger {
          border-color: #f85149;
          color: #f85149;
        }
        .cc-popup-btn.cc-danger:hover { background: rgba(248,81,73,0.15); }
      `;
      document.head.appendChild(style);
    }
  }

  /* ----------------------------------------------------------
     PC地図長押しハンドラ（700ms押し続けで記録モーダル）
     - 通常クリックでは発火しない
     - 5px以上動いたら地図ドラッグとみなしてキャンセル
     - マーカー等のクリックには干渉しない（map本体のpointerdownのみ捕捉）
     ---------------------------------------------------------- */
  function setupPcClickHandler() {
    if (!_map) return;
    var LONG_PRESS_MS = 700;
    var MOVE_THRESHOLD = 5;  // 5px以上動いたらキャンセル
    var pressTimer = null;
    var startLatLng = null;
    var startContainerPoint = null;
    var pressTriggered = false;

    function clearPress() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      startLatLng = null;
      startContainerPoint = null;
    }

    _map.on('mousedown', function(e) {
      // モバイル時はクリックでは記録しない（GPS FAB経由のみ）
      if (window.innerWidth <= 1024) return;
      // 右クリック・中クリックは無視（左ボタンのみ）
      if (e.originalEvent && e.originalEvent.button !== 0) return;

      pressTriggered = false;
      // v20260702m3: Leafletのイベントオブジェクトが再利用される可能性を考慮し、
      // e.latlng を参照ではなく値でコピーして固定する（座標ズレ予防）
      startLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
      startContainerPoint = L.point(e.containerPoint.x, e.containerPoint.y);

      pressTimer = setTimeout(function() {
        pressTriggered = true;
        if (startLatLng) {
          openConfirmModal({
            latitude: startLatLng.lat,
            longitude: startLatLng.lng,
            source: 'pc_click',
            accuracy: null
          });
        }
        clearPress();
      }, LONG_PRESS_MS);
    });

    _map.on('mousemove', function(e) {
      if (!pressTimer || !startContainerPoint) return;
      var dist = e.containerPoint.distanceTo(startContainerPoint);
      if (dist > MOVE_THRESHOLD) clearPress();
    });

    _map.on('mouseup', function() { clearPress(); });
    _map.on('mouseout', function() { clearPress(); });
    // ドラッグ開始時もキャンセル
    _map.on('movestart', function() { clearPress(); });
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

  /* ----------------------------------------------------------
     v20260702m: 案件候補ピン可視化
     ---------------------------------------------------------- */
  function setupCandidateLayer() {
    if (!_map || _candidateLayer) return;
    if (!_map.getPane('candidatePane')) {
      const p = _map.createPane('candidatePane');
      p.style.zIndex = '650';  // marker(500)より上、popup(700)より下
    }
    _candidateLayer = L.layerGroup([], { pane: 'candidatePane' }).addTo(_map);
  }

  async function loadExistingCandidates() {
    if (!_db || _candidatesLoaded) return;
    try {
      const { data, error } = await _db.from('case_candidates')
        .select('id, latitude, longitude, source, source_page, memo, status, created_at')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[CaseCandidatesRecorder] load error:', error);
        return;
      }
      _candidatesLoaded = true;
      (data || []).forEach(function(rec) { _addCandidateMarker(rec); });
      console.log('[CaseCandidatesRecorder] loaded ' + (data ? data.length : 0) + ' candidates');
    } catch (e) {
      console.warn('[CaseCandidatesRecorder] load exception:', e);
    }
  }

  function _addCandidateMarker(rec) {
    if (!rec || !_candidateLayer) return;
    if (_candidateMarkers[rec.id]) return; // 重複ガード
    const lat = Number(rec.latitude);
    const lng = Number(rec.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    const status = (rec.status || 'new').toLowerCase();
    // v20260702m3: divIcon(涙滴形+rotate)は位置ズレの原因になるため廃止。
    // Leaflet標準の L.circleMarker で確実に緯度経度=中心に描画。
    const statusColors = {
      new:      '#ff1493',   // 栗本さん指示: 手動ピックを他の筆と紛れない明確なピンクに(deeppink)
      reviewed: '#fbbf24',
      adopted:  '#3fb950',
      ng:       '#6e7681'
    };
    const fillColor = statusColors[status] || '#ff1493';
    const marker = L.circleMarker([lat, lng], {
      pane: 'candidatePane',
      radius: 7,             // 栗本さん指示: 紛れないよう少し大きく(5→7)
      fillColor: fillColor,
      color: '#ffffff',
      weight: 1.5,           // v20260702m4: 2.5→1.5
      fillOpacity: status === 'ng' ? 0.5 : 0.92,
      opacity: 1
    });
    marker.bindPopup(function() { return _buildCandidatePopup(rec); }, {
      maxWidth: 300,
      minWidth: 240,
      className: 'cc-popup-container'
    });
    marker.addTo(_candidateLayer);
    _candidateMarkers[rec.id] = { marker: marker, record: rec };
  }

  function _buildCandidatePopup(rec) {
    const sourceLabel = rec.source === 'pc_click' ? '🖱 PC地図クリック'
                      : rec.source === 'mobile_gps' ? '📱 モバイルGPS'
                      : (rec.source || '—');
    const statusLabels = { new: '🆕 新規', reviewed: '👁 確認済', adopted: '✅ 採用', ng: '⛔ NG' };
    const statusLabel = statusLabels[rec.status] || rec.status || 'new';
    let dateStr = '—';
    try {
      const d = new Date(rec.created_at);
      if (!isNaN(d.getTime())) {
        dateStr = d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0')
               + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      }
    } catch(_) {}

    const memoBlock = rec.memo
      ? '<div class="cc-popup-memo-block">' + _escapeHtml(rec.memo) + '</div>'
      : '<div class="cc-popup-memo-block" style="color:var(--text-muted);font-style:italic">(メモなし)</div>';

    // \u6817\u672c\u3055\u3093\u6307\u793a: \u624b\u52d5\u30d4\u30c3\u30af(\u30d4\u30f3\u30af)\u306e\u30dd\u30c3\u30d7\u30a2\u30c3\u30d7\u3092\u3001\u9752/\u9ec4\u8272(\u6a5f\u68b0\u5019\u88dc)\u3068\u540c\u3058\u30ea\u30c3\u30c1\u30e2\u30fc\u30c0\u30eb\u306b\u7d71\u4e00\u3002
    //  \u9762\u7a4d\u306f\u30e1\u30e2\u5185\u306e\u300c\u9762\u7a4d\u7d04\u25cb\u25cb\u33a1\u300d\u304b\u3089\u62bd\u51fa\u3001\u5730\u56f3/SV/Earth\u3001\u2605\u6848\u4ef6\u30de\u30b9\u30bf\u30fc\u3078\u767b\u9332(promoteToCase)\u3001\ud83d\uddd1\u524a\u9664\u3092\u914d\u7f6e\u3002
    var _lat = Number(rec.latitude), _lng = Number(rec.longitude);
    var _ll = _lat + ',' + _lng;
    var _memo = rec.memo || '';
    var _am = _memo.match(/\u9762\u7a4d\u7d04?\s*([0-9,]+)\s*\u33a1/);
    var _areaHtml = _am ? ('<b>' + _am[1].replace(/,/g,'') + '\u33a1</b>')
                        : '<span style="color:#94a3b8">\u2014\uff08\u7b46\u672a\u7d10\u4ed8\uff09</span>';
    var _memoClean = _memo.replace(/\s*\|?\s*\u9762\u7a4d\u7d04?[0-9,]+\u33a1\([^)]*\)/g, '').trim();
    var _memoHtml = _memoClean ? _escapeHtml(_memoClean)
                               : '<span style="color:#94a3b8;font-style:italic">(\u30e1\u30e2\u306a\u3057)</span>';
    var _dstr = '';
    try { var _d = new Date(rec.created_at);
      if (!isNaN(_d.getTime())) _dstr = _d.getFullYear()+'/'+String(_d.getMonth()+1).padStart(2,'0')+'/'+String(_d.getDate()).padStart(2,'0');
    } catch(_) {}
    var _gm = 'https://www.google.com/maps/search/?api=1&query=' + _ll;
    var _sv = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + _ll;
    var _e3 = 'https://earth.google.com/web/@' + _lat + ',' + _lng + ',150a,300d,35y,0h,55t,0r';
    var _mapBtns = '<div style="display:flex;gap:5px;margin-top:9px">'
      + '<a href="'+_gm+'" target="_blank" rel="noopener" style="flex:1;text-align:center;padding:5px;border:1px solid #1a73e8;background:#0b2447;color:#8ab4f8;border-radius:5px;font-size:11px;text-decoration:none">\ud83c\udf10\u5730\u56f3</a>'
      + '<a href="'+_sv+'" target="_blank" rel="noopener" style="flex:1;text-align:center;padding:5px;border:1px solid #16a34a;background:#0b2e1a;color:#86efac;border-radius:5px;font-size:11px;text-decoration:none">\ud83d\udeb6SV</a>'
      + '<a href="'+_e3+'" target="_blank" rel="noopener" style="flex:1;text-align:center;padding:5px;border:1px solid #16a34a;background:#0b2e1a;color:#86efac;border-radius:5px;font-size:11px;text-decoration:none">\ud83c\udf0dEarth</a>'
      + '</div>';
    var _caseBtn = (typeof window !== 'undefined' && typeof window.promoteToCase === 'function')
      ? '<button onclick="promoteToCase('+_lat+','+_lng+',&quot;\u4f4e\u5727\u592a\u967d\u5149&quot;,&quot;&quot;,this)" style="margin-top:9px;width:100%;padding:6px 8px;border:1px solid #16a34a;background:#0b2e1a;color:#86efac;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">\u2605 \u6848\u4ef6\u30de\u30b9\u30bf\u30fc\u3078\u767b\u9332</button>'
      : '';
    var _delBtn = '<button onclick="CaseCandidatesRecorder._delete(\'' + rec.id + '\')" style="margin-top:9px;width:100%;padding:6px 8px;border:1px solid #B71C1C;background:#3a1414;color:#ff8a80;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">\ud83d\uddd1 \u3053\u306e\u6848\u4ef6\u5019\u88dc\u3092\u524a\u9664</button>';
    return '<div style="min-width:210px">'
      + '<div style="color:#ff1493;font-weight:800;font-size:13px;margin-bottom:6px">\u270b \u624b\u52d5\u30d4\u30c3\u30af\uff08\u6848\u4ef6\u5019\u88dc\uff09'
      + (_dstr?'<span style="font-size:10px;color:#94a3b8;font-weight:400;margin-left:6px">'+_dstr+'</span>':'') + '</div>'
      + '<div style="font-size:12px;line-height:1.9">\u9762\u7a4d: '+_areaHtml+'<br>\u30e1\u30e2: '+_memoHtml+'</div>'
      + _mapBtns + _caseBtn + _delBtn
      + '</div>';
  }

  function _escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function _removeCandidateMarker(id) {
    const entry = _candidateMarkers[id];
    if (!entry) return;
    if (_candidateLayer && entry.marker) {
      _candidateLayer.removeLayer(entry.marker);
    }
    delete _candidateMarkers[id];
  }

  async function _deleteCandidate(id) {
    if (!id || !_db) return;
    if (!confirm('この案件候補を削除します。よろしいですか？')) return;
    try {
      const { error } = await _db.from('case_candidates').delete().eq('id', id);
      if (error) {
        showToast('削除に失敗：' + error.message, 'error');
        return;
      }
      _removeCandidateMarker(id);
      _map.closePopup();
      showToast('案件候補を削除しました', 'success');
    } catch (e) {
      showToast('削除エラー：' + e.message, 'error');
    }
  }

  async function _updateStatus(id, newStatus) {
    if (!id || !_db) return;
    try {
      const { data, error } = await _db.from('case_candidates')
        .update({ status: newStatus })
        .eq('id', id)
        .select();
      if (error) {
        showToast('更新に失敗：' + error.message, 'error');
        return;
      }
      // マーカーを更新（色を変える）
      const entry = _candidateMarkers[id];
      if (entry && data && data[0]) {
        entry.record = data[0];
        // v20260702m3: circleMarker.setStyle で色を切り替え
        const statusColors = {
          new:      '#f59e0b',
          reviewed: '#f0b429',
          adopted:  '#3fb950',
          ng:       '#6e7681'
        };
        const newColor = statusColors[newStatus] || '#f85149';
        entry.marker.setStyle({
          fillColor: newColor,
          fillOpacity: newStatus === 'ng' ? 0.5 : 0.92
        });
        entry.marker.setPopupContent(_buildCandidatePopup(data[0]));
      }
      showToast('ステータスを「' + newStatus + '」に更新しました', 'success');
    } catch (e) {
      showToast('更新エラー：' + e.message, 'error');
    }
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
        // v20260702m: 保存成功直後に地図へマーカーを追加（リロード不要）
        if (data && data[0]) {
          _addCandidateMarker(data[0]);
        }
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
    _save: save,
    // v20260702m: popup 内ボタンから呼ばれる
    _delete: _deleteCandidate,
    _updateStatus: _updateStatus,
    // 手動で候補を再読み込みしたい場合
    reload: function() {
      // 既存マーカーをクリアして再取得
      Object.keys(_candidateMarkers).forEach(function(id) { _removeCandidateMarker(id); });
      _candidatesLoaded = false;
      loadExistingCandidates();
    }
  };

})();

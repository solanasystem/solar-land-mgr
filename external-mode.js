/* ===================================================================
   external-mode.js - 限定編集モード v1.0 (2026-06-27)
   ===================================================================
   役割:
     1. common-auth.js セット済みの window.__auth.isExternal() を確認
     2. external ロールなら、body.external-mode を付与し、編集UIを抑止
     3. Supabase クライアントの update/delete メソッドを Hook して block
        ※ INSERT は許可する（追加は可能）
     4. 限定編集モードバナーを画面最上部に表示
   配置: 各HTMLの <head> 内、common-auth.js より後に
         <script src="external-mode.js"></script>
   注:
     - クライアント側の防御です。完全防御には Supabase RLS が必要
     - common-auth.js が external ロール以外なら何もせず終了
     - external = 閲覧＋追加OK、修正・削除・NG登録は不可
     - 印刷ボタンは表示する
     - CSV/Excel/PDFエクスポートは非表示
   =================================================================== */

(function() {
  'use strict';

  // common-auth.js が動いていない、または external 以外なら何もしない
  if (!window.__auth || typeof window.__auth.isExternal !== 'function') return;
  if (!window.__auth.isExternal()) return;

  // ============================================================
  // Step 1: Supabase クライアントの update/delete/upsert を hook
  //   ※ INSERT は許可（追加は可能）
  // ============================================================
  function hookSupabaseWrites() {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      setTimeout(hookSupabaseWrites, 200);
      return;
    }
    if (window.supabase.__externalHooked) return;
    window.supabase.__externalHooked = true;

    var origCreate = window.supabase.createClient;
    window.supabase.createClient = function() {
      var client = origCreate.apply(this, arguments);
      var origFrom = client.from.bind(client);
      client.from = function(table) {
        var qb = origFrom(table);
        // QueryBuilder の update/delete/upsert メソッドのみ置換
        // INSERT は許可
        ['update', 'delete', 'upsert'].forEach(function(m) {
          if (typeof qb[m] === 'function') {
            qb[m] = function() {
              if (console && console.warn) {
                console.warn('[external-mode] BLOCKED: ' + m + '() on table "' + table + '"');
              }
              return Promise.resolve({
                data: null,
                error: { message: 'External mode: ' + m + ' is blocked (insert is allowed)', code: 'EXTERNAL_BLOCKED' }
              });
            };
          }
        });
        return qb;
      };
      // Storage の remove/move は block、upload は許可
      if (client.storage && typeof client.storage.from === 'function') {
        var origStorageFrom = client.storage.from.bind(client.storage);
        client.storage.from = function(bucket) {
          var sb = origStorageFrom(bucket);
          ['remove', 'move'].forEach(function(m) {
            if (typeof sb[m] === 'function') {
              sb[m] = function() {
                if (console && console.warn) {
                  console.warn('[external-mode] BLOCKED: storage.' + m + '() on bucket "' + bucket + '"');
                }
                return Promise.resolve({
                  data: null,
                  error: { message: 'External mode: storage ' + m + ' blocked', code: 'EXTERNAL_BLOCKED' }
                });
              };
            }
          });
          return sb;
        };
      }
      // rpc 経由の修正・削除も block（INSERTやcreate系は許可）
      var origRpc = client.rpc.bind(client);
      client.rpc = function(fnName, params) {
        // update/delete/remove は block、create/insert/save は許可
        var blockKeywords = /update|delete|remove|reset/i;
        if (typeof fnName === 'string' && blockKeywords.test(fnName)) {
          if (console && console.warn) {
            console.warn('[external-mode] BLOCKED: rpc("' + fnName + '")');
          }
          return Promise.resolve({
            data: null,
            error: { message: 'External mode: rpc write blocked', code: 'EXTERNAL_BLOCKED' }
          });
        }
        return origRpc(fnName, params);
      };
      return client;
    };
  }

  hookSupabaseWrites();

  // ============================================================
  // Step 2: 限定編集モードバナーを表示
  // ============================================================
  function showBanner() {
    if (document.getElementById('externalBanner')) return;
    var profile = window.__auth.profile || {};
    var name = profile.display_name || profile.email || 'External';
    var banner = document.createElement('div');
    banner.id = 'externalBanner';
    banner.innerHTML =
      '\uD83D\uDCDD \u9650\u5B9A\u7DE8\u96C6\u30E2\u30FC\u30C9\uFF08\u95B2\u89A7\u30FB\u8FFD\u52A0\u306E\u307F\uFF09' +
      '<span class="external-user">\u30E6\u30FC\u30B6\u30FC: ' + escapeHtml(name) + '</span>' +
      '<button class="external-logout" onclick="window.__auth.logout()">\u30ED\u30B0\u30A2\u30A6\u30C8</button>';
    document.body.appendChild(banner);
    document.body.classList.add('has-external-banner');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ============================================================
  // Step 3: 編集系UIを識別して非表示クラス付与
  // INSERT/追加系は許可、UPDATE/DELETE/NG登録/エクスポートは非表示
  // ============================================================

  // テキストでマッチする禁止ボタンのキーワード（修正・削除・NG・エクスポート系）
  var TEXT_BLOCK_KEYWORDS = [
    '\u7BC4\u56F2NG',                                      // 範囲NG
    'NG\u5224\u5B9A',                                      // NG判定
    'NG\u767B\u9332',                                      // NG登録
    '\u30A2\u30D7\u30ED\u30FC\u30C1',                      // アプローチ
    '\u6253\u8A3A',                                        // 打診
    '\u30EA\u30BB\u30C3\u30C8',                            // リセット
    '\u4FDD\u5B58',                                        // 保存
    '\u524A\u9664',                                        // 削除
    '\u7DE8\u96C6',                                        // 編集
    '\u78BA\u8A8D\u7D42\u4E86',                            // 確認終了
    '\u8A2A\u554F\u5B8C\u4E86',                            // 訪問完了
    '\u30A8\u30AF\u30BB\u30EB\u51FA\u529B',                // エクセル出力
    'PDF\u51FA\u529B',                                     // PDF出力
    'CSV\u51FA\u529B',                                     // CSV出力
    'CSV\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9',             // CSVダウンロード
    'Excel\u51FA\u529B',                                   // Excel出力
    '\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8',                // エクスポート
    'AI\u81EA\u52D5\u5224\u5B9A',                          // AI自動判定（修正系）
    '\u4ECA\u65E5\u306E\u30C7\u30FC\u30BF\u53D6\u5F97',   // 今日のデータ取得（一括処理）
    '\u4E00\u62EC\u5224\u5B9A',                            // 一括判定
    '\u6848\u4EF6\u6602\u683C',                            // 案件昇格（status変更）
    '\uD83D\uDCC4',                                        // 📄（PDF/エクスポート）
    '\uD83D\uDCCA',                                        // 📊（Excel/CSV）
    '\uD83D\uDEAB',                                        // 🚫（NG）
    '\uD83D\uDDD1',                                        // 🗑（削除）
    '\u270F\uFE0F'                                         // ✏️（編集）
  ];

  // 許可ボタン（除外リスト）— 印刷・新規追加・閲覧系は残す
  var TEXT_ALLOW_KEYWORDS = [
    '\u5370\u5237',                           // 印刷 ✅
    '\u65B0\u898F\u8FFD\u52A0',               // 新規追加 ✅
    '\u8FFD\u52A0',                           // 追加 ✅
    '\u65B0\u898F',                           // 新規 ✅
    '\u8A2A\u554F\u8A18\u9332',               // 訪問記録 ✅（INSERTのみ）
    '\u8A2A\u554F\u4E88\u5B9A',               // 訪問予定 ✅
    '\u8A2A\u554F\u958B\u59CB',               // 訪問開始 ✅
    '\u8ABF\u67FB\u958B\u59CB',               // 調査開始 ✅
    '\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9',   // アップロード ✅
    '\u30B3\u30E1\u30F3\u30C8\u4FDD\u5B58',   // コメント保存 ✅（INSERT）
    '\u691C\u7D22',                           // 検索
    '\u30D5\u30A3\u30EB\u30BF\u30FC',         // フィルター
    '\u8A2A\u554F\u30DE\u30C3\u30D7',         // 訪問マップ
    '\u73FE\u5730\u8ABF\u67FB',               // 現地調査（ナビ）
    '\u5909\u5316\u30C8\u30E9\u30C3\u30AB\u30FC', // 変化トラッカー（ナビ）
    '\u958B\u62D3\u5019\u88DC',               // 開拓候補（ナビ）
    '\u6848\u4EF6\u4E00\u89A7',               // 案件一覧（ナビ）
    '\u672A\u6765\u306E\u8FB2\u5730',         // 未来の農地（外部リンク）
    'Google\u30DE\u30C3\u30D7',               // Googleマップ
    'eMAFF',                                  // eMAFF（外部リンク）
    '\u30ED\u30B0\u30A2\u30A6\u30C8'          // ログアウト
  ];

  // onclick 属性ベースの危険関数名（修正・削除・エクスポート系）
  var ONCLICK_BLOCK_PATTERNS = [
    /\bupdate\b/i, /\bdelete\b/i, /\bremove\b/i,
    /\bpromote\b/i, /toggleNg/i, /markAsNg/i,
    /runAIJudge/i, /runBatch/i,
    /\bsetStatus\b/i, /removeCase/i,
    /exportCsv/i, /exportExcel/i, /exportPdf/i,
    /downloadCsv/i, /downloadExcel/i, /downloadPdf/i,
    /\btriggerManualCollection\b/i,
    /resetData/i, /resetAll/i, /clearAll/i,
    /editCase/i, /editLandowner/i, /editLandInfo/i
  ];

  function shouldBlockByText(text) {
    if (!text) return false;
    text = text.trim();
    // 許可リスト優先
    for (var i = 0; i < TEXT_ALLOW_KEYWORDS.length; i++) {
      if (text.indexOf(TEXT_ALLOW_KEYWORDS[i]) >= 0) return false;
    }
    for (var j = 0; j < TEXT_BLOCK_KEYWORDS.length; j++) {
      if (text.indexOf(TEXT_BLOCK_KEYWORDS[j]) >= 0) return true;
    }
    return false;
  }

  function shouldBlockByOnclick(onclickAttr) {
    if (!onclickAttr) return false;
    for (var i = 0; i < ONCLICK_BLOCK_PATTERNS.length; i++) {
      if (ONCLICK_BLOCK_PATTERNS[i].test(onclickAttr)) return true;
    }
    return false;
  }

  function hideEditUI(root) {
    root = root || document.body;
    if (!root || !root.querySelectorAll) return;

    // 1. <button> をテキストで判定
    var buttons = root.querySelectorAll('button:not(.external-checked)');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.classList.add('external-checked');
      var text = btn.textContent || '';
      if (shouldBlockByText(text)) {
        btn.classList.add('external-hide');
        continue;
      }
      var onclickAttr = btn.getAttribute('onclick') || '';
      if (shouldBlockByOnclick(onclickAttr)) {
        btn.classList.add('external-hide');
      }
    }

    // 2. onclick 属性付き要素全般
    var clickables = root.querySelectorAll('[onclick]:not(.external-checked-onclick)');
    for (var k = 0; k < clickables.length; k++) {
      var el = clickables[k];
      el.classList.add('external-checked-onclick');
      var oc = el.getAttribute('onclick') || '';
      if (shouldBlockByOnclick(oc)) {
        if (/location\.href/i.test(oc) || /window\.open/i.test(oc)) continue;
        el.classList.add('external-hide');
      }
    }

    // 3. 既存データの編集禁止：既存行の入力フィールドを readonly に
    // ただし、新規追加フォーム内のフィールドは編集可能にする
    var inputs = root.querySelectorAll(
      'input:not(.external-checked-input):not([type="hidden"]):not([type="search"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]),' +
      'textarea:not(.external-checked-input)'
    );
    for (var m = 0; m < inputs.length; m++) {
      var inp = inputs[m];
      inp.classList.add('external-checked-input');
      
      // 新規追加フォーム内（add-form, new-form, create-form）は編集可能
      var isInAddForm = inp.closest && inp.closest(
        '.add-form, .new-form, .create-form, [data-form-mode="add"], [data-form-mode="new"], #addModal, #newModal, #createModal'
      );
      if (isInAddForm) continue;

      // 検索・フィルター用 input は残す
      var ph = inp.placeholder || '';
      var id = inp.id || '';
      var cls = inp.className || '';
      var isSearch =
        /\u691C\u7D22|search|filter|\u30D5\u30A3\u30EB\u30BF/i.test(ph + ' ' + id + ' ' + cls) ||
        inp.closest && inp.closest('.filter-bar, .chiban-search, .search-bar');
      if (isSearch) continue;

      // 既存データを表示している inline-edit 系は readonly
      var isInlineEdit = /inline-edit|cell-edit|row-edit/i.test(cls + ' ' + id);
      if (isInlineEdit) {
        inp.setAttribute('readonly', 'readonly');
        inp.classList.add('external-readonly');
      }
    }

    // 4. select 要素（既存データの編集用は無効化、新規追加・フィルター用は許可）
    var selects = root.querySelectorAll('select:not(.external-checked-select)');
    for (var n = 0; n < selects.length; n++) {
      var sel = selects[n];
      sel.classList.add('external-checked-select');

      // 新規追加フォーム内は許可
      var inAddForm = sel.closest && sel.closest(
        '.add-form, .new-form, .create-form, [data-form-mode="add"], [data-form-mode="new"], #addModal, #newModal, #createModal'
      );
      if (inAddForm) continue;

      // フィルター用 select は残す
      var sCls = sel.className || '';
      var sId = sel.id || '';
      var isFilter =
        /filter|sort|search|kubun-filter|status-filter|area-filter/i.test(sCls + ' ' + sId) ||
        sel.closest && sel.closest('.filter-bar, .toolbar, .filters');
      if (isFilter) continue;

      // 既存行の inline-edit / status-select / kubun-select は無効化
      var isInline = /inline-edit|status-select|kubun-select|cell-edit/i.test(sCls + ' ' + sId);
      if (isInline) {
        sel.disabled = true;
        sel.classList.add('external-readonly');
      }
    }

    // 5. contenteditable な要素
    var editables = root.querySelectorAll('[contenteditable="true"]:not(.external-checked-editable)');
    for (var p = 0; p < editables.length; p++) {
      var ed = editables[p];
      ed.classList.add('external-checked-editable');
      ed.setAttribute('contenteditable', 'false');
      ed.classList.add('external-readonly');
    }
  }

  // ============================================================
  // Step 4: 初期化と監視
  // ============================================================
  function init() {
    document.body.classList.add('external-mode');
    showBanner();
    hideEditUI(document.body);

    var pending = false;
    var observer = new MutationObserver(function(mutations) {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function() {
        pending = false;
        hideEditUI(document.body);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

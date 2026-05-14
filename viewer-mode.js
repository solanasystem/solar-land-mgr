/* ===================================================================
   viewer-mode.js - 閲覧専用モード v1.0 (2026-05-14)
   ===================================================================
   役割:
     1. common-auth.js セット済みの window.__auth.isViewer() を確認
     2. viewer ロールなら、body.viewer-mode を付与し、編集UIを抑止
     3. Supabase クライアントの write メソッドを Hook して block
     4. 閲覧専用バナーを画面最上部に表示
   配置: 各HTMLの <head> 内、common-auth.js より後に
         <script src="viewer-mode.js"></script>
   注:
     - クライアント側の防御です。完全防御には Supabase RLS が必要
     - common-auth.js が viewer ロール以外なら何もせず終了
   =================================================================== */

(function() {
  'use strict';

  // common-auth.js が動いていない、または viewer 以外なら何もしない
  if (!window.__auth || typeof window.__auth.isViewer !== 'function') return;
  if (!window.__auth.isViewer()) return;

  // ============================================================
  // Step 1: Supabase クライアントの write メソッドを hook
  //   - createClient を wrap して、戻り client の .from() を wrap
  //   - insert/update/delete/upsert を全て block
  //   - common-auth.js より後で読み込まれる Supabase インスタンスにも適用される
  // ============================================================
  function hookSupabaseWrites() {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      setTimeout(hookSupabaseWrites, 200);
      return;
    }
    if (window.supabase.__viewerHooked) return;
    window.supabase.__viewerHooked = true;

    var origCreate = window.supabase.createClient;
    window.supabase.createClient = function() {
      var client = origCreate.apply(this, arguments);
      var origFrom = client.from.bind(client);
      client.from = function(table) {
        var qb = origFrom(table);
        // QueryBuilder の write メソッドを置換
        ['insert', 'update', 'delete', 'upsert'].forEach(function(m) {
          if (typeof qb[m] === 'function') {
            qb[m] = function() {
              if (console && console.warn) {
                console.warn('[viewer-mode] BLOCKED: ' + m + '() on table "' + table + '"');
              }
              return Promise.resolve({
                data: null,
                error: { message: 'Viewer mode: write operations are blocked', code: 'VIEWER_BLOCKED' }
              });
            };
          }
        });
        // Storage の upload なども block するため、rpc も block
        return qb;
      };
      // Storage の uploadも block
      if (client.storage && typeof client.storage.from === 'function') {
        var origStorageFrom = client.storage.from.bind(client.storage);
        client.storage.from = function(bucket) {
          var sb = origStorageFrom(bucket);
          ['upload', 'remove', 'move', 'copy', 'createSignedUploadUrl'].forEach(function(m) {
            if (typeof sb[m] === 'function') {
              sb[m] = function() {
                if (console && console.warn) {
                  console.warn('[viewer-mode] BLOCKED: storage.' + m + '() on bucket "' + bucket + '"');
                }
                return Promise.resolve({
                  data: null,
                  error: { message: 'Viewer mode: storage write blocked', code: 'VIEWER_BLOCKED' }
                });
              };
            }
          });
          return sb;
        };
      }
      // rpc 経由の書き込みも block（compute_xxx など読み取り系は通したいので、
      // rpc 名に "create/update/delete/insert/save" を含むもののみ block）
      var origRpc = client.rpc.bind(client);
      client.rpc = function(fnName, params) {
        var blockKeywords = /create|update|delete|insert|save|remove|set_|reset/i;
        if (typeof fnName === 'string' && blockKeywords.test(fnName)) {
          if (console && console.warn) {
            console.warn('[viewer-mode] BLOCKED: rpc("' + fnName + '")');
          }
          return Promise.resolve({
            data: null,
            error: { message: 'Viewer mode: rpc write blocked', code: 'VIEWER_BLOCKED' }
          });
        }
        return origRpc(fnName, params);
      };
      return client;
    };
  }

  hookSupabaseWrites();

  // ============================================================
  // Step 2: 閲覧専用バナーを表示
  // ============================================================
  function showBanner() {
    if (document.getElementById('viewerBanner')) return;
    var profile = window.__auth.profile || {};
    var name = profile.display_name || profile.email || 'Viewer';
    var banner = document.createElement('div');
    banner.id = 'viewerBanner';
    banner.innerHTML =
      '\uD83D\uDCD6 \u95B2\u89A7\u5C02\u7528\u30E2\u30FC\u30C9' +
      '<span class="viewer-user">\u30E6\u30FC\u30B6\u30FC: ' + escapeHtml(name) + '</span>' +
      '<button class="viewer-logout" onclick="window.__auth.logout()">\u30ED\u30B0\u30A2\u30A6\u30C8</button>';
    document.body.appendChild(banner);
    document.body.classList.add('has-viewer-banner');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ============================================================
  // Step 3: 編集系UIを識別して非表示クラス付与
  // ============================================================

  // テキストでマッチする編集ボタンのキーワード
  var TEXT_BLOCK_KEYWORDS = [
    '\u4ECA\u65E5\u306E\u30C7\u30FC\u30BF\u53D6\u5F97',   // 今日のデータ取得
    'AI\u81EA\u52D5\u5224\u5B9A',                          // AI自動判定
    '\u7BC4\u56F2NG',                                      // 範囲NG
    'NG\u5224\u5B9A',                                      // NG判定
    '\u6848\u4EF6\u6602\u683C',                            // 案件昇格
    '\u30A2\u30D7\u30ED\u30FC\u30C1',                      // アプローチ
    '\u6253\u8A3A',                                        // 打診
    '\u30EA\u30BB\u30C3\u30C8',                            // リセット
    '\u4FDD\u5B58',                                        // 保存
    '\u524A\u9664',                                        // 削除
    '\u7DE8\u96C6',                                        // 編集
    '\u8FFD\u52A0',                                        // 追加
    '\u65B0\u898F',                                        // 新規
    '\u8A2A\u554F\u8A18\u9332',                            // 訪問記録
    '\u8A2A\u554F\u4E88\u5B9A',                            // 訪問予定
    '\u78BA\u8A8D\u7D42\u4E86',                            // 確認終了
    '\u8ABF\u67FB\u958B\u59CB',                            // 調査開始
    '\u8A2A\u554F\u958B\u59CB',                            // 訪問開始
    '\u8A2A\u554F\u5B8C\u4E86',                            // 訪問完了
    '\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9',                // アップロード
    '\u30A4\u30F3\u30DD\u30FC\u30C8',                      // インポート
    '\u4E00\u62EC\u53D6\u8FBC',                            // 一括取込
    '\u4E00\u62EC\u5224\u5B9A',                            // 一括判定
    '\u6271\u6307\u9054',                                  // 取扱
    '\u30B3\u30E1\u30F3\u30C8\u4FDD\u5B58',                // コメント保存
    '\u51FA\u7269',                                        // 出力（一部用途では残したい場合あり）
    '\uD83D\uDE80',                                        // 🚀（案件昇格アイコン）
    '\uD83D\uDCE5',                                        // 📥（データ取得）
    '\uD83E\uDD16',                                        // 🤖（AI自動判定）
    '\uD83D\uDEAB',                                        // 🚫（NG）
    '\uD83D\uDDD1'                                         // 🗑（削除）
  ];

  // 残しても良いボタン（除外リスト）— テキストにマッチしてもこちらを優先
  var TEXT_ALLOW_KEYWORDS = [
    '\u30A8\u30AF\u30BB\u30EB\u51FA\u529B',  // エクセル出力
    'PDF\u51FA\u529B',                        // PDF出力
    '\u5370\u5237',                           // 印刷
    'CSV',                                    // CSV
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

  // onclick 属性ベースの危険関数名
  var ONCLICK_BLOCK_PATTERNS = [
    /save\b/i, /update\b/i, /delete\b/i, /insert\b/i,
    /promote\b/i, /toggleNg/i, /markAsNg/i, /addCase/i,
    /triggerManualCollection/i, /runAIJudge/i, /runBatch/i,
    /uploadPhoto/i, /uploadFile/i, /createCase/i, /editCase/i,
    /\bsetStatus\b/i, /removeCase/i
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
    var buttons = root.querySelectorAll('button:not(.viewer-checked)');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.classList.add('viewer-checked');
      var text = btn.textContent || '';
      if (shouldBlockByText(text)) {
        btn.classList.add('viewer-hide');
        continue;
      }
      var onclickAttr = btn.getAttribute('onclick') || '';
      if (shouldBlockByOnclick(onclickAttr)) {
        btn.classList.add('viewer-hide');
      }
    }

    // 2. onclick 属性付き要素全般（button 以外も含む）
    var clickables = root.querySelectorAll('[onclick]:not(.viewer-checked-onclick)');
    for (var k = 0; k < clickables.length; k++) {
      var el = clickables[k];
      el.classList.add('viewer-checked-onclick');
      var oc = el.getAttribute('onclick') || '';
      if (shouldBlockByOnclick(oc)) {
        // ボタン以外の要素もある（icon, span, div など）
        // ナビゲーション系（location.href へのものなど）はブロックしない
        if (/location\.href/i.test(oc) || /window\.open/i.test(oc)) continue;
        el.classList.add('viewer-hide');
      }
    }

    // 3. input/textarea を readonly に
    var inputs = root.querySelectorAll(
      'input:not(.viewer-checked-input):not([type="hidden"]):not([type="search"]):not([type="checkbox"]):not([type="radio"]),' +
      'textarea:not(.viewer-checked-input)'
    );
    for (var m = 0; m < inputs.length; m++) {
      var inp = inputs[m];
      inp.classList.add('viewer-checked-input');
      var type = (inp.type || '').toLowerCase();
      if (type === 'submit' || type === 'button' || type === 'reset') {
        inp.classList.add('viewer-hide');
        continue;
      }
      // 検索・フィルター用 input は残す
      var ph = inp.placeholder || '';
      var id = inp.id || '';
      var cls = inp.className || '';
      var isSearch =
        /\u691C\u7D22|search|filter|\u30D5\u30A3\u30EB\u30BF/i.test(ph + ' ' + id + ' ' + cls) ||
        inp.closest && inp.closest('.filter-bar, .chiban-search, .search-bar');
      if (isSearch) continue;
      inp.setAttribute('readonly', 'readonly');
      inp.classList.add('viewer-readonly');
    }

    // 4. select 要素 (フィルター用以外を無効化)
    var selects = root.querySelectorAll('select:not(.viewer-checked-select)');
    for (var n = 0; n < selects.length; n++) {
      var sel = selects[n];
      sel.classList.add('viewer-checked-select');
      // フィルター用 select は残す
      var sCls = sel.className || '';
      var sId = sel.id || '';
      var isFilter =
        /filter|sort|search|kubun-filter|status-filter|area-filter/i.test(sCls + ' ' + sId) ||
        sel.closest && sel.closest('.filter-bar, .toolbar, .filters');
      if (isFilter) continue;
      // 編集用ドロップダウンは無効化
      sel.disabled = true;
      sel.classList.add('viewer-readonly');
    }

    // 5. contenteditable な要素
    var editables = root.querySelectorAll('[contenteditable="true"]:not(.viewer-checked-editable)');
    for (var p = 0; p < editables.length; p++) {
      var ed = editables[p];
      ed.classList.add('viewer-checked-editable');
      ed.setAttribute('contenteditable', 'false');
      ed.classList.add('viewer-readonly');
    }
  }

  // ============================================================
  // Step 4: 初期化と監視
  // ============================================================
  function init() {
    document.body.classList.add('viewer-mode');
    showBanner();
    hideEditUI(document.body);

    // 動的に追加される要素にも対応（debounce 付き）
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

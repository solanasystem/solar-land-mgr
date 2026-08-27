/* ===================================================================
   common-auth.js - 権限管理共通スニペット v1.2 (2026-05-15)
   ===================================================================
   配置: 各HTMLの <head> 内、他のスクリプトより先に
         <script src="common-auth.js"></script>
   役割:
     1. 同期チェック: localStorage.loginAt + userProfile の有効性確認
        無効/期限切れなら login.html へ即リダイレクト
     2. window.__auth グローバル: profile / role / 権限ヘルパー / Supabaseクライアント
     3. 非同期再検証: ページ完全読込後、Supabase でセッション再確認
     4. mode-back.js を全ページに自動注入（戻るボタン共通化）
   注: login.html では本スクリプトを読み込まない
   --------------------------------------------------------------------
   v1.2 変更点 (2026-05-15):
     - 'external' ロール（社外パートナー）を許可ロールに追加
     - isExternal() ヘルパー追加
     - canManageUsers() 等は external を除外する形で維持
   v1.1 変更点 (2026-05-14):
     - window.__auth.sb ゲッターで Supabaseクライアントを公開（遅延初期化）
     - mode-back.js の自動注入を追加
     - asyncVerify() と logout() がクライアント再利用するようリファクタ
   =================================================================== */
(function() {
  'use strict';

  // login.html ではガードしない（無限リダイレクト防止）
  var path = (location.pathname || '') + (location.hash || '');
  if (path.indexOf('login.html') !== -1) return;

  // ============================================================
  // 設定
  // ============================================================
  var SESSION_MAX_MS    = 7 * 24 * 60 * 60 * 1000; // 7日
  var SUPABASE_URL      = 'https://fygnrjjifoasozbhkxlk.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5Z25yamppZm9hc296YmhreGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MDYzNTEsImV4cCI6MjA5MDE4MjM1MX0.A1fAMcu7wGBBP4xHUKkrExIuy7MFbmarAtLQahwZiso';

  // v1.2: 許可ロール一覧（externalを追加）
  var ALLOWED_ROLES = ['admin', 'manager', 'viewer', 'external', 'partner'];

  // ★メンテナンスロック (2026-08-10): オーナー以外はログイン不可。
  //   解除するには MAINTENANCE_OWNER_ONLY を false にする（1箇所）。
  var MAINTENANCE_OWNER_ONLY = true;
  var OWNER_EMAILS = ['takumi.kurimoto@gmail.com'];
  function isOwner(email) {
    return !!email && OWNER_EMAILS.indexOf(String(email).trim().toLowerCase()) !== -1;
  }
  // メンテナンス中でもアプリ利用を許可するメール（login.htmlのMAINTENANCE_ALLOW_EMAILSと一致させる。
  // 2026-08-13修正: 従来ここはisOwner(takumiのみ)判定で、login.htmlで許可した黒木さん九州が
  // ログイン後にcommon-auth.jsで弾かれていた。両ファイルの許可リストを揃える。）
  var MAINTENANCE_ALLOW_EMAILS = ['takumi.kurimoto@gmail.com', 'yumi.kurogi117@gmail.com'];
  function isMaintenanceAllowed(email) {
    return !!email && MAINTENANCE_ALLOW_EMAILS.indexOf(String(email).trim().toLowerCase()) !== -1;
  }

  // ★個別許可(partner/external遮断の例外) — 重複ファイル台帳グループ5(2026-08-25共通化)。
  //   role=partner/external でも個別に機能を解放したい人をここに追加する。
  //   従来は各ページ(farmland-tracker.html等)がメールアドレスを個別にハードコードしており、
  //   新しいページを作るたびに例外の書き忘れ(=黒木さんが締め出される)が繰り返し発生していた。
  //   このリストを見るだけで「誰が何のために例外か」が一箇所で分かるようにする。
  var INDIVIDUAL_PARTNER_EXEMPT_EMAILS = [
    'yumi.kurogi117@gmail.com' // 黒木さん(九州): 農地トラッカー系ページを個別許可(2026-08-11〜)
  ];
  function isIndividuallyExemptEmail(email) {
    return !!email && INDIVIDUAL_PARTNER_EXEMPT_EMAILS.indexOf(String(email).trim().toLowerCase()) !== -1;
  }

  // ============================================================
  // ヘルパー
  // ============================================================
  function bailToLogin(reason) {
    try {
      localStorage.removeItem('loginAt');
      localStorage.removeItem('userProfile');
    } catch (e) {}
    if (console && console.warn) console.warn('[common-auth]', reason || 'redirect to login.html');
    location.replace('login.html');
  }

  // ============================================================
  // Step 1: 同期チェック（localStorage キャッシュ）
  // ============================================================
  var loginAt    = parseInt(localStorage.getItem('loginAt') || '0', 10);
  var profileStr = localStorage.getItem('userProfile');
  var now        = Date.now();

  if (!loginAt || !profileStr || (now - loginAt > SESSION_MAX_MS)) {
    bailToLogin('Session missing or expired');
    throw new Error('GRID LAND MGR: Authentication required');
  }

  var profile;
  try {
    profile = JSON.parse(profileStr);
  } catch (e) {
    bailToLogin('Profile JSON parse failed');
    throw new Error('GRID LAND MGR: Profile parse failed');
  }

  if (!profile || !profile.role || !profile.id || !profile.organization_id) {
    bailToLogin('Profile invalid');
    throw new Error('GRID LAND MGR: Profile invalid');
  }

  if (ALLOWED_ROLES.indexOf(profile.role) === -1) {
    bailToLogin('Unknown role: ' + profile.role);
    throw new Error('GRID LAND MGR: Unknown role');
  }

  // ★メンテナンスロック（同期: キャッシュにemailがある場合は即弾く）
  if (MAINTENANCE_OWNER_ONLY && profile.email && !isMaintenanceAllowed(profile.email)) {
    bailToLogin('Maintenance: not in allow list');
    throw new Error('GRID LAND MGR: Maintenance owner-only');
  }

  // ============================================================
  // Step 2: window.__auth グローバル
  // ============================================================
  window.__auth = {
    profile:        profile,
    role:           profile.role,
    organizationId: profile.organization_id,
    isAdmin:        function() { return profile.role === 'admin'; },
    isManager:      function() { return profile.role === 'manager'; },
    isViewer:       function() { return profile.role === 'viewer'; },
    isExternal:     function() { return profile.role === 'external'; },
    isPartner:      function() { return profile.role === 'partner'; },
    // 個別許可(グループ5共通化): partner/external遮断ガードは、遮断する前に必ずこれを確認して除外すること。
    isIndividuallyExempt: function() { return isIndividuallyExemptEmail(profile.email); },
    canEdit:        function() { return profile.role === 'admin' || profile.role === 'manager'; },
    canDelete:      function() { return profile.role === 'admin' || profile.role === 'manager'; },
    canManageUsers: function() { return profile.role === 'admin'; },
    logout: function() {
      try {
        var sb = window.__auth.sb;
        if (sb && sb.auth) sb.auth.signOut();
      } catch (e) {}
      try {
        localStorage.removeItem('loginAt');
        localStorage.removeItem('userProfile');
      } catch (e) {}
      location.replace('login.html');
    },
    _sbCache: null
  };

  // ------------------------------------------------------------
  // Supabase クライアント公開（遅延初期化付き）
  // 初回アクセス時に作成し、以降はキャッシュ済みインスタンスを返す
  // supabase-js が未ロードの場合は null を返す（呼び出し側がポーリングで待機）
  // ------------------------------------------------------------
  Object.defineProperty(window.__auth, 'sb', {
    get: function() {
      if (this._sbCache) return this._sbCache;
      if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return null;
      this._sbCache = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return this._sbCache;
    },
    configurable: true
  });

  // ============================================================
  // 追加機能: mode-back.js を全ページに自動注入
  // mode-back.js 側で除外ページ判定済み（login/index/mode-select 等）
  // ============================================================
  (function injectBackButton() {
    // 既に挿入済み（手動 <script> タグ）の場合はスキップ
    if (document.querySelector('script[src$="mode-back.js"]')) return;
    var s = document.createElement('script');
    s.src = 'mode-back.js';
    s.async = true;
    document.head.appendChild(s);
  })();

  // ============================================================
  // Step 3: 非同期再検証（ページ完全読込後）
  // ============================================================
  function asyncVerify(retries) {
    if (typeof retries === 'undefined') retries = 0;
    if (retries > 30) return; // ~6秒待ってもSDKロードしない場合は諦める

    var sb = window.__auth.sb;
    if (!sb) {
      setTimeout(function() { asyncVerify(retries + 1); }, 200);
      return;
    }

    try {
      sb.auth.getSession().then(function(res) {
        var session = res && res.data && res.data.session;
        if (!session) {
          window.__auth.logout();
          return;
        }
        // セッションIDがプロファイルと一致するか
        if (session.user.id !== profile.id) {
          window.__auth.logout();
          return;
        }
        // プロファイルを再取得
        sb.from('profiles')
          .select('id, role, organization_id, display_name, email')
          .eq('id', session.user.id)
          .single()
          .then(function(res2) {
            var newProfile = res2 && res2.data;
            if (!newProfile) {
              window.__auth.logout();
              return;
            }
            // ★メンテナンスロック（非同期: 認証セッションのemail優先＝profiles.emailがnullでもオーナーを誤ロックしない。既存セッションも弾く）
            if (MAINTENANCE_OWNER_ONLY && !isMaintenanceAllowed((session.user && session.user.email) || newProfile.email)) {
              window.__auth.logout();
              return;
            }
            // ロール変更検出
            if (newProfile.role !== profile.role) {
              localStorage.setItem('userProfile', JSON.stringify(newProfile));
              location.reload();
              return;
            }
            // 差分更新
            localStorage.setItem('userProfile', JSON.stringify(newProfile));
            window.__auth.profile = newProfile;
          })
          .catch(function(e) {
            if (console && console.warn) console.warn('[common-auth] profile fetch failed:', e);
          });
      }).catch(function(e) {
        if (console && console.warn) console.warn('[common-auth] session fetch failed:', e);
      });
    } catch (e) {
      if (console && console.warn) console.warn('[common-auth] verify init failed:', e);
    }
  }

  if (document.readyState === 'complete') {
    asyncVerify();
  } else {
    window.addEventListener('load', function() { asyncVerify(); });
  }

  // AI学習ボタン＋SW記録の緑ポップアップ（全ページ共通・1本を読込＝コピペ複製禁止 INDEX§0）
  try {
    if (!document.querySelector('script[data-ai-learn-hook]')) {
      var _alh = document.createElement('script');
      _alh.src = 'ai-learn-hook.js?v=20260827b';
      _alh.setAttribute('data-ai-learn-hook', '1');
      _alh.defer = true;
      (document.head || document.documentElement).appendChild(_alh);
    }
  } catch (e) {}

})();

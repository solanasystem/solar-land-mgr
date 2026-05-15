/**
 * settings-helper.js
 * Version: 20260515a
 *
 * ユーザー別設定（可視性・色）と組織共通ステータス色を
 * 全画面に適用する共通モジュール。
 *
 * === 使い方 ===
 * 1) Supabase クライアント初期化後に読み込む
 *    <script src="settings-helper.js"></script>
 *
 * 2) 各画面の初期化時に呼ぶ
 *    await window.UserSettings.loadAndApply();
 *
 * 3) 各HTML要素に data-item-key="landowner_name" を付けると
 *    自動で可視性 + 色が反映される
 *
 * 4) ステータス表示要素には data-status-key="ok" を付ける
 *
 * 5) data-color-target="background" / "border" / "color"（既定）で
 *    色の適用先を指定可能
 *
 * === 例 ===
 * <span data-item-key="landowner_name" data-color-target="color">山田太郎</span>
 * <div data-status-key="ok" data-color-target="background">OK</div>
 */
(function() {
  'use strict';

  window.UserSettings = {
    visibility:    {}, // { item_key: bool }
    colors:        {}, // { item_key: '#hex' }
    canEditColor:  {}, // { item_key: bool }
    statusColors:  {}, // { status_key: '#hex' }
    userId:        null,
    organizationId:null,
    role:          null,
    loaded:        false,
  };

  // ────────────────────────────────────────
  // Supabase クライアント取得（既存パターンに対応）
  // ────────────────────────────────────────
  function getSupabase() {
    if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
      return window.supabaseClient;
    }
    if (window.supabase && typeof window.supabase.from === 'function') {
      return window.supabase;
    }
    if (window._supabase && typeof window._supabase.from === 'function') {
      return window._supabase;
    }
    return null;
  }

  // ────────────────────────────────────────
  // 設定読み込み（DB から）
  // ────────────────────────────────────────
  async function loadSettings() {
    const sb = getSupabase();
    if (!sb) {
      console.warn('[settings-helper] Supabase client not found. Skip loading.');
      return false;
    }

    try {
      const { data: userResp, error: uErr } = await sb.auth.getUser();
      if (uErr || !userResp || !userResp.user) {
        console.warn('[settings-helper] Not authenticated.');
        return false;
      }
      const user = userResp.user;
      window.UserSettings.userId = user.id;

      // profile
      const { data: profile, error: pErr } = await sb
        .from('profiles')
        .select('organization_id, role')
        .eq('id', user.id)
        .maybeSingle();
      if (pErr) console.warn('[settings-helper] profile error', pErr);
      if (profile) {
        window.UserSettings.organizationId = profile.organization_id;
        window.UserSettings.role           = profile.role;
      }

      // visibility
      const { data: visRows } = await sb
        .from('user_visibility_settings')
        .select('item_key, is_visible')
        .eq('user_id', user.id);
      (visRows || []).forEach(r => {
        window.UserSettings.visibility[r.item_key] = r.is_visible;
      });

      // colors
      const { data: colRows } = await sb
        .from('user_color_settings')
        .select('item_key, color_hex, can_edit_color')
        .eq('user_id', user.id);
      (colRows || []).forEach(r => {
        window.UserSettings.colors[r.item_key]       = r.color_hex;
        window.UserSettings.canEditColor[r.item_key] = r.can_edit_color;
      });

      // org status colors
      if (window.UserSettings.organizationId) {
        const { data: stsRows } = await sb
          .from('org_status_colors')
          .select('status_key, color_hex')
          .eq('organization_id', window.UserSettings.organizationId);
        (stsRows || []).forEach(r => {
          window.UserSettings.statusColors[r.status_key] = r.color_hex;
        });
      }

      window.UserSettings.loaded = true;
      console.log('[settings-helper] Loaded.', {
        items: Object.keys(window.UserSettings.visibility).length,
        colors: Object.keys(window.UserSettings.colors).length,
        statusColors: Object.keys(window.UserSettings.statusColors).length,
      });
      return true;
    } catch (e) {
      console.error('[settings-helper] loadSettings failed', e);
      return false;
    }
  }

  // ────────────────────────────────────────
  // DOM 適用
  // ────────────────────────────────────────
  function applyToDOM(root) {
    if (!window.UserSettings.loaded) return;
    const scope = root || document;

    // item-key 要素
    scope.querySelectorAll('[data-item-key]').forEach(el => {
      const key = el.getAttribute('data-item-key');

      // 可視性
      if (window.UserSettings.visibility[key] === false) {
        el.style.display = 'none';
        el.setAttribute('data-hidden-by-settings', '1');
        return;
      } else if (el.getAttribute('data-hidden-by-settings') === '1') {
        el.style.display = '';
        el.removeAttribute('data-hidden-by-settings');
      }

      // 色
      const color = window.UserSettings.colors[key];
      if (color) {
        applyColor(el, color);
      }
    });

    // status-key 要素
    scope.querySelectorAll('[data-status-key]').forEach(el => {
      const key   = el.getAttribute('data-status-key');
      const color = window.UserSettings.statusColors[key];
      if (color) {
        // ステータスは既定で背景色（バッジ表示用途を想定）
        applyColor(el, color, 'background');
      }
    });
  }

  function applyColor(el, color, defaultTarget) {
    const target = el.getAttribute('data-color-target') || defaultTarget || 'color';
    if (target === 'background')      el.style.backgroundColor = color;
    else if (target === 'border')     el.style.borderColor     = color;
    else if (target === 'fill')       el.style.fill            = color;
    else                              el.style.color           = color;
  }

  // ────────────────────────────────────────
  // 公開 API
  // ────────────────────────────────────────
  window.UserSettings.load = loadSettings;
  window.UserSettings.apply = applyToDOM;

  window.UserSettings.loadAndApply = async function(root) {
    const ok = await loadSettings();
    if (ok) applyToDOM(root);
    return ok;
  };

  window.UserSettings.isVisible = function(itemKey) {
    return window.UserSettings.visibility[itemKey] !== false;
  };

  window.UserSettings.getColor = function(itemKey, fallback) {
    return window.UserSettings.colors[itemKey] || fallback || '#3B82F6';
  };

  window.UserSettings.getStatusColor = function(statusKey, fallback) {
    return window.UserSettings.statusColors[statusKey] || fallback || '#9CA3AF';
  };

  window.UserSettings.canEdit = function(itemKey) {
    return window.UserSettings.canEditColor[itemKey] === true;
  };

  // 動的に追加された要素にも適用したい場合用
  window.UserSettings.applyTo = function(rootEl) {
    applyToDOM(rootEl);
  };

})();

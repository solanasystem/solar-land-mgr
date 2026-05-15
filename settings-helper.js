/**
 * settings-helper.js v2 (2026-05-15)
 *
 * ユーザー別設定（可視性・色）と組織共通ステータス色を
 * 全画面に適用する共通モジュール。
 *
 * 前提: common-auth.js が先に読み込まれており、
 *       window.__auth が利用可能であること。
 *
 * === 使い方 ===
 * 1) Supabase UMD と common-auth.js 読み込み後に本ファイルを読み込む
 *    <script src="common-auth.js"></script>
 *    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
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
 * 5) data-color-target="background" / "border" / "color" / "fill"（既定: color）で
 *    色の適用先を指定可能
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
  // Supabase クライアント取得（common-auth.js 経由）
  // ────────────────────────────────────────
  function getSupabase() {
    if (window.__auth && window.__auth.sb) return window.__auth.sb;
    return null;
  }

  function getProfile() {
    return window.__auth ? window.__auth.profile : null;
  }

  // ────────────────────────────────────────
  // 設定読み込み（DB から）
  // ────────────────────────────────────────
  async function loadSettings() {
    const profile = getProfile();
    if (!profile) {
      console.warn('[settings-helper] window.__auth not ready. common-auth.js が先に読み込まれているか確認してください。');
      return false;
    }

    const sb = getSupabase();
    if (!sb) {
      console.warn('[settings-helper] Supabase client not ready.');
      return false;
    }

    window.UserSettings.userId         = profile.id;
    window.UserSettings.organizationId = profile.organization_id;
    window.UserSettings.role           = profile.role;

    try {
      // visibility
      const { data: visRows, error: vErr } = await sb
        .from('user_visibility_settings')
        .select('item_key, is_visible')
        .eq('user_id', profile.id);
      if (vErr) console.warn('[settings-helper] visibility error', vErr);
      (visRows || []).forEach(r => {
        window.UserSettings.visibility[r.item_key] = r.is_visible;
      });

      // colors
      const { data: colRows, error: cErr } = await sb
        .from('user_color_settings')
        .select('item_key, color_hex, can_edit_color')
        .eq('user_id', profile.id);
      if (cErr) console.warn('[settings-helper] colors error', cErr);
      (colRows || []).forEach(r => {
        window.UserSettings.colors[r.item_key]       = r.color_hex;
        window.UserSettings.canEditColor[r.item_key] = r.can_edit_color;
      });

      // org status colors
      const { data: stsRows, error: sErr } = await sb
        .from('org_status_colors')
        .select('status_key, color_hex')
        .eq('organization_id', profile.organization_id);
      if (sErr) console.warn('[settings-helper] status error', sErr);
      (stsRows || []).forEach(r => {
        window.UserSettings.statusColors[r.status_key] = r.color_hex;
      });

      window.UserSettings.loaded = true;
      console.log('[settings-helper v2] Loaded.', {
        items:        Object.keys(window.UserSettings.visibility).length,
        colors:       Object.keys(window.UserSettings.colors).length,
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

    // item-key 要素: 可視性 + 色
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
      if (color) applyColor(el, color);
    });

    // status-key 要素: 組織共通ステータス色
    scope.querySelectorAll('[data-status-key]').forEach(el => {
      const key   = el.getAttribute('data-status-key');
      const color = window.UserSettings.statusColors[key];
      if (color) applyColor(el, color, 'background');
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

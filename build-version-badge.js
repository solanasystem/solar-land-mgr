/* build-version-badge.js — 全ページ共通のビルドバージョン表示(2026-09-05・INDEX§0重複複製禁止)。
   ドクター指示: 「常にバージョンが画面左上に表示、他のボタンと干渉しない場所を選べ」
   「これは、今後すべてのページでバージョンを出力する際の共通事項とせよ」。
   各ページが<head>等で window.__BUILD__='vYYYYMMDDx' を設定していれば、それを読んで
   画面左上に小さく常時表示する。未設定のページには何も出さない(現状値を偽装しない)。
   位置は「MODE SELECT」ボタン(mode-back.js、left:10px/top:10px/高さ約28px)の直下、
   left:2px/top:44pxに固定し、既存の左上固定UIと重ならないようにする。
   common-auth.jsからai-learn-hook.jsと同じパターンで自動注入される。 */
(function(){
  'use strict';
  function render(){
    if(!window.__BUILD__) return;
    if(document.getElementById('buildVerBadge')) return;
    var d=document.createElement('div');
    d.id='buildVerBadge';
    d.textContent=window.__BUILD__;
    d.style.cssText='position:fixed;left:2px;top:44px;z-index:2147483400;font-size:11px;'+
      'color:#e2e8f0;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:4px;pointer-events:none';
    (document.body||document.documentElement).appendChild(d);
  }
  if(document.body) render();
  else document.addEventListener('DOMContentLoaded', render);
})();

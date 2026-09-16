/* build-version-badge.js — 全ページ共通のビルドバージョン表示(2026-09-05・INDEX§0重複複製禁止)。
   v20260916d(ドクター「バージョン表示が3箇所あって統一しろ／ロゴ横のv3.0が書き換わらなければ変だ／左上は違和感」):
   ■ 唯一の正 = 各ページ先頭(<!DOCTYPE html>直後)の BUILD コメント
        <!-- BUILD: <ページ名> vYYYYMMDDx / 変更内容 … -->
     デプロイのたびに必ずこの1行を先頭へ追加する(既存慣行)。他の場所に版を書かない。
   ■ 表示 = ヘッダのロゴ横バッジ(.logo-version / .brand-version)の「v3.0」を、その版で書き換える。
     変更内容はバッジの title(ホバー)に入れる。緑の「BUILD: …」帯・左上の固定表示は廃止。
   ■ 読取順: ①先頭BUILDコメント ②window.__BUILD__(旧方式・残っているページ用) ③無ければ何もしない(偽装しない)。
   ■ ロゴ横バッジが無いページ(旧方式のページ)だけ、従来どおり左上(MODE SELECTの直下)に小さく出す。
   common-auth.jsからai-learn-hook.jsと同じパターンで自動注入される。 */
(function(){
  'use strict';
  var RE=/BUILD:\s*[^\s\/]+\s+(v\d{8}[a-z]*)\s*(?:\/\s*([\s\S]*?))?\s*$/;
  function readBuild(doc){
    doc=doc||document;
    // ① 先頭(<html>の外)のコメント。ページ先頭に置く慣行なので最初に見つかった1件を採用。
    var nodes=doc.childNodes;
    for(var i=0;i<nodes.length;i++){
      var n=nodes[i];
      if(n.nodeType===8){
        var m=RE.exec((n.nodeValue||'').trim());
        if(m) return {ver:m[1], desc:(m[2]||'').replace(/\s+/g,' ').trim()};
      }
      if(n.nodeType===1) break; // <html>に達したら終わり(本文中の古いBUILDコメントは見ない)
    }
    // ② 旧方式
    var w=(doc.defaultView||window);
    if(w.__BUILD__) return {ver:String(w.__BUILD__), desc:''};
    return null;
  }
  function render(){
    var b=readBuild(document);
    if(!b) return;
    var slot=document.querySelector('.logo-version, .brand-version');
    if(slot){
      slot.textContent=b.ver;
      if(b.desc) slot.title=b.desc;
      slot.setAttribute('data-build',b.ver);
      var old=document.getElementById('buildVerBadge'); if(old) old.parentNode.removeChild(old);
      return;
    }
    if(document.getElementById('buildVerBadge')) return;
    var d=document.createElement('div');
    d.id='buildVerBadge';
    d.textContent=b.ver; if(b.desc) d.title=b.desc;
    d.style.cssText='position:fixed;left:2px;top:44px;z-index:2147483400;font-size:11px;'+
      'color:#e2e8f0;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:4px;pointer-events:none';
    (document.body||document.documentElement).appendChild(d);
  }
  window.__readBuild=readBuild;
  if(document.body) render();
  else document.addEventListener('DOMContentLoaded', render);
})();

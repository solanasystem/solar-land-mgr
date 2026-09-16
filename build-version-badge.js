/* build-version-badge.js — 全ページ共通のビルドバージョン表示(2026-09-05・INDEX§0重複複製禁止)。
   v20260916e(ドクター「バージョンは必ず毎回の修正で変更されるようになっているのか／アドホックはやめろ」):
   ■ 唯一の正 = リポジトリ直下の build.json（GitHub Actions が main への push のたびに機械的に生成・コミット）
        {"build":"v<コミット日JST>-<短縮SHA>","commit":"…","date":"…","subject":"<コミット件名>"}
     人が版を書き足す運用に依存しない。push すれば必ず変わる。
   ■ 表示 = ヘッダのロゴ横バッジ(.logo-version / .brand-version)の「v3.0」を build.json の版で書き換える。
     ホバー(title)にコミット件名と、そのページ先頭の BUILD コメント(変更内容の補足)を出す。
   ■ フォールバック(build.json が取れない時＝ローカル/オフライン): ①ページ先頭の BUILD コメント ②window.__BUILD__。
     どれも無ければ何も出さない(偽装しない)。
   ■ ロゴ横バッジが無い旧ページだけ、左上(MODE SELECTの直下)に小さく出す。
   common-auth.jsからai-learn-hook.jsと同じパターンで自動注入される。 */
(function(){
  'use strict';
  var RE=/BUILD:\s*[^\s\/]+\s+(v\d{8}[a-z]*)\s*(?:\/\s*([\s\S]*?))?\s*$/;
  function readComment(doc){
    doc=doc||document;
    var nodes=doc.childNodes;
    for(var i=0;i<nodes.length;i++){
      var n=nodes[i];
      if(n.nodeType===8){
        var m=RE.exec((n.nodeValue||'').trim());
        if(m) return {ver:m[1], desc:(m[2]||'').replace(/\s+/g,' ').trim()};
      }
      if(n.nodeType===1) break; // <html>に達したら終わり(本文中の古いBUILDコメントは見ない)
    }
    return null;
  }
  function paint(ver,title,src){
    if(!ver) return;
    var slot=document.querySelector('.logo-version, .brand-version');
    if(slot){
      slot.textContent=ver;
      if(title) slot.title=title;
      slot.setAttribute('data-build',ver); slot.setAttribute('data-build-src',src||'');
      var old=document.getElementById('buildVerBadge'); if(old) old.parentNode.removeChild(old);
      return;
    }
    var d=document.getElementById('buildVerBadge');
    if(!d){
      d=document.createElement('div'); d.id='buildVerBadge';
      d.style.cssText='position:fixed;left:2px;top:44px;z-index:2147483400;font-size:11px;'+
        'color:#e2e8f0;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:4px;pointer-events:none';
      (document.body||document.documentElement).appendChild(d);
    }
    d.textContent=ver; if(title) d.title=title;
  }
  function render(){
    var c=readComment(document);
    var fallbackVer=(c&&c.ver)||(window.__BUILD__?String(window.__BUILD__):null);
    var pageNote=(c&&c.desc)?('このページ: '+c.ver+' '+c.desc):'';
    // まずフォールバックを即表示(build.json到着までの空白を作らない)、build.jsonが取れたら上書き
    if(fallbackVer) paint(fallbackVer, pageNote, 'comment');
    try{
      fetch('build.json?_='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(b){
        if(!b||!b.build) return;
        var t=(b.subject?('最新コミット: '+b.subject):'')+(b.date?('  ['+b.date+']'):'')+(pageNote?('\n'+pageNote):'');
        paint(b.build, t, 'build.json');
      }).catch(function(){});
    }catch(_){}
  }
  window.__readBuild=readComment;
  if(document.body) render();
  else document.addEventListener('DOMContentLoaded', render);
})();

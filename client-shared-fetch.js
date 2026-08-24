/* =========================================================
   client-shared-fetch.js
   クライアント向けページ共通のSupabaseページング取得ヘルパー
   - client-case-master.html / client-cases.html / client-delivery-map.html /
     client-letter.html / client-delivery.html で共有
   - 重複ファイル台帳グループ4(2026-08-25共通化)
   - select列・filter・order・client_idスコープの掛け方は各ページ固有のため統一しない。
     呼び出し側は「範囲(.range())以外を全て組み立てたクエリを返す関数」を渡すだけ。
   ========================================================= */
(function(global){
'use strict';

async function _fetchAllPaged(buildQuery){
  var all=[], from=0, size=1000;
  while(true){
    var res=await buildQuery().range(from,from+size-1);
    if(res.error)return{data:all,error:res.error};
    var rows=res.data||[]; all=all.concat(rows);
    if(rows.length<size)break; from+=size;
  }
  return{data:all,error:null};
}

global._fetchAllPaged = _fetchAllPaged;

})(window);

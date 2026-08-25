// ============================================================================
// client-judge.js — クライアント画面の「判定(OK/NG)」共通ロジック（複製せず1本化）
//   2026-08-25 ドクター指示(SUNトラスト報告③): マップで付けたOK/NGを案件マスターにも反映する。
//   判定の唯一の置き場 = case_proposals.judgment（'OK' / 'NG' / null=未判定）。
//   マップ・案件マスター・(将来)ステータス管理がこのモジュールを共有し、同じ1列を読み書きする。
//   ※ status(ステータス管理のカスタムステータス) とは別カラム＝混ぜない。
//   ※ 保存はここ(裏側)で行い、画面の色替え(発火)は各ページが「押した瞬間に先に」行う(楽観的更新)。
// ============================================================================
window.ClientJudge = (function(){
  // 判定 -> 円マーカー等のスタイル（マップの既存markerStyleForと同義。未判定=橙/OK=緑/NG=グレー）
  function styleFor(j){
    if(j==='OK') return {radius:6,color:'#166534',weight:1,fillColor:'#22c55e',fillOpacity:0.95};
    if(j==='NG') return {radius:6,color:'#4b5563',weight:1,fillColor:'#9ca3af',fillOpacity:0.85};
    return {radius:6,color:'#7a4a00',weight:1,fillColor:'#f59e0b',fillOpacity:0.95};
  }
  // 判定 -> 色（バッジ/ボタン用）
  function colorOf(j){ return j==='OK'?'#22c55e':(j==='NG'?'#9ca3af':'#8698bd'); }
  function labelOf(j){ return j==='OK'?'OK':(j==='NG'?'NG':'未判定'); }

  // クライアントの全判定を {case_id: 'OK'/'NG'} で取得
  async function loadMap(db, clientId){
    var m={};
    try{
      var r=await db.from('case_proposals').select('case_id,judgment').eq('client_id',clientId);
      if(r&&r.data) r.data.forEach(function(x){ if(x.judgment) m[x.case_id]=x.judgment; });
    }catch(e){}
    return m;
  }

  // 判定を保存（judgment=null なら未判定に戻す）。supabase-jsはerrorを例外化しないので明示thropする。
  async function save(db, clientId, caseId, judgment){
    var ex=await db.from('case_proposals').select('id').eq('case_id',caseId).eq('client_id',clientId).limit(1);
    if(ex&&ex.error) throw ex.error;
    var res;
    if(ex&&ex.data&&ex.data.length){
      res=await db.from('case_proposals').update({judgment:judgment,decided_at:new Date().toISOString()}).eq('id',ex.data[0].id);
    }else{
      res=await db.from('case_proposals').insert({case_id:caseId,client_id:clientId,judgment:judgment});
    }
    if(res&&res.error) throw res.error;
    return true;
  }

  return { styleFor:styleFor, colorOf:colorOf, labelOf:labelOf, loadMap:loadMap, save:save };
})();

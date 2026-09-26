/* delivery-round-utils.js
   納品の「第何回」「その回に予定している件数」を、毎回AIが手計算するのではなく
   DBの実データから機械的に算出する単一ロジック。
   - 「第N回」= client_deliveries(status='confirmed')の件数+1(次に確定する回)。
     delivered_at(無ければcreated_at)昇順で数える=nouhin-structure.htmlのROUND_NO_MAPと同じ基準。
   - 「予定件数」= round2_pool(status='reserve')の件数(=納品確定のたびにshippedへ切替わり自動的に差し引かれる)。
   ドクター指示(2026-09-09)「毎回、納品したら納品分を差し引いて、第何回分・その件数を表示しろ。
   AIの外出しでシステムへ実装しろ」への対応。nouhin-structure.html/gacho-layer.js双方から呼ぶ共通ロジックとし、
   同じ計算をコピペで複製しない。 */
async function getNextRoundInfo(db){
  var out={nextRound:null,poolReserve:null,confirmedCount:null,error:null};
  try{
    var d=await db.from('client_deliveries').select('id').eq('status','confirmed');
    if(d.error)throw new Error(d.error.message||String(d.error));
    out.confirmedCount=(d.data||[]).length;
    out.nextRound=out.confirmedCount+1;
  }catch(e){ out.error=e&&e.message||String(e); return out; }
  try{
    out.poolReserve=await getPoolReserveCount(db);
  }catch(_e){ out.poolReserve=null; }
  return out;
}

/* ===== 過去納品分(第N回ごとの納品済み位置)の「単一の正」 =====
   ドクター指示(2026-09-20)「今までに納品した場所は1つのタブにまとめ、第1回分・第2回分…をリストから選んで
   地図に表示したい(新しい場所を開拓する時、すでに開拓した場所がわかりダブらないように)」への対応。
   ・「第N回」の定義は上の getNextRoundInfo / nouhin-structure.html の ROUND_NO_MAP と同じ
     (client_deliveries.status='confirmed' を delivered_at(無ければcreated_at)昇順に並べた順番)。
   ・位置は client_delivery_items(status='confirmed')の lat/lng。確定するたびに自動で「第N+1回分」が増える(ハードコード禁止)。
   戻り値: [{no,id,period,notes,count,pts:[[lat,lng],...]}] (第1回から順)。失敗時は例外を投げる(呼び側で握る)。 */
async function getPastDeliveryRounds(db){
  var d=await db.from('client_deliveries').select('id,period,notes,status,delivered_at,created_at').eq('status','confirmed');
  if(d.error)throw new Error(d.error.message||String(d.error));
  var list=(d.data||[]).slice().sort(function(a,b){return String(a.delivered_at||a.created_at||'').localeCompare(String(b.delivered_at||b.created_at||''));});
  var rounds=list.map(function(x,i){ return {no:i+1,id:x.id,period:x.period||'',notes:x.notes||'',count:0,pts:[]}; });
  if(!rounds.length)return rounds;
  var byId={}; rounds.forEach(function(r){ byId[r.id]=r; });
  var ids=rounds.map(function(r){return r.id;});
  var frm=0;
  while(true){
    var r=await db.from('client_delivery_items').select('delivery_id,lat,lng').eq('status','confirmed').in('delivery_id',ids).order('id',{ascending:true}).range(frm,frm+999);
    if(r.error)throw new Error(r.error.message||String(r.error));
    var b=r.data||[];
    b.forEach(function(x){ var rd=byId[x.delivery_id]; if(rd&&x.lat!=null&&x.lng!=null)rd.pts.push([+x.lat,+x.lng]); });
    if(b.length<1000)break; frm+=1000; if(frm>50000)break;
  }
  rounds.forEach(function(r){ r.count=r.pts.length; });
  return rounds;
}

/* ===== 予備軍(round2_pool status=reserve)件数の「単一の正」＋変更通知バス =====
   ドクター指示(2026-09-16「根本的な改修をしておいてくれ、いつでも起こりうることだ」)への恒久対応。
   従来 round2_pool(reserve)を数える生クエリが gacho-layer.js / farmland-tracker-analysis.html /
   nouhin-structure.html に個別複製され、各表示が別々のキャッシュを手動で同期していたため、
   ある経路で書いても別表示が古い値のまま残りズレる事故(昇格しても(N)が増えない等)が起きていた。
   恒久ルール:
   ・件数を数える生クエリはアプリ全体で getPoolReserveCount 1関数だけ。他所は必ずこれを呼ぶ。
   ・round2_pool を insert/update/delete した側は必ず notifyRound2PoolChanged(db) を1回呼ぶ。
   ・件数を表示する側は round2pool:changed を購読して再描画する(独自キャッシュを持たない)。
   これで「書いたのに別表示が古い」呼び忘れ由来のズレが構造的に発生しなくなる。 */
var _r2Reserve=null; // 直近に取得した唯一の予備軍reserve件数(通知の度に更新)
async function getPoolReserveCount(db){
  var pr=await db.from('round2_pool').select('id',{count:'exact',head:true}).eq('status','reserve');
  return (pr&&typeof pr.count==='number')?pr.count:null;
}
function getRound2Reserve(){ return _r2Reserve; } // 同期的に直近値を読む(未取得時null)
// round2_pool を書き換えた後に必ず呼ぶ。再取得して全表示へ通知する。
async function notifyRound2PoolChanged(db){
  try{ _r2Reserve=await getPoolReserveCount(db); }catch(_){ }
  try{ document.dispatchEvent(new CustomEvent('round2pool:changed',{detail:{reserve:_r2Reserve}})); }catch(_){}
  return _r2Reserve;
}
/* ★2026-09-26(ドクター「予備軍へ上げた土地を削除したらオンタイムで数字が減る様に・アドホック禁止」):
   判定(削除/NG/OK/クリア/手描き境界の削除)がDBに確定した後に必ず呼ぶ。予備軍の整合はDB側のtrigger(ng_list_sync_round2)と
   RPC(round2_pool_remove)が行うため、ここでは単一の正(getPoolReserveCount)から件数を取り直して全表示へ通知し、
   画面の予備軍の階層も取り直させる(round2pool:reload)だけ。連続確定は400msにまとめる。 */
var _r2JudgeTimer=null;
function refreshRound2AfterJudgment(db){
  clearTimeout(_r2JudgeTimer);
  _r2JudgeTimer=setTimeout(async function(){
    try{ await notifyRound2PoolChanged(db); }catch(_){}
    try{ document.dispatchEvent(new CustomEvent('round2pool:reload')); }catch(_){}
  },400);
}
if(typeof window!=='undefined'){
  window.refreshRound2AfterJudgment=refreshRound2AfterJudgment;
  window.getNextRoundInfo=getNextRoundInfo;
  window.getPastDeliveryRounds=getPastDeliveryRounds;
  window.getPoolReserveCount=getPoolReserveCount;
  window.getRound2Reserve=getRound2Reserve;
  window.notifyRound2PoolChanged=notifyRound2PoolChanged;
}

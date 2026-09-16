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
if(typeof window!=='undefined'){
  window.getNextRoundInfo=getNextRoundInfo;
  window.getPoolReserveCount=getPoolReserveCount;
  window.getRound2Reserve=getRound2Reserve;
  window.notifyRound2PoolChanged=notifyRound2PoolChanged;
}

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
    var pr=await db.from('round2_pool').select('id',{count:'exact',head:true}).eq('status','reserve');
    out.poolReserve=(pr&&typeof pr.count==='number')?pr.count:null;
  }catch(_e){ out.poolReserve=null; }
  return out;
}
if(typeof window!=='undefined')window.getNextRoundInfo=getNextRoundInfo;

/* 画層(レイヤー)システム。本番トラッカーのインラインIIFEを外部化(内容は同一)。分析ページ等で共有。 */
/* v20260820o(ドクター): 移行前カウントから納品済(deliver=納品/○○｜納品層)を除外＋判定OKの層別内訳表示。/ v20260820n: Phase0=「📸 移行前スナップショット」。全gacho状態(全フラグ＋判定OK/NG/閲覧をfeature_id付き)を丸ごとSW(JSON DL＋復元キー)＋基準カウント(_migCounts)。「↩スナップに戻す」で完全復元。組み替え前後で数字一致を確認する検問。 */
/* v20260820m(ドクター): 判定済みフラグの見た目を変える。onReview(fid,marker)/reviewState(fid)公開API＋判定時(applyScore/setStatus/setCrit)にマーカーを減光＋色枠(OK緑/NG赤/閲覧灰破線)=一度見たか一目で判る。feature_id基準で再描画でも保持。 */
/* v20260820j(ドクター): window.__gacho.satImgHtml(lat,lng)=ポップアップに最新衛星画像を直接埋め込むHTML(クリックで必ず出る=ホバー非依存)。農地ナビ等の全フラグで再利用。 */
/* v20260820i(ドクター): 「📦 納品300を突合して削除」=SUNトラスト納品を座標突合(<50m)＋「○○｜納品」レイヤーを画層から完全削除。削除前にSW退避(localStorage復元キー＋JSON DL)＝DB無変更・「↩ 納品を戻す」で完全復元(purgeDelivered/restoreDelivered)。 */
/* v20260820h(ドクター): (1)スコアカードに「✏️敷地境界を手描き→面積を増やす」(drawArea+_drawTarget=描いた面積を対象フラグ⑥へ反映/可視の敷地境界画層に残す)。
   (2)公開API flagScoreCard(fid,meta)=画層でないフラグ(開拓候補/公式放棄地)にも同じ8項目スコアカードを出す(既存ハンドラ再利用=単一定義)。noMapで二重描画防止。meta.seedで実ゲート状態を初期反映。 */
(function(){
'use strict';
var LS_KEY='trackerGacho_v1';
var PALETTE=['#f59e0b','#ef4444','#3b82f6','#22c55e','#a855f7','#ec4899','#14b8a6','#eab308','#f97316','#06b6d4'];
var _iidc=0;
var state=loadState();
var _pane=null,_groups={},_rectMode=false,_rectStart=null,_rectLayer=null;
var _drawMode=false,_drawPts=[],_drawTemp=null,_drawMarkers=[];
var _pickMode=false;
var _drawTarget=null; // v20260820h(ドクター): 手描き敷地境界→対象フラグの面積を更新(小さい土地を800㎡以上へ)。{lid,iid}
var _addMode=false;
var _addModeResume=false; // v20260823(ドクター): 手描きに入る時だけ📍を一時停止し、終わったら自動再開＝📍は連続作業用、押し直すのは終了時だけでよい

function loadState(){
  var s=null;try{s=JSON.parse(localStorage.getItem(LS_KEY));}catch(_){}
  if(!s||typeof s!=='object')s={};
  if(typeof s.base0Visible==='undefined')s.base0Visible=true;
  if(typeof s.solo==='undefined')s.solo=null;
  if(typeof s.hideReviewed==='undefined')s.hideReviewed=false;
  if(typeof s.showArea==='undefined')s.showArea=true;
  if(typeof s.showNg==='undefined')s.showNg=false; // NG(除外)は既定で地図に描かない
  if(typeof s.grpOpen!=='object'||!s.grpOpen)s.grpOpen={};
  if(!Array.isArray(s.layers))s.layers=[];
  s.layers.forEach(function(l){if(!Array.isArray(l.items))l.items=[];l.items.forEach(function(it){if(it&&!it.iid)it.iid=iid();});});
  return s;
}
function saveState(){try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch(_){}}
function uid(){return 'L'+Date.now().toString(36)+Math.floor(Math.random()*10000);}
function iid(){return 'I'+Date.now().toString(36)+(_iidc++)+Math.floor(Math.random()*1000);}
function getMap(){return (typeof map!=='undefined'&&map)?map:(window.map||null);}
function byId(id){return state.layers.filter(function(l){return l.id===id;})[0]||null;}
function activeLayer(){return state.layers.filter(function(l){return l.active;})[0]||null;}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function toast(m){if(typeof showToast==='function'){try{showToast(m);return;}catch(_){}}try{console.log('[画層]',m);}catch(_){}}

function ensurePane(m){if(_pane)return _pane;_pane=m.createPane('gachoPane');_pane.style.zIndex=660;return _pane;}

/* 範囲内の既存の筆・フラグを集める（collectMarkersInBounds のロジックを再利用・全キャッシュ横断） */
function collectInBounds(bounds){
  var m=getMap(),out=[],seen={};if(!m)return out;
  function num(v){var n=Number(v);return (v!=null&&!isNaN(n))?n:null;}
  function push(fid,lat,lng,addr,city,src,area){
    if(lat==null||lng==null)return;lat=Number(lat);lng=Number(lng);if(isNaN(lat)||isNaN(lng))return;
    if(bounds&&!bounds.contains([lat,lng]))return;
    var key=fid||(lat.toFixed(6)+','+lng.toFixed(6));if(seen[key])return;seen[key]=true;
    out.push({feature_id:fid||null,lat:lat,lng:lng,address:addr||'',city:city||'',src:src||'',area:num(area)});
  }
  try{if(typeof markersLayer!=='undefined'&&markersLayer){markersLayer.eachLayer(function(mk){try{var ll=mk.getLatLng&&mk.getLatLng();if(!ll)return;var it=mk._item||{};push(it.feature_id||mk._featureId,ll.lat,ll.lng,it.address,it.city,'tracker',it.area_m2||it.area_sqm||it.area);}catch(_){}});}}catch(_){}
  try{if(typeof _satData!=='undefined'&&_satData&&typeof satAnalysisEnabled!=='undefined'&&satAnalysisEnabled){_satData.forEach(function(r){if(r)push(r.feature_id,r.lat,r.lng,r.address,'','sat',r.area_m2||r.area_sqm||r.area);});}}catch(_){}
  try{if(typeof candCache!=='undefined'&&candCache&&typeof candEnabled!=='undefined'&&candEnabled){candCache.forEach(function(c){if(c)push(c.feature_id,c.lat,c.lng,c.address,c.city,'cand',c.area_sqm||c.area_m2||c.area);});}}catch(_){}
  try{if(typeof yukyuCache!=='undefined'&&yukyuCache&&typeof yukyuEnabled!=='undefined'&&yukyuEnabled){yukyuCache.forEach(function(c){if(c)push(c.feature_id,c.lat,c.lng,c.address,c.city,'yukyu',c.area_m2||c.area_sqm||c.area);});}}catch(_){}
  try{if(typeof useCache!=='undefined'&&useCache){Object.keys(useCache).forEach(function(k){var arr=useCache[k];if(arr&&arr.forEach)arr.forEach(function(c){if(c)push(c.feature_id||c.cc_id,c.lat,c.lng,c.address,c.city,'use',c.area_m2||c.area_sqm||c.area);});});}}catch(_){}
  try{if(window.GOSE218&&window.GOSE218.items){window.GOSE218.items.forEach(function(c){if(c)push(c.no!=null?('gose'+c.no):null,c.lat,c.lng,c.addr,'',c.kind||'gose',c.area);});}}catch(_){}
  return out;
}

function setActive(id){state.layers.forEach(function(l){l.active=(l.id===id);});saveState();render();}
function addBoundaryLayer(){
  var name='敷地境界（実測）';
  var l=state.layers.filter(function(x){return x.name===name;})[0];
  if(!l){l={id:uid(),name:name,color:'#ec4899',visible:true,active:false,items:[]};state.layers.push(l);}
  state.layers.forEach(function(x){x.active=(x.id===l.id);});
  saveState();render();
  toast('「'+name+'」を取込先にしました。✏️で描いた敷地境界はここに入ります');
}
function addLayer(){var idx=state.layers.length;state.layers.forEach(function(x){x.active=false;});state.layers.push({id:uid(),name:'画層'+(idx+1),color:PALETTE[idx%PALETTE.length],visible:true,active:true,items:[]});saveState();render();}

function captureBounds(bounds,opts){
  opts=opts||{};
  var l=activeLayer();if(!l){toast('先に取込先の画層を選ぶ/作ってください');return;}
  var found=collectInBounds(bounds),existing={},added=0,skipped=0;
  var minA=(opts.minArea!=null&&!isNaN(Number(opts.minArea)))?Number(opts.minArea):null;
  var pool=found;
  if(minA!=null){pool=found.filter(function(f){if(f.area==null){skipped++;return false;}return f.area>=minA;});}
  l.items.forEach(function(it){existing[it.feature_id||(it.lat+','+it.lng)]=true;});
  pool.forEach(function(f){var k=f.feature_id||(f.lat+','+f.lng);if(existing[k])return;existing[k]=true;f.iid=iid();l.items.push(f);added++;});
  saveState();render();
  if(minA!=null){toast(added+'件を「'+l.name+'」に取り込み（≥'+minA+'㎡｜範囲内'+found.length+'件中 該当'+pool.length+'件'+(skipped?'／面積不明'+skipped+'件は除外':'')+'）');}
  else{toast(added+'件を「'+l.name+'」に取り込み（範囲内 '+found.length+'件）');}
}
function captureViewport(opts){var m=getMap();if(m)captureBounds(m.getBounds(),opts);}

/* ===== クリックで1件ずつ取込（フラグをクリック→アクティブ画層へ） ===== */
function togglePick(){
  var m=getMap();if(!m)return;
  if(!activeLayer()){toast('先に取込先の画層を選ぶ/作ってください');return;}
  _pickMode=!_pickMode;
  if(_pickMode){if(_rectMode)cleanupRect();if(_drawMode)cancelDraw();if(_addMode)cleanupAdd();m.getContainer().style.cursor='pointer';m.on('click',pickClick);toast('地図の筆・フラグをクリックすると1件ずつ取込先画層へ追加（ESCで終了）');}
  else{cleanupPick();}
  renderPanel();
}
function pickClick(e){
  var m=getMap(),l=activeLayer();if(!l)return;
  var cp=m.latLngToContainerPoint(e.latlng),all=collectInBounds(null),best=null,bestD=Infinity;
  all.forEach(function(f){try{var p=m.latLngToContainerPoint([f.lat,f.lng]);var d=cp.distanceTo(p);if(d<bestD){bestD=d;best=f;}}catch(_){}});
  if(!best||bestD>26){toast('近くに筆・フラグが見つかりません（ズームすると拾いやすいです）');return;}
  var dup=l.items.some(function(it){return (best.feature_id&&it.feature_id===best.feature_id)||(!best.feature_id&&Number(it.lat)===Number(best.lat)&&Number(it.lng)===Number(best.lng));});
  if(dup){toast('その筆は既に追加済み');return;}
  best.iid=iid();l.items.push(best);saveState();render();toast('1件を「'+l.name+'」に追加（'+(best.address||Number(best.lat).toFixed(5)+', '+Number(best.lng).toFixed(5))+'）');
}
function cleanupPick(){var m=getMap();if(m){m.off('click',pickClick);m.getContainer().style.cursor='';}_pickMode=false;renderPanel();}

/* ===== 地図をクリックして「手動ピック（案件候補）」をDB記録（v20260812h: ローカル画層追加をやめ、正式な記録経路=CaseCandidatesRecorderへ） =====
   地図巡回中に見つけた所を、既存のPC長押し記録と同じ経路(確認モーダル→case_candidatesへINSERT→★案件マスター登録可)で永続記録する。 */
function toggleAdd(){
  var m=getMap();if(!m)return;
  if(!_addMode){
    // ★DB記録機能の初期化を待たない(待つと『フラグが立たない』の原因)。フラグは無条件で立てる。
    if(_rectMode)cleanupRect();if(_drawMode)cancelDraw();if(_pickMode)cleanupPick();
    _addMode=true;m.getContainer().style.cursor='crosshair';m.on('click',addClick);
    toast('地図をクリックすると、その地点に即フラグを立てます（連続可・ESCで終了）');
  }else{cleanupAdd();}
  renderPanel();
}
function addClick(e){
  var la=e.latlng.lat,ln=e.latlng.lng;
  // ★まず「必ず」フラグを立てる(記録の成否・モーダルに依存しない。栗本さん:手動ピックのフラグが出ない の根治)。
  // v20260823(ドクター「オレンジになる」): 📍は常に「手動ピック（判定）」(ピンク)専用。以前はactiveLayer()を見ていたため、
  // ✏️手描きで取込先が「敷地境界（実測）」(オレンジ系)に切り替わった直後に📍を押すと、新規ピンまでそこに紛れ込みオレンジになっていた。
  var l=state.layers.filter(function(x){return x.name==='手動ピック（判定）'&&!x.archived;})[0];
  if(!l){l={id:uid(),name:'手動ピック（判定）',color:'#ff1493',visible:true,active:true,items:[]};state.layers.push(l);}
  state.layers.forEach(function(x){x.active=(x.id===l.id);});
  if(l.archived)l.archived=false; l.visible=true;
  l.items.push({iid:iid(),lat:la,lng:ln,address:'手動ピック '+la.toFixed(5)+', '+ln.toFixed(5),src:'manualpick',status:null});
  saveState();render();
  toast('📍 手動ピックのフラグを表示（'+la.toFixed(5)+', '+ln.toFixed(5)+'）／画層「'+l.name+'」。クリックで✓OK/🚫NG');
  // DB記録(case_candidates)は裏でベストエフォート。失敗してもフラグは残す。
  var rec=window.CaseCandidatesRecorder;
  if(rec&&rec.recordDirect){
    try{rec.recordDirect(la,ln,'').then(function(r){if(!(r&&r.ok))toast('（フラグは表示済／DB記録は保留: '+((r&&r.error)||'未確定')+'）');}).catch(function(){});}catch(_){}
  }
}
function cleanupAdd(){var m=getMap();if(m){m.off('click',addClick);m.getContainer().style.cursor='';}_addMode=false;renderPanel();}

/* ===== 敷地境界を描く（CAD風・面積算出） ===== */
function polyArea(latlngs){
  try{if(typeof turf!=='undefined'&&turf.area){var c=latlngs.map(function(p){return [p[1],p[0]];});c.push(c[0]);return turf.area({type:'Feature',geometry:{type:'Polygon',coordinates:[c]}});}}catch(_){}
  /* fallback: 球面近似(緯度補正付き平面シューレース) */
  var R=6378137,rad=Math.PI/180,lat0=latlngs[0][0]*rad,s=0;
  var pts=latlngs.map(function(p){return [R*(p[1]*rad)*Math.cos(lat0),R*(p[0]*rad)];});
  for(var i=0;i<pts.length;i++){var j=(i+1)%pts.length;s+=pts[i][0]*pts[j][1]-pts[j][0]*pts[i][1];}
  return Math.abs(s/2);
}
function centroid(latlngs){var la=0,ln=0;latlngs.forEach(function(p){la+=p[0];ln+=p[1];});return [la/latlngs.length,ln/latlngs.length];}
/* v20260821q(ドクター): 描画中は基本地図以外の全pane(筆ポリゴン/農地ナビ/候補等)のクリックを無効化=クリックが描画だけに行き、他レイヤーのポップアップで描画が妨げられない。 */
var _savedPE=null;
function _drawPanesOff(){var m=getMap();if(!m)return;_savedPE={};var panes=m.getPanes();Object.keys(panes).forEach(function(k){if(k==='mapPane'||k==='tilePane')return;try{_savedPE[k]=panes[k].style.pointerEvents;panes[k].style.pointerEvents='none';}catch(_){}});}
function _drawPanesOn(){var m=getMap();if(!m||!_savedPE)return;var panes=m.getPanes();Object.keys(_savedPE).forEach(function(k){try{if(panes[k])panes[k].style.pointerEvents=_savedPE[k]||'';}catch(_){}});_savedPE=null;}
function toggleDraw(){
  var m=getMap();if(!m)return;
  if(!activeLayer()){toast('先に取込先の画層を選ぶ/作ってください');return;}
  _drawMode=!_drawMode;
  if(_drawMode){if(_rectMode)cleanupRect();if(_pickMode)cleanupPick();if(_addMode){_addModeResume=true;cleanupAdd();}m.closePopup();_drawPanesOff();try{m.doubleClickZoom.disable();}catch(_){}m.getContainer().style.cursor='crosshair';m.on('click',drawClick);m.on('dblclick',drawFinish);toast('頂点をクリックで追加→ダブルクリックで確定（ESCで取消）');}
  else{cancelDraw();}
  renderPanel();
}
function drawClick(e){var m=getMap();try{m.closePopup();}catch(_){}_drawPts.push([e.latlng.lat,e.latlng.lng]);var mk=L.circleMarker(e.latlng,{pane:'gachoPane',radius:4,color:'#fff',weight:1,fillColor:'#f59e0b',fillOpacity:1}).addTo(m);_drawMarkers.push(mk);redrawTemp();}
function redrawTemp(){var m=getMap();if(_drawTemp){try{m.removeLayer(_drawTemp);}catch(_){}_drawTemp=null;}if(_drawPts.length>=2){var ring=_drawPts.slice();if(_drawPts.length>=3)ring=ring.concat([_drawPts[0]]);_drawTemp=L.polyline(ring,{pane:'gachoPane',color:'#f59e0b',weight:2,dashArray:'5,5'}).addTo(m);}}
function drawUndo(){var m=getMap();if(!_drawPts.length){toast('戻す頂点がありません');return;}_drawPts.pop();var mk=_drawMarkers.pop();if(mk&&m){try{m.removeLayer(mk);}catch(_){}}redrawTemp();toast('1つ戻しました（残り頂点'+_drawPts.length+'）');}
function drawFinish(e){if(e){try{L.DomEvent.stop(e);}catch(_){}}if(_drawPts.length<3){toast('3点以上必要です');return;}var l=activeLayer();if(!l){cancelDraw();return;}var latlngs=_drawPts.slice();var area=polyArea(latlngs);var c=centroid(latlngs);var _nb={iid:iid(),type:'boundary',latlngs:latlngs,area:area,lat:c[0],lng:c[1],address:'敷地境界',status:null,userJudged:false,src:'handdraw'};l.items.push(_nb);try{_saveBoundaryToDb(_nb);}catch(_){} // v20260821z11(ドクター): ダブルクリック=線画完了(未確定)。面積を確認→✓OKで初めて確定。描いた瞬間に下書きとしてDB保存(消えない)
  // v20260820h(ドクター): _drawTarget があれば、描いた面積を対象フラグ(候補)に反映=小さい土地を手描きで800㎡以上へ。⑥面積スコアも更新。
  var tgt=_drawTarget;_drawTarget=null;var tmsg='';
  if(tgt){var tl=byId(tgt.lid);if(tl){tl.items.forEach(function(it){if(it.iid===tgt.iid){it.area=area;it.handArea=area;it.handLatlngs=latlngs;var s=_score(it);s.c6=(area>=800?'o':'x');it.viewed=true;}});}tmsg='／ 対象フラグの面積を '+Math.round(area).toLocaleString()+'㎡ に更新(⑥面積'+(area>=800?'〇':'✖')+')';}
  saveState();_lastDrawnBoundary={lid:l.id,iid:_nb.iid};_lastDrawTarget=tgt;cancelDraw();render();
  try{_showAreaConfirm(area,tgt);}catch(_){toast('線画完了（約'+Math.round(area).toLocaleString()+'㎡）。線をクリック→✓OKで確定');}}
var _lastDrawnBoundary=null,_lastDrawTarget=null;
/* v20260821z11(ドクター): ダブルクリック=線画完了。ここで面積を確認して✓OKを押して初めて確定=作業完了。足りなければ描き直し。 */
function _showAreaConfirm(area,tgt){
  var ok=area>=800;var col=ok?'#22c55e':'#f85149';
  var ex=document.getElementById('gachoAreaConfirm');if(ex){try{ex.remove();}catch(_){}}
  var ov=document.createElement('div');ov.id='gachoAreaConfirm';
  ov.style.cssText='position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;';
  ov.innerHTML='<div style="background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:20px 24px;max-width:330px;text-align:center;color:#e6edf3;font:14px/1.5 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.6)">'
    +'<div style="font-size:13px;color:#8b949e">線画完了 → 最終チェック</div>'
    +'<div style="font-size:32px;font-weight:800;color:'+col+';margin:8px 0">'+Math.round(area).toLocaleString()+' ㎡</div>'
    +'<div style="font-size:12px;color:'+col+';margin-bottom:14px">'+(ok?'✓ 800㎡以上 → OKにできます':'⚠ 800㎡未満 → 足りません（描き直し推奨）')+'</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button id="_gacOkBtn" style="flex:1;background:#238636;border:1px solid #2ea043;color:#fff;border-radius:8px;padding:9px;font-weight:700;cursor:pointer">✓ OK（確定）</button>'
    +'<button id="_gacReBtn" style="flex:1;background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:8px;padding:9px;cursor:pointer">↺ 描き直す</button>'
    +'</div><div style="font-size:10px;color:#6e7681;margin-top:8px">後で決めるなら、この線をクリック→✓OK。線はもう保存済み（消えません）</div></div>';
  document.body.appendChild(ov);
  function close(){try{ov.remove();}catch(_){}}
  var okb=document.getElementById('_gacOkBtn');if(okb)okb.onclick=function(){close();
    try{ if(tgt){ window.__gacho.applyScore(tgt.lid,tgt.iid); } else if(_lastDrawnBoundary){ window.__gacho.setStatus(_lastDrawnBoundary.lid,_lastDrawnBoundary.iid,'ok'); } }catch(_){}
  };
  var reb=document.getElementById('_gacReBtn');if(reb)reb.onclick=function(){close();
    try{ if(_lastDrawnBoundary){var bl=byId(_lastDrawnBoundary.lid);if(bl)bl.items=bl.items.filter(function(x){return x.iid!==_lastDrawnBoundary.iid;});saveState();} if(_lastDrawTarget)_drawTarget=_lastDrawTarget; render(); if(!_drawMode)toggleDraw(); toast('描き直し: クリックで頂点→ダブルクリックで確定'); }catch(_){}
  };
}
function cancelDraw(){var m=getMap();_drawMarkers.forEach(function(mk){try{if(m)m.removeLayer(mk);}catch(_){}});_drawMarkers=[];if(_drawTemp){try{if(m)m.removeLayer(_drawTemp);}catch(_){}_drawTemp=null;}_drawPts=[];_drawPanesOn();if(m){m.off('click',drawClick);m.off('dblclick',drawFinish);try{m.doubleClickZoom.enable();}catch(_){}m.getContainer().style.cursor='';}_drawMode=false;if(_addModeResume){_addModeResume=false;toggleAdd();}renderPanel();}

function toggleRect(){var m=getMap();if(!m)return;_rectMode=!_rectMode;if(_rectMode){if(_drawMode)cancelDraw();if(_pickMode)cleanupPick();if(_addMode)cleanupAdd();try{m.dragging.disable();}catch(_){}m.getContainer().style.cursor='crosshair';m.on('mousedown',rectDown);toast('地図上をドラッグで囲むと、その範囲の筆・フラグを取り込みます（ESCで終了）');}else{cleanupRect();}renderPanel();}
function rectDown(e){_rectStart=e.latlng;var m=getMap();m.on('mousemove',rectMove);m.on('mouseup',rectUp);}
function rectMove(e){var m=getMap();if(!_rectStart)return;if(_rectLayer)m.removeLayer(_rectLayer);_rectLayer=L.rectangle(L.latLngBounds(_rectStart,e.latlng),{color:'#f59e0b',weight:1,dashArray:'5,5',fillOpacity:0.08}).addTo(m);}
function rectUp(e){var m=getMap();var b=L.latLngBounds(_rectStart,e.latlng);m.off('mousemove',rectMove);m.off('mouseup',rectUp);if(_rectLayer){m.removeLayer(_rectLayer);_rectLayer=null;}_rectStart=null;if(b.isValid())captureBounds(b);}
function cleanupRect(){var m=getMap();if(!m)return;m.off('mousedown',rectDown);m.off('mousemove',rectMove);m.off('mouseup',rectUp);if(_rectLayer){try{m.removeLayer(_rectLayer);}catch(_){}_rectLayer=null;}_rectStart=null;try{m.dragging.enable();}catch(_){}m.getContainer().style.cursor='';_rectMode=false;renderPanel();}

/* ===== 書き出し（スナップショット不要でAIへ／クライアントへスマートに渡す） ===== */
function _fnsafe(s){return String(s||'画層').replace(/[\\\/:*?"<>|\s]+/g,'_').slice(0,40);}
function _stamp(){var d=new Date();function z(n){return (n<10?'0':'')+n;}return ''+d.getFullYear()+z(d.getMonth()+1)+z(d.getDate())+'_'+z(d.getHours())+z(d.getMinutes());}
function download(fname,text,mime){try{var b=new Blob([text],{type:(mime||'text/plain')+';charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download=fname;document.body.appendChild(a);a.click();setTimeout(function(){try{URL.revokeObjectURL(u);a.remove();}catch(_){}} ,500);}catch(e){toast('書き出し失敗');}}
function toGeoJSON(layer){
  var feats=[];
  layer.items.forEach(function(it){
    if(it.status==='ng')return;
    if(it.type==='boundary'&&it.latlngs&&it.latlngs.length>=3){
      var ring=it.latlngs.map(function(p){return [p[1],p[0]];});ring.push(ring[0]);
      feats.push({type:'Feature',properties:{layer:layer.name,kind:'敷地境界',area_m2:Math.round(it.area||0),address:it.address||''},geometry:{type:'Polygon',coordinates:[ring]}});
    }else{
      feats.push({type:'Feature',properties:{layer:layer.name,kind:'筆',feature_id:it.feature_id||'',area_m2:(it.area!=null?Math.round(it.area):null),address:it.address||'',city:it.city||''},geometry:{type:'Point',coordinates:[it.lng,it.lat]}});
    }
  });
  return {type:'FeatureCollection',name:layer.name,features:feats};
}
function _kmlColor(hex){hex=(hex||'#f59e0b').replace('#','');if(hex.length<6)hex='f59e0b';return 'ff'+hex.substr(4,2)+hex.substr(2,2)+hex.substr(0,2);}
function toKML(layer){
  var c=_kmlColor(layer.color),pm='';
  layer.items.forEach(function(it){
    if(it.status==='ng')return;
    if(it.type==='boundary'&&it.latlngs&&it.latlngs.length>=3){
      var co=it.latlngs.map(function(p){return p[1]+','+p[0]+',0';});co.push(it.latlngs[0][1]+','+it.latlngs[0][0]+',0');
      pm+='<Placemark><name>'+esc('敷地境界 約'+Math.round(it.area||0).toLocaleString()+'㎡')+'</name><styleUrl>#s</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>'+co.join(' ')+'</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>';
    }else{
      pm+='<Placemark><name>'+esc(it.address||'筆')+'</name><styleUrl>#s</styleUrl><Point><coordinates>'+it.lng+','+it.lat+',0</coordinates></Point></Placemark>';
    }
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>'+esc(layer.name)+'</name>'
    +'<Style id="s"><IconStyle><color>'+c+'</color></IconStyle><LineStyle><color>'+c+'</color><width>2</width></LineStyle><PolyStyle><color>'+('66'+c.substr(2))+'</color></PolyStyle></Style>'
    +pm+'</Document></kml>';
}
function exportLayer(fmt){
  var l=activeLayer();if(!l){toast('書き出す画層を選んでください');return;}
  if(!l.items.length){toast('この画層は空です');return;}
  if(fmt==='geojson'){download(_fnsafe(l.name)+'_'+_stamp()+'.geojson',JSON.stringify(toGeoJSON(l),null,2),'application/geo+json');toast('GeoJSONを書き出しました（AI連携/GIS用）');}
  else if(fmt==='kml'){download(_fnsafe(l.name)+'_'+_stamp()+'.kml',toKML(l),'application/vnd.google-earth.kml+xml');toast('KMLを書き出しました（Google Earthで開けます）');}
  else if(fmt==='copy'){var t=JSON.stringify(toGeoJSON(l));if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){toast('GeoJSONをコピーしました（貼り付けでAIへ渡せます）');},function(){toast('コピー失敗');});}else{toast('コピー非対応の環境です');}}
}

/* ===== 確定データ(突合表397=cases_all.json)からSUNトラスト納品を画層へ自動生成 =====
   AIは数え直さない/作り直さない。県×区分でそのまま流し込むだけ。0画層(既存)は不変。 */
function loadSuntrust(){
  var url='suntrust_cases_all.json?v='+Date.now();
  toast('SUNトラスト確定データを読込中…');
  fetch(url).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(rows){
    if(!Array.isArray(rows)||!rows.length){toast('データが空です');return;}
    var CATCOL={'納品':'#22c55e','合筆提案':'#3b82f6','保留・対象外':'#8b949e'};
    function cat(d){if(d==='納品')return '納品';if(d==='合筆提案')return '合筆提案';return '保留・対象外';}
    var groups={};
    rows.forEach(function(r){if(r.lat==null||r.lng==null)return;var pref=r.pref||'その他',c=cat(r.deliver);var key=pref+'||'+c;(groups[key]=groups[key]||{pref:pref,cat:c,rows:[]}).rows.push(r);});
    var total=0;
    Object.keys(groups).sort().forEach(function(key){
      var g=groups[key],name=g.pref+'｜'+g.cat;
      var l=state.layers.filter(function(x){return x.name===name;})[0];
      if(l&&l.archived)return; // ★退避済みは復活させない(この納品グループを再投入しない)
      if(!l){l={id:uid(),name:name,color:CATCOL[g.cat]||'#f59e0b',visible:true,active:false,items:[]};state.layers.push(l);}
      l.color=CATCOL[g.cat]||l.color;l.items=[];
      g.rows.forEach(function(r){l.items.push({iid:iid(),feature_id:null,lat:Number(r.lat),lng:Number(r.lng),address:r.address||'',city:r.city||'',area:(r.area_m2!=null?Number(r.area_m2):null),chiban:r.chiban||'',deliver:r.deliver||'',src:'suntrust'});});
      total+=l.items.length;
    });
    state.layers.forEach(function(x){x.active=false;});
    saveState();render();
    toast('SUNトラスト確定データを読込: '+Object.keys(groups).length+'画層／計'+total+'件（0画層＝既存は保持）');
  }).catch(function(e){toast('読込失敗: suntrust_cases_all.json が見つかりません（本番反映待ちかも）');});
}

/* 御所218(低圧太陽光分析・事前選別済み)を丸ごと画層へ。栗本さん認識=黄色は全てOKの集まり→status='ok'付きで読込 */
function loadGose(){
  if(!(window.GOSE218&&window.GOSE218.items&&window.GOSE218.items.length)){toast('御所218データが読み込まれていません');return;}
  var name='御所218（低圧太陽光）';
  var l=state.layers.filter(function(x){return x.name===name;})[0];
  if(l&&l.archived){toast('御所218は退避済みです（🗄納品済→↩で戻せます）');return;} // ★退避済みは復活させない
  if(!l){l={id:uid(),name:name,color:'#f59e0b',visible:true,active:false,items:[]};state.layers.push(l);}
  l.items=[];
  window.GOSE218.items.forEach(function(c){
    if(c.lat==null||c.lng==null)return;
    l.items.push({iid:iid(),feature_id:'gose'+c.no,lat:Number(c.lat),lng:Number(c.lng),address:c.addr||'',area:(c.area!=null?Number(c.area):null),status:'ok',viewed:true,src:'gose'});
  });
  state.layers.forEach(function(x){x.active=false;});
  saveState();render();
  toast('御所218を画層に読込: '+l.items.length+'件（全てOK・0画層は保持）');
}

function showAll(){state.base0Visible=true;state.solo=null;state.layers.forEach(function(l){l.visible=true;});saveState();render();applyBase0();}
function hideAll(){state.base0Visible=false;state.layers.forEach(function(l){l.visible=false;});saveState();render();applyBase0();}
/* 既に見た(モーダルを開いた)＝残してある＝実質OK。未判定の見た分を全画層まとめてOKへ(開き直し不要) */
function bulkViewedOk(){
  var targets=[];
  state.layers.forEach(function(l){l.items.forEach(function(it){if(it.viewed&&!it.status)targets.push(it);});});
  if(!targets.length){toast('見た(未判定)の項目はありません');return;}
  if(!confirm('既に見た(未判定)の '+targets.length+'件を「OK」にします。\n（残してある＝実質OKの想定。後で個別にNGへ変更できます）\nよろしいですか？'))return;
  targets.forEach(function(it){it.status='ok';});
  saveState();render();
  toast(targets.length+'件をOKにしました');
}

/* ===== v20260820i(ドクター): SUNトラスト納品300を「突合して画層から完全削除(一旦)」＋完全復元 =====
   ・複数レイヤーに跨る納品フラグを座標突合(<50m)で拾い、'○○｜納品'レイヤーも丸ごと対象。
   ・削除前に必ず退避バックアップ(localStorage復元キー＋JSONダウンロード)=DBは一切触らない・完全に戻せる。
   ・ロードマップ⑤(納品退避/フラグ復元)。判定メモ(judgeOnly)・退避済(archived)は対象外。 */
var _DELIV_BK_KEY='trackerGacho_delivBackup_v1';
function _distM(la1,lo1,la2,lo2){var R=6371000,p=Math.PI/180,dLa=(la2-la1)*p,dLo=(lo2-lo1)*p,a=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*p)*Math.cos(la2*p)*Math.sin(dLo/2)*Math.sin(dLo/2);return 2*R*Math.asin(Math.min(1,Math.sqrt(a)));}
function purgeDelivered(){
  toast('納品座標を読込→突合中…');
  fetch('suntrust_cases_all.json?v='+(new Date()).getTime()).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(rows){
    var D=[];
    (rows||[]).forEach(function(r){if(r&&r.deliver==='納品'&&r.lat!=null&&r.lng!=null)D.push([Number(r.lat),Number(r.lng)]);});
    // 既に画層に載っている '○○｜納品' の座標も納品として突合対象に加える(json未反映でも拾える)
    state.layers.forEach(function(l){if(/｜納品$/.test(l.name||''))l.items.forEach(function(it){if(it.lat!=null&&it.lng!=null)D.push([Number(it.lat),Number(it.lng)]);});});
    if(!D.length){toast('納品座標が0件でした(suntrust_cases_all.json が本番未反映かも)');return;}
    var CELL=0.0006,g={}; // 約60mセル
    D.forEach(function(pt){var k=Math.floor(pt[0]/CELL)+','+Math.floor(pt[1]/CELL);(g[k]=g[k]||[]).push(pt);});
    function near(la,lo){var ci=Math.floor(la/CELL),cj=Math.floor(lo/CELL);for(var i=ci-1;i<=ci+1;i++)for(var j=cj-1;j<=cj+1;j++){var arr=g[i+','+j];if(arr)for(var t=0;t<arr.length;t++){if(_distM(la,lo,arr[t][0],arr[t][1])<=50)return true;}}return false;}
    var removed=[];
    state.layers.forEach(function(l){
      if(l.judgeOnly||l.archived)return; // 判定メモ/退避済は触らない
      var isDelivLayer=/｜納品$/.test(l.name||'');
      var keep=[];
      l.items.forEach(function(it){
        var isDeliv=isDelivLayer||(it.deliver==='納品')||(it.lat!=null&&it.lng!=null&&near(Number(it.lat),Number(it.lng)));
        if(isDeliv)removed.push({layer:l.name,color:l.color,item:it}); else keep.push(it);
      });
      l.items=keep;
    });
    if(!removed.length){toast('納品と一致するフラグはありませんでした(既に退避済み?)');return;}
    var bk={ts:_stamp(),count:removed.length,removed:removed};
    try{localStorage.setItem(_DELIV_BK_KEY,JSON.stringify(bk));}catch(_){}
    try{download('納品退避_'+_stamp()+'.json',JSON.stringify(bk,null,2),'application/json');}catch(_){}
    // 空になった候補レイヤーは削除(判定メモ/退避は残す)
    state.layers=state.layers.filter(function(l){return (l.items&&l.items.length)||l.judgeOnly||l.archived;});
    saveState();render();
    toast('納品 '+removed.length+'件を突合→SW退避＋画層から削除。DBは無変更。「↩ 納品を戻す」でいつでも復元。');
  }).catch(function(){toast('suntrust_cases_all.json の読込に失敗しました');});
}
function restoreDelivered(){
  var raw=null;try{raw=localStorage.getItem(_DELIV_BK_KEY);}catch(_){}
  if(!raw){toast('復元データがありません(退避していない)');return;}
  var bk;try{bk=JSON.parse(raw);}catch(_){toast('復元データが壊れています');return;}
  var byLayer={};
  (bk.removed||[]).forEach(function(r){(byLayer[r.layer]=byLayer[r.layer]||{color:r.color,items:[]}).items.push(r.item);});
  Object.keys(byLayer).forEach(function(name){
    var l=state.layers.filter(function(x){return x.name===name;})[0];
    if(!l){l={id:uid(),name:name,color:byLayer[name].color||'#22c55e',visible:true,active:false,items:[]};state.layers.push(l);}
    byLayer[name].items.forEach(function(it){var dup=l.items.filter(function(x){return x.iid===it.iid;})[0];if(!dup)l.items.push(it);});
  });
  try{localStorage.removeItem(_DELIV_BK_KEY);}catch(_){}
  saveState();render();
  toast('納品 '+(bk.count||0)+'件を画層へ復元しました');
}
function _hasDelivBackup(){try{return !!localStorage.getItem(_DELIV_BK_KEY);}catch(_){return false;}}

/* ===== v20260820n(ドクター): レイヤー構造移行 Phase0=移行前スナップショット＋基準カウント =====
   全gacho状態(全フラグ＋判定OK/NG/閲覧をfeature_id付き)を丸ごとSWへ書出(JSON DL＋localStorage復元キー)。
   組み替え(Phase1〜4)は追加/表示のみ・非破壊だが、これを「消えない・判定が残る」の証拠＆完全復元点にする。
   各Phase前後で _migCounts() を突き合わせ、数字が減ったら停止=ロールバック。 */
var _MIG_SNAP_KEY='trackerGacho_migSnapshot_v1';
function _isDeliveredLayer(l){ return /｜納品$/.test(l.name||''); }
function _isDeliveredItem(l,it){ return _isDeliveredLayer(l)||it.deliver==='納品'; }
// ドクターが実際に開いて判定したか。userJudged印(今回以降)またはDB永続(ai_ok_labels/farmland_ng_list=過去に確定)。
function _isUserJudged(it){ return !!(it.userJudged||(it.feature_id&&((it.status==='ok'&&_gDbOk[it.feature_id])||(it.status==='ng'&&_gDbNg[it.feature_id])))); }
function _migCounts(){
  // ドクター指示(2026-08-21): 判定OK/NGは「納品済み」を入れない＋「私が一度も開いていない(=実判定でない)モノ」を入れない。
  //   御所218等のプリセットOK(自動status=ok・未オープン・DB未記録)は除外。OK/NG=実判定のみ。
  var c={layers:0,items:0,withFid:0,ok:0,ng:0,viewed:0,delivered:0,presetOk:0,presetNg:0,dbOk:0,dbNg:0,okByLayer:{}};
  function tally(l,it){
    if(_isDeliveredItem(l,it)){ c.delivered++; return; } // 納品済みは判定カウントに入れない
    if(it.status==='ok'){ if(_isUserJudged(it)){c.ok++;c.okByLayer[l.name]=(c.okByLayer[l.name]||0)+1;} else c.presetOk++; }
    else if(it.status==='ng'){ if(_isUserJudged(it))c.ng++; else c.presetNg++; }
    else if(it.viewed)c.viewed++;
  }
  state.layers.forEach(function(l){
    if(l.judgeOnly){ l.items.forEach(function(it){tally(l,it);}); return; } // 判定メモ層=候補判定。フラグ実数には数えない
    c.layers++;
    l.items.forEach(function(it){ c.items++; if(it.feature_id)c.withFid++; if(l.archived){return;} tally(l,it); });
  });
  try{c.dbOk=Object.keys(_gDbOk||{}).length;c.dbNg=Object.keys(_gDbNg||{}).length;}catch(_){}
  return c;
}
function _migCountText(c){
  var tops=Object.keys(c.okByLayer).sort(function(a,b){return c.okByLayer[b]-c.okByLayer[a];}).slice(0,5)
    .map(function(n){return '　・'+n+'：OK '+c.okByLayer[n];}).join('\n');
  return '総フラグ '+c.items+'（feature_id付 '+c.withFid+'）／ 画層 '+c.layers
    +'\n★私が判定(開いて確定): OK '+c.ok+' ・ NG '+c.ng+' ・ 閲覧のみ '+c.viewed
    +'\n除外→ 納品済 '+c.delivered+' ／ 既OK(未オープン) '+c.presetOk+' ／ 既NG(未オープン) '+c.presetNg
    +'\nDB永続判定(参考): OK '+c.dbOk+' ・ NG '+c.dbNg
    +(tops?('\n\n私の判定OKの内訳(層別・上位5):\n'+tops):'');
}
function snapshotMigration(){
  var c=_migCounts();
  var snap={ts:_stamp(),counts:c,state:JSON.parse(JSON.stringify(state))};
  try{localStorage.setItem(_MIG_SNAP_KEY,JSON.stringify(snap));}catch(_){}
  try{download('移行前スナップショット_'+_stamp()+'.json',JSON.stringify(snap),'application/json');}catch(_){}
  renderPanel();
  try{alert('📸 移行前スナップショットを保存しました（SW＝JSON書出＋復元キー）。\n\n【基準カウント】\n'+_migCountText(c)+'\n\nこの数字を基準に、各Phaseの前後で一致を確認します（減ったら停止＝復元）。');}catch(_){}
  toast('移行前スナップショット保存: 総'+c.items+'/OK'+c.ok+'/NG'+c.ng+'/閲覧'+c.viewed);
}
function restoreMigrationSnapshot(){
  var raw=null;try{raw=localStorage.getItem(_MIG_SNAP_KEY);}catch(_){}
  if(!raw){toast('スナップショットがありません');return;}
  if(!confirm('移行前スナップショットに戻します。現在の画層状態はスナップショット時点に置き換わります。よろしいですか？'))return;
  var snap;try{snap=JSON.parse(raw);}catch(_){toast('スナップショットが壊れています');return;}
  if(snap&&snap.state&&snap.state.layers){ state=snap.state; saveState(); render(); var c=_migCounts(); try{alert('↩ スナップショットに復元しました。\n\n'+_migCountText(c));}catch(_){}; toast('スナップショットに復元: 総'+c.items+'件'); }
  else toast('スナップショットにstateがありません');
}
function _hasMigSnapshot(){try{return !!localStorage.getItem(_MIG_SNAP_KEY);}catch(_){return false;}}
/* ===== 第2回納品候補 県→市町村 移行（ドクター2026-08-21 v20260821v・慎重運用）
   単一の正=delivery2-candidates.js(fid/iid→県市町村の固定割当)。画面はそれを読むだけ・その場で数え直さない。
   安全: スナップショット→移動(移動だけでは1件も消えない)→総数一致を確認→別ボタンで空レイヤー削除→総数が変われば即中断して自動復元。
   ピンク(手動ピック)・納品退避(archived)は絶対に触らない。 ===== */
var _D2_SNAP_KEY='trackerGacho_d2_snapshot_v1';
var _d2Emptied=[];
function _d2TotalItems(){var n=0;state.layers.forEach(function(l){n+=(l.items?l.items.length:0);});return n;}
function _d2IsPink(l){return /手動ピック|手作業|ピンク/.test(l.name||'')|| (l.meta&&l.meta.manual);}
function _d2Dest(pref,city){
  var name='第2回納品候補｜'+pref+'｜'+city;
  var l=state.layers.filter(function(x){return x.name===name;})[0];
  if(!l){l={id:uid(),name:name,color:'#0891b2',visible:true,active:false,items:[],meta:{client:'第2回納品候補',period:pref,region:city,pref:pref,city:city}};state.layers.push(l);}
  return l;
}
function migrateDelivery2(){
  var D=window.DELIVERY2;
  if(!D||!D.byFeature){toast('第2回候補データ未読込(delivery2-candidates.js)＝中断');return;}
  if(!confirm('第2回納品候補（OKフラグ＋手描き境界／納品300は除外）を「県→市町村」レイヤーへ移動します。\n\n・先に自動スナップショット（復元キー＋JSON書出）＝いつでも「↩ 移行を元に戻す」で復元可\n・移動だけでは1件も消えません（削除は別ボタン）\n・総数が変わったら自動で中止し元に戻します\n・手動ピック（ピンク）・納品退避は触りません\n\n実行しますか？'))return;
  var snap;
  try{snap=JSON.stringify({ts:_stamp(),state:state});localStorage.setItem(_D2_SNAP_KEY,snap);}catch(_){toast('スナップショット失敗＝中断');return;}
  try{download('第2回移行前スナップ_'+_stamp()+'.json',snap,'application/json');}catch(_){}
  var before=_d2TotalItems();
  var moved=0,emptied=[];
  state.layers.slice().forEach(function(l){
    if(l.meta&&l.meta.client==='第2回納品候補')return; // 宛先自身
    if(l.archived)return;                              // 納品退避・退避済は触らない
    if(_d2IsPink(l))return;                            // 手動ピック(ピンク)は絶対に触らない
    var had=l.items.length,keep=[];
    l.items.forEach(function(it){
      var a=null;
      if(it.type==='boundary'&&it.iid&&D.byBoundary[it.iid])a=D.byBoundary[it.iid];
      else if(it.feature_id&&D.byFeature[it.feature_id])a=D.byFeature[it.feature_id];
      if(a){_d2Dest(a.pref,a.city).items.push(it);moved++;}
      else keep.push(it);
    });
    l.items=keep;
    if(had>0&&l.items.length===0)emptied.push(l.id);
  });
  var after=_d2TotalItems();
  if(after!==before){ // 1件でも失ったら復元して中断
    try{var s=JSON.parse(localStorage.getItem(_D2_SNAP_KEY));if(s&&s.state){state=s.state;}}catch(_){}
    saveState();render();
    toast('⚠ 総数が変化('+before+'→'+after+')＝異常。移行を中止し元に戻しました');
    return;
  }
  _d2Emptied=emptied;saveState();render();
  try{alert('✓ 第2回納品候補へ移動しました\n\n移動 '+moved+' 件（DB割当526に対して現在ブラウザにある分）\n総数 '+before+' → '+after+'（不変＝1件も失っていません）\n空になった元レイヤー '+emptied.length+' 個\n\n数字を確認し、問題なければ「🗑 空レイヤー削除」を押してください。\n違和感があれば「↩ 移行を元に戻す」で即復元できます。');}catch(_){}
  toast('✓ 移動'+moved+'件・総数'+before+'不変。空'+emptied.length+'個は別ボタンで削除');
}
function deleteEmptiedD2(){
  if(!_d2Emptied.length){toast('削除対象の空レイヤーがありません（先に移行を実行）');return;}
  if(!confirm('移動で空になった元レイヤー '+_d2Emptied.length+' 個を削除します。\n・0件のものだけ・第2回宛先/納品退避は対象外\n・総数が変わったら自動で中止し復元\n実行しますか？'))return;
  var before=_d2TotalItems();
  var del=0,ids=_d2Emptied.slice();
  state.layers=state.layers.filter(function(l){
    if(ids.indexOf(l.id)>=0&&l.items.length===0&&!(l.meta&&l.meta.client==='第2回納品候補')&&!l.archived){del++;if(state.solo===l.id)state.solo=null;return false;}
    return true;
  });
  var after=_d2TotalItems();
  if(after!==before){
    try{var s=JSON.parse(localStorage.getItem(_D2_SNAP_KEY));if(s&&s.state){state=s.state;}}catch(_){}
    saveState();render();toast('⚠ 削除で総数変化＝異常。元に戻しました');return;
  }
  _d2Emptied=[];saveState();render();toast('✓ 空になった元レイヤー'+del+'個を削除（総数'+before+'不変）');
}
function undoDelivery2(){
  var raw=null;try{raw=localStorage.getItem(_D2_SNAP_KEY);}catch(_){}
  if(!raw){toast('復元用スナップショットがありません');return;}
  if(!confirm('第2回移行を、移行前の状態に戻します。よろしいですか？'))return;
  var s;try{s=JSON.parse(raw);}catch(_){toast('スナップショットが壊れています');return;}
  if(s&&s.state&&s.state.layers){state=s.state;_d2Emptied=[];saveState();render();toast('↩ 第2回移行を元に戻しました');}
  else toast('スナップショットにstateがありません');
}
function _hasD2Snap(){try{return !!localStorage.getItem(_D2_SNAP_KEY);}catch(_){return false;}}
/* レイヤー整理: 旧レイヤー(第2回=県→市町村・手作業・手動ピック 以外)をSWへ退避し作業台から外す=県→市町村だけの綺麗な作業台に。可逆(退避↩で戻せる)。ドクター2026-08-21 */
function _isD2Layer(l){return !!(l.meta&&l.meta.client==='第2回納品候補');}
function tidyOldLayers(){
  // v20260821z21(ドクター): 「敷地境界」や境界(手描き/筆)を含むレイヤーは絶対に退避しない=境界が消えて見えるのを防ぐ。第2回/手作業/手動ピックも残す。
  var old=state.layers.filter(function(l){ if(l.archived||!(l.items&&l.items.length))return false; if(_isD2Layer(l)||_d2IsPink(l))return false; if(/手動ピック|敷地境界/.test(l.name||''))return false; if(l.items.some(function(it){return it.type==='boundary';}))return false; return true; });
  if(!old.length){toast('片付ける旧レイヤーがありません（既に県→市町村＋手作業＋手動ピックだけ）');return;}
  var names=old.slice(0,6).map(function(l){return l.name;}).join('／')+(old.length>6?' …他'+(old.length-6):'');
  if(!confirm('旧レイヤー '+old.length+' 個（'+names+'）をSWルームへ退避し、作業台から外します。\n・データは消えません（アーカイブに畳む＝退避欄の↩で戻せる）\n・第2回(県→市町村)・手作業ピック・手動ピックは残します\n実行しますか？'))return;
  try{ if(typeof evacuateLayers==='function'){ evacuateLayers(old,'旧作業台整理','退避_'+_stamp()); } else { old.forEach(function(l){l.archived=true;l.visible=false;if(state.solo===l.id)state.solo=null;}); saveState(); render(); } }
  catch(_){ old.forEach(function(l){l.archived=true;l.visible=false;}); saveState(); render(); }
  toast('✓ 旧レイヤー'+old.length+'個を退避（SW書出＋作業台から外す）。作業台は県→市町村＋手作業＋手動ピックに整理');
}
/* 手作業ピック(ピンク)を県→市町村へ「手作業レイヤー」として表示。ピックの中身(座標/判定)は不変=入れ物のレイヤーだけ整理。可逆。 */
function _d2ManualAssign(it){
  var G=window.DELIVERY2&&window.DELIVERY2.manualGeoByCoord; if(!G||it.lat==null||it.lng==null)return null;
  var la=Number(it.lat),ln=Number(it.lng);
  var k=la.toFixed(4)+','+ln.toFixed(4); if(G[k])return G[k];
  for(var dx=-1;dx<=1;dx++)for(var dy=-1;dy<=1;dy++){var kk=(la+dx*0.0001).toFixed(4)+','+(ln+dy*0.0001).toFixed(4);if(G[kk])return G[kk];}
  return null;
}
function _d2ManualDest(pref,city){
  var name='手作業｜'+pref+'｜'+city;
  var l=state.layers.filter(function(x){return x.name===name;})[0];
  if(!l){l={id:uid(),name:name,color:'#f97316',visible:true,active:false,items:[],meta:{client:'第2回納品候補',period:pref,region:city,pref:pref,city:city,manual:true}};state.layers.push(l);}
  return l;
}
function migrateManualPicks(){
  var D=window.DELIVERY2;
  if(!D||!D.manualGeoByCoord){toast('手作業割当データ未読込＝中断');return;}
  var srcs=state.layers.filter(function(l){return !l.archived && /手動ピック/.test(l.name||'') && !(l.meta&&l.meta.manual);});
  var srcN=0;srcs.forEach(function(l){l.items.forEach(function(it){if(it.type!=='boundary')srcN++;});});
  if(!srcN){toast('gachoの「手動ピック（判定）」レイヤーに移動対象がありません（ピンクがページ側の場合は別途対応が必要＝ドクターに確認）');return;}
  if(!confirm('手作業ピック（ピンク '+srcN+'件）を「手作業｜県｜市町村」へ移動し、県→市町村の階層に表示します。\n・ピックの中身（座標/判定）は一切変えません（入れ物のレイヤーだけ整理）\n・先に自動スナップショット＝「↩ 移行を元に戻す」で復元可\n・総数が変わったら自動で中止し復元\n実行しますか？'))return;
  var snap;try{snap=JSON.stringify({ts:_stamp(),state:state});localStorage.setItem(_D2_SNAP_KEY,snap);}catch(_){toast('スナップショット失敗＝中断');return;}
  try{download('手作業移行前スナップ_'+_stamp()+'.json',snap,'application/json');}catch(_){}
  var before=_d2TotalItems();var moved=0,unknown=0,emptied=[];
  srcs.forEach(function(l){
    var had=l.items.length,keep=[];
    l.items.forEach(function(it){
      if(it.type==='boundary'){keep.push(it);return;}
      var a=_d2ManualAssign(it);
      if(a){_d2ManualDest(a.pref,a.city).items.push(it);moved++;}
      else{_d2ManualDest('区域不明','区域不明').items.push(it);unknown++;moved++;}
    });
    l.items=keep;
    if(had>0&&l.items.length===0)emptied.push(l.id);
  });
  var after=_d2TotalItems();
  if(after!==before){try{var s=JSON.parse(localStorage.getItem(_D2_SNAP_KEY));if(s&&s.state)state=s.state;}catch(_){}saveState();render();toast('⚠ 総数変化('+before+'→'+after+')＝異常。中止し復元しました');return;}
  _d2Emptied=emptied;saveState();render();
  try{alert('✓ 手作業ピックを県→市町村へ整理しました\n\n移動 '+moved+' 件（うち区域不明 '+unknown+'）\n総数 '+before+' → '+after+'（不変）\n\nピックの中身は変えていません（入れ物のレイヤーだけ整理）。\n違和感があれば「↩ 移行を元に戻す」。');}catch(_){}
  toast('✓ 手作業ピック移動'+moved+'件（不明'+unknown+'）総数'+before+'不変');
}
/* DBの正(items=526)から、ブラウザに無い不足分を第2回階層へ補完。既存はfeature_id/iidで重複させない。可逆。 */
function completeDelivery2FromDb(){
  var D=window.DELIVERY2;
  if(!D||!D.items){toast('補完データ(items)未読込＝中断');return;}
  if(!confirm('第2回納品候補の不足分を、DBの正から階層へ補完します（目標'+D.totalItems+'件）。\n・既にある分は重複させません（feature_id/iidで判定）\n・先に自動スナップショット＝可逆\n実行しますか？'))return;
  var snap;try{snap=JSON.stringify({ts:_stamp(),state:state});localStorage.setItem(_D2_SNAP_KEY,snap);}catch(_){toast('スナップショット失敗＝中断');return;}
  try{download('補完前スナップ_'+_stamp()+'.json',snap,'application/json');}catch(_){}
  var haveF={},haveB={};
  state.layers.forEach(function(l){l.items.forEach(function(it){if(it.type==='boundary'){if(it.iid)haveB[it.iid]=1;}else if(it.feature_id)haveF[it.feature_id]=1;});});
  var before=_d2TotalItems(),added=0;
  D.items.forEach(function(x){
    if(x.k==='b'){ if(haveB[x.id])return; _d2Dest(x.pref,x.city).items.push({iid:x.id,type:'boundary',latlngs:x.latlngs,area:x.area,lat:x.lat,lng:x.lng,address:'敷地境界',status:'ok',userJudged:true,src:'handdraw'}); haveB[x.id]=1; added++; }
    else { if(haveF[x.id])return; _d2Dest(x.pref,x.city).items.push({iid:iid(),feature_id:x.id,lat:x.lat,lng:x.lng,address:'OK候補',status:'ok',userJudged:true,src:'d2complete'}); haveF[x.id]=1; added++; }
  });
  var after=_d2TotalItems();
  if(after!==before+added){ try{var s=JSON.parse(localStorage.getItem(_D2_SNAP_KEY));if(s&&s.state)state=s.state;}catch(_){} saveState();render(); toast('⚠ 補完数が不一致＝異常。元に戻しました'); return; }
  var df={},db2={};
  state.layers.forEach(function(l){if(!(l.meta&&l.meta.client==='第2回納品候補'))return;l.items.forEach(function(it){if(it.type==='boundary'){if(it.iid)db2[it.iid]=1;}else if(it.feature_id)df[it.feature_id]=1;});});
  var tot=Object.keys(df).length+Object.keys(db2).length;
  saveState();render();
  try{alert('✓ 不足分をDBから補完しました\n\n追加 '+added+' 件\n第2回納品候補の実数 = '+tot+'（目標'+D.totalItems+'）\n\n違和感があれば「↩ 移行を元に戻す」。');}catch(_){}
  toast('✓ 補完'+added+'件・第2回候補 実数'+tot);
}
/* 第2回納品候補の階層を、固定データ(items)に完全一致させる。ブラウザにある該当は移動/無い分はDBから補完/外れた分(後からNG等)は階層から外す。
   ピンク・納品退避は触らない。可逆。=移動/補完のちぐはぐを一括で正す確定操作。 */
function rebuildDelivery2(){
  var D=window.DELIVERY2;
  if(!D||!D.items){toast('データ未読込＝中断');return;}
  if(!confirm('第2回納品候補の階層を、確定データ '+D.totalItems+' 件に完全一致させます。\n・ブラウザにある該当分は移動、無い分はDBから補完\n・後からNGにした等で外れた分は階層から外します\n・手動ピック(ピンク)・納品退避は触りません\n・先に自動スナップショット＝可逆\n実行しますか？'))return;
  var snap;try{snap=JSON.stringify({ts:_stamp(),state:state});localStorage.setItem(_D2_SNAP_KEY,snap);}catch(_){toast('スナップショット失敗＝中断');return;}
  try{download('第2回再構築前スナップ_'+_stamp()+'.json',snap,'application/json');}catch(_){}
  var validF=D.byFeature||{},validB=D.byBoundary||{};
  var colF={},colB={};
  // 1) 一致itemを全レイヤー(非退避/非ピンク)から収集して取り出す。第2回宛先の非該当(=外れた分)は捨てる。
  state.layers.forEach(function(l){
    if(l.archived||_d2IsPink(l))return;
    var isDest=(l.meta&&l.meta.client==='第2回納品候補');
    var keep=[];
    l.items.forEach(function(it){
      if(it.type==='boundary'&&it.iid&&validB[it.iid]){if(!colB[it.iid])colB[it.iid]=it;return;}
      if(it.feature_id&&validF[it.feature_id]){if(!colF[it.feature_id])colF[it.feature_id]=it;return;}
      if(isDest)return; // 宛先に残った非該当(後からNG等)は階層から外す
      keep.push(it);
    });
    l.items=keep;
  });
  // 2) 512件を宛先へ配置(収集分優先・無ければDBの正から生成)
  var placed=0;
  D.items.forEach(function(x){
    var it;
    if(x.k==='b'){ it=colB[x.id]||{iid:x.id,type:'boundary',latlngs:x.latlngs,area:x.area,lat:x.lat,lng:x.lng,address:'敷地境界',status:'ok',userJudged:true,src:'handdraw'}; it.status=(it.status==='ng'?'ng':'ok'); }
    else { it=colF[x.id]||{iid:iid(),feature_id:x.id,lat:x.lat,lng:x.lng,address:'OK候補',status:'ok',userJudged:true,src:'d2'}; it.status='ok'; it.userJudged=true; }
    _d2Dest(x.pref,x.city).items.push(it); placed++;
  });
  // 3) 空になった第2回宛先レイヤーを除去
  state.layers=state.layers.filter(function(l){ if(l.meta&&l.meta.client==='第2回納品候補'&&l.items.length===0){if(state.solo===l.id)state.solo=null;return false;} return true; });
  var df={},db2={};
  state.layers.forEach(function(l){if(!(l.meta&&l.meta.client==='第2回納品候補'))return;l.items.forEach(function(it){if(it.type==='boundary'){if(it.iid)db2[it.iid]=1;}else if(it.feature_id)df[it.feature_id]=1;});});
  var tot=Object.keys(df).length+Object.keys(db2).length;
  saveState();render();
  try{alert('✓ 第2回納品候補を確定データに一致させました\n\n配置 '+placed+' 件\n第2回の実数 = '+tot+'（目標'+D.totalItems+'）\n\n違和感があれば「↩ 移行を元に戻す」。');}catch(_){}
  toast('✓ 第2回 再構築 実数'+tot+'（目標'+D.totalItems+'）');
}
// 2026-08-27の93件誤爆確認用レイヤー(openD2TodayReviewLayer)は確認作業完了のため2026-08-28削除。
/* v20260823(ドクター「静的ファイルへの依存自体をやめる」): window.DELIVERY2を、静的ファイル(delivery2-candidates.js)
   ではなくDBテーブル round2_pool(round=2) から毎回ライブで組み立てる。既存の全機能(_d2Dest/rebuildDelivery2/
   completeDelivery2FromDb/362表示ボタン/重複チェック_buildDupGrid等)はwindow.DELIVERY2.items等の形さえ同じなら
   そのまま動く=中身の出所だけ差し替える。起動時に読み、以後は昇格ボタン等でDBが変わるたびに呼び直す想定。 */
async function loadDelivery2FromDb(){
  var d=_gDb(); if(!d)return;
  var rows=[],frm=0;
  try{
    while(true){
      var r=await d.from('round2_pool').select('kind,source_iid,lat,lng,area_m2,latlngs,pref,city,status,round').eq('round',2).range(frm,frm+999);
      if(r&&r.error)throw new Error(r.error.message);
      var b=(r&&r.data)||[]; rows=rows.concat(b);
      if(b.length<1000)break; frm+=1000;
    }
  }catch(e){ try{console.warn('[round2_pool] 取得失敗:',e&&e.message||e);}catch(_){} return; }
  var items=[],byFeature={},byBoundary={},locCount={},order={},prefOrder=[];
  rows.forEach(function(r){
    if(r.kind==='boundary'){
      items.push({k:'b',id:r.source_iid,lat:r.lat,lng:r.lng,area:r.area_m2,latlngs:r.latlngs,pref:r.pref,city:r.city});
      byBoundary[r.source_iid]={pref:r.pref,city:r.city};
    }else{
      items.push({k:'f',id:r.source_iid,lat:r.lat,lng:r.lng,pref:r.pref,city:r.city});
      byFeature[r.source_iid]={pref:r.pref,city:r.city};
    }
    locCount[r.pref]=locCount[r.pref]||{}; locCount[r.pref][r.city]=(locCount[r.pref][r.city]||0)+1;
    order[r.pref]=order[r.pref]||[]; if(order[r.pref].indexOf(r.city)<0)order[r.pref].push(r.city);
    if(prefOrder.indexOf(r.pref)<0)prefOrder.push(r.pref);
  });
  window.DELIVERY2={gen:'live(round2_pool)',totalItems:items.length,totalLocations:items.length,items:items,byFeature:byFeature,byBoundary:byBoundary,locCount:locCount,order:order,prefOrder:prefOrder,manualGeoByCoord:{}};
  try{ _dupGridCache=null; }catch(_){}
  try{ render(); }catch(_){}
}
window.__gachoReloadD2=loadDelivery2FromDb;
/* v20260823(ドクター「決まった作業はシステムへプログラムで動く、AIから外出し」「ピンク→緑への昇格をボタン1つで」):
   OK判定済みの手動ピック(ピンク/オレンジ「手作業｜県｜市町村」/生ピンク「手動ピック（判定）」)を一括でround2_pool(緑・予備軍)へ昇格。
   区域不明(pref/city未解決)の分は昇格せず件数を報告する(勝手に区域不明のまま昇格させない)。 */
// ★2026-08-29是正(ドクター指摘「地図上、重複的なポリゴンをよく見かける」「392件も新規があるのはおかしい」):
// promotePinkToRound2はsource_iid(描画イベントごとに変わるID)一致でしか重複判定しておらず、同じ土地を
// 描き直した/複数回OKにした場合を見逃していた(実測: 392件中89件が実質同じ地点への重複)。
// 判定は座標distanceだけでなく面積の含有率(交差面積÷小さい方の面積)で行う＝手描きの線のブレ(1〜2m)は
// 面積比較なら吸収される。実測で「別区画」は含有率0%、「描き直しの重複」は91%以上と綺麗に分離した
// (中間のグレーゾーンなし)ため、閾値85%はどこにも際どくかからない安全な値。
var _GACHO_DEDUP_CONTAIN_TH=0.85, _GACHO_DEDUP_NEAR_M=30;
function _gachoPolyFromLatlngs(latlngs){
  try{
    if(typeof turf==='undefined'||!latlngs||latlngs.length<3)return null;
    var co=latlngs.map(function(p){return Array.isArray(p)?[p[1],p[0]]:[p.lng,p.lat];});
    var f=co[0],l=co[co.length-1]; if(f[0]!==l[0]||f[1]!==l[1])co.push(f);
    var poly=turf.polygon([co]);
    return turf.area(poly)>0?poly:null;
  }catch(_){return null;}
}
function _gachoContainRatio(pa,pb){
  try{
    var aa=turf.area(pa),ab=turf.area(pb); if(!aa||!ab)return 0;
    var inter=turf.intersect(turf.featureCollection([pa,pb]));
    if(!inter)return 0;
    return turf.area(inter)/Math.min(aa,ab);
  }catch(_){return 0;}
}
function _gachoHav(a,b,c,d){
  var R=6371000,rad=Math.PI/180;
  var dlat=(c-a)*rad,dlng=(d-b)*rad;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)*Math.sin(dlat/2)+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dlng/2)*Math.sin(dlng/2))));
}
// candsを、poolRows(既存round2_pool)およびcands同士で空間重複除去する。戻り値=重複を除いた新規のみ。
function _gachoDedupSpatial(cands,poolRows){
  var CELL=0.0005,grid={};
  function cellKey(la,ln){return Math.floor(la/CELL)+'_'+Math.floor(ln/CELL);}
  function addGrid(o){var k=cellKey(o.lat,o.lng);(grid[k]=grid[k]||[]).push(o);}
  poolRows.forEach(function(r){
    if(r.lat==null||r.lng==null)return;
    addGrid({lat:r.lat,lng:r.lng,kind:r.kind,poly:(r.kind==='boundary'&&r.latlngs)?_gachoPolyFromLatlngs(r.latlngs):null});
  });
  var kept=[];
  cands.forEach(function(c){
    if(c.lat==null||c.lng==null){kept.push(c);return;}
    var poly=(c.kind==='boundary')?_gachoPolyFromLatlngs(c.latlngs):null;
    var cy=Math.floor(c.lat/CELL),cx=Math.floor(c.lng/CELL),near=[];
    for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++)near=near.concat(grid[(cy+dy)+'_'+(cx+dx)]||[]);
    var isDup=false;
    for(var i=0;i<near.length;i++){
      var o=near[i];
      if(_gachoHav(c.lat,c.lng,o.lat,o.lng)>_GACHO_DEDUP_NEAR_M)continue;
      if(poly&&o.poly){ if(_gachoContainRatio(poly,o.poly)>=_GACHO_DEDUP_CONTAIN_TH){isDup=true;break;} }
      else if(!poly&&!o.poly){ isDup=true;break; } // 筆(feature)同士は30m以内なら同一地点とみなす
      else if(poly&&!o.poly){ try{ if(turf.booleanPointInPolygon(turf.point([o.lng,o.lat]),poly)){isDup=true;break;} }catch(_){} }
      else if(!poly&&o.poly){ try{ if(turf.booleanPointInPolygon(turf.point([c.lng,c.lat]),o.poly)){isDup=true;break;} }catch(_){} }
    }
    if(isDup)return;
    addGrid({lat:c.lat,lng:c.lng,kind:c.kind,poly:poly});
    kept.push(c);
  });
  return kept;
}
// ★2026-08-29(ドクター指摘「同じ処理をあちこちに書くな」): OK判定(ai_ok_labels)から「未昇格の真の新規」を
// 算出するロジックは、昇格実行(promotePinkToRound2)と地図プレビュー(previewNewOkOnMap)の両方で使うため、
// ここに1本化する。片方だけ直して数字がズレる事故を防ぐ。
async function _gachoComputeNewOkCandidates(){
  var d=_gDb(); if(!d)throw new Error('DB未接続');
  var okRows=[];
  var frm=0;
  while(true){
    var r=await d.from('ai_ok_labels').select('member_fids,lat,lng,memo,source').in('source',['gacho_ok','handdraw_boundary']).range(frm,frm+999);
    if(r&&r.error)throw new Error(r.error.message);
    var b=(r&&r.data)||[]; okRows=okRows.concat(b); if(b.length<1000)break; frm+=1000;
  }
  var ngSet={};
  var frmN=0;
  while(true){ var rN=await d.from('farmland_ng_list').select('feature_id').range(frmN,frmN+999); var bN=(rN&&rN.data)||[]; bN.forEach(function(x){ngSet[x.feature_id]=1;}); if(bN.length<1000)break; frmN+=1000; }

  var pink=[]; // {kind,sourceIid,lat,lng,area,latlngs}
  okRows.forEach(function(row){
    var fid=(row.member_fids&&row.member_fids[0])||null; if(!fid)return;
    if(row.source==='handdraw_boundary'){
      var m=null; try{m=row.memo?JSON.parse(row.memo):null;}catch(e){}
      if(!m||!Array.isArray(m.latlngs)||m.latlngs.length<3)return;
      pink.push({kind:'boundary',sourceIid:fid,lat:row.lat,lng:row.lng,area:(m.area!=null?m.area:null),latlngs:m.latlngs});
    } else {
      if(ngSet[fid])return;
      pink.push({kind:'feature',sourceIid:fid,lat:row.lat,lng:row.lng,area:null,latlngs:null});
    }
  });

  var existing={},poolRows=[];
  var frm2=0;
  while(true){ var r2=await d.from('round2_pool').select('source_iid,kind,lat,lng,latlngs').range(frm2,frm2+999); var er=(r2&&r2.data)||[]; er.forEach(function(x){existing[x.source_iid]=1;}); poolRows=poolRows.concat(er); if(er.length<1000)break; frm2+=1000; }

  var alreadyById=pink.filter(function(p){return p.sourceIid&&existing[p.sourceIid];}).length;
  var notYetById=pink.filter(function(p){return !(p.sourceIid&&existing[p.sourceIid]);});
  // ★2026-08-29是正: source_iid一致だけでなく、同じ土地を描き直した/複数回OKにした空間的重複も除去する。
  var deduped=_gachoDedupSpatial(notYetById,poolRows);
  var dupContent=notYetById.length-deduped.length;
  return {pink:pink,alreadyById:alreadyById,dupContent:dupContent,deduped:deduped};
}
// ドクターが「119件を地図上に表してくれ、私がチェックする」と要求(2026-08-29)＝昇格を実行する前に、
// 対象を地図上の専用レイヤーで目視確認できるようにする。round2_poolへは一切書き込まない(プレビューのみ)。
function previewNewOkOnMap(){
  toast('未昇格の新規候補を集計中…');
  _gachoComputeNewOkCandidates().then(function(res){
    var deduped=res.deduped;
    var name='未昇格OK候補(要確認)';
    var l=state.layers.filter(function(x){return x.name===name;})[0];
    if(!l){l={id:uid(),name:name,color:'#22d3ee',visible:true,active:false,items:[],meta:{preview:true}};state.layers.push(l);}
    // ★2026-08-29是正(ドクター報告「田原市のフラグが消えた」「フラグがなくポリゴン表示だけになっている
    // 所が多数ある」): status:'ok'を付けるとレンダラーが強制的に緑色スタイルへ上書きし(点も境界も)、
    // さらにstate.solo=l.idが他の全レイヤー(第2回納品候補・手動ピック等)を地図全体で非表示にしていた。
    // 他レイヤーを一切隠さず、シアン色のまま重ねて表示するよう変更する。
    // ★2026-08-29再修正(ドクター報告「537件がシアンに変わっただけ」): 上の是正は今後この関数がsoloを
    // 設定しなくなるだけで、以前の(修正前の)クリックでlocalStorageに残ったstate.solo=このレイヤーidは
    // 解除していなかった。残留していれば必ずここで解除し、他の全レイヤーを確実に再表示する。
    if(state.solo===l.id)state.solo=null;
    l.items=deduped.map(function(p){
      if(p.kind==='boundary'){
        return {iid:p.sourceIid,type:'boundary',latlngs:p.latlngs,area:p.area,lat:p.lat,lng:p.lng,address:'未昇格(要確認)',userJudged:true,src:'preview'};
      }
      return {iid:uid(),feature_id:p.sourceIid,lat:p.lat,lng:p.lng,address:'未昇格(要確認)',userJudged:true,src:'preview'};
    });
    l.visible=true; l.active=true;
    saveState(); render();
    // ★2026-08-29是正(ドクター報告「フラグが表示されない」): 候補が奈良/三重/愛知/福岡など複数県に
    // 散らばっているとfitBoundsが日本全体レベルまでズームアウトし、7pxの丸マーカーが実質見えなくなる。
    // 範囲が広すぎる(1.5度=概ね1県超)時は自動ズームせず、「画層を検索して絞る」欄で県ごとに追わせる。
    var wideSpread=false;
    try{
      var pts=deduped.filter(function(p){return p.lat!=null&&p.lng!=null;}).map(function(p){return [p.lat,p.lng];});
      if(pts.length){
        var lats=pts.map(function(p){return p[0];}),lngs=pts.map(function(p){return p[1];});
        var spread=Math.max(Math.max.apply(null,lats)-Math.min.apply(null,lats),Math.max.apply(null,lngs)-Math.min.apply(null,lngs));
        if(spread<1.5){ map.fitBounds(pts,{maxZoom:13}); } else { wideSpread=true; }
      }
    }catch(_){}
    var msg='🔎 未昇格OK候補 '+deduped.length+'件をシアン色レイヤー「'+name+'」に表示しました（round2_poolへはまだ書き込んでいません）'+(wideSpread?'\n\n※候補が複数県にまたがるため自動ズームしていません。右の「画層を検索して絞る」に「未昇格」と入力して県ごとに確認してください。':'');
    try{alert(msg);}catch(_){}
    toast(msg);
  }).catch(function(e){ toast('⚠ プレビュー集計に失敗: '+(e&&e.message||e)); });
}
window.__gachoPreviewNewOk=previewNewOkOnMap;
async function promotePinkToRound2(){
  var d=_gDb(); if(!d){toast('DB未接続＝中断');return;}
  var res;
  try{ res=await _gachoComputeNewOkCandidates(); }
  catch(e){ toast('⚠ 判定データの取得に失敗＝中断: '+(e&&e.message||e)); return; }
  var pink=res.pink,alreadyById=res.alreadyById,dupContent=res.dupContent,deduped=res.deduped;
  if(!pink.length){toast('OK判定済みの案件がありません');return;}
  var newCount=deduped.length;
  if(!newCount){toast('新規の昇格対象はありません(該当'+pink.length+'件のうち昇格済み'+alreadyById+'件・重複描画'+dupContent+'件)');return;}
  // ★2026-08-28是正(ドクター指摘): ⑤→⑥(OK判定→予備軍プール保存)の時点ではクライアントは未定でよい。
  // 予備軍はクライアントを問わない共有プールとして保存し、「どのクライアントへ納品するか」は後で別途
  // ⑥→⑦の操作で決める。ここでclient_idを書き込むのは段階の先取りだったため削除した。
  if(!confirm('OK判定済みのうち新規 '+newCount+'件を、予備軍(round2_pool・緑)へ昇格します。\n（既に昇格済みの'+alreadyById+'件・同一箇所への重複描画'+dupContent+'件は対象外＝二重登録しません）\n・区域不明(県市町村未解決)は対象外にします\n実行しますか？'))return;

  // 面積が無いfeature項目(通常筆のgacho_ok)はfarmland_snapshotsから引く(ai_ok_labelsは面積を持たないため)。
  var needArea=deduped.filter(function(p){return p.kind==='feature'&&p.area==null;}).map(function(p){return p.sourceIid;});
  var areaMap={};
  for(var ai=0;ai<needArea.length;ai+=100){
    var achunk=needArea.slice(ai,ai+100);
    try{
      var ar=await d.from('farmland_snapshots').select('feature_id,area_sqm').in('feature_id',achunk);
      ((ar&&ar.data)||[]).forEach(function(x){areaMap[x.feature_id]=x.area_sqm;});
    }catch(e){}
  }

  var rows=[],skippedUnknown=0;
  for(var _pi=0;_pi<deduped.length;_pi++){
    var p=deduped[_pi];
    var sourceIid=p.sourceIid;
    if(!sourceIid)continue;
    var pref=null,city=null;
    if(p.lat!=null&&p.lng!=null){
      try{ var g=await _resolveManualGeo(Number(p.lat),Number(p.lng)); if(g){pref=g.pref;city=g.city;} }catch(_){}
    }
    if(!pref||!city||pref==='区域不明'||city==='区域不明'){skippedUnknown++;continue;}
    var area=(p.area!=null?p.area:areaMap[sourceIid]);
    rows.push({kind:p.kind,source_iid:sourceIid,lat:p.lat,lng:p.lng,area_m2:(area!=null?area:null),latlngs:(p.latlngs||null),pref:pref,city:city,status:'reserve',round:2});
  }

  if(!rows.length){toast('昇格対象0件(区域不明'+skippedUnknown+'件・昇格済み'+alreadyById+'件・重複描画'+dupContent+'件はスキップ)');return;}

  var inserted=0,errs=[];
  var BATCH=100;
  for(var i=0;i<rows.length;i+=BATCH){
    var chunk=rows.slice(i,i+BATCH);
    try{
      var res=await d.from('round2_pool').insert(chunk).select('id');
      if(res&&res.error)throw new Error(res.error.message);
      inserted+=((res&&res.data)||[]).length;
    }catch(e){ errs.push(e&&e.message||e); }
  }
  await loadDelivery2FromDb();
  // v20260831b(ドクター指示・2段階検定): 昇格(2回目確認)実行後、紫フラグ画面の「2回目確認待ち」カウンターを
  // 実データで再計算(区域不明でスキップされた分は待機のまま残る=正しい)。
  try{ if(typeof window._ghRefreshPromoWaiting==='function')window._ghRefreshPromoWaiting(); }catch(_){}
  // v20260831c: 一括昇格(=「一括OK」)でも最終確認チェックの点滅状態を解除する(個別確認中だった分も含め終了扱い)。
  if(_finalCheckBlinking){ _stopFinalPromotionBlink(); var _btn=document.getElementById('gachoFinalCheck'); if(_btn){_btn.textContent='🔴 最終納品昇格チェック';_btn.classList.remove('on');_btn.style.background='rgba(250,204,21,.15)';_btn.style.borderColor='#eab308';} }
  var msg='⬆ 昇格 '+inserted+'件（区域不明でスキップ'+skippedUnknown+'件・昇格済みでスキップ'+alreadyById+'件・重複描画でスキップ'+dupContent+'件'+(errs.length?'・エラー'+errs.length+'件':'')+'）';
  try{alert(msg);}catch(_){}
  toast(msg);
}
window.__gachoPromoteToRound2=promotePinkToRound2;
/* ===== v20260831c(ドクター指示・人間第2段階チェック): 「最終納品昇格チェック」=1回目OK済み・予備群未昇格の
   案件を地図上で点滅させ、①個別に1件だけ確認して昇格 ②一括昇格(既存promotePinkToRound2を流用)のどちらかで
   最終確定する。_finalCheckSet(fid→候補データ)はスコアカードの個別昇格ボタン表示判定にも使う。 ===== */
async function toggleFinalPromotionCheck(){
  var btn=document.getElementById('gachoFinalCheck');
  if(_finalCheckBlinking){ _stopFinalPromotionBlink(); if(btn){btn.textContent='🔴 最終納品昇格チェック';btn.classList.remove('on');btn.style.background='rgba(250,204,21,.15)';btn.style.borderColor='#eab308';} return; }
  var d=_gDb(); if(!d){toast('DB未接続＝中断');return;}
  var res;
  try{ res=await _gachoComputeNewOkCandidates(); }
  catch(e){ toast('⚠ 取得失敗＝中断: '+(e&&e.message||e)); return; }
  var deduped=res.deduped;
  if(!deduped.length){ toast('2回目確認待ちの案件はありません(既に昇格済みか、OK判定がありません)'); return; }
  var set={}; deduped.forEach(function(p){ if(p.sourceIid)set[p.sourceIid]=p; });
  _finalCheckSet=set;
  var found=0;
  for(var fid in set){ var mk=_reviewMarks[fid]; if(mk){ found++; _blinkStart(fid,mk); } }
  _finalCheckBlinking=true;
  if(btn){btn.textContent='⏹ チェック終了（点滅中'+found+'/'+deduped.length+'件）';btn.classList.add('on');btn.style.background='rgba(250,204,21,.35)';btn.style.borderColor='#facc15';}
  toast('🔴 2回目確認待ち '+deduped.length+'件のうち、現在地図上で見えている'+found+'件を点滅表示しました。フラグをクリックして個別確認→「予備群へ昇格」、または上の⬆ボタンで一括昇格してください。');
}
function _blinkStart(fid,mk){
  if(!mk||!mk.setStyle)return;
  if(mk._finalCheckTimer)return; // 二重登録防止
  var orig={color:mk.options.color,weight:mk.options.weight,radius:mk.options.radius,fillOpacity:mk.options.fillOpacity};
  _finalCheckOrig[fid]=orig;
  var on=false;
  mk._finalCheckTimer=setInterval(function(){
    on=!on;
    try{ mk.setStyle(on?{color:'#facc15',weight:4,radius:(orig.radius||7)+4,fillOpacity:1}:{color:orig.color,weight:orig.weight,radius:orig.radius,fillOpacity:orig.fillOpacity}); }catch(_){}
  },450);
}
function _blinkStop(fid){
  var mk=_reviewMarks[fid]; if(!mk)return;
  if(mk._finalCheckTimer){ clearInterval(mk._finalCheckTimer); mk._finalCheckTimer=null; }
  var orig=_finalCheckOrig[fid];
  if(orig&&mk.setStyle){ try{ mk.setStyle({color:orig.color,weight:orig.weight,radius:orig.radius,fillOpacity:orig.fillOpacity}); }catch(_){} }
  delete _finalCheckOrig[fid];
}
function _stopFinalPromotionBlink(){
  if(_finalCheckSet){ for(var fid in _finalCheckSet){ _blinkStop(fid); } }
  _finalCheckBlinking=false; _finalCheckSet=null;
}
// 個別に1件だけ最終確認→round2_pool(予備群)へ昇格。promotePinkToRound2の単件版(同じ区域解決/面積補完ロジック)。
async function promoteOneToRound2(fid){
  if(!_finalCheckSet||!_finalCheckSet[fid]){ toast('この筆は2回目確認待ちではありません(先に「🔴 最終納品昇格チェック」を押してください)'); return; }
  var d=_gDb(); if(!d){toast('DB未接続＝中断');return;}
  var p=_finalCheckSet[fid];
  var pref=null,city=null;
  if(p.lat!=null&&p.lng!=null){ try{ var g=await _resolveManualGeo(Number(p.lat),Number(p.lng)); if(g){pref=g.pref;city=g.city;} }catch(_){} }
  if(!pref||!city||pref==='区域不明'||city==='区域不明'){ toast('⚠ 区域(県市町村)が特定できないため個別昇格できません。座標を確認してください。'); return; }
  var area=p.area;
  if(area==null&&p.kind==='feature'){
    try{ var ar=await d.from('farmland_snapshots').select('area_sqm').eq('feature_id',p.sourceIid).limit(1); area=(ar&&ar.data&&ar.data[0]&&ar.data[0].area_sqm)||null; }catch(_){}
  }
  try{
    var ir=await d.from('round2_pool').insert({kind:p.kind,source_iid:p.sourceIid,lat:p.lat,lng:p.lng,area_m2:(area!=null?area:null),latlngs:(p.latlngs||null),pref:pref,city:city,status:'reserve',round:2}).select('id');
    if(ir&&ir.error)throw new Error(ir.error.message);
  }catch(e){ toast('⚠ 昇格失敗: '+(e&&e.message||e)); return; }
  _blinkStop(fid); delete _finalCheckSet[fid];
  var remain=Object.keys(_finalCheckSet).length;
  var m=getMap(); if(m)m.closePopup();
  await loadDelivery2FromDb();
  try{ if(typeof window._ghRefreshPromoWaiting==='function')window._ghRefreshPromoWaiting(); }catch(_){}
  toast('✅ 予備群(round2_pool)へ昇格しました。2回目確認待ち残り '+remain+'件');
  if(remain===0){ _finalCheckBlinking=false; var btn=document.getElementById('gachoFinalCheck'); if(btn){btn.textContent='🔴 最終納品昇格チェック';btn.classList.remove('on');btn.style.background='rgba(250,204,21,.15)';btn.style.borderColor='#eab308';} toast('🎉 2回目確認待ちが全て完了しました'); }
}
/* ===== ⑥→⑦(ドクター指示・2026-08-28): 予備軍(round2_pool・クライアント未定の共有プール)から
   特定クライアントへ抽出し、client_delivery_items(仮納品)へ登録する。ここで初めてID(client_id)の
   紐付けが発生する。⑤→⑥(promotePinkToRound2)とは明確に別の操作。 ===== */
// ★2026-08-30(ドクター「毎回AIに説明するのでなく、市町村別に何件あるか表示してクリックで選び納品書へ
//   まとめる仕組みを作れ」): 旧実装は「未割当を全部まとめて1クライアントへ」だけの一括操作だった。
//   市町村ごとの件数を見せ、チェックボックスで選んだ分だけを抽出→仮納品登録→Excel(第1回と同じ書式)まで
//   1つの画面で完結させる。件数の数え方(市町村別カウント)はここに1本化=AIが毎回手計算しない。
async function extractPoolToClient(){
  var d=_gDb(); if(!d){toast('DB未接続＝中断');return;}
  var clients=[];
  try{
    var cr=await d.from('clients').select('id,name').eq('status','active').order('name');
    if(cr&&cr.error)throw new Error(cr.error.message);
    clients=(cr&&cr.data)||[];
  }catch(e){ toast('⚠ クライアント一覧の取得に失敗＝中断: '+(e&&e.message||e)); return; }
  if(!clients.length){toast('稼働中のクライアントがありません(clientsテーブルを確認してください)');return;}

  var unassigned=[];
  try{
    var frm=0;
    while(true){
      var r=await d.from('round2_pool').select('id,kind,source_iid,lat,lng,area_m2,latlngs,pref,city,chiban,address,status').is('client_id',null).eq('round',2).range(frm,frm+999);
      if(r&&r.error)throw new Error(r.error.message);
      var b=(r&&r.data)||[]; unassigned=unassigned.concat(b); if(b.length<1000)break; frm+=1000;
    }
  }catch(e){ toast('⚠ 予備軍の取得に失敗＝中断: '+(e&&e.message||e)); return; }
  if(!unassigned.length){toast('クライアント未割当の予備軍がありません');return;}

  var groups={}; var order=[]; var prefOrder=[]; var prefTotal={};
  unassigned.forEach(function(p){
    var pref=p.pref||'(県不明)', city=p.city||'(市町村不明)';
    var k=pref+'|'+city;
    if(!groups[k]){groups[k]={pref:pref,city:city,items:[]};order.push(k);}
    groups[k].items.push(p);
    if(prefOrder.indexOf(pref)<0)prefOrder.push(pref);
    prefTotal[pref]=(prefTotal[pref]||0)+1;
  });
  prefOrder.sort(function(a,b){return prefTotal[b]-prefTotal[a];});
  order.sort(function(a,b){
    var pa=groups[a].pref, pb=groups[b].pref;
    if(pa!==pb) return prefOrder.indexOf(pa)-prefOrder.indexOf(pb);
    return groups[b].items.length-groups[a].items.length;
  });
  _showPoolExtractModal(d,clients,groups,order,prefOrder,prefTotal,unassigned.length);
}
window.__gachoExtractPoolToClient=extractPoolToClient;

// ★2026-08-30(ドクター提示イメージ「表計算の様に県ごとの小計・合計・クライアント選択」): 単なる
// チェックリストでなく、県→市町村の階層＋小計行＋合計行＋クライアント選択プルダウンを1画面に。
// 県の行にチェックを入れると、その県の全市町村が一括で選択される(逆も可)。
function _showPoolExtractModal(d,clients,groups,order,prefOrder,prefTotal,grandTotal){
  var ex=document.getElementById('gachoPoolExtract');if(ex){try{ex.remove();}catch(_){}}
  var ov=document.createElement('div');ov.id='gachoPoolExtract';
  ov.style.cssText='position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;';
  var rowsHtml='';
  prefOrder.forEach(function(pref){
    rowsHtml+='<tr class="_pex-pref-row" data-pref="'+pref+'" style="background:#161b22">'
      +'<td style="padding:5px 8px"><input type="checkbox" class="_pex-pref-cb" data-pref="'+pref+'" style="width:15px;height:15px;accent-color:#a855f7"></td>'
      +'<td style="padding:5px 8px;font-weight:800" colspan="2">'+pref+'</td>'
      +'<td style="padding:5px 8px;text-align:right;font-family:monospace;color:#8b949e">計'+prefTotal[pref]+'</td></tr>';
    order.filter(function(k){return groups[k].pref===pref;}).forEach(function(k){
      var g=groups[k];
      rowsHtml+='<tr class="_pex-row" data-k="'+k+'" data-pref="'+pref+'" data-n="'+g.items.length+'">'
        +'<td style="padding:4px 8px 4px 22px"><input type="checkbox" class="_pex-cb" data-k="'+k+'" data-pref="'+pref+'" style="width:15px;height:15px;accent-color:#a855f7"></td>'
        +'<td style="padding:4px 8px" colspan="2">'+g.city+'</td>'
        +'<td style="padding:4px 8px;text-align:right;font-family:monospace">'+g.items.length+'件</td></tr>';
    });
  });
  ov.innerHTML='<div style="background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:18px 20px;width:460px;max-height:86vh;display:flex;flex-direction:column;color:#e6edf3;font:14px/1.5 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.6)">'
    +'<div style="font-weight:800;font-size:15px;margin-bottom:10px">📤 予備軍をクライアントへ抽出</div>'
    +'<div style="margin-bottom:10px"><label style="font-size:11px;color:#8b949e">クライアント名</label>'
      +'<select id="_pexClient" style="width:100%;padding:8px;border-radius:6px;border:1px solid #30363d;background:#161b22;color:#e6edf3;font-size:13px;margin-top:3px">'
      +clients.map(function(c,i){return '<option value="'+i+'">'+c.name+'</option>';}).join('')+'</select></div>'
    +'<div style="display:flex;gap:6px;margin-bottom:8px">'
      +'<button id="_pexAll" style="flex:1;padding:6px;border-radius:6px;border:1px solid #30363d;background:#161b22;color:#8b949e;font-size:11px;cursor:pointer">全選択</button>'
      +'<button id="_pexNone" style="flex:1;padding:6px;border-radius:6px;border:1px solid #30363d;background:#161b22;color:#8b949e;font-size:11px;cursor:pointer">全解除</button>'
    +'</div>'
    +'<div style="overflow-y:auto;border:1px solid #21262d;border-radius:8px;flex:1">'
      +'<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="position:sticky;top:0;background:#0d1117"><th></th><th colspan="2" style="text-align:left;padding:5px 8px;color:#8b949e;font-size:11px">県／市町村</th><th style="text-align:right;padding:5px 8px;color:#8b949e;font-size:11px">件数</th></tr></thead>'
      +'<tbody>'+rowsHtml+'</tbody></table>'
    +'</div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;border-top:1px solid #30363d">'
      +'<tr><td style="padding:6px 8px" colspan="3">選択分 小計</td><td style="padding:6px 8px;text-align:right;font-family:monospace;color:#a855f7;font-weight:800" id="_pexSubtotal">0</td></tr>'
      +'<tr><td style="padding:6px 8px;color:#8b949e" colspan="3">予備軍 合計(未割当)</td><td style="padding:6px 8px;text-align:right;font-family:monospace;color:#8b949e">'+grandTotal+'</td></tr>'
    +'</table>'
    +'<div style="display:flex;gap:8px;margin-top:10px">'
      +'<button id="_pexGo" style="flex:1;background:#238636;border:1px solid #2ea043;color:#fff;border-radius:8px;padding:10px;font-weight:700;cursor:pointer" disabled>✓ 選択分を仮納品登録</button>'
      +'<button id="_pexCancel" style="flex:0.6;background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:8px;padding:10px;cursor:pointer">キャンセル</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  function close(){try{ov.remove();}catch(_){}}
  function updCount(){
    var n=0; ov.querySelectorAll('._pex-cb:checked').forEach(function(cb){n+=parseInt(cb.closest('._pex-row').dataset.n,10)||0;});
    document.getElementById('_pexSubtotal').textContent=n;
    document.getElementById('_pexGo').disabled=(n===0);
    // 県チェックボックスの状態(全ON/一部/全OFF)を子の状態から同期
    prefOrder.forEach(function(pref){
      var kids=ov.querySelectorAll('._pex-cb[data-pref="'+pref+'"]');
      var pcb=ov.querySelector('._pex-pref-cb[data-pref="'+pref+'"]');
      if(!pcb||!kids.length)return;
      var checked=0; kids.forEach(function(cb){if(cb.checked)checked++;});
      pcb.checked=(checked===kids.length); pcb.indeterminate=(checked>0&&checked<kids.length);
    });
  }
  ov.querySelectorAll('._pex-cb').forEach(function(cb){cb.onchange=updCount;});
  ov.querySelectorAll('._pex-pref-cb').forEach(function(pcb){
    pcb.onchange=function(){
      var on=pcb.checked;
      ov.querySelectorAll('._pex-cb[data-pref="'+pcb.dataset.pref+'"]').forEach(function(cb){cb.checked=on;});
      updCount();
    };
  });
  document.getElementById('_pexAll').onclick=function(){ov.querySelectorAll('._pex-cb,._pex-pref-cb').forEach(function(cb){cb.checked=true;});updCount();};
  document.getElementById('_pexNone').onclick=function(){ov.querySelectorAll('._pex-cb,._pex-pref-cb').forEach(function(cb){cb.checked=false;});updCount();};
  document.getElementById('_pexCancel').onclick=close;
  document.getElementById('_pexGo').onclick=async function(){
    var keys=[]; ov.querySelectorAll('._pex-cb:checked').forEach(function(cb){keys.push(cb.dataset.k);});
    if(!keys.length)return;
    var ci=parseInt(document.getElementById('_pexClient').value,10);
    var client=clients[ci];
    var picked=[]; keys.forEach(function(k){picked=picked.concat(groups[k].items);});
    close();
    await _runPoolExtract(d,client,picked);
  };
}

async function _runPoolExtract(d,client,picked){
  if(!confirm('選択した '+picked.length+'件を、「'+client.name+'」へ抽出し仮納品登録します。\n・この操作でround2_poolの各行にclient_idが確定します(ここで初めてID紐付け)\n実行しますか？'))return;
  var deliveryId=null;
  try{
    var per=new Date().toISOString().slice(0,10);
    var dr=await d.from('client_deliveries').insert({client_id:client.id,period:per,status:'draft',notes:'予備軍からの抽出(市町村選択・'+picked.length+'件)'}).select();
    if(dr&&dr.data&&dr.data[0])deliveryId=dr.data[0].id;
  }catch(e){}
  if(!deliveryId){toast('⚠ 納品ロットの作成に失敗＝中断');return;}

  var inserted=0,errs=0,done=[];
  for(var i=0;i<picked.length;i++){
    var p=picked[i];
    try{
      var ir=await d.from('client_delivery_items').insert({client_id:client.id,delivery_id:deliveryId,pref:p.pref,city:p.city,chiban:p.chiban,address:p.address,area_m2:p.area_m2,lat:p.lat,lng:p.lng,source:'round2_pool',status:'tentative',ai_note:'round2_pool id:'+p.id+' kind:'+p.kind+' source_iid:'+p.source_iid});
      if(ir&&ir.error)throw new Error(ir.error.message);
      var ur=await d.from('round2_pool').update({client_id:client.id}).eq('id',p.id);
      if(ur&&ur.error)throw new Error(ur.error.message);
      inserted++; done.push(p);
    }catch(e){ errs++; }
  }
  var m='📤 '+client.name+'へ抽出: '+inserted+'件'+(errs?'・エラー'+errs+'件':'');
  toast(m);
  try{await loadDelivery2FromDb();}catch(_){}
  // ★第1回納品と同じ書式(NO/緯度経度/住所/地番/面積/地目/信頼/備考)でExcelをブラウザから直接ダウンロード。
  try{ _exportPoolExtractExcel(client,done); }catch(e){ console.warn('[extract] excel出力skip:',e); }
  try{alert(m+'\nExcelのダウンロードも開始しました。');}catch(_){}
}

function _exportPoolExtractExcel(client,items){
  if(typeof XLSX==='undefined'){toast('⚠ Excel出力ライブラリ未読込のためスキップ');return;}
  var aoa=[['NO','緯度経度','住所','地番','面積','地目','信頼','備考']];
  items.forEach(function(p,i){
    aoa.push([i+1, (p.lat!=null?p.lat+', '+p.lng:''), p.address||((p.pref||'')+(p.city||'')), p.chiban||'', p.area_m2||'', '', '', 'round2_pool予備軍抽出('+(p.city||'')+')']);
  });
  var ws=XLSX.utils.aoa_to_sheet(aoa);
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'納品案件');
  var fname=client.name+'_納品案件_'+new Date().toISOString().slice(0,10)+'_'+items.length+'件.xlsx';
  XLSX.writeFile(wb,fname);
}
/* v20260821m(ドクター復旧): ダウンロード済みスナップJSONファイルを選んで直接復元(ブラウザ内が壊れていても、確認済みの09:13ファイルから手描き境界を戻す)。 */
function restoreFromFile(){
  try{
    var inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';
    inp.onchange=function(){var f=inp.files&&inp.files[0];if(!f)return;var rd=new FileReader();
      rd.onload=function(){try{
        var snap=JSON.parse(rd.result);
        var st=(snap&&snap.state)?snap.state:(snap&&snap.layers?snap:null);
        if(st&&st.layers&&st.layers.length){
          // v20260821m(ドクター): 置き換えでなくマージ。今の作業(田原等)は残し、ファイルの手描き境界・判定を「足す」だけ。
          var cur={}; state.layers.forEach(function(l){(l.items||[]).forEach(function(it){if(it.iid)cur[it.iid]=1;});});
          var added=0,bn=0;
          st.layers.forEach(function(sl){
            var tl=state.layers.filter(function(x){return x.name===sl.name;})[0];
            if(!tl){ tl={id:uid(),name:sl.name,color:sl.color||'#f59e0b',visible:(sl.visible!==false),active:false,items:[],judgeOnly:sl.judgeOnly,archived:sl.archived}; state.layers.push(tl); }
            (sl.items||[]).forEach(function(it){ if(it.iid&&cur[it.iid])return; tl.items.push(it); cur[it.iid]=1; added++; if(it.type==='boundary')bn++; });
          });
          saveState(); render();
          try{alert('復元(マージ)しました。\n追加 '+added+'件（うち手描き境界 '+bn+'件）。\n今の田原などの作業は残したまま、朝の分を足しました。DBの判定も自動で乗ります。');}catch(_){}
          toast('JSONマージ復元: 追加'+added+'・境界'+bn);
          try{if(typeof loadDbJudgments==='function'){loadDbJudgments();setTimeout(loadDbJudgments,2000);}}catch(_){}
        } else { alert('このJSONに復元データ(state.layers)がありません'); }
      }catch(e){ alert('JSON読込失敗: '+((e&&e.message)||e)); }};
      rd.readAsText(f,'utf-8');
    };
    inp.click();
  }catch(e){ toast('ファイル選択に失敗'); }
}

/* 0画層(既存すべて)の表示切替: base地図タイルと画層paneを除く全paneをまとめて隠す/戻す */
function applyBase0(){var m=getMap();if(!m)return;var panes=m.getPanes();Object.keys(panes).forEach(function(name){if(name==='mapPane'||name==='tilePane'||name==='gachoPane'||name==='popupPane'||name==='noshinPane'||name==='cityPlanPane')return;try{panes[name].style.display=state.base0Visible?'':'none';}catch(_){}});} // v20260821z33: farmlandPane(農地ナビ)も0画層OFFで隠す=ゴミ非表示。農振/都市計画(規制)は残す
/* 面積ラベル: ズームを引いた時(z<15)や手動OFF時はまとめて非表示にして地図を邪魔しない */
function updateAreaLabels(){var m=getMap();if(!m)return;var hide=(!state.showArea)||(m.getZoom()<15);try{m.getContainer().classList.toggle('gacho-noarea',hide);}catch(_){}}

/* ===== v20260819b (ドクター①): フラグにホバー→その場に最新衛星(Google Static Maps)画像 =====
   目視での緑→赤除外を高速化。window.GMAP_STATIC_KEY(gmap-config.js)が未設定なら完全にno-op(既存挙動不変)。
   ※Googleマップは目視専用(規約でAI学習投入禁止)。取得画像は表示のみ・保存/学習に回さない。
   ※画像はホバー時に遅延読込→ブラウザキャッシュで2回目以降は即時。先読み(zero-wait)は費用計測後に追加予定。 */
function _gmKey(){return (typeof window!=='undefined'&&window.GMAP_STATIC_KEY)||'';}
function _gmStaticUrl(lat,lng){
  var k=_gmKey();if(!k)return '';
  return 'https://maps.googleapis.com/maps/api/staticmap?center='+lat+','+lng
    +'&zoom=20&size=640x640&scale=2&maptype=satellite&markers=color:red%7C'+lat+','+lng
    +'&key='+encodeURIComponent(k);
}
function _gmEnsureCss(){
  if(typeof document==='undefined'||document.getElementById('gm-hover-css'))return;
  var s=document.createElement('style');s.id='gm-hover-css';
  s.textContent='.leaflet-tooltip.gm-hover-tt{padding:0;border:none;background:transparent;box-shadow:none;}'
    +'.leaflet-tooltip.gm-hover-tt:before{display:none;}'
    +'.gm-hover img{display:block;width:460px;height:460px;object-fit:cover;border-radius:8px;border:2px solid #22c55e;box-shadow:0 6px 18px rgba(0,0,0,.55);background:#161b22;}'
    +'.gm-hover-cap{font-size:10px;color:#e6edf3;background:rgba(0,0,0,.72);border-radius:0 0 7px 7px;padding:2px 6px;text-align:center;}'
    +'.gm-float{position:absolute;z-index:2000;pointer-events:none;}'
    +'.gm-hover-err{width:200px;padding:14px;font-size:11px;color:#f85149;background:#161b22;border:1px solid #f85149;border-radius:8px;text-align:center;}';
  document.head.appendChild(s);
}
function _gmHideFloat(){var e=document.getElementById('gmFloatBox');if(e&&e.parentNode)e.parentNode.removeChild(e);}
var _GM_HOVER_DELAY=500; // 乗せてこの時間(ms)静止で表示。素早い通過では取得しない=無駄課金防止(ドクター)。float方式は発火が確実なので遅延が正しく効く。
function _gmHoverBind(layer,lat,lng){
  if(!_gmKey()||lat==null||lng==null)return; // キー未設定 or 座標無し=OFF
  var url=_gmStaticUrl(lat,lng);if(!url)return;
  _gmEnsureCss();
  // v20260820f: Leaflet tooltipを廃した自前div方式(v20260820e)に、0.5秒の静止遅延を復帰。
  //   前回0.5秒が出なかったのはtooltip openTooltipの不具合でタイマー自体は正常→float方式なら遅延後に確実表示。
  //   =素早い通過は取得せず(課金しない)、フラグで0.5秒止めた時だけ表示。2回目以降キャッシュ・NG済は除外。
  var timer=null;
  layer.on('mouseover',function(){
    if(timer)clearTimeout(timer);
    timer=setTimeout(function(){
      timer=null;
      var m=getMap();if(!m)return;
      _gmHideFloat();
      var cp; try{cp=m.latLngToContainerPoint([lat,lng]);}catch(_){return;}
      var C=m.getContainer(), W=C.clientWidth;
      var box=document.createElement('div');box.id='gmFloatBox';box.className='gm-hover gm-float';
      var left=cp.x+14; if(left+220>W)left=cp.x-234; if(left<6)left=6;
      var top=cp.y-210; if(top<6)top=cp.y+16;
      box.style.left=left+'px';box.style.top=top+'px';
      var img=document.createElement('img');img.alt='latest satellite';
      img.onerror=function(){box.innerHTML='<div class="gm-hover-err">画像取得不可（キー/リファラー制限/割当を確認）</div>';};
      img.src=url;
      var cap=document.createElement('div');cap.className='gm-hover-cap';cap.textContent='🛰 最新衛星(Google)・目視専用';
      box.appendChild(img);box.appendChild(cap);
      C.appendChild(box);
      try{window.__gmLoads=(window.__gmLoads||0)+1;}catch(_){} // 実取得(課金)回数の目安
    },_GM_HOVER_DELAY);
  });
  layer.on('mouseout',function(){ if(timer){clearTimeout(timer);timer=null;} _gmHideFloat(); });
}

function renderLayerGroups(){
  var m=getMap();if(!m)return;ensurePane(m);
  _reviewMarkerByIid={}; // v20260820t: 送り機能用に毎描画で作り直す
  Object.keys(_groups).forEach(function(id){try{m.removeLayer(_groups[id]);}catch(_){}delete _groups[id];});
  state.layers.forEach(function(l){
    if(l.archived)return; // 退避済は地図に描かない
    // ★検索絞り込み中は、名前一致の画層だけ地図に描く(見えすぎ解消)。
    if(_gFilter&&(l.name||'').toLowerCase().indexOf(_gFilter.toLowerCase())<0)return;
    var show=_reviewFilter?true:(l.visible&&(!state.solo||state.solo===l.id));if(!show)return; // レビュー中は所属可視に関係なく既OKを全部出す
    var g=L.layerGroup([],{pane:'gachoPane'});
    l.items.forEach(function(it){
      if(it.noMap)return; // v20260820h: フラグ判定専用アイテム(既存レイヤーが地図描画)→gachoでは描かない=二重マーカー防止
      if(_reviewFilter && it.type!=='boundary' && !(_isPresetOk(l,it)||_reviewTouchedHas(it)))return; // v20260820u: レビュー中も「未確定の既OK」＋判定済(残す)＋手描き境界(常時表示=消さない)を描く
      if(state.hideReviewed&&it.viewed)return;
      if(it.status==='ng')return; // v20260821e(ドクター): NGにした筆は地図から消す(常時)
      var vd=!!it.viewed;
      var under=(it.area!=null&&it.area<800);
      var areaTxt=(it.area!=null)?('面積 <b style="font-size:14px;color:'+(under?'#f85149':'#3fb950')+'">'+Math.round(it.area).toLocaleString()+' ㎡</b>'+(under?'<br><span style="color:#f85149">⚠ 800㎡未満：隣接を含め敷地境界を手描きで作成</span>':'')):'<span style="color:#8b949e">面積 不明</span>';
      var seen='<span style="color:#9aa4ae">'+(vd?'✓ 見た':'')+'</span>';
      var stat=it.status==='ok'?' <b style="color:#3fb950">✓OK</b>':(it.status==='ng'?' <b style="color:#f85149">🚫NG(除外)</b>':'');
      var gmap='<div style="margin-top:6px"><a href="https://www.google.com/maps/search/?api=1&query='+it.lat+','+it.lng+'" target="_blank" rel="noopener" style="color:#58a6ff">🌐 Googleマップ</a> ｜ <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+it.lat+','+it.lng+'" target="_blank" rel="noopener" style="color:#58a6ff">🚶 ストリートビュー</a></div>';
      // ★2026-08-29是正(ドクター指示「SWへ記載するだけでなく、恒常的にどのようなコードを設けるのか決めろ」):
      // 以前は「境界(面)」と「筆(点)」で完全に別コードに分岐しており、点専用に実装された①ホバー最新衛星・
      // 丸フラグ(ズームアウトしても見失わない)が、境界側には一度も実装されていなかった。この抜けが
      // ドクターの実害(手描き境界を見失う)に直結した。今後、新しい表示種別(線 等)を追加しても同じ抜けを
      // 構造的に起こせないよう、丸フラグ+ホバー+ポップアップを1つの共通関数`_gachoRenderFlag`に一本化し、
      // ここでは「itがlat/lngを持つ限り必ず呼ぶ」＝if/elseの中に埋め込んで消えることがない書き方にする。
      // 面(ポリゴン)等、その形状特有の追加描画は、この共通フラグの「後に・別途」足すだけにする。
      var popupHtml,areaLabel='敷地境界';
      if(it.type==='boundary'&&it.latlngs&&it.latlngs.length>=3){
        var bredraw='<button class="gsc-draw" onclick="window.__gacho.redraw(\''+l.id+'\',\''+(it.iid||'')+'\')" title="この境界を消して描き直す">🗑 描き直す</button>';
        popupHtml='<div style="font-size:12px;min-width:160px"><b style="color:'+l.color+'">'+esc(l.name)+'</b> '+seen+stat+'<br>'+areaLabel+'<br>'+areaTxt+gmap+_whyHtml(it)+_scoreCardHtml(l,it)+bredraw+'</div>';
      } else {
        popupHtml='<div style="font-size:12px;min-width:250px"><b style="color:'+l.color+'">'+esc(l.name)+'</b> '+seen+stat+'<br>'+esc(it.address||(it.lat!=null?(Number(it.lat).toFixed(5)+', '+Number(it.lng).toFixed(5)):''))+(it.chiban?'<br>地番 '+esc(it.chiban):'')+'<br>'+areaTxt+(it.deliver?'<br>区分 '+esc(it.deliver):'')+gmap+_whyHtml(it)+_scoreCardHtml(l,it)+'</div>';
      }
      // ★共通フラグ(丸マーカー)＝どの表示種別でも必ず描く。ここを削って良い理由は無い。
      if(it.lat!=null&&it.lng!=null){
        var isB=(it.type==='boundary');
        var _sty=it.status==='ok'?{radius:isB?6:7,color:'#22c55e',weight:3,fillColor:l.color,fillOpacity:0.30}:{radius:isB?6:7,color:'#fff',weight:2,fillColor:l.color,fillOpacity:0.95};
        var mk=L.circleMarker([it.lat,it.lng],Object.assign({pane:'gachoPane'},_sty));
        if(_reviewFilter&&it.iid&&!isB)_reviewMarkerByIid[it.iid]=mk; // v20260820t: 送り機能でopenPopup(境界は常時表示のため対象外)
        if(it.status!=='ng') _gmHoverBind(mk,it.lat,it.lng); // ①ホバー最新衛星(NG済は除外=課金しない・キー無ければno-op)
        mk.bindPopup(popupHtml);
        mk.on('popupopen',function(){if(!it.viewed){it.viewed=true;saveState();}}); // v20260821h(ドクター): クリックで色を変えない
        g.addLayer(mk);
      }
      // ★形状特有の追加描画(面=ポリゴン)。共通フラグは既に上で描画済みなので、ここは形の可視化専用。
      if(it.type==='boundary'&&it.latlngs&&it.latlngs.length>=3){
        var pg=L.polygon(it.latlngs,it.status==='ng'?{pane:'gachoPane',color:'#6e7681',weight:1,fillColor:'#6e7681',fillOpacity:0.1,dashArray:'4,4'}:(it.status==='ok'?{pane:'gachoPane',color:'#22c55e',weight:3,fillColor:'#22c55e',fillOpacity:0.30}:{pane:'gachoPane',color:l.color,weight:2,fillColor:l.color,fillOpacity:vd?0.08:0.25,dashArray:vd?'4,4':null})); // v20260821g(ドクター): 手描き=OK=緑の枠+緑の塗り(ピンクにしない)
        pg.bindPopup(popupHtml);
        pg.bindTooltip(Math.round(it.area||0).toLocaleString()+'㎡',{permanent:true,direction:'center',className:'gacho-area-lbl',pane:'gachoPane'});
        pg.on('popupopen',function(){if(!it.viewed){it.viewed=true;saveState();}});
        if(it.status!=='ng') _gmHoverBind(pg,it.lat,it.lng);
        g.addLayer(pg);
      }
    });
    g.addTo(m);_groups[l.id]=g;
  });
  // ★applyBase0()はここ(毎描画)では呼ばない。フラグ削除/OK/NG等の再描画のたびに走ると、
  //   0画層OFF中に手動ONしたハザード等overlayPaneを巻き込んで消す不具合になる(栗本さん報告)。
  //   applyBase0は「0画層トグル/一括表示・非表示/初期化」時のみ実行する(showAll/hideAll/b0 onclick/boot)。
  updateAreaLabels();
}

function render(){renderPanel();renderLayerGroups();try{renderDelivered();}catch(_){}}
/* 納品済300を地図に一律グレーで表示(二度出し防止・ドクター2026-08-21)。既定OFF・候補より下pane・クリック不要の背景。 */
var _deliveredLayer=null;
function renderDelivered(){
  var m=getMap(); if(!m)return;
  if(_deliveredLayer){try{m.removeLayer(_deliveredLayer);}catch(_){}_deliveredLayer=null;}
  if(!state.showDelivered||!window.DELIVERED300||!window.DELIVERED300.pts)return;
  if(!m.getPane('gachoDelivPane')){var p=m.createPane('gachoDelivPane');p.style.zIndex=445;}
  // v20260823(ドクター): 「⊗既得地を表示」(TAKENLAY)は撤去・こちらを300表示の唯一の正とする。
  // 0画層でgachoDelivPaneが一緒に消えるのを防ぐため、表示ONにするこの瞬間だけ明示的にdisplayを戻す
  // (takenPaneと同じ理由・同じ対処。恒久ホワイトリスト化はしない=0画層は本当に全部隠す)。
  try{ m.getPane('gachoDelivPane').style.display=''; }catch(_){}
  var g=L.layerGroup([]);
  window.DELIVERED300.pts.forEach(function(pt){
    var mk=L.circleMarker([pt[0],pt[1]],{pane:'gachoDelivPane',radius:7,color:'#ffffff',weight:2,fillColor:'#ef4444',fillOpacity:0.85,interactive:true});
    mk.bindTooltip('第1回納品済(300)',{direction:'top'});
    g.addLayer(mk);
  });
  g.addTo(m); _deliveredLayer=g;
}

/* ===== 画層の分類(①クライアント②納品時期③行政区域) — レイヤー構造を明確化 ===== */
function layerMeta(l){
  // v20260823(ドクター「常にアドホックな考え方はなくさなければならない」): 明示的に割り当てられたmeta(_d2Dest等が
  // 実データの配置に基づいて設定したclient/pref/city)はキャッシュして良いが、ここで名前パターンから「推測」した
  // metaは_autoの印を付け、毎回作り直す。分類ルール(下の正規表現)を後から直しても、既に推測済みの画層が
  // 永遠に古い分類のまま固定される(色の不具合と同じ根)のを構造的に防ぐ。
  if(l.meta && l.meta.client && !l.meta._auto) return l.meta;
  var n=String(l.name||'');
  // ★2026-08-28是正(ドクター指摘): 地域名(奈良/三重/松阪等)だけでクライアントまで「SUNトラスト」と
  // 判定していたのは設計ミス。地域とクライアントは別軸であり、地域名の一致は特定クライアントを意味しない
  // (2社目以降が同じ地域に入ると誤分類する)。クライアントは明示的な識別子(SUN/サントラスト)がある時のみ
  // 判定し、無ければ「共通・自社」(未割当)とする。地域(region)は引き続き地名から判定してよい(顧客識別とは別軸)。
  var client=/SUN|サントラスト/i.test(n)?'SUNトラスト':'共通・自社';
  var region=/奈良|御所/.test(n)?'奈良県':(/三重|松阪|桑名|いなべ|玉城|多気/.test(n)?'三重県':'（区域横断）');
  var delivered=/納品|合筆提案|敷地境界|実測/.test(n) && !/AI候補|要確認|精査/.test(n);
  l.meta={client:client, region:region,
    period:delivered?'第1回納品（〜2026-08-06 確定）':'精査中（作業台）',
    phase:delivered?'納品済':'精査中', _auto:true};
  return l.meta;
}
function _grpDefOpen(k){ if(k==='ARCH')return false; if(k.indexOf('|R:')>=0)return true; if(k.indexOf('|P:')>=0)return /精査/.test(k); return true; }
/* 退避: 納品完了の画層をSWルーム保存用GeoJSONへ書出し、作業台からは archived で外す(データは消えない・戻せる)。＝AIの外の仕組み(ボタン) */
function evacuateLayers(ls,cli,per){
  var feats=[];ls.forEach(function(l){var gj=toGeoJSON(l);(gj.features||[]).forEach(function(f){f.properties=f.properties||{};f.properties._layer=l.name;f.properties._client=cli;f.properties._period=per;feats.push(f);});});
  var fc={type:'FeatureCollection',_meta:{client:cli,period:per,evacuated_at:_stamp(),layers:ls.map(function(l){return l.name;})},features:feats};
  download('SWルーム退避_'+_fnsafe(cli)+'_'+_fnsafe(per)+'_'+_stamp()+'.geojson',JSON.stringify(fc,null,2),'application/geo+json');
  ls.forEach(function(l){l.archived=true;l.visible=false;if(state.solo===l.id)state.solo=null;});
  saveState();render();
  toast(ls.length+'画層を退避しました。SWルーム保存用GeoJSONを書き出し、作業台から外しました（アーカイブから戻せます）。');
}

function buildPanel(){if(document.getElementById('gachoPanel'))return;var box=document.createElement('div');box.id='gachoPanel';box.className='gacho-panel';document.body.appendChild(box);renderPanel();}

var _gFilter=''; // ★画層検索の絞り込み文字(localStorageに残さない・その場のみ)。栗本さん:だらだら/見えすぎ解消
var _reviewFilter=false; // v20260820q(ドクター): 「未確定の既OK(要再確認)」だけを地図に表示するビュー。非破壊(所属は保持)。
var _reviewTouched={}; // v20260820r: レビュー中に判定した筆(fid)。確定してもその場から消さず残す(緑=OK/赤=NG)。残数だけ減る。
var _reviewMarkerByIid={}; // v20260820t: レビュー描画中のマーカーをiidで保持(送り機能でopenPopup用)
var _reviewSeen={}; // v20260820t: 「次の未確認へ」で一巡管理(判定せず送っても全件回れる)
function _isPresetOk(l,it){ return it.status==='ok'&&!_isUserJudged(it)&&!_isDeliveredItem(l,it); } // 既OK=自動OK/未オープン(DB未記録)
function _presetOkCount(){ var n=0; state.layers.forEach(function(l){ if(l.archived)return; l.items.forEach(function(it){ if(_isPresetOk(l,it))n++; }); }); return n; }
// v20260821h(ドクター): 「自動OKを外す」は最悪の仕組みだったため関数ごと完全削除。
function _reviewTouchedHas(it){ return !!((it.feature_id&&_reviewTouched[it.feature_id])||(it.iid&&_reviewTouched[it.iid])); } // v20260820u: feature_id無し(手動ピック等)もiidで残す
/* v20260820t(ドクター): 「▶ 次の未確認へ」。押すたびに未確認の既OKへ地図を飛ばしてポップアップを開く=探す手間ゼロで137件を順に潰す。判定せず送っても一巡できる(_reviewSeen)。 */
function reviewNext(){
  var m=getMap();if(!m)return;
  if(!_reviewFilter){toast('先に「🔎 未確定の既OK」をONにしてください');return;}
  var list=[];state.layers.forEach(function(l){if(l.archived)return;l.items.forEach(function(it){if(_isPresetOk(l,it)&&it.lat!=null&&it.lng!=null)list.push(it);});});
  if(!list.length){toast('未確認の既OKは残っていません（0件）。お疲れさまでした');return;}
  var pend=list.filter(function(it){return !_reviewSeen[it.iid];});
  if(!pend.length){_reviewSeen={};pend=list;toast('一巡しました。残'+list.length+'件を最初から再度回ります');}
  var it=pend[0];_reviewSeen[it.iid]=1;
  try{m.closePopup();m.setView([Number(it.lat),Number(it.lng)],Math.max(m.getZoom(),17));}catch(_){}
  var mk=_reviewMarkerByIid[it.iid];
  if(mk){setTimeout(function(){try{mk.openPopup();}catch(_){}},280);}
  toast('未確認の既OK 残'+list.length+'件 ／ この筆を確認→✓OK/🚫NG（送り='+(pend.length-1)+'件）');
}
/* 今の作業台の確定OK/NGの重複なし実数。納品300(名前｜納品＋座標)・自動OK(未判定)は除外。カウンターと削除トーストが同じ定義を使う=数字が一致・削除で必ず減る。 */
function _liveCounts(){
  var delivSet=null;
  try{ if(window.DELIVERED300&&window.DELIVERED300.pts){ delivSet={}; window.DELIVERED300.pts.forEach(function(p){ delivSet[Math.round(p[0]/0.0003)+'_'+Math.round(p[1]/0.0003)]=1; }); } }catch(_){}
  function isDelivC(lat,lng){ if(!delivSet||lat==null||lng==null)return false; var gl=Math.round(lat/0.0003),gn=Math.round(lng/0.0003); for(var dx=-1;dx<=1;dx++)for(var dy=-1;dy<=1;dy++){ if(delivSet[(gl+dx)+'_'+(gn+dy)])return true; } return false; }
  var okS={},ngS={},bokS={};
  state.layers.forEach(function(l){ if(l.archived)return; (l.items||[]).forEach(function(it){
    if(_isDeliveredItem(l,it))return;
    if(isDelivC(Number(it.lat),Number(it.lng)))return;
    if(it.type==='boundary'){ if(it.status==='ok'){var bk=it.iid||('b:'+it.lat+','+it.lng);bokS[bk]=1;} return; }
    var key=it.feature_id||it.iid;
    if(it.status==='ok')okS[key]=1; else if(it.status==='ng')ngS[key]=1;
  });});
  return {ok:Object.keys(okS).length+Object.keys(bokS).length, ng:Object.keys(ngS).length};
}
var _gachoPanelCollapsed=false; // ★2026-08-29: 「画層」パネルの開閉状態。renderPanel()の再構築を跨いで保持する。
function renderPanel(){
  window.__gachoMapMode=!!(_drawMode||_rectMode||_pickMode||_addMode); // v20260812j: 地番ポップアップ/手動ピック確認モーダルの抑止フラグ(描画等の邪魔をしない)
  var box=document.getElementById('gachoPanel');if(!box)return;var al=activeLayer();var h='';
  h+='<div class="gacho-head"><span>🗂 画層</span><button class="gacho-min" id="gachoMin" title="開閉">—</button></div>';
  // ★2026-08-29是正(ドクター報告「レイヤーをたたむと開けない」): renderPanel()は判定操作のたびに毎回
  // パネル全体を作り直すが、開閉状態をどこにも覚えておらず常に「開」で再構築していた。閉じた直後に
  // 何か操作すると勝手に開き直り、次に押した「－」がその開いた状態を再び閉じる、というズレが実態だった。
  // _gachoPanelCollapsedに開閉状態を保持し、再構築のたびにそれを反映する。
  h+='<div class="gacho-body" id="gachoBody"'+(_gachoPanelCollapsed?' style="display:none"':'')+'>';
  // v20260823(ドクター「ボタンが一番下でスクロールに隠れる」): 📍手動ピックは最頻出操作のため、常時・パネル最上部に固定表示。
  //   活性画層(al)が無くても押せる(押した時に「手動ピック（判定）」画層を自動作成=addClickの既存挙動)。
  h+='<div class="gacho-master"><button id="gachoAddPt" class="gacho-btn wide'+(_addMode?' on':'')+'" style="background:rgba(255,20,147,.16);border-color:#ff1493;font-weight:700">📍 地図クリックで手動ピック記録（案件候補）'+(_addMode?'（クリック→確認→保存／ESCで終了）':'')+'</button></div>';
  h+='<div class="gacho-master"><button id="gachoShowAll" class="gacho-btn">👁 全て表示</button><button id="gachoHideAll" class="gacho-btn">🚫 全て隠す</button></div>';
  // v20260821z(ドクター): 「未確認のみ表示」撤去(断捨離)。面積ラベルは残す。
  // v20260821z11(ドクター): 「㎡ 面積ラベル」撤去(面積はポップアップ/描画後表示で確認)。
  // v20260821z4(ドクター): 初回納品済を一律グレーで表示=二度出し防止。新規開拓(緑)と一目で区別。
  if(window.DELIVERED300)h+='<div class="gacho-master"><button id="gachoShowDeliv" class="gacho-btn'+(state.showDelivered?' on':'')+'" style="'+(state.showDelivered?'background:rgba(239,68,68,.30);border-color:#ef4444':'')+'" title="第1回納品済'+(window.DELIVERED300.count||300)+'を赤で地図に表示=同じ場所を二度出さないため。新規開拓(緑)と一目で区別">'+(state.showDelivered?'🔴 第1回納品(300)を表示中':'🔴 第1回納品(300)を地図に表示')+'</button></div>';
  // v20260821z2(ドクター): 「見た分をOKに一括」「除外は非表示」撤去(断捨離)。NGは既定(showNg=false)で地図から隠れたまま=機能は維持。
  // v20260820i(ドクター): 納品300を座標突合して画層から完全削除(先にSW退避=DB無変更・完全復元可)
  // v20260821z9(ドクター): 断捨離。↩納品を戻す/📸移行前スナップショット/↩スナップに戻す/📂スナップJSONから復元 を撤去(移行完了・仰々しい)。🔄第2回一致とその↩だけ残す。復元は自動DLしたJSON＋git履歴が担保。
  // 第2回納品候補 県→市町村 移行（慎重運用: 移動だけでは消えない・削除は別・総数変化で自動中断復元）
  if(window.DELIVERY2){
    // v20260823(ドクター「毎回これと同じ事を行う運用だから」): 「全て表示」だと精査中の作業台まで一緒に出てしまい、
    // 0画層の設定も崩れる。362(第2回納品候補)の全レイヤーだけを1クリックでON/OFFする専用ボタン。
    // v20260823(ドクター): 「||512」等の固定フォールバックはJSの0=falsyで「本当に0件」の時も古い数字を表示してしまう
    // 欠陥だった(round2_poolのRLSで実際に0件返ってきた時に512と誤表示した事故の真因)。生の値だけを表示する。
    var _d2n=window.DELIVERY2.totalItems;
    h+='<div class="gacho-master"><button id="gachoD2Show" class="gacho-btn'+(state.showD2?' on':'')+'" style="'+(state.showD2?'background:rgba(34,197,94,.28);border-color:#22c55e':'')+'" title="第2回納品候補('+_d2n+')の全レイヤーだけをON/OFF。他の作業台レイヤーには触らない">'+(state.showD2?'🟢 第2回納品候補('+_d2n+')を表示中':'🟢 第2回納品候補('+_d2n+')を地図に表示')+'</button></div>';
    h+='<div class="gacho-master"><button id="gachoD2Rebuild" class="gacho-btn" style="background:rgba(8,145,178,.28);border-color:#22d3ee;font-weight:700" title="第2回納品候補の階層を確定データ('+_d2n+')に完全一致。移動/補完/外れNGの除外を一括・可逆・推奨">🔄 第2回を確定データに一致（'+_d2n+'）</button></div>';
    // v20260821z3(ドクター): 🗂整理・➕補完は🔄に完全統合されたため撤去(断捨離)。今後OKを増やしたら🔄で再反映。
    h+='<div class="gacho-master"><button id="gachoD2Manual" class="gacho-btn" style="background:rgba(255,20,147,.16);border-color:#ff1493" title="手作業ピック(ピンク)を『手作業｜県｜市町村』へ整理して階層表示。ピックの中身は不変・入れ物だけ整理・可逆">🖐 手作業ピックも県→市町村へ</button></div>';
    // v20260823(ドクター「ピンク→緑への昇格をボタン1つで、AI外だし」): OK判定済みの手動ピックをround2_pool(緑・予備軍)へ一括昇格。
    // ★2026-08-29(ドクター「119件を地図上に表してくれ、私がチェックする」): 昇格を実行する前に、対象を
    // 黄色レイヤーで地図上に表示して目視確認できるプレビュー。round2_poolへは書き込まない。
    h+='<div class="gacho-master"><button id="gachoPreviewNewOk" class="gacho-btn" style="background:rgba(34,211,238,.15);border-color:#22d3ee;font-weight:700" title="昇格対象(未昇格の真の新規)をシアン色レイヤーで地図に表示して確認する。round2_poolへはまだ書き込まない">🔎 未昇格の新規を地図で確認</button></div>';
    h+='<div class="gacho-master"><button id="gachoPromoteD2" class="gacho-btn" style="background:rgba(34,197,94,.2);border-color:#22c55e;font-weight:700" title="OK判定済みの手動ピック(ピンク/手作業)をround2_pool(第2回納品候補・緑)へ一括昇格。区域不明・昇格済みは対象外">⬆ OK済みピックを予備軍(緑)へ昇格</button></div>';
    // v20260831c(ドクター指示・人間第2段階チェック): 1回目OK済み・未昇格の案件を地図上で点滅させ、個別または
    // 一括で最終確認してから予備群(round2_pool)へ昇格する。既存の⬆一括昇格ボタンは「一括OK」として兼用。
    h+='<div class="gacho-master"><button id="gachoFinalCheck" class="gacho-btn'+(_finalCheckBlinking?' on':'')+'" style="'+(_finalCheckBlinking?'background:rgba(250,204,21,.28);border-color:#facc15':'background:rgba(250,204,21,.15);border-color:#eab308')+';font-weight:700" onclick="window.__gacho.toggleFinalCheck()" title="1回目OK・予備群未昇格の案件を地図上で点滅させ、1件ずつ確認して昇格。一括昇格は上の⬆ボタンで可">🔴 最終納品昇格チェック</button></div>';
    // ★2026-08-28(ドクター指示・⑥→⑦): 予備軍(round2_pool・クライアント未定)から特定クライアントへ抽出し
    // 納品(client_delivery_items・仮納品)へ登録する。⑤→⑥昇格とは別の、独立した操作。
    h+='<div class="gacho-master"><button id="gachoExtractClient" class="gacho-btn" style="background:rgba(168,85,247,.2);border-color:#a855f7;font-weight:700" title="予備軍(round2_pool)のうちクライアント未割当の案件を、選んだクライアントへ抽出して仮納品登録する">📤 予備軍をクライアントへ抽出</button></div>';
    h+='<div class="gacho-master"><button id="gachoTidy" class="gacho-btn" style="background:rgba(210,153,34,.2);border-color:#d29922" title="旧レイヤー(保留/対象外/AI候補/適当/検討/要確認 等)をSWへ退避し作業台から外す=県→市町村＋手作業＋手動ピックだけの綺麗な作業台に。可逆(退避↩で戻せる)">🧹 旧レイヤーを退避で片付け（県→市町村だけに）</button></div>';
    if(_d2Emptied.length||_hasD2Snap()){
      h+='<div class="gacho-master">'+(_d2Emptied.length?'<button id="gachoD2Del" class="gacho-btn on" title="移動で空になった元レイヤーを削除(0件のみ・総数不変を再確認)">🗑 空レイヤー削除（'+_d2Emptied.length+'）</button>':'')+(_hasD2Snap()?'<button id="gachoD2Undo" class="gacho-btn on" title="第2回移行を移行前に戻す">↩ 移行を元に戻す</button>':'')+'</div>';
    }
  }
  // ★v20260818j(栗本さん:根拠のある数字だけ見せろ): OK/NGは「判定対象の候補レイヤー」だけで意味を持つ。
  //   参照(保留/対象外/要確認)・納品済(archived)・敷地境界(描画)はOK/NGが無意味なので、計(件数)だけ出し合計に入れない。
  //   合計は「表示中(👁ON)かつ候補レイヤー」だけ=いま調査中の判定進捗になる。
  var _isRef=function(l){ if(l.archived)return true; return /保留|対象外|敷地境界|納品|要確認/.test(l.name||''); };
  // v20260821z33(ドクター): カウンター撤去(ゴミと共に消せ)。正の数字は固定データ(第2回=337カ所)のみ。
  // ★検索: 打つとその画層だけを地図・パネルに絞る(見えすぎ/だらだら解消)。空で解除。
  h+='<div class="gacho-master" style="gap:4px"><input id="gachoSearch" placeholder="🔍 画層を検索して絞る（大台/田原/SUN…）" value="'+esc(_gFilter)+'" style="flex:1;padding:6px 9px;border-radius:6px;border:1px solid '+(_gFilter?'#f59e0b':'#30363d')+';background:#0d1117;color:#e6edf3;font-size:12px;outline:none">'+(_gFilter?'<button id="gachoSearchClr" class="gacho-btn" style="padding:2px 8px">✕</button>':'')+'</div>';
  if(_gFilter){h+='<div style="font-size:11px;color:#f0b429;margin:2px 0 4px">🔍「'+esc(_gFilter)+'」で絞り込み中＝この画層だけ地図に表示。✕で解除。</div>';}
  h+='<div class="gacho-row gacho-base"><span class="gacho-eye" data-b0="1">'+(state.base0Visible?'👁':'🚫')+'</span><span class="gacho-name">0画層｜既存すべて</span></div>';
  // ===== ①クライアント→②納品時期→③行政区域 の階層表示（作業台を見やすく） =====
  if(!state.grpOpen)state.grpOpen={};
  var _gopen=function(k){if(_gFilter)return true;return (k in state.grpOpen)?!!state.grpOpen[k]:_grpDefOpen(k);};
  // ★v20260818j(栗本さん:グループのOK/NGは意味が混ざる): グループ見出しは「計(件数)」だけにする。
  //   判定のOK/NGは候補レイヤー各行と最上部「調査中の判定合計」だけに出す=数字が全部根拠を持つ。
  var _lcnt=function(ls){var a=0;ls.forEach(function(l){a+=l.items.length;});return '計'+a;};
  // 第2回納品候補の「行政区域別 確定OK件数」を固定データ(delivery2-candidates.js)から表示=AIが数え直さない・ブレない。
  var _D2=window.DELIVERY2;
  var _d2c=function(pref,city){ try{ if(!_D2||!_D2.locCount)return null; if(city!=null)return (_D2.locCount[pref]&&_D2.locCount[pref][city])||0; var s=0,o=_D2.locCount[pref]||{}; for(var k in o)s+=o[k]; return s; }catch(_){return null;} };
  var _row=function(l){
    var okc=l.items.filter(function(it){return it.status==='ok';}).length;
    var ngc=l.items.filter(function(it){return it.status==='ng';}).length;
    var vc=l.items.filter(function(it){return it.viewed;}).length;
    // ★v20260818j: 参照(保留/対象外/要確認)・納品済・敷地境界(描画)は判定でないのでOK/NGを出さず「計」だけ。
    //   候補レイヤーだけ 見た/OK/NG/計 を出す=根拠のある数字だけ表示。
    var cnt;
    if(_isRef(l)){ cnt=l.items.length?('計'+l.items.length+'<span style="color:#8b949e;font-weight:400"> （参照・判定対象外）</span>'):'0'; }
    else { cnt=l.items.length?('👁見た'+vc+' ／ <span style="color:#3fb950">OK'+okc+'</span>・<span style="color:#f85149">NG'+ngc+'</span> ／ 計'+l.items.length):'0'; }
    var r='<div class="gacho-row'+(l.active?' active':'')+'" style="margin-left:26px">'
      +'<span class="gacho-eye" data-eye="'+l.id+'">'+(l.visible?'👁':'🚫')+'</span>'
      +'<span class="gacho-dot" style="background:'+l.color+'" title="この画層の色（緑=適当/橙=検討 等）"></span>'
      +'<span class="gacho-name" data-sel="'+l.id+'" title="取込先に選択">'+esc(l.name)+'</span>'
      +'<span class="gacho-solo'+(state.solo===l.id?' on':'')+'" data-solo="'+l.id+'" title="この画層だけ表示">◎</span>'
      +'<span class="gacho-ren" data-ren="'+l.id+'" title="名前変更">✎</span>'
      +'<span class="gacho-tag" data-tag="'+l.id+'" title="分類変更(①客/②時期/③区域)" style="cursor:pointer">🏷</span>'
      +(l.archived?'':'<span class="gacho-arch" data-arch="'+l.id+'" title="この画層を退避(SWルームへ書出+地図・作業台から外す・↩で戻せる)" style="cursor:pointer">🗄</span>')
      +'<span class="gacho-del" data-del="'+l.id+'" title="削除">🗑</span>'
      +'</div>';
    if(l.items.length)r+='<div class="gacho-cnt" style="margin-left:26px">'+cnt+'</div>';
    return r;
  };
  var _live=state.layers.filter(function(l){return !l.archived && (!_gFilter||(l.name||'').toLowerCase().indexOf(_gFilter.toLowerCase())>=0);});
  var _arch=state.layers.filter(function(l){return l.archived && (!_gFilter||(l.name||'').toLowerCase().indexOf(_gFilter.toLowerCase())>=0);});
  var _tree={};
  _live.forEach(function(l){var mt=layerMeta(l);(_tree[mt.client]=_tree[mt.client]||{});(_tree[mt.client][mt.period]=_tree[mt.client][mt.period]||{});(_tree[mt.client][mt.period][mt.region]=_tree[mt.client][mt.period][mt.region]||[]).push(l);});
  // ★v20260827a(ドクター): 「クライアント選択」を1つのルートにし、その下へ各クライアントを樹形図で束ねる。折りたたみ＝クライアント選択。
  var _clientKeys=Object.keys(_tree).sort();
  var _rootOpen=_gopen('ROOTCLI');
  h+='<div class="gacho-grp gacho-cliroot" data-grp="ROOTCLI" style="cursor:pointer;margin-top:8px;padding:6px 8px;background:linear-gradient(90deg,rgba(88,166,255,.20),rgba(88,166,255,.05));border:1px solid #3b82f6;border-radius:8px;font-weight:900"><span style="width:12px;display:inline-block">'+(_rootOpen?'▾':'▸')+'</span>🗂 クライアント選択<span style="float:right;font-weight:400;color:#8b949e;font-size:11px">'+_clientKeys.length+'社</span></div>';
  if(_rootOpen){
  h+='<div class="gacho-clibranch" style="margin-left:9px;border-left:2px dashed #3b82f6;padding-left:5px">';
  _clientKeys.forEach(function(cli){
    var ck='C:'+cli; var co=_gopen(ck);
    var call=[];Object.keys(_tree[cli]).forEach(function(p){Object.keys(_tree[cli][p]).forEach(function(rr){call=call.concat(_tree[cli][p][rr]);});});
    h+='<div class="gacho-grp" data-grp="'+esc(ck)+'" style="cursor:pointer;margin-top:8px;padding:5px 6px;background:rgba(88,166,255,.10);border:1px solid #2a3742;border-radius:6px;font-weight:800"><span style="width:12px;display:inline-block">'+(co?'▾':'▸')+'</span>🏢 '+esc(cli)+(cli==='第2回納品候補'&&_D2?' <b style="color:#22d3ee;font-weight:700">確定OK '+_D2.totalItems+'件・'+_D2.totalLocations+'カ所</b>':'')+'<span style="float:right;font-weight:400;color:#8b949e;font-size:11px">'+_lcnt(call)+'</span></div>';
    if(!co)return;
    var periods=Object.keys(_tree[cli]).sort(function(a,b){var pa=/精査/.test(a)?0:1,pb=/精査/.test(b)?0:1;return pa-pb||a.localeCompare(b);});
    periods.forEach(function(per){
      var pk=ck+'|P:'+per; var isWip=/精査/.test(per); var po=_gopen(pk);
      var pall=[];Object.keys(_tree[cli][per]).forEach(function(rr){pall=pall.concat(_tree[cli][per][rr]);});
      // 退避ボタンは見出しに常時表示（畳んでいても押せる）。納品済のみ。
      var evacBtn=isWip?'':'<button class="gacho-btn gacho-evac" data-evac="'+esc(ck+'||'+per)+'" style="background:rgba(210,153,34,.22);border-color:#d29922;color:#ffd67a;font-size:10px;padding:1px 7px;margin-left:8px;vertical-align:middle;font-weight:700" title="この納品時期の全画層をSWルームへ書き出し、地図・作業台から外す（データは消えず戻せる）">🗄 退避</button>';
      h+='<div class="gacho-grp" data-grp="'+esc(pk)+'" style="cursor:pointer;margin-left:12px;margin-top:4px;padding:4px 6px;background:rgba(255,255,255,.03);border-left:2px solid '+(isWip?'#f59e0b':'#3fb950')+';font-weight:700;color:'+(isWip?'#f0b429':'#7ee787')+'"><span style="width:12px;display:inline-block">'+(po?'▾':'▸')+'</span>🗓 '+esc(per)+evacBtn+'<span style="float:right;font-weight:400;color:#8b949e;font-size:11px">'+_lcnt(pall)+'</span></div>';
      if(!po)return;
      Object.keys(_tree[cli][per]).sort().forEach(function(rg){
        var rk=pk+'|R:'+rg; var ro=_gopen(rk);
        h+='<div class="gacho-grp" data-grp="'+esc(rk)+'" style="cursor:pointer;margin-left:24px;margin-top:2px;padding:2px 6px;color:#58a6ff;font-weight:600"><span style="width:12px;display:inline-block">'+(ro?'▾':'▸')+'</span>📍 '+esc(rg)+'</div>';
        if(ro)_tree[cli][per][rg].forEach(function(l){h+=_row(l);});
      });
    });
  });
  h+='</div>'; } // ← 「クライアント選択」ルート(_rootOpen)を閉じる
  if(_arch.length){
    var ako=_gopen('ARCH');
    h+='<div class="gacho-grp" data-grp="ARCH" style="cursor:pointer;margin-top:10px;padding:5px 6px;background:rgba(139,148,158,.08);border:1px dashed #3a4650;border-radius:6px;color:#8b949e;font-weight:700"><span style="width:12px;display:inline-block">'+(ako?'▾':'▸')+'</span>🗄 納品済（退避済 '+_arch.length+'画層）<span style="float:right;font-size:11px">'+_lcnt(_arch)+'</span></div>';
    if(ako)_arch.forEach(function(l){h+=_row(l)+'<div style="margin-left:26px;margin-bottom:4px"><button class="gacho-btn gacho-restore" data-restore="'+l.id+'" style="font-size:11px">↩ 作業台へ戻す</button></div>';});
  }
  h+='<div class="gacho-actions">';
  if(al){
    h+='<div class="gacho-active-note">取込先: <b style="color:'+al.color+'">'+esc(al.name)+'</b></div>';
    // v20260821z10(ドクター): 「🖱 クリックで1件ずつ取込」撤去(未使用)。手動ピックは📍で。
    // v20260823: 📍ボタンはパネル最上部へ移動(このブロックの外・活性画層に依存せず常時表示)。ここでの重複描画は撤去。
    h+='<button id="gachoCapView" class="gacho-btn wide">＋ 表示中の範囲を取り込む（全部）</button>';
    h+='<div class="gacho-cond">面積 ≥ <input id="gachoMinArea" type="number" min="0" step="50" value="'+(state.lastMinArea!=null?state.lastMinArea:800)+'"> ㎡ <button id="gachoCapCond" class="gacho-btn">条件で取込</button></div>';
    // v20260821z7(ドクター): 「範囲ドラッグで取り込む」「敷地境界を描く」撤去。手描きは各フラグのポップアップ内✏️から。描画中の↩/✓は下に出る。
    if(_drawMode){h+='<div class="gacho-master"><button id="gachoDrawUndo" class="gacho-btn">↩ 1つ戻す</button><button id="gachoDrawDone" class="gacho-btn" style="background:rgba(63,185,80,.2);border-color:#3fb950">✓ 確定</button></div>';}
    // v20260821z8(ドクター): 書き出し(KML/GeoJSON/📋)撤去(未使用)。
  }else{h+='<div class="gacho-active-note">取込先の画層を選択/作成してください</div>';}
  // v20260821z5(ドクター): 4ボタン撤去(断捨離)。✏️敷地境界の画層作成/納品済手動ピック退避/SUNトラスト納品読込(397)/御所218読込。納品は🏁表示・候補は第2回階層に統合済で不要。手描き自体はフラグ✏️/作業レイヤーの✏️で可能。
  h+='<button id="gachoAdd" class="gacho-btn wide add">＋ 新規画層</button>';
  h+='</div>';
  h+='<div class="gacho-hint">既存の筆・フラグを条件別に画層へまとめ、切替えて分析。0画層＝今まで全部。取込は割当のみ・元データは無傷。</div>';
  h+='</div>';
  box.innerHTML=h;bindPanel();
}

function bindPanel(){
  var q=function(s){return document.querySelector(s);};var all=function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};
  var mn=q('#gachoMin');if(mn)mn.onclick=function(){var b=q('#gachoBody');if(!b)return;_gachoPanelCollapsed=(b.style.display!=='none');b.style.display=(_gachoPanelCollapsed?'none':'');};
  var sa=q('#gachoShowAll');if(sa)sa.onclick=showAll;
  var ha=q('#gachoHideAll');if(ha)ha.onclick=hideAll;
  var shd=q('#gachoShowDeliv');if(shd)shd.onclick=function(){state.showDelivered=!state.showDelivered;saveState();try{renderDelivered();}catch(_){}renderPanel();};
  var d2s=q('#gachoD2Show');if(d2s)d2s.onclick=function(){
    state.showD2=!state.showD2;
    state.layers.forEach(function(l){ if(l.meta&&l.meta.client==='第2回納品候補')l.visible=state.showD2; });
    saveState();render();
  };
  var prevNew=q('#gachoPreviewNewOk');if(prevNew)prevNew.onclick=function(){previewNewOkOnMap();};
  var pd2=q('#gachoPromoteD2');if(pd2)pd2.onclick=function(){promotePinkToRound2();};
  var exc=q('#gachoExtractClient');if(exc)exc.onclick=function(){extractPoolToClient();};
  var d2d=q('#gachoD2Del');if(d2d)d2d.onclick=function(){deleteEmptiedD2();};
  var d2u=q('#gachoD2Undo');if(d2u)d2u.onclick=function(){undoDelivery2();};
  var d2r=q('#gachoD2Rebuild');if(d2r)d2r.onclick=function(){rebuildDelivery2();};
  var d2mn=q('#gachoD2Manual');if(d2mn)d2mn.onclick=function(){try{_backfillManualJudgmentsToDb();}catch(_){}rebuildManualPicksFromDb(false);};
  var tdy=q('#gachoTidy');if(tdy)tdy.onclick=function(){tidyOldLayers();};
  var b0=q('.gacho-eye[data-b0]');if(b0)b0.onclick=function(){state.base0Visible=!state.base0Visible;saveState();render();applyBase0();};
  // ★画層検索: 打つとその画層だけ(パネル&地図)に絞る。renderPanelで作り直すのでフォーカス/キャレットを復元。
  var srch=q('#gachoSearch');if(srch)srch.oninput=function(){_gFilter=this.value;renderPanel();try{renderLayerGroups();}catch(_){}var s=document.getElementById('gachoSearch');if(s){s.focus();try{s.setSelectionRange(s.value.length,s.value.length);}catch(_){}}};
  var srchc=q('#gachoSearchClr');if(srchc)srchc.onclick=function(){_gFilter='';renderPanel();try{renderLayerGroups();}catch(_){}};
  all('.gacho-eye[data-eye]').forEach(function(el){el.onclick=function(){var l=byId(el.getAttribute('data-eye'));if(l){l.visible=!l.visible;saveState();render();}};});
  /* v20260818g: 色丸のクリックで色が順送りに変わる挙動を廃止(栗本さん「クリック毎に色が変わって分かり難い」)。
     色は緑=適当/橙=検討など意味を持つため、誤クリックで壊さない。色丸は表示専用のインジケータにする。 */
  all('.gacho-name[data-sel]').forEach(function(el){el.onclick=function(){setActive(el.getAttribute('data-sel'));};});
  all('.gacho-solo[data-solo]').forEach(function(el){el.onclick=function(){var id=el.getAttribute('data-solo');state.solo=(state.solo===id?null:id);saveState();render();};});
  all('.gacho-ren[data-ren]').forEach(function(el){el.onclick=function(){var l=byId(el.getAttribute('data-ren'));if(!l)return;var n=prompt('画層名',l.name);if(n!=null&&n.trim()){l.name=n.trim();saveState();render();}};});
  all('.gacho-del[data-del]').forEach(function(el){el.onclick=function(){var l=byId(el.getAttribute('data-del'));if(!l)return;if(confirm('画層「'+l.name+'」を削除しますか？（割当のみ削除・元データは無傷）\n※この画層名を「削除済み」に記録し、リロードで自動復活させません')){if(!state.removedLayers)state.removedLayers={};state.removedLayers[l.name]=1;state.layers=state.layers.filter(function(x){return x.id!==l.id;});if(state.solo===l.id)state.solo=null;saveState();render();}};});
  var cv=q('#gachoCapView');if(cv)cv.onclick=function(){captureViewport();};
  var cc=q('#gachoCapCond');if(cc)cc.onclick=function(){var el=q('#gachoMinArea');var v=el?Number(el.value):800;if(isNaN(v))v=0;state.lastMinArea=v;saveState();captureViewport({minArea:v});};
  var ap=q('#gachoAddPt');if(ap)ap.onclick=toggleAdd;
  var du=q('#gachoDrawUndo');if(du)du.onclick=drawUndo;
  var dn=q('#gachoDrawDone');if(dn)dn.onclick=function(){drawFinish();};
  var ad=q('#gachoAdd');if(ad)ad.onclick=addLayer;
  // グループ折りたたみ（①客/②時期/③区域/アーカイブ）
  all('.gacho-grp[data-grp]').forEach(function(el){el.addEventListener('click',function(ev){var t=ev.target;if(t&&(t.hasAttribute('data-evac')||t.hasAttribute('data-restore')))return;var k=el.getAttribute('data-grp');if(!state.grpOpen)state.grpOpen={};var cur=(k in state.grpOpen)?!!state.grpOpen[k]:_grpDefOpen(k);state.grpOpen[k]=!cur;saveState();renderPanel();});});
  // 分類変更（🏷）
  all('.gacho-tag[data-tag]').forEach(function(el){el.onclick=function(ev){ev.stopPropagation();var l=byId(el.getAttribute('data-tag'));if(!l)return;var m=layerMeta(l);var c=prompt('① クライアント',m.client);if(c==null)return;var p=prompt('② 納品時期（「納品」「確定」を含むと納品済＝退避対象）',m.period);if(p==null)return;var r=prompt('③ 行政区域',m.region);if(r==null)return;l.meta={client:(c.trim()||m.client),period:(p.trim()||m.period),region:(r.trim()||m.region),phase:/納品|確定/.test(p)?'納品済':'精査中'};saveState();renderPanel();};});
  // 退避（SWルームへ）
  all('.gacho-evac[data-evac]').forEach(function(el){el.onclick=function(ev){ev.stopPropagation();var key=el.getAttribute('data-evac');var i=key.indexOf('||');var cli=key.slice(0,i).replace(/^C:/,'');var per=key.slice(i+2);var ls=state.layers.filter(function(l){if(l.archived)return false;var m=layerMeta(l);return m.client===cli&&m.period===per;});if(!ls.length)return;if(!confirm('「'+cli+' ／ '+per+'」の'+ls.length+'画層をSWルームへ書き出し、作業台から退避します。\n（データは消えません。アーカイブに畳まれ、必要時に戻せます）\n実行しますか？'))return;evacuateLayers(ls,cli,per);};});
  all('.gacho-restore[data-restore]').forEach(function(el){el.onclick=function(ev){ev.stopPropagation();var l=byId(el.getAttribute('data-restore'));if(!l)return;l.archived=false;l.visible=true;saveState();render();toast('「'+l.name+'」を作業台へ戻しました');};});
  // 各画層を1つずつ退避
  all('.gacho-arch[data-arch]').forEach(function(el){el.onclick=function(ev){ev.stopPropagation();var l=byId(el.getAttribute('data-arch'));if(!l)return;var m=layerMeta(l);if(!confirm('画層「'+l.name+'」を退避します。\n（SWルームへ書き出し＋地図・作業台から外す。↩で戻せる）\n実行しますか？'))return;evacuateLayers([l],m.client,m.period);};});
}

// ★v20260818k(栗本さん:判定がlocalStorageだけで消えた→DB永続化・二度と消さない):
//   gachoのOK/NG判定をSupabaseにも保存し、リロード/別端末でも復元する。DBが無い/失敗しても既存動作は壊さない。
var _gDbOk={}, _gDbNg={};
function _gDb(){ try{ if(typeof window!=='undefined'&&window.db)return window.db; if(typeof db!=='undefined')return db; }catch(_){ } return null; }
/* v20260821q(ドクター「やれ」): 手描き境界をDBへ永続保存＋復元。二度と消えない様に。ai_ok_labels(source=handdraw_boundary)にmemo=JSONで幾何を保存。 */
function _boundaryMemo(it){ return JSON.stringify({iid:it.iid,latlngs:it.latlngs,area:it.area,address:it.address||'',status:(it.status==='ng'?'ng':(it.status==='ok'?'ok':'pending')),lat:it.lat,lng:it.lng}); }
/* v20260821t(ドクター「やれ」): 手描き線の保存結果を必ず画面表示。silent failureを廃止。
   ★supabase-jsはDBエラーを例外でなく res.error に入れる→第2コールバックでは捕まらない。第1コールバックで res.error を判定する。 */
function _sbToast(msg,type){ try{ if(typeof window.showToast==='function'){window.showToast(msg,type||'success');return;} }catch(_){ } try{ toast(msg); }catch(_){ } }
/* ===== 絶対に消えない: アウトボックス（保存が確認できるまで諦めず再試行し続ける。DBに入るまでlocalStorageから消さない）。ドクター2026-08-21最優先。
   判定(OK/NG)・手描き境界を積む→DB書込を試行→成功でだけ削除。失敗/DB未接続なら残して再試行(起動時/15秒毎/オンライン復帰時/操作時)。未保存はHUDで常時可視化。 ===== */
var _OUTBOX_KEY='trackerGacho_outbox_v1';
function _obGet(){try{return JSON.parse(localStorage.getItem(_OUTBOX_KEY)||'[]');}catch(_){return [];}}
function _obSet(a){try{localStorage.setItem(_OUTBOX_KEY,JSON.stringify(a));}catch(_){}}
function _obAdd(e){try{e.id=uid();e.ts=_stamp();var a=_obGet();a.push(e);_obSet(a);_updateSaveHud();_flushOutbox();}catch(_){}}
var _obFlushing=false;
// v20260823(ドクター「重複要件はカウントと分析を全てぶち壊す元凶だ」): boundary/okは今までplain insertで、
// 「この判定を確定」を複数回押すたびai_ok_labelsに行が増え続けていた(読込時のok>ng>pending選別で表示だけ誤魔化されていた)。
// ai_ok_labelsにはiid専用の一意制約が無いため、deleteFlag等で既に使っている「同じsource+member_fidsの既存行を
// 先に削除してから追加」パターンで実質upsert化する。ngは元々upsert(onConflict:feature_id)なので変更不要。
// ★2026-08-29是正(ドクター発見「OK/NG両方の記録が同時に残っている筆が197件あった」): NG確定時に
// 対応するOK記録を消す(逆も同様)処理が、これまで_persistJudgment/_persistJudgmentScored内の
// 「投げっぱなし」呼び出し(d.from(...).delete()...then(function(){},function(){}))で行われており、
// 失敗しても再試行されず、矛盾した記録が残り続けていた。この削除をアウトボックス本体(_obExec)に
// 組み込み、NG本体の書込と同じ「成功するまで再試行」の対象にする。
function _obExec(d,e){
  if(e.kind==='boundary')return d.from('ai_ok_labels').delete().eq('source','handdraw_boundary').contains('member_fids',[e.iid]).then(function(){
    return d.from('ai_ok_labels').insert({source:'handdraw_boundary',member_fids:[e.iid],lat:e.lat,lng:e.lng,memo:e.memo});
  });
  if(e.kind==='ok')return d.from('ai_ok_labels').delete().eq('source','gacho_ok').contains('member_fids',[e.fid]).then(function(){
    return d.from('ai_ok_labels').insert({source:'gacho_ok',member_fids:[e.fid],lat:e.lat,lng:e.lng,memo:e.memo||'gacho手動OK'});
  }).then(function(){
    return d.from('farmland_ng_list').delete().eq('feature_id',e.fid).like('ng_reason','gacho_ng%');
  });
  if(e.kind==='ng')return d.from('farmland_ng_list').upsert({feature_id:e.fid,lat:e.lat,lng:e.lng,ng_reason:e.reason||'gacho_ng'},{onConflict:'feature_id'}).then(function(){
    return d.from('ai_ok_labels').delete().eq('source','gacho_ok').contains('member_fids',[e.fid]);
  });
  if(e.kind==='clear')return d.from('ai_ok_labels').delete().eq('source','gacho_ok').contains('member_fids',[e.fid]).then(function(){
    return d.from('farmland_ng_list').delete().eq('feature_id',e.fid).like('ng_reason','gacho_ng%');
  });
  return null;
}
function _flushOutbox(){
  try{
    var a=_obGet(); if(!a.length){_updateSaveHud();return;}
    var d=_gDb(); if(!d){_updateSaveHud();return;}        // DB未接続=残して後で再試行(絶対に消さない)
    if(_obFlushing)return; _obFlushing=true;
    var pending=a.slice(),i=0,ok={};
    function fin(){ try{_obSet(_obGet().filter(function(x){return !ok[x.id];}));}catch(_){} _obFlushing=false; _updateSaveHud(); }
    function step(){
      if(i>=pending.length)return fin();
      var e=pending[i++]; var qb;
      try{ qb=_obExec(d,e); }catch(_){ return step(); }
      if(!qb){ ok[e.id]=1; return step(); }               // 不明kindは破棄
      try{ qb.then(function(res){ if(!(res&&res.error))ok[e.id]=1; step(); },function(){ step(); }); }
      catch(_){ step(); }
    }
    step();
  }catch(_){ _obFlushing=false; }
}
function _updateSaveHud(){
  try{
    var n=_obGet().length;
    var el=document.getElementById('gachoSaveHud');
    if(!el){ el=document.createElement('div'); el.id='gachoSaveHud'; el.style.cssText='position:fixed;bottom:10px;left:10px;z-index:100000;font:600 12px/1.4 system-ui,sans-serif;padding:6px 11px;border-radius:8px;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.4);transition:opacity .3s'; document.body.appendChild(el); }
    if(n>0){ el.style.display=''; el.style.background='rgba(234,88,12,.94)'; el.style.color='#fff'; el.textContent='💾 DB保存中… 未保存 '+n+' 件（消えません・再試行中）'; }
    else { el.style.background='rgba(22,163,74,.92)'; el.style.color='#fff'; el.textContent='✓ すべてDB保存済み'; setTimeout(function(){try{if(_obGet().length===0){el.style.display='none';}}catch(_){}} ,2200); }
  }catch(_){}
}
function _saveBoundaryToDb(it){ if(!it||it.type!=='boundary'||!it.latlngs)return;
  _obAdd({kind:'boundary',iid:it.iid,lat:(it.lat!=null?Number(it.lat):null),lng:(it.lng!=null?Number(it.lng):null),memo:_boundaryMemo(it)});
  _sbToast('💾 手描き線を保存キューへ（DBに入るまで消えません）','success'); }
function saveAllBoundariesToDb(){
  var d=_gDb(); if(!d){toast('DB未接続で保存できません');return;}
  var bs=[]; state.layers.forEach(function(l){l.items.forEach(function(it){if(it.type==='boundary'&&it.latlngs&&it.latlngs.length>=3)bs.push(it);});});
  if(!bs.length){toast('手描き境界がありません');return;}
  d.from('ai_ok_labels').select('memo').eq('source','handdraw_boundary').then(function(r){
    var have={}; (((r&&r.data))||[]).forEach(function(x){try{var m=JSON.parse(x.memo||'{}');if(m.iid)have[m.iid]=1;}catch(_){}});
    var recs=bs.filter(function(it){return !have[it.iid];}).map(function(it){return {source:'handdraw_boundary',member_fids:[it.iid],lat:(it.lat!=null?Number(it.lat):null),lng:(it.lng!=null?Number(it.lng):null),memo:_boundaryMemo(it)};});
    if(!recs.length){toast('手描き境界 '+bs.length+'件は既にDB保存済みです（消えません）');return;}
    d.from('ai_ok_labels').insert(recs).then(function(){toast('手描き境界 '+recs.length+'件をDBへ保存しました（もう消えません）');},function(){toast('保存に失敗');});
  },function(){
    var recs=bs.map(function(it){return {source:'handdraw_boundary',member_fids:[it.iid],lat:(it.lat!=null?Number(it.lat):null),lng:(it.lng!=null?Number(it.lng):null),memo:_boundaryMemo(it)};});
    d.from('ai_ok_labels').insert(recs).then(function(){toast('手描き境界 '+recs.length+'件をDBへ保存');},function(){toast('保存失敗');});
  });
}
async function loadBoundariesFromDb(){
  var d=_gDb(); if(!d)return;
  try{
    var have={}; state.layers.forEach(function(l){l.items.forEach(function(it){if(it.iid)have[it.iid]=1;});});
    var r=await d.from('ai_ok_labels').select('memo').eq('source','handdraw_boundary'); var rows=(r&&r.data)||[]; var added=0; var l=null;
    // v20260821z11: 同一iidが複数行(下書きpending＋確定ok)になり得る→iidごとに ok>ng>pending の最良を採用。
    var best={},rank={ok:3,ng:2,pending:1};
    rows.forEach(function(x){try{var m=JSON.parse(x.memo||'{}'); if(!m.iid||!m.latlngs||m.latlngs.length<3)return; var st=(m.status==='ng'?'ng':(m.status==='ok'?'ok':'pending')); var rk=rank[st]||1; if(!best[m.iid]||rk>best[m.iid].rk){best[m.iid]={m:m,st:st,rk:rk};}}catch(_){}});
    var dupGrid=await _buildDupGrid(); var dupSkipped=0; // v20260823(ドクター): ここが別ロードなので毎回復活していた本当の原因。300/337/108重複はここでも除外。
    // v20260823(ドクター「ハードリロードしたら出て来た」): 上のhave[]チェックは新規挿入を防ぐだけで、
    // 既にstateへ保存済み(=337へ後から追加された等で今は重複になった)アイテムは削除されず残り続けていた。
    // 「敷地境界（実測）」層に限り、既存アイテムも遡って300/337/108重複チェックし表示から外す(DBは無変更)。
    (function(){
      var existLayer=state.layers.filter(function(y){return y.name==='敷地境界（実測）';})[0];
      if(!existLayer)return;
      var keepEx=[];
      existLayer.items.forEach(function(it){
        if(_isNearKnown300_337_108(it.lat,it.lng,dupGrid)){dupSkipped++; if(it.iid)delete have[it.iid]; return;}
        keepEx.push(it);
      });
      existLayer.items=keepEx;
    })();
    Object.keys(best).forEach(function(iid){ if(have[iid])return; var b=best[iid],m=b.m;
      var mla=(m.lat!=null?m.lat:(m.latlngs[0]?m.latlngs[0][0]:null)), mln=(m.lng!=null?m.lng:(m.latlngs[0]?m.latlngs[0][1]:null));
      if(_isNearKnown300_337_108(mla,mln,dupGrid)){dupSkipped++;return;}
      if(!l){ l=state.layers.filter(function(y){return y.name==='敷地境界（実測）';})[0]; if(!l){l={id:uid(),name:'敷地境界（実測）',color:'#f59e0b',visible:true,active:false,items:[]};state.layers.push(l);} }
      l.archived=false; l.visible=true;
      var _st=(b.st==='pending'?null:b.st); // 未確定(pending)はstatus無し=OKに数えない
      l.items.push({iid:m.iid,type:'boundary',latlngs:m.latlngs,area:m.area,lat:mla,lng:mln,address:m.address||'敷地境界',status:_st,userJudged:(_st==='ok'||_st==='ng'),src:'handdraw'});
      have[m.iid]=1; added++;
    });
    if(added||dupSkipped){saveState();render();try{console.log('[DB復元] 手描き境界 '+added+'件(重複'+dupSkipped+'件は300/337/108と重なるため非表示)');}catch(_){}}
  }catch(e){}
}
function _applyDbStatusToItems(){
  var ch=false;
  state.layers.forEach(function(l){l.items.forEach(function(it){ if(it&&it.feature_id){
    if(_gDbOk[it.feature_id]&&it.status!=='ok'){it.status='ok';it.viewed=true;ch=true;}
    else if(_gDbNg[it.feature_id]&&it.status!=='ng'){it.status='ng';it.viewed=true;ch=true;}
  }});});
  if(ch){saveState();render();}
}
async function loadDbJudgments(){
  var d=_gDb(); if(!d)return;
  try{
    _gDbOk={}; _gDbNg={};
    var frm=0;
    while(true){ var r=await d.from('ai_ok_labels').select('member_fids').eq('source','gacho_ok').range(frm,frm+999); var rows=(r&&r.data)||[]; rows.forEach(function(x){(x.member_fids||[]).forEach(function(f){_gDbOk[f]=1;});}); if(rows.length<1000)break; frm+=1000; }
    frm=0;
    while(true){ var r2=await d.from('farmland_ng_list').select('feature_id').like('ng_reason','gacho_ng%').range(frm,frm+999); var rows2=(r2&&r2.data)||[]; rows2.forEach(function(x){_gDbNg[x.feature_id]=1;}); if(rows2.length<1000)break; frm+=1000; }
    _applyDbStatusToItems();
    // v20260821k(ドクター): DB判定の読込後、ページ側マーカー(公式放棄地/開拓候補/紫151/御所218)を判定に合わせて塗り直す。
    //   →描画がDB読込より先で「チェック済みなのに赤(未チェック)のまま」を解消。OK=緑/NG=消す。
    try{ for(var _fid in _reviewMarks){ _restyleMark(_fid,_reviewStateOf(_fid)); } }catch(_){}
    try{ render(); }catch(_){}
  }catch(e){}
}
window.__gachoReloadJudgments=loadDbJudgments;
/* ★v20260822a(ドクター「ブラウザに残すから消える」): 手動ピック(feature_id='cc'+id)の判定が過去にlocalStorageだけに残っている分を、起動時にDBへ固定(バックフィル)する。
   これで修正前に付けた63OK/6NG等も二度と消えない。_gDbOk/_gDbNg に既にある分はスキップ＝冪等(毎起動で重複しない)。手動ピックのみ('cc'始まり)＝プリセット/通常フラグは触らない。 */
function _backfillManualJudgmentsToDb(){
  var d=_gDb(); if(!d)return; var n=0;
  try{
    state.layers.forEach(function(l){ if(l.archived)return; (l.items||[]).forEach(function(it){
      var fid=it.feature_id; if(!fid||!/^cc[0-9a-fA-F]/.test(String(fid)))return; if(it.type==='boundary')return;
      if(it.status==='ok'&&!_gDbOk[fid]){ _persistJudgment(fid,it.lat,it.lng,'ok'); n++; }
      else if(it.status==='ng'&&!_gDbNg[fid]){ _persistJudgment(fid,it.lat,it.lng,'ng'); n++; }
    }); });
    if(n>0){ try{toast('🔒 手動ピックの判定 '+n+'件をDBへ固定（もう消えません）');}catch(_){}}
  }catch(e){}
}
window.__gachoBackfillManual=_backfillManualJudgmentsToDb;
/* ★v20260822b(ドクター「新しい場所で保存したら各市町村レイヤーへ移るんだろうな」):
   手動ピックの判定済み(cc+id)を、DBを正として県→市町村(手作業｜県｜市町村)へ自動整理。起動時に毎回DBから組み直す=localStorageを消しても復元。
   新しい場所=座標→市町村の対応が無い分はGSI逆ジオで解決し、DB(case_candidates.address)へ書き戻す=次回から対応表無しでも即座に正しい市町村へ入る。 */
var _MGEO_LS='trackerManualGeo_v1';
function _mgeoCache(){try{return JSON.parse(localStorage.getItem(_MGEO_LS)||'{}');}catch(_){return {};}}
function _mgeoSet(c){try{localStorage.setItem(_MGEO_LS,JSON.stringify(c));}catch(_){}}
var _PREFN={'01':'北海道','02':'青森県','03':'岩手県','04':'宮城県','05':'秋田県','06':'山形県','07':'福島県','08':'茨城県','09':'栃木県','10':'群馬県','11':'埼玉県','12':'千葉県','13':'東京都','14':'神奈川県','15':'新潟県','16':'富山県','17':'石川県','18':'福井県','19':'山梨県','20':'長野県','21':'岐阜県','22':'静岡県','23':'愛知県','24':'三重県','25':'滋賀県','26':'京都府','27':'大阪府','28':'兵庫県','29':'奈良県','30':'和歌山県','31':'鳥取県','32':'島根県','33':'岡山県','34':'広島県','35':'山口県','36':'徳島県','37':'香川県','38':'愛媛県','39':'高知県','40':'福岡県','41':'佐賀県','42':'長崎県','43':'熊本県','44':'大分県','45':'宮崎県','46':'鹿児島県','47':'沖縄県'};
var _gsiMuni=null,_gsiMuniPromise=null;
function _loadGsiMuni(){
  if(_gsiMuni)return Promise.resolve(_gsiMuni);
  if(_gsiMuniPromise)return _gsiMuniPromise;
  _gsiMuniPromise=fetch('https://maps.gsi.go.jp/js/muni.js').then(function(r){return r.text();}).then(function(t){
    var m={},re=/GSI\.MUNI_ARRAY\[\s*['"]?(\d+)['"]?\s*\]\s*=\s*['"]([^'"]+)['"]/g,x;
    while((x=re.exec(t))){ var code=('00000'+x[1]).slice(-5); m[code]=x[2].split(','); }
    _gsiMuni=m; return m;
  }).catch(function(){_gsiMuni={};return _gsiMuni;});
  return _gsiMuniPromise;
}
/* 座標→{pref,city}。①localStorageキャッシュ ②静的対応表 manualGeoByCoord ③GSI逆ジオ(市町村名はmuni.js)。見つからなければnull。 */
function _resolveManualGeo(la,ln){
  var key=la.toFixed(4)+','+ln.toFixed(4);
  var cache=_mgeoCache(); if(cache[key])return Promise.resolve(cache[key]);
  var G=window.DELIVERY2&&window.DELIVERY2.manualGeoByCoord;
  if(G){ if(G[key])return Promise.resolve(G[key]);
    for(var dx=-1;dx<=1;dx++)for(var dy=-1;dy<=1;dy++){var kk=(la+dx*0.0001).toFixed(4)+','+(ln+dy*0.0001).toFixed(4);if(G[kk])return Promise.resolve(G[kk]);} }
  return _loadGsiMuni().then(function(){
    return fetch('https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat='+la+'&lon='+ln).then(function(r){return r.json();}).then(function(j){
      var res=(j&&j.results)||{}; var mc=res.muniCd; if(!mc)return null;
      var code=('00000'+mc).slice(-5); var pref=_PREFN[code.slice(0,2)]||null; var city=null;
      var parts=_gsiMuni&&_gsiMuni[code];
      if(parts){ for(var i=0;i<parts.length;i++){var p=parts[i]; if(/[市町村区]/.test(p)&&!/[県都府道]/.test(p)){city=p;break;}}
        if(!pref){ for(var k=0;k<parts.length;k++){if(/[県都府道]$/.test(parts[k])){pref=parts[k];break;}} } }
      if(!pref||!city)return null;
      var v={pref:pref,city:city}; var c=_mgeoCache(); c[key]=v; _mgeoSet(c); return v;
    }).catch(function(){return null;});
  });
}
/* ドクター2026-08-23: 手動ピックが300/337/108と重複表示される件=表示だけ除外(DBは無変更)。
   300/337/108を約1kmグリッドでバケット化→30m以内なら地図に載せない。1回作れば使い回す(_dupGridCache)。 */
var _dupGridCache=null;
function _dupGridKey(la,ln){return Math.round(la*100)+','+Math.round(ln*100);}
function _dupGridAdd(grid,la,ln){if(la==null||ln==null)return;var k=_dupGridKey(la,ln);(grid[k]=grid[k]||[]).push([la,ln]);}
function _isNearKnown300_337_108(la,ln,grid){
  if(la==null||ln==null||!grid)return false;
  var ci=Math.round(la*100),cj=Math.round(ln*100);
  for(var i=ci-1;i<=ci+1;i++){for(var j=cj-1;j<=cj+1;j++){var arr=grid[i+','+j];if(!arr)continue;
    for(var t=0;t<arr.length;t++){if(_distM(la,ln,arr[t][0],arr[t][1])<=30)return true;}
  }}
  return false;
}
async function _buildDupGrid(){
  if(_dupGridCache)return _dupGridCache;
  var grid={};
  try{ if(window.CYAN&&window.CYAN.items)window.CYAN.items.forEach(function(x){_dupGridAdd(grid,x.la,x.ln);}); }catch(_){}
  try{ if(window.DELIVERY2&&window.DELIVERY2.items)window.DELIVERY2.items.forEach(function(x){_dupGridAdd(grid,x.lat,x.lng);}); }catch(_){}
  try{ var d=_gDb(); if(d){ var frm=0; while(true){ var r=await d.from('client_delivery_items').select('lat,lng').eq('status','confirmed').range(frm,frm+999); var rows=(r&&r.data)||[]; rows.forEach(function(x){_dupGridAdd(grid,x.lat,x.lng);}); if(rows.length<1000)break; frm+=1000; } } }catch(_){}
  // ★2026-08-29(ドクター報告「NGにしたのに、別のシアン/黄色の候補として同じ場所が出てくる」・「その都度直せ」):
  // ①適当/②検討/cyan等、独立した複数のAI候補パイプラインが互いの判定を見ていなかった。同じ座標が既に
  // ai_ok_labels(OK)/farmland_ng_list(NG)で"判定済み"なら、どのパイプライン由来でも候補として出さない
  // ようこのグリッドへ判定済み座標も加える＝loadNeutral()が読むこの1つのグリッドが「唯一の除外基準」になる。
  try{ var d2=_gDb(); if(d2){ var frmN=0; while(true){ var rN=await d2.from('farmland_ng_list').select('lat,lng').range(frmN,frmN+999); var rowsN=(rN&&rN.data)||[]; rowsN.forEach(function(x){_dupGridAdd(grid,x.lat,x.lng);}); if(rowsN.length<1000)break; frmN+=1000; } } }catch(_){}
  try{ var d3=_gDb(); if(d3){ var frmO=0; while(true){ var rO=await d3.from('ai_ok_labels').select('lat,lng').range(frmO,frmO+999); var rowsO=(rO&&rO.data)||[]; rowsO.forEach(function(x){_dupGridAdd(grid,x.lat,x.lng);}); if(rowsO.length<1000)break; frmO+=1000; } } }catch(_){}
  _dupGridCache=grid; return grid;
}
// ★2026-08-29(ドクター指示「その都度、不具合を見つけたら処理しなければ直らない。直ぐに処理だ」):
// 判定を確定した瞬間に、①適当/②検討/cyan等どの画層にいようと、同じ座標30m以内にある「まだ未判定」の
// 候補を全画層横断でその場で除去する。loadNeutral()側の恒久チェックは次回読込時に効くが、これは
// 今まさに開いているセッション内で即座に反映するための即時版。判定済み(status有り)の項目は一切触らない。
function _gachoPurgeNearbyUnjudged(lat,lng,exceptIid){
  if(lat==null||lng==null)return;
  var removed=0;
  state.layers.forEach(function(l){
    if(l.archived)return;
    var keep=[];
    l.items.forEach(function(it){
      if(it.iid===exceptIid){keep.push(it);return;}
      if(it.status){keep.push(it);return;} // 既に判定済みの項目は他パイプライン由来でも消さない
      if(it.lat==null||it.lng==null){keep.push(it);return;}
      if(_distM(lat,lng,it.lat,it.lng)<=30){removed++;return;}
      keep.push(it);
    });
    l.items=keep;
  });
  if(removed){ try{ if(typeof window.showToast==='function')window.showToast('🔗 同じ場所の未判定候補 '+removed+'件を他画層からも除外しました','success'); }catch(_){} }
}
/* DBを正に、判定済み手動ピック(cc+id)を県→市町村へ自動整理。冪等・毎起動で復元可能。 */
async function rebuildManualPicksFromDb(silent){
  var d=_gDb(); if(!d)return;
  try{
    var picks=[],frm=0;
    while(true){ var r=await d.from('case_candidates').select('id,latitude,longitude,address').range(frm,frm+999); var rows=(r&&r.data)||[]; picks=picks.concat(rows); if(rows.length<1000)break; frm+=1000; }
    var dupGrid=await _buildDupGrid();
    // ドクター2026-08-23: 300/337/108と30m以内で重複する手動ピックを、既存分も含めて全画層から表示だけ除外(DB=case_candidatesは無変更)。
    var dupRemoved=0;
    state.layers.forEach(function(l){
      if(l.archived)return;
      // v20260823(ドクター): 手動ピック系レイヤーだけでなく、flagScoreCardが作るjudgeOnlyレイヤー(適地候補判定/合筆・保留判定 等)も対象。
      //   境界(手描き線)も含め、300/337/108と重複していれば表示だけ除外する。337側に既に同じ形が入っているので線が二重に残らない。
      if(!(l.meta&&l.meta.manual)&&!l.judgeOnly&&!/手動ピック/.test(l.name||''))return;
      var keep=[]; (l.items||[]).forEach(function(it){
        if(_isNearKnown300_337_108(it.lat,it.ln!=null?it.ln:it.lng,dupGrid)){dupRemoved++;return;}
        keep.push(it);
      }); l.items=keep;
    });
    // v20260823(ドクター「区域不明が直らない」): 一度「区域不明」バケットに入ると existing[fid] が真になり、
    // DB側のaddressを後から直しても二度と再判定されなかった。区域不明バケットの中身は「未整理」扱いに戻し、
    // 毎回このDB由来のaddressで再判定させる(解決していれば正しい市町村へ、まだなら区域不明のまま=自己修復)。
    state.layers.forEach(function(l){ if(l.meta&&l.meta.manual&&(l.meta.pref==='区域不明'||l.meta.city==='区域不明')){ l.items=[]; } });
    var existing={};
    state.layers.forEach(function(l){ if(l.meta&&l.meta.manual&&l.meta.pref!=='区域不明'&&l.meta.city!=='区域不明'){ (l.items||[]).forEach(function(it){ if(it.feature_id)existing[it.feature_id]=l; }); } });
    var added=0,unknown=0;
    for(var pi=0;pi<picks.length;pi++){ var p=picks[pi];
      var fid='cc'+p.id; var st=_gDbOk[fid]?'ok':(_gDbNg[fid]?'ng':null);
      if(!st)continue; if(existing[fid])continue;
      var la=Number(p.latitude),ln=Number(p.longitude); if(isNaN(la)||isNaN(ln))continue;
      if(_isNearKnown300_337_108(la,ln,dupGrid)){dupRemoved++;continue;} // 300/337/108と重複=表示しない(DBはそのまま)
      var geo=null;
      // ①DBのaddressに「県+市町村」が既にあれば最優先(逆ジオ済み・durable)
      if(p.address){ var mm=String(p.address).match(/(.{2,3}[県都府道])(.+?[市町村区])/); if(mm)geo={pref:mm[1],city:mm[2]}; }
      if(!geo){ try{ geo=await _resolveManualGeo(la,ln); }catch(_){ geo=null; }
        if(geo){ try{ d.from('case_candidates').update({address:geo.pref+geo.city}).eq('id',p.id).then(function(){},function(){}); }catch(_){} } }
      var pref=geo?geo.pref:'区域不明',city=geo?geo.city:'区域不明'; if(!geo)unknown++;
      var L=_d2ManualDest(pref,city);
      L.items.push({iid:iid(),feature_id:fid,lat:la,lng:ln,address:'手動ピック '+la.toFixed(5)+', '+ln.toFixed(5),src:'手動ピック',status:st});
      existing[fid]=L; added++;
    }
    // 二重表示防止: 整理済みの判定を作業台のフラット「手動ピック（判定）」から外す
    var removed=0;
    state.layers.forEach(function(l){ if(l.meta&&l.meta.manual)return; if(!/手動ピック/.test(l.name||''))return;
      var keep=[]; (l.items||[]).forEach(function(it){ if(it.feature_id&&existing[it.feature_id]&&it.type!=='boundary'){removed++;return;} keep.push(it); }); l.items=keep; });
    if(added||removed||dupRemoved){ saveState(); render(); if(!silent){ try{toast('🗂 手動ピックを整理（新規'+added+'・300/337/108と重複のため非表示'+dupRemoved+'・作業台から移動'+removed+'／区域不明'+unknown+'）');}catch(_){} } }
  }catch(e){}
}
window.__gachoRebuildManual=rebuildManualPicksFromDb;
function _persistJudgment(fid,lat,lng,status){
  var d=_gDb(); if(!d||!fid)return;
  try{
    // ★2026-08-29是正: 反対側レコードの削除は_obExec内で本体書込と同じ再試行対象になったため、
    // ここでの「投げっぱなし」直接delete呼び出しは撤去(失敗しても再試行されず矛盾が残る不具合の温床だった)。
    if(status==='ok'){ _gDbOk[fid]=1; delete _gDbNg[fid];
      _obAdd({kind:'ok',fid:fid,lat:(lat!=null?Number(lat):null),lng:(lng!=null?Number(lng):null),memo:'gacho手動OK'});
    } else if(status==='ng'){ _gDbNg[fid]=1; delete _gDbOk[fid];
      _obAdd({kind:'ng',fid:fid,lat:(lat!=null?Number(lat):null),lng:(lng!=null?Number(lng):null),reason:'gacho_ng'});
    } else { delete _gDbOk[fid]; delete _gDbNg[fid];
      _obAdd({kind:'clear',fid:fid});
    }
  }catch(e){}
}
/* ===== v20260819h (ドクター): 1筆ごとの8項目スコアカード(〇/△/✖)。✖が1つでも→除外(NG)。
   構造化ラベルをそのまま学習へ: NG=farmland_ng_list.ng_reason='gacho_ng|コード', OK=ai_ok_labels.memo。
   候補はゲート通過済なので#1-6,8は既定〇、現況#7は△(要目視)で初期化。 ===== */
var GCRIT=[
 {k:'c1',t:'農振・青地',o:'外',x:'掛かる'},
 {k:'c2',t:'ハザード',o:'外',x:'掛かる'},
 {k:'c3',t:'接道',o:'有',x:'無'},
 {k:'c4',t:'電柱・連系',o:'近い',x:'無い'},
 {k:'c5',t:'日射・遮蔽',o:'良',x:'不良'},
 {k:'c6',t:'面積≥800',o:'≥800',x:'不足'},
 {k:'c7',t:'現況',o:'耕作放棄地',x:'建物/耕作/資材/太陽光'},
 {k:'c8',t:'地目・都計',o:'区域外/可',x:'不可'}
];
var GC7SUB=['既存太陽光','建物','耕作中','資材置場等','その他'];
// ★2026-08-29是正(ドクター指摘「シアンのフラグ、ハザードを全く読んでないだろ」): 従来は農振・ハザードを
// 含む全項目が「未チェックのまま自動的に緑(OK)」の既定値になっており、手描き境界等ハザードの自動判定を
// 一度も通っていない項目でも、あたかも確認済みのように見えていた(実際に土砂警戒区域の中にある筆が
// ハザード○のまま表示された実例あり)。①青地②ハザードは「即除外」の絶対ゲート(唯一の正の判断基準①②)
// なので、score_ai.py由来の実データ(it.noshin/it.haz)がある時だけそれを反映し、無ければ△(要確認)に
// する。緑(o)を「確認済み」の意味で使う以上、未確認のものに緑を出してはならない。
function _gateFromReal(v){ if(v==null)return 't'; var s=String(v).toUpperCase(); if(s==='CLEAR'||s==='PASS')return 'o'; return 'x'; }
function _defScore(it){
  var c1=(it.noshin!=null)?_gateFromReal(it.noshin):'t'; // 農振・青地: 実データが無ければ要確認(手描き境界等)
  var c2=(it.haz!=null)?_gateFromReal(it.haz):'t';        // ハザード: 同上
  return {c1:c1,c2:c2,c3:'o',c4:'o',c5:'o',c6:((it.area!=null&&it.area<800)?'x':'o'),c7:'t',c8:'o',_auto:true};
}
// ★2026-08-29是正: it.scoreは一度計算されると恒久キャッシュされ、_defScoreのロジックを直しても
// 「既に開いたことがある項目」は古い(緑)の値のまま残ってしまう不具合があった(ドクター実機確認で発覚)。
// ドクターが一度もsetCritで手を触れていない(=_auto=trueのまま)スコアは、開くたびに_defScoreを
// 再計算して常に最新ロジックを反映する。手で触った項目(setCritが_autoを外す)はそのまま保持する。
function _score(it){if(!it.score||it.score._auto)it.score=_defScore(it);return it.score;}
function _hasX(s){for(var k in s){if(s[k]==='x')return true;}return false;}
function _scoreCodes(it,s){var codes=[];for(var i=0;i<GCRIT.length;i++){if(s[GCRIT[i].k]==='x')codes.push(GCRIT[i].k);}var ex=(it.ngsub&&it.ngsub.length)?('['+it.ngsub.join('/')+']'):'';return codes.join(',')+(ex?(' '+ex):'');}
function _okPattern(s){return GCRIT.map(function(c){return c.k+':'+(s[c.k]||'t');}).join(',');}
function _persistJudgmentScored(it,s){
  var d=_gDb();if(!d||!it||!it.feature_id)return;var fid=it.feature_id,lat=it.lat,lng=it.lng;var ng=_hasX(s);
  try{
    // ★2026-08-29是正: 反対側レコードの削除は_obExec内に統合済み(再試行対象)。ここでの投げっぱなし
    // 直接delete呼び出しは撤去。
    if(ng){ _gDbNg[fid]=1; delete _gDbOk[fid];
      _obAdd({kind:'ng',fid:fid,lat:(lat!=null?Number(lat):null),lng:(lng!=null?Number(lng):null),reason:('gacho_ng|'+_scoreCodes(it,s))});
    } else { _gDbOk[fid]=1; delete _gDbNg[fid];
      _obAdd({kind:'ok',fid:fid,lat:(lat!=null?Number(lat):null),lng:(lng!=null?Number(lng):null),memo:('gacho手動OK|'+_okPattern(s))});
    }
  }catch(e){}
}
function _whyHtml(it){
  var p=[];
  if(it.area!=null)p.push('面積 '+Math.round(it.area).toLocaleString()+'㎡'+(it.area>=800?'(≥800)':'(<800!)'));
  if(it.toshi)p.push('都計 '+esc(String(it.toshi)));
  if(it.level)p.push('AI '+esc(String(it.level)));
  if(it.reject!=null)p.push('耕作放棄の可能性(AI衛星判定) '+it.reject);
  // ★2026-08-29是正(ドクター指摘): 「ハザードCLEAR=各ゲート通過」は実データに関わらず常に表示される
  // 固定文言だった。noshin/hazの実データがある時だけ書き、無ければ「未チェック」と正直に書く。
  if(it.noshin!=null||it.haz!=null){
    var gates=[];
    if(it.noshin!=null)gates.push('農振'+(_gateFromReal(it.noshin)==='o'?'外(白地)':'該当'));
    if(it.haz!=null)gates.push('ハザード'+(_gateFromReal(it.haz)==='o'?'CLEAR':'該当'));
    p.push(gates.join('/')+'=AIゲート通過');
  } else {
    p.push('<span style="color:#f59e0b">⚠ 農振・ハザードの自動判定なし(手描き等)。目視で必ず確認してください</span>');
  }
  return '<div class="gsc-why"><b>なぜ候補か</b><br>'+p.join(' ／ ')+'</div>';
}
function _gmImgHtml(it){
  if(typeof _gmStaticUrl!=='function')return '';
  var url=_gmStaticUrl(it.lat,it.lng); if(!url)return '';
  return '<div class="gsc-img"><img src="'+url+'" alt="latest satellite" onerror="this.parentNode.style.display=\'none\'"><div class="gsc-imgcap">🛰 最新衛星(Google)・目視専用（クリックで即表示）</div></div>';
}
function _scoreCardHtml(l,it){
  var s=_score(it),iid=(it.iid||'');
  var rows=GCRIT.map(function(c){
    var v=s[c.k]||'t';
    function b(val,lab,col){var on=(v===val);return '<button onclick="window.__gacho.setCrit(\''+l.id+'\',\''+iid+'\',\''+c.k+'\',\''+val+'\',this)" class="gsc-b" style="'+(on?('background:'+col+';color:#0d1117;font-weight:700;'):'')+'" title="'+esc(val==='o'?c.o:(val==='x'?c.x:'△'))+'">'+lab+'</button>';}
    var sub='';
    if(c.k==='c7'){sub='<div class="gsc-sub" id="gsub_'+iid+'" style="'+(v==='x'?'':'display:none;')+'">'+GC7SUB.map(function(t){var on=(it.ngsub&&it.ngsub.indexOf(t)>=0);return '<button onclick="window.__gacho.setSub(\''+l.id+'\',\''+iid+'\',\''+t+'\',this)" class="gsc-sb'+(on?' on':'')+'">'+esc(t)+'</button>';}).join('')+'</div>';}
    return '<div class="gsc-row"><span class="gsc-t">'+esc(c.t)+'</span><span class="gsc-bs">'+b('o','〇','#3fb950')+b('t','△','#eab308')+b('x','✖','#f85149')+'</span></div>'+sub;
  }).join('');
  var vd='<div class="gsc-vd" id="gscvd_'+iid+'">'+(_hasX(s)?'<b style="color:#f85149">✖あり → 除外(NG)</b>':'<b style="color:#3fb950">✖なし → OK可</b>')+'</div>';
  var drawBtn='<button class="gsc-draw" style="background:#062b12;border-color:#22c55e;color:#86efac" onclick="window.__gacho.useFudeAsBoundary(\''+l.id+'\',\''+iid+'\')" title="ピンの下の筆(農水省筆ポリゴン)を実測の形で敷地境界に。無ければ既知面積の下敷き">📐 この筆を敷地境界にする（実測）</button>'
    +'<button class="gsc-draw" onclick="window.__gacho.drawArea(\''+l.id+'\',\''+iid+'\')" title="実測が無い/形を変えたい時: 隣接を含め手描き→面積を再計算(⑥面積に反映)">✏️ 手描きで敷地境界（面積を増やす）</button>';
  // v20260823(ドクター「グーグルアースも全てに入れておいてくれ」): スコアカード側に1回だけ入れる=呼び出し元(108/御所218/AIKI/gappitsu_hold等)全部に自動で効く。
  var earthLink=(it.lat!=null&&it.lng!=null)?('<div style="margin:4px 0 6px"><a href="https://earth.google.com/web/@'+it.lat+','+it.lng+',0a,1000d,35y,0h,0t,0r" target="_blank" rel="noopener" style="color:#58a6ff">🌍 Googleアース</a></div>'):'';
  // v20260831c(ドクター指示・人間第2段階チェック): 「最終納品昇格チェック」モード中で、かつこの筆が
  // 1回目OK済み・予備群未昇格(_finalCheckSet対象)の時だけ、個別に1件だけ昇格させるボタンを追加表示する。
  var promoBtn=(_finalCheckSet&&it.feature_id&&_finalCheckSet[it.feature_id])
    ?('<button class="gsc-fix" style="background:#78350f;border-color:#f59e0b;margin-top:5px" onclick="window.__gacho.promoteOne(\''+it.feature_id+'\')">✅ この筆を予備群へ昇格（2回目確認）</button>')
    :'';
  return _gmImgHtml(it)+earthLink+'<div class="gsc">'+rows+vd+drawBtn+'<button class="gsc-fix" onclick="window.__gacho.applyScore(\''+l.id+'\',\''+iid+'\')">この判定を確定</button>'
    +promoBtn
    +'<button class="gsc-fix" style="background:#7f1d1d;border-color:#f85149;margin-top:5px" onclick="window.__gacho.deleteFlag(\''+l.id+'\',\''+iid+'\')">🗑 この筆を削除（OKから外す）</button></div>';
}
/* ===== v20260820m(ドクター): 判定済み(OK/NG/閲覧)フラグの見た目を変える=一度見たか一目で判る =====
   ページ側マーカー(開拓候補/公式放棄地/紫151/御所218)はfeature_idでonReview登録→判定時とマーカー再生成時に減光＋色枠。
   OK=緑枠/NG=赤枠/閲覧のみ=灰破線、いずれも減光。未判定は元の明るい色のまま。 */
var _reviewMarks={}; // fid -> Leafletマーカー
/* v20260831c(ドクター指示): 最終納品昇格チェック(人間第2段階)の状態。_finalCheckSet=fid→候補データ(現在チェック対象)、
   _finalCheckBlinking=モード中か、_finalCheckOrig=点滅前のマーカースタイル退避(復元用)。 */
var _finalCheckSet=null, _finalCheckBlinking=false, _finalCheckOrig={};
function _reviewStateOf(fid){
  if(!fid)return null;
  for(var i=0;i<state.layers.length;i++){var its=state.layers[i].items;for(var j=0;j<its.length;j++){var it=its[j];if(it.feature_id===fid){if(it.status==='ok'||it.status==='ng')return it.status;if(it.viewed)return 'viewed';}}}
  if(_gDbOk&&_gDbOk[fid])return 'ok';
  if(_gDbNg&&_gDbNg[fid])return 'ng';
  return null;
}
function _reviewStyle(st){
  if(st==='ok')return {color:'#22c55e',weight:3,fillOpacity:0.30}; // OK=緑リング(枠緑・中透明)
  if(st==='ng')return {opacity:0,fillOpacity:0}; // v20260821c(ドクター): NGは地図から見えなくする(OKだけでいい)
  if(st==='viewed')return {color:'#c9d1d9',weight:2.5,fillOpacity:0.35,dashArray:'3,3'};
  return null;
}
function _restyleMark(fid,st){var mk=_reviewMarks[fid];if(!mk)return;
  if(st==='ng'){ try{mk.remove();}catch(_){} return; } // v20260821e(ドクター): NGにした筆は地図から消す(マーカー除去)
  if(mk.setStyle){var s=_reviewStyle(st);if(s){try{mk.setStyle(s);}catch(_){}}}
}
window.__gacho={
  // v20260820g: 外部(分析ページ本体)のマーカーにも最新衛星ホバーを付けられる公開API。
  //   例) window.__gacho.hoverBind(mk, lat, lng)。農地ナビフラグ/過去AI候補に付けて手作業調査の武器にする。
  hoverBind:function(mk,lat,lng){try{_gmHoverBind(mk,lat,lng);}catch(_){}},
  // v20260820j(ドクター): ポップアップに最新衛星画像を直接埋め込むHTML(クリックで必ず出る=ホバー非依存)。キー未設定なら''。
  satImgHtml:function(lat,lng){try{return _gmImgHtml({lat:lat,lng:lng});}catch(_){return '';}},
  // v20260820m(ドクター): ページ側フラグの判定済み見た目。onReview(fid,marker)で登録=判定時＋再描画時に減光/色枠。
  reviewState:function(fid){return _reviewStateOf(fid);},
  onReview:function(fid,marker){if(!fid||!marker)return;_reviewMarks[fid]=marker;var st=_reviewStateOf(fid);if(st)_restyleMark(fid,st);},
  // v20260831c(ドクター指示・人間第2段階チェック): 「最終納品昇格チェック」ボタン用。
  toggleFinalCheck:function(){toggleFinalPromotionCheck();},
  promoteOne:function(fid){promoteOneToRound2(fid);},
  removeItem:function(lid,itemIid){var m=getMap();if(m)m.closePopup();var l=byId(lid);if(!l)return;l.items=l.items.filter(function(it){return it.iid!==itemIid;});saveState();setTimeout(function(){render();},0);},
  /* v20260821z22(ドクター): 全筆に削除ボタン。この筆をOK/NGから外し、DBのOK記録(gacho_ok/手描き境界)も削除=カウントから確実に外す。1筆ずつ・確認付き。 */
  deleteFlag:function(lid,itemIid){
    var m=getMap();var l=byId(lid);if(!l)return;var it=null;l.items.forEach(function(x){if(x.iid===itemIid)it=x;});
    if(!it)return;
    if(!confirm('この筆を削除します。\n・OK/NG判定を外し、DBのOK記録も削除＝カウントから外れます\n・地図/作業台からこの筆を消します\nよろしいですか？'))return;
    var fid=it.feature_id, d=_gDb();
    try{
      if(d&&fid){ d.from('ai_ok_labels').delete().eq('source','gacho_ok').contains('member_fids',[fid]).then(function(){},function(){});
        // ★除外リストに登録=リロードで元データから再描画されても、この筆は除外され二度と戻らない。
        d.from('farmland_ng_list').upsert({feature_id:fid,lat:(it.lat!=null?Number(it.lat):null),lng:(it.lng!=null?Number(it.lng):null),ng_reason:'gacho_ng|deleted'},{onConflict:'feature_id'}).then(function(){},function(){}); }
      if(d&&it.type==='boundary'&&it.iid){ d.from('ai_ok_labels').delete().eq('source','handdraw_boundary').contains('member_fids',[it.iid]).then(function(){},function(){}); }
    }catch(_){}
    if(fid){try{delete _gDbOk[fid];_gDbNg[fid]=1;}catch(_){}}
    state.layers.forEach(function(L){L.items=L.items.filter(function(x){return x.iid!==itemIid && !(fid&&x.feature_id===fid);});}); // 全gachoレイヤーから除去(別レイヤーの重複も)
    try{if(fid){_restyleMark(fid,'ng');delete _reviewMarks[fid];}}catch(_){}
    try{if(typeof window.__gachoRemoveFeatureMarker==='function')window.__gachoRemoveFeatureMarker(fid,(it.lat!=null?Number(it.lat):null),(it.lng!=null?Number(it.lng):null));}catch(_){} // マップ横断でfid/座標一致マーカーを地図から除去
    if(m)m.closePopup();saveState();render();
    try{if(fid)document.dispatchEvent(new CustomEvent('gachoJudged',{detail:{fid:fid,status:'ng'}}));}catch(_){}
    try{var _c=_liveCounts();toast('🗑 削除 → 今の確定OK '+_c.ok+' ・ NG '+_c.ng);}catch(_){toast('🗑 削除しました');}
  },
  /* v20260818c: 手動ピック等の画層から、判定関数isMatchに合致する項目(=納品済)を別画層dstNameへ移して退避(archived)。
     作業台の手動ピックには「今調査中の分だけ」を残し、旧納品分と連動して動かなくする。isMatch(item)→true=退避対象。返り値=移動件数。 */
  separatePicks:function(srcName,isMatch,dstName,dstColor){
    var src=state.layers.filter(function(x){return x.name===srcName&&!x.archived;})[0];
    if(!src){toast('「'+srcName+'」画層が見つかりません');return 0;}
    var moved=[],keep=[];
    src.items.forEach(function(it){ (isMatch(it)?moved:keep).push(it); });
    if(!moved.length){toast('「'+srcName+'」に納品済の一致はありませんでした（退避対象なし）');return 0;}
    src.items=keep;
    var dst=state.layers.filter(function(x){return x.name===dstName;})[0];
    if(!dst){dst={id:uid(),name:dstName,color:dstColor||'#10b981',visible:false,active:false,items:[],archived:true,meta:{client:'SUNトラスト',period:'第1回納品（確定）',region:'',phase:'納品済'}};state.layers.push(dst);}
    dst.archived=true;dst.visible=false;
    moved.forEach(function(it){dst.items.push(it);});
    saveState();render();
    toast(moved.length+'件を「'+dstName+'」へ退避（納品済を手動ピックから分離）。作業台は今調査中の分だけになりました');
    return moved.length;
  },
  review:function(lid,itemIid,val){var l=byId(lid);if(!l)return;l.items.forEach(function(it){if(it.iid===itemIid)it.viewed=!!val;});saveState();render();},
  setStatus:function(lid,itemIid,val){var m=getMap();if(m)m.closePopup();var l=byId(lid);if(!l)return;l.items.forEach(function(it){if(it.iid===itemIid){
    // v20260820u: 「既にOKの筆にOKを押すと取消(トグル)」でOKが減るのを是正。自分が確定済み(userJudged)の同じ判定を再押しだけ取消、それ以外は確定。
    if(it.status===val&&it.userJudged){ it.status=null; it.userJudged=false; }
    else { it.status=val; it.userJudged=true; if(_reviewFilter)_reviewTouched[it.feature_id||it.iid]=1; }
    it.viewed=true;
    if(it.type==='boundary'){ try{_saveBoundaryToDb(it);}catch(_){} } // v20260821z11: 境界のOK/NG確定をDBへ(消えない・アウトボックス)
    else { _persistJudgment(it.feature_id,it.lat,it.lng,it.status);_restyleMark(it.feature_id,it.status||'viewed'); }
    if(it.status)try{_gachoPurgeNearbyUnjudged(it.lat,it.lng,it.iid);}catch(_){}
    try{if(it.feature_id)document.dispatchEvent(new CustomEvent('gachoJudged',{detail:{fid:it.feature_id,status:it.status}}));}catch(_){}
  }});saveState();setTimeout(function(){render();},0);},
  setCrit:function(lid,iid,ck,val,btn){var l=byId(lid);if(!l)return;var itr=null;l.items.forEach(function(it){if(it.iid===iid){itr=it;var s=_score(it);s[ck]=val;delete s._auto;it.viewed=true;if(ck==='c7'&&val!=='x')it.ngsub=[];}});saveState();
    try{var row=btn.parentNode;row.querySelectorAll('.gsc-b').forEach(function(bb){bb.style.background='';bb.style.color='';bb.style.fontWeight='';});var col=(val==='o'?'#3fb950':(val==='x'?'#f85149':'#eab308'));btn.style.background=col;btn.style.color='#0d1117';btn.style.fontWeight='700';
      if(ck==='c7'){var sub=document.getElementById('gsub_'+iid);if(sub)sub.style.display=(val==='x'?'':'none');}
      if(itr){var vd=document.getElementById('gscvd_'+iid);if(vd)vd.innerHTML=(_hasX(_score(itr))?'<b style="color:#f85149">✖あり → 除外(NG)</b>':'<b style="color:#3fb950">✖なし → OK可</b>');}
    }catch(_){}
    if(itr&&itr.feature_id&&itr.status!=='ok'&&itr.status!=='ng')_restyleMark(itr.feature_id,'viewed'); // v20260820m: 触った時点で「閲覧済み」表示(確定前でも一度見た印)
  },
  setSub:function(lid,iid,t,btn){var l=byId(lid);if(!l)return;l.items.forEach(function(it){if(it.iid===iid){it.ngsub=it.ngsub||[];var i=it.ngsub.indexOf(t);if(i>=0)it.ngsub.splice(i,1);else it.ngsub.push(t);}});saveState();try{btn.classList.toggle('on');}catch(_){}},
  applyScore:function(lid,iid){var m=getMap();var l=byId(lid);if(!l)return;l.items.forEach(function(it){if(it.iid===iid){var s=_score(it);it.status=(_hasX(s)?'ng':'ok');it.viewed=true;it.userJudged=true;if(_reviewFilter)_reviewTouched[it.feature_id||it.iid]=1;
    if(it.type==='boundary'){ try{_saveBoundaryToDb(it);}catch(_){} } // v20260823(ドクター「モーダルを統一」): 境界も同じスコアカードを使うため、境界のDB保存も忘れず呼ぶ
    else { _persistJudgmentScored(it,s); }
    try{_gachoPurgeNearbyUnjudged(it.lat,it.lng,it.iid);}catch(_){}
    _restyleMark(it.feature_id,it.status);try{if(it.feature_id)document.dispatchEvent(new CustomEvent('gachoJudged',{detail:{fid:it.feature_id,status:it.status}}));}catch(_){}}});saveState();if(m)m.closePopup();setTimeout(function(){render();},0);},
  drawOn:function(lid){var l=byId(lid);if(!l)return;var m=getMap();if(m)m.closePopup();state.layers.forEach(function(x){x.active=(x.id===lid);});saveState();render();if(!_drawMode)toggleDraw();},
  /* v20260821z12(ドクター): ピンの下の農水省筆ポリゴン(実測の形)を取得→そのまま敷地境界に=勘で描かない。
     無ければ既知面積から下敷き(正方形)を配置(ドクター発想:面積が出る=情報が在る)。どちらも面積確認モーダル→✓OKで確定。 */
  useFudeAsBoundary:function(lid,itmIid){
    var l=byId(lid);if(!l)return;var it=null;l.items.forEach(function(x){if(x.iid===itmIid)it=x;});
    if(!it||it.lat==null){toast('位置が不明です');return;}
    var la=Number(it.lat),ln=Number(it.lng);
    toast('📐 農水省の筆ポリゴンを取得中…');
    var use=function(latlngs,area,note){
      var m=getMap();if(m)m.closePopup();
      if(!area)area=polyArea(latlngs);var c=centroid(latlngs);
      var name='敷地境界（実測）';var bl=state.layers.filter(function(x){return x.name===name;})[0];
      if(!bl){bl={id:uid(),name:name,color:'#f59e0b',visible:true,active:false,items:[]};state.layers.push(bl);}
      if(it.handBoundaryIid){ state.layers.forEach(function(L){L.items=L.items.filter(function(x){return x.iid!==it.handBoundaryIid;});}); } // 再押しで重ねない=前の境界を差し替え
      var nb={iid:iid(),type:'boundary',latlngs:latlngs,area:area,lat:c[0],lng:c[1],address:'敷地境界('+note+')',status:null,userJudged:false,src:'fude'};
      bl.items.push(nb);it.handBoundaryIid=nb.iid;try{_saveBoundaryToDb(nb);}catch(_){}
      it.area=area;it.handArea=area;it.handLatlngs=latlngs;var s=_score(it);s.c6=(area>=800?'o':'x');it.viewed=true;
      _lastDrawnBoundary={lid:bl.id,iid:nb.iid};_lastDrawTarget={lid:lid,iid:itmIid};
      saveState();render();try{if(m)m.setView([c[0],c[1]],Math.max(m.getZoom(),18));}catch(_){}
      _showAreaConfirm(area,{lid:lid,iid:itmIid});
    };
    var squareFrom=function(A){ if(!A||A<=0)return null; var side=Math.sqrt(A); var dLat=side/2/111000; var dLng=side/2/(111000*Math.cos(la*Math.PI/180)); return [[la-dLat,ln-dLng],[la-dLat,ln+dLng],[la+dLat,ln+dLng],[la+dLat,ln-dLng]]; };
    var fallback=function(){ var sq=squareFrom(it.area); if(sq){ toast('筆ポリゴンが無いため、既知面積'+(it.area?Math.round(it.area).toLocaleString():'?')+'㎡の下敷きを配置。面積を確認→✓OK（形の微修正は描き直し）'); use(sq,it.area,'面積下敷き'); } else { toast('筆ポリゴンも面積も無い＝手描きしてください'); } };
    if(typeof window.__getFudeParcelAt==='function'){
      try{ window.__getFudeParcelAt(la,ln).then(function(res){ if(res&&res.latlngs&&res.latlngs.length>=3){ toast(res.near?'✓ 最寄りの筆を採用（ピンが筆から少しズレていたため。違えば手描き/描き直し）':'✓ 筆ポリゴンを取得（実測の形）'); use(res.latlngs,res.area,res.near?'筆(最寄)':'筆(実測)'); } else { fallback(); } },function(){ fallback(); }); }catch(_){ fallback(); }
    } else { fallback(); }
  },
  /* v20260812j: 画層名を指定して(無ければ作成)取込先にし、敷地境界の描画を開始。手動ピック等のポップアップの「✏️敷地境界を描く」から呼ぶ */
  drawInLayer:function(name,color){var l=state.layers.filter(function(x){return x.name===name;})[0];if(!l){l={id:uid(),name:name,color:color||'#ff1493',visible:true,active:false,items:[]};state.layers.push(l);}state.layers.forEach(function(x){x.active=(x.id===l.id);});var m=getMap();if(m)m.closePopup();saveState();render();if(!_drawMode)toggleDraw();},
  /* v20260820h(ドクター): スコアカードの「✏️敷地境界を手描き→面積を増やす」。描いた面積を対象フラグ(lid,iid)へ反映(⑥面積)。
     描画ポリゴンは可視の「敷地境界（実測）」画層に残す=SWルームへ書出可。小さい土地を隣接含め手描きで800㎡以上に。 */
  drawArea:function(lid,iid){var m=getMap();if(m)m.closePopup();
    _drawTarget={lid:lid,iid:iid};
    var name='敷地境界（実測）';var bl=state.layers.filter(function(x){return x.name===name;})[0];
    if(!bl){bl={id:uid(),name:name,color:'#f59e0b',visible:true,active:false,items:[]};state.layers.push(bl);}
    bl.visible=true;state.layers.forEach(function(x){x.active=(x.id===bl.id);});
    saveState();render();if(!_drawMode)toggleDraw();
    toast('敷地境界を手描き: 頂点クリック→ダブルクリックで確定。面積が対象フラグ(⑥面積)へ反映されます');
  },
  /* v20260820h(ドクター): 開拓候補/公式放棄地など「画層でないフラグ」にも同じ8項目スコアカードを出す公開API。
     feature_idで全画層横断→既存判定があれば再利用(一貫性)、無ければ判定専用アイテム(noMap=地図に二重描画しない/visible:false画層)を作る。
     返り値=なぜ候補か+最新衛星+8項目+✏️手描き+この判定を確定 のHTML。setCrit/applyScore/drawArea は既存ハンドラをそのまま使う=単一定義。 */
  flagScoreCard:function(fid,meta){
    meta=meta||{};
    var it=null,fl=null,created=false;
    state.layers.forEach(function(x){x.items.forEach(function(y){if(!it&&y.feature_id===fid){it=y;fl=x;}});});
    if(!it){
      var lname=meta.layerName||'候補判定';
      fl=state.layers.filter(function(x){return x.name===lname;})[0];
      if(!fl){fl={id:uid(),name:lname,color:meta.color||'#0891b2',visible:false,active:false,items:[],judgeOnly:true};state.layers.push(fl);}
      it={iid:iid(),feature_id:fid,noMap:true,src:meta.src||'flag',
          lat:(meta.lat!=null?Number(meta.lat):null),lng:(meta.lng!=null?Number(meta.lng):null),
          area:(meta.area!=null?Number(meta.area):null),address:meta.address||'',city:meta.city||'',
          toshi:meta.toshi||'',level:meta.level||'',reject:(meta.reject!=null?meta.reject:null),
          // ★2026-08-29是正: 呼び出し元がDBクエリで既に検証済みの農振/ハザード実データ(meta.noshin/meta.haz)を
          // 渡してきた場合はここへ引き継ぐ。渡さなければ_defScoreの既定通り△(要確認)のまま=安全側。
          noshin:(meta.noshin!=null?meta.noshin:null),haz:(meta.haz!=null?meta.haz:null)};
      fl.items.push(it);created=true;saveState();
    }
    // ★2026-08-29是正: 既にキャッシュ済み(以前に一度開いたことがある)の項目は、上のnoshin/haz付与を通らず
    // 素通りしていた。meta側に実データが来ていて、item側がまだ持っていなければここで補完する(既に人が
    // 手で判定した値は上書きしない)。
    if(it.noshin==null&&meta.noshin!=null)it.noshin=meta.noshin;
    if(it.haz==null&&meta.haz!=null)it.haz=meta.haz;
    var s=_score(it);
    if(created&&meta.seed){for(var k in meta.seed){if(meta.seed[k])s[k]=meta.seed[k];}saveState();} // 実ゲート状態を初期反映(接道PENDING→△等)。再開時は手動編集を保持
    return _whyHtml(it)+_scoreCardHtml(fl,it);
  },
  moveItem:function(lid,itemIid){
    var l=byId(lid);if(!l)return;
    var others=state.layers.filter(function(x){return x.id!==lid;});
    if(!others.length){toast('移動先の画層がありません（先に作成してください）');return;}
    var msg='移動先の番号を入力:\n'+others.map(function(x,i){return (i+1)+': '+x.name;}).join('\n');
    var s=prompt(msg,'1');if(s==null)return;var idx=parseInt(s,10)-1;
    if(isNaN(idx)||idx<0||idx>=others.length){toast('番号が不正です');return;}
    var it=null;l.items=l.items.filter(function(x){if(x.iid===itemIid){it=x;return false;}return true;});
    if(it){others[idx].items.push(it);toast('「'+others[idx].name+'」へ移動しました');}
    saveState();render();
  },
  redraw:function(lid,itemIid){var m=getMap();if(m)m.closePopup();var l=byId(lid);if(!l)return;l.items=l.items.filter(function(it){return it.iid!==itemIid;});saveState();state.layers.forEach(function(x){x.active=(x.id===lid);});setTimeout(function(){render();if(!_drawMode)toggleDraw();toast('この境界を消しました。描き直してください（クリックで頂点→Wクリック確定）');},0);},
  /* v20260812d: 地図フラグを直接OK/NG判定→画層カウンターに反映。feature_idで全画層を横断検索し既存なら同じ筆をトグル、無ければ専用画層へ追加(重複防止)。取込前でも押しただけで数字が動く */
  judgeFeature:function(featureId,val,meta){
    meta=meta||{};var m=getMap();if(m)m.closePopup();
    var found=null,fl=null;
    state.layers.forEach(function(l){l.items.forEach(function(x){if(!found&&x.feature_id===featureId){found=x;fl=l;}});});
    if(!found){
      var name=meta.layerName||'フラグ判定';
      fl=state.layers.filter(function(x){return x.name===name;})[0];
      if(!fl){fl={id:uid(),name:name,color:meta.color||'#f59e0b',visible:true,active:false,items:[]};state.layers.push(fl);}
      found={iid:iid(),feature_id:featureId,lat:(meta.lat!=null?Number(meta.lat):null),lng:(meta.lng!=null?Number(meta.lng):null),address:meta.address||'',area:(meta.area!=null?Number(meta.area):null),src:meta.src||'flag'};
      fl.items.push(found);
    }
    found.status=(found.status===val?null:val);found.viewed=true;
    /* ★v20260822a(ドクター「ブラウザに残すから消える」): 手動ピックのOK/NGを通常フラグと同じDB永続化(絶対に消えないアウトボックス)に載せる。以前はsaveState()=localStorageのみ=DB非書込で消えていた。 */
    try{ _persistJudgment(found.feature_id,found.lat,found.lng,found.status); }catch(_){}
    saveState();setTimeout(function(){render();},0);
    toast('「'+fl.name+'」'+(found.status==='ok'?'✓OK':(found.status==='ng'?'🚫NG':'判定解除'))+' ／ DBへ保存（消えません）／ この画層 計'+fl.items.length+'件（OK'+fl.items.filter(function(x){return x.status==='ok';}).length+'・NG'+fl.items.filter(function(x){return x.status==='ng';}).length+'）');
  },
  /* AI候補等を画層に中立(未判定)で一括読込。feature_idで重複防止。以後は画層のフラグ=標準モーダル・OK/NGがその場で効く。 */
  // 手動ピックを常時可視の画層(gachoPane)へ積む。0画層OFF(base0非表示)でも必ず見える=「フラグが立たない」の根治。
  addManualPick:function(lat,lng,memo){
    var la=Number(lat),ln=Number(lng);if(isNaN(la)||isNaN(ln))return null;
    var name='手動ピック（判定）';
    var l=state.layers.filter(function(x){return x.name===name&&!x.archived;})[0];
    if(!l){l={id:uid(),name:name,color:'#ff1493',visible:true,active:false,items:[]};state.layers.push(l);}
    l.visible=true;
    var it={iid:iid(),lat:la,lng:ln,address:(memo&&String(memo).trim())||('手動ピック '+la.toFixed(5)+', '+ln.toFixed(5)),src:'manualpick',status:null};
    l.items.push(it);saveState();setTimeout(function(){render();},0);
    toast('📍 手動ピックのフラグを表示（'+la.toFixed(5)+', '+ln.toFixed(5)+'）／画層「'+name+'」');
    return it.iid;
  },
  // STEP1: 手動ピックに農地ナビの面積/住所/地番を後追いで埋める(瞬間フラグの後にスナップ結果を反映)。
  setPickInfo:function(iid,info){
    if(!iid||!info)return;
    var found=false;
    state.layers.forEach(function(l){l.items.forEach(function(it){if(it.iid===iid){
      if(info.area!=null)it.area=Number(info.area);
      if(info.address)it.address=info.address;
      if(info.chiban)it.chiban=info.chiban;
      it.src='農地ナビ紐付';found=true;
    }});});
    if(found){saveState();setTimeout(function(){render();},0);
      var a=(info.area!=null)?Math.round(Number(info.area)).toLocaleString()+'㎡':'不明';
      toast('📐 農地ナビ紐付: 面積 '+a+(info.address?'／'+info.address:'')+((info.area!=null&&Number(info.area)<800)?'（<800㎡:合筆/手書き検討）':''));
    }
  },
  loadNeutral:function(items,layerName,color,prefix){
    if(!items||!items.length)return;
    var l=state.layers.filter(function(x){return x.name===layerName;})[0];
    if(state.removedLayers&&state.removedLayers[layerName])return; // ★削除済み画層名は自動読込で復活させない(ドクター:消したレイヤーが復活する)
    if(l&&l.archived)return; // ★退避済み画層は自動読込で復活/再投入しない(栗本さん:退避が毎回復活するのを防ぐ)。戻すのは↩のみ
    if(!l){l={id:uid(),name:layerName,color:color||'#00e5ff',visible:true,active:false,items:[]};state.layers.push(l);}
    var pfx=(prefix||'aiKI');
    // ★現行ソースの有効fid集合(クリーン後に残る筆だけ)。
    var srcSet={};items.forEach(function(c){if(c.lat!=null&&c.lng!=null)srcSet[pfx+c.no]=1;});
    // ★reconcile(v20260818d): この画層内の「このprefixのAI候補」で現行ソースに無い筆=
    //   ハザード/土砂クリーンで除去された筆をlocalStorageから削除。古い未クリーン残存を根治。
    //   栗本さんの手動ピック/他prefix/敷地境界は触らない。生存筆の判定(status)は保持。
    var removed=0;
    l.items=l.items.filter(function(it){
      if(it.src==='aiKI'&&typeof it.feature_id==='string'&&it.feature_id.indexOf(pfx)===0&&!srcSet[it.feature_id]){removed++;return false;}
      return true;
    });
    var ex={};l.items.forEach(function(it){if(it.feature_id)ex[it.feature_id]=1;});
    var pending=[];
    items.forEach(function(c){
      if(c.lat==null||c.lng==null)return;
      var fid=pfx+c.no;
      if(ex[fid])return;
      // ★2026-08-29是正(ドクター「アドホックにするな」): 呼び出し元(score_ai.py等)が既に検証済みの
      // 農振/ハザード実データ(c.noshin/c.haz)を持っていれば、ここで必ず引き継ぐ。loadNeutral()はAI候補
      // 全レイヤー(①適当/②検討/桑名いなべ/松阪72等8箇所以上)が通る唯一の共通経路なので、ここ1箇所を
      // 直せば呼び出し元が実データを渡す限り全レイヤーに効く。
      var newIt={iid:iid(),feature_id:fid,lat:Number(c.lat),lng:Number(c.lng),address:(c.addr||c.city||''),area:(c.area!=null?Number(c.area):null),chiban:c.chiban,src:'aiKI',status:null,level:c.level,toshi:c.toshi,reject:c.reject,noshin:(c.noshin!=null?c.noshin:null),haz:(c.haz!=null?c.haz:null)};
      if(_gDbOk[fid])newIt.status='ok'; else if(_gDbNg[fid])newIt.status='ng';
      pending.push(newIt); ex[fid]=1;
    });
    // ★v20260818k: DB保存済みの判定(OK/NG)を、この画層の既存筆に復元適用(消えたOKを二度と消さない)。
    l.items.forEach(function(it){ if(it.feature_id){ if(_gDbOk[it.feature_id])it.status='ok'; else if(_gDbNg[it.feature_id])it.status='ng'; } });
    // ★2026-08-29是正: 以前に読み込み済み(=noshin/hazが未設定のままキャッシュされた)既存筆にも、
    // 今回のitemsに同じfidの実データがあれば遡って補完する。
    (function(){
      var srcByFid={}; items.forEach(function(c){ if(c.lat!=null&&c.lng!=null)srcByFid[pfx+c.no]=c; });
      l.items.forEach(function(it){
        var c=it.feature_id&&srcByFid[it.feature_id]; if(!c)return;
        if(it.noshin==null&&c.noshin!=null)it.noshin=c.noshin;
        if(it.haz==null&&c.haz!=null)it.haz=c.haz;
      });
    })();
    // ★2026-08-29(ドクター報告「NGにしたら別の黄色候補として同じ場所が出てきた」「その都度処理しろ」):
    // ①適当/②検討等のAI候補パイプラインは互いに独立しており、cyan/round2_pool/OK/NG判定と一切
    // 重複チェックしていなかった。既に他パイプラインで座標が判定・記録済みなら、この画層へは
    // (自分自身の判定でない限り)入れない/残さない。_buildDupGrid()にfarmland_ng_list/ai_ok_labelsも
    // 含めたので、ここで使うだけで全パイプライン共通の「唯一の除外基準」になる。
    _buildDupGrid().then(function(dupGrid){
      var added=0,skippedDup=0;
      pending.forEach(function(it){
        if(!it.status&&_isNearKnown300_337_108(it.lat,it.lng,dupGrid)){skippedDup++;return;}
        l.items.push(it); added++;
      });
      l.items=l.items.filter(function(it){
        if(it.status)return true; // 自分自身が既にOK/NG確定済みなら残す
        if(_isNearKnown300_337_108(it.lat,it.lng,dupGrid)){skippedDup++;return false;}
        return true;
      });
      saveState();setTimeout(function(){render();},0);
      var msg=[];if(added)msg.push('新規'+added+'件');if(removed)msg.push('ハザード除去で'+removed+'件を削除');if(skippedDup)msg.push('他判定と重複で'+skippedDup+'件を除外');
      if(msg.length)toast('画層「'+layerName+'」: '+msg.join(' ／ ')+'（クリーン反映）');
    });
  }
};

function injectStyle(){if(document.getElementById('gachoStyle'))return;var st=document.createElement('style');st.id='gachoStyle';st.textContent=''
+'.gsc{margin-top:8px;border-top:1px solid #30363d;padding-top:6px;}'
+'.gsc-why{font-size:11px;color:#9aa4ae;margin-bottom:6px;line-height:1.4;}'
+'.gsc-why b{color:#58a6ff;}'
+'.gsc-row{display:flex;align-items:center;justify-content:space-between;margin:2px 0;}'
+'.gsc-t{font-size:11px;color:#e6edf3;}'
+'.gsc-bs{display:flex;gap:3px;}'
+'.gsc-b{width:28px;border:1px solid #30363d;background:#21262d;color:#8b949e;border-radius:4px;cursor:pointer;font-size:13px;line-height:1.4;padding:1px 0;}'
+'.gsc-sub{display:flex;flex-wrap:wrap;gap:3px;margin:1px 0 5px 0;}'
+'.gsc-sb{border:1px solid #30363d;background:#21262d;color:#c9d1d9;border-radius:10px;cursor:pointer;font-size:10px;padding:1px 7px;}'
+'.gsc-sb.on{background:#f85149;color:#0d1117;border-color:#f85149;font-weight:700;}'
+'.gsc-vd{font-size:12px;margin:5px 0;text-align:center;}'
+'.gsc-draw{width:100%;background:#3a2a06;border:1px solid #f59e0b;color:#fcd34d;border-radius:6px;padding:6px;cursor:pointer;font-size:11px;font-weight:700;margin-bottom:5px;}'
+'.gsc-fix{width:100%;background:#238636;border:1px solid #2ea043;color:#fff;border-radius:6px;padding:6px;cursor:pointer;font-size:12px;font-weight:700;}'
+'.gsc-img{margin:2px 0 6px 0;text-align:center;}'
+'.gsc-img img{display:block;width:100%;height:190px;object-fit:cover;border-radius:8px;border:2px solid #22c55e;background:#161b22;}'
+'.gsc-imgcap{font-size:10px;color:#9aa4ae;margin-top:2px;}'
+'.gacho-panel{position:fixed;right:12px;bottom:12px;width:300px;z-index:1200;background:rgba(13,17,23,.95);border:1px solid #30363d;border-radius:10px;color:#e6edf3;font-size:12px;box-shadow:0 6px 24px rgba(0,0,0,.45);}'
+'.gacho-head{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #30363d;font-weight:700;}'
+'.gacho-min{background:none;border:none;color:#8b949e;cursor:pointer;font-size:15px;line-height:1;}'
+'.gacho-body{padding:8px 10px;max-height:62vh;overflow:auto;}'
+'.gacho-master{display:flex;gap:6px;margin-bottom:8px;}'
+'.gacho-btn{flex:1;background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 6px;cursor:pointer;font-size:11px;}'
+'.gacho-btn:hover{background:#30363d;}'
+'.gacho-btn.wide{width:100%;margin-top:6px;}'
+'.gacho-btn.add{background:rgba(31,111,235,.2);border-color:#1f6feb;}'
+'.gacho-btn.on{background:#f59e0b;color:#111;border-color:#f59e0b;font-weight:700;}'
+'.gacho-row{display:flex;align-items:flex-start;gap:6px;padding:4px 4px;border-radius:6px;}'
+'.gacho-row.active{background:rgba(31,111,235,.15);outline:1px solid rgba(31,111,235,.4);}'
+'.gacho-base{border-bottom:1px dashed #30363d;margin-bottom:4px;padding-bottom:6px;}'
+'.gacho-eye,.gacho-solo,.gacho-ren,.gacho-del{cursor:pointer;flex:none;}'
+'.gacho-solo.on{color:#f59e0b;}'
+'.gacho-dot{width:12px;height:12px;border-radius:50%;display:inline-block;border:1px solid rgba(255,255,255,.4);flex:none;cursor:default;}'
+'.gacho-name{flex:1;cursor:pointer;white-space:normal;overflow:visible;text-overflow:clip;word-break:break-word;line-height:1.3;}'
+'.gacho-actions{margin-top:8px;border-top:1px solid #30363d;padding-top:8px;}'
+'.gacho-active-note{color:#8b949e;margin-bottom:4px;}'
+'.gacho-cond{display:flex;align-items:center;gap:4px;margin-top:6px;font-size:11px;color:#c9d1d9;}'
+'.gacho-cond input{width:62px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:4px;padding:3px 4px;}'
+'.gacho-cond .gacho-btn{flex:none;margin-top:0;}'
+'.gacho-exp{display:flex;align-items:center;gap:4px;margin-top:8px;font-size:11px;color:#8b949e;}'
+'.gacho-exp .gacho-btn{flex:1;margin-top:0;}'
+'.gacho-cnt{padding:1px 6px 5px 30px;font-size:11px;color:#8b949e;font-weight:700;}'
+'.gacho-total{margin:2px 0 6px;padding:5px 8px;background:rgba(31,111,235,.14);border:1px solid rgba(31,111,235,.4);border-radius:6px;font-size:12px;font-weight:700;color:#e6edf3;text-align:center;}'
+'.gacho-hint{color:#6e7681;margin-top:8px;font-size:10px;line-height:1.4;}'
+'.gacho-area-lbl{background:rgba(0,0,0,.6);border:none;color:#fff;font-weight:700;font-size:11px;box-shadow:none;}'
+'.gacho-area-lbl:before{display:none;}'
+'.gacho-noarea .gacho-area-lbl{display:none !important;}';
document.head.appendChild(st);}

/* v20260820s(ドクター): 手描き敷地境界=当然OK。既存の手描き図形(type='boundary')を読込時に一括でOK判定に格上げ(冪等)。 */
function _upgradeHandDrawnOk(){try{var n=0;state.layers.forEach(function(l){l.items.forEach(function(it){if(it.type==='boundary'&&it.status!=='ng'&&(it.status!=='ok'||!it.userJudged)){it.status='ok';it.userJudged=true;if(!it.src)it.src='handdraw';n++;}});});if(n){saveState();try{console.log('[画層] 手描き境界 '+n+'件OK');}catch(_){}}}catch(_){}}
/* v20260821p(ドクター「戻せ」): v20260821oの退避解除が納品300/古い境界まで数えてしまった間違いを撤回。
   09:13スナップショットで archived だった画層を再度 archived に戻す=余計な分を数えない。一度きり。 */
function _reArchiveFromSnapOnce(){try{if(localStorage.getItem('trackerGacho_rearch_p'))return;var raw=localStorage.getItem(_MIG_SNAP_KEY);if(!raw)return;var snap=JSON.parse(raw);if(!snap||!snap.state)return;var arch={};(snap.state.layers||[]).forEach(function(l){if(l.archived)arch[l.name]=1;});var m=0;state.layers.forEach(function(l){if(arch[l.name]&&!l.archived){l.archived=true;l.visible=false;m++;}});if(m)saveState();localStorage.setItem('trackerGacho_rearch_p','1');try{console.log('[再退避] '+m+'画層を09:13状態へ');}catch(_){}}catch(_){}}
/* v20260821h(ドクター): 「自動OKを外す」で赤化(未確認に戻った)フラグを、朝の📸スナップショットからOKへ自動復元。
   スナップショットでstatus=okだった筆で、今status無し(NGでない)のものをokに戻す=被害を元に戻す。NG/既OKは触らない。 */
function _restoreClearedAutoOk(){try{var raw=localStorage.getItem(_MIG_SNAP_KEY);if(!raw)return;var snap=JSON.parse(raw);if(!snap||!snap.state||!snap.state.layers)return;var snapOk={};snap.state.layers.forEach(function(l){(l.items||[]).forEach(function(it){if(it.status==='ok'){var k=it.feature_id||it.iid;if(k)snapOk[k]=1;}});});var n=0;state.layers.forEach(function(l){l.items.forEach(function(it){var k=it.feature_id||it.iid;if(k&&snapOk[k]&&it.status!=='ok'&&it.status!=='ng'){it.status='ok';n++;}});});if(n){saveState();try{console.log('[復元] 自動OK '+n+'件を復元');}catch(_){}}}catch(_){}}
/* v20260821i(ドクター): 「自動OKを外す」被害を確実に戻すため、朝08:58の📸スナップショットへ一度だけ完全復元。
   その後 loadDbJudgments であなたのDB確定判定(OK/NG)を再適用=紫/赤含め全部が朝の状態＋あなたの判定に戻る。一度きり(フラグで再実行しない)。 */
function _fullRestoreOnce(){try{if(localStorage.getItem('trackerGacho_fullRestore_20260821'))return;var raw=localStorage.getItem(_MIG_SNAP_KEY);if(!raw)return;var snap=JSON.parse(raw);if(!snap||!snap.state||!snap.state.layers||!snap.state.layers.length)return;state=snap.state;saveState();localStorage.setItem('trackerGacho_fullRestore_20260821','1');try{console.log('[全復元] 08:58スナップショットへ復元');}catch(_){}}catch(_){}}
/* ★削除した筆を二度と復活させない(ドクター): 除外リスト(gacho_ng|deleted)を読み、gachoレイヤーから除去＋ページ側マーカーを掃引。起動時＋数秒おき(遅延描画対策)。 */
var _deletedFidSet={};
async function _sweepDeletedFlags(){
  try{ var d=_gDb(); if(!d)return;
    var r=await d.from('farmland_ng_list').select('feature_id,lat,lng').eq('ng_reason','gacho_ng|deleted');
    var rows=(r&&r.data)||[]; var any=false;
    // ★OK保護: 現在OK(gacho_ok=_gDbOk)の筆は絶対に掃引しない(再OKした削除済みを誤消去しない)。
    rows=rows.filter(function(x){ return x.feature_id!=null && !(_gDbOk&&_gDbOk[x.feature_id]); });
    rows.forEach(function(x){ _deletedFidSet[x.feature_id]=1; });
    // gachoレイヤーから削除済みfidを除去(OKでないもののみ=上でOK除外済み)。境界(type=boundary)や手描きは触らない。
    state.layers.forEach(function(l){ if(!l.items)return; var before=l.items.length; l.items=l.items.filter(function(it){ if(it.type==='boundary')return true; if(it.status==='ok')return true; return !(it.feature_id&&_deletedFidSet[it.feature_id]); }); if(l.items.length!==before)any=true; });
    if(any){saveState();try{render();}catch(_){}}
    // ページ側マーカーを掃引(座標も渡す)
    rows.forEach(function(x){ try{ if(typeof window.__gachoRemoveFeatureMarker==='function')window.__gachoRemoveFeatureMarker(x.feature_id,x.lat,x.lng); }catch(_){} });
  }catch(_){}
}
window.__gachoSweepDeleted=_sweepDeletedFlags;
function boot(){var m=getMap();if(!m||typeof L==='undefined'){return setTimeout(boot,250);}_reArchiveFromSnapOnce();
  try{if(!localStorage.getItem('gacho_hidebase_z33')){state.base0Visible=false;saveState();localStorage.setItem('gacho_hidebase_z33','1');}}catch(_){} // v20260821z33(ドクター): ゴミ(素の候補フラグ)を一度だけ非表示に。👁0画層で戻せる
  try{if(!localStorage.getItem('gacho_recolor_manual_orange_1')){var _rc=0;state.layers.forEach(function(l){if(/^手作業｜/.test(l.name||'')&&l.color==='#ff1493'){l.color='#f97316';_rc++;}});if(_rc)saveState();localStorage.setItem('gacho_recolor_manual_orange_1','1');}}catch(_){} // v20260822zr(ドクター): 手動ピック(判定)とピンクが同色で見分かない不具合を是正=既存「手作業｜県｜市町村」だけオレンジへ一度限り
  try{if(!localStorage.getItem('gacho_archive_orphan_flag_1')){var _oc=0;state.layers.forEach(function(l){if(l.name==='手作業ピック'&&!l.archived){l.archived=true;l.visible=false;if(state.solo===l.id)state.solo=null;_oc++;}});if(_oc)saveState();localStorage.setItem('gacho_archive_orphan_flag_1','1');}}catch(_){} // v20260822zs(ドクター): 撤去済み旧フラグ機能がブラウザに残した孤立画層「手作業ピック」(現行コードに作成箇所なし)だけを名指しで退避・一度限り・可逆
  try{if(!localStorage.getItem('gacho_autotidy_1')){var _old=state.layers.filter(function(l){ if(l.archived||!(l.items&&l.items.length))return false; if(_isD2Layer(l)||_d2IsPink(l))return false; if(/手動ピック|敷地境界/.test(l.name||''))return false; if(l.items.some(function(it){return it.type==='boundary';}))return false; return true; }); if(_old.length){ try{ if(typeof evacuateLayers==='function'){evacuateLayers(_old,'旧作業台整理(自動)','退避_'+_stamp());} else {_old.forEach(function(l){l.archived=true;l.visible=false;if(state.solo===l.id)state.solo=null;});saveState();} }catch(_){ _old.forEach(function(l){l.archived=true;l.visible=false;});saveState(); } } localStorage.setItem('gacho_autotidy_1','1');}}catch(_){} // v20260822zw(ドクター): 手作業探索を始める前に地図上の旧AI候補(愛知田原・三重大台大紀・御所218等)を退避=既存「🧹旧レイヤーを退避で片付け」と同一ロジックを確認無しで一度だけ自動実行・可逆(退避欄↩で戻せる)・第2回/手作業/手動ピック/境界は対象外
  // v20260823(ドクター「決めたことが動いていない、色以外にも同じ不具合の可能性がある」): 一度限りの移行(above)は
  // その場しのぎで、新しい決定のたびに個別対応が要る弱点があった。既知のシステム画層は毎回起動時に正しい色を
  // 強制的に当て直す(ブラウザに残った古い状態が、コード側の決定と永遠にズレたままになるのを構造的に防ぐ)。
  try{
    var CANON_COLORS=[
      {test:function(n){return n==='敷地境界（実測）';}, color:'#f59e0b'},
      {test:function(n){return n==='手動ピック（判定）';}, color:'#ff1493'},
      {test:function(n){return /^手作業｜/.test(n);}, color:'#f97316'},
      {test:function(n){return /^第2回納品候補｜/.test(n);}, color:'#0891b2'}
    ];
    var _cc=0;
    state.layers.forEach(function(l){
      var n=l.name||'';
      for(var i=0;i<CANON_COLORS.length;i++){
        if(CANON_COLORS[i].test(n)&&l.color!==CANON_COLORS[i].color){ l.color=CANON_COLORS[i].color; _cc++; break; }
      }
    });
    if(_cc){ saveState(); try{console.log('[画層] 色の不一致を'+_cc+'件、起動時に正規化しました');}catch(_){} }
  }catch(_){}
  injectStyle();buildPanel();/* v20260821z11(ドクター): _upgradeHandDrawnOk撤去=描いた瞬間にOKにしない。面積確認→✓OKで確定 */ensurePane(m);render();applyBase0();try{loadDbJudgments().then(function(){try{_backfillManualJudgmentsToDb();}catch(_){}try{rebuildManualPicksFromDb(true);}catch(_){}});setTimeout(loadDbJudgments,2500);setTimeout(function(){try{_backfillManualJudgmentsToDb();}catch(_){}try{rebuildManualPicksFromDb(true);}catch(_){}},4200);}catch(_){}m.on('zoomend',updateAreaLabels);updateAreaLabels();
  try{loadBoundariesFromDb();setTimeout(loadBoundariesFromDb,2600);}catch(_){} // v20260821q: DBから手描き境界を復元(消えない)
  try{loadDelivery2FromDb();setTimeout(loadDelivery2FromDb,2600);}catch(_){} // v20260823: 362はround2_poolからライブ取得(静的ファイル依存を撤去)
  // 削除した筆を復活させない: 起動時＋遅延描画に追随して掃引
  try{ _sweepDeletedFlags(); setTimeout(_sweepDeletedFlags,1800); setTimeout(_sweepDeletedFlags,4500); setTimeout(_sweepDeletedFlags,9000); setInterval(_sweepDeletedFlags,20000); m.on('moveend zoomend',function(){_sweepDeletedFlags();}); }catch(_){}
  // 絶対に消えない: 起動時に未保存をDBへ再送→15秒毎に再試行→オンライン復帰で即再送。HUDで未保存件数を常時表示。
  try{ _updateSaveHud(); _flushOutbox(); setTimeout(_flushOutbox,3000); setInterval(_flushOutbox,15000);
    if(typeof window!=='undefined'){window.addEventListener('online',function(){_flushOutbox();}); window.addEventListener('focus',function(){_flushOutbox();});}
  }catch(_){}
  try{m.on('movestart zoomstart dragstart popupopen click',function(){_gmHideFloat();});m.getContainer().addEventListener('mouseleave',function(){_gmHideFloat();});}catch(_){} // v20260821i: ホバー衛星画像の取り残し(黒箱)対策
  document.addEventListener('keydown',function(e){var tag=((e.target&&e.target.tagName)||'').toLowerCase();if(tag==='input'||tag==='textarea')return;if(e.key==='Escape'){if(_rectMode)cleanupRect();if(_drawMode)cancelDraw();if(_pickMode)cleanupPick();if(_addMode)cleanupAdd();}if(_drawMode&&(e.key==='Backspace'||((e.ctrlKey||e.metaKey)&&(e.key==='z'||e.key==='Z')))){e.preventDefault();drawUndo();}});}
boot();
})();

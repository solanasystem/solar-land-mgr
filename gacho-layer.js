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
  // 取込先が無ければ「手動ピック（判定）」画層を自動で用意して可視化。
  var l=activeLayer();
  if(!l){
    l=state.layers.filter(function(x){return x.name==='手動ピック（判定）'&&!x.archived;})[0];
    if(!l){l={id:uid(),name:'手動ピック（判定）',color:'#ff1493',visible:true,active:true,items:[]};state.layers.push(l);}
    state.layers.forEach(function(x){x.active=(x.id===l.id);});
  }
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
  if(_drawMode){if(_rectMode)cleanupRect();if(_pickMode)cleanupPick();if(_addMode)cleanupAdd();m.closePopup();_drawPanesOff();try{m.doubleClickZoom.disable();}catch(_){}m.getContainer().style.cursor='crosshair';m.on('click',drawClick);m.on('dblclick',drawFinish);toast('頂点をクリックで追加→ダブルクリックで確定（ESCで取消）');}
  else{cancelDraw();}
  renderPanel();
}
function drawClick(e){var m=getMap();try{m.closePopup();}catch(_){}_drawPts.push([e.latlng.lat,e.latlng.lng]);var mk=L.circleMarker(e.latlng,{pane:'gachoPane',radius:4,color:'#fff',weight:1,fillColor:'#f59e0b',fillOpacity:1}).addTo(m);_drawMarkers.push(mk);redrawTemp();}
function redrawTemp(){var m=getMap();if(_drawTemp){try{m.removeLayer(_drawTemp);}catch(_){}_drawTemp=null;}if(_drawPts.length>=2){var ring=_drawPts.slice();if(_drawPts.length>=3)ring=ring.concat([_drawPts[0]]);_drawTemp=L.polyline(ring,{pane:'gachoPane',color:'#f59e0b',weight:2,dashArray:'5,5'}).addTo(m);}}
function drawUndo(){var m=getMap();if(!_drawPts.length){toast('戻す頂点がありません');return;}_drawPts.pop();var mk=_drawMarkers.pop();if(mk&&m){try{m.removeLayer(mk);}catch(_){}}redrawTemp();toast('1つ戻しました（残り頂点'+_drawPts.length+'）');}
function drawFinish(e){if(e){try{L.DomEvent.stop(e);}catch(_){}}if(_drawPts.length<3){toast('3点以上必要です');return;}var l=activeLayer();if(!l){cancelDraw();return;}var latlngs=_drawPts.slice();var area=polyArea(latlngs);var c=centroid(latlngs);var _nb={iid:iid(),type:'boundary',latlngs:latlngs,area:area,lat:c[0],lng:c[1],address:'敷地境界',status:'ok',userJudged:true,src:'handdraw'};l.items.push(_nb);try{_saveBoundaryToDb(_nb);}catch(_){} // v20260820s: 手描き=OK。v20260821q: 描いた瞬間にDBへ保存(消えない)
  // v20260820h(ドクター): _drawTarget があれば、描いた面積を対象フラグ(候補)に反映=小さい土地を手描きで800㎡以上へ。⑥面積スコアも更新。
  var tgt=_drawTarget;_drawTarget=null;var tmsg='';
  if(tgt){var tl=byId(tgt.lid);if(tl){tl.items.forEach(function(it){if(it.iid===tgt.iid){it.area=area;it.handArea=area;it.handLatlngs=latlngs;var s=_score(it);s.c6=(area>=800?'o':'x');it.viewed=true;}});}tmsg='／ 対象フラグの面積を '+Math.round(area).toLocaleString()+'㎡ に更新(⑥面積'+(area>=800?'〇':'✖')+')';}
  saveState();cancelDraw();render();toast('敷地境界を「'+l.name+'」に追加（約'+Math.round(area).toLocaleString()+'㎡）'+tmsg);}
function cancelDraw(){var m=getMap();_drawMarkers.forEach(function(mk){try{if(m)m.removeLayer(mk);}catch(_){}});_drawMarkers=[];if(_drawTemp){try{if(m)m.removeLayer(_drawTemp);}catch(_){}_drawTemp=null;}_drawPts=[];_drawPanesOn();if(m){m.off('click',drawClick);m.off('dblclick',drawFinish);try{m.doubleClickZoom.enable();}catch(_){}m.getContainer().style.cursor='';}_drawMode=false;renderPanel();}

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
  if(!l){l={id:uid(),name:name,color:'#ff1493',visible:true,active:false,items:[],meta:{client:'第2回納品候補',period:pref,region:city,pref:pref,city:city,manual:true}};state.layers.push(l);}
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
function applyBase0(){var m=getMap();if(!m)return;var panes=m.getPanes();Object.keys(panes).forEach(function(name){if(name==='mapPane'||name==='tilePane'||name==='gachoPane'||name==='popupPane'||name==='noshinPane'||name==='farmlandPane'||name==='cityPlanPane')return;try{panes[name].style.display=state.base0Visible?'':'none';}catch(_){}});}
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
      var acts='<div style="margin-top:8px"><button onclick="window.__gacho.setStatus(\''+l.id+'\',\''+(it.iid||'')+'\',\'ok\')" style="background:rgba(63,185,80,.25);border:1px solid #3fb950;color:#e6edf3;border-radius:4px;padding:3px 7px">✓ OK</button> <button onclick="window.__gacho.setStatus(\''+l.id+'\',\''+(it.iid||'')+'\',\'ng\')" style="background:rgba(248,81,73,.25);border:1px solid #f85149;color:#e6edf3;border-radius:4px;padding:3px 7px">🚫 NG(除外)</button></div><div style="margin-top:4px"><button onclick="window.__gacho.drawOn(\''+l.id+'\')">✏️ 敷地境界を描く</button> <button onclick="window.__gacho.moveItem(\''+l.id+'\',\''+(it.iid||'')+'\')">⇄ 別画層へ</button> <button onclick="window.__gacho.removeItem(\''+l.id+'\',\''+(it.iid||'')+'\')" title="この画層から筆を取り除く（元データは無傷）">🗑 外す</button></div>';
      var seen='<span style="color:#9aa4ae">'+(vd?'✓ 見た':'')+'</span>';
      var stat=it.status==='ok'?' <b style="color:#3fb950">✓OK</b>':(it.status==='ng'?' <b style="color:#f85149">🚫NG(除外)</b>':'');
      var gmap='<div style="margin-top:6px"><a href="https://www.google.com/maps/search/?api=1&query='+it.lat+','+it.lng+'" target="_blank" rel="noopener" style="color:#58a6ff">🌐 Googleマップ</a> ｜ <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+it.lat+','+it.lng+'" target="_blank" rel="noopener" style="color:#58a6ff">🚶 ストリートビュー</a></div>';
      if(it.type==='boundary'&&it.latlngs&&it.latlngs.length>=3){
        var bacts='<div style="margin-top:8px"><button onclick="window.__gacho.setStatus(\''+l.id+'\',\''+(it.iid||'')+'\',\'ok\')" style="background:rgba(63,185,80,.25);border:1px solid #3fb950;color:#e6edf3;border-radius:4px;padding:3px 7px">✓ OK</button> <button onclick="window.__gacho.setStatus(\''+l.id+'\',\''+(it.iid||'')+'\',\'ng\')" style="background:rgba(248,81,73,.25);border:1px solid #f85149;color:#e6edf3;border-radius:4px;padding:3px 7px">🚫 NG(除外)</button></div><div style="margin-top:4px"><button onclick="window.__gacho.redraw(\''+l.id+'\',\''+(it.iid||'')+'\')">🗑 描き直す</button> <button onclick="window.__gacho.moveItem(\''+l.id+'\',\''+(it.iid||'')+'\')">⇄ 別画層へ</button> <button onclick="window.__gacho.removeItem(\''+l.id+'\',\''+(it.iid||'')+'\')">🗑 削除</button></div>';
        var pg=L.polygon(it.latlngs,it.status==='ng'?{pane:'gachoPane',color:'#6e7681',weight:1,fillColor:'#6e7681',fillOpacity:0.1,dashArray:'4,4'}:(it.status==='ok'?{pane:'gachoPane',color:'#22c55e',weight:3,fillColor:'#22c55e',fillOpacity:0.30}:{pane:'gachoPane',color:l.color,weight:2,fillColor:l.color,fillOpacity:vd?0.08:0.25,dashArray:vd?'4,4':null})); // v20260821g(ドクター): 手描き=OK=緑の枠+緑の塗り(ピンクにしない)
        pg.bindPopup('<div style="font-size:12px;min-width:160px"><b style="color:'+l.color+'">'+esc(l.name)+'</b> '+seen+stat+'<br>敷地境界<br>'+areaTxt+gmap+bacts+'</div>');
        pg.bindTooltip(Math.round(it.area||0).toLocaleString()+'㎡',{permanent:true,direction:'center',className:'gacho-area-lbl',pane:'gachoPane'});
        pg.on('popupopen',function(){if(!it.viewed){it.viewed=true;saveState();}}); // v20260821h(ドクター): クリックで色を変えない
        g.addLayer(pg);
      }else{
        // v20260821c(ドクター): OK=緑リング(枠緑・中透明)に統一。NGは地図から見えなくする(OKだけでいい)。未確認は元のまま。
        // v20260821h(ドクター): クリック(見た)で色を変えない=間違いの元を止める。OK=緑リング/未確認=白枠+元色(常に一定)。
        var _sty=it.status==='ok'?{radius:7,color:'#22c55e',weight:3,fillColor:l.color,fillOpacity:0.30}:{radius:7,color:'#fff',weight:2,fillColor:l.color,fillOpacity:0.95};
        var mk=L.circleMarker([it.lat,it.lng],Object.assign({pane:'gachoPane'},_sty));
        if(_reviewFilter&&it.iid)_reviewMarkerByIid[it.iid]=mk; // v20260820t: 送り機能でopenPopup
        if(it.status!=='ng') _gmHoverBind(mk,it.lat,it.lng); // ①ホバー最新衛星(NG済は除外=課金しない・キー無ければno-op)
        mk.bindPopup('<div style="font-size:12px;min-width:250px"><b style="color:'+l.color+'">'+esc(l.name)+'</b> '+seen+stat+'<br>'+esc(it.address||(Number(it.lat).toFixed(5)+', '+Number(it.lng).toFixed(5)))+(it.chiban?'<br>地番 '+esc(it.chiban):'')+'<br>'+areaTxt+(it.deliver?'<br>区分 '+esc(it.deliver):'')+gmap+(it.src==='aiKI'?(_whyHtml(it)+_scoreCardHtml(l,it)):acts)+'</div>');
        mk.on('popupopen',function(){if(!it.viewed){it.viewed=true;saveState();}}); // v20260821h(ドクター): クリックで色を変えない
        g.addLayer(mk);
      }
    });
    g.addTo(m);_groups[l.id]=g;
  });
  // ★applyBase0()はここ(毎描画)では呼ばない。フラグ削除/OK/NG等の再描画のたびに走ると、
  //   0画層OFF中に手動ONしたハザード等overlayPaneを巻き込んで消す不具合になる(栗本さん報告)。
  //   applyBase0は「0画層トグル/一括表示・非表示/初期化」時のみ実行する(showAll/hideAll/b0 onclick/boot)。
  updateAreaLabels();
}

function render(){renderPanel();renderLayerGroups();}

/* ===== 画層の分類(①クライアント②納品時期③行政区域) — レイヤー構造を明確化 ===== */
function layerMeta(l){
  if(l.meta && l.meta.client) return l.meta;
  var n=String(l.name||'');
  var client=/SUN|サントラスト|奈良|御所|三重|松阪|桑名|いなべ|玉城|多気/i.test(n)?'SUNトラスト':'共通・自社';
  var region=/奈良|御所/.test(n)?'奈良県':(/三重|松阪|桑名|いなべ|玉城|多気/.test(n)?'三重県':'（区域横断）');
  var delivered=/納品|合筆提案|敷地境界|実測/.test(n) && !/AI候補|要確認|精査/.test(n);
  l.meta={client:client, region:region,
    period:delivered?'第1回納品（〜2026-08-06 確定）':'精査中（作業台）',
    phase:delivered?'納品済':'精査中'};
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
function renderPanel(){
  window.__gachoMapMode=!!(_drawMode||_rectMode||_pickMode||_addMode); // v20260812j: 地番ポップアップ/手動ピック確認モーダルの抑止フラグ(描画等の邪魔をしない)
  var box=document.getElementById('gachoPanel');if(!box)return;var al=activeLayer();var h='';
  h+='<div class="gacho-head"><span>🗂 画層</span><button class="gacho-min" id="gachoMin" title="開閉">—</button></div>';
  h+='<div class="gacho-body" id="gachoBody">';
  h+='<div class="gacho-master"><button id="gachoShowAll" class="gacho-btn">👁 全て表示</button><button id="gachoHideAll" class="gacho-btn">🚫 全て隠す</button></div>';
  // v20260821z(ドクター): 「未確認のみ表示」撤去(断捨離)。面積ラベルは残す。
  h+='<div class="gacho-master"><button id="gachoAreaLbl" class="gacho-btn'+(state.showArea?' on':'')+'" title="敷地境界の面積ラベル表示（ズーム15以上で表示）">㎡ 面積ラベル</button></div>';
  // v20260821z2(ドクター): 「見た分をOKに一括」「除外は非表示」撤去(断捨離)。NGは既定(showNg=false)で地図から隠れたまま=機能は維持。
  // v20260820i(ドクター): 納品300を座標突合して画層から完全削除(先にSW退避=DB無変更・完全復元可)
  // v20260821z(ドクター): 「📦 納品300を突合して削除」は撤去(納品300は第2回母集団で除外済＝不要な危険ボタン・断捨離)。退避戻しは退避がある時だけ残す。
  if(_hasDelivBackup())h+='<div class="gacho-master"><button id="gachoRestoreDeliv" class="gacho-btn on" title="退避した納品を画層へ戻す">↩ 納品を戻す</button></div>';
  // v20260820n(ドクター): レイヤー構造移行 Phase0=移行前スナップショット(全フラグ＋判定を丸ごとSW＋基準カウント)＋復元
  h+='<div class="gacho-master"><button id="gachoMigSnap" class="gacho-btn" title="レイヤー構造の組み替え前に、全フラグ＋判定(OK/NG/閲覧)を丸ごとSWへ書出＋基準カウント。消えない・判定が残るの証拠＆完全復元点">📸 移行前スナップショット</button>'+(_hasMigSnapshot()?'<button id="gachoMigRestore" class="gacho-btn on" title="スナップショット時点の画層状態に戻す">↩ スナップに戻す</button>':'')+'</div>';
  h+='<div class="gacho-master"><button id="gachoRestoreFile" class="gacho-btn on" title="ダウンロード済みの移行前スナップショットJSONファイルを選んで直接復元(手描き境界を戻す)">📂 スナップJSONから復元</button></div>';
  // 第2回納品候補 県→市町村 移行（慎重運用: 移動だけでは消えない・削除は別・総数変化で自動中断復元）
  if(window.DELIVERY2){
    h+='<div class="gacho-master"><button id="gachoD2Rebuild" class="gacho-btn" style="background:rgba(8,145,178,.28);border-color:#22d3ee;font-weight:700" title="第2回納品候補の階層を確定データ('+(window.DELIVERY2.totalItems||512)+')に完全一致。移動/補完/外れNGの除外を一括・可逆・推奨">🔄 第2回を確定データに一致（'+(window.DELIVERY2.totalItems||512)+'）</button></div>';
    h+='<div class="gacho-master"><button id="gachoD2Migrate" class="gacho-btn" style="background:rgba(8,145,178,.18);border-color:#0891b2" title="OKフラグ＋手描き境界を『第2回納品候補｜県｜市町村』へ移動(納品300除外)。先に自動スナップ・移動だけでは消えない・総数不変を確認">🗂 第2回納品候補へ整理（県→市町村）</button></div>';
    h+='<div class="gacho-master"><button id="gachoD2Complete" class="gacho-btn" style="background:rgba(63,185,80,.16);border-color:#3fb950" title="DBの正(526)から、ブラウザに無い不足分を第2回階層へ補完。既存は重複させない・可逆">➕ 不足分をDBから補完（'+(window.DELIVERY2.totalItems||526)+'へ）</button></div>';
    h+='<div class="gacho-master"><button id="gachoD2Manual" class="gacho-btn" style="background:rgba(255,20,147,.16);border-color:#ff1493" title="手作業ピック(ピンク)を『手作業｜県｜市町村』へ整理して階層表示。ピックの中身は不変・入れ物だけ整理・可逆">🖐 手作業ピックも県→市町村へ</button></div>';
    if(_d2Emptied.length||_hasD2Snap()){
      h+='<div class="gacho-master">'+(_d2Emptied.length?'<button id="gachoD2Del" class="gacho-btn on" title="移動で空になった元レイヤーを削除(0件のみ・総数不変を再確認)">🗑 空レイヤー削除（'+_d2Emptied.length+'）</button>':'')+(_hasD2Snap()?'<button id="gachoD2Undo" class="gacho-btn on" title="第2回移行を移行前に戻す">↩ 移行を元に戻す</button>':'')+'</div>';
    }
  }
  // ★v20260818j(栗本さん:根拠のある数字だけ見せろ): OK/NGは「判定対象の候補レイヤー」だけで意味を持つ。
  //   参照(保留/対象外/要確認)・納品済(archived)・敷地境界(描画)はOK/NGが無意味なので、計(件数)だけ出し合計に入れない。
  //   合計は「表示中(👁ON)かつ候補レイヤー」だけ=いま調査中の判定進捗になる。
  var _isRef=function(l){ if(l.archived)return true; return /保留|対象外|敷地境界|納品|要確認/.test(l.name||''); };
  var _tOk=0,_tNg=0,_tV=0,_tAll=0,_tHidden=0;
  // v20260820t(ドクター): 判定メモ層(ページ側フラグ=開拓候補/公式放棄地/紫151/御所218の判定)は名前/可視に関係なく常に数える。
  //   手描き敷地境界のOK(手描き=OK)も参照層でも数える。→「判定したのに加算されない」を解消。
  // v20260821d(ドクター): カウンターは単一の正しい定義に固定=「あなたが確定した(userJudged)OK/NGの重複しない実数」。
  //   feature_idで重複除去(重なった筆で二重に増えない)・自動OK除外・納品除外。手描き敷地境界=OK。表示可視に依存しない=数字が勝手に変わらない。
  var _okSet={},_ngSet={},_bOkSet={};
  state.layers.forEach(function(l){
    if(l.archived)return;
    l.items.forEach(function(it){
      if(_isDeliveredItem(l,it))return;                       // 納品除外
      // v20260821u(ドクター): 手描き境界を iid で重複除去。同じ境界が複数レイヤー/DB再読込で二重計上されるのを是正(連打・再読込で増えない)。
      if(it.type==='boundary'){ if(it.status==='ok'){ var bk=it.iid||('b:'+(it.lat)+','+(it.lng)); _bOkSet[bk]=1; } return; }
      if(!_isUserJudged(it))return;                            // あなたが確定した分だけ(自動OKは数えない)
      var key=it.feature_id||it.iid;
      if(it.status==='ok')_okSet[key]=1; else if(it.status==='ng')_ngSet[key]=1;
    });
  });
  _tOk=Object.keys(_okSet).length+Object.keys(_bOkSet).length; _tNg=Object.keys(_ngSet).length;
  h+='<div class="gacho-total">あなたが確定した判定　<span style="color:#3fb950">OK'+_tOk+'</span>・<span style="color:#f85149">NG'+_tNg+'</span><span style="color:#8b949e;font-weight:400"> （確定した実数・自動OK/未確認は除く・重複なし）</span></div>';
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
  Object.keys(_tree).sort().forEach(function(cli){
    var ck='C:'+cli; var co=_gopen(ck);
    var call=[];Object.keys(_tree[cli]).forEach(function(p){Object.keys(_tree[cli][p]).forEach(function(rr){call=call.concat(_tree[cli][p][rr]);});});
    h+='<div class="gacho-grp" data-grp="'+esc(ck)+'" style="cursor:pointer;margin-top:8px;padding:5px 6px;background:rgba(88,166,255,.10);border:1px solid #2a3742;border-radius:6px;font-weight:800"><span style="width:12px;display:inline-block">'+(co?'▾':'▸')+'</span>🏢 '+esc(cli)+'<span style="float:right;font-weight:400;color:#8b949e;font-size:11px">'+_lcnt(call)+'</span></div>';
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
  if(_arch.length){
    var ako=_gopen('ARCH');
    h+='<div class="gacho-grp" data-grp="ARCH" style="cursor:pointer;margin-top:10px;padding:5px 6px;background:rgba(139,148,158,.08);border:1px dashed #3a4650;border-radius:6px;color:#8b949e;font-weight:700"><span style="width:12px;display:inline-block">'+(ako?'▾':'▸')+'</span>🗄 納品済（退避済 '+_arch.length+'画層）<span style="float:right;font-size:11px">'+_lcnt(_arch)+'</span></div>';
    if(ako)_arch.forEach(function(l){h+=_row(l)+'<div style="margin-left:26px;margin-bottom:4px"><button class="gacho-btn gacho-restore" data-restore="'+l.id+'" style="font-size:11px">↩ 作業台へ戻す</button></div>';});
  }
  h+='<div class="gacho-actions">';
  if(al){
    h+='<div class="gacho-active-note">取込先: <b style="color:'+al.color+'">'+esc(al.name)+'</b></div>';
    h+='<button id="gachoPickBtn" class="gacho-btn wide'+(_pickMode?' on':'')+'">🖱 クリックで1件ずつ取込'+(_pickMode?'（ESCで終了）':'')+'</button>';
    h+='<button id="gachoAddPt" class="gacho-btn wide'+(_addMode?' on':'')+'" style="background:rgba(255,20,147,.16);border-color:#ff1493">📍 地図クリックで手動ピック記録（案件候補）'+(_addMode?'（クリック→確認→保存／ESCで終了）':'')+'</button>';
    h+='<button id="gachoCapView" class="gacho-btn wide">＋ 表示中の範囲を取り込む（全部）</button>';
    h+='<div class="gacho-cond">面積 ≥ <input id="gachoMinArea" type="number" min="0" step="50" value="'+(state.lastMinArea!=null?state.lastMinArea:800)+'"> ㎡ <button id="gachoCapCond" class="gacho-btn">条件で取込</button></div>';
    h+='<button id="gachoRectBtn" class="gacho-btn wide'+(_rectMode?' on':'')+'">▭ 範囲ドラッグで取り込む'+(_rectMode?'（ESCで終了）':'')+'</button>';
    h+='<button id="gachoDrawBtn" class="gacho-btn wide'+(_drawMode?' on':'')+'">✏️ 敷地境界を描く（面積）'+(_drawMode?'：クリックで頂点／Wクリック確定':'')+'</button>';
    if(_drawMode){h+='<div class="gacho-master"><button id="gachoDrawUndo" class="gacho-btn">↩ 1つ戻す</button><button id="gachoDrawDone" class="gacho-btn" style="background:rgba(63,185,80,.2);border-color:#3fb950">✓ 確定</button></div>';}
    h+='<div class="gacho-exp">書き出し <button id="gachoExpKml" class="gacho-btn" title="Google Earthで開ける・クライアント納品用">KML</button><button id="gachoExpGeo" class="gacho-btn" title="GIS標準・AI連携用">GeoJSON</button><button id="gachoExpCopy" class="gacho-btn" title="コピーして貼付でAIへ">📋</button></div>';
  }else{h+='<div class="gacho-active-note">取込先の画層を選択/作成してください</div>';}
  h+='<button id="gachoAddBoundary" class="gacho-btn wide" style="background:rgba(236,72,153,.18);border-color:#ec4899">✏️＋ 敷地境界の画層を作る</button>';
  if(typeof window.__sepDeliveredPicks==='function'&&state.layers.some(function(x){return x.name==='手動ピック（判定）'&&!x.archived&&(x.items||[]).length;})){h+='<button id="gachoSepDeliv" class="gacho-btn wide" style="background:rgba(16,185,129,.16);border-color:#10b981">📦 納品済の手動ピックを退避（今調査中だけ残す）</button>';}
  h+='<button id="gachoLoadSuntrust" class="gacho-btn wide" style="background:rgba(245,158,11,.18);border-color:#f59e0b">📦 SUNトラスト納品を画層に読込（確定397）</button>';
  h+='<button id="gachoLoadGose" class="gacho-btn wide" style="background:rgba(245,158,11,.14);border-color:#f59e0b">☀ 御所218を画層に読込（全OK）</button>';
  h+='<button id="gachoAdd" class="gacho-btn wide add">＋ 新規画層</button>';
  h+='</div>';
  h+='<div class="gacho-hint">既存の筆・フラグを条件別に画層へまとめ、切替えて分析。0画層＝今まで全部。取込は割当のみ・元データは無傷。</div>';
  h+='</div>';
  box.innerHTML=h;bindPanel();
}

function bindPanel(){
  var q=function(s){return document.querySelector(s);};var all=function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};
  var mn=q('#gachoMin');if(mn)mn.onclick=function(){var b=q('#gachoBody');if(b)b.style.display=(b.style.display==='none'?'':'none');};
  var sa=q('#gachoShowAll');if(sa)sa.onclick=showAll;
  var ha=q('#gachoHideAll');if(ha)ha.onclick=hideAll;
  var alb=q('#gachoAreaLbl');if(alb)alb.onclick=function(){state.showArea=!state.showArea;saveState();updateAreaLabels();renderPanel();};
  var rd=q('#gachoRestoreDeliv');if(rd)rd.onclick=function(){restoreDelivered();};
  var ms=q('#gachoMigSnap');if(ms)ms.onclick=function(){snapshotMigration();};
  var mr=q('#gachoMigRestore');if(mr)mr.onclick=function(){restoreMigrationSnapshot();};
  var rff=q('#gachoRestoreFile');if(rff)rff.onclick=function(){restoreFromFile();};
  var d2m=q('#gachoD2Migrate');if(d2m)d2m.onclick=function(){migrateDelivery2();};
  var d2d=q('#gachoD2Del');if(d2d)d2d.onclick=function(){deleteEmptiedD2();};
  var d2u=q('#gachoD2Undo');if(d2u)d2u.onclick=function(){undoDelivery2();};
  var d2r=q('#gachoD2Rebuild');if(d2r)d2r.onclick=function(){rebuildDelivery2();};
  var d2c=q('#gachoD2Complete');if(d2c)d2c.onclick=function(){completeDelivery2FromDb();};
  var d2mn=q('#gachoD2Manual');if(d2mn)d2mn.onclick=function(){migrateManualPicks();};
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
  all('.gacho-del[data-del]').forEach(function(el){el.onclick=function(){var l=byId(el.getAttribute('data-del'));if(!l)return;if(confirm('画層「'+l.name+'」を削除しますか？（割当のみ削除・元データは無傷）')){state.layers=state.layers.filter(function(x){return x.id!==l.id;});if(state.solo===l.id)state.solo=null;saveState();render();}};});
  var cv=q('#gachoCapView');if(cv)cv.onclick=function(){captureViewport();};
  var cc=q('#gachoCapCond');if(cc)cc.onclick=function(){var el=q('#gachoMinArea');var v=el?Number(el.value):800;if(isNaN(v))v=0;state.lastMinArea=v;saveState();captureViewport({minArea:v});};
  var pk=q('#gachoPickBtn');if(pk)pk.onclick=togglePick;
  var ap=q('#gachoAddPt');if(ap)ap.onclick=toggleAdd;
  var db=q('#gachoDrawBtn');if(db)db.onclick=toggleDraw;
  var du=q('#gachoDrawUndo');if(du)du.onclick=drawUndo;
  var dn=q('#gachoDrawDone');if(dn)dn.onclick=function(){drawFinish();};
  var eg=q('#gachoExpGeo');if(eg)eg.onclick=function(){exportLayer('geojson');};
  var ek=q('#gachoExpKml');if(ek)ek.onclick=function(){exportLayer('kml');};
  var ep=q('#gachoExpCopy');if(ep)ep.onclick=function(){exportLayer('copy');};
  var rb=q('#gachoRectBtn');if(rb)rb.onclick=toggleRect;
  var ab=q('#gachoAddBoundary');if(ab)ab.onclick=addBoundaryLayer;
  var sd=q('#gachoSepDeliv');if(sd)sd.onclick=function(){if(confirm('手動ピック（判定）から、SUNトラスト納品済に一致する分を「手動ピック（納品済）」へ退避します。\n作業台には今調査中の分だけが残ります（データは消えません・アーカイブに畳まれます）。\n実行しますか？'))window.__sepDeliveredPicks();};
  var ls=q('#gachoLoadSuntrust');if(ls)ls.onclick=loadSuntrust;
  var lg=q('#gachoLoadGose');if(lg)lg.onclick=loadGose;
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
function _boundaryMemo(it){ return JSON.stringify({iid:it.iid,latlngs:it.latlngs,area:it.area,address:it.address||'',status:(it.status==='ng'?'ng':'ok'),lat:it.lat,lng:it.lng}); }
/* v20260821t(ドクター「やれ」): 手描き線の保存結果を必ず画面表示。silent failureを廃止。
   ★supabase-jsはDBエラーを例外でなく res.error に入れる→第2コールバックでは捕まらない。第1コールバックで res.error を判定する。 */
function _sbToast(msg,type){ try{ if(typeof window.showToast==='function'){window.showToast(msg,type||'success');return;} }catch(_){ } try{ toast(msg); }catch(_){ } }
function _saveBoundaryToDb(it){ if(!it||it.type!=='boundary'||!it.latlngs)return; var d=_gDb();
  if(!d){ _sbToast('⚠ DB未接続＝この手描き線は保存できていません。リロードで再接続してから、もう一度確定してください','error'); return; }
  try{ d.from('ai_ok_labels').insert({source:'handdraw_boundary',member_fids:[it.iid],lat:(it.lat!=null?Number(it.lat):null),lng:(it.lng!=null?Number(it.lng):null),memo:_boundaryMemo(it)}).then(
      function(res){ if(res&&res.error){ _sbToast('⚠ 手描き線のDB保存 失敗：'+((res.error&&res.error.message)||'')+' ／ もう一度ダブルクリックで確定してください','error'); } else { _sbToast('✓ 手描き線をDBに保存しました（約'+Math.round(it.area||0).toLocaleString()+'㎡）','success'); } },
      function(err){ _sbToast('⚠ 手描き線のDB保存 失敗（通信）：'+((err&&err.message)||'')+' ／ もう一度確定してください','error'); }
    ); }catch(e){ _sbToast('⚠ 手描き線のDB保存 失敗（例外）：'+((e&&e.message)||'')+' ／ もう一度確定してください','error'); } }
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
    rows.forEach(function(x){try{var m=JSON.parse(x.memo||'{}'); if(!m.iid||!m.latlngs||m.latlngs.length<3||have[m.iid])return;
      if(!l){ l=state.layers.filter(function(y){return y.name==='敷地境界（実測）';})[0]; if(!l){l={id:uid(),name:'敷地境界（実測）',color:'#f59e0b',visible:true,active:false,items:[]};state.layers.push(l);} }
      l.archived=false; l.visible=true;
      l.items.push({iid:m.iid,type:'boundary',latlngs:m.latlngs,area:m.area,lat:(m.lat!=null?m.lat:(m.latlngs[0]?m.latlngs[0][0]:null)),lng:(m.lng!=null?m.lng:(m.latlngs[0]?m.latlngs[0][1]:null)),address:m.address||'敷地境界',status:(m.status==='ng'?'ng':'ok'),userJudged:true,src:'handdraw'});
      have[m.iid]=1; added++;
    }catch(_){}});
    if(added){saveState();render();try{console.log('[DB復元] 手描き境界 '+added+'件');}catch(_){}}
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
function _persistJudgment(fid,lat,lng,status){
  var d=_gDb(); if(!d||!fid)return;
  try{
    if(status==='ok'){ _gDbOk[fid]=1; delete _gDbNg[fid];
      d.from('ai_ok_labels').insert({source:'gacho_ok',member_fids:[fid],lat:(lat!=null?Number(lat):null),lng:(lng!=null?Number(lng):null),memo:'gacho手動OK'}).then(function(){},function(){});
      d.from('farmland_ng_list').delete().eq('feature_id',fid).like('ng_reason','gacho_ng%').then(function(){},function(){});
    } else if(status==='ng'){ _gDbNg[fid]=1; delete _gDbOk[fid];
      d.from('farmland_ng_list').upsert({feature_id:fid,lat:(lat!=null?Number(lat):null),lng:(lng!=null?Number(lng):null),ng_reason:'gacho_ng'},{onConflict:'feature_id'}).then(function(){},function(){});
      d.from('ai_ok_labels').delete().eq('source','gacho_ok').contains('member_fids',[fid]).then(function(){},function(){});
    } else { delete _gDbOk[fid]; delete _gDbNg[fid];
      d.from('ai_ok_labels').delete().eq('source','gacho_ok').contains('member_fids',[fid]).then(function(){},function(){});
      d.from('farmland_ng_list').delete().eq('feature_id',fid).like('ng_reason','gacho_ng%').then(function(){},function(){});
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
function _defScore(it){return {c1:'o',c2:'o',c3:'o',c4:'o',c5:'o',c6:((it.area!=null&&it.area<800)?'x':'o'),c7:'t',c8:'o'};}
function _score(it){if(!it.score)it.score=_defScore(it);return it.score;}
function _hasX(s){for(var k in s){if(s[k]==='x')return true;}return false;}
function _scoreCodes(it,s){var codes=[];for(var i=0;i<GCRIT.length;i++){if(s[GCRIT[i].k]==='x')codes.push(GCRIT[i].k);}var ex=(it.ngsub&&it.ngsub.length)?('['+it.ngsub.join('/')+']'):'';return codes.join(',')+(ex?(' '+ex):'');}
function _okPattern(s){return GCRIT.map(function(c){return c.k+':'+(s[c.k]||'t');}).join(',');}
function _persistJudgmentScored(it,s){
  var d=_gDb();if(!d||!it||!it.feature_id)return;var fid=it.feature_id,lat=it.lat,lng=it.lng;var ng=_hasX(s);
  try{
    if(ng){ _gDbNg[fid]=1; delete _gDbOk[fid];
      d.from('farmland_ng_list').upsert({feature_id:fid,lat:(lat!=null?Number(lat):null),lng:(lng!=null?Number(lng):null),ng_reason:('gacho_ng|'+_scoreCodes(it,s))},{onConflict:'feature_id'}).then(function(){},function(){});
      d.from('ai_ok_labels').delete().eq('source','gacho_ok').contains('member_fids',[fid]).then(function(){},function(){});
    } else { _gDbOk[fid]=1; delete _gDbNg[fid];
      d.from('ai_ok_labels').insert({source:'gacho_ok',member_fids:[fid],lat:(lat!=null?Number(lat):null),lng:(lng!=null?Number(lng):null),memo:('gacho手動OK|'+_okPattern(s))}).then(function(){},function(){});
      d.from('farmland_ng_list').delete().eq('feature_id',fid).like('ng_reason','gacho_ng%').then(function(){},function(){});
    }
  }catch(e){}
}
function _whyHtml(it){
  var p=[];
  if(it.area!=null)p.push('面積 '+Math.round(it.area).toLocaleString()+'㎡'+(it.area>=800?'(≥800)':'(<800!)'));
  if(it.toshi)p.push('都計 '+esc(String(it.toshi)));
  if(it.level)p.push('AI '+esc(String(it.level)));
  if(it.reject!=null)p.push('耕作放棄の可能性(AI衛星判定) '+it.reject);
  p.push('接道/連系/日射/農振外/ハザードCLEAR=各ゲート通過');
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
  var drawBtn='<button class="gsc-draw" onclick="window.__gacho.drawArea(\''+l.id+'\',\''+iid+'\')" title="小さい土地でも隣接を含め敷地境界を手描き→面積を再計算(⑥面積に反映)">✏️ 敷地境界を手描き→面積を増やす</button>';
  return _gmImgHtml(it)+'<div class="gsc">'+rows+vd+drawBtn+'<button class="gsc-fix" onclick="window.__gacho.applyScore(\''+l.id+'\',\''+iid+'\')">この判定を確定</button></div>';
}
/* ===== v20260820m(ドクター): 判定済み(OK/NG/閲覧)フラグの見た目を変える=一度見たか一目で判る =====
   ページ側マーカー(開拓候補/公式放棄地/紫151/御所218)はfeature_idでonReview登録→判定時とマーカー再生成時に減光＋色枠。
   OK=緑枠/NG=赤枠/閲覧のみ=灰破線、いずれも減光。未判定は元の明るい色のまま。 */
var _reviewMarks={}; // fid -> Leafletマーカー
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
  removeItem:function(lid,itemIid){var m=getMap();if(m)m.closePopup();var l=byId(lid);if(!l)return;l.items=l.items.filter(function(it){return it.iid!==itemIid;});saveState();setTimeout(function(){render();},0);},
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
    _persistJudgment(it.feature_id,it.lat,it.lng,it.status);_restyleMark(it.feature_id,it.status||'viewed');
  }});saveState();setTimeout(function(){render();},0);},
  setCrit:function(lid,iid,ck,val,btn){var l=byId(lid);if(!l)return;var itr=null;l.items.forEach(function(it){if(it.iid===iid){itr=it;var s=_score(it);s[ck]=val;it.viewed=true;if(ck==='c7'&&val!=='x')it.ngsub=[];}});saveState();
    try{var row=btn.parentNode;row.querySelectorAll('.gsc-b').forEach(function(bb){bb.style.background='';bb.style.color='';bb.style.fontWeight='';});var col=(val==='o'?'#3fb950':(val==='x'?'#f85149':'#eab308'));btn.style.background=col;btn.style.color='#0d1117';btn.style.fontWeight='700';
      if(ck==='c7'){var sub=document.getElementById('gsub_'+iid);if(sub)sub.style.display=(val==='x'?'':'none');}
      if(itr){var vd=document.getElementById('gscvd_'+iid);if(vd)vd.innerHTML=(_hasX(_score(itr))?'<b style="color:#f85149">✖あり → 除外(NG)</b>':'<b style="color:#3fb950">✖なし → OK可</b>');}
    }catch(_){}
    if(itr&&itr.feature_id&&itr.status!=='ok'&&itr.status!=='ng')_restyleMark(itr.feature_id,'viewed'); // v20260820m: 触った時点で「閲覧済み」表示(確定前でも一度見た印)
  },
  setSub:function(lid,iid,t,btn){var l=byId(lid);if(!l)return;l.items.forEach(function(it){if(it.iid===iid){it.ngsub=it.ngsub||[];var i=it.ngsub.indexOf(t);if(i>=0)it.ngsub.splice(i,1);else it.ngsub.push(t);}});saveState();try{btn.classList.toggle('on');}catch(_){}},
  applyScore:function(lid,iid){var m=getMap();var l=byId(lid);if(!l)return;l.items.forEach(function(it){if(it.iid===iid){var s=_score(it);it.status=(_hasX(s)?'ng':'ok');it.viewed=true;it.userJudged=true;if(_reviewFilter)_reviewTouched[it.feature_id||it.iid]=1;_persistJudgmentScored(it,s);_restyleMark(it.feature_id,it.status);}});saveState();if(m)m.closePopup();setTimeout(function(){render();},0);},
  drawOn:function(lid){var l=byId(lid);if(!l)return;var m=getMap();if(m)m.closePopup();state.layers.forEach(function(x){x.active=(x.id===lid);});saveState();render();if(!_drawMode)toggleDraw();},
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
          toshi:meta.toshi||'',level:meta.level||'',reject:(meta.reject!=null?meta.reject:null)};
      fl.items.push(it);created=true;saveState();
    }
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
    saveState();setTimeout(function(){render();},0);
    toast('「'+fl.name+'」'+(found.status==='ok'?'✓OK':(found.status==='ng'?'🚫NG':'判定解除'))+' ／ この画層 計'+fl.items.length+'件（OK'+fl.items.filter(function(x){return x.status==='ok';}).length+'・NG'+fl.items.filter(function(x){return x.status==='ng';}).length+'）');
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
    var added=0;
    items.forEach(function(c){
      if(c.lat==null||c.lng==null)return;
      var fid=pfx+c.no;
      if(ex[fid])return;
      l.items.push({iid:iid(),feature_id:fid,lat:Number(c.lat),lng:Number(c.lng),address:(c.addr||c.city||''),area:(c.area!=null?Number(c.area):null),chiban:c.chiban,src:'aiKI',status:null,level:c.level,toshi:c.toshi,reject:c.reject});
      ex[fid]=1;added++;
    });
    // ★v20260818k: DB保存済みの判定(OK/NG)を、この画層の筆に復元適用(消えたOKを二度と消さない)。
    l.items.forEach(function(it){ if(it.feature_id){ if(_gDbOk[it.feature_id])it.status='ok'; else if(_gDbNg[it.feature_id])it.status='ng'; } });
    saveState();setTimeout(function(){render();},0);
    var msg=[];if(added)msg.push('新規'+added+'件');if(removed)msg.push('ハザード除去で'+removed+'件を削除');
    if(msg.length)toast('画層「'+layerName+'」: '+msg.join(' ／ ')+'（クリーン反映）');
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
function boot(){var m=getMap();if(!m||typeof L==='undefined'){return setTimeout(boot,250);}_reArchiveFromSnapOnce();_upgradeHandDrawnOk();injectStyle();buildPanel();ensurePane(m);render();applyBase0();try{loadDbJudgments();setTimeout(loadDbJudgments,2500);}catch(_){}m.on('zoomend',updateAreaLabels);updateAreaLabels();
  try{loadBoundariesFromDb();setTimeout(loadBoundariesFromDb,2600);}catch(_){} // v20260821q: DBから手描き境界を復元(消えない)
  try{m.on('movestart zoomstart dragstart popupopen click',function(){_gmHideFloat();});m.getContainer().addEventListener('mouseleave',function(){_gmHideFloat();});}catch(_){} // v20260821i: ホバー衛星画像の取り残し(黒箱)対策
  document.addEventListener('keydown',function(e){var tag=((e.target&&e.target.tagName)||'').toLowerCase();if(tag==='input'||tag==='textarea')return;if(e.key==='Escape'){if(_rectMode)cleanupRect();if(_drawMode)cancelDraw();if(_pickMode)cleanupPick();if(_addMode)cleanupAdd();}if(_drawMode&&(e.key==='Backspace'||((e.ctrlKey||e.metaKey)&&(e.key==='z'||e.key==='Z')))){e.preventDefault();drawUndo();}});}
boot();
})();

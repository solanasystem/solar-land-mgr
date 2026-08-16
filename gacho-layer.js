/* 画層(レイヤー)システム。本番トラッカーのインラインIIFEを外部化(内容は同一)。分析ページ等で共有。 */
(function(){
'use strict';
var LS_KEY='trackerGacho_v1';
var PALETTE=['#f59e0b','#ef4444','#3b82f6','#22c55e','#a855f7','#ec4899','#14b8a6','#eab308','#f97316','#06b6d4'];
var _iidc=0;
var state=loadState();
var _pane=null,_groups={},_rectMode=false,_rectStart=null,_rectLayer=null;
var _drawMode=false,_drawPts=[],_drawTemp=null,_drawMarkers=[];
var _pickMode=false;
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
function toggleDraw(){
  var m=getMap();if(!m)return;
  if(!activeLayer()){toast('先に取込先の画層を選ぶ/作ってください');return;}
  _drawMode=!_drawMode;
  if(_drawMode){if(_rectMode)cleanupRect();if(_pickMode)cleanupPick();if(_addMode)cleanupAdd();m.closePopup();if(_pane)_pane.style.pointerEvents='none';try{m.doubleClickZoom.disable();}catch(_){}m.getContainer().style.cursor='crosshair';m.on('click',drawClick);m.on('dblclick',drawFinish);toast('頂点をクリックで追加→ダブルクリックで確定（ESCで取消）');}
  else{cancelDraw();}
  renderPanel();
}
function drawClick(e){var m=getMap();try{m.closePopup();}catch(_){}_drawPts.push([e.latlng.lat,e.latlng.lng]);var mk=L.circleMarker(e.latlng,{pane:'gachoPane',radius:4,color:'#fff',weight:1,fillColor:'#f59e0b',fillOpacity:1}).addTo(m);_drawMarkers.push(mk);redrawTemp();}
function redrawTemp(){var m=getMap();if(_drawTemp){try{m.removeLayer(_drawTemp);}catch(_){}_drawTemp=null;}if(_drawPts.length>=2){var ring=_drawPts.slice();if(_drawPts.length>=3)ring=ring.concat([_drawPts[0]]);_drawTemp=L.polyline(ring,{pane:'gachoPane',color:'#f59e0b',weight:2,dashArray:'5,5'}).addTo(m);}}
function drawUndo(){var m=getMap();if(!_drawPts.length){toast('戻す頂点がありません');return;}_drawPts.pop();var mk=_drawMarkers.pop();if(mk&&m){try{m.removeLayer(mk);}catch(_){}}redrawTemp();toast('1つ戻しました（残り頂点'+_drawPts.length+'）');}
function drawFinish(e){if(e){try{L.DomEvent.stop(e);}catch(_){}}if(_drawPts.length<3){toast('3点以上必要です');return;}var l=activeLayer();if(!l){cancelDraw();return;}var latlngs=_drawPts.slice();var area=polyArea(latlngs);var c=centroid(latlngs);l.items.push({iid:iid(),type:'boundary',latlngs:latlngs,area:area,lat:c[0],lng:c[1],address:'敷地境界'});saveState();cancelDraw();render();toast('敷地境界を「'+l.name+'」に追加（約'+Math.round(area).toLocaleString()+'㎡）');}
function cancelDraw(){var m=getMap();_drawMarkers.forEach(function(mk){try{if(m)m.removeLayer(mk);}catch(_){}});_drawMarkers=[];if(_drawTemp){try{if(m)m.removeLayer(_drawTemp);}catch(_){}_drawTemp=null;}_drawPts=[];if(_pane)_pane.style.pointerEvents='';if(m){m.off('click',drawClick);m.off('dblclick',drawFinish);try{m.doubleClickZoom.enable();}catch(_){}m.getContainer().style.cursor='';}_drawMode=false;renderPanel();}

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

function showAll(){state.base0Visible=true;state.solo=null;state.layers.forEach(function(l){l.visible=true;});saveState();render();}
function hideAll(){state.base0Visible=false;state.layers.forEach(function(l){l.visible=false;});saveState();render();}
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

/* 0画層(既存すべて)の表示切替: base地図タイルと画層paneを除く全paneをまとめて隠す/戻す */
function applyBase0(){var m=getMap();if(!m)return;var panes=m.getPanes();Object.keys(panes).forEach(function(name){if(name==='mapPane'||name==='tilePane'||name==='gachoPane'||name==='popupPane')return;try{panes[name].style.display=state.base0Visible?'':'none';}catch(_){}});}
/* 面積ラベル: ズームを引いた時(z<15)や手動OFF時はまとめて非表示にして地図を邪魔しない */
function updateAreaLabels(){var m=getMap();if(!m)return;var hide=(!state.showArea)||(m.getZoom()<15);try{m.getContainer().classList.toggle('gacho-noarea',hide);}catch(_){}}

function renderLayerGroups(){
  var m=getMap();if(!m)return;ensurePane(m);
  Object.keys(_groups).forEach(function(id){try{m.removeLayer(_groups[id]);}catch(_){}delete _groups[id];});
  state.layers.forEach(function(l){
    if(l.archived)return; // 退避済は地図に描かない
    var show=l.visible&&(!state.solo||state.solo===l.id);if(!show)return;
    var g=L.layerGroup([],{pane:'gachoPane'});
    l.items.forEach(function(it){
      if(state.hideReviewed&&it.viewed)return;
      if(!state.showNg && it.status==='ng')return; // NG(除外)=削除＝地図から消す（既定）。「除外も表示」で戻せる
      var vd=!!it.viewed;
      var under=(it.area!=null&&it.area<800);
      var areaTxt=(it.area!=null)?('面積 <b style="font-size:14px;color:'+(under?'#f85149':'#3fb950')+'">'+Math.round(it.area).toLocaleString()+' ㎡</b>'+(under?'<br><span style="color:#f85149">⚠ 800㎡未満：隣接を含め敷地境界を手描きで作成</span>':'')):'<span style="color:#8b949e">面積 不明</span>';
      var acts='<div style="margin-top:8px"><button onclick="window.__gacho.setStatus(\''+l.id+'\',\''+(it.iid||'')+'\',\'ok\')" style="background:rgba(63,185,80,.25);border:1px solid #3fb950;color:#e6edf3;border-radius:4px;padding:3px 7px">✓ OK</button> <button onclick="window.__gacho.setStatus(\''+l.id+'\',\''+(it.iid||'')+'\',\'ng\')" style="background:rgba(248,81,73,.25);border:1px solid #f85149;color:#e6edf3;border-radius:4px;padding:3px 7px">🚫 NG(除外)</button></div><div style="margin-top:4px"><button onclick="window.__gacho.drawOn(\''+l.id+'\')">✏️ 敷地境界を描く</button> <button onclick="window.__gacho.moveItem(\''+l.id+'\',\''+(it.iid||'')+'\')">⇄ 別画層へ</button> <button onclick="window.__gacho.removeItem(\''+l.id+'\',\''+(it.iid||'')+'\')" title="この画層から筆を取り除く（元データは無傷）">🗑 外す</button></div>';
      var seen='<span style="color:#9aa4ae">'+(vd?'✓ 見た':'')+'</span>';
      var stat=it.status==='ok'?' <b style="color:#3fb950">✓OK</b>':(it.status==='ng'?' <b style="color:#f85149">🚫NG(除外)</b>':'');
      var gmap='<div style="margin-top:6px"><a href="https://www.google.com/maps/search/?api=1&query='+it.lat+','+it.lng+'" target="_blank" rel="noopener" style="color:#58a6ff">🌐 Googleマップ</a> ｜ <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+it.lat+','+it.lng+'" target="_blank" rel="noopener" style="color:#58a6ff">🚶 ストリートビュー</a></div>';
      if(it.type==='boundary'&&it.latlngs&&it.latlngs.length>=3){
        var bacts='<div style="margin-top:8px"><button onclick="window.__gacho.setStatus(\''+l.id+'\',\''+(it.iid||'')+'\',\'ok\')" style="background:rgba(63,185,80,.25);border:1px solid #3fb950;color:#e6edf3;border-radius:4px;padding:3px 7px">✓ OK</button> <button onclick="window.__gacho.setStatus(\''+l.id+'\',\''+(it.iid||'')+'\',\'ng\')" style="background:rgba(248,81,73,.25);border:1px solid #f85149;color:#e6edf3;border-radius:4px;padding:3px 7px">🚫 NG(除外)</button></div><div style="margin-top:4px"><button onclick="window.__gacho.redraw(\''+l.id+'\',\''+(it.iid||'')+'\')">🗑 描き直す</button> <button onclick="window.__gacho.moveItem(\''+l.id+'\',\''+(it.iid||'')+'\')">⇄ 別画層へ</button> <button onclick="window.__gacho.removeItem(\''+l.id+'\',\''+(it.iid||'')+'\')">🗑 削除</button></div>';
        var pg=L.polygon(it.latlngs,it.status==='ng'?{pane:'gachoPane',color:'#6e7681',weight:1,fillColor:'#6e7681',fillOpacity:0.1,dashArray:'4,4'}:(it.status==='ok'?{pane:'gachoPane',color:'#3fb950',weight:3,fillColor:l.color,fillOpacity:0.3}:{pane:'gachoPane',color:l.color,weight:2,fillColor:l.color,fillOpacity:vd?0.08:0.25,dashArray:vd?'4,4':null}));
        pg.bindPopup('<div style="font-size:12px;min-width:160px"><b style="color:'+l.color+'">'+esc(l.name)+'</b> '+seen+stat+'<br>敷地境界<br>'+areaTxt+gmap+bacts+'</div>');
        pg.bindTooltip(Math.round(it.area||0).toLocaleString()+'㎡',{permanent:true,direction:'center',className:'gacho-area-lbl',pane:'gachoPane'});
        pg.on('popupopen',function(){if(!it.viewed){it.viewed=true;try{pg.setStyle({fillOpacity:0.08,dashArray:'4,4'});}catch(_){}saveState();renderPanel();}});
        g.addLayer(pg);
      }else{
        var _sty=it.status==='ng'?{radius:5,color:'#6e7681',weight:1,fillColor:'#6e7681',fillOpacity:0.3}:(it.status==='ok'?{radius:7,color:'#3fb950',weight:3,fillColor:l.color,fillOpacity:0.95}:{radius:vd?5:7,color:vd?'#9aa4ae':'#fff',weight:vd?1:2,fillColor:l.color,fillOpacity:vd?0.35:0.95});
        var mk=L.circleMarker([it.lat,it.lng],Object.assign({pane:'gachoPane'},_sty));
        mk.bindPopup('<div style="font-size:12px;min-width:140px"><b style="color:'+l.color+'">'+esc(l.name)+'</b> '+seen+stat+'<br>'+esc(it.address||(Number(it.lat).toFixed(5)+', '+Number(it.lng).toFixed(5)))+(it.chiban?'<br>地番 '+esc(it.chiban):'')+'<br>'+areaTxt+(it.deliver?'<br>区分 '+esc(it.deliver):'')+gmap+acts+'</div>');
        mk.on('popupopen',function(){if(!it.viewed){it.viewed=true;try{mk.setRadius(5);mk.setStyle({color:'#9aa4ae',weight:1,fillOpacity:0.35});}catch(_){}saveState();renderPanel();}});
        g.addLayer(mk);
      }
    });
    g.addTo(m);_groups[l.id]=g;
  });
  applyBase0();updateAreaLabels();
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

function renderPanel(){
  window.__gachoMapMode=!!(_drawMode||_rectMode||_pickMode||_addMode); // v20260812j: 地番ポップアップ/手動ピック確認モーダルの抑止フラグ(描画等の邪魔をしない)
  var box=document.getElementById('gachoPanel');if(!box)return;var al=activeLayer();var h='';
  h+='<div class="gacho-head"><span>🗂 画層</span><button class="gacho-min" id="gachoMin" title="開閉">—</button></div>';
  h+='<div class="gacho-body" id="gachoBody">';
  h+='<div class="gacho-master"><button id="gachoShowAll" class="gacho-btn">👁 全て表示</button><button id="gachoHideAll" class="gacho-btn">🚫 全て隠す</button></div>';
  h+='<div class="gacho-master"><button id="gachoOnlyUnrev" class="gacho-btn'+(state.hideReviewed?' on':'')+'" title="見た筆を隠して未確認だけ表示">👀 未確認のみ表示'+(state.hideReviewed?'（ON）':'')+'</button><button id="gachoAreaLbl" class="gacho-btn'+(state.showArea?' on':'')+'" title="敷地境界の面積ラベル表示（ズーム15以上で表示）">㎡ 面積ラベル</button></div>';
  h+='<div class="gacho-master"><button id="gachoBulkOk" class="gacho-btn" title="既に開いて見た(未判定)を全画層でまとめてOKに（開き直し不要）">👁→✓ 見た分をOKに一括</button><button id="gachoShowNg" class="gacho-btn'+(state.showNg?' on':'')+'" title="NG(除外)にした筆を地図に表示するか。既定OFF＝除外は地図から消える">'+(state.showNg?'🚫 除外も表示（ON）':'🚫 除外は非表示')+'</button></div>';
  var _tOk=0,_tNg=0,_tV=0,_tAll=0;
  state.layers.forEach(function(l){if(l.archived)return;l.items.forEach(function(it){_tAll++;if(it.status==='ok')_tOk++;else if(it.status==='ng')_tNg++;if(it.viewed)_tV++;});});
  h+='<div class="gacho-total">全画層合計　👁'+_tV+' ／ <span style="color:#3fb950">OK'+_tOk+'</span>・<span style="color:#f85149">NG'+_tNg+'</span> ／ 計'+_tAll+'</div>';
  h+='<div class="gacho-row gacho-base"><span class="gacho-eye" data-b0="1">'+(state.base0Visible?'👁':'🚫')+'</span><span class="gacho-name">0画層｜既存すべて</span></div>';
  // ===== ①クライアント→②納品時期→③行政区域 の階層表示（作業台を見やすく） =====
  if(!state.grpOpen)state.grpOpen={};
  var _gopen=function(k){return (k in state.grpOpen)?!!state.grpOpen[k]:_grpDefOpen(k);};
  var _lcnt=function(ls){var o=0,g=0,v=0,a=0;ls.forEach(function(l){l.items.forEach(function(it){a++;if(it.status==='ok')o++;else if(it.status==='ng')g++;if(it.viewed)v++;});});return '👁'+v+' ／ <span style="color:#3fb950">OK'+o+'</span>・<span style="color:#f85149">NG'+g+'</span> ／ 計'+a;};
  var _row=function(l){
    var okc=l.items.filter(function(it){return it.status==='ok';}).length;
    var ngc=l.items.filter(function(it){return it.status==='ng';}).length;
    var vc=l.items.filter(function(it){return it.viewed;}).length;
    var cnt=l.items.length?('👁見た'+vc+' ／ <span style="color:#3fb950">OK'+okc+'</span>・<span style="color:#f85149">NG'+ngc+'</span> ／ 計'+l.items.length):'0';
    var r='<div class="gacho-row'+(l.active?' active':'')+'" style="margin-left:26px">'
      +'<span class="gacho-eye" data-eye="'+l.id+'">'+(l.visible?'👁':'🚫')+'</span>'
      +'<span class="gacho-dot" data-dot="'+l.id+'" style="background:'+l.color+'" title="色変更"></span>'
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
  var _live=state.layers.filter(function(l){return !l.archived;});
  var _arch=state.layers.filter(function(l){return l.archived;});
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
  var ou=q('#gachoOnlyUnrev');if(ou)ou.onclick=function(){state.hideReviewed=!state.hideReviewed;saveState();render();};
  var alb=q('#gachoAreaLbl');if(alb)alb.onclick=function(){state.showArea=!state.showArea;saveState();updateAreaLabels();renderPanel();};
  var bo=q('#gachoBulkOk');if(bo)bo.onclick=bulkViewedOk;
  var sn=q('#gachoShowNg');if(sn)sn.onclick=function(){state.showNg=!state.showNg;saveState();render();};
  var b0=q('.gacho-eye[data-b0]');if(b0)b0.onclick=function(){state.base0Visible=!state.base0Visible;saveState();render();};
  all('.gacho-eye[data-eye]').forEach(function(el){el.onclick=function(){var l=byId(el.getAttribute('data-eye'));if(l){l.visible=!l.visible;saveState();render();}};});
  all('.gacho-dot[data-dot]').forEach(function(el){el.onclick=function(){var l=byId(el.getAttribute('data-dot'));if(l){var i=PALETTE.indexOf(l.color);l.color=PALETTE[(i+1)%PALETTE.length];saveState();render();}};});
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

window.__gacho={
  removeItem:function(lid,itemIid){var m=getMap();if(m)m.closePopup();var l=byId(lid);if(!l)return;l.items=l.items.filter(function(it){return it.iid!==itemIid;});saveState();setTimeout(function(){render();},0);},
  review:function(lid,itemIid,val){var l=byId(lid);if(!l)return;l.items.forEach(function(it){if(it.iid===itemIid)it.viewed=!!val;});saveState();render();},
  setStatus:function(lid,itemIid,val){var m=getMap();if(m)m.closePopup();var l=byId(lid);if(!l)return;l.items.forEach(function(it){if(it.iid===itemIid){it.status=(it.status===val?null:val);it.viewed=true;}});saveState();setTimeout(function(){render();},0);},
  drawOn:function(lid){var l=byId(lid);if(!l)return;var m=getMap();if(m)m.closePopup();state.layers.forEach(function(x){x.active=(x.id===lid);});saveState();render();if(!_drawMode)toggleDraw();},
  /* v20260812j: 画層名を指定して(無ければ作成)取込先にし、敷地境界の描画を開始。手動ピック等のポップアップの「✏️敷地境界を描く」から呼ぶ */
  drawInLayer:function(name,color){var l=state.layers.filter(function(x){return x.name===name;})[0];if(!l){l={id:uid(),name:name,color:color||'#ff1493',visible:true,active:false,items:[]};state.layers.push(l);}state.layers.forEach(function(x){x.active=(x.id===l.id);});var m=getMap();if(m)m.closePopup();saveState();render();if(!_drawMode)toggleDraw();},
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
    var ex={};l.items.forEach(function(it){if(it.feature_id)ex[it.feature_id]=1;});
    var added=0;
    items.forEach(function(c){
      if(c.lat==null||c.lng==null)return;
      var fid=(prefix||'aiKI')+c.no;
      if(ex[fid])return;
      l.items.push({iid:iid(),feature_id:fid,lat:Number(c.lat),lng:Number(c.lng),address:(c.addr||c.city||''),area:(c.area!=null?Number(c.area):null),chiban:c.chiban,src:'aiKI',status:null});
      ex[fid]=1;added++;
    });
    saveState();setTimeout(function(){render();},0);
    if(added)toast('画層「'+layerName+'」にAI候補 '+added+'件を読込（未判定）');
  }
};

function injectStyle(){if(document.getElementById('gachoStyle'))return;var st=document.createElement('style');st.id='gachoStyle';st.textContent=''
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
+'.gacho-dot{width:12px;height:12px;border-radius:50%;display:inline-block;border:1px solid rgba(255,255,255,.4);flex:none;cursor:pointer;}'
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

function boot(){var m=getMap();if(!m||typeof L==='undefined'){return setTimeout(boot,250);}injectStyle();buildPanel();ensurePane(m);render();m.on('zoomend',updateAreaLabels);updateAreaLabels();document.addEventListener('keydown',function(e){var tag=((e.target&&e.target.tagName)||'').toLowerCase();if(tag==='input'||tag==='textarea')return;if(e.key==='Escape'){if(_rectMode)cleanupRect();if(_drawMode)cancelDraw();if(_pickMode)cleanupPick();if(_addMode)cleanupAdd();}if(_drawMode&&(e.key==='Backspace'||((e.ctrlKey||e.metaKey)&&(e.key==='z'||e.key==='Z')))){e.preventDefault();drawUndo();}});}
boot();
})();

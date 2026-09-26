/* 連動窓(別モニターのGoogleマップ等)との地図位置同期。共通include(トラッカー側)。
   ・システムの地図(Leaflet)の中心/ズームを BroadcastChannel('gridland-mapsync') で配信し、
     連動窓(google-sync.html)が同じ位置へ追従する。連動窓を動かした時は逆にこちらの地図が追従する。
   ・同じブラウザ内の窓どうしなら別モニターでも動く。連動窓を増やす時(農地ナビ窓等)も同じチャンネルを使う=同期ロジックの複製をしない。
   ・ズームはLeafletとGoogle(ウェブメルカトル256px)で同じ値。
   ・目視専用。取得した画像や情報を保存/学習に回さない。 */
(function(){
  'use strict';
  var ch=null; try{ ch=new BroadcastChannel('gridland-mapsync'); }catch(_){ return; }
  var applying=false, lastSend=0, wins={};
  function getMap(){ try{ return (typeof map!=='undefined'&&map&&map.getCenter)?map:(window.map&&window.map.getCenter?window.map:null); }catch(_){ return null; } }
  function send(force){
    var m=getMap(); if(!m||applying)return;
    var now=Date.now(); if(!force&&now-lastSend<60)return; lastSend=now;
    var c=m.getCenter(); ch.postMessage({src:'tracker',lat:c.lat,lng:c.lng,z:m.getZoom()});
  }
  function hook(){
    var m=getMap(); if(!m){ return setTimeout(hook,500); }
    m.on('move',function(){ send(false); });
    m.on('moveend',function(){ lastSend=0; send(true); });
    ch.onmessage=function(ev){
      var d=ev.data; if(!d)return;
      if(d.hello){ send(true); return; }                       // 連動窓が開いた直後の現在位置要求
      if(d.src!=='google'||!isFinite(d.lat)||!isFinite(d.lng))return;
      applying=true;
      try{ m.setView([d.lat,d.lng],(isFinite(d.z)?d.z:m.getZoom()),{animate:false}); }catch(_){}
      setTimeout(function(){ applying=false; },120);
    };
  }
  hook();
  // ツールバーに「連動窓」ボタンを追加(既存ボタンには触れない)
  function addBtn(){
    var tb=document.querySelector('.toolbar'); if(!tb){ return setTimeout(addBtn,300); }
    if(document.getElementById('btnMapSyncGoogle'))return;
    var b=document.createElement('button'); b.id='btnMapSyncGoogle'; b.className='btn btn-ghost'; b.style.cssText='font-size:12px;padding:5px 12px';
    b.textContent='🗺 Googleマップ窓'; b.title='別モニター用のGoogleマップ窓を開きます。システムの地図と同じ位置に追従します(ストリートビューも可)';
    b.onclick=function(e){ e.stopPropagation();
      var w=wins.google; if(w&&!w.closed){ try{w.focus();}catch(_){} send(true); return; }
      wins.google=window.open('google-sync.html','gridlandGoogleSync','popup=yes,width=1100,height=800');
      setTimeout(function(){ send(true); },1500);
    };
    var stats=tb.querySelector('.stats-bar'); if(stats)tb.insertBefore(b,stats); else tb.appendChild(b);
  }
  addBtn();
  window.__mapSyncSend=send;
})();

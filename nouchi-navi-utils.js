/* nouchi-navi-utils.js — 農地ナビ(map.maff.go.jp)起動の共通ロジック。
   field-survey.html/farmland-tracker.html/farmland-tracker-analysis.htmlに個別実装されていた
   openNouchiNavi()の重複を解消するため新設(2026-09-05・INDEX§0重複複製禁止)。
   ★2026-09-05(ドクター実機再現「私が開いても農地ナビが追随してこない」): URLパラメータ(z/clat/clon)
   での座標指定は農地ナビ側の対応が不確実(以前は存在しないパラメータ名zoom/lat/lngを長期間使っており
   全く座標が反映されていなかった実績がある)。より確実な標準フローとして、座標→住所(国土地理院
   逆ジオコーディング、gacho-layer.js._resolveManualGeoと同じAPI)で「都道府県+市区町村+大字」を
   取得しクリップボードへコピー、農地ナビの「住所から探す」で検索してもらう方式を併用する。
   URL(z/clat/clon)は地図の初期位置合わせの補助として引き続き渡す。 */
(function(){
  'use strict';
  var PREFN={'01':'北海道','02':'青森県','03':'岩手県','04':'宮城県','05':'秋田県','06':'山形県','07':'福島県','08':'茨城県','09':'栃木県','10':'群馬県','11':'埼玉県','12':'千葉県','13':'東京都','14':'神奈川県','15':'新潟県','16':'富山県','17':'石川県','18':'福井県','19':'山梨県','20':'長野県','21':'岐阜県','22':'静岡県','23':'愛知県','24':'三重県','25':'滋賀県','26':'京都府','27':'大阪府','28':'兵庫県','29':'奈良県','30':'和歌山県','31':'鳥取県','32':'島根県','33':'岡山県','34':'広島県','35':'山口県','36':'徳島県','37':'香川県','38':'愛媛県','39':'高知県','40':'福岡県','41':'佐賀県','42':'長崎県','43':'熊本県','44':'大分県','45':'宮崎県','46':'鹿児島県','47':'沖縄県'};
  var _muni=null,_muniPromise=null;
  function _loadMuni(){
    if(_muni)return Promise.resolve(_muni);
    if(_muniPromise)return _muniPromise;
    _muniPromise=fetch('https://maps.gsi.go.jp/js/muni.js').then(function(r){return r.text();}).then(function(t){
      var m={},re=/GSI\.MUNI_ARRAY\[\s*['"]?(\d+)['"]?\s*\]\s*=\s*['"]([^'"]+)['"]/g,x;
      while((x=re.exec(t))){var code=('00000'+x[1]).slice(-5);m[code]=x[2].split(',');}
      _muni=m;return m;
    }).catch(function(){_muni={};return _muni;});
    return _muniPromise;
  }
  var _cache={};
  // 座標(lat,lng) -> 「都道府県+市区町村+大字」文字列 or null(取得失敗)
  function reverseGeocodeAddress(lat,lng){
    var key=(+lat).toFixed(5)+','+(+lng).toFixed(5);
    if(_cache[key]!==undefined)return Promise.resolve(_cache[key]);
    return _loadMuni().then(function(muni){
      return fetch('https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat='+lat+'&lon='+lng)
        .then(function(r){return r.json();})
        .then(function(j){
          var res=(j&&j.results)||{};var mc=res.muniCd;
          if(!mc){_cache[key]=null;return null;}
          var code=('00000'+mc).slice(-5);
          var parts=muni[code]||[];
          var pref=PREFN[code.slice(0,2)]||'';
          var city='';
          for(var i=0;i<parts.length;i++){var p=parts[i];if(/[市町村区]/.test(p)&&!/[県都府道]/.test(p)){city=p;break;}}
          var oaza=res.lv01Nm||'';
          var addr=(pref+city+oaza).trim();
          _cache[key]=addr||null;
          return _cache[key];
        }).catch(function(){_cache[key]=null;return null;});
    });
  }
  // 農地ナビを新しいタブで開く。addressが無ければ逆ジオで自動取得してクリップボードへコピーする。
  // zoom省略時は17。toastFn(msg,type)を渡せばそのページの通知UIで案内を出せる(省略可)。
  function openNouchiNavi(lat,lng,opts){
    opts=opts||{};
    var zoom=opts.zoom||17;
    var toastFn=(typeof opts.toast==='function')?opts.toast:(typeof window.showToast==='function'?window.showToast:null);
    var addrPromise=opts.address?Promise.resolve(opts.address):reverseGeocodeAddress(lat,lng);
    addrPromise.then(function(addr){
      if(addr){
        try{navigator.clipboard&&navigator.clipboard.writeText(addr).catch(function(){});}catch(_e){}
        if(toastFn)toastFn('住所をコピーしました：'+addr+'　農地ナビの「住所から探す」で検索してください','success');
      }
    });
    var a=document.createElement('a');
    a.href='https://map.maff.go.jp/?z='+zoom+'&clat='+lat+'&clon='+lng;
    a.target='maff_nouchi_'+Date.now(); // タブ再利用によるSPA側の古い状態持ち越しを避けるため毎回ユニーク化
    a.rel='noopener';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  }
  window.NouchiNaviUtils={reverseGeocodeAddress:reverseGeocodeAddress,openNouchiNavi:openNouchiNavi};
})();

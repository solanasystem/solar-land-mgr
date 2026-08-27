/* ai-learn-hook.js — 全ページ共通（common-auth.jsから読込・コピペ複製禁止INDEX§0）
   目的: AIの「SWルームを読む/記録する」を"人間が押す・目で確認できる"検証可能な形にする。
   ①AI学習ボタン(全ページ): 押すと ai_learn_events に記録(=AIが各作業前に読む合図) + SWルームの"正"の要点を表示。
   ②緑ポップアップ: sw_records(AIがSWへ記録した証跡6項目)を監視し、新規記録を緑で表示=口だけでないの証拠。
   ドクター指示 2026-08-27。正=analysis_room/text/土地判断ノウハウ_教え込みログ。 */
(function(){
  'use strict';
  if (window.__aiLearnHook) return; window.__aiLearnHook = true;

  // ---- supabaseクライアント取得(common-auth.jsが用意する想定・準備待ち) ----
  function sb(){ return window.db || (window.__auth && window.__auth.sb) || window.sb || window.supabaseClient || null; }

  // ---- 判断基準の"正"の骨子(①〜⑦)。全文は私設リポの教え込みログ(核心IP・ここには要点のみ) ----
  var SEIKI = [
    '① 青地 or ハザード → 即除外（第一関門）',
    '② 面積≥800㎡ ＋ 接道',
    '③ 面積確定／<800は合筆（同一耕作者優先）',
    '④ 画像で耕作/放棄：建物無し必須／規則的な平行畝=耕作中NG／斑・モアレ・色ムラ=放棄OK（Hough直線）',
    '⑤ 日照：東90-南180-西270を6度刻み・冬至9-15時・最南端で影判定・遮蔽PENDは除外寄り',
    '⑥ 合筆：同一耕作者番号(farmer_hash)優先',
    '⑦ 時系列：最新画像=正／空き→家・太陽光=自動NG／reject採点は最新ソース／既設太陽光検出'
  ];
  var RE = [
    'RE① 農振は"目的地の県別"で判定（愛知固定を根絶）',
    'RE② 筆ポリゴンで農振に一部でも掛かれば除外（点+20m内側バッファ廃止）',
    'RE③ N02で"必ず直接接道"・林道/赤道NG・道幅約2m以上OK',
    'RE④ 最南端で冬至9-15時の影判定・距離しきい値(8m)廃止',
    'RE⑤ 過去画像の時系列で耕作放棄（Sentinel-2=10mは畝/建物/太陽光は見えず→高解像は別途）'
  ];

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function pageName(){ try{ return location.pathname.split('/').pop() || 'index.html'; }catch(_){ return 'unknown'; } }

  // ============ ① AI学習ボタン ============
  function injectButton(){
    if (document.getElementById('aiLearnBtn')) return;
    var b = document.createElement('button');
    b.id = 'aiLearnBtn';
    b.title = 'AI学習: 押すとAIがSWルームの"正"を読む合図を記録し、要点を表示します';
    b.textContent = '🧠 AI学習';
    b.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483000;'+
      'background:linear-gradient(90deg,#6d28d9,#4f46e5);color:#fff;border:2px solid #a78bfa;'+
      'border-radius:22px;padding:9px 16px;font-size:13px;font-weight:900;cursor:pointer;'+
      'box-shadow:0 4px 14px rgba(0,0,0,.35);font-family:sans-serif;';
    b.onclick = onLearnClick;
    document.body.appendChild(b);
  }

  function onLearnClick(){
    var ts = new Date();
    // 合図をDBへ記録(AIが各作業前に読む)。失敗しても表示は出す。
    var c = sb();
    if (c) { try { c.from('ai_learn_events').insert({ page: pageName(), note: 'AI学習ボタン押下' }).then(function(){},function(){}); } catch(_){} }
    showSeikiModal(ts);
  }

  function showSeikiModal(ts){
    closeModal();
    var ov = document.createElement('div');
    ov.id = 'aiLearnModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
    var rows = SEIKI.map(function(s){return '<li style="margin:4px 0">'+esc(s)+'</li>';}).join('');
    var reRows = RE.map(function(s){return '<li style="margin:4px 0;color:#c7d2fe">'+esc(s)+'</li>';}).join('');
    ov.innerHTML =
      '<div style="max-width:680px;width:92%;max-height:86vh;overflow:auto;background:#0f172a;color:#e2e8f0;border:2px solid #6d28d9;border-radius:12px;padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,.6)">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
          '<div style="font-weight:900;font-size:16px;color:#a78bfa">🧠 AI学習：SWルームの"正"を読む</div>'+
          '<button id="aiLearnClose" style="background:#334155;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:700">閉じる</button>'+
        '</div>'+
        '<div style="font-size:12px;color:#94a3b8;margin-bottom:10px">押下を記録しました（'+esc(ts.toLocaleString('ja-JP'))+'）。AIはこの合図で、判断基準の唯一の正＝<b style="color:#e2e8f0">土地判断ノウハウ 教え込みログ</b>を読みます。</div>'+
        '<div style="font-weight:800;color:#7dd3fc;margin:8px 0 2px">判断基準①〜⑦（骨子）</div>'+
        '<ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.6">'+rows+'</ul>'+
        '<div style="font-weight:800;color:#7dd3fc;margin:12px 0 2px">2026-08-27 追加要件 RE①〜⑤</div>'+
        '<ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.6">'+reRows+'</ul>'+
        '<div style="font-size:11px;color:#64748b;margin-top:12px">正の全文=私設リポ analysis_room/text/土地判断ノウハウ_教え込みログ（核心IP・ここは要点のみ）。AIは基準を再定義しない。</div>'+
      '</div>';
    document.body.appendChild(ov);
    document.getElementById('aiLearnClose').onclick = closeModal;
    ov.onclick = function(e){ if(e.target===ov) closeModal(); };
  }
  function closeModal(){ var m=document.getElementById('aiLearnModal'); if(m)m.remove(); }

  // ============ ② SW記録の緑ポップアップ ============
  var LS_KEY = 'sw_records_last_seen_id';
  function lastSeen(){ try{ return parseInt(localStorage.getItem(LS_KEY)||'0',10)||0; }catch(_){ return 0; } }
  function setSeen(id){ try{ localStorage.setItem(LS_KEY, String(id)); }catch(_){} }

  function pollRecords(){
    var c = sb(); if(!c) return;
    try {
      c.from('sw_records').select('id,ts,index_section,category,item,detail,impl_page').order('id',{ascending:false}).limit(5)
       .then(function(r){
         var rows = (r && r.data) || []; if(!rows.length) return;
         var seen = lastSeen();
         // 初回(未設定)は既存を既読にして誤爆させない
         if (seen === 0){ setSeen(rows[0].id); return; }
         var fresh = rows.filter(function(x){ return x.id > seen; }).sort(function(a,b){return a.id-b.id;});
         if(!fresh.length) return;
         setSeen(fresh[fresh.length-1].id);
         fresh.forEach(showGreenPopup);
       }, function(){});
    } catch(_){}
  }

  function showGreenPopup(rec){
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;right:14px;top:14px;z-index:2147483200;width:min(94vw,440px);'+
      'background:#052e1a;color:#dcfce7;border:2px solid #22c55e;border-radius:10px;padding:12px 14px;'+
      'box-shadow:0 8px 28px rgba(0,0,0,.5);font-family:sans-serif;font-size:12.5px;line-height:1.5;';
    function row(k,v){ return '<div style="display:flex;gap:8px;margin:2px 0"><div style="min-width:82px;color:#86efac;font-weight:700">'+esc(k)+'</div><div style="color:#f0fdf4">'+esc(v||'—')+'</div></div>'; }
    var tstr = ''; try{ tstr = new Date(rec.ts).toLocaleString('ja-JP'); }catch(_){ tstr = rec.ts||''; }
    d.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
        '<div style="font-weight:900;color:#4ade80">🟢 SWルーム記録完了</div>'+
        '<button style="background:#14532d;color:#bbf7d0;border:none;border-radius:6px;padding:2px 8px;cursor:pointer">×</button></div>'+
      row('目次(INDEX)', rec.index_section)+ row('カテゴリー', rec.category)+ row('項目', rec.item)+
      row('詳細内容', rec.detail)+ row('日時', tstr)+ row('実装ページ', rec.impl_page);
    d.querySelector('button').onclick = function(){ d.remove(); };
    document.body.appendChild(d);
    setTimeout(function(){ try{ d.remove(); }catch(_){} }, 60000); // 60秒で自動消滅(閉じるボタンでも消せる)
  }

  // ---- 起動 ----
  function boot(){
    injectButton();
    // supabaseクライアントが用意できるまで待ってからポーリング開始
    var tries=0;
    (function waitSb(){
      if (sb()){ pollRecords(); setInterval(pollRecords, 15000); }
      else if (tries++ < 40){ setTimeout(waitSb, 500); }
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

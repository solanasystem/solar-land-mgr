/* ai-learn-hook.js — 全ページ共通（common-auth.jsから読込・コピペ複製禁止INDEX§0）
   目的: AIの「SWルームを読む/記録する」を"人間が押す・目で確認できる"検証可能な形にする。
   ①AI学習ボタン(全ページ): 押すと ai_learn_events に記録(=AIが各作業前に読む合図) + SWルームの"正"の要点を表示。
   ②緑ポップアップ: sw_records(AIがSWへ記録した証跡6項目)を監視し、新規記録を緑で表示=口だけでないの証拠。
   ★ページのsupabaseクライアントに依存せず、公開anonキーで直接REST fetch(確実・タイミング非依存)。
   ドクター指示 2026-08-27。正=analysis_room/text/土地判断ノウハウ_教え込みログ。 */
(function(){
  'use strict';
  if (window.__aiLearnHook) return; window.__aiLearnHook = true;

  // 公開anonキー(全クライアントページで既に公開済み=埋め込み可)。RLSはanon SELECT(sw_records)/anon INSERT(ai_learn_events)。
  var SUPA = 'https://fygnrjjifoasozbhkxlk.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5Z25yamppZm9hc296YmhreGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MDYzNTEsImV4cCI6MjA5MDE4MjM1MX0.A1fAMcu7wGBBP4xHUKkrExIuy7MFbmarAtLQahwZiso';
  var HDR = { 'apikey': ANON, 'Authorization': 'Bearer ' + ANON, 'Content-Type': 'application/json' };

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
    try {
      fetch(SUPA + '/rest/v1/ai_learn_events', { method:'POST', headers:HDR,
        body: JSON.stringify({ page: pageName(), note: 'AI学習ボタン押下' }) }).catch(function(){});
    } catch(_){}
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

  // ---- 常時表示の診断バッジ(console不可のため画面だけで状態が分かるようにする・2026-08-27) ----
  var diagEl = null;
  function injectDiag(){
    if (document.getElementById('aiLearnDiag')) return;
    diagEl = document.createElement('div');
    diagEl.id = 'aiLearnDiag';
    diagEl.style.cssText = 'position:fixed;right:14px;bottom:52px;z-index:2147483000;'+
      'background:#0f172a;color:#94a3b8;border:1px solid #334155;border-radius:8px;'+
      'padding:4px 9px;font-size:10px;font-family:monospace;box-shadow:0 2px 8px rgba(0,0,0,.3);'+
      'max-width:260px;';
    diagEl.textContent = 'SW記録: 起動中…';
    document.body.appendChild(diagEl);
  }
  function setDiag(text, ok){
    if(!diagEl) return;
    diagEl.textContent = 'SW記録: ' + text;
    diagEl.style.borderColor = ok===false ? '#dc2626' : (ok===true ? '#16a34a' : '#334155');
    diagEl.style.color = ok===false ? '#fca5a5' : (ok===true ? '#86efac' : '#94a3b8');
  }

  function pollRecords(){
    var url = SUPA + '/rest/v1/sw_records?select=id,ts,index_section,category,item,detail,impl_page&order=id.desc&limit=5';
    fetch(url, { headers: HDR }).then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    }).then(function(rows){
      var now = new Date().toLocaleTimeString('ja-JP');
      if(!rows || !rows.length){ setDiag('0件('+now+')', true); return; }
      var seen = lastSeen();
      if (seen === 0){
        setSeen(rows[0].id);
        setDiag('初回起動・id'+rows[0].id+'を既読化('+now+')。以降の新規のみポップアップ', true);
        return;
      }
      var fresh = rows.filter(function(x){ return x.id > seen; }).sort(function(a,b){return a.id-b.id;});
      setDiag('最新id'+rows[0].id+' / 既読id'+seen+' / 新規'+fresh.length+'件('+now+')', true);
      if(!fresh.length) return;
      setSeen(fresh[fresh.length-1].id);
      fresh.forEach(showGreenPopup);
    }).catch(function(e){
      setDiag('通信失敗: '+((e&&e.message)||e)+'('+new Date().toLocaleTimeString('ja-JP')+')', false);
    });
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
    setTimeout(function(){ try{ d.remove(); }catch(_){} }, 90000); // 90秒で自動消滅(×でも消せる)
  }

  // ---- 起動 ----
  function boot(){
    injectButton();
    injectDiag();
    pollRecords();
    setInterval(pollRecords, 10000);  // 10秒ごと
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

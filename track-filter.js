/* track-filter.js — 用地トラック分類の単一定義（太陽光/低圧蓄電池/調整区域記録/その他/落ち）
   ★フィルター定義の"正"。開拓案件候補ページ等が共通で読む＝別実装で取り残さない。
   ドクター確定(2026-08-20)。詳細: analysis_room/logic/filter_definitions_太陽光_蓄電池.md
   ・⑦AI学習選定は farmland_ng_list(ai_reject) 経由で母集団から既に除外済み（ここでは判定不要）。
   ・列: source_type, hazard_status, noshin_status, dedup_status, grid_status, infra_status,
         shading_status, area_sqm, city_planning_zone
   戻り値: 'solar' | 'battery' | 'battery_record' | 'other' | 'reject' */
(function(g){
  'use strict';
  var LABELS = {
    solar:          '☀太陽光',
    battery:        '🔋低圧蓄電池',
    battery_record: '🔋蓄電池(調整区域・記録保持)',
    other:          '📌その他(手ピック/売りたい/納品)',
    reject:         '✖落ち'
  };
  function num(v){ var n = parseFloat(v); return isNaN(n) ? null : n; }
  function classifyTrack(f){
    if(!f) return 'reject';
    var st = f.source_type;
    // 非emaff_solar(手ピック/売りたい/納品/trackB等)=別トラック。素通しで活性。
    if(st !== 'emaff_solar') return 'other';
    // 共通ゲート ①ハザード ②青地 ③重複 ④連系 ⑥接道 （⑦AIはng_listで別途除外済）
    var basePass = (f.hazard_status==='CLEAR' && f.noshin_status==='CLEAR' && f.dedup_status==='NEW'
                    && f.grid_status!=='ng' && f.infra_status!=='FAIL');
    if(!basePass) return 'reject';
    var a = num(f.area_sqm);
    // 太陽光: +⑤日照 +⑧面積≥800（都市計画区域は問わない＝調整区域でも国都計第7号でOK）
    if((f.shading_status==null || f.shading_status!=='NG') && a!=null && a>=800) return 'solar';
    // 低圧蓄電池: 面積50〜800（⑤日照は不要）＋①都市計画区域
    if(a!=null && a>=50 && a<800){
      // ①市街化調整区域(control)は活性から外し"記録保持"、市街化区域/非線引きは活性
      if(f.city_planning_zone==='control') return 'battery_record';
      return 'battery';
    }
    return 'reject'; // <50㎡ 等 太陽光/蓄電池いずれの面積帯にも入らない
  }
  g.TRACK_LABELS = LABELS;
  g.classifyTrack = classifyTrack;
})(typeof window !== 'undefined' ? window : this);

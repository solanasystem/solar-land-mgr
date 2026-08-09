// ============================================================================
// client-functions.js  — クライアント毎の「搭載機能」定義（config駆動・こちらで絞る）
//   方針(2026-08-10 栗本さん): 全機能ありき＋管理モードで隠す のではなく、
//   クライアント毎に"最初から搭載する機能"をここで定義する。ポータルはこの定義から生成。
//   機能を足す/外す = このファイルを編集するだけ（runtime権限フィルタに依存しない）。
// ============================================================================
window.CLIENT_FUNCTIONS = {
  // 全機能レジストリ（key: 定義）
  registry: {
    'delivery-excel': { label:'納品データ掃き出し', desc:'必要な項目を選んでExcelに出力＋掃き出し履歴（消えないログ）', icon:'📊', url:'client-delivery.html', ready:true,  accent:'#34d399' },
    'delivery-map':   { label:'納品案件マップ',     desc:'確定納品を地図で確認（閲覧のみ・座標/区域/面積）',          icon:'🗺', url:'#',                 ready:false, accent:'#00d4ff' },
    'delivery-list':  { label:'納品一覧・履歴',      desc:'いつ・どの行政エリアに・何件納品したかの一覧',              icon:'📋', url:'#',                 ready:false, accent:'#a78bfa' },
    'confirmation':   { label:'個別確認情報',        desc:'現況写真・現地確認・①〜⑤の結果',                          icon:'📷', url:'#',                 ready:false, accent:'#fb923c' },
    'feedback':       { label:'採否フィードバック',  desc:'各案件を採用/却下/保留で返す（成約管理）',                  icon:'📨', url:'#',                 ready:false, accent:'#f472b6' },
    'maintenance':    { label:'不具合・入替の依頼',  desc:'納品案件の不具合報告・差替依頼（保守）',                    icon:'🛠', url:'#',                 ready:false, accent:'#f59e0b' }
  },
  // クライアント毎の搭載機能（＝こちらで厳選）。'own'(自社)は内部フルのためここに載せない。
  clients: {
    'suntrust': ['delivery-excel','delivery-map','delivery-list']
  }
};

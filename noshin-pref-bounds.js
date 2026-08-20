/* 農振農用地 県別境界＋ファイルの単一定義(全国=北海道/四国/沖縄を除く41県)。
   現地調査マップ/トラッカー/分析 が共通で読む=別実装の取り残しによる再発を防止。
   R2県=絶対URL / 既存11県=data/noshin/(同一オリジン相対)。 v20260820 */
window.NOSHIN_PREF_BOUNDS={
  // 北関東・東関東
  tochigi:  {latMin:36.2,  latMax:37.2,  lngMin:139.3,  lngMax:140.3,  file:'data/noshin/noshin_tochigi.geojson', name:'栃木県'},
  gunma:    {latMin:36.0,  latMax:37.1,  lngMin:138.4,  lngMax:139.7,  file:'data/noshin/noshin_gunma.geojson',   name:'群馬県'},
  saitama:  {latMin:35.75, latMax:36.3,  lngMin:138.7,  lngMax:140.0,  file:'data/noshin/noshin_saitama.geojson', name:'埼玉県'},
  chiba:    {latMin:34.9,  latMax:36.1,  lngMin:139.7,  lngMax:140.9,  file:'data/noshin/noshin_chiba.geojson',   name:'千葉県'},
  // 中部・東海（県境を経度で精密分割）
  nagano:   {latMin:35.2,  latMax:37.0,  lngMin:137.45, lngMax:138.7,  file:'data/noshin/noshin_nagano.geojson',  name:'長野県'},
  gifu:     {latMin:35.1,  latMax:36.5,  lngMin:136.3,  lngMax:137.45, file:'data/noshin/noshin_gifu.geojson',    name:'岐阜県'},
  shizuoka: {latMin:34.55, latMax:35.4,  lngMin:137.5,  lngMax:139.2,  file:'data/noshin/noshin_shizuoka.geojson',name:'静岡県'},
  aichi:    {latMin:34.5,  latMax:35.4,  lngMin:136.5,  lngMax:137.7,  file:'data/noshin/noshin_aichi.geojson',name:'愛知県'},
  // 近畿
  mie:      {latMin:33.7,  latMax:35.1,  lngMin:135.9,  lngMax:136.9,  file:'data/noshin/noshin_mie.geojson',     name:'三重県'},
  shiga:    {latMin:34.8,  latMax:35.7,  lngMin:135.8,  lngMax:136.5,  file:'data/noshin/noshin_shiga.geojson',   name:'滋賀県'},
  hyogo:    {latMin:34.1,  latMax:35.7,  lngMin:134.2,  lngMax:135.5,  file:'data/noshin/noshin_hyogo.geojson', name:'兵庫県'},
  // ===== v20260727b 追加30県（全てR2） 北海道・四国・沖縄を除く =====
  // 東北
  aomori:   {latMin:40.2,  latMax:41.6,  lngMin:139.5,  lngMax:141.7,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_aomori.geojson',   name:'青森県'},
  iwate:    {latMin:38.7,  latMax:40.5,  lngMin:140.6,  lngMax:142.1,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_iwate.geojson',    name:'岩手県'},
  miyagi:   {latMin:37.7,  latMax:39.0,  lngMin:140.3,  lngMax:141.7,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_miyagi.geojson',   name:'宮城県'},
  akita:    {latMin:38.8,  latMax:40.5,  lngMin:139.6,  lngMax:141.0,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_akita.geojson',    name:'秋田県'},
  yamagata: {latMin:37.7,  latMax:39.2,  lngMin:139.5,  lngMax:140.6,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_yamagata.geojson', name:'山形県'},
  fukushima:{latMin:36.8,  latMax:38.0,  lngMin:139.2,  lngMax:141.1,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_fukushima.geojson',name:'福島県'},
  // 関東（追加分）
  ibaraki:  {latMin:35.7,  latMax:36.95, lngMin:139.6,  lngMax:140.9,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_ibaraki.geojson',  name:'茨城県'},
  tokyo:    {latMin:35.5,  latMax:35.9,  lngMin:138.9,  lngMax:139.9,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_tokyo.geojson',    name:'東京都'},
  kanagawa: {latMin:35.1,  latMax:35.7,  lngMin:139.0,  lngMax:139.8,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_kanagawa.geojson', name:'神奈川県'},
  // 中部（追加分）
  niigata:  {latMin:36.7,  latMax:38.6,  lngMin:137.6,  lngMax:139.9,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_niigata.geojson',  name:'新潟県'},
  toyama:   {latMin:36.3,  latMax:36.98, lngMin:136.8,  lngMax:137.8,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_toyama.geojson',   name:'富山県'},
  ishikawa: {latMin:36.0,  latMax:37.9,  lngMin:136.2,  lngMax:137.4,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_ishikawa.geojson', name:'石川県'},
  fukui:    {latMin:35.3,  latMax:36.3,  lngMin:135.4,  lngMax:136.5,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_fukui.geojson',    name:'福井県'},
  yamanashi:{latMin:35.2,  latMax:35.97, lngMin:138.2,  lngMax:139.2,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_yamanashi.geojson',name:'山梨県'},
  // 近畿（追加分）
  kyoto:    {latMin:34.7,  latMax:35.8,  lngMin:134.85, lngMax:136.05, file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_kyoto.geojson',    name:'京都府'},
  osaka:    {latMin:34.3,  latMax:35.05, lngMin:135.1,  lngMax:135.75, file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_osaka.geojson',    name:'大阪府'},
  nara:     {latMin:33.85, latMax:34.75, lngMin:135.6,  lngMax:136.15, file:'data/noshin/noshin_nara.geojson',     name:'奈良県'},
  wakayama: {latMin:33.4,  latMax:34.4,  lngMin:135.0,  lngMax:136.0,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_wakayama.geojson', name:'和歌山県'},
  // 中国
  tottori:  {latMin:35.1,  latMax:35.6,  lngMin:133.1,  lngMax:134.5,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_tottori.geojson',  name:'鳥取県'},
  shimane:  {latMin:34.3,  latMax:36.4,  lngMin:131.6,  lngMax:133.4,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_shimane.geojson',  name:'島根県'},
  okayama:  {latMin:34.3,  latMax:35.35, lngMin:133.25, lngMax:134.4,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_okayama.geojson',  name:'岡山県'},
  hiroshima:{latMin:34.0,  latMax:35.1,  lngMin:132.0,  lngMax:133.5,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_hiroshima.geojson',name:'広島県'},
  yamaguchi:{latMin:33.7,  latMax:34.8,  lngMin:130.75, lngMax:132.4,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_yamaguchi.geojson',name:'山口県'},
  // 九州
  fukuoka:  {latMin:33.0,  latMax:34.0,  lngMin:130.0,  lngMax:131.2,  file:'data/noshin/noshin_fukuoka.geojson',  name:'福岡県'},
  saga:     {latMin:33.0,  latMax:33.6,  lngMin:129.7,  lngMax:130.55, file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_saga.geojson',     name:'佐賀県'},
  nagasaki: {latMin:32.6,  latMax:34.7,  lngMin:128.6,  lngMax:130.4,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_nagasaki.geojson', name:'長崎県'},
  kumamoto: {latMin:32.1,  latMax:33.2,  lngMin:129.9,  lngMax:131.35, file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_kumamoto.geojson', name:'熊本県'},
  oita:     {latMin:32.7,  latMax:33.75, lngMin:130.8,  lngMax:132.1,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_oita.geojson',     name:'大分県'},
  miyazaki: {latMin:31.35, latMax:32.85, lngMin:130.7,  lngMax:131.9,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_miyazaki.geojson', name:'宮崎県'},
  kagoshima:{latMin:30.4,  latMax:32.2,  lngMin:129.5,  lngMax:131.2,  file:'https://reinfolib-proxy.takumi-29b.workers.dev/r2/noshin_kagoshima.geojson',name:'鹿児島県'}
};;

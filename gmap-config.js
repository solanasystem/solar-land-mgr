/* Google Static Maps APIキー受け皿（①フラグ・ホバー最新衛星用）
 *
 * 使い方: 下の '' の中に、Google Cloud で発行した Maps Static API のキーを貼るだけ。
 *   例) window.GMAP_STATIC_KEY = 'AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXX';
 *
 * ・空('')のままなら機能は完全にOFF（既存挙動は一切変わらない）。
 * ・このファイルは公開配信されるが、キーは必ず「HTTPリファラー制限＋Maps Static APIのみ」に
 *   制限すること（制限済みなら公開でも第三者は使えない＝安全）。
 * ・Googleマップは目視専用（規約でAI学習への投入は禁止）。取得画像は表示のみ・保存/学習に回さない。
 */
window.GMAP_STATIC_KEY = '';

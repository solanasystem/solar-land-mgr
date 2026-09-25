/* rpc-bbox-all.js — 画面範囲(bbox)を引数に取るRPCを「上限なし」で全件取得する共通ヘルパー (2026-09-25)
 *
 * 背景(Dr.が画面で発見・SW id=161): Supabase(PostgREST)は RPC の返却行数をサーバー設定 max-rows=1,000 で切る。
 *   関数側に row_limit を渡しても、クライアントが受け取れるのは 1,000 行まで。台帳ポリゴン層が広い画面で
 *   「画面内 1,000 筆」と出て残りが描かれなかったのはこれ。農地フラグ層(get_farmland_in_bbox)・TrackB層も同じ。
 * 方式: 結果が 1,000 行(上限)に達したら bbox を4分割して再帰取得し、id で重複を除いて合流する。
 *   並び順に依存しない(Range/offset ページングは関数に ORDER BY が無いと取りこぼす恐れがあるため使わない)。
 *   分割は上限に当たった時だけ起きるので、通常の画面では1回の呼び出しで済む。
 * 使い方: window.rpcBboxAll(db, 'get_farmland_in_bbox', {lat_min,lat_max,lng_min,lng_max}, {row_limit:100000000}, 'id')
 *   → Promise<{data: rows[], error: null|Error, calls: n}>
 */
(function(){
  'use strict';
  var MAX_ROWS = 1000;      // PostgREST の max-rows(実測: 1,000)
  var MAX_DEPTH = 14;       // 4分割の最大深さ(安全弁。画面bboxなら数段で必ず1,000未満になる)
  async function rpcBboxAll(db, fn, bbox, extra, idKey){
    extra = extra || {}; idKey = idKey || 'id';
    var out = [], seen = {}, calls = 0, err = null;
    async function one(bb, depth){
      if (err) return;
      var args = Object.assign({}, extra, { lat_min: bb[0], lat_max: bb[1], lng_min: bb[2], lng_max: bb[3] });
      var res; calls++;
      try { res = await db.rpc(fn, args); } catch (e) { err = e; return; }
      if (!res || res.error) { err = (res && res.error) || new Error('rpc failed'); return; }
      var rows = res.data || [];
      if (rows.length >= MAX_ROWS && depth < MAX_DEPTH) {
        var mla = (bb[0] + bb[1]) / 2, mln = (bb[2] + bb[3]) / 2;
        await one([bb[0], mla, bb[2], mln], depth + 1);
        await one([bb[0], mla, mln, bb[3]], depth + 1);
        await one([mla, bb[1], bb[2], mln], depth + 1);
        await one([mla, bb[1], mln, bb[3]], depth + 1);
        return;
      }
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var k = (r[idKey] != null) ? String(r[idKey]) : (r.lat + ',' + r.lng);
        if (seen[k]) continue; seen[k] = 1; out.push(r);
      }
    }
    await one([bbox.lat_min, bbox.lat_max, bbox.lng_min, bbox.lng_max], 0);
    return { data: out, error: err, calls: calls };
  }
  window.rpcBboxAll = rpcBboxAll;
})();

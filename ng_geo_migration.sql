-- ============================================================
-- NG除外を「座標(地点)」で永続化する移行SQL
--   farmland_ng_list に lat/lng を追加し、既存NGの座標を
--   スナップショットから一括backfill する。
--   ★必ずこのSQLを先に実行してから、新しいHTMLをアップロードすること。
--   （HTMLの書込みは lat/lng 列を前提にしているため）
--   実行先: Supabase SQL Editor
--   https://supabase.com/dashboard/project/fygnrjjifoasozbhkxlk/editor
-- ============================================================

-- 1) 座標列を追加（既にあれば何もしない）
ALTER TABLE farmland_ng_list ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE farmland_ng_list ADD COLUMN IF NOT EXISTS lng double precision;

-- 2) 既存NGの座標を、その feature_id を持つ最新スナップショットから一括backfill
--    NULLの行だけ埋めるので、何度実行しても安全（再実行可）。
--    PBF系IDがドリフトしていても、過去のスナップショットに同IDが残っていれば座標を回収できる。
UPDATE farmland_ng_list n
SET lat = s.lat, lng = s.lng
FROM (
  SELECT DISTINCT ON (feature_id) feature_id, lat, lng
  FROM farmland_snapshots
  WHERE lat IS NOT NULL AND lng IS NOT NULL
  ORDER BY feature_id, snapshot_date DESC
) s
WHERE n.feature_id = s.feature_id
  AND (n.lat IS NULL OR n.lng IS NULL);

-- 3) 確認：座標が入ったNG件数 / 入らなかった件数 / 合計
SELECT
  count(*) FILTER (WHERE lat IS NOT NULL) AS with_coords,
  count(*) FILTER (WHERE lat IS NULL)     AS without_coords,
  count(*)                                AS total
FROM farmland_ng_list;

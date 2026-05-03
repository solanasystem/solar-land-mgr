-- =================================================================
-- snow_load_master 蒲郡市データ確認
-- 目的: case-summary v10 で snow=NA となる原因調査
-- =================================================================

-- 確認①: 蒲郡市が current_city または former_area に登録されているか
SELECT prefecture, former_area, parent_district, current_city, snow_depth_cm
FROM snow_load_master
WHERE prefecture = '愛知県'
  AND (current_city = '蒲郡市' OR former_area = '蒲郡市');

-- 確認②: 愛知県全体の current_city マッピング状況
SELECT
  COUNT(*) AS 愛知県全件,
  COUNT(current_city) AS current_city埋まり,
  COUNT(*) - COUNT(current_city) AS current_city空
FROM snow_load_master
WHERE prefecture = '愛知県';

-- 確認③: 愛知県の current_city ユニーク値（30件まで）
SELECT current_city, COUNT(*) AS 件数, MIN(snow_depth_cm) AS min_cm, MAX(snow_depth_cm) AS max_cm
FROM snow_load_master
WHERE prefecture = '愛知県' AND current_city IS NOT NULL
GROUP BY current_city
ORDER BY current_city
LIMIT 30;

-- 確認④: 全国件数（テーブル存在確認）
SELECT COUNT(*) AS 全国件数 FROM snow_load_master;

-- ============================================================
-- 【診断SQL】新規案件・土地情報保存エラーの原因特定
-- 実行先: Supabase SQL Editor
-- https://supabase.com/dashboard/project/fygnrjjifoasozbhkxlk/editor
-- ============================================================

-- ① land_info テーブルの全カラム確認
SELECT
  ordinal_position AS no,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'land_info'
ORDER BY ordinal_position;

-- ② 概要書系の追加カラムが存在するか確認（無いとINSERTでエラー）
SELECT
  column_name
FROM information_schema.columns
WHERE table_name = 'land_info'
  AND column_name IN (
    'chimoku', 'land_rights', 'rental_fee', 'otsu_rights',
    'road_width', 'road_pavement', 'logging_permit', 'noushinhou_kubun',
    'youto_chiiki', 'jourei', 'guideline', 'pole_left', 'pole_center', 'pole_right',
    'buried_culture_details', 'application_details', 'notification_details',
    'hazard_flood_flag', 'hazard_landslide_flag', 'hazard_high_tide_flag',
    'hazard_tsunami_flag', 'hazard_sabo_flag', 'hazard_river_flag',
    'hazard_wildlife_flag', 'hazard_buried_culture_flag', 'hazard_national_park_flag',
    'hazard_natural_env_flag', 'application_flag', 'notification_flag',
    'article5_forest', 'article5_checked_at', 'article5_notes'
  )
ORDER BY column_name;

-- 期待: 31件すべて返ってくる
-- 不足カラムがあれば、main.html の payload で「column does not exist」エラーが発生

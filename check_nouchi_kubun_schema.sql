-- ============================================================
-- 【確認＋念のため適用】land_info の農地種別カラム状態確認
-- 実行先: Supabase SQL Editor
-- https://supabase.com/dashboard/project/fygnrjjifoasozbhkxlk/editor
-- ============================================================

-- ① まず現状確認（過去のv20260512q改修が反映済みかチェック）
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'land_info'
  AND column_name IN ('article5_forest', 'article5_checked_at', 'article5_notes', 'nouchi_kubun')
ORDER BY column_name;

-- 期待結果（過去改修済みの場合）:
--   article5_forest | text   ← 残っている
--   nouchi_kubun    | text   ← 追加済み
-- ※ article5_checked_at, article5_notes は表示されない（削除済みの証拠）

-- ============================================================
-- ② もし期待結果にならない（過去改修が DB に反映されていない）場合のみ実行
-- ============================================================
-- ALTER TABLE land_info DROP COLUMN IF EXISTS article5_checked_at;
-- ALTER TABLE land_info DROP COLUMN IF EXISTS article5_notes;
-- ALTER TABLE land_info ADD COLUMN IF NOT EXISTS nouchi_kubun TEXT;
-- COMMENT ON COLUMN land_info.nouchi_kubun IS '農地種別: 青地/白1種/白2種/白3種/農地以外/未調査/調査中';

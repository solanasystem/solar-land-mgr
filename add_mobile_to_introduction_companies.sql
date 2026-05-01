-- ============================================================================
-- SOLAR LAND MGR / 紹介先企業マスター
-- introduction_companies テーブルに「携帯番号」カラムを追加
-- 作成日: 2026/05/01
-- ----------------------------------------------------------------------------
-- 内容:
--   - mobile TEXT カラム1本のみ追加
--   - 既存データ・既存カラムには一切影響なし
--   - IF NOT EXISTS により何度実行しても安全
-- ============================================================================

ALTER TABLE introduction_companies
  ADD COLUMN IF NOT EXISTS mobile TEXT;

-- ----------------------------------------------------------------------------
-- 動作確認（実行後、'✅ 追加成功' と表示されればOK）
-- ----------------------------------------------------------------------------
SELECT
  'introduction_companies.mobile カラム' AS check_item,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'introduction_companies'
        AND column_name = 'mobile'
    ) THEN '✅ 追加成功'
    ELSE '❌ 失敗'
  END AS status;

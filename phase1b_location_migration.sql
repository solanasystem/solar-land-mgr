-- =================================================================
-- Phase 1B: location データ移行（地番分離・所在クリーニング）
-- 作成日: 2026-05-02
-- 目的: location から地番を抽出して chiban に移し、location は所在のみに統一
-- 安全策: location_backup カラムを追加して移行前データを保持
--
-- 対応パターン:
--   A) location='愛知県蒲郡市西浦町南関53番1', chiban=NULL
--      → location='愛知県蒲郡市西浦町南関', chiban='53番1'
--   B) location='{豊橋市西山町字西山 55-7}', chiban='55番7'
--      → location='豊橋市西山町字西山', chiban='55番7'(既存維持)
--   C) location='豊橋市大清水町字大清水 511-1', chiban='511番1'
--      → location='豊橋市大清水町字大清水', chiban='511番1'(既存維持)
-- =================================================================

-- ステップ1: バックアップカラムを追加
ALTER TABLE land_info
  ADD COLUMN IF NOT EXISTS location_backup TEXT;

COMMENT ON COLUMN land_info.location_backup IS 'Phase 1B移行前のlocation値バックアップ (2026-05-02)';

-- ステップ2: バックアップ取得（既にバックアップ済みのレコードはスキップ）
UPDATE land_info
SET location_backup = location
WHERE location IS NOT NULL
  AND location_backup IS NULL;

-- ステップ3: 移行内容のプレビュー（実行前に確認）
WITH preview AS (
  SELECT
    id,
    case_id,
    location AS old_location,
    chiban AS old_chiban,

    -- 中間ステップ: { } 除去とtrim
    TRIM(BOTH ' ' FROM REGEXP_REPLACE(location, '^[\{｛](.+)[\}｝]$', '\1')) AS unwrapped,

    -- 末尾の地番を抽出（例: "53番1" / "55-7" / "511番"）
    -- パターン1: 数字+番+数字 (例: 53番1)
    -- パターン2: 数字+ハイフン+数字 (例: 55-7) → "55番7"に正規化
    -- パターン3: 数字+番 (例: 511番)
    CASE
      -- chiban既設→そのまま使用
      WHEN chiban IS NOT NULL AND chiban != '' THEN chiban
      -- 末尾の "数字番数字" パターン
      WHEN location ~ '\d+番\d+\s*$' THEN
        (REGEXP_MATCH(location, '(\d+番\d+)\s*$'))[1]
      -- 末尾の "数字-数字" パターン → "数字番数字"に正規化
      WHEN location ~ '\d+-\d+\s*$' THEN
        REPLACE((REGEXP_MATCH(location, '(\d+-\d+)\s*$'))[1], '-', '番')
      -- 末尾の "数字番" パターン
      WHEN location ~ '\d+番\s*$' THEN
        (REGEXP_MATCH(location, '(\d+番)\s*$'))[1]
      ELSE NULL
    END AS new_chiban,

    -- 所在のみのlocation (地番削除 + { } 除去 + trim)
    TRIM(BOTH ' ' FROM
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(location, '^[\{｛](.+)[\}｝]$', '\1'),
          '\s*\d+番\d+\s*$', ''
        ),
        '\s*\d+-\d+\s*$', ''
      )
    ) AS new_location_step1
  FROM land_info
  WHERE location IS NOT NULL
)
SELECT
  case_id,
  old_location,
  old_chiban,
  -- 末尾の "数字番" を更に削除
  TRIM(BOTH ' ' FROM REGEXP_REPLACE(new_location_step1, '\s*\d+番\s*$', '')) AS new_location,
  new_chiban
FROM preview
ORDER BY case_id
LIMIT 30;

-- =================================================================
-- ⚠️ 上のプレビューを確認してから、以下を実行してください
-- =================================================================

-- ステップ4: 実移行 UPDATE
UPDATE land_info
SET
  -- chibanがNULLの場合のみ抽出した地番を入れる
  chiban = CASE
    WHEN chiban IS NOT NULL AND chiban != '' THEN chiban
    WHEN location ~ '\d+番\d+\s*$' THEN
      (REGEXP_MATCH(location, '(\d+番\d+)\s*$'))[1]
    WHEN location ~ '\d+-\d+\s*$' THEN
      REPLACE((REGEXP_MATCH(location, '(\d+-\d+)\s*$'))[1], '-', '番')
    WHEN location ~ '\d+番\s*$' THEN
      (REGEXP_MATCH(location, '(\d+番)\s*$'))[1]
    ELSE chiban
  END,

  -- locationを所在のみに整形
  location = TRIM(BOTH ' ' FROM
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(location, '^[\{｛](.+)[\}｝]$', '\1'),
          '\s*\d+番\d+\s*$', ''
        ),
        '\s*\d+-\d+\s*$', ''
      ),
      '\s*\d+番\s*$', ''
    )
  )
WHERE location IS NOT NULL;

-- ステップ5: 移行後の確認
SELECT
  case_id,
  location_backup AS "移行前location",
  location        AS "移行後location",
  chiban          AS "chiban",
  chimoku         AS "地目"
FROM land_info
WHERE location IS NOT NULL
ORDER BY case_id
LIMIT 20;

-- =================================================================
-- ロールバック手順（万一問題が発生したら）
-- =================================================================
-- UPDATE land_info SET location = location_backup, chiban = NULL WHERE location_backup IS NOT NULL;

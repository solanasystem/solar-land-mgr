-- =================================================================
-- Phase 1A: land_info 拡張（概要書フル対応・20カラム追加）
-- 作成日: 2026-05-02
-- 仕様参照: PDF「概要書_蓄電所__本庄児玉713-2.pdf」
-- 既存追加(Phase 1): otsu_rights, road_width, road_pavement,
--                    logging_permit, buried_culture_details, notification_details
-- =================================================================

-- 1) 用途・規制 (4カラム)
ALTER TABLE land_info
  ADD COLUMN IF NOT EXISTS youto_chiiki      TEXT,
  ADD COLUMN IF NOT EXISTS noushinhou_kubun  TEXT,
  ADD COLUMN IF NOT EXISTS jourei            TEXT,
  ADD COLUMN IF NOT EXISTS guideline         TEXT;

COMMENT ON COLUMN land_info.youto_chiiki     IS '用途地域 - 例: 市街化調整区域';
COMMENT ON COLUMN land_info.noushinhou_kubun IS '農振法区分 - 農用地区域内/外/該当なし等';
COMMENT ON COLUMN land_info.jourei           IS '条例 - 例: 太陽光発電設備の設置に関する条例';
COMMENT ON COLUMN land_info.guideline        IS 'ガイドライン';

-- 2) 電柱番号 (3カラム) ※ #16
ALTER TABLE land_info
  ADD COLUMN IF NOT EXISTS pole_left   TEXT,
  ADD COLUMN IF NOT EXISTS pole_center TEXT,
  ADD COLUMN IF NOT EXISTS pole_right  TEXT;

COMMENT ON COLUMN land_info.pole_left   IS '電柱番号(左) - 電柱を正面に見て左側 例: 秋山354';
COMMENT ON COLUMN land_info.pole_center IS '電柱番号(中央)';
COMMENT ON COLUMN land_info.pole_right  IS '電柱番号(右)';

-- 3) ハザード10種フラグ (10カラム) ※ #18
-- BOOLEAN 3値: NULL=未調査, true=該当あり, false=該当なし
ALTER TABLE land_info
  ADD COLUMN IF NOT EXISTS hazard_flood_flag           BOOLEAN,
  ADD COLUMN IF NOT EXISTS hazard_landslide_flag       BOOLEAN,
  ADD COLUMN IF NOT EXISTS hazard_high_tide_flag       BOOLEAN,
  ADD COLUMN IF NOT EXISTS hazard_tsunami_flag         BOOLEAN,
  ADD COLUMN IF NOT EXISTS hazard_sabo_flag            BOOLEAN,
  ADD COLUMN IF NOT EXISTS hazard_river_flag           BOOLEAN,
  ADD COLUMN IF NOT EXISTS hazard_wildlife_flag        BOOLEAN,
  ADD COLUMN IF NOT EXISTS hazard_buried_culture_flag  BOOLEAN,
  ADD COLUMN IF NOT EXISTS hazard_national_park_flag   BOOLEAN,
  ADD COLUMN IF NOT EXISTS hazard_natural_env_flag     BOOLEAN;

COMMENT ON COLUMN land_info.hazard_flood_flag          IS 'ハザード:洪水 (NULL=未調査/true=あり/false=なし)';
COMMENT ON COLUMN land_info.hazard_landslide_flag      IS 'ハザード:土砂災害 (NULL/true/false)';
COMMENT ON COLUMN land_info.hazard_high_tide_flag      IS 'ハザード:高潮 (NULL/true/false)';
COMMENT ON COLUMN land_info.hazard_tsunami_flag        IS 'ハザード:津波 (NULL/true/false)';
COMMENT ON COLUMN land_info.hazard_sabo_flag           IS 'ハザード:砂防指定地 (NULL/true/false)';
COMMENT ON COLUMN land_info.hazard_river_flag          IS 'ハザード:河川区域/河川保全区域 (NULL/true/false)';
COMMENT ON COLUMN land_info.hazard_wildlife_flag       IS 'ハザード:鳥獣保護特別保護地区 (NULL/true/false)';
COMMENT ON COLUMN land_info.hazard_buried_culture_flag IS 'ハザード:埋蔵文化財包蔵地 (NULL/true/false) - 詳細は buried_culture_details';
COMMENT ON COLUMN land_info.hazard_national_park_flag  IS 'ハザード:国立公園/県立自然公園 (NULL/true/false)';
COMMENT ON COLUMN land_info.hazard_natural_env_flag    IS 'ハザード:県自然環境保全地域 (NULL/true/false)';

-- 4) 申請・届出 (3カラム) ※ #20
ALTER TABLE land_info
  ADD COLUMN IF NOT EXISTS application_flag    BOOLEAN,
  ADD COLUMN IF NOT EXISTS application_details TEXT,
  ADD COLUMN IF NOT EXISTS notification_flag   BOOLEAN;

COMMENT ON COLUMN land_info.application_flag    IS '申請の有無 (NULL/true/false)';
COMMENT ON COLUMN land_info.application_details IS '申請内容詳細';
COMMENT ON COLUMN land_info.notification_flag   IS '届出の有無 (NULL/true/false) - 詳細は notification_details';

-- =================================================================
-- 確認クエリ：land_info の全カラムを表示
-- =================================================================
SELECT
  ordinal_position AS seq,
  column_name,
  data_type,
  col_description(('public.'||table_name)::regclass, ordinal_position) AS comment
FROM information_schema.columns
WHERE table_schema='public' AND table_name='land_info'
ORDER BY ordinal_position;

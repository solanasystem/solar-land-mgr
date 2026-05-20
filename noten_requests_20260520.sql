-- ============================================================================
-- 農転確認資料 作成履歴テーブル
-- 用途: 各市区町村農業委員会への農地種別確認依頼文書の作成履歴を記録
-- 作成: 2026-05-20
-- ============================================================================

CREATE TABLE IF NOT EXISTS noten_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  city_name TEXT NOT NULL,                    -- 提出先市区町村名（例: 蒲郡市）
  case_ids UUID[] NOT NULL,                   -- 含まれる案件のIDリスト
  case_nos TEXT[],                            -- 案件番号リスト（例: ['中部-04', '中部-05']）
  document_data JSONB,                        -- 文書全データ（再表示用：宛名/差出人/各行データ等）
  created_by TEXT,                            -- 作成者名（任意）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE noten_requests IS '農地種別確認のお願い 作成履歴';
COMMENT ON COLUMN noten_requests.city_name IS '提出先市区町村名';
COMMENT ON COLUMN noten_requests.case_ids IS '含まれる案件UUID配列';
COMMENT ON COLUMN noten_requests.document_data IS '文書スナップショット（JSON）';

CREATE INDEX IF NOT EXISTS idx_noten_requests_created_at ON noten_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_noten_requests_city ON noten_requests(city_name);
CREATE INDEX IF NOT EXISTS idx_noten_requests_org ON noten_requests(organization_id);

-- RLS（XAMAX組織で全権限）
ALTER TABLE noten_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS noten_requests_select ON noten_requests;
CREATE POLICY noten_requests_select ON noten_requests
  FOR SELECT TO authenticated
  USING (organization_id = '00000000-0000-0000-0000-000000000001');

DROP POLICY IF EXISTS noten_requests_insert ON noten_requests;
CREATE POLICY noten_requests_insert ON noten_requests
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = '00000000-0000-0000-0000-000000000001');

DROP POLICY IF EXISTS noten_requests_update ON noten_requests;
CREATE POLICY noten_requests_update ON noten_requests
  FOR UPDATE TO authenticated
  USING (organization_id = '00000000-0000-0000-0000-000000000001');

DROP POLICY IF EXISTS noten_requests_delete ON noten_requests;
CREATE POLICY noten_requests_delete ON noten_requests
  FOR DELETE TO authenticated
  USING (organization_id = '00000000-0000-0000-0000-000000000001');

-- 確認クエリ
SELECT 'noten_requests テーブル作成完了' AS status,
       COUNT(*) AS existing_rows
FROM noten_requests;

-- ============================================================
-- SOLAR LAND MGR v20260516x: ステータス変更履歴システム
-- 目的：営業手法（手紙のみ／手紙→訪問／訪問のみ）別の SUCCESS 率分析
-- 実行先：Supabase SQL Editor
-- 実行日：2026-05-17
-- ============================================================

-- ============================================================
-- (1) case_status_history テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  old_status      TEXT,
  new_status      TEXT NOT NULL,
  trigger_source  TEXT NOT NULL DEFAULT 'manual',
  -- trigger_source の値（v20260516y: シンプル3種類）:
  --   'manual'           : UIで手動でステータス変更（その他の理由）
  --   'letter_print'     : 手紙印刷ボタンで LTR済 へ自動変更
  --   'visit_complete'   : 訪問完了として手動で変更
  --   'initial_snapshot' : 履歴開始時点の初期状態（既存案件用、システム自動）
  --   'auto'             : Trigger による自動記録（RPC経由でない直接UPDATE時のフォールバック）
  note            TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by      UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_csh_case_changed
  ON public.case_status_history(case_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_csh_org_changed
  ON public.case_status_history(organization_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_csh_trigger
  ON public.case_status_history(trigger_source);
CREATE INDEX IF NOT EXISTS idx_csh_new_status
  ON public.case_status_history(new_status);

-- ============================================================
-- (2) RLS（行レベルセキュリティ）
-- ============================================================
ALTER TABLE public.case_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csh_select_own_org" ON public.case_status_history;
CREATE POLICY "csh_select_own_org"
  ON public.case_status_history
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "csh_insert_own_org" ON public.case_status_history;
CREATE POLICY "csh_insert_own_org"
  ON public.case_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 履歴は基本的に削除しない（admin のみ削除可）
DROP POLICY IF EXISTS "csh_delete_admin_only" ON public.case_status_history;
CREATE POLICY "csh_delete_admin_only"
  ON public.case_status_history
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- (3) RPC関数: change_case_status
-- ステータス変更と履歴記録を1トランザクションで実行
-- 戻り値: 作成された履歴レコードの id（変更がなければ NULL）
-- ============================================================
DROP FUNCTION IF EXISTS public.change_case_status(UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.change_case_status(
  p_case_id        UUID,
  p_new_status     TEXT,
  p_trigger_source TEXT DEFAULT 'manual',
  p_note           TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_old_status TEXT;
  v_org_id     UUID;
  v_hist_id    UUID;
BEGIN
  -- 現在の status と organization_id を取得
  SELECT status, organization_id INTO v_old_status, v_org_id
    FROM public.cases WHERE id = p_case_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found: %', p_case_id USING ERRCODE = 'P0002';
  END IF;
  
  -- organization_id が空なら XAMAX をデフォルト
  IF v_org_id IS NULL THEN
    v_org_id := '00000000-0000-0000-0000-000000000001';
  END IF;
  
  -- 同じ値なら何もしない（連打防止）
  IF v_old_status IS NOT DISTINCT FROM p_new_status THEN
    RETURN NULL;
  END IF;
  
  -- status を UPDATE（Trigger は同タイミングの履歴を検知してスキップ）
  UPDATE public.cases 
    SET status = p_new_status, updated_at = NOW()
    WHERE id = p_case_id;
  
  -- 履歴 INSERT
  INSERT INTO public.case_status_history (
    case_id, organization_id, old_status, new_status,
    trigger_source, note, changed_by
  ) VALUES (
    p_case_id, v_org_id, v_old_status, p_new_status,
    COALESCE(p_trigger_source, 'manual'), p_note, auth.uid()
  ) RETURNING id INTO v_hist_id;
  
  RETURN v_hist_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.change_case_status(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- (4) Trigger: バックアップ用（直接UPDATEされた場合の自動記録）
-- RPC経由の場合は履歴が直前にINSERTされているのでスキップ
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_log_case_status_change() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- 直前1秒以内に同じ遷移の履歴があればスキップ（RPC経由の重複防止）
    IF NOT EXISTS (
      SELECT 1 FROM public.case_status_history
      WHERE case_id = NEW.id
        AND new_status = NEW.status
        AND changed_at > NOW() - INTERVAL '2 seconds'
    ) THEN
      INSERT INTO public.case_status_history (
        case_id, organization_id, old_status, new_status,
        trigger_source, changed_by
      ) VALUES (
        NEW.id, 
        COALESCE(NEW.organization_id, '00000000-0000-0000-0000-000000000001'), 
        OLD.status, NEW.status,
        'auto', auth.uid()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS cases_status_history_trigger ON public.cases;
CREATE TRIGGER cases_status_history_trigger
  AFTER UPDATE ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_case_status_change();

-- ============================================================
-- (5) 既存案件の現状を初期点として全件INSERT（履歴開始時点のスナップショット）
-- 重複防止：既に履歴がある case は対象外
-- ============================================================
INSERT INTO public.case_status_history (
  case_id, organization_id, old_status, new_status,
  trigger_source, note, changed_at
)
SELECT 
  c.id, 
  COALESCE(c.organization_id, '00000000-0000-0000-0000-000000000001'), 
  NULL,                                    -- old_status: 不明
  c.status,                                -- new_status: 現状
  'initial_snapshot',
  '履歴開始時点の初期状態（過去の遷移は記録されていません）',
  COALESCE(c.updated_at, c.created_at, NOW())
FROM public.cases c
WHERE c.status IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.case_status_history h WHERE h.case_id = c.id
  );

-- ============================================================
-- (6) 確認クエリ
-- ============================================================
SELECT 
  '✅ case_status_history セットアップ完了' AS result,
  (SELECT COUNT(*) FROM public.case_status_history) AS total_records,
  (SELECT COUNT(DISTINCT case_id) FROM public.case_status_history) AS unique_cases,
  (SELECT COUNT(*) FROM public.case_status_history WHERE trigger_source='initial_snapshot') AS initial_snapshots;

-- 内訳
SELECT 
  trigger_source, 
  COUNT(*) AS count,
  COUNT(DISTINCT case_id) AS unique_cases
FROM public.case_status_history
GROUP BY trigger_source
ORDER BY count DESC;

-- 現在のステータス別件数（初期スナップショット）
SELECT 
  new_status AS current_status,
  COUNT(*) AS count
FROM public.case_status_history
WHERE trigger_source = 'initial_snapshot'
GROUP BY new_status
ORDER BY count DESC;

-- ============================================================
-- (7) 営業分析用ビュー（Phase 3 で使用予定、今のうちに準備）
-- ============================================================

-- ビュー1: 各案件の「最初」と「最後」のステータス、所要日数
CREATE OR REPLACE VIEW public.v_case_status_summary AS
SELECT 
  c.id AS case_id,
  c.parent_case_no,
  c.case_no,
  c.area_name,
  c.status AS current_status,
  (SELECT MIN(changed_at) FROM public.case_status_history WHERE case_id = c.id) AS first_recorded_at,
  (SELECT MAX(changed_at) FROM public.case_status_history WHERE case_id = c.id) AS last_changed_at,
  EXTRACT(DAY FROM (
    (SELECT MAX(changed_at) FROM public.case_status_history WHERE case_id = c.id) -
    (SELECT MIN(changed_at) FROM public.case_status_history WHERE case_id = c.id)
  )) AS days_in_pipeline,
  -- 経過した手法フラグ
  EXISTS(SELECT 1 FROM public.case_status_history WHERE case_id = c.id AND trigger_source = 'letter_print') AS has_letter,
  EXISTS(SELECT 1 FROM public.case_status_history WHERE case_id = c.id AND trigger_source = 'visit_complete') AS has_visit,
  EXISTS(SELECT 1 FROM public.case_status_history WHERE case_id = c.id AND trigger_source = 'phone') AS has_phone,
  EXISTS(SELECT 1 FROM public.case_status_history WHERE case_id = c.id AND trigger_source = 'email') AS has_email,
  c.organization_id
FROM public.cases c
WHERE c.organization_id IN (
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
);

-- ビュー2: 営業手法別 成功率
CREATE OR REPLACE VIEW public.v_sales_method_success_rate AS
WITH method_combos AS (
  SELECT 
    case_id,
    current_status,
    CASE 
      WHEN has_letter AND has_visit THEN '手紙→訪問'
      WHEN has_letter AND NOT has_visit THEN '手紙のみ'
      WHEN NOT has_letter AND has_visit THEN '訪問のみ'
      WHEN has_phone OR has_email THEN 'その他'
      ELSE '未着手'
    END AS method_combo
  FROM public.v_case_status_summary
)
SELECT 
  method_combo,
  COUNT(*) AS total_cases,
  SUM(CASE WHEN current_status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN current_status = 'NG' THEN 1 ELSE 0 END) AS ng_count,
  ROUND(
    100.0 * SUM(CASE WHEN current_status = 'SUCCESS' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
    1
  ) AS success_rate_pct
FROM method_combos
GROUP BY method_combo
ORDER BY total_cases DESC;

-- 確認：ビューが作成されたか
SELECT '✅ 営業分析用ビュー作成完了 (v_case_status_summary / v_sales_method_success_rate)' AS view_status;

-- ============================================================
-- (8) 手紙営業特化 分析ビュー（v20260516z 追加）
-- ============================================================
-- 業務要件：
--   ・手紙投函からの応答日数分析
--   ・手紙営業の確率統計（応答率・成功率・カテゴリ別分布）
--   ・月別・エリア別の手紙効果トラッキング
-- 前提：letter-generator の印刷ボタン押下で trigger_source='letter_print' が記録される
-- ============================================================

-- 8-1. 手紙投函イベントごとの応答分析
--   各「LETTER → LTR済」変更の後、次に発生したステータス変更を探して
--   経過日数・応答内容・応答カテゴリを算出
CREATE OR REPLACE VIEW public.v_letter_response_analysis AS
WITH letter_events AS (
  SELECT 
    h.id AS letter_history_id,
    h.case_id,
    h.changed_at AS letter_sent_at,
    h.organization_id
  FROM public.case_status_history h
  WHERE h.trigger_source = 'letter_print'
    AND h.new_status = 'LTR済'
)
SELECT 
  le.letter_history_id,
  le.case_id,
  c.parent_case_no,
  c.case_no,
  c.display_case_no,
  c.area_name,
  c.status AS current_status,
  c.price,
  le.letter_sent_at,
  next_chg.changed_at AS responded_at,
  next_chg.new_status AS response_status,
  next_chg.trigger_source AS response_trigger,
  next_chg.note AS response_note,
  /* 経過日数（応答未定の場合は現在までの日数） */
  CASE 
    WHEN next_chg.changed_at IS NULL THEN
      EXTRACT(DAY FROM (NOW() - le.letter_sent_at))::INT
    ELSE
      EXTRACT(DAY FROM (next_chg.changed_at - le.letter_sent_at))::INT
  END AS days_since_letter,
  /* 応答カテゴリ */
  CASE 
    WHEN next_chg.changed_at IS NULL                       THEN '応答待ち'
    WHEN next_chg.new_status = 'SUCCESS'                   THEN '成功'
    WHEN next_chg.new_status = 'OK'                        THEN '成功手前'
    WHEN next_chg.new_status = 'THINKING↑'                 THEN '前向き'
    WHEN next_chg.new_status IN ('THINKING→','THINKING↓')  THEN '検討中'
    WHEN next_chg.new_status = 'NG'                        THEN 'NG'
    WHEN next_chg.new_status = 'NON MEET'                  THEN '会えず'
    WHEN next_chg.new_status = 'UNKNOWN'                   THEN '不明'
    ELSE 'その他'
  END AS response_category,
  /* 応答スピードのバケット */
  CASE
    WHEN next_chg.changed_at IS NULL                                       THEN '応答待ち'
    WHEN EXTRACT(DAY FROM (next_chg.changed_at - le.letter_sent_at)) <= 7  THEN 'A: 〜7日'
    WHEN EXTRACT(DAY FROM (next_chg.changed_at - le.letter_sent_at)) <= 14 THEN 'B: 8〜14日'
    WHEN EXTRACT(DAY FROM (next_chg.changed_at - le.letter_sent_at)) <= 30 THEN 'C: 15〜30日'
    WHEN EXTRACT(DAY FROM (next_chg.changed_at - le.letter_sent_at)) <= 60 THEN 'D: 31〜60日'
    ELSE 'E: 61日超'
  END AS response_speed_bucket,
  le.organization_id
FROM letter_events le
JOIN public.cases c ON c.id = le.case_id
LEFT JOIN LATERAL (
  SELECT h2.changed_at, h2.new_status, h2.trigger_source, h2.note
  FROM public.case_status_history h2
  WHERE h2.case_id = le.case_id
    AND h2.changed_at > le.letter_sent_at
  ORDER BY h2.changed_at ASC
  LIMIT 1
) next_chg ON TRUE;

-- 8-2. 手紙営業 総合サマリー
CREATE OR REPLACE VIEW public.v_letter_summary AS
SELECT 
  COUNT(*) AS total_letters_sent,
  COUNT(*) FILTER (WHERE responded_at IS NOT NULL) AS responded_count,
  COUNT(*) FILTER (WHERE responded_at IS NULL) AS pending_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE responded_at IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS response_rate_pct,
  COUNT(*) FILTER (WHERE response_category = '成功') AS success_count,
  COUNT(*) FILTER (WHERE response_category = '成功手前') AS ok_count,
  COUNT(*) FILTER (WHERE response_category = '前向き') AS positive_count,
  COUNT(*) FILTER (WHERE response_category = 'NG') AS ng_count,
  COUNT(*) FILTER (WHERE response_category = '会えず') AS non_meet_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE response_category = '成功') / NULLIF(COUNT(*), 0), 1) AS overall_success_rate_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE response_category IN ('成功','成功手前','前向き')) / NULLIF(COUNT(*), 0), 1) AS positive_reply_rate_pct,
  ROUND(AVG(days_since_letter) FILTER (WHERE responded_at IS NOT NULL), 1) AS avg_response_days,
  ROUND(STDDEV_POP(days_since_letter::numeric) FILTER (WHERE responded_at IS NOT NULL), 1) AS stddev_response_days,
  MIN(days_since_letter) FILTER (WHERE responded_at IS NOT NULL) AS min_response_days,
  MAX(days_since_letter) FILTER (WHERE responded_at IS NOT NULL) AS max_response_days,
  organization_id
FROM public.v_letter_response_analysis
GROUP BY organization_id;

-- 8-3. 月別 手紙営業効果
CREATE OR REPLACE VIEW public.v_letter_monthly_stats AS
SELECT 
  TO_CHAR(letter_sent_at, 'YYYY-MM') AS month,
  COUNT(*) AS letters_sent,
  COUNT(*) FILTER (WHERE responded_at IS NOT NULL) AS responded,
  COUNT(*) FILTER (WHERE response_category = '成功') AS success,
  COUNT(*) FILTER (WHERE response_category IN ('成功','成功手前','前向き')) AS positive_replies,
  COUNT(*) FILTER (WHERE response_category = 'NG') AS ng_replies,
  ROUND(100.0 * COUNT(*) FILTER (WHERE responded_at IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS response_rate_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE response_category = '成功') / NULLIF(COUNT(*), 0), 1) AS success_rate_pct,
  ROUND(AVG(days_since_letter) FILTER (WHERE responded_at IS NOT NULL), 1) AS avg_response_days,
  organization_id
FROM public.v_letter_response_analysis
GROUP BY TO_CHAR(letter_sent_at, 'YYYY-MM'), organization_id
ORDER BY month DESC;

-- 8-4. 応答カテゴリ別分布（円グラフ用）
CREATE OR REPLACE VIEW public.v_letter_response_distribution AS
SELECT 
  response_category,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY organization_id), 1) AS pct,
  ROUND(AVG(days_since_letter)::numeric, 1) AS avg_days,
  organization_id
FROM public.v_letter_response_analysis
GROUP BY response_category, organization_id
ORDER BY 
  CASE response_category
    WHEN '成功' THEN 1
    WHEN '成功手前' THEN 2
    WHEN '前向き' THEN 3
    WHEN '検討中' THEN 4
    WHEN '会えず' THEN 5
    WHEN 'NG' THEN 6
    WHEN '不明' THEN 7
    WHEN '応答待ち' THEN 8
    ELSE 9
  END;

-- 8-5. 応答スピード分布（手紙の効果の "速さ" を可視化）
CREATE OR REPLACE VIEW public.v_letter_response_speed_buckets AS
SELECT 
  response_speed_bucket,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE response_category = '成功') AS success_count,
  COUNT(*) FILTER (WHERE response_category IN ('成功','成功手前','前向き')) AS positive_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY organization_id), 1) AS pct,
  organization_id
FROM public.v_letter_response_analysis
WHERE responded_at IS NOT NULL OR response_speed_bucket != '応答待ち'
GROUP BY response_speed_bucket, organization_id
ORDER BY response_speed_bucket;

-- 8-6. エリア別 手紙営業効果
CREATE OR REPLACE VIEW public.v_letter_area_stats AS
SELECT 
  COALESCE(area_name, '(エリア未設定)') AS area_name,
  COUNT(*) AS letters_sent,
  COUNT(*) FILTER (WHERE responded_at IS NOT NULL) AS responded,
  COUNT(*) FILTER (WHERE response_category = '成功') AS success,
  ROUND(100.0 * COUNT(*) FILTER (WHERE responded_at IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS response_rate_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE response_category = '成功') / NULLIF(COUNT(*), 0), 1) AS success_rate_pct,
  ROUND(AVG(days_since_letter) FILTER (WHERE responded_at IS NOT NULL), 1) AS avg_response_days,
  organization_id
FROM public.v_letter_response_analysis
GROUP BY area_name, organization_id
ORDER BY letters_sent DESC;

-- ============================================================
-- 完了
-- ============================================================
SELECT '🎉 ステータス履歴 + 手紙営業分析システム セットアップ完了！' AS done,
       '次の手順: HTML 3ファイル(main.html / letter-generator.html / version.json) を GitHub にアップロード → F5' AS next_step;

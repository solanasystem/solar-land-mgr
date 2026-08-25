-- ============================================================================
-- case_proposals: 判定(judgment)列の追加 + クライアント(anon)からの読み書き許可 + FK緩和
--   2026-08-25 ドクター指示 / SUNトラスト報告 ①③ の恒久対処。
--
--   背景(なぜマップのOK/NGが保存されず、案件マスターに反映されなかったか):
--     (1) RLS: case_proposals のポリシーは authenticated(自社ログイン)のみ許可だった。
--         クライアント画面(マップ/ステータス管理/案件マスター)は anon キーで接続するため、
--         書き込みが全てRLSで拒否 → フロントは保存失敗→フラグ色が変わらなかった。
--     (2) FK: case_id は cases(id) を参照するFK付き。だが画面は case_id に
--         client_delivery_items.id を入れているため、FK違反で弾かれ得た。
--     (3) 判定列が無かった: OK/NG を status に入れるとステータス管理のカスタム値と衝突した。
--         → 判定専用の judgment 列を新設し、そこだけを共有する。
--
--   実行者: ドクター(Supabase SQL Editor)。実行は冪等(何度流しても安全)。
-- ============================================================================

-- ① 判定専用カラム（'OK' / 'NG' / NULL=未判定）。status(カスタムステータス)とは別軸。
alter table public.case_proposals add column if not exists judgment text;

-- ② case_id の外部キー制約を外す（case_id は client_delivery_items.id を汎用参照として使うため）。
--    制約名は環境差があり得るので、存在すれば落とす形にする。
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.case_proposals'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%case_id%references%'
  loop
    execute format('alter table public.case_proposals drop constraint %I;', c);
  end loop;
end $$;

-- ③ クライアント(anon)からの読み書きを許可するRLSポリシーを追加。
--    ※現状は1社(SUNトラスト)運用のため anon 全許可。
--    ★2社目を入れる前に、必ず client_id で行を分離するRLSへ差し替えること（運用者ブラインドの前提）。
drop policy if exists case_proposals_client_rw on public.case_proposals;
create policy case_proposals_client_rw
  on public.case_proposals
  for all
  to anon
  using (true)
  with check (true);

-- 参考: 反映確認
-- select column_name from information_schema.columns
--   where table_name='case_proposals' and column_name='judgment';
-- select polname, roles from pg_policies where tablename='case_proposals';

-- =============================================
-- villa_place_names 1件削除用 RPC
-- フロントエンドから NG ボタンで呼び出す
-- SECURITY DEFINER で RLS を回避
-- =============================================

CREATE OR REPLACE FUNCTION public.delete_villa_by_id(p_id integer)
RETURNS jsonb
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted record;
BEGIN
  DELETE FROM public.villa_place_names 
  WHERE id = p_id
  RETURNING id, name, pref_name INTO v_deleted;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'id', v_deleted.id,
    'name', v_deleted.name,
    'pref_name', v_deleted.pref_name
  );
END;
$$;

-- フロントエンドのanon/authenticatedロールに実行権限
GRANT EXECUTE ON FUNCTION public.delete_villa_by_id(integer) TO anon, authenticated;

-- 動作確認用（存在しないIDなのでnot_foundが返るはず）
-- SELECT public.delete_villa_by_id(99999);

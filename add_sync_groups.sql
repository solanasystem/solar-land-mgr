-- ============================================
-- 同期グループ機能追加 SQL (2026-05-15)
-- setting_items_master に sync_group カラムを追加し
-- 13グループの連動関係を設定する
-- ============================================

-- Step 1: カラム追加
ALTER TABLE setting_items_master ADD COLUMN IF NOT EXISTS sync_group TEXT;

-- Step 2: 13グループの設定

-- G1: 地権者氏名（3項目連動）
UPDATE setting_items_master SET sync_group = 'g_owner_name'
WHERE item_key IN ('landowner_name', 'owner_master_name', 'land_master_owner_name');

-- G2: TEL（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_tel'
WHERE item_key IN ('landowner_tel', 'owner_master_tel');

-- G3: 住所（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_address'
WHERE item_key IN ('landowner_address', 'owner_master_address');

-- G4: 価格（3項目連動）
UPDATE setting_items_master SET sync_group = 'g_price'
WHERE item_key IN ('landowner_price', 'owner_master_price', 'land_master_price');

-- G5: メモ（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_memo'
WHERE item_key IN ('landowner_memo', 'owner_master_memo');

-- G6: 面積（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_area'
WHERE item_key IN ('land_area', 'land_master_area');

-- G7: 地目（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_chimoku'
WHERE item_key IN ('land_chimoku', 'land_master_chimoku');

-- G8: 所在（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_location'
WHERE item_key IN ('land_location', 'land_master_location');

-- G9: 垂直積雪量（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_snow_load'
WHERE item_key IN ('land_snow_load', 'land_master_snow_load');

-- G10: 農地種別（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_farmland_type'
WHERE item_key IN ('land_farmland_type', 'land_master_farmland_type');

-- G11: ハザード（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_hazard'
WHERE item_key IN ('land_hazard', 'land_master_hazard');

-- G12: 備考（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_remarks'
WHERE item_key IN ('land_remarks', 'land_master_remarks');

-- G13: 不動産会社（2項目連動）
UPDATE setting_items_master SET sync_group = 'g_realestate'
WHERE item_key IN ('land_realestate_info', 'land_master_realestate');

-- Step 3: 確認SQL
SELECT
  sync_group,
  COUNT(*) AS items,
  STRING_AGG(display_order::text || '.' || display_name_ja, ' / ' ORDER BY display_order) AS members
FROM setting_items_master
WHERE sync_group IS NOT NULL
GROUP BY sync_group
ORDER BY sync_group;
-- 期待: 13行、合計27項目（3+2+2+3+2+2+2+2+2+2+2+2+2 = 28、実際は g_owner_name=3, g_price=3 で残り11個が2項目 = 3+3+11*2 = 28）

-- 連動対象外の項目を確認
SELECT
  display_order, item_key, display_name_ja, category_large
FROM setting_items_master
WHERE sync_group IS NULL
ORDER BY display_order;
-- 期待: 26項目（54 - 28 = 26）が独立扱い

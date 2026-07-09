-- ============================================================================
-- v20260709i: registry-docs Storage に HEIC/HEIF を追加
-- iPhone デフォルト形式の受入対応
-- 実際は Chrome 側で JPEG 変換してからアップロードするが、
-- 万一 heic のまま届いた場合の保険として、また今後 iOS Safari 対応のため
-- ============================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]
WHERE id = 'registry-docs';

-- 確認
SELECT id, name, allowed_mime_types, file_size_limit
FROM storage.buckets
WHERE id = 'registry-docs';

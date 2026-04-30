
INSERT INTO storage.buckets (id, name, public)
VALUES ('trend-search-images', 'trend-search-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Trend search images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'trend-search-images');

CREATE POLICY "Users can upload trend search images to their folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trend-search-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own trend search images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'trend-search-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own trend search images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'trend-search-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

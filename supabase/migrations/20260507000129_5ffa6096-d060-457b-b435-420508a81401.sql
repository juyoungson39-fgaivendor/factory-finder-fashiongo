CREATE POLICY "Authenticated users can upload product photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'factory-photos'
  AND (storage.foldername(name))[1] = 'products'
);

CREATE POLICY "Authenticated users can update product photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'factory-photos'
  AND (storage.foldername(name))[1] = 'products'
)
WITH CHECK (
  bucket_id = 'factory-photos'
  AND (storage.foldername(name))[1] = 'products'
);
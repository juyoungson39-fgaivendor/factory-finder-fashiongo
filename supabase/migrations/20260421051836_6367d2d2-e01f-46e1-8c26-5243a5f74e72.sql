-- 1. Tighten factory_scores SELECT to owner-only
DROP POLICY IF EXISTS "Authenticated users can select factory scores" ON public.factory_scores;

CREATE POLICY "Users can select scores for own factories"
ON public.factory_scores
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.factories
    WHERE factories.id = factory_scores.factory_id
      AND factories.user_id = auth.uid()
  )
);

-- 2. Enforce ownership on ai-generated-images uploads (path must start with auth.uid())
DROP POLICY IF EXISTS "Users can upload to ai-generated-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload ai images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload ai-generated-images" ON storage.objects;
DROP POLICY IF EXISTS "ai_generated_images_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "ai_generated_images_update_own" ON storage.objects;
DROP POLICY IF EXISTS "ai_generated_images_delete_own" ON storage.objects;

CREATE POLICY "ai_generated_images_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ai-generated-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "ai_generated_images_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ai-generated-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'ai-generated-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "ai_generated_images_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ai-generated-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
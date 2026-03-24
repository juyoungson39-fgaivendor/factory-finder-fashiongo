
-- Create storage bucket for AI generated images
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-generated-images', 'ai-generated-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload ai images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ai-generated-images');

-- Allow public read
CREATE POLICY "Public can read ai images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'ai-generated-images');

-- Allow authenticated users to update/delete their images
CREATE POLICY "Authenticated users can manage ai images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ai-generated-images');

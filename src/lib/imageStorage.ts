import { supabase } from '@/integrations/supabase/client';

/**
 * Upload a base64 data URL to Supabase storage and return the public URL.
 * Falls back to returning the original base64 if upload fails.
 */
export async function uploadBase64Image(
  base64DataUrl: string,
  folder: string,
  fileName: string
): Promise<string> {
  try {
    // If it's already a regular URL (not base64), return as-is
    if (!base64DataUrl.startsWith('data:')) return base64DataUrl;

    const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return base64DataUrl;

    const mimeType = match[1];
    const ext = mimeType.split('/')[1] || 'png';
    const raw = atob(match[2]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });

    const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
    // Path must start with the user's UID to satisfy storage RLS ownership check.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('Image upload requires an authenticated user');
      return base64DataUrl;
    }
    const path = `${user.id}/${folder}/${safeName}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('ai-generated-images')
      .upload(path, blob, { contentType: mimeType, upsert: true });

    if (error) {
      console.error('Image upload failed:', error);
      return base64DataUrl;
    }

    const { data: urlData } = supabase.storage
      .from('ai-generated-images')
      .getPublicUrl(path);

    return urlData.publicUrl;
  } catch (err) {
    console.error('uploadBase64Image error:', err);
    return base64DataUrl;
  }
}

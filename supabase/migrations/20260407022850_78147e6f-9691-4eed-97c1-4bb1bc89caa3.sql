UPDATE trend_analyses
SET source_data = jsonb_set(source_data, '{image_url}', 
  CASE source_data->>'magazine_name'
    WHEN 'Vogue US' THEN '"https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=500&fit=crop"'
    WHEN 'Elle US' THEN '"https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=500&fit=crop"'
    WHEN 'WWD' THEN '"https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=500&fit=crop"'
    WHEN 'Hypebeast' THEN '"https://images.unsplash.com/photo-1556906781-9a412961c28c?w=400&h=500&fit=crop"'
    WHEN 'Highsnobiety' THEN '"https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=500&fit=crop"'
    WHEN 'Footwear News' THEN '"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=500&fit=crop"'
    ELSE '"https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop"'
  END::jsonb
)
WHERE source_data->>'platform' = 'magazine'
  AND (source_data->>'image_url' IS NULL OR source_data->>'image_url' = '');
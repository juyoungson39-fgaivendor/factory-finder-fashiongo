import { useState, useEffect } from 'react';
import { fetchOGImage } from '@/services/ogImage';

export interface TrendArticle {
  url: string;
  publisher: string;
}

export function useTrendImage(articles: TrendArticle[], fallbackImage: string) {
  const [imageUrl, setImageUrl] = useState<string>(fallbackImage);
  const [publisher, setPublisher] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadImage() {
      for (const article of articles) {
        const og = await fetchOGImage(article.url);
        if (!cancelled && og?.image) {
          setImageUrl(og.image);
          setPublisher(article.publisher);
          setIsFallback(false);
          setLoading(false);
          return;
        }
      }
      if (!cancelled) {
        setImageUrl(fallbackImage);
        setIsFallback(true);
        setLoading(false);
      }
    }

    loadImage();
    return () => { cancelled = true; };
  }, [articles, fallbackImage]);

  return { imageUrl, publisher, loading, isFallback };
}

interface OGData {
  title: string;
  description: string;
  image: string | null;
  url: string;
  publisher: string;
}

const cache = new Map<string, OGData | null>();

export async function fetchOGImage(articleUrl: string): Promise<OGData | null> {
  if (cache.has(articleUrl)) return cache.get(articleUrl)!;

  try {
    const res = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(articleUrl)}`
    );
    const { data } = await res.json();
    const result: OGData = {
      title: data?.title || '',
      description: data?.description || '',
      image: data?.image?.url || null,
      url: data?.url || articleUrl,
      publisher: data?.publisher || '',
    };
    cache.set(articleUrl, result);
    return result;
  } catch {
    cache.set(articleUrl, null);
    return null;
  }
}

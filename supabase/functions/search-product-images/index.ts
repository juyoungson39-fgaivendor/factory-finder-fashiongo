import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BLOCKED_PATTERNS = [
  "logo", "icon", "banner", "sprite", "placeholder", "avatar",
  "fg_loading", "favicon", "button", "arrow", "social",
];

function isGoodImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (BLOCKED_PATTERNS.some((p) => lower.includes(p))) return false;
  if (!lower.match(/\.(jpg|jpeg|png|webp)$/i)) return false;
  // Prefer larger images (URLs often hint at size)
  if (lower.includes("thumb") && !lower.includes("large")) return false;
  return true;
}

async function findProductImage(
  brand: string,
  productName: string,
  firecrawlKey: string
): Promise<string | null> {
  const query = `${brand} ${productName} wholesale fashion`.trim();
  console.log(`  Query: ${query}`);

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({ query, limit: 5 }),
    });

    if (res.status === 429) {
      console.log("  Rate limited, waiting 5s...");
      await new Promise((r) => setTimeout(r, 5000));
      return null;
    }
    if (!res.ok) {
      console.log(`  Search failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const results = data.data || [];

    // Priority 1: FashionGo CDN images
    for (const result of results) {
      const allText = JSON.stringify(result);
      const fgMatches = allText.match(
        /https?:\/\/img\.fashiongo\.net[^\s"')\],}]+\.(jpg|jpeg|png|webp)/gi
      ) || [];
      if (fgMatches.length > 0) {
        const good = fgMatches.find((u: string) => isGoodImageUrl(u));
        if (good) {
          console.log(`  ✅ FG CDN: ${good}`);
          return good;
        }
      }
    }

    // Priority 2: ogImage from any result  
    for (const result of results) {
      const ogImage = result.metadata?.ogImage;
      if (ogImage && isGoodImageUrl(ogImage)) {
        console.log(`  ✅ ogImage: ${ogImage}`);
        return ogImage;
      }
    }

    // Priority 3: Any product image from markdown
    for (const result of results) {
      const markdown = result.markdown || "";
      const imgMatches = markdown.match(
        /https?:\/\/[^\s"')\]]+\.(jpg|jpeg|png|webp)/gi
      ) || [];
      const good = imgMatches.find((u: string) => isGoodImageUrl(u));
      if (good) {
        console.log(`  ✅ Extracted: ${good}`);
        return good;
      }
    }
  } catch (err) {
    console.error(`  Error: ${err}`);
  }

  // Retry with shorter query
  try {
    const shortQuery = `"${productName}" fashion image`;
    console.log(`  Retry: ${shortQuery}`);
    const res2 = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({ query: shortQuery, limit: 3 }),
    });

    if (res2.ok) {
      const data2 = await res2.json();
      for (const result of (data2.data || [])) {
        const ogImage = result.metadata?.ogImage;
        if (ogImage && isGoodImageUrl(ogImage)) {
          console.log(`  ✅ Retry ogImage: ${ogImage}`);
          return ogImage;
        }
        const allText = JSON.stringify(result);
        const imgs = allText.match(
          /https?:\/\/[^\s"')\],}]+\.(jpg|jpeg|png|webp)/gi
        ) || [];
        const good = imgs.find((u: string) => isGoodImageUrl(u));
        if (good) {
          console.log(`  ✅ Retry extracted: ${good}`);
          return good;
        }
      }
    }
  } catch {}

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) {
    return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const limit = body.limit ?? 40;
    const dryRun = body.dryRun ?? false;

    const { data: products, error: fetchError } = await supabase
      .from("products")
      .select("id, brand, name, image_url")
      .or("image_url.is.null,image_url.eq.")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) throw new Error(`DB: ${fetchError.message}`);
    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ message: "No products without images", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${products.length} products`);
    const results: Array<{ id: string; name: string; status: string; imageUrl?: string }> = [];

    for (const product of products) {
      console.log(`\n[${product.brand}] ${product.name}`);
      const imageUrl = await findProductImage(product.brand || "", product.name, FIRECRAWL_API_KEY);

      if (imageUrl) {
        if (!dryRun) {
          await supabase.from("products").update({ image_url: imageUrl }).eq("id", product.id);
        }
        results.push({ id: product.id, name: product.name, status: dryRun ? "found" : "updated", imageUrl });
      } else {
        results.push({ id: product.id, name: product.name, status: "not_found" });
        console.log(`  ❌ No image found`);
      }
      await new Promise((r) => setTimeout(r, 1200));
    }

    const updated = results.filter((r) => r.status === "updated" || r.status === "found").length;
    return new Response(
      JSON.stringify({ total: products.length, updated, notFound: products.length - updated, dryRun, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

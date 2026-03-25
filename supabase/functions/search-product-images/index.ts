import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function searchFashionGoImage(
  brand: string,
  productName: string,
  firecrawlKey: string
): Promise<string | null> {
  // Strategy 1: Firecrawl search without site restriction
  const queries = [
    `fashiongo ${brand} ${productName}`,
    `fashiongo.net "${productName}"`,
    `${brand} ${productName} wholesale`,
  ];

  for (const query of queries) {
    try {
      console.log(`  Trying query: ${query}`);
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firecrawlKey}`,
        },
        body: JSON.stringify({ query, limit: 5 }),
      });

      if (res.status === 429) {
        console.log("  Rate limited, waiting 3s...");
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      if (!res.ok) continue;

      const data = await res.json();
      const results = data.data || [];

      for (const result of results) {
        const metadata = result.metadata || {};
        const markdown = result.markdown || "";
        const url = result.url || "";

        // Check if this is a FashionGo page with an og:image
        if (url.includes("fashiongo") && metadata.ogImage) {
          console.log(`  Found ogImage from FG page: ${metadata.ogImage}`);
          return metadata.ogImage;
        }

        // Look for FashionGo CDN image URLs
        const fgCdnMatches = (markdown + " " + JSON.stringify(metadata)).match(
          /https?:\/\/[^\s"')\]]+images\.fashiongo\.net[^\s"')\]]+\.(jpg|jpeg|png|webp)/gi
        ) || [];
        if (fgCdnMatches.length > 0) {
          const best = fgCdnMatches.find(
            (u: string) => u.includes("/images/") || u.includes("/product")
          ) || fgCdnMatches[0];
          console.log(`  Found FG CDN image: ${best}`);
          return best;
        }

        // Any ogImage from a wholesale/product page
        if (
          metadata.ogImage &&
          !metadata.ogImage.includes("logo") &&
          !metadata.ogImage.includes("favicon") &&
          (url.includes("wholesale") || url.includes("product") || url.includes("fashiongo"))
        ) {
          console.log(`  Found ogImage from related page: ${metadata.ogImage}`);
          return metadata.ogImage;
        }
      }

      // Slight delay between queries
      await new Promise((r) => setTimeout(r, 800));
    } catch (err) {
      console.error(`  Query failed: ${err}`);
    }
  }

  // Strategy 2: Try scraping FashionGo search page directly
  try {
    const searchUrl = `https://www.fashiongo.net/search?q=${encodeURIComponent(
      (brand || "") + " " + productName
    )}`;
    console.log(`  Scraping FG search: ${searchUrl}`);

    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ["markdown"],
        waitFor: 3000,
      }),
    });

    if (scrapeRes.ok) {
      const scrapeData = await scrapeRes.json();
      const markdown = scrapeData.data?.markdown || "";

      // Extract image URLs from the scraped page
      const imgMatches = markdown.match(
        /https?:\/\/[^\s"')\]]+\.(jpg|jpeg|png|webp)/gi
      ) || [];

      // Filter for product-like images (not logos, icons, etc.)
      const productImgs = imgMatches.filter(
        (u: string) =>
          !u.includes("logo") &&
          !u.includes("icon") &&
          !u.includes("banner") &&
          !u.includes("sprite") &&
          !u.includes("placeholder") &&
          (u.includes("product") || u.includes("images") || u.includes("img") || u.includes("photo"))
      );

      if (productImgs.length > 0) {
        console.log(`  Found from FG scrape: ${productImgs[0]}`);
        return productImgs[0];
      }
    }
  } catch (err) {
    console.error(`  FG scrape failed: ${err}`);
  }

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

    // Fetch products without images
    const { data: products, error: fetchError } = await supabase
      .from("products")
      .select("id, brand, name, image_url")
      .or("image_url.is.null,image_url.eq.")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) throw new Error(`DB fetch error: ${fetchError.message}`);
    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ message: "No products without images", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${products.length} products without images`);

    const results: Array<{ id: string; name: string; brand: string; status: string; imageUrl?: string }> = [];

    for (const product of products) {
      console.log(`\n--- Processing: ${product.brand} - ${product.name} ---`);

      const imageUrl = await searchFashionGoImage(
        product.brand || "",
        product.name,
        FIRECRAWL_API_KEY
      );

      if (imageUrl) {
        if (!dryRun) {
          const { error: updateError } = await supabase
            .from("products")
            .update({ image_url: imageUrl })
            .eq("id", product.id);

          if (updateError) {
            console.error(`Update failed for ${product.id}: ${updateError.message}`);
            results.push({ id: product.id, name: product.name, brand: product.brand || "", status: "update_failed" });
            continue;
          }
        }
        results.push({ id: product.id, name: product.name, brand: product.brand || "", status: dryRun ? "found" : "updated", imageUrl });
        console.log(`✅ Updated: ${product.name}`);
      } else {
        results.push({ id: product.id, name: product.name, brand: product.brand || "", status: "not_found" });
        console.log(`❌ Not found: ${product.name}`);
      }

      // Delay between products
      await new Promise((r) => setTimeout(r, 1500));
    }

    const updated = results.filter((r) => r.status === "updated" || r.status === "found").length;
    const notFound = results.filter((r) => r.status === "not_found").length;

    return new Response(
      JSON.stringify({ total: products.length, updated, notFound, dryRun, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

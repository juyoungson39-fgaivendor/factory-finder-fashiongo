import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const results: Array<{ id: string; name: string; status: string; imageUrl?: string }> = [];

    for (const product of products) {
      const searchQuery = `site:fashiongo.net ${product.brand || ""} ${product.name}`.trim();
      console.log(`Searching: ${searchQuery}`);

      try {
        // Use Firecrawl search to find FashionGo product pages
        const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 3,
          }),
        });

        if (!searchRes.ok) {
          const errText = await searchRes.text();
          console.error(`Firecrawl search failed (${searchRes.status}): ${errText}`);
          
          // If rate limited, try a simpler Google-based approach
          if (searchRes.status === 429) {
            console.log("Rate limited, waiting 2s...");
            await new Promise((r) => setTimeout(r, 2000));
          }

          results.push({ id: product.id, name: product.name, status: "search_failed" });
          continue;
        }

        const searchData = await searchRes.json();
        const searchResults = searchData.data || [];

        // Extract image from search results
        let imageUrl: string | null = null;

        for (const result of searchResults) {
          // Check if there's a FashionGo product URL
          const url = result.url || "";
          const markdown = result.markdown || "";
          const metadata = result.metadata || {};

          // Try og:image or metadata image first
          if (metadata.ogImage && metadata.ogImage.includes("fashiongo")) {
            imageUrl = metadata.ogImage;
            break;
          }

          // Look for FashionGo image URLs in content
          const fgImageMatches = markdown.match(
            /https?:\/\/[^\s"')]+\.fashiongo\.net\/[^\s"')]+\.(jpg|jpeg|png|webp)/gi
          ) || [];

          if (fgImageMatches.length > 0) {
            // Prefer product images over thumbnails
            const productImg = fgImageMatches.find(
              (u: string) => u.includes("/product") || u.includes("/Product")
            );
            imageUrl = productImg || fgImageMatches[0];
            break;
          }

          // Also check sourceURL in metadata
          if (metadata.sourceURL && metadata.sourceURL.includes("fashiongo.net")) {
            // Try to construct image URL from the page
            const pageMatch = url.match(/\/product\/(\d+)/);
            if (pageMatch) {
              imageUrl = `https://images.fashiongo.net/product/${pageMatch[1]}.jpg`;
              break;
            }
          }
        }

        // Fallback: try Google Image search for FashionGo product
        if (!imageUrl) {
          const googleQuery = `fashiongo.net ${product.brand || ""} ${product.name}`.trim();
          const googleSearchRes = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            },
            body: JSON.stringify({
              query: googleQuery,
              limit: 5,
            }),
          });

          if (googleSearchRes.ok) {
            const googleData = await googleSearchRes.json();
            const googleResults = googleData.data || [];

            for (const result of googleResults) {
              const markdown = result.markdown || "";
              const metadata = result.metadata || {};

              if (metadata.ogImage) {
                imageUrl = metadata.ogImage;
                break;
              }

              // Extract any product-like image URL
              const imgMatches = markdown.match(
                /https?:\/\/[^\s"')]+\.(jpg|jpeg|png|webp)/gi
              ) || [];
              const productImg = imgMatches.find(
                (u: string) =>
                  u.includes("fashiongo") ||
                  u.includes("product") ||
                  (u.includes("img") && !u.includes("logo") && !u.includes("icon"))
              );
              if (productImg) {
                imageUrl = productImg;
                break;
              }
            }
          }
        }

        if (imageUrl) {
          if (!dryRun) {
            const { error: updateError } = await supabase
              .from("products")
              .update({ image_url: imageUrl })
              .eq("id", product.id);

            if (updateError) {
              console.error(`Update failed for ${product.id}: ${updateError.message}`);
              results.push({ id: product.id, name: product.name, status: "update_failed" });
              continue;
            }
          }
          results.push({ id: product.id, name: product.name, status: "updated", imageUrl });
          console.log(`✅ ${product.name} → ${imageUrl}`);
        } else {
          results.push({ id: product.id, name: product.name, status: "not_found" });
          console.log(`❌ ${product.name} — no image found`);
        }

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Error processing ${product.name}:`, err);
        results.push({ id: product.id, name: product.name, status: "error" });
      }
    }

    const updated = results.filter((r) => r.status === "updated").length;
    const notFound = results.filter((r) => r.status === "not_found").length;

    return new Response(
      JSON.stringify({
        total: products.length,
        updated,
        notFound,
        failed: products.length - updated - notFound,
        results,
      }),
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

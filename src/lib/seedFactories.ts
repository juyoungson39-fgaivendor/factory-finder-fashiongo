import { supabase } from "@/integrations/supabase/client";
import { SEED_FACTORIES } from "@/data/factories";

let seeded = false;

export const seedFactoriesIfNeeded = async () => {
  if (seeded) return;
  seeded = true;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { count } = await supabase
      .from('factories')
      .select('*', { count: 'exact', head: true });

    // If user already has all factories, skip
    if (count !== null && count >= SEED_FACTORIES.length) return;

    const { data: existing } = await supabase
      .from('factories')
      .select('name');

    const existingNames = new Set((existing || []).map(f => f.name));

    const toInsert = SEED_FACTORIES
      .filter(f => !existingNames.has(f.name))
      .map(f => ({
        name: f.name,
        country: f.country,
        city: f.city,
        source_platform: f.source_platform,
        source_url: f.source_url,
        main_products: f.main_products,
        status: f.status,
        overall_score: f.overall_score,
        moq: f.moq,
        lead_time: f.lead_time,
        description: f.description,
        contact_name: f.contact_name ?? null,
        contact_phone: f.contact_phone ?? null,
        certifications: f.certifications ?? null,
        platform_score: f.platform_score ?? null,
        platform_score_detail: f.platform_score_detail ?? null,
        fg_category: f.fg_category ?? null,
        recommendation_grade: f.recommendation_grade ?? null,
        repurchase_rate: f.repurchase_rate ?? null,
        years_on_platform: f.years_on_platform ?? null,
        user_id: user.id,
      }));

    if (toInsert.length === 0) return;

    const { error } = await supabase
      .from('factories')
      .insert(toInsert as any);

    if (error) {
      console.error('Seed error:', error);
    } else {
      console.log(`${toInsert.length} factories seeded successfully`);
    }
  } catch (err) {
    console.error('Seed factories error:', err);
  }
};

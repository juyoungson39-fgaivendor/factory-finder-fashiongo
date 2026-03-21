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

    if (count !== null && count >= 25) return;

    const { data: existing } = await supabase
      .from('factories')
      .select('name');

    const existingNames = new Set((existing || []).map(f => f.name));

    const toInsert = SEED_FACTORIES
      .filter(f => !existingNames.has(f.name))
      .map(f => {
        const { recommendation_grade, repurchase_rate, years_on_platform, fg_category, platform_score, platform_score_detail, ...rest } = f;
        return { ...rest, user_id: user.id } as any;
      });

    if (toInsert.length === 0) return;

    const { error } = await supabase
      .from('factories')
      .insert(toInsert);

    if (error) {
      console.error('Seed error:', error);
    } else {
      console.log(`${toInsert.length} factories seeded successfully`);
    }
  } catch (err) {
    console.error('Seed factories error:', err);
  }
};

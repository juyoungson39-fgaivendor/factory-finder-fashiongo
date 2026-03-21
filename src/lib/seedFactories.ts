import { supabase } from "@/integrations/supabase/client";
import { SEED_FACTORIES } from "@/data/factories";

let seeded = false;

export const seedFactoriesIfNeeded = async () => {
  if (seeded) return;
  seeded = true;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // Need authenticated user for RLS

    const { count } = await supabase
      .from('factories')
      .select('*', { count: 'exact', head: true });

    if (count !== null && count >= 9) return; // Already seeded

    // Check which factories already exist by name
    const { data: existing } = await supabase
      .from('factories')
      .select('name');

    const existingNames = new Set((existing || []).map(f => f.name));

    const toInsert = SEED_FACTORIES
      .filter(f => !existingNames.has(f.name))
      .map(f => ({ ...f, user_id: user.id }));

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

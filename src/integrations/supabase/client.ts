import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = "https://zvzqategpvsxaobzolfd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2enFhdGVncHZzeGFvYnpvbGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNzY2NDEsImV4cCI6MjA4OTc1MjY0MX0.g2R-TbBnucr9oJO7wrCZDGTUozGvbl3pxxMP6cXqKpU";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

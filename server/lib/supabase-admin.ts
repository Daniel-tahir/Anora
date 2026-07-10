import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

const supabaseUrl = env.supabaseUrl;
const supabaseServiceKey = env.supabaseServiceKey;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "Supabase admin credentials missing. Set SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL.",
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

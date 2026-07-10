import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase credentials missing. Create a .env file with:\n" +
      "VITE_SUPABASE_URL=your-project-url\n" +
      "VITE_SUPABASE_ANON_KEY=your-anon-key",
  );
}

export const supabase = createBrowserClient(supabaseUrl ?? "", supabaseAnonKey ?? "");

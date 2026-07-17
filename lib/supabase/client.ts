import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseConfig } from "./config";

let client: SupabaseClient<Database> | null = null;

export function createClient(): SupabaseClient<Database> {
  if (!client) {
    const { url, publishableKey } = getSupabaseConfig();
    client = createBrowserClient<Database>(url, publishableKey);
  }
  return client;
}

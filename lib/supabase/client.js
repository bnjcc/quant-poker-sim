import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";
let client = null;
export function createClient() {
  if (!client) {
    const { url, publishableKey } = getSupabaseConfig();
    client = createBrowserClient(url, publishableKey);
  }
  return client;
}

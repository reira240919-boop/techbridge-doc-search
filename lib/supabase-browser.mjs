// ブラウザ用の Supabase。公開用の鍵だけを使う（service_role などはサーバー側だけ）
import { createBrowserClient } from "@supabase/ssr";

let client;

export function supabaseBrowser() {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return client;
}

// ログインの共通処理。入れるのは社内メール（@techbridge.co.jp）だけ
// 登録の時点では Supabase の Auth Hook でも同じドメインに絞っている
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const ALLOWED_DOMAIN = "techbridge.co.jp";

export const isAllowedEmail = (email) =>
  typeof email === "string" && new RegExp(`^[^@\\s]+@${ALLOWED_DOMAIN.replace(/\./g, "\\.")}$`, "i").test(email.trim());

export const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// 受け口（route.js）用。ブラウザの cookie にあるログイン情報を読む
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 画面の描画中は cookie を書けない。更新は proxy.js が行う
        }
      },
    },
  });
}

// ログイン済みで、社内メールの人だけを返す。それ以外は null
export async function getAllowedUser() {
  const supabase = await createSupabaseServer();
  // getUser は Supabase に問い合わせて確かめるので、cookie を書き換えられても通らない
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user || !isAllowedEmail(data.user.email)) return null;
  return data.user;
}

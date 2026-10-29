// すべての画面の前に動く。ログインの期限を延ばし、ログインしていない人をログイン画面へ送る
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const ALLOWED = /^[^@\s]+@techbridge\.co\.jp$/i;

export async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const allowed = Boolean(data?.user && ALLOWED.test(data.user.email ?? ""));
  const { pathname } = request.nextUrl;

  // 受け口は route.js 側で断る（画面へ送らず 401 を返すため）
  if (pathname.startsWith("/api/")) return response;

  if (!allowed && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (allowed && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

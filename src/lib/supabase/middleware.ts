import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // セッションリフレッシュ（重要）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 未ログインで保護対象パスにアクセスしたら /login へ
  const path = request.nextUrl.pathname;
  const isAuthPath =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path === "/";
  const isStaticPath =
    path.startsWith("/_next") ||
    path.startsWith("/favicon") ||
    path.startsWith("/api") ||
    path.includes(".");

  // 共有ページ・管理画面は別途制御するため除外
  const isSharePath = path.startsWith("/share");

  if (!user && !isAuthPath && !isSharePath && !isStaticPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // 管理画面 (/admin) はログイン済みユーザーなら誰でもアクセス可 (プレビュー用・本番では要制限)
  if (path.startsWith("/admin") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/search";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

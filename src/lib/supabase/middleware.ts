import { createMakxasMiddlewareClient } from "@makxas/supabase-next";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const { supabase, response } = createMakxasMiddlewareClient(request);

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

  return response;
}

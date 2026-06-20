"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/search";
  const errorParam = params.get("error");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "auth_callback_failed"
      ? "ログインに失敗しました。もう一度お試しください。"
      : null
  );

  // 既にログイン済みなら自動で /search に
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace(next);
      }
    });
  }, [router, next]);

  async function handleGoogleSignIn() {
    if (loading) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // prompt を付けない = Google セッションが生きている間はアカウント選択/同意画面を
        // 出さずサイレントに再認証され、再ログインを求められない（ADR-0023 ログイン継続性）。
        // access_type:offline は Google refresh token 取得用に維持。
        queryParams: {
          access_type: "offline",
        },
      },
    });

    if (error) {
      setError(translateError(error.message));
      setLoading(false);
    }
    // 成功時は Google にリダイレクトされるのでここには来ない
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      <main className="flex-1 mx-auto w-full max-w-md px-6 pt-20 pb-12 flex flex-col">
        <div className="flex flex-col items-center mb-12">
          <div
            aria-hidden
            className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl font-black mb-5 shadow-lg text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)",
            }}
          >
            M
          </div>
          <h1 className="text-2xl font-bold text-foreground">マクサスサーチ</h1>
          <p className="text-sm text-muted mt-1">
            出張買取スタッフ向け 一括相場検索
          </p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4">
          <div className="text-center">
            <p className="text-sm text-foreground font-semibold">
              Google アカウントでログイン
            </p>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              マクサスコアに登録されている
              <br />
              社内 Google アカウントでログインしてください
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30">
              <AlertCircle
                size={16}
                className="text-danger shrink-0 mt-0.5"
              />
              <p className="text-sm text-foreground leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="tap-scale h-12 rounded-lg bg-white border border-border text-gray-700 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-3 shadow-sm"
            style={{ color: "#3c4043" }}
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <GoogleIcon size={18} />
            )}
            <span>Google でログイン</span>
          </button>

          <p className="text-[11px] text-muted text-center leading-relaxed">
            ログインすることで、利用規約・プライバシーポリシーに同意したものとみなされます。
          </p>
        </div>

        <div className="mt-auto pt-12 text-center text-xs text-muted">
          <p>マクサスサーチ v0.2.0</p>
          <p className="mt-1">© Maxus Inc.</p>
        </div>
      </main>
    </div>
  );
}

function translateError(message: string): string {
  if (
    message.includes("popup") ||
    message.includes("popup_closed_by_user")
  ) {
    return "ログインがキャンセルされました";
  }
  if (message.includes("network")) {
    return "ネットワーク接続を確認してください";
  }
  return `エラー: ${message}`;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted text-sm">
          読み込み中...
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

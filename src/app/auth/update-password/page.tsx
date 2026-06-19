"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 新しいパスワードの確定（ADR-0007）。/auth/callback で recovery セッション確立後に開かれ、
// updateUser({ password }) で同じ auth.users 行にパスワードを付与する。
// recovery 等のセッションが無ければ /auth/reset へ誘導。
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/auth/reset");
        return;
      }
      setChecking(false);
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください。");
      return;
    }
    if (password !== confirm) {
      setError("パスワードが一致しません。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError("設定に失敗しました。リンクの有効期限が切れている可能性があります。");
      return;
    }
    router.replace("/search");
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted text-sm">
        確認中…
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      <main className="flex-1 mx-auto w-full max-w-md px-6 pt-20 pb-12 flex flex-col">
        <h1 className="text-2xl font-bold text-foreground text-center mb-8">
          新しいパスワードの設定
        </h1>
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4">
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              required
              placeholder="新しいパスワード（8文字以上）"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            />
            <input
              type="password"
              required
              placeholder="新しいパスワード（確認）"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-12 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            />
            <button
              type="submit"
              disabled={loading}
              className="tap-scale h-12 rounded-lg bg-primary text-white font-medium hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? "設定中…" : "パスワードを設定する"}
            </button>
          </form>
          {error && <p className="text-sm text-danger text-center">{error}</p>}
        </div>
      </main>
    </div>
  );
}

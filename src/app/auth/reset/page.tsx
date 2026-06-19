"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// パスワード設定/再設定の要求（ADR-0007）。/auth 配下なので公開パス。
// 既存ユーザーの同じ auth.users 行にパスワードを付与する（新規signup口は開かない）。
export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    // 存在秘匿: 成否に関わらず同じ通知。recovery リンクは /auth/callback で
    // code 交換 → /auth/update-password へ。
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      <main className="flex-1 mx-auto w-full max-w-md px-6 pt-20 pb-12 flex flex-col">
        <h1 className="text-2xl font-bold text-foreground text-center mb-2">
          パスワード設定・再設定
        </h1>
        <p className="text-sm text-muted text-center mb-8 leading-relaxed">
          登録済みのメールアドレスに設定用リンクを送ります。
          <br />
          Google でログイン中の方もここから設定できます。
        </p>
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4">
          {sent ? (
            <p className="text-sm text-foreground leading-relaxed">
              設定用のメールを送信しました（登録済みのアドレスの場合）。メールのリンクから設定してください。
            </p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder="メールアドレス"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
              />
              <button
                type="submit"
                disabled={loading}
                className="tap-scale h-12 rounded-lg bg-primary text-white font-medium hover:opacity-90 transition disabled:opacity-60"
              >
                {loading ? "送信中…" : "設定リンクを送る"}
              </button>
            </form>
          )}
          <a href="/login" className="text-xs text-muted text-center underline">
            ログイン画面に戻る
          </a>
        </div>
      </main>
    </div>
  );
}

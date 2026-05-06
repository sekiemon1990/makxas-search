"use client";

import { useEffect, useState } from "react";
import { Type, Vibrate, Sparkles, Calculator, LogOut, User, Loader2, LayoutDashboard, ChevronRight } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useSettings, useTheme } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/auth/actions";

export default function SettingsPage() {
  const [settings, update] = useSettings();
  const [theme, toggleTheme] = useTheme();
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
  }

  return (
    <AppShell back={{ href: "/search", label: "戻る" }} title="設定">
      <div className="flex flex-col gap-4">
        {email && (
          <section className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div
                aria-hidden
                className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"
              >
                <User size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted">ログイン中</p>
                <p className="text-sm font-semibold text-foreground truncate">
                  {email}
                </p>
              </div>
            </div>
          </section>
        )}
        <section className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Type size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">表示</h2>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-foreground">文字サイズ</label>
                <span className="text-xs font-bold text-primary">
                  {Math.round(settings.fontScale * 100)}%
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { v: 0.9, label: "小" },
                  { v: 1.0, label: "標準" },
                  { v: 1.15, label: "大" },
                  { v: 1.3, label: "特大" },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => update({ fontScale: opt.v })}
                    className={
                      settings.fontScale === opt.v
                        ? "h-11 rounded-lg border-2 border-primary bg-primary/5 text-primary font-semibold text-sm"
                        : "h-11 rounded-lg border border-border bg-surface text-foreground text-sm hover:border-foreground/30"
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-foreground">テーマ</label>
                <span className="text-xs text-muted">
                  {theme === "dark" ? "ダーク" : "ライト"}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="w-full h-11 rounded-lg border border-border bg-surface text-foreground text-sm hover:border-foreground/30"
              >
                {theme === "dark" ? "ライトに切替" : "ダークに切替"}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">操作</h2>
          </div>

          <div className="flex flex-col gap-3">
            <ToggleRow
              icon={<Vibrate size={14} />}
              label="ハプティックフィードバック"
              description="ピン留め・メモ保存時に軽く振動"
              checked={settings.hapticEnabled}
              onChange={(v) => update({ hapticEnabled: v })}
            />
            <ToggleRow
              label="アニメーションを減らす"
              description="トランジション・スピナーを抑制"
              checked={settings.reducedMotion}
              onChange={(v) => update({ reducedMotion: v })}
            />
          </div>
        </section>

        <section className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calculator size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">査定</h2>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-foreground">
                デフォルト買取率
              </label>
              <span className="text-base font-bold text-primary">
                {settings.defaultBuyRate}%
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={95}
              step={5}
              value={settings.defaultBuyRate}
              onChange={(e) =>
                update({ defaultBuyRate: Number(e.target.value) })
              }
              className="w-full accent-primary"
            />
            <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
              計算機やAI査定の初期値に使われます。
            </p>
          </div>
        </section>

        <section className="bg-surface border border-border rounded-xl overflow-hidden">
          <Link
            href="/admin"
            className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-2 active:bg-surface-2 transition-colors"
          >
            <div className="flex items-center gap-3">
              <LayoutDashboard size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">管理画面</span>
            </div>
            <ChevronRight size={16} className="text-muted" />
          </Link>
        </section>

        <section className="bg-surface-2 rounded-xl p-3">
          <p className="text-xs text-muted leading-relaxed">
            一部の設定（テーマ・文字サイズ等）は端末のブラウザに保存されます。
          </p>
        </section>

        {email && (
          <section className="mt-2">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="tap-scale w-full h-12 rounded-lg border border-danger/40 text-danger text-sm font-semibold hover:bg-danger/5 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {signingOut ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <LogOut size={16} />
              )}
              ログアウト
            </button>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-muted">{icon}</span>}
          <span className="text-sm text-foreground">{label}</span>
        </div>
        <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          checked
            ? "shrink-0 w-11 h-6 rounded-full bg-primary relative transition-colors"
            : "shrink-0 w-11 h-6 rounded-full bg-border relative transition-colors"
        }
      >
        <span
          className={
            checked
              ? "absolute top-0.5 left-[22px] w-5 h-5 bg-white rounded-full shadow transition-all"
              : "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
          }
        />
      </button>
    </div>
  );
}

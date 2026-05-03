/**
 * 環境変数バリデーション。
 *
 * - サーバ専用変数: 関数 (lazy 評価) で取得し、未設定時に明確なエラー
 * - クライアント変数: NEXT_PUBLIC_ プレフィクス、起動時にチェック
 *
 * 利用方法:
 *   import { serverEnv, publicEnv } from "@/lib/env";
 *   const key = serverEnv.ANTHROPIC_API_KEY; // 未設定なら throw
 *
 * これにより「Vercel デプロイ後に runtime エラー」を回避できる。
 */

const REQUIRED_PUBLIC = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const REQUIRED_SERVER = [
  "ANTHROPIC_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_EMAILS",
] as const;

type PublicKey = (typeof REQUIRED_PUBLIC)[number];
type ServerKey = (typeof REQUIRED_SERVER)[number];

function ensure(key: string, scope: "public" | "server"): string {
  const v = process.env[key];
  if (!v || v.trim() === "") {
    const msg = `Missing ${scope} env var: ${key}`;
    if (scope === "server") {
      // サーバ側 API ハンドラ等の実行時 throw
      throw new Error(msg);
    }
    // public は build 時から存在するべき
    console.warn(`[env] ${msg}`);
    return "";
  }
  return v;
}

export const publicEnv = {
  get NEXT_PUBLIC_SUPABASE_URL(): string {
    return ensure("NEXT_PUBLIC_SUPABASE_URL", "public");
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY(): string {
    return ensure("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public");
  },
} as const;

export const serverEnv = {
  get ANTHROPIC_API_KEY(): string {
    return ensure("ANTHROPIC_API_KEY", "server");
  },
  get SUPABASE_SERVICE_ROLE_KEY(): string {
    return ensure("SUPABASE_SERVICE_ROLE_KEY", "server");
  },
  /** カンマ区切りの管理者メールアドレスリスト（例: admin@example.com,ops@example.com） */
  get ADMIN_EMAILS(): string {
    return ensure("ADMIN_EMAILS", "server");
  },
} as const;

/**
 * 起動時の自動チェック (production のみ)。
 * 欠けている変数があれば console.error で警告 (build を落とさず)。
 */
export function validateEnvOnStartup(): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  for (const k of REQUIRED_PUBLIC) {
    if (!process.env[k] || process.env[k] === "") missing.push(k);
  }
  for (const k of REQUIRED_SERVER) {
    if (!process.env[k] || process.env[k] === "") missing.push(k);
  }
  if (missing.length > 0) {
    console.error(
      `[env] Missing environment variables (will fail at runtime): ${missing.join(", ")}`,
    );
  }
  return { ok: missing.length === 0, missing };
}

export type { PublicKey, ServerKey };

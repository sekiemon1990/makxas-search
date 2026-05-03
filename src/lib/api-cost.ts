/**
 * Anthropic API コスト計算・使用量ログ記録ユーティリティ。
 *
 * 単価 (2026-05 時点):
 *   claude-opus-4-7  : input $5 / output $25 / cache_read $0.50 / cache_write $6.25 per MTok
 *   claude-haiku-4-5 : input $1 / output $5  / cache_read $0.10 / cache_write $1.25 per MTok
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

export type ApiEndpoint =
  | "ai-advisor"
  | "detect-accessories"
  | "keyword-suggest"
  | "refine-keywords";

interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

interface LogParams {
  userId: string | null;
  endpoint: ApiEndpoint;
  model: string;
  usage: TokenUsage;
}

// ──────────────────────────────────────────────
// 単価テーブル（$ per million tokens）
// ──────────────────────────────────────────────

const PRICES: Record<
  string,
  {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  }
> = {
  "claude-opus-4-7": {
    input: 5,
    output: 25,
    cache_read: 0.5,
    cache_write: 6.25,
  },
  "claude-haiku-4-5": {
    input: 1,
    output: 5,
    cache_read: 0.1,
    cache_write: 1.25,
  },
  // fallback: Sonnet 相当
  default: {
    input: 3,
    output: 15,
    cache_read: 0.3,
    cache_write: 3.75,
  },
};

// ──────────────────────────────────────────────
// コスト計算
// ──────────────────────────────────────────────

export function calcCostUsd(model: string, usage: TokenUsage): number {
  const price = PRICES[model] ?? PRICES.default;
  const M = 1_000_000;
  return (
    ((usage.input_tokens ?? 0) * price.input +
      (usage.output_tokens ?? 0) * price.output +
      (usage.cache_read_input_tokens ?? 0) * price.cache_read +
      (usage.cache_creation_input_tokens ?? 0) * price.cache_write) /
    M
  );
}

// ──────────────────────────────────────────────
// ユーザー ID 取得（API ルート内で使用）
// ──────────────────────────────────────────────

export async function getRequestUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// 使用量ログ記録（fire-and-forget）
// ──────────────────────────────────────────────

export function logApiUsage(params: LogParams): void {
  const costUsd = calcCostUsd(params.model, params.usage);

  // 非同期で DB に書き込む（レスポンスをブロックしない）
  Promise.resolve()
    .then(async () => {
      const supabase = createServiceClient();
      const { error } = await supabase.from("api_usage_logs").insert({
        user_id: params.userId,
        endpoint: params.endpoint,
        model: params.model,
        input_tokens: params.usage.input_tokens ?? 0,
        output_tokens: params.usage.output_tokens ?? 0,
        cache_read_tokens: params.usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: params.usage.cache_creation_input_tokens ?? 0,
        cost_usd: costUsd,
      });
      if (error) {
        console.warn("[api-cost] logApiUsage error:", error.message);
      }
    })
    .catch((err) => {
      console.warn("[api-cost] logApiUsage unexpected error:", err);
    });
}

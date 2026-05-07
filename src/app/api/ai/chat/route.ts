import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { getRequestUserId, logApiUsage } from "@/lib/api-cost";

export const runtime = "nodejs";
export const maxDuration = 60;

type Message = { role: "user" | "assistant"; content: string };

type RequestBody = {
  messages: Message[];
  pageContext?: string;
  systemExtra?: string;
};

// ─────────────────────────────────────────────
// ツール定義
// ─────────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "get_dashboard_summary",
    description:
      "管理ダッシュボードのサマリーを取得します。直近の検索件数・エラー率・ユーザー数・APIコストの概要が得られます。",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "集計対象日数（デフォルト7）",
        },
      },
      required: [],
    },
  },
  {
    name: "search_data",
    description:
      "検索ログ・ユーザー行動データをキーワードや条件で検索します。",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "キーワード（検索ワード・ユーザーメールアドレスなど）",
        },
        status: {
          type: "string",
          enum: ["all", "error", "success"],
          description: "ステータスフィルター（デフォルト: all）",
        },
        limit: {
          type: "number",
          description: "取得件数（デフォルト20、最大50）",
        },
      },
      required: ["query"],
    },
  },
];

// ─────────────────────────────────────────────
// ツール実行
// ─────────────────────────────────────────────

async function runTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const service = createServiceClient();

  if (name === "get_dashboard_summary") {
    const days = typeof input.days === "number" ? input.days : 7;
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const [searchRes, errorRes, costRes] = await Promise.all([
      service
        .from("searches")
        .select("id, status, keyword, searched_at", { count: "exact" })
        .gte("searched_at", since)
        .order("searched_at", { ascending: false })
        .limit(5),
      service
        .from("searches")
        .select("id", { count: "exact" })
        .eq("status", "error")
        .gte("searched_at", since),
      service
        .from("api_usage_logs")
        .select("cost_usd, endpoint, model, created_at")
        .gte("created_at", since),
    ]);

    const totalSearches = searchRes.count ?? 0;
    const totalErrors = errorRes.count ?? 0;
    const totalCost = (costRes.data ?? []).reduce(
      (sum, r) => sum + (r.cost_usd ?? 0),
      0,
    );
    const recentSearches = (searchRes.data ?? []).slice(0, 5);

    return JSON.stringify({
      period: `直近${days}日`,
      totalSearches,
      errorCount: totalErrors,
      errorRate:
        totalSearches > 0
          ? `${((totalErrors / totalSearches) * 100).toFixed(1)}%`
          : "0%",
      totalCostUsd: totalCost.toFixed(4),
      totalCostJpy: Math.round(totalCost * 145),
      recentSearches,
    });
  }

  if (name === "search_data") {
    const query = String(input.query ?? "");
    const status = String(input.status ?? "all");
    const limit = Math.min(Number(input.limit ?? 20), 50);

    let req = service
      .from("searches")
      .select("id, keyword, status, error_message, searched_at, sources")
      .order("searched_at", { ascending: false })
      .limit(limit);

    if (query) {
      req = req.ilike("keyword", `%${query}%`);
    }
    if (status === "error") {
      req = req.eq("status", "error");
    } else if (status === "success") {
      req = req.eq("status", "completed");
    }

    const { data, error } = await req;
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ count: data?.length ?? 0, results: data ?? [] });
  }

  return JSON.stringify({ error: `未知のツール: ${name}` });
}

// ─────────────────────────────────────────────
// システムプロンプト
// ─────────────────────────────────────────────

function buildSystemPrompt(pageContext?: string, systemExtra?: string): string {
  const parts = [
    `あなたはマクサスサーチ（出張買取業者向けの中古品相場検索ツール）の管理画面AIアシスタントです。
管理者（株式会社マクサスのオーナー・スタッフ）の質問に日本語で答えてください。

# このシステムについて
- Next.js + Supabase で構築された社内向けの相場検索ツール
- ヤフオク・メルカリ・ジモティーの落札データを収集・集計
- スタッフが査定現場でリアルタイムに相場を調べるために使用
- AIアドバイザー機能（Claude Haiku）で買取推奨価格を算出

# 管理者ができること
- 検索ログ・エラーログの確認
- ユーザー行動データの分析
- APIコストの把握
- フィードバックの管理

ツールを使ってリアルタイムなデータを取得しながら、具体的で実用的な回答をしてください。
数値を引用するときは単位を明記してください（件、円、USD など）。`,
  ];

  if (pageContext) {
    parts.push(`\n現在のページ: ${pageContext}`);
  }
  if (systemExtra) {
    parts.push(`\n## 管理者からの追加コンテキスト\n${systemExtra}`);
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────
// ハンドラ
// ─────────────────────────────────────────────

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "ai-chat", 20);
  if (limited) return limited;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません" },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, pageContext, systemExtra } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages が空です" },
      { status: 400 },
    );
  }

  const client = new Anthropic();
  const userId = await getRequestUserId();
  const systemPrompt = buildSystemPrompt(pageContext, systemExtra);

  // tool use ループ（最大5回）
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let totalUsage = { input_tokens: 0, output_tokens: 0 };
  const MAX_LOOPS = 5;
  let reply = "";

  for (let i = 0; i < MAX_LOOPS; i++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages: anthropicMessages,
    });

    totalUsage.input_tokens += response.usage.input_tokens;
    totalUsage.output_tokens += response.usage.output_tokens;

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      reply = textBlock?.text ?? "";
      break;
    }

    if (response.stop_reason === "tool_use") {
      // ツール呼び出しブロックを処理
      anthropicMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const result = await runTool(
          block.name,
          block.input as Record<string, unknown>,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
      anthropicMessages.push({ role: "user", content: toolResults });
      continue;
    }

    // max_tokens など他の stop_reason
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    reply = textBlock?.text ?? "(応答を生成できませんでした)";
    break;
  }

  // コスト記録（fire-and-forget）
  logApiUsage({
    userId,
    endpoint: "ai-chat",
    model: "claude-sonnet-4-5",
    usage: totalUsage,
  });

  return NextResponse.json({ reply });
}

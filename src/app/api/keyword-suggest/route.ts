import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestUserId, logApiUsage } from "@/lib/api-cost";

export const runtime = "nodejs";
export const maxDuration = 15;

type RequestBody = {
  prefix: string;
};

const SYSTEM_PROMPT = `日本の中古品マーケット (ヤフオク・メルカリ等) の
検索キーワードオートコンプリート。

入力途中の文字列を含む形で 5〜8 個、短く具体的な候補を返す。
- 入力文字列を必ず含める
- 実在する型番・モデル名・容量・色・世代などに寄せる
- 1 候補 20 文字以内
- 「ジャンク」「本体のみ」など買取現場でよく使う絞り込みも可

JSON のみ出力。説明文・前置き・コードブロック装飾なし:
{ "candidates": ["候補1", "候補2", ...] }`;

const SUGGEST_SCHEMA = {
  type: "object" as const,
  properties: {
    candidates: {
      type: "array",
      description: "オートコンプリート候補の配列 (5〜8 件)",
      items: { type: "string" },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  // 入力中の高頻度リクエストなので緩めに 120/分
  const limited = enforceRateLimit(req, "ai:suggest", 120);
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

  const prefix = (body.prefix ?? "").trim();
  if (!prefix || prefix.length < 2) {
    // prefix が空・1 文字: prewarm のための即時応答
    return NextResponse.json({ candidates: [], warmed: true });
  }

  const [client, userId] = [new Anthropic(), await getRequestUserId()];

  try {
    // Haiku 4.5: autocomplete のような高頻度・低レイテンシ用途に最適
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: SUGGEST_SCHEMA },
      },
      messages: [{ role: "user", content: prefix }],
    });

    // 使用量を記録（レスポンスをブロックしない）
    logApiUsage({
      userId,
      endpoint: "keyword-suggest",
      model: "claude-haiku-4-5",
      usage: response.usage,
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) {
      return NextResponse.json({ candidates: [] });
    }
    let parsed: { candidates: string[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return NextResponse.json({ candidates: [] });
    }
    return NextResponse.json({ candidates: parsed.candidates });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(
        "[keyword-suggest] API error:",
        error.status,
        error.message,
      );
      return NextResponse.json({ candidates: [] }, { status: 200 });
    }
    console.error("[keyword-suggest] error:", error);
    return NextResponse.json({ candidates: [] }, { status: 200 });
  }
}

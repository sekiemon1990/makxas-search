import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestUserId, logApiUsage } from "@/lib/api-cost";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_PROMPT = "中央値の70%を見込金額とする";

type RequestBody = {
  median: number;
  min: number;
  max: number;
  count: number;
  prompt?: string;
};

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "mikomiku-estimate", 30);
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

  const { median, min, max, count } = body;
  const prompt = body.prompt?.trim() || DEFAULT_PROMPT;

  if (typeof median !== "number" || median < 0) {
    return NextResponse.json({ error: "median は必須です" }, { status: 400 });
  }

  const client = new Anthropic();
  const userId = await getRequestUserId();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 64,
      system:
        "あなたは中古品買取の見込金額を計算するアシスタントです。見込金額（整数、円単位）を数値だけ返してください。前置きや説明は不要です。数値のみ。",
      messages: [
        {
          role: "user",
          content: `${prompt}\n\n相場データ: 中央値=${median}円, 最小=${min}円, 最大=${max}円, 取引件数=${count}件\n\n見込金額（整数のみ）:`,
        },
      ],
    });

    logApiUsage({
      userId,
      endpoint: "mikomiku-estimate",
      model: "claude-haiku-4-5",
      usage: response.usage,
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    const raw = textBlock?.text?.trim() ?? "";
    const mikomiku = parseInt(raw.replace(/[^0-9]/g, ""), 10);

    if (isNaN(mikomiku) || mikomiku < 0) {
      // フォールバック: 70%
      return NextResponse.json({ mikomiku: Math.round(median * 0.7) });
    }

    return NextResponse.json({ mikomiku });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "リクエストが集中しています" },
        { status: 429 },
      );
    }
    console.error("[mikomiku] error:", error);
    // フォールバック: 70%
    return NextResponse.json({ mikomiku: Math.round(median * 0.7) });
  }
}

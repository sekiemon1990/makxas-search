import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestUserId, logApiUsage } from "@/lib/api-cost";

export const runtime = "nodejs";
export const maxDuration = 60;

type RequestBody = {
  image: string; // base64 data URL
};

function dataUrlToBase64(dataUrl: string): {
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
} {
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) {
    const data = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    return { data, mediaType: "image/jpeg" };
  }
  const rawType = match[1];
  const data = match[2];
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  const mediaType = allowed.includes(rawType as (typeof allowed)[number])
    ? (rawType as (typeof allowed)[number])
    : "image/jpeg";
  return { data, mediaType };
}

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "bulk-import:image", 5);
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

  if (!body.image) {
    return NextResponse.json({ error: "image は必須です" }, { status: 400 });
  }

  const { data, mediaType } = dataUrlToBase64(body.image);
  const client = new Anthropic();
  const userId = await getRequestUserId();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data },
            },
            {
              type: "text",
              text: `この画像に写っている商品・品物の名前をリストアップしてください。
在庫表・リスト・メモ・棚卸し表など複数商品が記載されている場合はすべて抽出してください。
写真に商品が写っている場合はその商品名を特定してください。

出力形式: 商品名を1行1件で列挙。前置きや説明は不要。商品名のみ。

例:
ROLEX サブマリーナ
ルイ・ヴィトン ネヴァーフル MM
iPhone 15 Pro 256GB
ダイソン V12`,
            },
          ],
        },
      ],
    });

    logApiUsage({
      userId,
      endpoint: "bulk-import-image",
      model: "claude-haiku-4-5",
      usage: response.usage,
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) {
      return NextResponse.json(
        { error: "AI からの応答が不正です" },
        { status: 502 },
      );
    }

    const items = textBlock.text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "リクエストが集中しています。少し待って再度お試しください。" },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[bulk-import/from-image] API error:", error.status, error.message);
      return NextResponse.json(
        { error: `AI 応答エラー (${error.status})` },
        { status: 502 },
      );
    }
    console.error("[bulk-import/from-image] unknown error:", error);
    return NextResponse.json(
      { error: "画像からの商品名抽出に失敗しました" },
      { status: 500 },
    );
  }
}

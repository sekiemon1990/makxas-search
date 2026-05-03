import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestUserId, logApiUsage } from "@/lib/api-cost";

export const runtime = "nodejs";
export const maxDuration = 30;

type RequestBody = {
  images: string[];
  productHint?: string;
};

const SYSTEM_PROMPT = `あなたは中古品の出品画像から付属品を識別するアシスタントです。

# 役割
- 画像に写っている「商品本体以外の付属品」を全て列挙する
- 元箱、化粧箱、説明書、保証書、ケーブル、充電器、ケース、レンズフード、
  リモコン、メモリーカード、三脚、ストラップ、替えブラシ、アタッチメント、
  袋、領収書 など中古買取査定で重視される項目に注目

# 重要な原則
- 画像に明確に写っているものだけを返す (推測禁止)
- 商品本体 (例: カメラ本体、レンズ単体、PC 本体、家電本体) は付属品に含めない
- 付属品名は日本語で短く (例: 「元箱」「取扱説明書」「専用ケース」「充電ケーブル」)
- 同じカテゴリの付属品は重複させない (例: 「USB ケーブル」と「ケーブル」を両方出さない)
- 何も付属品が写っていなければ空配列を返す

# 出力フォーマット
JSON のみ (説明文・前置き・コードブロック装飾なし):
{ "accessories": ["付属品1", "付属品2", ...] }`;

const SCHEMA = {
  type: "object" as const,
  properties: {
    accessories: {
      type: "array",
      description: "画像から識別された付属品名の配列",
      items: { type: "string" },
    },
  },
  required: ["accessories"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "ai:accessories", 30);
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

  const images = (body.images ?? []).filter(
    (u): u is string => typeof u === "string" && u.startsWith("http"),
  );
  if (images.length === 0) {
    return NextResponse.json({ accessories: [] });
  }

  // コスト/レイテンシを抑えるため最大 4 枚まで
  const targetImages = images.slice(0, 4);

  const [client, userId] = [new Anthropic(), await getRequestUserId()];

  const userText = body.productHint
    ? `商品: ${body.productHint}\nこの商品の出品画像から付属品を識別してください。`
    : "出品画像から付属品を識別してください。";

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            ...targetImages.map(
              (url): Anthropic.ImageBlockParam => ({
                type: "image",
                source: { type: "url", url },
              }),
            ),
            { type: "text", text: userText },
          ],
        },
      ],
    });

    // 使用量を記録（レスポンスをブロックしない）
    logApiUsage({
      userId,
      endpoint: "detect-accessories",
      model: "claude-haiku-4-5",
      usage: response.usage,
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) {
      return NextResponse.json({ accessories: [] });
    }
    let parsed: { accessories: string[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return NextResponse.json({ accessories: [] });
    }
    const cleaned = (parsed.accessories ?? [])
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0 && s.length < 30);
    return NextResponse.json({ accessories: cleaned });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(
        "[detect-accessories] API error:",
        error.status,
        error.message,
      );
      return NextResponse.json({ accessories: [] }, { status: 200 });
    }
    console.error("[detect-accessories] error:", error);
    return NextResponse.json({ accessories: [] }, { status: 200 });
  }
}

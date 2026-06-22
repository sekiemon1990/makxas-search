import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestUserId, logApiUsage } from "@/lib/api-cost";
import { requireApiAuth } from "@/lib/auth/requireApiAuth";
import {
  buildProductIdentificationPrompt,
  normalizeProductIdentificationResults,
  type ProductIdentificationResult,
} from "@/lib/vision/product-identification";

export const runtime = "nodejs";
export const maxDuration = 60;

type ItemInput = {
  id: string;
  photos: string[]; // base64 data URL: "data:image/jpeg;base64,..."
};

type RequestBody = {
  items: ItemInput[];
};

function dataUrlToBase64(dataUrl: string): {
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
} {
  // "data:image/jpeg;base64,XXXX" → extract media_type and base64 data
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) {
    // fallback: assume jpeg
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
  // 認証: ログイン済みユーザーのみ（環境監査 2026-06-11: 無認証露出の解消）
  const gate = await requireApiAuth();
  if (!gate.ok) return gate.response;

  const limited = enforceRateLimit(req, "vision:identify", 10);
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

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "items は1件以上必要です" },
      { status: 400 },
    );
  }

  const client = new Anthropic();
  const userId = await getRequestUserId();

  // Build multi-image message content
  // Each item group is labeled with its id, followed by its photos
  const contentParts: Anthropic.MessageParam["content"] = [];

  // Instruction text at the start
  contentParts.push({
    type: "text",
    text: buildProductIdentificationPrompt(),
  });

  // Add each item's photos with a label
  for (const item of body.items) {
    contentParts.push({
      type: "text",
      text: `\n--- グループID: ${item.id} ---`,
    });

    for (const photo of item.photos) {
      const { data, mediaType } = dataUrlToBase64(photo);
      contentParts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data,
        },
      });
    }
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: contentParts,
        },
      ],
    });

    // Log usage (fire-and-forget)
    logApiUsage({
      userId,
      endpoint: "vision-identify",
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

    let results: ProductIdentificationResult[];
    try {
      // Strip markdown code fences if present
      const raw = textBlock.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      results = normalizeProductIdentificationResults(
        JSON.parse(raw),
        body.items.map((item) => item.id),
      );
    } catch {
      console.error("[vision/identify] JSON parse error", {
        responseLength: textBlock.text.length,
      });
      return NextResponse.json(
        { error: "AI からの応答が JSON として読めませんでした" },
        { status: 502 },
      );
    }

    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "リクエストが集中しています。少し待って再度お試しください。" },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[vision/identify] API error:", error.status, error.message);
      return NextResponse.json(
        { error: `AI 応答エラー (${error.status})` },
        { status: 502 },
      );
    }
    console.error("[vision/identify] unknown error:", error);
    return NextResponse.json(
      { error: "商品特定に失敗しました" },
      { status: 500 },
    );
  }
}

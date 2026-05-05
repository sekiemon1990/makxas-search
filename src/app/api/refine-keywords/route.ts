import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestUserId, logApiUsage } from "@/lib/api-cost";

export const runtime = "nodejs";
export const maxDuration = 30;

type RequestBody = {
  keyword: string;
  totalAvailable?: number;
  sampleTitles: string[];
};

type Suggestion = {
  keyword: string;
  reason: string;
};

const SYSTEM_PROMPT = `あなたは中古品買取の検索アシスタントです。
ユーザーが入力したキーワードでヤフオク等を検索した結果、件数が多すぎて
有用な相場が見えない状況を解決するため、絞り込み候補を提案します。

# 役割
- 落札商品タイトルから商品ジャンル / 型番 / 容量 / 色 / 世代 / ブランド など、
  検索に使える特徴を抽出する
- 元のキーワードに追加することで件数が 100 件前後まで絞り込めそうな候補を 5〜8 個提案する

# 重要な原則
- ユーザーの元キーワードに追加する形 (例: "iPhone" → "iPhone 15 Pro 256GB")
- 商品の本体 / アクセサリ / 部品 を区別できるキーワードを優先
  (例: "本体" "ジャンク" を入れて意図を明確化)
- 型番・モデル名・容量・年式など客観的な情報を優先する
- 検索キーワード文字列は短く、Yahoo のキーワード検索で有効な日本語にする
- 各候補に短い理由 (10-30 文字) を添える

# 出力フォーマット
以下の JSON スキーマに厳密に従ってください。説明文や前置き、
コードブロック装飾なしで JSON 本体のみを出力してください。

{
  "suggestions": [
    { "keyword": "<元キーワード> + 追加ワード", "reason": "短い説明" },
    ...
  ]
}`;

const REFINE_SCHEMA = {
  type: "object" as const,
  properties: {
    suggestions: {
      type: "array",
      description: "絞り込み候補 (3〜8 個)",
      items: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "絞り込み後の検索キーワード" },
          reason: { type: "string", description: "なぜこの絞り込みが有効か (短文)" },
        },
        required: ["keyword", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "ai:refine", 30);
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

  if (!body.keyword || !Array.isArray(body.sampleTitles)) {
    return NextResponse.json(
      { error: "keyword と sampleTitles は必須です" },
      { status: 400 },
    );
  }
  if (body.sampleTitles.length === 0) {
    return NextResponse.json(
      { error: "サンプルタイトルが 0 件です" },
      { status: 400 },
    );
  }

  const [client, userId] = [new Anthropic(), await getRequestUserId()];

  const user = [
    `ユーザーキーワード: ${body.keyword}`,
    body.totalAvailable
      ? `媒体側の総件数: ${body.totalAvailable.toLocaleString("ja-JP")}件 (多すぎる)`
      : null,
    "",
    "# 落札商品タイトル (サンプル)",
    ...body.sampleTitles.slice(0, 30).map((t, i) => `${i + 1}. ${t}`),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: REFINE_SCHEMA },
      },
      messages: [{ role: "user", content: user }],
    });

    // 使用量を記録（レスポンスをブロックしない）
    logApiUsage({
      userId,
      endpoint: "refine-keywords",
      model: "claude-opus-4-7",
      usage: response.usage,
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) {
      return NextResponse.json(
        { error: "AI 応答が不正です" },
        { status: 502 },
      );
    }

    let parsed: { suggestions: Suggestion[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      console.error("[refine-keywords] parse error:", textBlock.text);
      return NextResponse.json(
        { error: "AI 応答の JSON パース失敗" },
        { status: 502 },
      );
    }
    return NextResponse.json({ suggestions: parsed.suggestions });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "リクエストが集中しています" },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[refine-keywords] API error:", error.status, error.message);
      return NextResponse.json(
        { error: `AI 応答エラー (${error.status})` },
        { status: 502 },
      );
    }
    console.error("[refine-keywords] unknown error:", error);
    return NextResponse.json(
      { error: "絞り込み提案の取得に失敗しました" },
      { status: 500 },
    );
  }
}

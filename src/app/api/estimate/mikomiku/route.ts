import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestUserId, logApiUsage } from "@/lib/api-cost";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_PROMPT = "中央値の70%を見込金額とする";

type RequestBody = {
  median: number;
  min: number;
  max: number;
  count: number;
  prompt?: string;
  keyword?: string;
};

type CategoryRow = {
  id: string;
  name: string;
  level: "major" | "minor";
  major_id: string | null;
  prompt: string;
};

type KnowledgeFileRow = {
  id: string;
  filename: string;
  extracted_text: string | null;
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
  const globalPrompt = body.prompt?.trim() || DEFAULT_PROMPT;
  const keyword = body.keyword?.trim() || "";

  if (typeof median !== "number" || median < 0) {
    return NextResponse.json({ error: "median は必須です" }, { status: 400 });
  }

  // Supabase からカテゴリと知識ファイルを取得
  let categories: CategoryRow[] = [];
  let knowledgeFiles: KnowledgeFileRow[] = [];

  try {
    const supabase = createServiceClient();

    const { data: catData } = await supabase
      .from("mikomiku_categories")
      .select("id, name, level, major_id, prompt")
      .order("sort_order");
    if (catData) categories = catData as CategoryRow[];

    const { data: kfData } = await supabase
      .from("mikomiku_knowledge_files")
      .select("id, filename, extracted_text")
      .not("extracted_text", "is", null);
    if (kfData) knowledgeFiles = kfData as KnowledgeFileRow[];
  } catch (e) {
    console.error("[mikomiku] supabase fetch error:", e);
    // フォールバック: カテゴリ・知識ファイルなしで続行
  }

  // システムプロンプト構築
  const systemParts: string[] = [];
  systemParts.push(
    "あなたは中古品買取の見込金額を計算するアシスタントです。見込金額（整数、円単位）を数値だけ返してください。前置きや説明は不要です。数値のみ。",
  );

  systemParts.push(`\n[全体ロジック]\n${globalPrompt}`);

  // カテゴリ別ロジック
  const majorCategories = categories.filter((c) => c.level === "major");
  const minorCategories = categories.filter((c) => c.level === "minor");

  if (majorCategories.length > 0) {
    const categoryLines: string[] = [];
    categoryLines.push(
      "\n[カテゴリ別ロジック]\n以下のカテゴリ別ロジックが設定されています。商品キーワードから最も適切なカテゴリを判断し、そのロジックを優先して適用してください（中カテゴリ > 大カテゴリ > 全体ロジック の優先順位）。カテゴリが一致しない場合は全体ロジックを使用してください。",
    );

    for (const major of majorCategories) {
      if (major.prompt) {
        categoryLines.push(`\n大カテゴリ「${major.name}」:\n${major.prompt}`);
      } else {
        categoryLines.push(`\n大カテゴリ「${major.name}」:`);
      }

      const minors = minorCategories.filter((m) => m.major_id === major.id);
      for (const minor of minors) {
        if (minor.prompt) {
          categoryLines.push(
            `\n  中カテゴリ「${minor.name}」（${major.name}）:\n  ${minor.prompt}`,
          );
        }
      }
    }

    systemParts.push(categoryLines.join(""));
  }

  // 知識ベース
  if (knowledgeFiles.length > 0) {
    const knowledgeParts = knowledgeFiles
      .filter((f) => f.extracted_text)
      .map((f) => `--- ${f.filename} ---\n${f.extracted_text}`)
      .join("\n\n");

    if (knowledgeParts) {
      systemParts.push(`\n[知識ベース]\n${knowledgeParts}`);
    }
  }

  const systemPrompt = systemParts.join("\n");

  // ユーザーメッセージ
  const userMessage = keyword
    ? `商品キーワード: ${keyword}\n\n相場データ: 中央値=${median}円, 最小=${min}円, 最大=${max}円, 取引件数=${count}件\n\n見込金額（整数のみ）:`
    : `相場データ: 中央値=${median}円, 最小=${min}円, 最大=${max}円, 取引件数=${count}件\n\n見込金額（整数のみ）:`;

  const client = new Anthropic();
  const userId = await getRequestUserId();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 64,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
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

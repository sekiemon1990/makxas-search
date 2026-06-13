// 見込金額ロジックの AIチューニング・チャット
//
// マネージャーの自然言語を解釈し、見込金額ロジック（全体 / カテゴリ別）の
// 変更案を提示する。AI は DB を直接書き換えず、propose_change ツールで
// 「変更案」を返すだけ。実際の反映は確認後に /apply が行う。

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { getRequestUserId, logApiUsage } from "@/lib/api-cost";
import { requireMikomikuTuner } from "@/lib/auth/requireMikomikuTuner";
import {
  validateProposeInput,
  buildProposal,
  isNoOp,
  type ProposeChangeInput,
  type ChangeProposal,
} from "@/lib/mikomiku/tuning";

export const runtime = "nodejs";
export const maxDuration = 60;

const GLOBAL_PROMPT_KEY = "mikomiku_prompt";
const DEFAULT_GLOBAL = "中央値の70%を見込金額とする";

type Message = { role: "user" | "assistant"; content: string };
type RequestBody = { messages: Message[] };

const tools: Anthropic.Tool[] = [
  {
    name: "get_current_logic",
    description:
      "現在の見込金額ロジックを取得します。全体ロジックと、カテゴリ別（大/中カテゴリ）のロジックが得られます。変更案を作る前に必ず最新の状態を確認してください。",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "propose_change",
    description:
      "見込金額ロジックの変更案を提示します。これは提案であり、実際の反映はユーザーが確認ボタンを押した後に行われます。あなたがこのツールを呼んでも設定は変わりません。1メッセージにつき1件だけ提案してください。",
    input_schema: {
      type: "object" as const,
      properties: {
        target: {
          type: "string",
          enum: ["global", "category"],
          description: "global=全体ロジック / category=特定カテゴリのロジック",
        },
        categoryId: {
          type: "string",
          description:
            "target=category のとき必須。get_current_logic で得たカテゴリの id。",
        },
        newPrompt: {
          type: "string",
          description: "変更後のロジック本文（全文）。差分でなく完成形を渡す。",
        },
        summary: {
          type: "string",
          description: "変更内容の1行サマリー（例: ブランドバッグの係数を85%→90%に）",
        },
      },
      required: ["target", "newPrompt", "summary"],
    },
  },
];

type CategoryRow = {
  id: string;
  name: string;
  level: "major" | "minor";
  major_id: string | null;
  prompt: string | null;
};

async function getCurrentLogic(service: ReturnType<typeof createServiceClient>) {
  const [cfgRes, catRes] = await Promise.all([
    service
      .from("app_config")
      .select("value")
      .eq("key", GLOBAL_PROMPT_KEY)
      .maybeSingle(),
    service
      .from("mikomiku_categories")
      .select("id, name, level, major_id, prompt")
      .order("sort_order"),
  ]);

  const globalPrompt = cfgRes.data?.value?.trim() || DEFAULT_GLOBAL;
  const categories = (catRes.data ?? []) as CategoryRow[];
  return { globalPrompt, categories };
}

function buildSystemPrompt(): string {
  return `あなたはマクサスサーチの「見込金額ロジック チューニング アシスタント」です。
営業部・フィールドセールスのマネージャー、直営事業責任者が、見込金額（中古品の想定再販価格）の
算出ロジックを自然言語で調整するのを手伝います。日本語で簡潔に答えてください。

# あなたの役割
- まず get_current_logic で現在のロジック（全体 / カテゴリ別）を確認する。
- マネージャーの要望を、具体的なロジック本文の変更に落とし込む。
- 変更するときは propose_change で「変更案」を出す。これは提案であり、
  実際の反映はマネージャーが画面の「適用」ボタンを押した後に行われる。
  あなたが propose_change を呼んでも設定は変わらないので、「適用しました」とは言わないこと。
  代わりに「以下の変更でよろしければ『適用』を押してください」と案内する。
- どのカテゴリの話か曖昧なときは聞き返す。係数・期間など数値は具体的に明示する。
- ロジック本文は中古品買取の見込金額算出指示として自然な日本語で書く。

# 見込金額ロジックとは
相場（ヤフオク・メルカリの実売価）の中央値などを元に、いくらで仕入れる（買い取る）と
利益が出るかの算出方針を文章で表したもの。全体ロジックが既定で、カテゴリ別ロジックが
あればそちらが優先される（中カテゴリ > 大カテゴリ > 全体）。`;
}

export async function POST(req: Request) {
  const gate = await requireMikomikuTuner();
  if (!gate.ok) return gate.response;

  const limited = enforceRateLimit(req, "mikomiku-tuning-chat", 20);
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

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages が空です" }, { status: 400 });
  }

  const service = createServiceClient();
  const client = new Anthropic();
  const userId = await getRequestUserId();
  const systemPrompt = buildSystemPrompt();

  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const totalUsage = { input_tokens: 0, output_tokens: 0 };
  const MAX_LOOPS = 5;
  let reply = "";
  let proposal: ChangeProposal | null = null;

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

    if (response.stop_reason === "tool_use") {
      anthropicMessages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        if (block.name === "get_current_logic") {
          const logic = await getCurrentLogic(service);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(logic),
          });
          continue;
        }

        if (block.name === "propose_change") {
          const input = block.input as Partial<ProposeChangeInput>;
          const valid = validateProposeInput(input);
          if (!valid.ok) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({ error: valid.error }),
              is_error: true,
            });
            continue;
          }

          // before 値とカテゴリ名を取得して提案を組み立てる
          const logic = await getCurrentLogic(service);
          let beforePrompt = "";
          let categoryName: string | null = null;
          if (input.target === "global") {
            beforePrompt = logic.globalPrompt;
          } else {
            const cat = logic.categories.find((c) => c.id === input.categoryId);
            if (!cat) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify({
                  error: "指定された categoryId が見つかりません",
                }),
                is_error: true,
              });
              continue;
            }
            beforePrompt = cat.prompt ?? "";
            categoryName = cat.name;
          }

          const built = buildProposal(
            input as ProposeChangeInput,
            beforePrompt,
            categoryName,
          );
          proposal = built;

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({
              ok: true,
              noop: isNoOp(built),
              target: built.target,
              categoryName: built.categoryName,
              note: "変更案を作成しました。画面に確認カードを表示します。ユーザーが『適用』を押すまで反映されません。",
            }),
          });
          continue;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: `未知のツール: ${block.name}` }),
          is_error: true,
        });
      }

      anthropicMessages.push({ role: "user", content: toolResults });
      continue;
    }

    // end_turn など
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    reply = textBlock?.text ?? "";
    break;
  }

  if (!reply) {
    reply = proposal
      ? `「${proposal.categoryName}」の変更案を作成しました。内容を確認して「適用」を押してください。`
      : "(応答を生成できませんでした)";
  }

  logApiUsage({
    userId,
    endpoint: "mikomiku-tuning-chat",
    model: "claude-sonnet-4-5",
    usage: totalUsage,
  });

  return NextResponse.json({ reply, proposal });
}

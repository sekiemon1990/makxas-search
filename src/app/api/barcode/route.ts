import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { code } = (await req.json()) as { code: string };
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `JANコード・UPCコード・ISBNコード「${code}」の商品名と検索用キーワードを教えてください。

以下のJSON形式のみで返答してください（説明不要）:
{"productName":"商品名","keywords":"検索キーワード（型番等を含む簡潔な文字列）","found":true}

商品が特定できない場合:
{"productName":"","keywords":"","found":false}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ found: false });
  }
  const result = JSON.parse(jsonMatch[0]) as {
    productName: string;
    keywords: string;
    found: boolean;
  };
  return NextResponse.json(result);
}

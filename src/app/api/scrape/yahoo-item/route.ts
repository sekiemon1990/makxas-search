import { NextResponse } from "next/server";
import { scrapeYahooItem } from "@/lib/scrapers/yahoo-item";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireApiAuth } from "@/lib/auth/requireApiAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

type RequestBody = {
  id: string;
  isFleamarket?: boolean;
};

export async function POST(req: Request) {
  // 認証: ログイン済みユーザーのみ（環境監査 2026-06-11: 無認証露出の解消）
  const gate = await requireApiAuth();
  if (!gate.ok) return gate.response;

  const limited = enforceRateLimit(req, "scrape:yahoo-item", 60);
  if (limited) return limited;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id || !body.id.trim()) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }

  try {
    const detail = await scrapeYahooItem(
      body.id.trim(),
      Boolean(body.isFleamarket),
    );
    return NextResponse.json({ detail });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "商品詳細取得に失敗しました";
    console.error("[scrape/yahoo-item] error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { scrapeJimotyItem } from "@/lib/scrapers/jimoty-item";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireApiAuth } from "@/lib/auth/requireApiAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

type RequestBody = {
  url: string;
};

export async function POST(req: Request) {
  // 認証: ログイン済みユーザーのみ（環境監査 2026-06-11: 無認証露出の解消）
  const gate = await requireApiAuth();
  if (!gate.ok) return gate.response;

  const limited = enforceRateLimit(req, "scrape:jimoty-item", 60);
  if (limited) return limited;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.url || !body.url.trim()) {
    return NextResponse.json({ error: "url は必須です" }, { status: 400 });
  }
  // Jimoty 以外の URL を弾く (SSRF 対策)
  if (!/^https:\/\/jmty\.jp\//.test(body.url)) {
    return NextResponse.json(
      { error: "ジモティーの URL ではありません" },
      { status: 400 },
    );
  }

  try {
    const detail = await scrapeJimotyItem(body.url.trim());
    return NextResponse.json({ detail });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "商品詳細取得に失敗しました";
    console.error("[scrape/jimoty-item] error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

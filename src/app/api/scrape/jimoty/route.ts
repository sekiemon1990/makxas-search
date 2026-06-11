import { NextResponse } from "next/server";
import { scrapeJimoty } from "@/lib/scrapers/jimoty";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireApiAuth } from "@/lib/auth/requireApiAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

type RequestBody = {
  keyword: string;
  excludes?: string;
  limit?: number;
  status?: "sold" | "active" | "all";
  page?: number;
};

export async function POST(req: Request) {
  // 認証: ログイン済みユーザーのみ（環境監査 2026-06-11: 無認証露出の解消）
  const gate = await requireApiAuth();
  if (!gate.ok) return gate.response;

  const limited = enforceRateLimit(req, "scrape:jimoty", 30);
  if (limited) return limited;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.keyword || !body.keyword.trim()) {
    return NextResponse.json(
      { error: "keyword は必須です" },
      { status: 400 },
    );
  }

  try {
    const result = await scrapeJimoty({
      keyword: body.keyword.trim(),
      excludes: body.excludes,
      limit: body.limit ?? 30,
      status: body.status,
      page: body.page,
    });
    return NextResponse.json({ result });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "ジモティー取得に失敗しました";
    console.error("[scrape/jimoty] error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

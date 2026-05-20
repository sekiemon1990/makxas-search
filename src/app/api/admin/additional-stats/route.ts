import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireApiAuth } from "@/lib/auth/requireApiAuth";

export const runtime = "nodejs";

// GET /api/admin/additional-stats?days=90
// 追加買取統計を返す（管理画面用）
// 思想：「計測対象に追加買取指標を必ず含める」
export async function GET(req: NextRequest) {
  const gate = await requireApiAuth();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days = Number(daysParam ?? 90);
  if (!Number.isFinite(days) || days <= 0 || days > 365) {
    return NextResponse.json(
      { error: "days は 1〜365 の整数で指定してください" },
      { status: 400 }
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const service = createServiceClient();

  // 期間内の全 list_items を取得
  const { data: items, error } = await service
    .from("list_items")
    .select("id, list_id, search_id, is_additional, added_by_user_id, added_at")
    .gte("added_at", since.toISOString());

  if (error) {
    console.error("[admin/additional-stats] error:", error);
    return NextResponse.json(
      { error: "集計に失敗しました" },
      { status: 500 }
    );
  }

  const total = items?.length ?? 0;
  const additional = items?.filter((i) => i.is_additional).length ?? 0;
  const entry = total - additional;
  const additionalRate = total > 0 ? Math.round((additional / total) * 100) : 0;

  // ユーザー別ランキング
  const byUser = new Map<string, { total: number; additional: number }>();
  for (const i of items ?? []) {
    const uid = i.added_by_user_id ?? "unknown";
    const entry = byUser.get(uid) ?? { total: 0, additional: 0 };
    entry.total += 1;
    if (i.is_additional) entry.additional += 1;
    byUser.set(uid, entry);
  }

  // ユーザー名の解決
  const userIds = Array.from(byUser.keys()).filter((id) => id !== "unknown");
  let userNameMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    userNameMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.display_name ?? "名無し"])
    );
  }

  const userRanking = Array.from(byUser.entries())
    .map(([userId, stats]) => ({
      userId,
      userName: userId === "unknown" ? "(未記録)" : userNameMap[userId] ?? "名無し",
      total: stats.total,
      additional: stats.additional,
      additionalRate:
        stats.total > 0 ? Math.round((stats.additional / stats.total) * 100) : 0,
    }))
    .sort((a, b) => b.additional - a.additional)
    .slice(0, 10);

  // 月次推移（過去 days 日を月で分割）
  const byMonth = new Map<string, { total: number; additional: number }>();
  for (const i of items ?? []) {
    const month = i.added_at?.slice(0, 7) ?? "unknown"; // YYYY-MM
    const entry = byMonth.get(month) ?? { total: 0, additional: 0 };
    entry.total += 1;
    if (i.is_additional) entry.additional += 1;
    byMonth.set(month, entry);
  }
  const monthlyTrend = Array.from(byMonth.entries())
    .map(([month, stats]) => ({
      month,
      total: stats.total,
      additional: stats.additional,
      additionalRate:
        stats.total > 0 ? Math.round((stats.additional / stats.total) * 100) : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return NextResponse.json({
    days,
    summary: {
      total,
      entry,
      additional,
      additionalRate,
    },
    userRanking,
    monthlyTrend,
  });
}

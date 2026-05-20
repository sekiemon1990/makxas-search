import { NextRequest, NextResponse } from "next/server";
import { fetchContractedProjects } from "@/lib/core-rails/client";
import { aggregateProjects } from "@/lib/core-rails/aggregate";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/core-rails/item-stats?days=90
// 成約案件を backgroundCode × カテゴリで集計して返す
export async function GET(req: NextRequest) {
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
  const contractedAtGte = since.toISOString();

  try {
    const projects = await fetchContractedProjects(contractedAtGte);
    const stats = aggregateProjects(projects);
    return NextResponse.json({
      days,
      totalProjects: projects.length,
      stats,
    });
  } catch (e) {
    console.error("[core-rails/item-stats] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "集計に失敗しました" },
      { status: 500 }
    );
  }
}

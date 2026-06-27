import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/requireApiAuth";
import { fetchAssessmentPhaseBLoopReport } from "@/lib/assessment-phase-b-loop";

export const runtime = "nodejs";

// GET /api/admin/phase-b-reconciliation?days=31&ledgerLimit=500&assessedLimit=1000
// ADR-0009 Phase B: Decision Ledger 提案 × Gateway assessed_amount 突合レポートを返す。
// GATEWAY_BASE_URL / GATEWAY_SHARED_TOKEN が未設定の場合は status: skipped を返す。
export async function GET(req: NextRequest) {
  const gate = await requireApiAuth();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);

  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 31), 1),
    3650,
  );
  const ledgerLimit = Math.min(
    Math.max(Number(url.searchParams.get("ledgerLimit") ?? 500), 1),
    5000,
  );
  const assessedLimit = Math.min(
    Math.max(Number(url.searchParams.get("assessedLimit") ?? 1000), 1),
    5000,
  );

  try {
    const report = await fetchAssessmentPhaseBLoopReport({
      windowDays: days,
      ledgerLimit,
      assessedLimit,
    });
    return NextResponse.json(report);
  } catch (err) {
    console.error("[phase-b-reconciliation] error:", err);
    return NextResponse.json(
      { error: "Phase B reconciliation failed", detail: String(err) },
      { status: 502 },
    );
  }
}

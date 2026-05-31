import { NextRequest, NextResponse } from "next/server";
import { fetchContractedProjects } from "@/lib/core-rails/client";

// GET /api/core-rails/contracted-projects?days=30
export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const clampedDays = Math.min(Math.max(days, 1), 365);

  const from = new Date();
  from.setDate(from.getDate() - clampedDays);
  const contractedAtGte = from.toISOString();

  try {
    const projects = await fetchContractedProjects(contractedAtGte);
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[core-rails/contracted-projects] error:", err);
    return NextResponse.json(
      { error: "core-rails への接続に失敗しました" },
      { status: 502 }
    );
  }
}

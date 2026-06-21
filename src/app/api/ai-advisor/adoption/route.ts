import { NextResponse } from "next/server";
import {
  type AssessmentAdoptionDecision,
  buildAssessmentAdoptionPayload,
} from "@/lib/assessment-adoption";
import { requireApiAuth } from "@/lib/auth/requireApiAuth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type AdoptionRequestBody = {
  keyword?: unknown;
  productGuess?: unknown;
  decision?: unknown;
  listingsCount?: unknown;
  recommendation?: {
    rank?: unknown;
    price?: unknown;
    rate?: unknown;
    index?: unknown;
  };
};

function gatewayBaseUrl(): string {
  return (
    process.env.GATEWAY_BASE_URL?.trim() ||
    "https://makxas-integrations-gateway.vercel.app"
  ).replace(/\/+$/, "");
}

function gatewayToken(): string {
  return (
    process.env.MAKXAS_GATEWAY_API_KEY_SEARCH?.trim() ||
    process.env.GATEWAY_SHARED_TOKEN?.trim() ||
    ""
  );
}

function isDecision(value: unknown): value is AssessmentAdoptionDecision {
  return value === "accepted" || value === "rejected";
}

function numberField(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBody(body: AdoptionRequestBody) {
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const productGuess =
    typeof body.productGuess === "string" ? body.productGuess.trim() : undefined;
  const recommendation = body.recommendation;
  const rank =
    typeof recommendation?.rank === "string"
      ? recommendation.rank.trim()
      : "";
  const price = numberField(recommendation?.price);
  const rate = numberField(recommendation?.rate);
  const index = numberField(recommendation?.index);
  const listingsCount = numberField(body.listingsCount);

  if (!keyword || !isDecision(body.decision) || !rank || price === null || rate === null) {
    return null;
  }

  return {
    keyword,
    productGuess,
    decision: body.decision,
    listingsCount: listingsCount ?? 0,
    recommendation: {
      rank,
      price,
      rate,
      ...(index === null ? {} : { index }),
    },
  };
}

async function postToDecisionLedger(payload: ReturnType<typeof buildAssessmentAdoptionPayload>) {
  const token = gatewayToken();
  if (!token) {
    return { tracked: false, reason: "gateway_token_missing" as const };
  }

  try {
    const response = await fetch(`${gatewayBaseUrl()}/v1/judgments`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        "[ai-advisor-adoption] Decision Ledger POST failed:",
        response.status,
        detail.slice(0, 500),
      );
      return {
        tracked: false,
        reason: "gateway_error" as const,
        status: response.status,
      };
    }

    const body = (await response.json().catch(() => ({}))) as {
      judgment?: { id?: string };
    };
    return {
      tracked: true,
      judgmentId: body.judgment?.id ?? null,
    };
  } catch (error) {
    console.error("[ai-advisor-adoption] Decision Ledger POST error:", error);
    return { tracked: false, reason: "gateway_fetch_failed" as const };
  }
}

export async function POST(req: Request) {
  const gate = await requireApiAuth();
  if (!gate.ok) return gate.response;

  const limited = enforceRateLimit(req, "ai:advisor-adoption", 60);
  if (limited) return limited;

  let body: AdoptionRequestBody;
  try {
    body = (await req.json()) as AdoptionRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "keyword, decision, recommendation は必須です" },
      { status: 400 },
    );
  }

  const payload = buildAssessmentAdoptionPayload(parsed);
  const result = await postToDecisionLedger(payload);

  return NextResponse.json({
    ok: true,
    ...result,
    event: {
      domain: payload.domain,
      decision: payload.what.decision,
      recommendation_price: payload.what.recommendation_price,
    },
  });
}

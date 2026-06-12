import type { MikomikuEstimate } from "./estimate";
import type { RobustMarketStats } from "./types";
import type { VarianceResult, VarianceVerdict } from "./variance";

const DEFAULT_GATEWAY_BASE_URL =
  "https://makxas-integrations-gateway.vercel.app";
const DEFAULT_ACTOR = "makxas-search:objective-v1";
const NEEDS_CONFIRMATION_THRESHOLD_PCT = 30;

export type MikomikuJudgmentPayload = {
  domain: "mikomiku";
  what: {
    keyword: string;
    human_estimate: number;
    ai_objective: number;
    market_median: number;
    sample_size: number;
    ai_confidence: number;
  };
  why_source: "mikomiku_variance";
  actor: string;
  variance: {
    judgement: VarianceVerdict;
    deviation_pct: number;
  };
  needs_confirmation: boolean;
};

export type PostDecisionLedgerResult = "sent" | "skipped" | "failed";

type PostMikomikuJudgmentParams = {
  keyword: string;
  estimate: MikomikuEstimate;
  stats: RobustMarketStats;
  variance: VarianceResult;
  actor?: string | null;
  correlationId?: string;
};

function gatewayBaseUrl(): string {
  return (
    process.env.GATEWAY_BASE_URL?.trim() || DEFAULT_GATEWAY_BASE_URL
  ).replace(/\/+$/, "");
}

function gatewaySharedToken(): string {
  return process.env.GATEWAY_SHARED_TOKEN?.trim() ?? "";
}

function deviationPct(variance: VarianceResult): number {
  return Number((variance.deltaRatio * 100).toFixed(1));
}

export function buildMikomikuJudgmentPayload(
  params: PostMikomikuJudgmentParams,
): MikomikuJudgmentPayload {
  const pct = deviationPct(params.variance);

  return {
    domain: "mikomiku",
    what: {
      keyword: params.keyword,
      human_estimate: params.variance.humanEstimate,
      ai_objective: params.estimate.mikomiku,
      market_median: params.estimate.marketMedian,
      sample_size: params.stats.effectiveCount,
      ai_confidence: params.estimate.confidence,
    },
    why_source: "mikomiku_variance",
    actor: params.actor?.trim() || DEFAULT_ACTOR,
    variance: {
      judgement: params.variance.verdict,
      deviation_pct: pct,
    },
    needs_confirmation: Math.abs(pct) >= NEEDS_CONFIRMATION_THRESHOLD_PCT,
  };
}

export async function postMikomikuJudgmentToDecisionLedger(
  params: PostMikomikuJudgmentParams,
): Promise<PostDecisionLedgerResult> {
  const token = gatewaySharedToken();
  if (!token) return "skipped";

  const payload = buildMikomikuJudgmentPayload(params);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (params.correlationId) {
    headers["x-correlation-id"] = params.correlationId;
  }

  try {
    const response = await fetch(`${gatewayBaseUrl()}/v1/judgments`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await readResponseSnippet(response);
      console.error(
        "[mikomiku-decision-ledger] POST failed:",
        response.status,
        detail,
      );
      return "failed";
    }

    return "sent";
  } catch (error) {
    console.error("[mikomiku-decision-ledger] POST error:", error);
    return "failed";
  }
}

async function readResponseSnippet(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

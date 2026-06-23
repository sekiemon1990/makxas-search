import {
  type AssessmentAdoptionDecision,
  type AssessmentAdoptionMetricInput,
  redactLikelyPersonalInfo,
  summarizeAssessmentAdoptionMetrics,
} from "./assessment-adoption";
import type { AssessmentSuggestionForReconciliation } from "./assessment-reconciliation";

const DEFAULT_GATEWAY_BASE_URL =
  "https://makxas-integrations-gateway.vercel.app";
const ASSESSMENT_DOMAIN = "assessment_price_suggestion";
const DEFAULT_LIMIT = 100;
const HIGH_RISK_KEY_RE =
  /(address|customer|email|evidence|message|name|phone|raw|secret|summary|token|transcript)/i;

export type GatewayDecisionLedgerRecord = {
  id?: string;
  domain?: string;
  what?: unknown;
  created_at?: string;
};

export type AssessmentDecisionLedgerSummary = {
  status: "ok";
  domain: typeof ASSESSMENT_DOMAIN;
  totalRecords: number;
  usableRecords: number;
  skippedRecords: number;
  metrics: ReturnType<typeof summarizeAssessmentAdoptionMetrics>;
  sourcePointers: string[];
};

export type AssessmentDecisionLedgerReadResult =
  | AssessmentDecisionLedgerSummary
  | {
      status: "skipped";
      reason: "gateway_read_token_missing";
      domain: typeof ASSESSMENT_DOMAIN;
    };

type FetchAssessmentDecisionLedgerOptions = {
  baseUrl?: string;
  token?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
};

function gatewayBaseUrl(baseUrl?: string): string {
  return (baseUrl?.trim() || process.env.GATEWAY_BASE_URL?.trim() || DEFAULT_GATEWAY_BASE_URL)
    .replace(/\/+$/, "");
}

function gatewayReadToken(token?: string): string {
  return (
    token?.trim() ||
    process.env.GATEWAY_AGENT_READONLY_TOKEN?.trim() ||
    process.env.GATEWAY_SHARED_TOKEN?.trim() ||
    ""
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertSafeAssessmentLedgerWhat(what: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(what)) {
    if (HIGH_RISK_KEY_RE.test(key)) {
      throw new Error(`assessment decision ledger read blocked high-risk key: ${key}`);
    }
    if (typeof value === "string" && redactLikelyPersonalInfo(value) !== value.trim()) {
      throw new Error(`assessment decision ledger read blocked high-risk value at ${key}`);
    }
  }
}

function asDecision(value: unknown): AssessmentAdoptionDecision | null {
  return value === "accepted" || value === "rejected" ? value : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function assessmentMetricFromDecisionLedgerRecord(
  record: GatewayDecisionLedgerRecord,
): AssessmentAdoptionMetricInput | null {
  if (record.domain !== ASSESSMENT_DOMAIN || !isObject(record.what)) {
    return null;
  }
  assertSafeAssessmentLedgerWhat(record.what);

  const decision = asDecision(record.what.decision);
  const recommendationPrice = asNumber(record.what.recommendation_price);
  if (!decision || recommendationPrice === null) {
    return null;
  }

  return {
    decision,
    recommendationPrice,
  };
}

export function assessmentSuggestionFromDecisionLedgerRecord(
  record: GatewayDecisionLedgerRecord,
): AssessmentSuggestionForReconciliation | null {
  if (record.domain !== ASSESSMENT_DOMAIN || !record.id || !isObject(record.what)) {
    return null;
  }
  assertSafeAssessmentLedgerWhat(record.what);

  const recommendedPrice = asNumber(record.what.recommendation_price);
  if (recommendedPrice === null) return null;

  return {
    suggestionId: record.id,
    keyword: asNullableString(record.what.keyword) ?? "",
    projectId: asNullableString(record.what.project_id),
    itemId: asNullableString(record.what.item_id),
    recommendedPrice,
    recommendedRank: asNullableString(record.what.recommendation_rank) ?? undefined,
  };
}

export function summarizeAssessmentDecisionLedgerRecords(
  records: GatewayDecisionLedgerRecord[],
): AssessmentDecisionLedgerSummary {
  const metrics: AssessmentAdoptionMetricInput[] = [];
  const sourcePointers: string[] = [];
  let skippedRecords = 0;

  for (const record of records) {
    const metric = assessmentMetricFromDecisionLedgerRecord(record);
    if (!metric) {
      skippedRecords += 1;
      continue;
    }
    metrics.push(metric);
    if (record.id) {
      sourcePointers.push(`gateway:decision_ledger:${record.id}`);
    }
  }

  return {
    status: "ok",
    domain: ASSESSMENT_DOMAIN,
    totalRecords: records.length,
    usableRecords: metrics.length,
    skippedRecords,
    metrics: summarizeAssessmentAdoptionMetrics(metrics),
    sourcePointers,
  };
}

export async function fetchAssessmentDecisionLedgerSummary(
  options: FetchAssessmentDecisionLedgerOptions = {},
): Promise<AssessmentDecisionLedgerReadResult> {
  const token = gatewayReadToken(options.token);
  if (!token) {
    return {
      status: "skipped",
      reason: "gateway_read_token_missing",
      domain: ASSESSMENT_DOMAIN,
    };
  }

  const limit = Math.min(
    100,
    Math.max(1, Math.trunc(options.limit ?? DEFAULT_LIMIT)),
  );
  const url = new URL(`${gatewayBaseUrl(options.baseUrl)}/v1/judgments/recent`);
  url.searchParams.set("domain", ASSESSMENT_DOMAIN);
  url.searchParams.set("limit", String(limit));

  const response = await (options.fetchImpl ?? fetch)(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "x-makxas-caller-app": "makxas-search",
      "x-makxas-source-channel": "adr-0009-phase-b-readonly-reconciliation",
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Decision Ledger read failed: ${response.status} ${detail.slice(0, 300)}`,
    );
  }

  const body = (await response.json()) as { judgments?: GatewayDecisionLedgerRecord[] };
  return summarizeAssessmentDecisionLedgerRecords(body.judgments ?? []);
}

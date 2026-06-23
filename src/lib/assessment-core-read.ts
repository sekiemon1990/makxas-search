import type { CoreAssessedAmountRecord } from "./assessment-reconciliation";

const DEFAULT_GATEWAY_BASE_URL =
  "https://makxas-integrations-gateway.vercel.app";
const DEFAULT_DATABASE_ID = 3;
const DEFAULT_DAYS = 180;
const DEFAULT_LIMIT = 500;
const FORBIDDEN_COLUMN_RE =
  /(address|customer|email|memo|message|name|note|phone|raw|summary|tel|token|transcript)/i;

export type AssessmentCoreReadResult =
  | {
      status: "ok";
      database: number;
      auditId: string | null;
      records: CoreAssessedAmountRecord[];
    }
  | {
      status: "skipped";
      reason: "gateway_read_token_missing";
      records: [];
    };

type FetchAssessmentCoreAssessedAmountOptions = {
  baseUrl?: string;
  token?: string;
  database?: number;
  days?: number;
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
    process.env.GATEWAY_BI_READONLY_TOKEN?.trim() ||
    process.env.GATEWAY_SHARED_TOKEN?.trim() ||
    process.env.MAKXAS_INTEGRATIONS_GATEWAY_TOKEN?.trim() ||
    ""
  );
}

function positiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(parsed)));
}

export function buildAssessedAmountReadSql({
  days = DEFAULT_DAYS,
  limit = DEFAULT_LIMIT,
}: {
  days?: number;
  limit?: number;
} = {}): string {
  const safeDays = positiveInteger(days, DEFAULT_DAYS, 3650);
  const safeLimit = positiveInteger(limit, DEFAULT_LIMIT, 5000);
  return `
SELECT
  id::text AS project_id,
  NULL::text AS item_id,
  assessed_amount,
  contracted_at::text AS contracted_at
FROM projects
WHERE assessed_amount IS NOT NULL
  AND contracted_at >= current_date - interval '${safeDays} days'
ORDER BY contracted_at DESC
LIMIT ${safeLimit}
`.trim();
}

function assertNoLikelyPiiColumns(cols: unknown): void {
  if (!Array.isArray(cols)) {
    throw new Error("assessed_amount read requires column metadata");
  }
  const forbidden = cols.filter((col) => FORBIDDEN_COLUMN_RE.test(String(col)));
  if (forbidden.length > 0) {
    throw new Error(`assessed_amount read blocked likely PII columns: ${forbidden.join(", ")}`);
  }
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function amount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export function normalizeAssessedAmountRows(result: {
  cols?: unknown;
  rows?: unknown;
}): CoreAssessedAmountRecord[] {
  assertNoLikelyPiiColumns(result.cols);
  if (!Array.isArray(result.rows)) return [];

  return result.rows
    .filter((row): row is Record<string, unknown> =>
      row !== null && typeof row === "object" && !Array.isArray(row),
    )
    .map((row) => ({
      projectId: stringOrNull(row.project_id) ?? "",
      itemId: stringOrNull(row.item_id),
      assessedAmount: amount(row.assessed_amount),
      contractedAt: stringOrNull(row.contracted_at),
    }))
    .filter((row) => row.projectId && row.assessedAmount > 0);
}

export async function fetchGatewayAssessedAmountRecords(
  options: FetchAssessmentCoreAssessedAmountOptions = {},
): Promise<AssessmentCoreReadResult> {
  const token = gatewayReadToken(options.token);
  if (!token) {
    return {
      status: "skipped",
      reason: "gateway_read_token_missing",
      records: [],
    };
  }

  const database = positiveInteger(
    options.database ?? process.env.METABASE_CORE_DATABASE_ID ?? process.env.METABASE_DATABASE_ID,
    DEFAULT_DATABASE_ID,
    1000,
  );
  const response = await (options.fetchImpl ?? fetch)(
    `${gatewayBaseUrl(options.baseUrl)}/v1/metabase/query`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-makxas-caller-app": "makxas-search",
        "x-makxas-source-channel": "adr-0009-phase-b-assessed-amount-read",
      },
      body: JSON.stringify({
        sql: buildAssessedAmountReadSql({
          days: options.days,
          limit: options.limit,
        }),
        database,
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gateway assessed_amount read failed: ${response.status} ${detail.slice(0, 300)}`);
  }

  const body = (await response.json()) as {
    audit_id?: string;
    result?: { cols?: unknown; rows?: unknown };
  };
  return {
    status: "ok",
    database,
    auditId: body.audit_id ?? null,
    records: normalizeAssessedAmountRows(body.result ?? {}),
  };
}

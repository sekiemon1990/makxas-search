#!/usr/bin/env node

const DEFAULT_GATEWAY_BASE_URL = 'https://makxas-integrations-gateway.vercel.app';
const DEFAULT_DATABASE_ID = 3;
const DOMAIN = 'assessment_price_suggestion';
const DEFAULT_WINDOW_DAYS = 31;
const DEFAULT_LEDGER_LIMIT = 500;
const DEFAULT_ASSESSED_LIMIT = 1000;
const HIGH_RISK_KEY_RE =
  /(address|customer|email|evidence|message|name|phone|raw|secret|summary|token|transcript)/i;
const FORBIDDEN_COLUMN_RE =
  /(address|customer|email|memo|message|name|note|phone|raw|summary|tel|token|transcript)/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g;
const ZIP_RE = /\b\d{3}-?\d{4}\b/g;

function positiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(parsed)));
}

function gatewayBaseUrl() {
  return (process.env.GATEWAY_BASE_URL?.trim() || DEFAULT_GATEWAY_BASE_URL).replace(/\/+$/, '');
}

function decisionLedgerToken() {
  return (
    process.env.GATEWAY_AGENT_READONLY_TOKEN?.trim() ||
    process.env.GATEWAY_SHARED_TOKEN?.trim() ||
    ''
  );
}

function assessedAmountToken() {
  return (
    process.env.GATEWAY_AGENT_READONLY_TOKEN?.trim() ||
    process.env.GATEWAY_BI_READONLY_TOKEN?.trim() ||
    process.env.GATEWAY_SHARED_TOKEN?.trim() ||
    process.env.MAKXAS_INTEGRATIONS_GATEWAY_TOKEN?.trim() ||
    ''
  );
}

function redactLikelyPersonalInfo(value) {
  return value
    .replace(EMAIL_RE, '[redacted_email]')
    .replace(PHONE_RE, '[redacted_phone]')
    .replace(ZIP_RE, '[redacted_zip]')
    .trim();
}

function assertSafeWhat(what) {
  for (const [key, value] of Object.entries(what)) {
    if (HIGH_RISK_KEY_RE.test(key)) {
      throw new Error(`assessment decision ledger read blocked high-risk key: ${key}`);
    }
    if (typeof value === 'string' && redactLikelyPersonalInfo(value) !== value.trim()) {
      throw new Error(`assessment decision ledger read blocked high-risk value at ${key}`);
    }
  }
}

function assertSafeColumns(cols) {
  if (!Array.isArray(cols)) throw new Error('assessed_amount read requires column metadata');
  const forbidden = cols.filter((col) => FORBIDDEN_COLUMN_RE.test(String(col)));
  if (forbidden.length > 0) {
    throw new Error(`assessed_amount read blocked likely PII columns: ${forbidden.join(', ')}`);
  }
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function stringOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildAssessedAmountSql({ days, limit }) {
  return `
SELECT
  id::text AS project_id,
  NULL::text AS item_id,
  assessed_amount,
  contracted_at::text AS contracted_at
FROM projects
WHERE assessed_amount IS NOT NULL
  AND contracted_at >= current_date - interval '${days} days'
ORDER BY contracted_at DESC
LIMIT ${limit}
`.trim();
}

function summarizeLedger(records) {
  let accepted = 0;
  let rejected = 0;
  let acceptedSuggestedTotal = 0;
  let skippedRecords = 0;
  const suggestions = [];
  const sourcePointers = [];

  for (const record of records) {
    if (record?.domain !== DOMAIN || !record.what || typeof record.what !== 'object' || Array.isArray(record.what)) {
      skippedRecords += 1;
      continue;
    }
    assertSafeWhat(record.what);
    const decision = record.what.decision;
    const recommendedPrice = amount(record.what.recommendation_price);
    if ((decision !== 'accepted' && decision !== 'rejected') || recommendedPrice <= 0) {
      skippedRecords += 1;
      continue;
    }
    if (decision === 'accepted') {
      accepted += 1;
      acceptedSuggestedTotal += recommendedPrice;
    } else {
      rejected += 1;
    }
    if (record.id) sourcePointers.push(`gateway:decision_ledger:${record.id}`);
    suggestions.push({
      suggestionId: String(record.id || `ledger-${suggestions.length + 1}`),
      projectId: stringOrNull(record.what.project_id),
      itemId: stringOrNull(record.what.item_id),
      recommendedPrice,
      recommendedRank: stringOrNull(record.what.recommendation_rank) || undefined,
    });
  }

  const total = accepted + rejected;
  return {
    status: 'ok',
    domain: DOMAIN,
    totalRecords: records.length,
    usableRecords: total,
    skippedRecords,
    metrics: {
      total,
      accepted,
      rejected,
      adoptionRatePct: total === 0 ? 0 : Number(((accepted / total) * 100).toFixed(1)),
      acceptedSuggestedTotal,
    },
    sourcePointers,
    suggestions,
  };
}

function normalizeAssessedRows(result) {
  assertSafeColumns(result?.cols);
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  return rows
    .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    .map((row) => ({
      projectId: stringOrNull(row.project_id) || '',
      itemId: stringOrNull(row.item_id),
      assessedAmount: amount(row.assessed_amount),
      contractedAt: stringOrNull(row.contracted_at),
    }))
    .filter((row) => row.projectId && row.assessedAmount > 0);
}

function pointerMatches(suggestion, assessed) {
  if (suggestion.itemId && assessed.itemId) return suggestion.itemId === assessed.itemId;
  return Boolean(suggestion.projectId && suggestion.projectId === assessed.projectId);
}

function reconcile(suggestions, assessedRecords) {
  const results = [];
  for (const suggestion of suggestions) {
    const assessed = assessedRecords.find((record) => pointerMatches(suggestion, record));
    if (!assessed) continue;
    const lowerBound = Math.round(suggestion.recommendedPrice * 0.9);
    const upperBound = Math.round(suggestion.recommendedPrice * 1.1);
    const adopted = assessed.assessedAmount >= lowerBound && assessed.assessedAmount <= upperBound;
    results.push({
      suggestionId: suggestion.suggestionId,
      projectId: assessed.projectId,
      itemId: assessed.itemId ?? null,
      suggestedPrice: suggestion.recommendedPrice,
      assessedAmount: assessed.assessedAmount,
      lowerBound,
      upperBound,
      adopted,
      deviationPct: Number((((assessed.assessedAmount - suggestion.recommendedPrice) / suggestion.recommendedPrice) * 100).toFixed(1)),
    });
  }
  return results;
}

function summarizeReconciliation(results) {
  const total = results.length;
  const adopted = results.filter((result) => result.adopted).length;
  return {
    total,
    adopted,
    notAdopted: total - adopted,
    adoptionRatePct: total === 0 ? 0 : Number(((adopted / total) * 100).toFixed(1)),
    averageAbsDeviationPct:
      total === 0
        ? 0
        : Number((results.reduce((sum, result) => sum + Math.abs(result.deviationPct), 0) / total).toFixed(1)),
  };
}

async function fetchDecisionLedger({ limit }) {
  const token = decisionLedgerToken();
  if (!token) {
    return {
      status: 'skipped',
      reason: 'gateway_read_token_missing',
      domain: DOMAIN,
      suggestions: [],
    };
  }
  const url = new URL(`${gatewayBaseUrl()}/v1/judgments/recent`);
  url.searchParams.set('domain', DOMAIN);
  url.searchParams.set('limit', String(limit));
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'x-makxas-caller-app': 'makxas-search',
      'x-makxas-source-channel': 'adr-0009-phase-b-monthly-loop',
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Decision Ledger read failed: ${response.status} ${detail.slice(0, 300)}`);
  }
  const body = await response.json();
  return summarizeLedger(body.judgments ?? []);
}

async function fetchAssessedAmount({ days, limit }) {
  const token = assessedAmountToken();
  if (!token) {
    return {
      status: 'skipped',
      reason: 'gateway_read_token_missing',
      records: [],
    };
  }
  const database = positiveInteger(
    process.env.METABASE_CORE_DATABASE_ID || process.env.METABASE_DATABASE_ID,
    DEFAULT_DATABASE_ID,
    1000,
  );
  const response = await fetch(`${gatewayBaseUrl()}/v1/metabase/query`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-makxas-caller-app': 'makxas-search',
      'x-makxas-source-channel': 'adr-0009-phase-b-monthly-loop',
    },
    body: JSON.stringify({
      sql: buildAssessedAmountSql({ days, limit }),
      database,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gateway assessed_amount read failed: ${response.status} ${detail.slice(0, 300)}`);
  }
  const body = await response.json();
  return {
    status: 'ok',
    database,
    auditId: body.audit_id ?? null,
    records: normalizeAssessedRows(body.result ?? {}),
  };
}

const windowDays = positiveInteger(process.env.ASSESSMENT_PHASE_B_WINDOW_DAYS, DEFAULT_WINDOW_DAYS, 3650);
const ledgerLimit = positiveInteger(process.env.ASSESSMENT_PHASE_B_LEDGER_LIMIT, DEFAULT_LEDGER_LIMIT, 5000);
const assessedLimit = positiveInteger(process.env.ASSESSMENT_PHASE_B_ASSESSED_LIMIT, DEFAULT_ASSESSED_LIMIT, 5000);
const ledger = await fetchDecisionLedger({ limit: ledgerLimit });
const assessed = await fetchAssessedAmount({ days: windowDays, limit: assessedLimit });
const reconciled = reconcile(ledger.suggestions ?? [], assessed.records ?? []);
const reconciliation = summarizeReconciliation(reconciled);
const readiness = {
  decisionLedgerRead: ledger.status === 'ok',
  assessedAmountRead: assessed.status === 'ok',
  reconciliationConnected: reconciliation.total > 0,
  monthlyJobReady: ledger.status === 'ok' && assessed.status === 'ok',
};
const status = readiness.monthlyJobReady ? 'ok' : readiness.decisionLedgerRead || readiness.assessedAmountRead ? 'partial' : 'skipped';
const safeNextAction =
  status === 'ok'
    ? 'monthly_phase_b_loop_ready'
    : !readiness.decisionLedgerRead && !readiness.assessedAmountRead
      ? 'configure_gateway_read_tokens_for_search'
      : !readiness.decisionLedgerRead
        ? 'configure_decision_ledger_read_token'
        : !readiness.assessedAmountRead
          ? 'configure_gateway_assessed_amount_read_token'
          : 'collect_matching_project_or_item_ids';

const report = {
  status,
  generatedAt: new Date().toISOString(),
  windowDays,
  ledgerLimit,
  assessedLimit,
  decisionLedger: ledger,
  assessedAmount: assessed,
  suggestionCount: ledger.suggestions?.length ?? 0,
  assessedRecordCount: assessed.records?.length ?? 0,
  reconciliation,
  reconciledSamples: reconciled.slice(0, 10),
  readiness,
  piiBoundary: 'Decision Ledger allowlisted fields + Gateway project_id/item_id/assessed_amount/contracted_at only.',
  safeNextAction,
};

console.log(JSON.stringify(report, null, 2));
console.log(
  [
    'summary',
    `status=${report.status}`,
    `ledger=${readiness.decisionLedgerRead ? 'ok' : 'skipped'}`,
    `assessed=${readiness.assessedAmountRead ? 'ok' : 'skipped'}`,
    `reconciled=${reconciliation.total}`,
    `adoptionRatePct=${reconciliation.adoptionRatePct}`,
    `next=${safeNextAction}`,
  ].join('\t'),
);

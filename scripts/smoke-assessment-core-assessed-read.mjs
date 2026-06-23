const DEFAULT_GATEWAY_BASE_URL = 'https://makxas-integrations-gateway.vercel.app';
const DEFAULT_DATABASE_ID = 3;
const FORBIDDEN_COLUMN_RE =
  /(address|customer|email|memo|message|name|note|phone|raw|summary|tel|token|transcript)/i;

function token() {
  return (
    process.env.GATEWAY_AGENT_READONLY_TOKEN?.trim() ||
    process.env.GATEWAY_BI_READONLY_TOKEN?.trim() ||
    process.env.GATEWAY_SHARED_TOKEN?.trim() ||
    process.env.MAKXAS_INTEGRATIONS_GATEWAY_TOKEN?.trim() ||
    ''
  );
}

function baseUrl() {
  return (process.env.GATEWAY_BASE_URL?.trim() || DEFAULT_GATEWAY_BASE_URL).replace(/\/+$/, '');
}

function positiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(parsed)));
}

function sql() {
  const days = positiveInteger(process.env.METABASE_CORE_ASSESSED_AMOUNT_DAYS, 180, 3650);
  const limit = positiveInteger(process.env.METABASE_CORE_ASSESSED_AMOUNT_LIMIT, 500, 5000);
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

function assertSafeColumns(cols) {
  if (!Array.isArray(cols)) throw new Error('assessed_amount read requires column metadata');
  const forbidden = cols.filter((col) => FORBIDDEN_COLUMN_RE.test(String(col)));
  if (forbidden.length > 0) {
    throw new Error(`assessed_amount read blocked likely PII columns: ${forbidden.join(', ')}`);
  }
}

const readToken = token();
if (!readToken) {
  console.log(JSON.stringify({
    status: 'skipped',
    reason: 'gateway_read_token_missing',
    records: [],
  }, null, 2));
  process.exit(0);
}

const database = positiveInteger(
  process.env.METABASE_CORE_DATABASE_ID || process.env.METABASE_DATABASE_ID,
  DEFAULT_DATABASE_ID,
  1000,
);
const response = await fetch(`${baseUrl()}/v1/metabase/query`, {
  method: 'POST',
  headers: {
    accept: 'application/json',
    authorization: `Bearer ${readToken}`,
    'content-type': 'application/json',
    'x-makxas-caller-app': 'makxas-search',
    'x-makxas-source-channel': 'adr-0009-phase-b-assessed-amount-read',
  },
  body: JSON.stringify({ sql: sql(), database }),
});

if (!response.ok) {
  const detail = await response.text().catch(() => '');
  throw new Error(`Gateway assessed_amount read failed: ${response.status} ${detail.slice(0, 300)}`);
}

const body = await response.json();
assertSafeColumns(body.result?.cols);
const rows = Array.isArray(body.result?.rows) ? body.result.rows : [];
const usable = rows.filter((row) => row?.project_id && Number(row.assessed_amount) > 0);
console.log(JSON.stringify({
  status: 'ok',
  database,
  auditId: body.audit_id ?? null,
  totalRows: rows.length,
  usableRows: usable.length,
  piiBoundary: 'project_id/item_id/assessed_amount/contracted_at only; customer/contact/transcript columns are blocked.',
}, null, 2));

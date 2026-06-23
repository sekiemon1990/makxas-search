const DEFAULT_GATEWAY_BASE_URL =
  'https://makxas-integrations-gateway.vercel.app';
const DOMAIN = 'assessment_price_suggestion';
const HIGH_RISK_KEY_RE =
  /(address|customer|email|evidence|message|name|phone|raw|secret|summary|token|transcript)/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g;
const ZIP_RE = /\b\d{3}-?\d{4}\b/g;

function gatewayBaseUrl() {
  return (process.env.GATEWAY_BASE_URL?.trim() || DEFAULT_GATEWAY_BASE_URL).replace(/\/+$/, '');
}

function gatewayReadToken() {
  return (
    process.env.GATEWAY_AGENT_READONLY_TOKEN?.trim() ||
    process.env.GATEWAY_SHARED_TOKEN?.trim() ||
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

function summarize(records) {
  let accepted = 0;
  let rejected = 0;
  let acceptedSuggestedTotal = 0;
  let skippedRecords = 0;
  const sourcePointers = [];

  for (const record of records) {
    if (record?.domain !== DOMAIN || !record.what || typeof record.what !== 'object' || Array.isArray(record.what)) {
      skippedRecords += 1;
      continue;
    }
    assertSafeWhat(record.what);
    const decision = record.what.decision;
    const recommendationPrice = Number(record.what.recommendation_price);
    if ((decision !== 'accepted' && decision !== 'rejected') || !Number.isFinite(recommendationPrice)) {
      skippedRecords += 1;
      continue;
    }
    if (decision === 'accepted') {
      accepted += 1;
      acceptedSuggestedTotal += Math.max(0, Math.round(recommendationPrice));
    } else {
      rejected += 1;
    }
    if (record.id) sourcePointers.push(`gateway:decision_ledger:${record.id}`);
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
  };
}

const token = gatewayReadToken();
if (!token) {
  console.log(JSON.stringify({
    status: 'skipped',
    reason: 'gateway_read_token_missing',
    domain: DOMAIN,
  }, null, 2));
  process.exit(0);
}

const url = new URL(`${gatewayBaseUrl()}/v1/judgments/recent`);
url.searchParams.set('domain', DOMAIN);
url.searchParams.set('limit', '100');

const response = await fetch(url, {
  method: 'GET',
  headers: {
    authorization: `Bearer ${token}`,
    'x-makxas-caller-app': 'makxas-search',
    'x-makxas-source-channel': 'adr-0009-phase-b-readonly-reconciliation',
  },
});

if (!response.ok) {
  const detail = await response.text().catch(() => '');
  throw new Error(`Decision Ledger read failed: ${response.status} ${detail.slice(0, 300)}`);
}

const body = await response.json();
const result = summarize(body.judgments ?? []);
console.log(JSON.stringify(result, null, 2));
console.log(
  [
    'summary',
    `domain=${result.domain}`,
    `total=${result.metrics.total}`,
    `accepted=${result.metrics.accepted}`,
    `rejected=${result.metrics.rejected}`,
    `adoptionRatePct=${result.metrics.adoptionRatePct}`,
  ].join('\t'),
);

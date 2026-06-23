#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://makxas-search.vercel.app';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function normalizeBaseUrl(input = DEFAULT_BASE_URL) {
  const raw = String(input || '').trim() || DEFAULT_BASE_URL;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Unsupported production URL protocol: ${url.protocol}`);
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

export function classifyHealth({ status, body }) {
  const ok = status === 200 && body?.service === 'makxas-search' && body?.status === 'ok';
  return {
    ok,
    reason: ok ? 'verified' : 'unexpected_health',
    status,
    service: body?.service ?? null,
    env_ok: body?.envOk ?? null,
  };
}

export function classifyLoginRedirect({ status, location, baseURL, expectedNext }) {
  const normalizedBase = normalizeBaseUrl(baseURL);
  if (!REDIRECT_STATUSES.has(status)) {
    return {
      ok: false,
      reason: 'expected_redirect',
      status,
      location: location || null,
      expected_next: expectedNext,
    };
  }
  if (!location) {
    return {
      ok: false,
      reason: 'missing_location',
      status,
      location: null,
      expected_next: expectedNext,
    };
  }
  const redirectUrl = new URL(location, normalizedBase);
  const next = redirectUrl.searchParams.get('next');
  if (redirectUrl.origin !== new URL(normalizedBase).origin) {
    return {
      ok: false,
      reason: 'cross_origin_redirect',
      status,
      location: redirectUrl.toString(),
      expected_next: expectedNext,
    };
  }
  if (redirectUrl.pathname !== '/login') {
    return {
      ok: false,
      reason: 'not_login_redirect',
      status,
      location: redirectUrl.toString(),
      expected_next: expectedNext,
    };
  }
  if (next !== expectedNext) {
    return {
      ok: false,
      reason: 'next_mismatch',
      status,
      location: redirectUrl.toString(),
      actual_next: next,
      expected_next: expectedNext,
    };
  }
  return {
    ok: true,
    reason: 'verified',
    status,
    location: redirectUrl.toString(),
    expected_next: expectedNext,
  };
}

export function classifyLoginPage({ status, body }) {
  const hasLoginCopy = typeof body === 'string' &&
    (body.includes('Google') || body.includes('ログイン') || body.includes('メールアドレス'));
  const hasNextShell = typeof body === 'string' &&
    body.includes('<!DOCTYPE html>') &&
    body.includes('lang="ja"') &&
    body.includes('/_next/static/');
  const hasLoginSurface = hasLoginCopy || hasNextShell;
  return {
    ok: status === 200 && hasLoginSurface,
    reason: status === 200 && hasLoginSurface ? 'verified' : 'login_page_unexpected',
    status,
    has_login_copy: hasLoginCopy,
    has_next_shell: hasNextShell,
  };
}

async function fetchGet(url, { redirect = 'manual', json = false } = {}) {
  const response = await fetch(url, {
    method: 'GET',
    redirect,
    headers: {
      accept: json ? 'application/json' : 'text/html,application/json',
      'cache-control': 'no-store',
      'user-agent': 'makxas-search-verify-production/1.0',
    },
  });
  if (json) {
    const body = await response.json().catch(() => null);
    return { status: response.status, body, location: response.headers.get('location') };
  }
  const body = await response.text().catch(() => '');
  return { status: response.status, body, location: response.headers.get('location') };
}

async function verifyProduction({ baseURL = process.env.SEARCH_PRODUCTION_URL || DEFAULT_BASE_URL } = {}) {
  const baseUrl = normalizeBaseUrl(baseURL);
  const checks = [];

  const health = await fetchGet(`${baseUrl}/api/health`, { json: true });
  checks.push({ name: 'health', ...classifyHealth(health) });

  const search = await fetchGet(`${baseUrl}/search`);
  checks.push({
    name: 'auth_gate:/search',
    ...classifyLoginRedirect({
      status: search.status,
      location: search.location,
      baseURL: baseUrl,
      expectedNext: '/search',
    }),
  });

  const login = await fetchGet(`${baseUrl}/login`, { redirect: 'follow' });
  checks.push({ name: 'login_page', ...classifyLoginPage(login) });

  const ok = checks.every((check) => check.ok);
  return {
    ok,
    service: 'makxas-search',
    production: ok ? 'ok' : 'failed',
    ui: checks.find((check) => check.name === 'login_page')?.ok ? 'login_page_ok' : 'login_page_failed',
    function: checks.find((check) => check.name === 'health')?.ok ? 'health_ok' : 'health_failed',
    db: 'not_touched',
    secret_pii: 'ok',
    evidence: {
      base_url: baseUrl,
      checked_paths: ['/api/health', '/search', '/login'],
      http_methods: ['GET'],
      write_requests: 0,
      external_ai_calls: 0,
      scraping_calls: 0,
      checks,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = await verifyProduction({ baseURL: process.argv[2] });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      service: 'makxas-search',
      production: 'failed',
      ui: 'unknown',
      function: 'unknown',
      db: 'not_touched',
      secret_pii: 'ok',
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exit(1);
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyHealth,
  classifyLoginPage,
  classifyLoginRedirect,
  normalizeBaseUrl,
} from './verify-production.mjs';

test('normalizeBaseUrl strips trailing slashes', () => {
  assert.equal(
    normalizeBaseUrl(' https://makxas-search.vercel.app/// '),
    'https://makxas-search.vercel.app',
  );
});

test('classifyHealth accepts only the healthy makxas-search payload', () => {
  assert.equal(classifyHealth({ status: 200, body: { service: 'makxas-search', status: 'ok', envOk: true } }).ok, true);
  assert.equal(classifyHealth({ status: 503, body: { service: 'makxas-search', status: 'degraded' } }).ok, false);
});

test('classifyLoginRedirect requires same-origin login next preservation', () => {
  assert.equal(
    classifyLoginRedirect({
      status: 307,
      location: 'https://makxas-search.vercel.app/login?next=%2Fsearch',
      baseURL: 'https://makxas-search.vercel.app',
      expectedNext: '/search',
    }).ok,
    true,
  );
  assert.equal(
    classifyLoginRedirect({
      status: 307,
      location: 'https://example.com/login?next=%2Fsearch',
      baseURL: 'https://makxas-search.vercel.app',
      expectedNext: '/search',
    }).reason,
    'cross_origin_redirect',
  );
});

test('classifyLoginPage accepts recognizable login copy', () => {
  assert.equal(classifyLoginPage({ status: 200, body: 'Google でログイン' }).ok, true);
  assert.equal(classifyLoginPage({ status: 404, body: 'Google でログイン' }).ok, false);
});

test('classifyLoginPage accepts a Japanese Next.js app shell', () => {
  assert.equal(
    classifyLoginPage({
      status: 200,
      body: '<!DOCTYPE html><html lang="ja"><script src="/_next/static/chunks/app.js"></script></html>',
    }).ok,
    true,
  );
});

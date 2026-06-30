#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname), "..");
const policyPath = path.join(root, "registry", "visual-evidence-policy.json");
const args = process.argv.slice(2);
const argSet = new Set(args);
let cliOptionsEnabled = false;
let policyCache = null;
let policyFallbackWarned = false;

if (isMain()) {
  main();
}

function main() {
  cliOptionsEnabled = true;
  if (argSet.has("--help")) {
    globalThis.console.log(`visual-evidence-manifest.mjs

Usage:
  node scripts/visual-evidence-manifest.mjs --out test-results/visual-evidence-manifest.json --route /auth/login --viewport desktop --evidence-root test-results
  node scripts/visual-evidence-manifest.mjs --input test-results/visual-evidence-manifest.json

This script stores derived metadata only. It never reads or writes secrets.`);
    process.exit(0);
  }

  try {
    if (valueFor("--input")) {
      const manifest = JSON.parse(fs.readFileSync(valueFor("--input"), "utf8"));
      const report = validateManifest(manifest);
      globalThis.console.log(JSON.stringify(report, null, 2));
      process.exit(report.valid ? 0 : 1);
    }

    const manifest = buildManifest();
    const report = validateManifest(manifest);
    if (!report.valid) {
      globalThis.console.error(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const outPath = path.resolve(
      process.cwd(),
      valueFor("--out") ?? "test-results/visual-evidence-manifest.json",
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
    writeGithubOutput({
      manifest_path: outPath,
      contains_sensitive: String(manifest.contains_sensitive),
      redaction_status: manifest.redaction_status,
    });
    globalThis.console.log(
      JSON.stringify(
        { valid: true, path: outPath, contains_sensitive: manifest.contains_sensitive },
        null,
        2,
      ),
    );
  } catch (error) {
    globalThis.console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export function buildManifest(overrides = {}) {
  const now = new Date();
  const createdAt = now.toISOString();
  const evidenceIdValue = overrides.evidence_id ?? valueFor("--evidence-id") ?? evidenceId(now);
  const retentionDays = intValue("--retention-days", 14);
  const artifactRetentionUntil = new Date(
    now.getTime() + retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rawRoute = overrides.route ?? valueFor("--route") ?? process.env.E2E_ROUTE ?? "/";
  const containsPii = boolValue("--contains-pii", false) || bool(overrides.contains_pii);
  const containsSecret = boolValue("--contains-secret", false) || bool(overrides.contains_secret);
  const routeSensitive = isSensitiveRoute(rawRoute);
  const explicitSensitive =
    boolValue("--contains-sensitive", false) || bool(overrides.contains_sensitive);
  const containsSensitive = containsPii || containsSecret || routeSensitive || explicitSensitive;
  const route = sanitizeRouteForManifest(rawRoute, containsSensitive);
  const redactionStatus = containsSensitive
    ? "blocked_sensitive"
    : (overrides.redaction_status ?? valueFor("--redaction-status") ?? "not_needed");
  const evidenceRoot = overrides.evidence_root ?? valueFor("--evidence-root");
  const safeArtifactUrl = defaultArtifactUrl();
  const artifactUrl = containsSensitive
    ? null
    : (overrides.artifact_url ?? valueFor("--artifact-url") ?? safeArtifactUrl);
  const traceUrl = containsSensitive
    ? null
    : (overrides.trace_url ?? valueFor("--trace-url") ?? null);
  const thumbnailUrl = containsSensitive
    ? null
    : (overrides.thumbnail_url ?? valueFor("--thumbnail-url") ?? null);

  return {
    schema: "makxas.visual_evidence.manifest.v1",
    evidence_id: evidenceIdValue,
    repo: overrides.repo ?? valueFor("--repo") ?? inferRepo(),
    branch: overrides.branch ?? valueFor("--branch") ?? inferBranch(),
    source: overrides.source ?? valueFor("--source") ?? "github_artifact",
    kind: containsSensitive
      ? "blocked_sensitive"
      : (overrides.kind ?? valueFor("--kind") ?? "trace"),
    artifact_url: artifactUrl,
    thumbnail_url: thumbnailUrl,
    trace_url: traceUrl,
    route,
    viewport: overrides.viewport ?? valueFor("--viewport") ?? process.env.E2E_VIEWPORT ?? "desktop",
    created_at: createdAt,
    retention: `${retentionDays}d`,
    artifact_retention_until: artifactRetentionUntil,
    redaction_status: redactionStatus,
    contains_sensitive: containsSensitive,
    contains_pii: containsPii,
    contains_secret: containsSecret,
    ocr_summary:
      overrides.ocr_summary ??
      valueFor("--ocr-summary") ??
      defaultSummary({ containsSensitive, route }),
    console_error_count: intValue(
      "--console-error-count",
      Number(overrides.console_error_count ?? 0),
    ),
    network_error_count: intValue(
      "--network-error-count",
      Number(overrides.network_error_count ?? 0),
    ),
    sha256:
      overrides.sha256 ??
      valueFor("--sha256") ??
      evidenceSha256(evidenceRoot, {
        route,
        containsSensitive,
        evidence_id: evidenceIdValue,
        created_at: createdAt,
      }),
    verification: {
      ui:
        overrides.verification?.ui ??
        overrides.ui ??
        valueFor("--ui") ??
        (containsSensitive ? "blocked_sensitive" : "unknown"),
      function:
        overrides.verification?.function ??
        overrides.function ??
        valueFor("--function") ??
        "unknown",
      db: overrides.verification?.db ?? overrides.db ?? valueFor("--db") ?? "no_db_impact",
      notes: overrides.verification?.notes ?? overrides.notes ?? valueFor("--notes") ?? "",
    },
    metadata: {
      generator: "scripts/visual-evidence-manifest.mjs",
      policy: "registry/visual-evidence-policy.json",
      blocked_reason: containsSensitive ? "sensitive_route_or_flag" : null,
    },
  };
}

export function validateManifest(manifest) {
  const errors = [];
  const required = [
    "schema",
    "evidence_id",
    "repo",
    "branch",
    "source",
    "kind",
    "artifact_url",
    "thumbnail_url",
    "trace_url",
    "route",
    "viewport",
    "created_at",
    "retention",
    "artifact_retention_until",
    "redaction_status",
    "contains_sensitive",
    "contains_pii",
    "contains_secret",
    "ocr_summary",
    "console_error_count",
    "network_error_count",
    "sha256",
    "verification",
  ];

  for (const field of required) {
    if (!(field in manifest)) errors.push(`missing:${field}`);
  }
  if (manifest.schema !== "makxas.visual_evidence.manifest.v1") errors.push("schema:invalid");
  if (!/^vel_[A-Za-z0-9._-]+$/.test(String(manifest.evidence_id ?? "")))
    errors.push("evidence_id:invalid");
  if (!/^[a-f0-9]{64}$/.test(String(manifest.sha256 ?? ""))) errors.push("sha256:invalid");
  if (!["not_needed", "redacted", "blocked_sensitive"].includes(manifest.redaction_status))
    errors.push("redaction_status:invalid");
  if (
    !["screenshot", "video", "trace", "dom_snapshot", "visual_diff", "blocked_sensitive"].includes(
      manifest.kind,
    )
  )
    errors.push("kind:invalid");
  for (const urlField of ["artifact_url", "thumbnail_url", "trace_url"]) {
    const value = manifest[urlField];
    if (value !== null && !/^https:\/\//.test(String(value)))
      errors.push(`${urlField}:https_required`);
  }
  if (!Number.isInteger(manifest.console_error_count) || manifest.console_error_count < 0)
    errors.push("console_error_count:invalid");
  if (!Number.isInteger(manifest.network_error_count) || manifest.network_error_count < 0)
    errors.push("network_error_count:invalid");
  const retentionDays = Number(String(manifest.retention ?? "").replace(/d$/, ""));
  const allowedRetention = loadPolicy().phase1?.github_actions_artifact?.retention_days_allowed ?? [
    5, 14,
  ];
  if (!allowedRetention.includes(retentionDays)) errors.push("retention:not_allowed");
  if (!manifest.verification || typeof manifest.verification !== "object")
    errors.push("verification:missing");
  validateVerification(manifest.verification, errors);
  if (Number.isNaN(Date.parse(manifest.created_at))) errors.push("created_at:invalid");
  if (Number.isNaN(Date.parse(manifest.artifact_retention_until)))
    errors.push("artifact_retention_until:invalid");

  const blocked =
    manifest.redaction_status === "blocked_sensitive" ||
    manifest.kind === "blocked_sensitive" ||
    manifest.contains_sensitive;
  if (blocked) {
    if (
      manifest.artifact_url !== null ||
      manifest.thumbnail_url !== null ||
      manifest.trace_url !== null
    ) {
      errors.push("blocked_sensitive:url_must_be_null");
    }
    if (manifest.redaction_status !== "blocked_sensitive")
      errors.push("blocked_sensitive:redaction_required");
    if (manifest.kind !== "blocked_sensitive") errors.push("blocked_sensitive:kind_required");
  }
  if ((manifest.contains_pii || manifest.contains_secret) && !blocked) {
    errors.push("sensitive_flag_requires_blocked_sensitive");
  }
  if (!blocked && process.env.GITHUB_ACTIONS === "true" && manifest.artifact_url === null) {
    errors.push("artifact_url:required_in_ci");
  }

  return {
    schema: "makxas.visual_evidence.validation.v1",
    valid: errors.length === 0,
    errors,
    evidence_id: manifest.evidence_id,
    contains_sensitive: Boolean(manifest.contains_sensitive),
    redaction_status: manifest.redaction_status,
  };
}

function valueFor(name) {
  if (!cliOptionsEnabled) return null;
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function boolValue(name, fallback) {
  const value = valueFor(name);
  if (value === null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function intValue(name, fallback) {
  const value = valueFor(name);
  const parsed = value === null ? Number(fallback) : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : Number(fallback);
}

function bool(value) {
  return value === true || value === "true" || value === "1";
}

function evidenceId(now) {
  return `vel_${now
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}_${crypto.randomBytes(4).toString("hex")}`;
}

function inferRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY.split("/").pop();
  return path.basename(process.cwd());
}

function inferBranch() {
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try {
    return (
      execFileSync("git", ["branch", "--show-current"], {
        cwd: process.cwd(),
        encoding: "utf8",
      }).trim() || "unknown"
    );
  } catch {
    return "unknown";
  }
}

function defaultArtifactUrl() {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (server && repo && runId) return `${server}/${repo}/actions/runs/${runId}`;
  return null;
}

function defaultSummary({ containsSensitive, route }) {
  if (containsSensitive)
    return `sensitive route blocked; image/trace/video not captured. route=${route}`;
  return `visual evidence manifest for ${route}; inspect artifact only when manifest/OCR is insufficient.`;
}

function sanitizeRouteForManifest(route, containsSensitive) {
  const text = String(route ?? "/");
  if (!containsSensitive) return text;
  const pathOnly = (text.split(/[?#]/)[0] || "/").replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[redacted-email]",
  );
  return (
    pathOnly
      .split("/")
      .map((segment) => {
        if (!segment) return segment;
        if (/(token|secret|password|code|otp|captcha|key)/i.test(segment))
          return "[redacted-segment]";
        if (/^[A-Za-z0-9_-]{16,}$/.test(segment)) return "[redacted-segment]";
        return segment;
      })
      .join("/") || "/"
  );
}

function isSensitiveRoute(route) {
  const patterns = loadPolicy().sensitive_route_patterns ?? [];
  return patterns.some((source) => {
    try {
      return new RegExp(source, "i").test(route);
    } catch {
      return false;
    }
  });
}

function loadPolicy() {
  if (policyCache) return policyCache;
  try {
    policyCache = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    return policyCache;
  } catch {
    if (cliOptionsEnabled && !policyFallbackWarned) {
      globalThis.console.warn(
        "[visual-evidence] registry/visual-evidence-policy.json not found; using built-in conservative defaults.",
      );
      policyFallbackWarned = true;
    }
    policyCache = {
      sensitive_route_patterns: ["secret", "token", "oauth", "callback", "captcha", "password"],
    };
    return policyCache;
  }
}

function evidenceSha256(evidenceRoot, fallback) {
  const hash = crypto.createHash("sha256");
  if (evidenceRoot) {
    const target = path.resolve(process.cwd(), evidenceRoot);
    if (fs.existsSync(target)) {
      hashPath(target, hash);
      return hash.digest("hex");
    }
  }
  hash.update(JSON.stringify(fallback));
  return hash.digest("hex");
}

function hashPath(target, hash) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    hash.update(`symlink:${path.relative(process.cwd(), target)}:${fs.readlinkSync(target)}`);
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target).sort()) {
      hashPath(path.join(target, entry), hash);
    }
    return;
  }
  hash.update(path.relative(process.cwd(), target));
  hash.update(fs.readFileSync(target));
}

function validateVerification(verification, errors) {
  if (!verification || typeof verification !== "object") return;
  const uiAllowed = ["ok", "failed", "blocked_sensitive", "not_applicable", "unknown"];
  const fnAllowed = ["ok", "failed", "blocked_sensitive", "not_applicable", "unknown"];
  const dbAllowed = [
    "ok",
    "failed",
    "no_db_impact",
    "blocked_sensitive",
    "not_applicable",
    "unknown",
  ];
  if (!uiAllowed.includes(verification.ui)) errors.push("verification.ui:invalid");
  if (!fnAllowed.includes(verification.function)) errors.push("verification.function:invalid");
  if (!dbAllowed.includes(verification.db)) errors.push("verification.db:invalid");
  if ("notes" in verification && typeof verification.notes !== "string")
    errors.push("verification.notes:invalid");
}

function writeGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}<<GHEOF\n${value}\nGHEOF`);
  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`);
}

function isMain() {
  return (
    Boolean(process.argv[1]) &&
    path.resolve(process.argv[1]) === path.resolve(new globalThis.URL(import.meta.url).pathname)
  );
}

#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const demoEmail = (
  process.env.SEARCH_DEMO_EMAIL ?? "search-demo@makxas.com"
).trim().toLowerCase();
const demoPassword = required("SEARCH_DEMO_PASSWORD");

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required");
}
if (!anonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY is required");
}

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function expectReadonlyDenied(label, fn) {
  const { error } = await fn();
  if (!error) {
    throw new Error(`${label}: write unexpectedly succeeded`);
  }
  if (error.code !== "42501" && !String(error.message).includes("readonly_demo")) {
    throw new Error(`${label}: expected readonly denial, got ${error.message}`);
  }
  return { label, denied: true, code: error.code ?? "unknown" };
}

async function main() {
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: demoEmail,
      password: demoPassword,
    });
  if (signInError) throw signInError;

  const user = signInData.user;
  if (!user) throw new Error("Demo login did not return a user");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, is_readonly")
    .eq("id", user.id)
    .single();
  if (profileError) throw profileError;
  if (profile?.is_readonly !== true) {
    throw new Error("Demo profile is not marked readonly");
  }

  const { data: lists, error: listError } = await supabase
    .from("appraisal_lists")
    .select("id, name")
    .limit(5);
  if (listError) throw listError;
  if (!lists || lists.length === 0) {
    throw new Error("Demo user has no readable sample appraisal list");
  }

  const denied = [];
  denied.push(
    await expectReadonlyDenied("profiles.update", () =>
      supabase
        .from("profiles")
        .update({ display_name: "readonly smoke should fail" })
        .eq("id", user.id),
    ),
  );
  denied.push(
    await expectReadonlyDenied("appraisal_lists.insert", () =>
      supabase.from("appraisal_lists").insert({
        user_id: user.id,
        name: "readonly smoke should fail",
      }),
    ),
  );
  denied.push(
    await expectReadonlyDenied("feedback_logs.insert", () =>
      supabase.from("feedback_logs").insert({
        user_id: user.id,
        type: "other",
        title: "readonly smoke should fail",
        body: "readonly smoke should fail",
      }),
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        email: demoEmail,
        readable_lists: lists.length,
        denied,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

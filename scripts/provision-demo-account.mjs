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
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const demoEmail = (
  process.env.SEARCH_DEMO_EMAIL ?? "search-demo@makxas.com"
).trim().toLowerCase();
const demoPassword = required("SEARCH_DEMO_PASSWORD");

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (found) return found;
    if (data.users.length < 100) return null;
  }
  return null;
}

async function ensureUser() {
  const existing = await findUserByEmail(demoEmail);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(
      existing.id,
      {
        password: demoPassword,
        email_confirm: true,
        user_metadata: { name: "マクサスサーチ デモ" },
      },
    );
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: demoEmail,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { name: "マクサスサーチ デモ" },
  });
  if (error) throw error;
  return data.user;
}

async function resetSampleData(userId) {
  const { data: lists, error: listError } = await supabase
    .from("appraisal_lists")
    .select("id")
    .eq("user_id", userId);
  if (listError) throw listError;
  const listIds = (lists ?? []).map((list) => list.id);

  if (listIds.length > 0) {
    const { error: itemsError } = await supabase
      .from("list_items")
      .delete()
      .in("list_id", listIds);
    if (itemsError) throw itemsError;
  }

  await supabase.from("user_current_list").delete().eq("user_id", userId);
  await supabase.from("appraisal_lists").delete().eq("user_id", userId);
  await supabase.from("memos").delete().eq("user_id", userId);
  await supabase.from("pins").delete().eq("user_id", userId);
  await supabase.from("listing_views").delete().eq("user_id", userId);
  await supabase.from("saved_advices").delete().eq("user_id", userId);
  await supabase.from("search_keywords").delete().eq("user_id", userId);
}

async function seedSampleData(userId) {
  const { data: list, error: createListError } = await supabase
    .from("appraisal_lists")
    .insert({
      user_id: userId,
      name: "デモ査定リスト",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (createListError) throw createListError;

  const { error: currentListError } = await supabase
    .from("user_current_list")
    .upsert(
      {
        user_id: userId,
        list_id: list.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (currentListError) throw currentListError;

  const { error: itemsError } = await supabase.from("list_items").insert([
    {
      list_id: list.id,
      keyword: "ルイヴィトン モノグラム ネヴァーフル",
      excludes: "ジャンク",
      period: "90",
      sources: ["yahoo_auction", "mercari"],
      conditions: ["a", "b"],
      shipping: "any",
      status: "completed",
      progress: 100,
      median: 88000,
      min_price: 52000,
      max_price: 132000,
      total_count: 42,
      suggested_buy_price: 61000,
      completed_at: new Date().toISOString(),
      notes: "サンプルデータです。実顧客情報は含みません。",
      sort_order: 1,
      item_type: "search",
      is_additional: false,
      added_by_user_id: userId,
    },
    {
      list_id: list.id,
      keyword: "ロレックス デイトジャスト 16234",
      excludes: "",
      period: "180",
      sources: ["yahoo_auction"],
      conditions: ["b"],
      shipping: "any",
      status: "completed",
      progress: 100,
      median: 620000,
      min_price: 480000,
      max_price: 820000,
      total_count: 18,
      suggested_buy_price: 455000,
      completed_at: new Date().toISOString(),
      notes: "高単価商品の見本です。",
      sort_order: 2,
      item_type: "search",
      is_additional: true,
      added_by_user_id: userId,
    },
  ]);
  if (itemsError) throw itemsError;

  await supabase.from("search_keywords").insert([
    {
      user_id: userId,
      keyword: "ルイヴィトン モノグラム",
      count: 3,
      is_favorite: true,
    },
    {
      user_id: userId,
      keyword: "ロレックス デイトジャスト",
      count: 2,
      is_favorite: true,
    },
  ]);
}

async function main() {
  const user = await ensureUser();
  if (!user?.id) throw new Error("Demo user was not returned");

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      display_name: "マクサスサーチ デモ",
      default_buy_rate: 70,
      is_readonly: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileError) {
    throw new Error(
      `Failed to mark profile readonly. Apply ADR-0008 migration first: ${profileError.message}`,
    );
  }

  await resetSampleData(user.id);
  await seedSampleData(user.id);

  console.log(
    JSON.stringify(
      {
        ok: true,
        email: demoEmail,
        user_id: user.id,
        readonly: true,
        seeded: true,
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

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// トークンから list の share_token を取得するヘルパー
async function getListToken(token: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("share_tokens")
    .select("resource_type, resource_id, permission")
    .eq("token", token)
    .single();
  if (!data || data.resource_type !== "list") return null;
  return data as { resource_type: string; resource_id: string; permission: string };
}

// GET /api/share/[token]/list/items
// トークンで共有されたリストのアイテム一覧を取得
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const shareToken = await getListToken(token);
  if (!shareToken) {
    return NextResponse.json({ error: "無効なトークンです" }, { status: 404 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("list_items")
    .select("*")
    .eq("list_id", shareToken.resource_id)
    .order("added_at", { ascending: false });

  if (error) {
    console.error("[share/list/items] GET error:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

// POST /api/share/[token]/list/items
// トークンが edit 権限の場合のみアイテムを追加
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const shareToken = await getListToken(token);
  if (!shareToken) {
    return NextResponse.json({ error: "無効なトークンです" }, { status: 404 });
  }
  if (shareToken.permission !== "edit") {
    return NextResponse.json({ error: "編集権限がありません" }, { status: 403 });
  }

  const body = (await req.json()) as {
    keyword?: string;
    excludes?: string;
    period?: string;
    sources?: string[];
    conditions?: string[];
    shipping?: string;
  };
  const { keyword, excludes, period, sources, conditions, shipping } = body;
  const service = createServiceClient();
  const { data, error } = await service
    .from("list_items")
    .insert({ keyword, excludes, period, sources, conditions, shipping, list_id: shareToken.resource_id })
    .select()
    .single();

  if (error || !data) {
    console.error("[share/list/items] POST error:", error);
    return NextResponse.json({ error: "追加に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

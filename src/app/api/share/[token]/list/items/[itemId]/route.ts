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

// PATCH /api/share/[token]/list/items/[itemId]
// appraisal_status を更新（edit 権限が必要）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string }> }
) {
  const { token, itemId } = await params;
  const shareToken = await getListToken(token);
  if (!shareToken) {
    return NextResponse.json({ error: "無効なトークンです" }, { status: 404 });
  }
  if (shareToken.permission !== "edit") {
    return NextResponse.json({ error: "編集権限がありません" }, { status: 403 });
  }

  const body = (await req.json()) as { appraisal_status?: string };

  if (
    body.appraisal_status &&
    !["pending", "accepted", "rejected"].includes(body.appraisal_status)
  ) {
    return NextResponse.json({ error: "無効なステータスです" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("list_items")
    .update({ appraisal_status: body.appraisal_status })
    .eq("id", itemId)
    .eq("list_id", shareToken.resource_id); // list_id で絞り込みセキュリティ

  if (error) {
    console.error("[share/list/items/:id] PATCH error:", error);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/share/[token]/list/items/[itemId]
// アイテムを削除（edit 権限が必要）
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string }> }
) {
  const { token, itemId } = await params;
  const shareToken = await getListToken(token);
  if (!shareToken) {
    return NextResponse.json({ error: "無効なトークンです" }, { status: 404 });
  }
  if (shareToken.permission !== "edit") {
    return NextResponse.json({ error: "編集権限がありません" }, { status: 403 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("list_items")
    .delete()
    .eq("id", itemId)
    .eq("list_id", shareToken.resource_id);

  if (error) {
    console.error("[share/list/items/:id] DELETE error:", error);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

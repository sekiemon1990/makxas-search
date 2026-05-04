import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/share
// 共有トークンを発行する
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    resource_type: string;
    resource_id: string;
    permission?: string;
  };

  const { resource_type, resource_id, permission = "view" } = body;

  if (!resource_type || !resource_id) {
    return NextResponse.json(
      { error: "resource_type と resource_id は必須です" },
      { status: 400 }
    );
  }

  if (!["search", "list", "listing"].includes(resource_type)) {
    return NextResponse.json(
      { error: "resource_type は search / list / listing のいずれかです" },
      { status: 400 }
    );
  }

  if (!["view", "edit"].includes(permission)) {
    return NextResponse.json(
      { error: "permission は view / edit のいずれかです" },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("share_tokens")
    .insert({
      resource_type,
      resource_id,
      permission,
      created_by: user.id,
    })
    .select("token")
    .single();

  if (error || !data) {
    console.error("[share] insert error:", error);
    return NextResponse.json({ error: "トークン作成に失敗しました" }, { status: 500 });
  }

  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://makxas-search.vercel.app";

  return NextResponse.json({ url: `${origin}/share/${data.token}` });
}

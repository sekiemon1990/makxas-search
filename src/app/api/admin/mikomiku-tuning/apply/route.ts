// 見込金額ロジックの変更を「適用」する（マネージャーが確認カードで承認後に呼ばれる）。
// - target=global  → app_config.mikomiku_prompt を更新
// - target=category → mikomiku_categories.prompt を更新
// 併せて mikomiku_tuning_log に変更履歴（誰が・いつ・何を）を記録する。
//
// GET は変更履歴の一覧を返す。

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMikomikuTuner } from "@/lib/auth/requireMikomikuTuner";
import {
  validateProposeInput,
  GLOBAL_LABEL,
  type TuningTarget,
} from "@/lib/mikomiku/tuning";

export const runtime = "nodejs";
export const maxDuration = 30;

const GLOBAL_PROMPT_KEY = "mikomiku_prompt";

type ApplyBody = {
  target?: TuningTarget;
  categoryId?: string | null;
  newPrompt?: string;
  summary?: string;
};

export async function POST(req: Request) {
  const gate = await requireMikomikuTuner();
  if (!gate.ok) return gate.response;

  let body: ApplyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const valid = validateProposeInput({
    target: body.target,
    categoryId: body.categoryId ?? undefined,
    newPrompt: body.newPrompt,
    summary: body.summary,
  });
  if (!valid.ok) {
    return NextResponse.json({ error: valid.error }, { status: 400 });
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const newPrompt = body.newPrompt as string;
  const summary = body.summary as string;

  let beforePrompt = "";
  let categoryName: string | null = null;

  try {
    if (body.target === "global") {
      const { data: cfg } = await service
        .from("app_config")
        .select("value")
        .eq("key", GLOBAL_PROMPT_KEY)
        .maybeSingle();
      beforePrompt = cfg?.value ?? "";

      const { error } = await service.from("app_config").upsert(
        { key: GLOBAL_PROMPT_KEY, value: newPrompt, updated_at: now },
        { onConflict: "key" },
      );
      if (error) throw error;
      categoryName = GLOBAL_LABEL;
    } else {
      const categoryId = body.categoryId as string;
      const { data: cat } = await service
        .from("mikomiku_categories")
        .select("id, name, prompt")
        .eq("id", categoryId)
        .maybeSingle();
      if (!cat) {
        return NextResponse.json(
          { error: "指定されたカテゴリが見つかりません" },
          { status: 404 },
        );
      }
      beforePrompt = cat.prompt ?? "";
      categoryName = cat.name;

      const { error } = await service
        .from("mikomiku_categories")
        .update({ prompt: newPrompt, updated_at: now })
        .eq("id", categoryId);
      if (error) throw error;
    }

    // 監査ログ（fire-and-forget でなく確実に記録）
    const { error: logError } = await service.from("mikomiku_tuning_log").insert({
      actor_email: gate.email,
      target: body.target,
      category_id: body.target === "category" ? body.categoryId : null,
      category_name: categoryName,
      before_prompt: beforePrompt,
      after_prompt: newPrompt,
      summary,
      created_at: now,
    });
    if (logError) {
      console.error("[mikomiku-tuning] audit log insert failed:", logError);
      // 適用自体は成功しているため、ログ失敗は警告に留める
    }

    return NextResponse.json({
      ok: true,
      applied: { target: body.target, categoryName, summary, at: now },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[mikomiku-tuning] apply error:", msg);
    return NextResponse.json(
      { error: "変更の適用に失敗しました", detail: msg },
      { status: 500 },
    );
  }
}

export async function GET() {
  const gate = await requireMikomikuTuner();
  if (!gate.ok) return gate.response;

  const service = createServiceClient();
  const { data, error } = await service
    .from("mikomiku_tuning_log")
    .select(
      "id, actor_email, target, category_id, category_name, before_prompt, after_prompt, summary, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ history: data ?? [] });
}

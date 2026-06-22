"use client";

import { Eye } from "lucide-react";
import { useReadonlyDemo } from "@/lib/auth/readonly-client";

export function ReadonlyDemoBanner() {
  const readonly = useReadonlyDemo();
  if (!readonly) return null;

  return (
    <div className="bg-primary/10 border-b border-primary/20">
      <div className="mx-auto max-w-md md:max-w-3xl lg:max-w-5xl w-full px-4 py-2 flex items-start gap-2 text-primary">
        <Eye size={15} className="shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          デモ表示中です。閲覧だけでき、検索実行・保存・削除・AI利用はできません。
        </p>
      </div>
    </div>
  );
}

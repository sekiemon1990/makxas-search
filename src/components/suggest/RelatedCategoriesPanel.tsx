"use client";

import Link from "next/link";
import { getRelatedCategories } from "@/lib/suggest/data";

interface Props {
  keyword: string;
}

export function RelatedCategoriesPanel({ keyword }: Props) {
  const items = getRelatedCategories(keyword);
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">💡</span>
        <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          一緒によく売れる商品
        </span>
        <span className="text-xs text-amber-600 dark:text-amber-500 ml-1">
          追加提案のチャンス
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={item.label}
            href={`/search?keyword=${encodeURIComponent(item.searchKeyword)}`}
            className="tap-scale inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors"
            title={item.reason}
          >
            <span>{item.icon}</span>
            <span className="font-medium">{item.label}</span>
            <span className="text-amber-500 dark:text-amber-500">↗</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

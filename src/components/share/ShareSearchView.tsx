import { LogIn, Search } from "lucide-react";
import Link from "next/link";

type SearchRow = {
  id: string;
  keyword: string;
  sources: string[];
  status: string;
  searched_at: string;
};

const SOURCE_LABEL: Record<string, string> = {
  yahoo_auction: "ヤフオク",
  mercari: "メルカリ",
  jimoty: "ジモティー",
};

interface Props {
  search: SearchRow;
}

export function ShareSearchView({ search }: Props) {
  const loginUrl = `/login?next=/search/result/${search.id}`;

  return (
    <div className="max-w-[640px] mx-auto p-8 flex flex-col items-center gap-6 text-center">
      {/* アイコン */}
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Search size={28} className="text-primary" />
      </div>

      {/* 検索情報 */}
      <div>
        <div className="text-xs text-muted mb-2">共有された検索結果</div>
        <h1 className="text-2xl font-bold text-foreground mb-3">
          {search.keyword}
        </h1>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {search.sources.map((src) => (
            <span
              key={src}
              className="text-xs px-2.5 py-1 rounded-full bg-info/10 text-info font-semibold"
            >
              {SOURCE_LABEL[src] ?? src}
            </span>
          ))}
          <span className="text-xs text-muted">
            {new Date(search.searched_at).toLocaleDateString("ja-JP")}
          </span>
        </div>
      </div>

      {/* ログインCTA */}
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-[380px] flex flex-col gap-3">
        <p className="text-sm text-foreground font-semibold">
          検索結果を見るにはログインが必要です
        </p>
        <p className="text-xs text-muted leading-relaxed">
          マクサスサーチはスタッフ向けの相場検索ツールです。
          アカウントにログインすると、この検索の全結果を確認できます。
        </p>
        <Link
          href={loginUrl}
          className="flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-3 rounded-xl hover:bg-primary/90 transition-colors"
        >
          <LogIn size={15} />
          ログインして結果を見る
        </Link>
      </div>
    </div>
  );
}

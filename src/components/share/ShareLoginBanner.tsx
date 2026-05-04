import Link from "next/link";
import { LogIn } from "lucide-react";

interface Props {
  shareUrl: string;
}

export function ShareLoginBanner({ shareUrl }: Props) {
  const loginUrl = `/login?next=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="bg-primary/5 border-b border-primary/20 px-4 py-3">
      <div className="max-w-[960px] mx-auto flex items-center justify-between gap-4">
        <div className="text-sm text-foreground">
          <span className="font-semibold">マクサスサーチ</span>
          <span className="text-muted ml-2">で共有されたコンテンツを閲覧しています</span>
        </div>
        <Link
          href={loginUrl}
          className="flex items-center gap-1.5 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors shrink-0"
        >
          <LogIn size={14} />
          ログインして使う
        </Link>
      </div>
    </div>
  );
}

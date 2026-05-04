import Image from "next/image";
import { formatYen } from "@/lib/utils";

type ListingViewRow = {
  listing_ref: string;
  source: string;
  title: string;
  price: number;
  thumbnail: string | null;
  ended_at: string | null;
  condition: string | null;
  from_keyword: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  yahoo_auction: "ヤフオク",
  mercari: "メルカリ",
  jimoty: "ジモティー",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

interface Props {
  listing: ListingViewRow;
}

export function ShareListingView({ listing }: Props) {
  return (
    <div className="max-w-[640px] mx-auto p-6 flex flex-col gap-5">
      {/* ヘッダー */}
      <div className="flex items-start gap-4">
        {listing.thumbnail && (
          <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-border shrink-0">
            <Image
              src={listing.thumbnail}
              alt={listing.title}
              fill
              className="object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-info mb-1">
            {SOURCE_LABEL[listing.source] ?? listing.source}
          </div>
          <h1 className="text-base font-bold text-foreground leading-snug mb-3">
            {listing.title}
          </h1>
          <div className="text-2xl font-bold text-foreground mb-1">
            {formatYen(listing.price)}
          </div>
          {listing.ended_at && (
            <div className="text-xs text-muted">落札日: {fmtDate(listing.ended_at)}</div>
          )}
        </div>
      </div>

      {/* 詳細情報 */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-border">
          {listing.condition && (
            <div className="px-4 py-3">
              <div className="text-xs text-muted mb-0.5">状態</div>
              <div className="text-sm text-foreground">{listing.condition}</div>
            </div>
          )}
          {listing.from_keyword && (
            <div className="px-4 py-3">
              <div className="text-xs text-muted mb-0.5">検索キーワード</div>
              <div className="text-sm text-foreground">{listing.from_keyword}</div>
            </div>
          )}
        </div>
      </div>

      {/* 注記 */}
      <p className="text-xs text-muted text-center">
        ※ このページはスナップショットです。詳細情報は元のサイトでご確認ください。
      </p>
    </div>
  );
}

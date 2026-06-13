import { MikomikuTuningChat } from "@/components/admin/MikomikuTuningChat";

export const metadata = {
  title: "見込金額チューニング | 管理画面",
};

export default function MikomikuTuningPage() {
  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-foreground">見込金額チューニング</h1>
        <p className="text-xs text-muted mt-1">
          見込金額の算出ロジックを AIチャットで調整します。変更はマネージャーの確認後に反映され、履歴に記録されます。
        </p>
      </div>
      <MikomikuTuningChat />
    </div>
  );
}

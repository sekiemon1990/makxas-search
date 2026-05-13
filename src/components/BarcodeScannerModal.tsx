"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, CheckCircle2, AlertCircle, Barcode } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { toast } from "@/lib/toast";

type Props = {
  onDetected: (keyword: string, productName: string) => void;
  onClose: () => void;
};

type ScanState =
  | { phase: "scanning" }
  | { phase: "looking_up"; code: string }
  | { phase: "found"; code: string; productName: string; keyword: string }
  | { phase: "not_found"; code: string }
  | { phase: "error"; message: string };

export function BarcodeScannerModal({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [state, setState] = useState<ScanState>({ phase: "scanning" });
  const detectedRef = useRef(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    let controls: { stop: () => void } | null = null;

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment")
        );
        const deviceId = backCamera?.deviceId;

        controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          async (result, error) => {
            if (!result || detectedRef.current) return;
            if (error) return;

            detectedRef.current = true;
            const code = result.getText();
            setState({ phase: "looking_up", code });

            try {
              const res = await fetch("/api/barcode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
              });
              const data = (await res.json()) as {
                found: boolean;
                productName: string;
                keywords: string;
              };

              if (data.found && data.keywords) {
                setState({
                  phase: "found",
                  code,
                  productName: data.productName,
                  keyword: data.keywords,
                });
              } else {
                setState({ phase: "not_found", code });
              }
            } catch {
              setState({ phase: "error", message: "通信エラーが発生しました" });
            }
          }
        );
      } catch {
        setState({ phase: "error", message: "カメラへのアクセスができませんでした" });
      }
    })();

    return () => {
      controls?.stop();
    };
  }, []);

  function handleConfirm() {
    if (state.phase !== "found") return;
    onDetected(state.keyword, state.productName);
    onClose();
  }

  function handleRetry() {
    detectedRef.current = false;
    setState({ phase: "scanning" });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <div className="flex items-center gap-2 text-white">
          <Barcode size={18} />
          <span className="text-sm font-semibold">バーコードをスキャン</span>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"
          aria-label="閉じる"
        >
          <X size={18} />
        </button>
      </div>

      {/* カメラ映像 */}
      <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />

        {/* スキャン枠 */}
        {state.phase === "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-40">
              <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-md" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-md" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-md" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-md" />
              <span className="absolute top-1/2 left-4 right-4 h-0.5 bg-red-400 animate-pulse -translate-y-1/2" />
            </div>
          </div>
        )}

        {/* オーバーレイ: 調べ中 */}
        {state.phase === "looking_up" && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
            <Loader2 size={36} className="text-white animate-spin" />
            <p className="text-white text-sm">商品を調べています…</p>
            <p className="text-white/60 text-xs font-mono">{state.code}</p>
          </div>
        )}

        {/* オーバーレイ: 見つかった */}
        {state.phase === "found" && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 px-6">
            <CheckCircle2 size={40} className="text-green-400" />
            <div className="text-center">
              <p className="text-white font-semibold text-base leading-snug">
                {state.productName}
              </p>
              <p className="text-white/50 text-xs mt-1 font-mono">{state.code}</p>
            </div>
            <button
              onClick={handleConfirm}
              className="w-full max-w-xs h-12 rounded-xl bg-primary text-white font-semibold text-sm"
            >
              この商品で検索する
            </button>
            <button
              onClick={handleRetry}
              className="text-white/60 text-sm underline"
            >
              別のバーコードをスキャン
            </button>
          </div>
        )}

        {/* オーバーレイ: 見つからない */}
        {state.phase === "not_found" && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 px-6">
            <AlertCircle size={40} className="text-yellow-400" />
            <div className="text-center">
              <p className="text-white font-semibold">商品を特定できませんでした</p>
              <p className="text-white/50 text-xs mt-1 font-mono">{state.code}</p>
            </div>
            <button
              onClick={handleRetry}
              className="w-full max-w-xs h-12 rounded-xl bg-white/20 text-white font-semibold text-sm"
            >
              もう一度スキャン
            </button>
          </div>
        )}

        {/* オーバーレイ: エラー */}
        {state.phase === "error" && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 px-6">
            <AlertCircle size={40} className="text-red-400" />
            <p className="text-white text-sm text-center">{state.message}</p>
            <button
              onClick={onClose}
              className="w-full max-w-xs h-12 rounded-xl bg-white/20 text-white font-semibold text-sm"
            >
              閉じる
            </button>
          </div>
        )}
      </div>

      {/* フッター */}
      {state.phase === "scanning" && (
        <div className="px-4 py-4 bg-black/80 text-center">
          <p className="text-white/60 text-xs">
            商品のバーコードをカメラに向けてください
          </p>
        </div>
      )}
    </div>
  );
}

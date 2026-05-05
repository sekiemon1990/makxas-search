"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

type Props = {
  prompt: string;
  label?: string;
};

export function CopyPromptButton({ prompt, label = "プロンプトをコピー" }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // フォールバック: execCommand
      const textarea = document.createElement("textarea");
      textarea.value = prompt;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
        copied
          ? "bg-success/12 text-success"
          : "bg-primary/10 text-primary hover:bg-primary/20"
      }`}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "コピー済み" : label}
    </button>
  );
}

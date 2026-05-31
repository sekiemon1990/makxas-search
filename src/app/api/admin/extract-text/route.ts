import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const mimeType = file.type;
    const buffer = Buffer.from(await file.arrayBuffer());

    // PDF
    if (mimeType === "application/pdf") {
      // pdf-parse ESM export shape varies by bundler; normalize to callable
      const mod = await import("pdf-parse");
      type PdfFn = (buf: Buffer) => Promise<{ text: string }>;
      const modAny = mod as unknown as Record<string, unknown>;
      const pdfParse: PdfFn =
        typeof modAny["default"] === "function"
          ? (modAny["default"] as PdfFn)
          : (mod as unknown as PdfFn);
      const result = await pdfParse(buffer);
      return NextResponse.json({ text: result.text.slice(0, 50000) });
    }

    // テキスト系
    if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".csv") ||
      file.name.endsWith(".txt")
    ) {
      const text = buffer.toString("utf-8");
      return NextResponse.json({ text: text.slice(0, 50000) });
    }

    // 画像・その他: テキスト抽出なし
    return NextResponse.json({ text: null });
  } catch (e) {
    console.error("[extract-text]", e);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}

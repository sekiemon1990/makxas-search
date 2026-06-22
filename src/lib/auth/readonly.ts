const DEFAULT_READONLY_DEMO_EMAILS = ["search-demo@makxas.com"];

export const READONLY_DEMO_WRITE_DENIED = "readonly_demo_write_denied";
export const READONLY_DEMO_MESSAGE =
  "読み取り専用デモアカウントでは変更操作はできません。";

function splitEmails(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function readonlyDemoEmails(): string[] {
  return Array.from(
    new Set([
      ...DEFAULT_READONLY_DEMO_EMAILS,
      ...splitEmails(process.env.SEARCH_READONLY_DEMO_EMAILS),
      ...splitEmails(process.env.READONLY_DEMO_EMAILS),
      ...splitEmails(process.env.NEXT_PUBLIC_READONLY_DEMO_EMAILS),
    ]),
  );
}

export function isReadonlyDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return readonlyDemoEmails().includes(email.trim().toLowerCase());
}

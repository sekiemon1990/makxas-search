import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    // ネストした worktree (.claude/worktrees/*/.next) のビルド成果物まで無視するため、
    // ルート直下だけでなく全階層を対象にする (`.next/**` だと nested を拾ってしまう)。
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    // .claude 配下は worktree やエージェント作業用ディレクトリ。lint 対象外。
    "**/.claude/**",
    "next-env.d.ts",
    "public/sw.js",
    // ネストした worktree（ローカル調整状態・ビルド生成物）は lint 対象外
    ".claude/**",
  ]),
  {
    rules: {
      // 既存コードは React 19 strict hooks ルールを概ね修正済み。
      // 例外パターンは個別 eslint-disable で抑制。
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/immutability": "error",
      "react-hooks/purity": "error",
      "react-hooks/refs": "error",
      "react-hooks/exhaustive-deps": "error",
      "@next/next/no-img-element": "error",
    },
  },
]);

export default eslintConfig;

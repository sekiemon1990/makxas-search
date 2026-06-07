import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
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

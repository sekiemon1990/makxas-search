# data-portal

このリポジトリは、自社Metabase（AWS Elastic Beanstalk上、v0.49より古い、HTTP）と連携する社内データポータルです。

## 構成
- Next.js 16 + TypeScript + Tailwind
- Anthropic SDK（経営層向け自然言語UI用、Tool Useで利用予定）
- Supabase（認証・補助DB、任意）

## Metabase接続
- URL: `http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com`
- 認証: 専用read-onlyアカウント（user+passでセッショントークン）
- 開発時はClaude Desktop + `@imlewc/metabase-server` でMCP接続

## 想定ロードマップ
1. **Phase 1（進行中）**: Claude Desktop経由でMetabase MCP接続。データチームが探索的に使う
2. **Phase 2**: Next.js + Anthropic SDK Tool Useで、経営層向け自然言語UIを実装
3. **Phase 3**: HTTPS化、Metabaseバージョンアップ（v0.49+ または v60+）

## 関連
- 元プロジェクト: `sekiemon1990/claude-code`（Next.js探索リポジトリ）
- 前セッションでの調査結果: `sekiemon1990/claude-code` の `docs/metabase-mcp-setup.md` 参照

## このリポジトリで作業するときの注意
- Metabaseの認証情報は `.env.local` のみ。`.env.local.example` を参考に各自設定
- 本番デプロイ前に**HTTPS化が必須**（現状HTTPでパスワードが平文で流れる）
- 経営層向けUIではMCPではなく**Anthropic SDK + Tool Use**（サーバー側でMetabase API呼び出し）でビルドする
- MCP接続で使うMetabaseアカウントは**読み取り専用**であることを必ず確認

## 開発開始
```bash
npm install
cp .env.local.example .env.local  # 中身を実値に書き換え
npm run dev
# → http://localhost:3000
```

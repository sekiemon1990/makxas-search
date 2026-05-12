# data-portal

社内Metabaseと連携する社内データポータル。

## このリポジトリの目的
- データチーム/開発者がClaude DesktopからMCP経由でMetabaseを探索的に触る
- 経営層向けに「自然言語で質問できるダッシュボード」を提供する（Anthropic SDK + Tool Use）

## セットアップ

### 前提
- Node.js LTS（v20.x or v22.x）
- Claude Desktop（macOSの場合）
- Metabaseの専用read-onlyアカウント

### 手順
```bash
git clone git@github.com:sekiemon1990/data-portal.git
cd data-portal
npm install
cp .env.local.example .env.local  # 中身を編集して実際のパスワードを記入
npm run dev
```
ブラウザで http://localhost:3000 を開く。

### Claude DesktopでMCP接続を有効化
`~/Library/Application Support/Claude/claude_desktop_config.json` に以下を記述：
```json
{
  "mcpServers": {
    "metabase-server": {
      "command": "npx",
      "args": ["-y", "@imlewc/metabase-server"],
      "env": {
        "METABASE_URL": "http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com",
        "METABASE_USERNAME": "mcp-readonly@example.com",
        "METABASE_PASSWORD": "REPLACE_WITH_REAL_PASSWORD"
      }
    }
  }
}
```
Claude Desktopを完全終了→再起動。

## ロードマップ
- [x] MCP接続のセットアップ
- [ ] 経営層向けダッシュボードv1（Anthropic SDK + Tool Use）
- [ ] HTTPS化（ALB + ACM）
- [ ] Metabaseバージョンアップ計画

## 関連リポジトリ
- `sekiemon1990/claude-code` — Next.js探索用の元リポジトリ。Metabase連携の設計検討は `docs/metabase-mcp-setup.md` 参照

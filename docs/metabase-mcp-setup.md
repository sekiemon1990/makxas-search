# 新規リポジトリ `data-portal` の立ち上げ + Metabase MCP連携セットアップ

## Context（背景）

### なぜ新セッション・新リポジトリか
- 現在のセッションは**サンドボックス環境**（git remoteが `http://local_proxy@127.0.0.1:39841/...`）で、`npx` でMCPサーバーを起動したり、Claude Desktopの設定ファイルを書き換えたりといった**ローカル固有の作業ができない**
- 既存リポジトリ `sekiemon1990/claude-code` は別用途のコード（yahoo-itemスクレイピング等）が混在しており、**Metabase連携は別リポジトリとして切り出した方が責任範囲が明確**

### ユーザーの確定済み要件
- ローカル環境：**macOS**
- 新リポジトリ：**`sekiemon1990/data-portal`**（Private、Next.js 16新規プロジェクト）
- MCPクライアント：**Claude Desktop**（Metabase問い合わせ用）
- 並行して：Next.jsで経営層向けダッシュボード（将来）も開発予定

### 前セッションの調査結果（確定事項）
- Metabase：AWS Elastic Beanstalk上のセルフホスト、v0.49より古い → **APIキー機能なし**
- URL：`http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com`（HTTP）
- 認証：**user+passでセッショントークン**（MCPサーバー側が自動）
- 採用MCPサーバー：**`@imlewc/metabase-server`**（npm、user+pass認証対応、スター145）

---

## 全体像

```
┌─────────────────────────────────────────────────┐
│           macOS ローカル環境                       │
│                                                   │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  Claude Desktop  │──│ @imlewc/metabase-    │ │
│  │  (MCPクライアント)│  │ server (npx)         │ │
│  └──────────────────┘  └──────────┬───────────┘ │
│                                    │             │
│  ┌──────────────────┐              │             │
│  │ ~/dev/data-portal│              │             │
│  │  (Next.js 16)    │              │             │
│  │  + git remote    │              │             │
│  └──────────────────┘              │             │
└────────────────────────────────────┼─────────────┘
                                     │
                                     ▼
                ┌─────────────────────────────────┐
                │  AWS Elastic Beanstalk          │
                │  metabase-zgnsj-env.            │
                │  ap-northeast-1.                │
                │  elasticbeanstalk.com           │
                │  (HTTP, v0.49より古い)            │
                └─────────────────────────────────┘
```

---

## Phase 0: 前提環境を整える（macOSローカル）

### 0-1. Node.js（LTS）インストール
```bash
# Homebrewが入っていなければ先に
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js LTS
brew install node
node -v  # v20.x or v22.x が出ればOK
```

### 0-2. Claude Desktop インストール
- https://claude.ai/download からmacOS版をDL → インストール → ログイン

### 0-3. Claude Code CLI（推奨・任意）
Next.jsの実装をAI支援で進めたいなら入れておく：
```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

### 0-4. GitHub CLI（任意・リポジトリ作成を楽にしたいなら）
```bash
brew install gh
gh auth login
```

---

## Phase 1: Metabase側の事前準備

### 1-1. 専用サービスアカウント作成
1. Metabase管理画面 → ユーザー → 「ユーザーを招待」
2. メアド例：`mcp-readonly@（自社ドメイン）`
3. 名前：`MCP Bot`
4. 強めのパスワード生成 → パスワードマネージャーに保管

### 1-2. 読み取り専用グループに所属させる
1. 管理画面 → 権限 → 該当ユーザーのグループ設定
2. 必要なコレクション（`Coreデータ分析` 等）の閲覧権限のみ付与
3. DB操作系の権限は最小限に

### 1-3. （推奨）HTTPS化計画を立てる
現状HTTP通信なのでパスワードが平文で流れる。ALB + ACM証明書 + Route 53でHTTPS化することを強く推奨。
- 開発初期は後回し可
- 経営層展開（Phase 4以降）までには対応必須

---

## Phase 2: 新リポジトリ `data-portal` を作成

### 2-1. ローカルにNext.js 16新規プロジェクト
```bash
cd ~/dev   # ディレクトリがなければ mkdir -p ~/dev
npx create-next-app@latest data-portal \
  --typescript \
  --app \
  --tailwind \
  --no-src-dir \
  --import-alias "@/*"
cd data-portal
```
※フラグは好みで調整。`--src-dir` にしたいなら `--src-dir` に変更。

### 2-2. 必要そうな依存を追加（最小構成）
```bash
# Supabaseを認証/DBに使うなら：
npm install @supabase/ssr @supabase/supabase-js

# Anthropic SDK（経営層向けTool Useフェーズで使う想定。今は入れなくても可）
npm install @anthropic-ai/sdk

# UI部品（任意）
npm install lucide-react clsx tailwind-merge
```

### 2-3. `.gitignore` 確認・`.env.local.example` 作成
create-next-appが生成する `.gitignore` に `.env*.local` が入っていることを確認。

`.env.local.example` を作成（コミット対象）：
```
# Metabase MCP接続用（個人開発時のみ。本番は別管理）
METABASE_URL=http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com
METABASE_USERNAME=mcp-readonly@example.com
METABASE_PASSWORD=replace-me
```

実際の `.env.local` も作成（コミットしない）し、本物のパスワードを記述。

### 2-4. README.md を簡潔に整備
- プロジェクト目的（Metabase連携 + 経営層向け分析ダッシュボード）
- 開発開始手順（`npm install` → `npm run dev`）
- 関連リポジトリリンク
- MCP接続が前提の旨

### 2-5. GitHubに新規Privateリポジトリを作成 & push
`gh` CLI使う場合：
```bash
gh repo create sekiemon1990/data-portal --private --source=. --remote=origin
git add .
git commit -m "Initial commit: Next.js 16 project skeleton"
git push -u origin main
```

`gh` を使わない場合：
1. GitHub上で `sekiemon1990/data-portal` をPrivateで手動作成
2. ローカルで `git remote add origin git@github.com:sekiemon1990/data-portal.git`
3. `git push -u origin main`

---

## Phase 3: Claude に Metabase MCP を登録

### 推奨：Claude Connectors UI（GUI）で設定する
ClaudeにはビルトインのConnectors（コネクタ）UIがあり、`claude_desktop_config.json` を手動編集しなくても登録できる。フィールド構成（"Read-Only Mode" トグル、"Export Directory" 必須）から、内部で使われているMCPサーバーは **`jerichosequitin/metabase-mcp`** と推測される（user+pass認証対応）。

#### 各フィールドの入力値

| フィールド | 値 |
|---|---|
| **URL（必須）** | `http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com` |
| **API Key** | **空欄のまま**（Metabaseがv0.49より古くAPIキー非対応） |
| **User Email** | Phase 1で作った専用サービスアカウントのメアド |
| **Password** | Phase 1で作ったパスワード |
| **Read-Only Mode** | **ON にする**（SELECTのみに制限。安全のため必須） |
| **Export Directory（必須）** | デフォルトの `${DOWNLOADS}/Metabase` のままで可 |

入力後「保存」→ コネクタが "無効" → "有効" に変わる。

### 代替：手動JSON編集（Connectors UIが使えない場合のみ）
```bash
mkdir -p ~/Library/Application\ Support/Claude
open -e ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

```json
{
  "mcpServers": {
    "metabase-server": {
      "command": "npx",
      "args": ["-y", "@imlewc/metabase-server"],
      "env": {
        "METABASE_URL": "http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com",
        "METABASE_USERNAME": "mcp-readonly@example.com",
        "METABASE_PASSWORD": "（Phase 1で作ったパスワード）"
      }
    }
  }
}
```
編集後はClaudeを**完全終了→再起動**（ドックの×ではダメ）。Connectors UIで設定した場合は再起動不要なことが多い。

### 3-3. 動作確認（チャット欄に投げる）
1. 「Metabase MCPで使えるツール一覧を見せて」
   → `list_dashboards`, `list_cards`, `execute_card` 等が返ればOK
2. 「Metabaseのダッシュボード一覧を取得して」
   → `買取分析（直営店）`, `販売分析（直営店）` 等の名前が返る
3. 「`Coreデータ分析` コレクションのカード一覧を見せて」
4. 失敗時：Claude Desktop 設定 → Developer → MCP servers の **Logs** を確認

---

## Phase 4: 新セッション開始時のコンテキスト引き継ぎ

新しいClaude Code/Desktopセッションは記憶ゼロから始まる。`data-portal/CLAUDE.md` を作って以下を書き込んでおく：

```markdown
# data-portal

このリポジトリは、自社Metabase（AWS Elastic Beanstalk上、v0.49より古い、HTTP）と
連携する社内データポータルです。

## 構成
- Next.js 16 + TypeScript + Tailwind
- Anthropic SDK（経営層向け自然言語UI用、Tool Useで利用予定）
- Supabase（認証・補助DB、任意）

## Metabase接続
- URL: http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com
- 認証: 専用read-onlyアカウント（user+passでセッショントークン）
- 開発時はClaude Desktop + @imlewc/metabase-server でMCP接続

## 想定ロードマップ
1. Phase 1（完了）: Claude Desktop経由でMetabase MCP接続、データチームが探索的に使う
2. Phase 2: Next.js + Anthropic SDK Tool Useで、経営層向け自然言語UIを実装
3. Phase 3: HTTPS化、Metabaseバージョンアップ（v0.49+ または v60+）

## 関連
- 元プロジェクト: sekiemon1990/claude-code（Next.js探索リポジトリ）

## このリポジトリで作業するときの注意
- Metabaseの認証情報は `.env.local` のみ。`.env.local.example` を参考に各自設定
- 本番デプロイ前にHTTPS化が必須
- 経営層向けUIではMCPではなくAnthropic SDK + Tool Use（サーバー側でMetabase API呼び出し）
```

---

## 重要な注意点

1. **HTTPS化を最優先で計画**
   現状HTTP通信なので、Metabaseへのリクエストが平文（パスワード含む）でネットワークに流れる。

2. **MetabaseバージョンアップでMCP事情が変わる**
   - v0.49+ → APIキー機能（環境変数からパスワード除去できる）
   - v60+ → Metabase純正MCPサーバー（OAuth、Streamable HTTP）+ Metabot

3. **権限はMetabase側で絞る**
   MCP経由でLLMが使える権限 = サービスアカウントの権限。読み取り専用、最小コレクションのみアクセス可。

4. **経営層向けは別アーキテクチャ**
   Claude DesktopをMCPで使うのはエンジニア・データチーム向け。経営層向けには**Anthropic SDK + Tool Useで自社Webアプリ**を別途構築。

---

## Verification（最終確認方法）

- [ ] macOSで `node -v`、`npx --version` が成功
- [ ] Claude Desktopが起動・ログイン済み
- [ ] Metabaseに専用read-onlyアカウント作成、グループ権限設定済み
- [ ] `~/dev/data-portal` にNext.js 16プロジェクトが作成済み
- [ ] `npm run dev` で http://localhost:3000 が起動する
- [ ] GitHub `sekiemon1990/data-portal` (Private) にpush済み
- [ ] Claude Connectors UIで metabase-mcp コネクタが **有効** 状態（または手動JSONでmcpServers設定済み）
- [ ] Claude Connectors UI で Read-Only Mode が **ON**
- [ ] Claude で「Metabase MCPツール一覧」が取得できる
- [ ] Claude で「ダッシュボード一覧」が取得できる
- [ ] `data-portal/CLAUDE.md` にコンテキスト引き継ぎ情報を記載

---

## 次のフェーズ（参考）

1. **データチーム向け運用を拡げる**
2. **経営層向けWebアプリ開発** — `data-portal` 内で `/dashboard` ルートを作り、Anthropic SDK + Tool Useでサーバー側からMetabase APIを叩く実装
3. **インフラ整備** — HTTPS化、Metabaseバージョンアップ計画

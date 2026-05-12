# 新しいローカルセッションに渡すプロンプト

下の `===== ここから =====` から `===== ここまで =====` の間を**まるごとコピペ**して、Macで起動したClaude Code（CLI）の最初のメッセージとして送ってください。

---

===== ここから =====

# タスク：MacにMetabase MCP連携の開発環境をセットアップしてほしい

## ゴール
1. このMac（macOS）に、Claude Desktop経由で社内Metabaseを叩けるMCPサーバー `@imlewc/metabase-server` を接続する
2. その隣に、将来「経営層向け自然言語ダッシュボード」を作るための新Next.jsリポジトリ `sekiemon1990/data-portal` を立ち上げてGitHubにpushする
3. 最終的に、Claude Desktopのチャット欄から「Metabaseのダッシュボード一覧見せて」と聞いて答えが返る状態にする

## 前提・確定済み事項
以下は前セッションで決定済み。**質問せず、この設定で進めてOK**：

- ローカル環境：macOS
- 自社Metabase：AWS Elastic Beanstalk上のセルフホスト、**v0.49より古い**（APIキー機能なし）
- Metabase URL：`http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com`
- 認証方式：**user+passでセッショントークン**（MCPサーバー側が自動処理）
- 採用MCPサーバー：`@imlewc/metabase-server`（npm配布、user+pass認証対応）
- 新リポジトリ名：`sekiemon1990/data-portal`（**Private**）
- Next.js：**16系**（TypeScript、Tailwind、App Router、`--no-src-dir`、import alias `@/*`）
- MCPクライアント：**Claude Desktop**

## 参照資料
私が前セッションで作った詳細プランとテンプレートは以下にあります。**最初にこれをcloneしてREADする**こと：

```bash
git clone git@github.com:sekiemon1990/makxas-search.git ~/dev/makxas-search
cd ~/dev/makxas-search
git checkout claude/metabase-integration-exploration-nmM4X
```

重要ファイル：
- `docs/metabase-mcp-setup.md` — 全体プラン
- `docs/data-portal-templates/CLAUDE.md` — 新リポジトリ用CLAUDE.mdテンプレ
- `docs/data-portal-templates/README.md` — 新リポジトリ用READMEテンプレ
- `docs/data-portal-templates/.env.local.example` — env例
- `docs/data-portal-templates/claude_desktop_config.json` — Claude Desktop MCP設定テンプレ

## 進め方

### Step 0: 環境の事前確認（自動検出）
以下を実行して、既に入っているものは飛ばす：
```bash
brew --version 2>/dev/null && echo "✅ brew" || echo "❌ brew要"
node -v 2>/dev/null && echo "✅ node" || echo "❌ node要"
gh --version 2>/dev/null && echo "✅ gh" || echo "❌ gh要"
ls /Applications/Claude.app 2>/dev/null && echo "✅ Claude Desktop" || echo "❌ Claude Desktop要"
```
不足分はインストールを案内する。**勝手にbrew installしない** — 必要なものをリストアップして「これとこれを入れていいですか？」と私に確認してから実行する。

### Step 1: 私に確認してほしいこと
以下は私が手動でやる/用意する必要があるので、進める前に聞いてほしい：

1. **Metabaseに専用read-onlyアカウントを作ったか？**
   - メアドとパスワードを `.env.local` と `claude_desktop_config.json` に入れる必要がある
   - 未作成なら、私にMetabase管理画面での作り方を案内してほしい
2. **GitHubで `sekiemon1990/data-portal` リポジトリは未作成のままでよいか？**（`gh repo create` で作る）

### Step 2: 新Next.jsプロジェクト作成
```bash
mkdir -p ~/dev
cd ~/dev
npx create-next-app@latest data-portal \
  --typescript --app --tailwind --no-src-dir --import-alias "@/*"
cd data-portal
```

`~/dev/makxas-search/docs/data-portal-templates/` のテンプレ4ファイルを `data-portal/` にコピー：
```bash
cp ~/dev/makxas-search/docs/data-portal-templates/CLAUDE.md ./
cp ~/dev/makxas-search/docs/data-portal-templates/README.md ./
cp ~/dev/makxas-search/docs/data-portal-templates/.env.local.example ./
```

`.env.local` を作成（コミット禁止）：
```bash
cp .env.local.example .env.local
# 私に METABASE_PASSWORD の値を聞いて、.env.local を編集してほしい
```

任意の追加依存：
```bash
npm install @supabase/ssr @supabase/supabase-js @anthropic-ai/sdk lucide-react clsx tailwind-merge
```

### Step 3: GitHubにPrivateリポジトリ作成 & push
```bash
gh repo create sekiemon1990/data-portal --private --source=. --remote=origin
git add .
git commit -m "Initial commit: Next.js 16 + Metabase連携の足場"
git push -u origin main
```

### Step 4: Claude DesktopにMCP登録
`~/dev/makxas-search/docs/data-portal-templates/claude_desktop_config.json` の中身を `~/Library/Application Support/Claude/claude_desktop_config.json` に書き込む。**METABASE_PASSWORD を私に聞いて実値を入れる**こと。

既存の `claude_desktop_config.json` がある場合は破壊せず `mcpServers` キーに追記マージする。

### Step 5: Claude Desktop完全再起動と動作確認
- 「Claude」メニュー → 「Claudeを終了」で**完全終了**（ドックの×ではダメ）
- 再起動
- **私の方でClaude Desktopのチャット欄に以下を投げて確認する**：
  1. 「Metabase MCPで使えるツール一覧を見せて」
  2. 「Metabaseのダッシュボード一覧を取得して」
  3. 「`Coreデータ分析` コレクションのカード一覧を見せて」

## 各ステップでの振る舞い

- **勝手に進めない**：パスワード入力、`brew install`、`gh repo create`、ファイル上書き等、不可逆な操作の前は必ず私に確認する
- **何が必要かを先に言う**：「次にXとYをします、いいですか？」のスタイル
- **詰まったら止める**：エラーが出たら自分で深掘りせず、エラー全文を見せて「どうしますか？」と聞く
- **ファイル編集は最小**：既存ファイルがある時は壊さずに追記マージする

## 完了条件（このセッションのゴール）
- [ ] `node -v` が成功する
- [ ] Claude Desktopがインストール済み・ログイン済み
- [ ] `~/dev/data-portal` にNext.js 16プロジェクトがある
- [ ] `npm run dev` で http://localhost:3000 が開く
- [ ] GitHub `sekiemon1990/data-portal` (Private) が作成済み、初回commitがpush済み
- [ ] `~/Library/Application Support/Claude/claude_desktop_config.json` にmetabase-server設定が入っている
- [ ] Claude Desktopを再起動して「ダッシュボード一覧見せて」で答えが返る

全部できたら一言「全フェーズ完了」と教えてほしいです。

===== ここまで =====

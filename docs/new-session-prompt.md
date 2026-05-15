# 新しいセッションに渡すプロンプト（最新版）

このファイルには2種類のプロンプトが入っています。状況に応じて使い分けてください：

- **【A】Mac側のClaude Codeセッション用**（実際に環境構築を進める）
- **【B】サンドボックス側で続きをする場合**（追加で何か準備物を作りたい場合）

---

## 【A】Mac側のClaude Codeで実行するプロンプト

下の `===== A: ここから =====` から `===== A: ここまで =====` をまるごとコピペして、**Macのターミナル**で起動したClaude Code（CLI）の最初のメッセージとして送ってください。

```
===== A: ここから =====

# タスク：MacにMetabase MCP連携の開発環境をセットアップしてほしい

## 現状
前セッションで以下が準備済み（リポジトリ `sekiemon1990/makxas-search` のブランチ `claude/metabase-integration-exploration-nmM4X` に格納）：

- `scripts/setup-data-portal.sh` — Mac自動セットアップスクリプト
- `docs/metabase-readonly-account-guide.md` — Metabase専用アカウント作成ガイド
- `docs/metabase-mcp-setup.md` — 全体プラン
- `docs/data-portal-templates/` — 新リポジトリ用テンプレ4ファイル
- `docs/new-session-prompt.md` — このファイル

## ゴール
1. 上記リポジトリをMacにcloneして準備物を取得
2. Metabaseに専用read-onlyアカウントを作成（ガイド参照）
3. セットアップスクリプトを実行して `sekiemon1990/data-portal`（Private）を立ち上げ
4. ClaudeのConnectors UIでMetabase MCPを有効化
5. 「Metabaseのダッシュボード一覧見せて」で答えが返ることを確認

## 進め方

### Step 1: リポジトリ取得
```bash
git clone git@github.com:sekiemon1990/makxas-search.git ~/dev/makxas-search
cd ~/dev/makxas-search
git checkout claude/metabase-integration-exploration-nmM4X
```

### Step 2: Metabase専用アカウント作成（人間が手動でやる）
`docs/metabase-readonly-account-guide.md` をユーザーに開いて見せ、手順通りに作るよう案内する。
ユーザーがアカウント作成完了したら、**メアドとパスワードを聞いて控えておく**（Step 3で使う）。

### Step 3: セットアップスクリプト実行
```bash
./scripts/setup-data-portal.sh
```
スクリプトは対話形式。各破壊的操作の前にy/N確認が出る。スクリプト内でユーザーにMetabaseのメアドとパスワードを聞かれるので、Step 2で控えた値を入れる。

スクリプトが自動でやること：
- brew/node/gh/Claude.app の検出（未インストールならガイド）
- `~/dev/data-portal` にNext.js 16プロジェクト生成
- 依存パッケージインストール
- テンプレ4ファイルコピー
- `.env.local` 対話作成（パスワード非表示入力、chmod 600）
- `gh repo create sekiemon1990/data-portal --private` で作成 & push

### Step 4: ClaudeのConnectors UIでMetabase MCP有効化（人間が手動）
スクリプト完了時に表示される値を、ClaudeのConnectors UIに入力：
- URL: `http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com`
- API Key: 空欄
- User Email: Step 2で作ったメアド
- Password: Step 2で作ったパスワード
- Read-Only Mode: ON
- Export Directory: デフォルトのまま

### Step 5: 動作確認
Claudeチャットで以下を投げる：
1. 「Metabase MCPで使えるツール一覧を見せて」
2. 「Metabaseのダッシュボード一覧を取得して」
3. 「Coreデータ分析コレクションのカードを教えて」

すべて答えが返ればゴール達成。

## 振る舞いのお願い
- **勝手に進めない**：パスワード入力やGitHubリポ作成等、不可逆な操作の前は必ず確認
- **詰まったら止める**：エラー出たら自分で深掘りせず全文を見せて「どうしますか？」
- **既存ファイルは壊さない**：上書き前に確認
- **Connectors UIの操作はユーザーがやる**：スクリプトでは触れない領域

## 完了条件
- [ ] `~/dev/data-portal` にNext.js 16プロジェクトがある
- [ ] `npm run dev` で http://localhost:3000 が起動
- [ ] GitHub `sekiemon1990/data-portal`（Private）にpush済み
- [ ] ClaudeのConnectors UIで `metabase-mcp` が「有効」状態、Read-Only Mode: ON
- [ ] Claudeで「Metabaseのダッシュボード一覧見せて」が動く

完了したら「全フェーズ完了」と教えて。

===== A: ここまで =====
```

---

## 【B】サンドボックス側で続きをする場合のプロンプト

もし「追加で別の準備物を作りたい」「経営層向けダッシュボードの実装を始めたい」など、**ローカル作業に進む前にサンドボックスでもう少し作りたいことがある場合**は、下記を新サンドボックスセッションに渡してください。

```
===== B: ここから =====

# 現状サマリ（前セッションからの引き継ぎ）

リポジトリ `sekiemon1990/claude-code`（GitHub上の正式名は `sekiemon1990/makxas-search`）の
ブランチ `claude/metabase-integration-exploration-nmM4X` で、社内Metabase連携の
立ち上げ準備を進めてきた。

## これまで合意・確定した事項
- Metabase: AWS Elastic Beanstalk、v0.49より古い、HTTP、URL = http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com
- ローカル環境: macOS
- 新リポジトリ: sekiemon1990/data-portal（Private、Next.js 16）
- MCPクライアント: Claude Desktop の Connectors UI
- 採用MCPサーバー: jerichosequitin/metabase-mcp（Connectors UI経由）または @imlewc/metabase-server（手動JSON）
- 認証: 専用read-onlyアカウント（user+passでセッショントークン）
- 経営層向け自然言語UI: 別フェーズ、Anthropic SDK + Tool Useで data-portal リポに実装予定

## 既に用意済みの成果物（このリポジトリ内）
- docs/metabase-mcp-setup.md — 全体プラン（Phase 0〜4）
- docs/metabase-readonly-account-guide.md — Metabase専用アカウント作成手順
- docs/data-portal-templates/ — 新リポジトリ用テンプレ
  - CLAUDE.md / README.md / .env.local.example / claude_desktop_config.json
- scripts/setup-data-portal.sh — Mac側で実行する自動セットアップスクリプト
- docs/new-session-prompt.md — このプロンプト（Mac側Claude Code用 + サンドボックス用）

## サンドボックスの制約（できないこと）
- ❌ macOSローカル操作（brew install、Claude Desktop操作等）
- ❌ ユーザーのMetabaseへの直接アクセス
- ❌ ClaudeのConnectors UIへの直接入力
- ❌ sekiemon1990/data-portal リポジトリ作成（GitHub MCPは claude-code のみスコープ）

## サンドボックスでできること
- このリポジトリへのファイル追加・編集・コミット・push
- ドキュメント、スクリプト、テンプレートの整備
- 経営層向けダッシュボードのコード設計（コミット先は当面 claude-code リポか、後で data-portal が出来てから移す）

## 私からのお願い
やりたいタスクを伝えるので、サンドボックスでできる範囲で進めて。
できない作業に当たったら、それを正直に伝えて代替案を提示して。

===== B: ここまで =====
```

---

## どちらを選ぶか迷ったら

| 状況 | おすすめ |
|---|---|
| **Mac側で実際に環境構築を進めたい** | 【A】 |
| **Macの作業はまだ後でやる、追加で準備物だけ欲しい** | 【B】 |
| **両方やりたい** | 先に【A】（メイン）、必要があれば【B】を後で |

# マクサスサーチ (MAKXAS)

出張買取スタッフ向けの一括相場検索ツール。ヤフオク・メルカリ・ジモティーを横断して落札・売切相場をワンタップで取得し、その場で査定判断を支援する。マクサスコア (基幹業務システム) への前処理ツール。

## 主な機能

- **3 媒体横断検索**: ヤフオク (`__NEXT_DATA__` パース) / ジモティー (HTML パース) / メルカリ (内部 API + DPoP 認証)
- **査定リスト**: 1 出張で複数商品を並行検索し、リスト保存 → マクサスコア連携
- **AI アドバイザ**: Claude Opus 4.7 で中央値・状態ランク別の買取目安額を提示
- **AI オートコンプリート**: Claude Haiku 4.5 + ローカル辞書 + Supabase 検索履歴
- **付属品 AI 抽出**: 本文ヒット 0 時に出品画像から AI で識別
- **検索履歴 / 保存検索**: ★ ピン留めで頻用検索を上位固定
- **音声入力検索 / NG ワードプリセット / 査定メモテンプレ**: 現場効率化
- **PWA インストール + Service Worker**: ホーム画面起動 + オフラインキャッシュ
- **オフライン検索キュー**: 圏外時の検索を保留 → 復帰時に自動実行
- **API レートリミット**: in-memory バケットで burst 防御

## 技術スタック

- Next.js 16 App Router (React 19)
- Tailwind CSS v4
- Supabase (Postgres + Auth + RLS)
- @tanstack/react-query
- @anthropic-ai/sdk (Claude Opus 4.7 + Haiku 4.5)
- cheerio (HTML パース)
- Vercel (Hobby tier、関数 60s 上限)

## セットアップ

### 1. 依存インストール

```bash
npm install
```

### 2. 環境変数

`.env.example` を `.env.local` にコピーして埋める:

```bash
cp .env.example .env.local
```

必須変数:

| 変数 | 取得元 |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上 (サーバ専用) |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `ADMIN_EMAILS` | 管理画面を許可するメールアドレス（カンマ区切り） |
| `GATEWAY_BASE_URL` | Decision Ledger API。既定: `https://makxas-integrations-gateway.vercel.app` |
| `GATEWAY_SHARED_TOKEN` | Gateway 共有トークン（サーバ専用。`NEXT_PUBLIC_` 禁止） |
| `GATEWAY_AGENT_READONLY_TOKEN` | Gateway Decision Ledger recent の read-only 再取得用トークン（あればこちらを優先） |
| `GATEWAY_BI_READONLY_TOKEN` | Gateway Metabase read-only 経由で core assessed_amount を取得する場合の最小権限トークン |
| `MIKOMIKU_OBJECTIVE_INTERNAL_TOKEN` | objective API の内部 self-smoke 用トークン（サーバ専用。`NEXT_PUBLIC_` 禁止） |

`GATEWAY_SHARED_TOKEN` が未設定の場合、見込金額の算出自体は継続し、Decision Ledger への記録だけを skip する。
本番では Vercel の Environment Variables に `GATEWAY_BASE_URL` と `GATEWAY_SHARED_TOKEN` を設定する。
`GATEWAY_AGENT_READONLY_TOKEN` がある場合、`npm run smoke:assessment-decision-ledger-read` で
Decision Ledger の `assessment_price_suggestion` recent を読み、PIIなしの採用率メトリクスだけを再計算する。
`GATEWAY_BI_READONLY_TOKEN` または `GATEWAY_AGENT_READONLY_TOKEN` がある場合、`npm run smoke:assessment-core-assessed-read` で
Gateway Metabase read-only routeから `project_id` / `item_id` / `assessed_amount` / `contracted_at` だけを取得し、AI査定提案との突合に使う。
`MIKOMIKU_OBJECTIVE_INTERNAL_TOKEN` は AI / CI の本番 self-smoke が、通常ログイン cookie なしで
`/api/estimate/mikomiku/objective` を実行するためだけに使う。顧客PIIを body に入れない。

### 3. Supabase スキーマ適用

Supabase ダッシュボード → SQL Editor で以下を順に実行:

```bash
supabase/schema.sql                          # 初期スキーマ
supabase/fix-rls-policies.sql                # RLS ポリシー
supabase/migrate-list-items.sql              # 査定リスト
supabase/migrate-search-keywords.sql         # 検索履歴
supabase/migrate-search-keywords-favorite.sql # 保存検索 (★)
```

### 4. 開発サーバ起動

```bash
npm run dev
```

http://localhost:3000 でアクセス。

## デプロイ

GitHub に push すると Vercel が自動デプロイ。`main` ブランチが本番。

- 本番 URL: `makxas-search.vercel.app` (旧 `claude-code-psi-eight.vercel.app` も並行稼働)
- Preview: 各 PR 毎に `makxas-search-git-{branch}-...vercel.app`

### CI

GitHub Actions (`.github/workflows/ci.yml`) で PR / push 時に自動実行:
- `npx tsc --noEmit` (型チェック)
- `npm run build` (ビルド検証)

## ディレクトリ構成

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # Route Handlers
│   │   ├── ai-advisor/         # Claude Opus 4.7 で査定アドバイス
│   │   ├── detect-accessories/ # 画像から付属品検出
│   │   ├── keyword-suggest/    # Haiku 4.5 でオートコンプリート
│   │   ├── refine-keywords/    # 結果が多い時のキーワード絞り込み提案
│   │   └── scrape/             # 各媒体スクレイパ
│   ├── search/             # 検索フロー
│   ├── list/               # 査定リスト
│   ├── history/            # 検索履歴 / 閲覧履歴 / 査定履歴
│   └── settings/           # 設定
├── components/             # 共通 React コンポーネント
└── lib/
    ├── api/                # Supabase クライアント関数
    ├── scrapers/           # 各媒体のスクレイパ実装
    │   ├── yahoo.ts            # ヤフオク検索 (一覧)
    │   ├── yahoo-item.ts       # ヤフオク商品詳細
    │   ├── jimoty.ts           # ジモティー検索
    │   ├── jimoty-item.ts      # ジモティー商品詳細
    │   ├── mercari.ts          # メルカリ検索
    │   ├── mercari-item.ts     # メルカリ商品詳細
    │   └── mercari-dpop.ts     # メルカリ DPoP 認証共通
    ├── offline-queue.ts    # オフライン検索キュー
    ├── rate-limit.ts       # API レートリミッタ
    └── ...
```

## スクレイパの注意点

- **メルカリ**: 内部 API (`api.mercari.jp/v2/entities:search`) を DPoP 認証で叩いている。仕様は非公開のため API 構造変更で壊れる可能性あり。`X-Platform: web` + `DPoP` ヘッダ必須。
- **ヤフオク**: `__NEXT_DATA__` JSON-LD を再帰探索。レイアウト変更で壊れる可能性あり。
- **ジモティー**: SSR HTML を cheerio でパース。ID `is_favorite` カラムは `search_keywords` テーブルに追加済み。

レートリミット (per IP / 分):
- スクレイプ系一覧: 30
- 商品詳細: 60
- AI アドバイザ: 20
- AI 補足候補: 120 (オートコンプリート)
- AI 関連: 30

## 運用

### スクレイパが壊れた時

- Vercel Function Logs を確認 (`[yahoo-scrape]` `[mercari-scrape]` `[jimoty-scrape]` のログプレフィクスで grep)
- 一覧 API のレスポンスフィールド名を `sample item keys:` ログで確認
- `__NEXT_DATA__` not found の場合はサイト構造変更
- 修正は各 `src/lib/scrapers/*.ts` を個別更新 → PR

### Supabase マイグレーション

新規スキーマ変更は `supabase/migrate-*.sql` に追加し、PR 説明欄に SQL を記載。デプロイ前に SQL Editor で手動実行。

## ライセンス / 利用規約

社内ツール。各プラットフォーム (ヤフオク・メルカリ・ジモティー) の利用規約を遵守すること。スクレイピング頻度は控えめに、業務用途の範囲内で利用する。

# このリポジトリの開発ルール

## 共通ルール (sekiemon1990 管理 repo 全体)

### Identity
関 憲人 (せきえもん) / 株式会社マクサス代表取締役。主事業: 出張買取 **買取マクサス** (https://makxas.com / https://kaitorimakxas.com)。

### スペル統一
Latin 表記は `makxas` (全小文字)。NG: `MakXAS` / `Maxus` / `maxus` (k 抜け) / `Makas`

### branch / PR
`feat/*` `fix/*` `chore/*` で作業。`main` 直接 push 禁止 (PR 必須、squash merge 推奨)。

### ターミナルタブ運用 (Mac local)
A = git・短時間 / B = dev server / C = log 監視 / D = スクラッチ

### コードブロック / コマンド分割
コピーが必要なものだけコードブロック使用。基本は 1 ブロックに `&&` 連結、破壊的操作 (`rm -rf` / `git push --force` / `gh api -X DELETE` 等) のみ 1 ボックス。

### 並列運用
1 product = 1 永続 session。同 repo 内並列は `claude -w <name>` で git worktree 隔離 (`.gitignore` に `.claude/worktrees/`、`.worktreeinclude` で .env 等自動コピー、並列数 2-4 推奨)。

### コミュニケーション
ユーザーは非エンジニア PM (マクサスコア 8 年経験、Web/アプリ構造理解はあるが専門用語は不慣れ、学習意欲高い)。初出の専門用語は括弧で簡潔補足、HOW + WHY を 1-2 行、過度な簡略化はしない。

## このリポジトリ固有

- product: マクサスサーチ (出張買取相場検索ツール、社内向け)
- stack: Next.js + Supabase + Anthropic + cheerio
- deploy: Vercel (https://makxas-search.vercel.app)
- dev port: 3000
- 旧名: claude-code (rename 済、GitHub redirect で旧 URL も動作)

## 外部サービス直リンク
| サービス | URL |
|---|---|
| Supabase SQL Editor | https://supabase.com/dashboard/project/vovdcefklafyiqiqtdsy/sql/new |
| Supabase テーブルエディタ | https://supabase.com/dashboard/project/vovdcefklafyiqiqtdsy/editor |
| Vercel ダッシュボード | https://vercel.com/sekiemon1990s-projects/makxas-search |
| GitHub リポジトリ | https://github.com/sekiemon1990/makxas-search |

## コスト
**全 session 必読。新ツール追加時は必ず更新すること。**

### 固定費 (月額 / 年額)
- Vercel Pro 共有: $20/月 (全プロダクト共通枠、100 deploy/日)
- Anthropic Claude Max plan 共有: $200/月 (Claude Code CLI 経由)
- Supabase Free tier: $0/月 (現時点)、Pro 移行時 $25/月

### 従量課金
- Anthropic Claude API (Opus 4.7): $5/1M input tokens、$25/1M output tokens
- Anthropic Claude API (Haiku 4.5): $1/1M input tokens、$5/1M output tokens
- Supabase: 超過時 → DB $0.125/GB/月、Auth $0.00325/MAU (1,000 MAU 無料枠超過後)

### 無料枠と上限
- Vercel Pro 共有: 100 deploy/日、Functions 1,000GB-hrs/月
- Supabase Free: DB 500MB、Auth 50,000 MAU、Storage 1GB (超過で自動 Pro 移行)

### 業務クリティカル度
- 誤操作による損失リスク: **高** (スタッフの査定判断ツール。ダウン = 査定業務停止)

---

## よく使うコマンド

- `npm run dev` — 開発サーバー起動（port 3000）
- `npm run build` — 本番ビルド
- `npm run lint` — ESLint チェック
- `npx tsc --noEmit` — 型チェック

## Codex CLI との分業

このプロジェクトでは Claude Code と Codex CLI を **タスクの規模・難易度で使い分ける**。コピペ往復を避けるため、`/codex` および `/codex-review` スラッシュコマンドで Codex を直接呼び出す。

### 役割分担の判断基準

- **小〜中規模の実装・修正・調査** → Claude Code が直接実装（Codex 委譲しない）
- **大規模／設計が複雑な実装** → Claude Code は設計・指示作成・レビューに専念し、Codex に実装を委譲

委譲するかどうかはユーザーから明示指示がある場合のみ Codex を使う。ユーザーが指示していないのに勝手に Codex に委譲しないこと。

### Codex 委譲時のフロー

1. Claude Code 側で要件を整理し、Codex に渡す指示文（必要なファイル内容・型定義・受け入れ基準を含む）を作成する
2. `/codex <指示>` で Codex に実装させ、出力を取り込む
3. 取り込んだ実装を Claude Code 側でレビューし、必要なら修正・追加指示
4. 大きめの差分は `/codex-review` で Codex 側にもクロスレビューさせると盲点が減る

### 暴走防止ルール（必ず守る）

- 同一タスクで `/codex` 往復は最大 3 回まで。4 回目以降は人間に判断を仰ぐ
- 1 PR は概ね 300 行以内。超えそうなら Issue を分割する
- 受け入れ条件にない変更は実装しない（範囲外への拡張禁止）
- Supabase RLS の権限緩和、依存関係のメジャーバージョン更新、CI 設定変更は人間の承認必須

## GitHub 運用

- Issue は `.github/ISSUE_TEMPLATE/` のテンプレートに従う
- PR は `.github/pull_request_template.md` に従う。1 Issue = 1 PR、本文に `Closes #N` を必ず書く
- ラベル運用: `needs-design` / `ready-for-codex` / `in-progress` / `needs-review` / `blocked`
- コミットメッセージ: `feat:` `fix:` `chore:` `docs:` `refactor:` のいずれかをプレフィックス

### Codex に指示を渡すときの注意

- Codex は別セッションでリポジトリ状態を共有しないため、関連ファイルの内容や型定義をプロンプトに含める
- ファイル編集まで自動で行わせる場合は `codex --full-auto` を使う（既定は読み取りのみ）
- 認証エラー時は `codex login status` を確認

## コーディング規約

- TypeScript 必須。`any` は禁止、Supabase データには `supabase gen types` で生成した型を使う
- スクレイピングロジック（cheerio）は `lib/scraper/` または `lib/` 配下にまとめる
- Anthropic API コールはサーバーサイド（Route Handler）のみ。クライアントサイドから直接呼ばない
- API キーはすべて `.env.local` 管理（`process.env` でアクセス）

## やってはいけないこと

- `.env.local` / `.env` のコミット（`git add -f` 等での強制追加も禁止）
- Supabase RLS ポリシーの権限緩和 → ユーザー承認必須
- Anthropic API キーのクライアントサイドへの露出（`NEXT_PUBLIC_` プレフィックス禁止）
- 依存パッケージのメジャーバージョン更新 → 動作確認なしでの実施禁止
- 本番 Supabase プロジェクトへのスキーマ変更（DROP / ALTER）は明示指示があるときのみ

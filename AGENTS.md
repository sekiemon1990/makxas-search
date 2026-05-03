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

## コスト
**全 session 必読。新ツール追加時は必ず更新すること。**

### 固定費 (月額 / 年額)
- Vercel Pro 共有: $20/月 (全プロダクト共通枠、100 deploy/日)
- Anthropic Claude Max plan 共有: $200/月 (Claude Code CLI 経由)
- Supabase Free tier: $0/月 (現時点)、Pro 移行時 $25/月

### 従量課金
- Anthropic Claude API (Opus 4.7): $15/1M input tokens、$75/1M output tokens
- Anthropic Claude API (Haiku 4.5): $0.80/1M input tokens、$4/1M output tokens
- Supabase: 超過時 → DB $0.125/GB/月、Auth $0.00325/MAU (1,000 MAU 無料枠超過後)

### 無料枠と上限
- Vercel Pro 共有: 100 deploy/日、Functions 1,000GB-hrs/月
- Supabase Free: DB 500MB、Auth 50,000 MAU、Storage 1GB (超過で自動 Pro 移行)

### 業務クリティカル度
- 誤操作による損失リスク: **高** (スタッフの査定判断ツール。ダウン = 査定業務停止)

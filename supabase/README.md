# Supabase マイグレーション運用

このプロジェクトは現状 Supabase CLI ではなく **手動 SQL 適用** で運用している。
新規スキーマ変更時は以下の手順で進める。

## 適用順 (新規環境のセットアップ)

Supabase ダッシュボードの **SQL Editor** で順番に貼り付けて Run:

| # | ファイル | 内容 |
|---|---------|------|
| 1 | `schema.sql` | 初期スキーマ (auth プロファイル等) |
| 2 | `fix-rls-policies.sql` | RLS ポリシー修正 |
| 3 | `migrate-list-items.sql` | 査定リスト + ListItem テーブル |
| 4 | `migrate-search-keywords.sql` | 検索キーワード履歴 (オートコンプリート学習用) |
| 5 | `migrate-search-keywords-favorite.sql` | 保存検索 (`is_favorite` カラム追加) |
| 6 | `migrate-admin-ai-feedback.sql` | 管理画面 AI チャットログ endpoint 制約 + フィードバックテーブル |

各ファイルは **冪等** (`if not exists` / `add column if not exists`) で書かれているため、重複実行しても安全。

## 新規マイグレーションの追加手順

1. **新ファイル作成**: `supabase/migrate-{機能名}.sql`
   - 命名規則: `migrate-` プレフィクス + 簡潔な機能名
   - `create table if not exists` / `add column if not exists` を使い冪等に
   - RLS 必須: 各テーブルに `enable row level security` + `policy` 定義
2. **コードと同じ PR でコミット**
3. **PR description にも SQL 内容を貼る** (レビュアー / マージ後実行者が確認しやすい)
4. **マージ前に Supabase で SQL Editor 適用** (デプロイ後 runtime エラーを防ぐため)
5. **動作確認** → main マージ → デプロイ → 本番反映

## 適用済みかチェックする方法

```sql
-- カラム存在確認
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'search_keywords';

-- インデックス確認
select indexname from pg_indexes
where tablename = 'search_keywords';

-- RLS ポリシー確認
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public';
```

## バックアップ

Supabase の自動バックアップ (Pro プラン以上) または手動エクスポート:

```bash
# 全データを SQL ダンプ (Supabase ダッシュボード > Database > Backups から)
```

## 将来の自動化候補

- Supabase CLI (`supabase db push`) でマイグレーション管理
- GitHub Actions: PR マージ時に自動適用 (要 Supabase access token)
- 現状は手動で十分小さいので優先度低

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## マクサス営業思想（全ツール共通・必読）

株式会社マクサスは、リユース領域でIT/AIによって人の能力を最大化する営業会社。
このリポジトリで開発するすべての機能・出力は以下の思想に従うこと。

**営業 = 利益の最大化 × 顧客満足度の最大化**

### レバー1：商品利益の最大化
入口商品を顧客が売ってくれる最低ラインで買い切る。徹底したヒアリングと交渉力が必要。

### レバー2：追加商品の買取（★最重要）
問い合わせ商品以外の、顧客が価値に気づいていない中古品を買い取る。
特に「定価が高く、サイズが小さい高価古物」（貴金属・ブランド品・時計等）を優先。
レバー2は天井がなく、レバー1より伸ばしやすい。

### ツール開発時の判断基準
1. デフォルトでレバー2を優先する（提案・分析・スコアリングの重みづけ）
2. 計測対象に追加買取指標（追加買取率・追加粗利・追加点数）を必ず含める
3. 評価系ツールは「追加買取の切り出しがあったか」を評価軸に含める
4. 顧客満足度を犠牲にしない（押し売り禁止・顧客が後悔しない取引のみ推奨）

詳細: `~/.claude/MAKXAS_PHILOSOPHY.md`（ローカル）または `MAKXAS_PHILOSOPHY.md`（リポジトリ内）

#!/usr/bin/env bash
# setup-data-portal.sh
# Macローカルで data-portal リポジトリを立ち上げ、Metabase MCP連携の準備をする。
# 各破壊的操作の前に y/N 確認を取る。`--yes` で全自動化可能。

set -euo pipefail

# ---------- 設定 ----------
DEV_DIR="${DEV_DIR:-$HOME/dev}"
PROJECT_NAME="${PROJECT_NAME:-data-portal}"
GITHUB_OWNER="${GITHUB_OWNER:-sekiemon1990}"
METABASE_URL_DEFAULT="http://metabase-zgnsj-env.ap-northeast-1.elasticbeanstalk.com"
TEMPLATES_DIR_DEFAULT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/data-portal-templates"

# ---------- 色付け ----------
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'
  C_BLU=$'\033[34m'; C_BLD=$'\033[1m'; C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YLW=""; C_BLU=""; C_BLD=""; C_RST=""
fi

info() { printf "%s[i]%s %s\n" "$C_BLU" "$C_RST" "$1"; }
ok()   { printf "%s[\xe2\x9c\x94]%s %s\n" "$C_GRN" "$C_RST" "$1"; }
warn() { printf "%s[!]%s %s\n" "$C_YLW" "$C_RST" "$1"; }
err()  { printf "%s[x]%s %s\n" "$C_RED" "$C_RST" "$1" >&2; }
step() { printf "\n%s%s===== %s =====%s\n" "$C_BLD" "$C_BLU" "$1" "$C_RST"; }

AUTO_YES=false
TEMPLATES_DIR=""
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=true ;;
    --templates=*) TEMPLATES_DIR="${arg#*=}" ;;
    -h|--help)
      cat <<USAGE
使い方: $(basename "$0") [--yes] [--templates=PATH]
  --yes             すべての確認に自動でyesと答える
  --templates=PATH  data-portal-templates ディレクトリのパスを指定
                    (省略時: $TEMPLATES_DIR_DEFAULT)

環境変数:
  DEV_DIR           作業ディレクトリ (デフォルト: \$HOME/dev)
  PROJECT_NAME      作成するプロジェクト名 (デフォルト: data-portal)
  GITHUB_OWNER      GitHubユーザー名 (デフォルト: sekiemon1990)
USAGE
      exit 0
      ;;
  esac
done

TEMPLATES_DIR="${TEMPLATES_DIR:-$TEMPLATES_DIR_DEFAULT}"

confirm() {
  local prompt="$1"
  if $AUTO_YES; then
    info "$prompt → yes (--yes)"
    return 0
  fi
  printf "%s%s%s [y/N]: " "$C_BLD" "$prompt" "$C_RST"
  read -r ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

# ---------- 0. OSチェック ----------
step "0. 環境確認"
if [[ "$(uname -s)" != "Darwin" ]]; then
  err "このスクリプトはmacOS専用です。検出されたOS: $(uname -s)"
  exit 1
fi
ok "macOS"

# ---------- 1. ツール検出 ----------
step "1. 必須ツール検出"
MISSING=()

check_cmd() {
  local cmd="$1" label="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$label: $($cmd --version 2>&1 | head -1)"
  else
    warn "$label: 未インストール"
    MISSING+=("$cmd")
  fi
}

check_cmd brew Homebrew
check_cmd node Node.js
check_cmd npx npx
check_cmd gh "GitHub CLI"
check_cmd git Git

if [[ -d "/Applications/Claude.app" ]]; then
  ok "Claude Desktop: /Applications/Claude.app"
else
  warn "Claude Desktop: 未インストール (https://claude.ai/download)"
  MISSING+=("claude-desktop")
fi

# ---------- 2. 不足ツールのインストール案内 ----------
if (( ${#MISSING[@]} > 0 )); then
  step "2. 不足ツールのインストール"
  warn "以下が不足: ${MISSING[*]}"
  if confirm "ガイドを表示しますか？（自動インストールはしません）"; then
    for tool in "${MISSING[@]}"; do
      case "$tool" in
        brew) echo '  brew: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' ;;
        node) echo '  node: brew install node' ;;
        npx) echo "  npx: nodeに同梱されています。node導入後に再実行してください" ;;
        gh) echo '  gh: brew install gh && gh auth login' ;;
        git) echo '  git: xcode-select --install' ;;
        claude-desktop) echo "  Claude Desktop: https://claude.ai/download からダウンロード" ;;
      esac
    done
    err "上記をインストールしてから再実行してください"
    exit 1
  fi
  err "不足ツールがあるため中断します"
  exit 1
fi
ok "必須ツールは揃っています"

# ---------- 3. gh認証チェック ----------
step "3. GitHub CLI認証"
if ! gh auth status >/dev/null 2>&1; then
  warn "ghにログインしていません"
  if confirm "今すぐ gh auth login を実行しますか？"; then
    gh auth login
  else
    err "gh認証なしには進められません"
    exit 1
  fi
fi
ok "gh: $(gh api user --jq .login 2>/dev/null || echo "認証OK")"

# ---------- 4. 作業ディレクトリ ----------
step "4. 作業ディレクトリ準備"
mkdir -p "$DEV_DIR"
ok "$DEV_DIR"

PROJECT_PATH="$DEV_DIR/$PROJECT_NAME"
if [[ -e "$PROJECT_PATH" ]]; then
  err "既に存在します: $PROJECT_PATH"
  err "別名にするか、ディレクトリを削除/移動してから再実行してください"
  exit 1
fi

# ---------- 5. テンプレートディレクトリの存在確認 ----------
step "5. テンプレートディレクトリ確認"
if [[ ! -d "$TEMPLATES_DIR" ]]; then
  err "テンプレートディレクトリが見つかりません: $TEMPLATES_DIR"
  err "--templates=PATH で指定するか、sekiemon1990/makxas-search をcloneしてそのdocs/data-portal-templates/を指してください"
  exit 1
fi
ok "テンプレート: $TEMPLATES_DIR"

# ---------- 6. Next.js プロジェクト生成 ----------
step "6. Next.js 16 プロジェクト生成"
if confirm "$PROJECT_PATH に create-next-app を実行しますか？"; then
  cd "$DEV_DIR"
  npx --yes create-next-app@latest "$PROJECT_NAME" \
    --typescript --app --tailwind --no-src-dir --import-alias "@/*" \
    --no-eslint --turbopack
  ok "プロジェクト生成完了"
else
  err "中断"
  exit 1
fi

cd "$PROJECT_PATH"

# ---------- 7. 追加依存 ----------
step "7. 追加依存インストール"
if confirm "@supabase/ssr, @anthropic-ai/sdk, lucide-react 等を入れますか？"; then
  npm install \
    @supabase/ssr @supabase/supabase-js \
    @anthropic-ai/sdk \
    lucide-react clsx tailwind-merge
  ok "依存インストール完了"
else
  info "追加依存はスキップ"
fi

# ---------- 8. テンプレ流し込み ----------
step "8. テンプレートコピー"
for f in CLAUDE.md README.md .env.local.example; do
  src="$TEMPLATES_DIR/$f"
  dest="$PROJECT_PATH/$f"
  if [[ -f "$dest" ]]; then
    warn "$f は既に存在。上書きしません"
    continue
  fi
  if [[ -f "$src" ]]; then
    cp "$src" "$dest"
    ok "コピー: $f"
  else
    warn "テンプレに $f がありません"
  fi
done

# ---------- 9. .env.local を対話作成 ----------
step "9. .env.local 作成"
if [[ -f "$PROJECT_PATH/.env.local" ]]; then
  warn ".env.local は既に存在。スキップします"
else
  if confirm "対話形式で .env.local を作りますか？（パスワード入力あり）"; then
    printf "Metabase URL [%s]: " "$METABASE_URL_DEFAULT"
    read -r METABASE_URL_INPUT
    METABASE_URL_INPUT="${METABASE_URL_INPUT:-$METABASE_URL_DEFAULT}"

    printf "Metabase専用read-onlyアカウントのメアド: "
    read -r METABASE_USER_INPUT

    printf "Metabaseパスワード (入力非表示): "
    read -rs METABASE_PASS_INPUT
    echo

    cat > "$PROJECT_PATH/.env.local" <<EOF
# Metabase MCP接続用（コミット禁止）
METABASE_URL=$METABASE_URL_INPUT
METABASE_USERNAME=$METABASE_USER_INPUT
METABASE_PASSWORD=$METABASE_PASS_INPUT
EOF
    chmod 600 "$PROJECT_PATH/.env.local"
    ok ".env.local 作成 (chmod 600)"
  else
    info "後で手動作成してください: $PROJECT_PATH/.env.local"
  fi
fi

# ---------- 10. GitHub Privateリポ作成 & push ----------
step "10. GitHubリポジトリ作成"
if confirm "GitHubに $GITHUB_OWNER/$PROJECT_NAME を Private で作成して push しますか？"; then
  cd "$PROJECT_PATH"
  # create-next-app は自動で git init するが念のため
  if [[ ! -d .git ]]; then
    git init -b main
  fi
  git add .
  if git diff --staged --quiet; then
    info "変更なし、commitスキップ"
  else
    git commit -m "Initial commit: Next.js 16 + Metabase MCP連携の足場"
  fi
  gh repo create "$GITHUB_OWNER/$PROJECT_NAME" --private --source=. --remote=origin --push
  ok "https://github.com/$GITHUB_OWNER/$PROJECT_NAME (Private) 作成完了"
else
  info "GitHubリポジトリ作成はスキップしました"
fi

# ---------- 11. 次のステップ表示 ----------
step "11. 次にやること（手動）"
cat <<NEXT

${C_BLD}✅ ローカル作業は完了です。残りは手動で：${C_RST}

${C_BLD}A. Metabaseに専用read-onlyアカウントを作成${C_RST}
   ガイド: makxas-searchリポジトリの docs/metabase-readonly-account-guide.md

${C_BLD}B. ClaudeのConnectors UIにMetabase MCPを登録${C_RST}
   URL:               $METABASE_URL_DEFAULT
   API Key:           （空欄）
   User Email:        $(grep '^METABASE_USERNAME=' "$PROJECT_PATH/.env.local" 2>/dev/null | cut -d= -f2 || echo '上で入力したメアド')
   Password:          （上で入力したパスワード）
   Read-Only Mode:    ON
   Export Directory:  \${DOWNLOADS}/Metabase （デフォルトのまま）

${C_BLD}C. 動作確認${C_RST}
   Claudeチャットで「Metabaseのダッシュボード一覧を見せて」と聞く

${C_BLD}D. 開発開始${C_RST}
   cd $PROJECT_PATH
   npm run dev
   # http://localhost:3000

NEXT
ok "完了"

#!/usr/bin/env bash
# ============================================================
# backup / backup-log 回归测试（此前为 HELP 假命令，health 还推荐它）
# ============================================================
set -uo pipefail
ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ENGINE_DIR/engine.js"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

command -v git >/dev/null 2>&1 || { echo "  ⚠ git 不可用，跳过"; exit 0; }

TMP="$(mktemp -d)"
export OPENCLAW_WORKSPACE="$TMP"
trap 'rm -rf "$TMP"' EXIT

node "$ENGINE" init >/dev/null 2>&1
node "$ENGINE" record --role user --text "备份测试消息" >/dev/null 2>&1

OUT="$(node "$ENGINE" backup --msg "测试备份" 2>&1)"
if echo "$OUT" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('ok'), d" 2>/dev/null; then
  ok "backup 成功（自动 git init + commit）"
else
  bad "backup 失败: $(echo "$OUT" | head -3)"
fi

if [ -d "$TMP/.git" ]; then ok "git 仓库已初始化"; else bad "git 仓库未创建"; fi

LOG="$(node "$ENGINE" backup-log 2>&1)"
if echo "$LOG" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('ok') and len(d.get('commits',[])) >= 1" 2>/dev/null; then
  ok "backup-log 返回提交历史"
else
  bad "backup-log 失败: $(echo "$LOG" | head -3)"
fi

echo ""
echo "  [test-backup] 通过 $PASS / $((PASS+FAIL))"
[ $FAIL -eq 0 ] || exit 1

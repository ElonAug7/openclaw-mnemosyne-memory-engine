#!/usr/bin/env bash
# ============================================================
# 引擎 CLI 核心测试（隔离临时目录）
# 覆盖: 语法/init/record/status/context/search/recall/todos/health
#       + 搜索延迟硬指标 (<50ms) + 版本一致性
# ============================================================
set -uo pipefail
ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ENGINE_DIR/engine.js"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

TMP="$(mktemp -d)"
export OPENCLAW_WORKSPACE="$TMP"
cleanup_tmp() { rm -rf "$TMP"; }
trap cleanup_tmp EXIT

# ---- 语法 ----
node --check "$ENGINE" 2>/dev/null && ok "engine.js 语法检查" || bad "engine.js 语法检查"

# ---- 核心命令 ----
node "$ENGINE" init >/dev/null 2>&1 && ok "init" || bad "init"
node "$ENGINE" record --role user --text "测试消息一" >/dev/null 2>&1 && ok "record" || bad "record"
node "$ENGINE" record --role assistant --text "测试回复一" >/dev/null 2>&1 && ok "record(assistant)" || bad "record(assistant)"
node "$ENGINE" status >/dev/null 2>&1 && ok "status" || bad "status"
node "$ENGINE" context >/dev/null 2>&1 && ok "context" || bad "context"
node "$ENGINE" search --query "测试" >/dev/null 2>&1 && ok "search" || bad "search"
node "$ENGINE" recall --query "测试消息" >/dev/null 2>&1 && ok "recall" || bad "recall"
node "$ENGINE" todos --add "测试待办" >/dev/null 2>&1 && ok "todos --add" || bad "todos --add"
node "$ENGINE" todos >/dev/null 2>&1 && ok "todos list" || bad "todos list"
node "$ENGINE" health >/dev/null 2>&1 && ok "health" || bad "health"
node "$ENGINE" report >/dev/null 2>&1 && ok "report" || bad "report"

# ---- 数据落盘 ----
if [ -d "$TMP/memory" ]; then ok "memory 目录生成"; else bad "memory 目录生成"; fi

# ---- 搜索延迟硬指标 (<50ms，取 --profile 的 multiPathSearch 计算耗时) ----
MS_LINE="$(node "$ENGINE" search --query "测试消息" --profile 2>&1 >/dev/null | grep multiPathSearch)"
MS="$(echo "$MS_LINE" | grep -o '[0-9.]*' | head -1)"
if [ -n "$MS" ]; then
  if awk "BEGIN{exit !($MS < 50)}"; then ok "搜索计算延迟 ${MS}ms < 50ms 硬指标"; else bad "搜索计算延迟 ${MS}ms ≥ 50ms"; fi
else
  bad "无法解析延迟数据: $MS_LINE"
fi

# ---- 版本一致性 ----
ENG_VER="$(node "$ENGINE" status 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('version',''))" 2>/dev/null)"
if [ -f "$ENGINE_DIR/VERSION" ]; then
  FILE_VER="$(cat "$ENGINE_DIR/VERSION" | tr -d '[:space:]')"
  if [ "$ENG_VER" = "$FILE_VER" ]; then ok "引擎版本=$FILE_VER 与 VERSION 文件一致"; else bad "引擎版本 '$ENG_VER' ≠ VERSION 文件 '$FILE_VER'"; fi
  # bridge 现在用 IIFE 读 VERSION 文件，验证其回退常量与文件一致
  BRIDGE_FALLBACK="$(grep -o "'v[0-9.]*'" "$ENGINE_DIR/elite/hermes-bridge.js" | head -1 | tr -d "'")"
  if [ "$BRIDGE_FALLBACK" = "$FILE_VER" ]; then ok "bridge 回退版本一致"; else bad "bridge 回退 '$BRIDGE_FALLBACK' ≠ '$FILE_VER'"; fi
  INSTALL_FALLBACK="$(grep -o '"v[0-9.]*"' "$ENGINE_DIR/elite/install-elite.sh" | head -1 | tr -d '"')"
  if [ "$INSTALL_FALLBACK" = "$FILE_VER" ]; then ok "install 回退版本一致"; else bad "install 回退 '$INSTALL_FALLBACK' ≠ '$FILE_VER'"; fi
else
  bad "VERSION 文件缺失"
fi

echo ""
echo "  [test-engine-cli] 通过 $PASS / $((PASS+FAIL))"
[ $FAIL -eq 0 ] || exit 1

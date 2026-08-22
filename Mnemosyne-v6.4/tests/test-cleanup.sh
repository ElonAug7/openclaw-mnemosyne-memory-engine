#!/usr/bin/env bash
# ============================================================
# cleanup 回归测试（曾因 dirsToCheck 未定义直接崩溃）
# ============================================================
set -uo pipefail
ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ENGINE_DIR/engine.js"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

TMP="$(mktemp -d)"
export OPENCLAW_WORKSPACE="$TMP"
trap 'rm -rf "$TMP"' EXIT

node "$ENGINE" init >/dev/null 2>&1
node "$ENGINE" record --role user --text "清理测试" >/dev/null 2>&1

# --confirm 应正常返回 JSON（曾经崩溃: dirsToCheck is not defined）
OUT="$(node "$ENGINE" cleanup --confirm 2>&1)"
if echo "$OUT" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
  ok "cleanup --confirm 正常返回 JSON"
else
  bad "cleanup --confirm 非 JSON: $(echo "$OUT" | head -2)"
fi

# dry-run 也应正常
OUT2="$(node "$ENGINE" cleanup 2>&1)"
if echo "$OUT2" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
  ok "cleanup dry-run 正常返回 JSON"
else
  bad "cleanup dry-run 非 JSON: $(echo "$OUT2" | head -2)"
fi

echo ""
echo "  [test-cleanup] 通过 $PASS / $((PASS+FAIL))"
[ $FAIL -eq 0 ] || exit 1

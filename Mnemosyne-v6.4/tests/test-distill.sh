#!/usr/bin/env bash
# ============================================================
# distill 提案审阅回归测试（distill-reject 曾为假命令）
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
mkdir -p "$TMP/memory/engine"

cat > "$TMP/memory/engine/distill-proposals.json" << 'EOF'
{
  "proposals": [
    {"id": 1, "section": "重要事件", "content": "测试提案A", "status": "pending", "created_at": "2026-08-15T00:00:00Z"},
    {"id": 2, "section": "重要事件", "content": "测试提案B", "status": "pending", "created_at": "2026-08-15T00:00:00Z"}
  ],
  "updated_at": null
}
EOF

# reject 应真正生效（曾只打印横幅不做事）
OUT="$(node "$ENGINE" distill-reject --id 1 --reason "测试拒绝" 2>&1)"
if echo "$OUT" | grep -q '"ok": *true'; then ok "distill-reject 返回 ok"; else bad "distill-reject 返回: $(echo "$OUT" | head -2)"; fi

LIST="$(node "$ENGINE" distill-proposals --list 2>&1)"
PENDING="$(echo "$LIST" | python3 -c "import json,sys; print(json.load(sys.stdin).get('pending', -1))" 2>/dev/null)"
if [ "$PENDING" = "1" ]; then ok "reject 后 pending=1（真正生效）"; else bad "reject 后 pending=$PENDING（未生效）"; fi

# apply 应写入 MEMORY.md
OUT3="$(node "$ENGINE" distill-proposals --apply 2 2>&1)"
if echo "$OUT3" | grep -q "applied\|ok"; then
  if grep -q "测试提案B" "$TMP/MEMORY.md" 2>/dev/null; then ok "apply 写入 MEMORY.md"; else bad "apply 未写入 MEMORY.md"; fi
else
  bad "apply 失败: $(echo "$OUT3" | head -2)"
fi

echo ""
echo "  [test-distill] 通过 $PASS / $((PASS+FAIL))"
[ $FAIL -eq 0 ] || exit 1

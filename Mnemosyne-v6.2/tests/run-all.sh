#!/usr/bin/env bash
# ============================================================
# Mnemosyne 测试套件运行器 — run-all.sh
# 运行全部测试，输出汇总。用法: bash tests/run-all.sh
# ============================================================
set -uo pipefail
ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTS_DIR="$ENGINE_DIR/tests"

TOTAL=0; FAILED=0
declare -a FAILED_NAMES

echo "════════════════════════════════════════════════════"
echo "  Mnemosyne 测试套件 — $ENGINE_DIR"
echo "════════════════════════════════════════════════════"

for t in "$TESTS_DIR"/test-*.sh; do
  name="$(basename "$t")"
  TOTAL=$((TOTAL+1))
  echo ""
  echo "▶ 运行: $name"
  if bash "$t"; then
    echo "  ✅ $name 通过"
  else
    echo "  ❌ $name 失败"
    FAILED=$((FAILED+1))
    FAILED_NAMES+=("$name")
  fi
done

# Python 测试（存在则跑）
if command -v python3 >/dev/null 2>&1 && [ -f "$TESTS_DIR/test-hermes-plugin.py" ]; then
  TOTAL=$((TOTAL+1))
  echo ""
  echo "▶ 运行: test-hermes-plugin.py"
  if python3 "$TESTS_DIR/test-hermes-plugin.py" >/dev/null 2>&1; then
    echo "  ✅ test-hermes-plugin.py 通过"
  else
    echo "  ❌ test-hermes-plugin.py 失败"
    FAILED=$((FAILED+1))
    FAILED_NAMES+=("test-hermes-plugin.py")
  fi
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "  结果: $((TOTAL-FAILED))/$TOTAL 通过"
if [ $FAILED -gt 0 ]; then
  echo "  失败: ${FAILED_NAMES[*]}"
  exit 1
fi
echo "  ✅ 全部通过"

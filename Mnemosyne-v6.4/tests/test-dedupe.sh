#!/usr/bin/env bash
# ============================================================
# medium 摘要去重 + 待办噪音过滤回归测试
# 回归: 08-11 式重复摘要块、markdown 表格行被当待办
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
MED_DIR="$TMP/memory/medium"
mkdir -p "$MED_DIR"
MED="$MED_DIR/2026-08-11.md"

# 模拟 08-11 式重复链：同一窗口被反复整合，每块只增几行
cat > "$MED" << 'EOF'
# 2026-08-11 中期摘要

## 15:46 自动摘要 14:04–15:46（25条） #decision #tech
- 结论/决策：决定项目前端框架用 Vue 3
- 关键事实：无
- 待办：无
- 关键词：表格, 坏处, 好处
<!-- quality: 缺少关键事实, 缺少待办 -->

## 15:47 自动摘要 14:04–15:47（28条） #decision #tech
- 结论/决策：决定项目前端框架用 Vue 3
- 关键事实：无
- 待办：无
- 关键词：表格, 坏处, 好处, 来源
<!-- quality: 缺少关键事实, 缺少待办 -->

## 15:49 自动摘要 14:04–15:49（47条） #decision #tech
- 结论/决策：决定项目前端框架用 Vue 3
- 关键事实：我决定项目用 Vue 3 作为前端框架
- 待办：无
- 关键词：表格, 坏处, 好处, 来源, 改动最小
<!-- quality: 缺少待办 -->

## 16:52 自动摘要 16:00–16:52（89条） #tech
- 结论/决策：完成 v6-plan 论文筛选报告
- 关键事实：筛掉 5 篇路线冲突论文
- 待办：无
- 关键词：论文, 筛选, 报告
<!-- quality: 缺少待办 -->
EOF

# ---- dry run（默认不带 --confirm）----
HASH_BEFORE="$(md5sum "$MED" | cut -d' ' -f1)"
OUT="$(node "$ENGINE" medium-dedupe 2>&1)"
HASH_AFTER="$(md5sum "$MED" | cut -d' ' -f1)"
if [ "$HASH_BEFORE" = "$HASH_AFTER" ]; then
  ok "默认 dry-run 不修改文件"
else
  bad "默认 dry-run 修改了文件（危险！）"
fi
if echo "$OUT" | grep -q '"removedBlocks": *2'; then
  ok "dry-run 检出 2 个重复块"
else
  bad "dry-run 结果: $(echo "$OUT" | head -3)"
fi

# ---- confirm ----
node "$ENGINE" medium-dedupe --confirm >/dev/null 2>&1
COUNT="$(grep -c '^## ' "$MED")"
if [ "$COUNT" = "2" ]; then
  ok "去重后剩 2 块（重复链压缩为 1 + 独立块保留）"
else
  bad "去重后块数=$COUNT（应为 2）"
fi
grep -q "16:52" "$MED" && ok "新窗口块保留" || bad "新窗口块丢失"
grep -c "决定项目前端框架用 Vue 3" "$MED" | grep -qx "1" && ok "重复结论只保留一份" || bad "重复结论未压缩"

# ---- 待办噪音过滤 ----
MED2="$MED_DIR/2026-08-12.md"
cat > "$MED2" << 'EOF'
# 2026-08-12 中期摘要

## 10:00 自动摘要 #planning
- 结论/决策：无
- 关键事实：无
- 待办：| # | 待办；| # | 类别 | 待办；真实待办：测试噪音过滤
- 关键词：测试
EOF
LIST="$(node "$ENGINE" todos 2>&1)"
if echo "$LIST" | grep -q "真实待办：测试噪音过滤"; then ok "合法待办被提取"; else bad "合法待办未提取"; fi
if echo "$LIST" | grep -q "| # | 待办"; then bad "表格行噪音仍被当待办"; else ok "表格行噪音已过滤"; fi
if echo "$LIST" | grep -q "| # | 类别"; then bad "表格行噪音2仍被当待办"; else ok "表格行噪音2已过滤"; fi

echo ""
echo "  [test-dedupe] 通过 $PASS / $((PASS+FAIL))"
[ $FAIL -eq 0 ] || exit 1

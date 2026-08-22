#!/usr/bin/env bash
# ============================================================
# install-elite.sh 安装流程回归测试（隔离 HOME，不碰真实环境）
# 覆盖: --hermes-plugin 自动检测 / 路径注入 / set -u 安全 / 装后插件可用
# ============================================================
set -uo pipefail
ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL="$ENGINE_DIR/elite/install-elite.sh"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

TMP="$(mktemp -d)"
FAKE_HOME="$TMP/home"; mkdir -p "$FAKE_HOME"
FAKE_HERMES="$TMP/hermes"; mkdir -p "$FAKE_HERMES/plugins"
trap 'rm -rf "$TMP"' EXIT

# 隔离安装：HERMES_HOME 自动检测 + --no-ui --no-skill 走插件路线
OUT="$(HOME="$FAKE_HOME" HERMES_HOME="$FAKE_HERMES" bash "$INSTALL" \
  --root "$TMP/mn-root" --no-ui --no-skill --hermes-plugin 2>&1)"
echo "$OUT" | grep -q "插件已安装" && ok "插件自动检测安装" || bad "插件未安装: $(echo "$OUT" | tail -3)"

PLUGIN_DIR="$FAKE_HERMES/plugins/mnemosyne"
if [ -d "$PLUGIN_DIR" ]; then ok "插件目录存在"; else bad "插件目录不存在"; fi

# 占位符必须已替换
if grep -q '@@BRIDGE_PATH@@' "$PLUGIN_DIR/__init__.py" 2>/dev/null; then
  bad "占位符未替换"
else
  ok "bridge 路径已注入"
fi
grep -q "hermes-bridge.js" "$PLUGIN_DIR/__init__.py" && ok "注入的是真实 bridge 路径" || bad "bridge 路径注入内容异常"

# set -u 安全：无 LOCALAPPDATA/APPDATA 环境不崩
echo "$OUT" | grep -q "未绑定的变量" && bad "存在未绑定变量错误" || ok "无 set -u 未绑定变量错误"

# 装后插件可用（Python 导入 + lifecycle 冒烟）
if command -v python3 >/dev/null 2>&1; then
  if python3 -c "
import sys, json, os
sys.path.insert(0, '$FAKE_HERMES/plugins')
import mnemosyne as plugin
class FakeCtx:
    class Config:
        def __init__(self): self.memory = {}
    def __init__(self): self.config = self.Config()
p = plugin.register(FakeCtx())
assert p.is_available(), 'is_available False'
assert p.initialize(), 'initialize 失败'
assert p.sync_turn('安装测试', '安装测试回复') is True, 'sync_turn 失败'
s = json.loads(p.handle_tool_call('mnemo_status'))
assert s['ok'], 'mnemo_status 失败'
assert os.path.isdir(os.path.join(p._root, 'memory')), '数据未落盘'
print('  装后插件全链路 OK, root:', p._root)
"; then
    ok "装后插件全链路可用"
  else
    bad "装后插件不可用"
  fi
fi

echo ""
echo "  [test-install] 通过 $PASS / $((PASS+FAIL))"
[ $FAIL -eq 0 ] || exit 1

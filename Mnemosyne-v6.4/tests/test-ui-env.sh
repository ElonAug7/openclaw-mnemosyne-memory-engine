#!/usr/bin/env bash
# ============================================================
# ui.js 环境变量回归测试
# 场景1: 仅 MNEMOSYNE_ROOT（Hermes 环境，曾回退 ~/.openclaw/workspace）
# 场景2: OPENCLAW_WORKSPACE（OpenClaw 环境）
# 用独立端口，不碰正在运行的服务
# ============================================================
set -uo pipefail
ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI="$ENGINE_DIR/ui.js"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; [ -n "${UI_PID1:-}" ] && kill "$UI_PID1" 2>/dev/null; [ -n "${UI_PID2:-}" ] && kill "$UI_PID2" 2>/dev/null' EXIT

node --check "$UI" 2>/dev/null && ok "ui.js 语法检查" || bad "ui.js 语法检查"

# ---- 场景1: Hermes 环境（只有 MNEMOSYNE_ROOT，无 OPENCLAW_WORKSPACE）----
mkdir -p "$TMP/hermes-root"
env -u OPENCLAW_WORKSPACE MNEMOSYNE_ROOT="$TMP/hermes-root" MEMORY_UI_PORT=18766 \
  node "$UI" > /dev/null 2>&1 &
UI_PID1=$!
sleep 2

ROOT1="$(curl -s -m 3 http://127.0.0.1:18766/api/status 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('root',''))" 2>/dev/null)"
if [ "$ROOT1" = "$TMP/hermes-root" ]; then
  ok "Hermes 环境 root 正确指向 MNEMOSYNE_ROOT"
else
  bad "Hermes 环境 root=$ROOT1（应为 $TMP/hermes-root）"
fi
kill "$UI_PID1" 2>/dev/null; wait "$UI_PID1" 2>/dev/null
sleep 1

# ---- 场景3: DNS rebinding 防护（v6.2） ----
mkdir -p "$TMP/hermes-root"
env -u OPENCLAW_WORKSPACE MNEMOSYNE_ROOT="$TMP/hermes-root" MEMORY_UI_PORT=18766 \
  node "$UI" > /dev/null 2>&1 &
UI_PID3=$!
sleep 2

CODE_EVIL="$(curl -s -o /dev/null -w '%{http_code}' -m 3 -H 'Host: evil.example.com' http://127.0.0.1:18766/api/status 2>/dev/null)"
if [ "$CODE_EVIL" = "403" ]; then
  ok "DNS rebinding: 伪造 Host 被拦截 (403)"
else
  bad "DNS rebinding: 伪造 Host 返回 $CODE_EVIL（应为 403）"
fi
CODE_OK="$(curl -s -o /dev/null -w '%{http_code}' -m 3 http://127.0.0.1:18766/api/status 2>/dev/null)"
if [ "$CODE_OK" = "200" ]; then
  ok "本机正常访问不受影响 (200)"
else
  bad "本机正常访问返回 $CODE_OK（应为 200）"
fi
CODE_LH="$(curl -s -o /dev/null -w '%{http_code}' -m 3 -H 'Host: localhost:18766' http://127.0.0.1:18766/api/status 2>/dev/null)"
if [ "$CODE_LH" = "200" ]; then
  ok "localhost Host 正常 (200)"
else
  bad "localhost Host 返回 $CODE_LH（应为 200）"
fi
kill "$UI_PID3" 2>/dev/null; wait "$UI_PID3" 2>/dev/null
sleep 1

# ---- 场景2: OpenClaw 环境（OPENCLAW_WORKSPACE）----
mkdir -p "$TMP/openclaw-root"
OPENCLAW_WORKSPACE="$TMP/openclaw-root" MEMORY_UI_PORT=18767 \
  node "$UI" > /dev/null 2>&1 &
UI_PID2=$!
sleep 2

ROOT2="$(curl -s -m 3 http://127.0.0.1:18767/api/status 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('root',''))" 2>/dev/null)"
if [ "$ROOT2" = "$TMP/openclaw-root" ]; then
  ok "OpenClaw 环境 root 正确指向 OPENCLAW_WORKSPACE"
else
  bad "OpenClaw 环境 root=$ROOT2（应为 $TMP/openclaw-root）"
fi
kill "$UI_PID2" 2>/dev/null; wait "$UI_PID2" 2>/dev/null

echo ""
echo "  [test-ui-env] 通过 $PASS / $((PASS+FAIL))"
[ $FAIL -eq 0 ] || exit 1

#!/usr/bin/env bash
# ============================================================
# Mnemosyne Elite — 跨平台一键安装脚本
#
# 支持: Windows (Git Bash/MSYS) · macOS · Linux · WSL
# 不要求 OpenClaw，零外部依赖（仅需 Node.js v18+）
#
# 用法:
#   bash install-elite.sh                          # 默认安装到 ~/.mnemosyne
#   bash install-elite.sh --root /path/to/memory   # 自定义记忆目录
#   bash install-elite.sh --no-ui                  # 不安装 Web UI
#   bash install-elite.sh --hermes                 # Hermes 模式（设 HERMES_WORKSPACE）
#   bash install-elite.sh --skill-dir /path/hermes/skills  # 指定 Hermes skill 目录
#
# 安装内容:
#   1. Node.js 版本检查
#   2. 创建记忆目录结构
#   3. 初始化引擎
#   4. 设置环境变量（写入 shell rc）
#   5. 安装 Web UI（可选）
#   6. 安装 Hermes Skill（可选：自动检测或手动指定）
#   7. Selftest
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="$(dirname "$SCRIPT_DIR")"
ELITE_DIR="$SCRIPT_DIR"
VERSION="v5.1.0-elite"

# ---- 0. 参数解析 ----
MEM_ROOT="${MNEMOSYNE_ROOT:-$HOME/.mnemosyne}"
INSTALL_UI=1
HERMES_MODE=0
SKILL_DIR=""
NO_SKILL=0
SHELL_RC=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) MEM_ROOT="$2"; shift 2 ;;
    --no-ui) INSTALL_UI=0; shift ;;
    --hermes) HERMES_MODE=1; shift ;;
    --skill-dir) SKILL_DIR="$2"; shift 2 ;;
    --no-skill) NO_SKILL=1; shift ;;
    --help|-h)
      echo "用法: bash install-elite.sh [选项]"
      echo ""
      echo "选项:"
      echo "  --root PATH      记忆存储目录（默认 ~/.mnemosyne）"
      echo "  --no-ui          不安装 Web UI 服务"
      echo "  --hermes         Hermes 模式（自动设置 HERMES_WORKSPACE）"
      echo "  --skill-dir PATH Hermes skill 目录（自动检测失败时手动指定）"
      echo "  --no-skill       不安装 Hermes Skill"
      exit 0
      ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

# ---- 平台检测 ----
OS="$(uname -s)"
IS_WINDOWS=0
IS_MSYS=0
IS_MACOS=0
IS_LINUX=0

case "$OS" in
  MINGW*|MSYS*|CYGWIN*)
    IS_WINDOWS=1; IS_MSYS=1
    SHELL_RC="$HOME/.bashrc"
    ;;
  Darwin)
    IS_MACOS=1
    SHELL_RC="$HOME/.zshrc"
    [ -f "$HOME/.bash_profile" ] && SHELL_RC="$HOME/.bash_profile"
    ;;
  Linux)
    IS_LINUX=1
    # WSL detection
    if grep -qi microsoft /proc/version 2>/dev/null; then
      IS_WINDOWS=1
    fi
    SHELL_RC="$HOME/.bashrc"
    [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
    ;;
  *)
    SHELL_RC="$HOME/.bashrc"
    ;;
esac

# ---- Banner ----
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🧠 Mnemosyne Elite $VERSION               ║"
echo "║  跨平台分层记忆引擎 — 安装程序                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  平台:     $OS$([ $IS_MSYS -eq 1 ] && echo ' (MSYS)')"
echo "  引擎:     $ENGINE_DIR"
echo "  记忆目录: $MEM_ROOT"
echo "  Web UI:   $([ $INSTALL_UI -eq 1 ] && echo '是 (端口 8765)' || echo '跳过')"
echo ""

# ---- 1. Node.js 检查 ----
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 需要 Node.js v18+"
  echo "   下载: https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js 版本过低（需要 v18+，当前 $(node -v)）"
  exit 1
fi
echo "   ✅ Node.js $(node -v)"

# ---- 2. 验证引擎文件 ----
if [ ! -f "$ENGINE_DIR/engine.js" ]; then
  echo "❌ 找不到 engine.js: $ENGINE_DIR/engine.js"
  echo "   请确保 elite/ 与 engine.js 在同一目录下"
  exit 1
fi
echo "   ✅ engine.js 就位"

# ---- 3. 创建目录 + 初始化 ----
echo ""
echo "📁 初始化记忆目录..."

# 处理路径（MSYS 下保持 Unix 风格，Node 端会自动转换）
export MNEMOSYNE_ROOT="$MEM_ROOT"
export OPENCLAW_WORKSPACE="$MEM_ROOT"

mkdir -p "$MEM_ROOT"

# init 通过 elite init+
node "$ELITE_DIR/mnemosyne-elite.js" init+ 2>&1 || {
  echo "   ⚠️  elite init+ 失败，回退到 engine.js init..."
  MNEMOSYNE_ROOT="$MEM_ROOT" OPENCLAW_WORKSPACE="$MEM_ROOT" \
    node "$ENGINE_DIR/engine.js" init 2>&1 || {
    echo "❌ 初始化失败"
    exit 1
  }
}

echo "   ✅ 目录结构就绪"

# ---- 4. 环境变量写入 shell rc ----
echo ""
echo "🔧 配置环境变量..."

write_env_to_rc() {
  local rc="$1"
  local marker="# >>> Mnemosyne Elite >>>"
  local endmarker="# <<< Mnemosyne Elite <<<"

  touch "$rc"

  # 移除旧配置
  if grep -qF "$marker" "$rc" 2>/dev/null; then
    if [[ "$IS_MACOS" -eq 1 ]]; then
      sed -i '' "/$marker/,/$endmarker/d" "$rc"
    else
      sed -i "/$marker/,/$endmarker/d" "$rc"
    fi
  fi

  # 写入新配置
  {
    echo ""
    echo "$marker"
    echo "export MNEMOSYNE_ROOT=\"$MEM_ROOT\""
    echo "export OPENCLAW_WORKSPACE=\"$MEM_ROOT\""
    if [ $HERMES_MODE -eq 1 ]; then
      echo "export HERMES_WORKSPACE=\"$MEM_ROOT\""
    fi
    echo "export MEMORY_UI_PORT=\"\${MEMORY_UI_PORT:-8765}\""
    echo "# 快捷命令"
    echo "alias mnemosyne=\"node $ELITE_DIR/mnemosyne-elite.js\""
    echo "alias mneme=\"node $ELITE_DIR/hermes-bridge.js\""
    echo "$endmarker"
  } >> "$rc"

  echo "   ✅ 写入 $rc"
}

if [ -n "$SHELL_RC" ]; then
  write_env_to_rc "$SHELL_RC"
fi

# ---- 5. Hermes Skill 安装 ----
if [ $NO_SKILL -eq 0 ]; then
  echo ""
  echo "📋 Hermes Skill..."

  SKILL_SRC="$ELITE_DIR/hermes-skill.md"
  SKILL_DEST=""

  # 如果用户手动指定了
  if [ -n "$SKILL_DIR" ] && [ -d "$SKILL_DIR" ]; then
    SKILL_DEST="$SKILL_DIR/mnemosyne-elite.md"
  fi

  # 自动检测常见 Hermes skill 目录
  if [ -z "$SKILL_DEST" ]; then
    # Hermes 通常在用户目录下的 workspace/skills/
    DETECTED_DIRS=(
      "$HOME/.hermes/workspace/skills"
      "$HOME/.hermes/skills"
      "$HOME/hermes/skills"
      "$HOME/.local/share/hermes/skills"
      "$HOME/workspace/skills/mnemosyne"
    )
    for d in "${DETECTED_DIRS[@]}"; do
      if [ -d "$d" ]; then
        mkdir -p "$d"
        SKILL_DEST="$d/mnemosyne-elite.md"
        echo "   📍 自动检测到: $d"
        break
      fi
    done
  fi

  if [ -n "$SKILL_DEST" ]; then
    # 创建临时文件做路径替换（不动原文件）
    TMP_SKILL="$(mktemp)"
    cp "$SKILL_SRC" "$TMP_SKILL"

    # 替换相对路径 → 绝对路径（确保 Hermes Agent 在任何 cwd 下都能找到）
    # 关键替换:
    #   node tools/memory-engine/elite/hermes-bridge.js → node /real/path/to/hermes-bridge.js
    #   node tools/memory-engine/elite/mnemosyne-elite.js → node /real/path/to/mnemosyne-elite.js
    #   cd tools/memory-engine/elite → cd /real/path/to/elite
    if [[ "$IS_MACOS" -eq 1 ]]; then
      sed -i '' "s|node tools/memory-engine/elite/hermes-bridge\.js|node $ELITE_DIR/hermes-bridge.js|g" "$TMP_SKILL" 2>/dev/null || true
      sed -i '' "s|node tools/memory-engine/elite/mnemosyne-elite\.js|node $ELITE_DIR/mnemosyne-elite.js|g" "$TMP_SKILL" 2>/dev/null || true
      sed -i '' "s|cd tools/memory-engine/elite|cd $ENGINE_DIR/elite|g" "$TMP_SKILL" 2>/dev/null || true
      sed -i '' "s|__ELITE_DIR__|$ELITE_DIR|g" "$TMP_SKILL" 2>/dev/null || true
      sed -i '' "s|__ENGINE_DIR__|$ENGINE_DIR|g" "$TMP_SKILL" 2>/dev/null || true
    else
      sed -i "s|node tools/memory-engine/elite/hermes-bridge\.js|node $ELITE_DIR/hermes-bridge.js|g" "$TMP_SKILL" 2>/dev/null || true
      sed -i "s|node tools/memory-engine/elite/mnemosyne-elite\.js|node $ELITE_DIR/mnemosyne-elite.js|g" "$TMP_SKILL" 2>/dev/null || true
      sed -i "s|cd tools/memory-engine/elite|cd $ENGINE_DIR/elite|g" "$TMP_SKILL" 2>/dev/null || true
      sed -i "s|__ELITE_DIR__|$ELITE_DIR|g" "$TMP_SKILL" 2>/dev/null || true
      sed -i "s|__ENGINE_DIR__|$ENGINE_DIR|g" "$TMP_SKILL" 2>/dev/null || true
    fi

    cp "$TMP_SKILL" "$SKILL_DEST"
    rm -f "$TMP_SKILL"
    echo "   ✅ Skill 已安装到: $SKILL_DEST"
    echo "      路径已替换为绝对路径，Agent 在任何目录下均可调用"
  elif [ -n "$SKILL_DIR" ]; then
    echo "   ❌ 指定目录不存在: $SKILL_DIR"
    echo "      请手动复制: cp $SKILL_SRC <hermes-skills-dir>/mnemosyne-elite.md"
  else
    echo "   ⚠️  未检测到 Hermes skill 目录"
    echo "      手动安装 Skill:"
    echo "      cp $SKILL_SRC <你的-hermes-skills-目录>/mnemosyne-elite.md"
    echo ""
    echo "   或者指定目录重装:"
    echo "      bash install-elite.sh --skill-dir /path/to/hermes/skills"
  fi
fi

# ---- 6. Web UI ----
if [ $INSTALL_UI -eq 1 ]; then
  echo ""
  echo "🌐 Web UI..."

  UI_PORT="${MEMORY_UI_PORT:-8765}"

  # 杀掉旧进程
  pkill -f "memory-engine/ui.js" 2>/dev/null || true
  sleep 1

  if [ $IS_MACOS -eq 1 ]; then
    # macOS: launchd
    PLIST="$HOME/Library/LaunchAgents/com.mnemosyne.elite-ui.plist"
    mkdir -p "$(dirname "$PLIST")"
    NODE_BIN="$(command -v node)"
    cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.mnemosyne.elite-ui</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$ENGINE_DIR/ui.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MNEMOSYNE_ROOT</key><string>$MEM_ROOT</string>
    <key>OPENCLAW_WORKSPACE</key><string>$MEM_ROOT</string>
    <key>MEMORY_UI_PORT</key><string>$UI_PORT</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
PLISTEOF
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST" 2>/dev/null && echo "   ✅ launchd 服务已启动" || echo "   ⚠️  launchd 启动失败"

  elif [ $IS_LINUX -eq 1 ]; then
    # Linux: systemd user
    SVC="$HOME/.config/systemd/user/mnemosyne-elite-ui.service"
    mkdir -p "$(dirname "$SVC")"
    NODE_BIN="$(command -v node)"
    cat > "$SVC" <<SVCEOF
[Unit]
Description=Mnemosyne Elite Web UI
After=network.target

[Service]
Type=simple
Environment=MNEMOSYNE_ROOT=$MEM_ROOT
Environment=OPENCLAW_WORKSPACE=$MEM_ROOT
Environment=MEMORY_UI_PORT=$UI_PORT
ExecStart=$NODE_BIN $ENGINE_DIR/ui.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
SVCEOF
    systemctl --user daemon-reload 2>/dev/null || true
    systemctl --user enable --now mnemosyne-elite-ui 2>/dev/null && \
      echo "   ✅ systemd 服务已启动" || echo "   ⚠️  systemd 启动失败"

  else
    # Windows / 其他：后台启动
    MNEMOSYNE_ROOT="$MEM_ROOT" OPENCLAW_WORKSPACE="$MEM_ROOT" \
      MEMORY_UI_PORT="$UI_PORT" \
      node "$ENGINE_DIR/ui.js" &
    echo "   ✅ Web UI 后台启动"
  fi

  echo "   🌐 http://127.0.0.1:$UI_PORT"
fi

# ---- 6. Selftest ----
echo ""
echo "🧪 运行自检..."

node "$ELITE_DIR/mnemosyne-elite.js" self-check 2>&1
SELFTEST_OK=$?

echo ""

if [ $SELFTEST_OK -eq 0 ]; then
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ✅ Mnemosyne Elite 安装成功！                      ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  echo "   快捷命令:"
  echo "     mnemosyne diag       查看完整诊断"
  echo "     mnemosyne status     引擎状态"
  echo "     mnemosyne help       全部命令"
  echo ""
  echo "   记忆目录: $MEM_ROOT/memory/"
  if [ $INSTALL_UI -eq 1 ]; then
    echo "   Web UI:   http://127.0.0.1:${MEMORY_UI_PORT:-8765}"
  fi
  if [ -n "$SKILL_DEST" ]; then
    echo "   Skill:    $SKILL_DEST ← Hermes 重启后自动加载"
  elif [ $NO_SKILL -eq 0 ]; then
    echo "   Skill:    ⚠️  未自动安装，使用 --skill-dir 指定目录"
  fi
  echo ""
  if [ -n "$SHELL_RC" ]; then
    echo "   ⚠️  请重新打开终端或执行: source $SHELL_RC"
  fi
else
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ⚠️  安装完成但自检未通过，请查看上方输出           ║"
  echo "╚══════════════════════════════════════════════════════╝"
fi

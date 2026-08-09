#!/usr/bin/env bash
# ============================================================
# Mnemosyne 安装脚本
#
# 兼容 Linux (systemd) 和 macOS (launchd)，零第三方依赖。
#
# 用法（两种方式任选其一）：
#
#   方法一（推荐）: 手动放到工作区
#     1. cp -r Mnemosyne-v4.5 ~/.openclaw/workspace/tools/
#     2. cd ~/.openclaw/workspace/tools/Mnemosyne-v4.5 && bash install.sh
#
#   方法二: 从任意位置一键部署
#     1. bash /path/to/Mnemosyne-v4.5/install.sh
#     脚本自动检测 → 复制到 workspace/tools/memory-engine → 完成安装
#
# 自动完成：
#   · 自动重命名为 memory-engine（AGENTS.md/hook 硬依赖）
#   · 检查依赖（Node.js v18+ / OpenClaw CLI）
#   · 初始化四层记忆目录（幂等，不覆盖已有数据）
#   · 安装 Gateway hook（动态路径，无硬编码）
#   · 注入 AGENTS.md 记忆系统章节（幂等，标记块内覆盖）
#   · 注入 SOUL.md 记忆协议章节（幂等）
#   · 安装 Web UI 服务（开机自启）
# ============================================================
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF_NAME="$(basename "$SELF_DIR")"
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
EXPECTED_NAME="memory-engine"

# ---- 0. 确保引擎在 workspace/tools/memory-engine ----
EXPECTED_DIR="$WORKSPACE/tools/$EXPECTED_NAME"

if [ "$SELF_DIR" != "$EXPECTED_DIR" ]; then
  echo "📍 当前位置: $SELF_DIR"
  echo "🎯 目标位置: $EXPECTED_DIR"
  echo ""

  # 创建 tools/ 目录（如果还不存在）
  mkdir -p "$(dirname "$EXPECTED_DIR")"

  if [ -d "$EXPECTED_DIR" ]; then
    echo "   ⚠️  $EXPECTED_DIR 已存在，将覆盖更新..."
    rm -rf "$EXPECTED_DIR"
  fi

  # 复制到正确位置
  cp -r "$SELF_DIR" "$EXPECTED_DIR"
  echo "   ✅ 已部署到 $EXPECTED_DIR"

  # 清理原始文件夹（后台延迟删除，避免干扰当前 shell）
  (sleep 1 && rm -rf "$SELF_DIR") &
  echo "   ✅ 原始文件夹将在后台清理"

  # 从正确位置重新执行
  echo ""
  echo "🔄 从工作区重新执行安装..."
  exec bash "$EXPECTED_DIR/install.sh"
  exit 0
fi

# ---- 以下为正常安装流程（此时 SELF_NAME = memory-engine）----

ENGINE_DIR="$SELF_DIR"
HOOK_DIR="$HOME/.openclaw/hooks/memory-recorder"
UI_PORT="${MEMORY_UI_PORT:-8765}"

echo "🧠 Mnemosyne v5 安装程序"
echo ""
echo "   v5 核心特性："
echo "   🧬 复合线索评分：imp + 时间衰减 + 关键词 + 命中频率"
echo "   ⚡ 语义异步化：keyword-first (~15ms)，语义 200ms 后补"
echo "   💾 内存热区缓存：LRU 7天/500条，消除重复 I/O"
echo "   🏷️  用户标签：--tags 支持，搜索权重 ×3"
echo "   📊 性能探查器：--profile 输出各阶段 P50/P99"
echo "   🔥 命中频率追踪：忆阻器式动态权重"
echo ""
echo "   🔴 强制协议：安装后自动注入 SOUL.md/AGENTS.md"
echo "      · 每条回复前必读 last-recall.json"
echo "      · 涉及历史时必须跑 recall --query"
echo "      · 回复中必须引用记忆来源"
echo ""
echo "   引擎目录: $ENGINE_DIR"
echo "   工作区:   $WORKSPACE"
echo ""

# ---- 1. 依赖检查 ----
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 需要 Node.js v18+，请先安装: https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js 版本过低（需要 v18+，当前 $(node -v)）"
  exit 1
fi
echo "✓ Node.js $(node -v)"

HAS_OC=0
if command -v openclaw >/dev/null 2>&1; then
  HAS_OC=1
  echo "✓ OpenClaw CLI 已安装"
else
  echo "⚠️  未找到 openclaw CLI，hook 启用步骤将跳过"
fi

# ---- 2. 初始化四层记忆结构 + 首次同步 ----
OPENCLAW_WORKSPACE="$WORKSPACE" node "$ENGINE_DIR/engine.js" init >/dev/null
OPENCLAW_WORKSPACE="$WORKSPACE" node "$ENGINE_DIR/engine.js" sync >/dev/null 2>&1 || true
echo "✓ 四层记忆目录就绪（index / short / medium / long / engine），历史转录已同步"

# ---- 3. 安装 hook ----
mkdir -p "$HOOK_DIR"
cp "$ENGINE_DIR/hook/HOOK.md" "$HOOK_DIR/HOOK.md"

# 替换模板占位符为实际引擎路径（sed 兼容 macOS 和 Linux）
cp "$ENGINE_DIR/hook/handler.js.template" "$HOOK_DIR/handler.js"

# 解析 node 全路径（写入 handler.js，避免子进程 PATH 找不到）
NODE_BIN="$(command -v node)"

if sed --version >/dev/null 2>&1; then
  # GNU sed (Linux)
  sed -i "s|__ENGINE_PATH__|$ENGINE_DIR/engine.js|g" "$HOOK_DIR/handler.js"
  sed -i "s|__NODE_BIN__|$NODE_BIN|g" "$HOOK_DIR/handler.js"
else
  # BSD sed (macOS)
  sed -i '' "s|__ENGINE_PATH__|$ENGINE_DIR/engine.js|g" "$HOOK_DIR/handler.js"
  sed -i '' "s|__NODE_BIN__|$NODE_BIN|g" "$HOOK_DIR/handler.js"
fi
echo "✓ hook 已安装到 $HOOK_DIR（node=$NODE_BIN）"

if [ "$HAS_OC" = "1" ]; then
  if openclaw hooks enable memory-recorder >/dev/null 2>&1; then
    echo "✓ hook 已启用（网关重启后生效）"
  else
    echo "⚠️  hook 启用失败，请手动执行: openclaw hooks enable memory-recorder"
  fi
fi

# ---- 4. 注入 AGENTS.md 记忆系统章节（幂等）----
AGENTS_FILE="$WORKSPACE/AGENTS.md"
SECTION_FILE="$ENGINE_DIR/templates/AGENTS-SECTION.md"
MARK_BEGIN="<!-- memory-engine:begin -->"
MARK_END="<!-- memory-engine:end -->"
if [ -f "$SECTION_FILE" ]; then
  touch "$AGENTS_FILE"
  if grep -qF "$MARK_BEGIN" "$AGENTS_FILE"; then
    tmp="$(mktemp)"
    awk -v b="$MARK_BEGIN" -v e="$MARK_END" -v secfile="$SECTION_FILE" '
      $0==b { print b; while ((getline line < secfile) > 0) print line; close(secfile); print e; skip=1; next }
      $0==e { skip=0; next }
      !skip { print }
    ' "$AGENTS_FILE" > "$tmp" && mv "$tmp" "$AGENTS_FILE"
    echo "✓ AGENTS.md 记忆系统章节已更新（标记块内覆盖）"
  else
    { echo ""; echo "$MARK_BEGIN"; cat "$SECTION_FILE"; echo "$MARK_END"; } >> "$AGENTS_FILE"
    echo "✓ AGENTS.md 已注入记忆系统章节（追加在文件末尾）"
  fi
else
  echo "⚠️  未找到 templates/AGENTS-SECTION.md，跳过 AGENTS.md 注入"
fi

# ---- 5. 停止旧进程 + 安装 Web UI 服务 ----

# 5a. 杀掉所有旧 Mnemosyne UI 进程
OLD_PIDS=$(pgrep -f "memory-engine/ui.js" 2>/dev/null || true)
if [ -n "$OLD_PIDS" ]; then
  echo "$OLD_PIDS" | xargs kill 2>/dev/null || true
  echo "✓ 已停止旧 Mnemosyne UI 进程"
fi
# 确保端口释放
sleep 1

# 5b. 安装/重启服务
OS_TYPE="$(uname -s)"
if [ "$OS_TYPE" = "Linux" ]; then
  # ---- Linux: systemd 用户服务 ----
  SVC="$HOME/.config/systemd/user/mnemosyne-ui.service"
  mkdir -p "$(dirname "$SVC")"
  cat > "$SVC" <<EOF
[Unit]
Description=Mnemosyne (OpenClaw)
After=network.target

[Service]
Type=simple
Environment=OPENCLAW_WORKSPACE=$WORKSPACE
Environment=MEMORY_UI_PORT=$UI_PORT
ExecStart=$(command -v node) $ENGINE_DIR/ui.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF
  if systemctl --user daemon-reload 2>/dev/null && systemctl --user enable --now mnemosyne-ui 2>/dev/null; then
    echo "✓ Web UI 服务已启动（systemd，开机自启）"
  else
    echo "⚠️  systemd 服务启动失败，可手动: systemctl --user enable --now mnemosyne-ui"
  fi

elif [ "$OS_TYPE" = "Darwin" ]; then
  # ---- macOS: launchd 用户代理 ----
  PLIST="$HOME/Library/LaunchAgents/com.openclaw.mnemosyne-ui.plist"
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.openclaw.mnemosyne-ui</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(command -v node)</string>
    <string>$ENGINE_DIR/ui.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OPENCLAW_WORKSPACE</key><string>$WORKSPACE</string>
    <key>MEMORY_UI_PORT</key><string>$UI_PORT</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ENGINE_DIR/ui-stdout.log</string>
  <key>StandardErrorPath</key><string>$ENGINE_DIR/ui-stderr.log</string>
</dict>
</plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  if launchctl load "$PLIST" 2>/dev/null; then
    echo "✓ Web UI 服务已启动（launchd，开机自启）"
  else
    echo "⚠️  launchd 服务启动失败，可手动: launchctl load $PLIST"
  fi

else
  echo "⚠️  未识别的操作系统 ($OS_TYPE)，跳过自动服务安装"
  echo "   手动启动: OPENCLAW_WORKSPACE=$WORKSPACE node $ENGINE_DIR/ui.js &"
fi

# ---- 完成 ----
echo ""
echo "============================================================"
echo "✅ 安装完成！"
echo ""
echo "   Web UI:      http://127.0.0.1:$UI_PORT"
echo "   引擎状态:    node $ENGINE_DIR/engine.js status"
echo "   四层目录:    $WORKSPACE/memory/{index,short,medium,long}"
echo ""
if [ "$HAS_OC" = "1" ]; then
  echo "⚠️  请重启 OpenClaw 网关使 hook 生效："
  echo "     openclaw gateway restart"
fi
echo ""
echo "   之后每条消息自动记录（user+assistant），每 5 轮触发短期、每 20 轮触发中期摘要信号。"
echo "============================================================"

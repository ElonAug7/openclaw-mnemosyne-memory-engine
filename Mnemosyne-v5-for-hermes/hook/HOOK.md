---
name: memory-recorder
description: "Mnemosyne v4 记忆钩子：每条消息自动记录+高imped自动触发recall（可移植）"
metadata:
  { "openclaw": { "emoji": "🧠", "events": ["message"], "requires": { "bins": ["node"] } } }
---

# memory-recorder (Mnemosyne v4)

把每条进出消息通过 memory-engine 落盘到短期记忆目录，并累计轮次。

**v4 新特性：** 高重要性用户消息（imp≥0.4 且长度>20）自动触发 recall 搜索，结果写入 `memory/short/working/last-recall.json`。

## assistant 消息如何被记录

双通道保障：
1. **hook 实时记录**：触发 `message:sent` 的频道（Telegram / Discord / Signal 等）由本 hook 直接记录
2. **转录补录**：webchat 等不触发 `message:sent` 的频道，由引擎 `sync` 命令解析
   OpenClaw 会话转录文件（`~/.openclaw/agents/*/sessions/*.jsonl`）自动补录，
   并按消息前缀去重，不会重复记录

## v4 记忆回响

- **context**: 会话启动时获取话题续接+待办+待确认问题
- **recall**: 回复前搜索相关历史（top 3），hook 自动触发
- **report**: 每日记忆报告
- **profile**: 用户画像（自动更新+可编辑）
- **ask**: 结构化查询"决定/待办/偏好/话题"

## 兼容性

- 监听通用 `message` 事件，兼容所有频道（webchat / Telegram / Discord / Signal 等）
- 转录补录在每次 `record` 时增量执行，也可手动 `node tools/memory-engine/engine.js sync`

## 开关与状态

```bash
node tools/memory-engine/engine.js status    # 引擎状态
node tools/memory-engine/engine.js context   # 会话上下文
openclaw hooks list | grep memory-recorder   # hook 状态
```

Web UI: http://127.0.0.1:8765

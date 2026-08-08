---
name: memory-recorder
description: "每次收发消息自动记录到本地文件，并周期性触发摘要信号（可移植记忆系统）"
metadata:
  { "openclaw": { "emoji": "🧠", "events": ["message"], "requires": { "bins": ["node"] } } }
---

# memory-recorder

把每条进出消息通过 memory-engine 落盘到短期记忆目录，并累计轮次。
每 5 轮触发短期摘要信号、每 20 轮触发中期摘要信号（不依赖 agent 自觉）。

## assistant 消息如何被记录

双通道保障：
1. **hook 实时记录**：触发 `message:sent` 的频道（Telegram / Discord / Signal 等）由本 hook 直接记录
2. **转录补录**：webchat 等不触发 `message:sent` 的频道，由引擎 `sync` 命令解析
   OpenClaw 会话转录文件（`~/.openclaw/agents/*/sessions/*.jsonl`）自动补录，
   并按消息前缀去重，不会重复记录

## 兼容性

- 监听通用 `message` 事件，兼容所有频道（webchat / Telegram / Discord / Signal 等）
- 转录补录在每次 `record` 时增量执行，也可手动 `node tools/memory-engine/engine.js sync`

## 开关与状态

```bash
node tools/memory-engine/engine.js status    # 引擎状态
openclaw hooks list | grep memory-recorder   # hook 状态
```

Web UI: http://127.0.0.1:8765

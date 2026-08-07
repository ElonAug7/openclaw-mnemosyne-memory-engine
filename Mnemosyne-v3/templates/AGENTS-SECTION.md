## 🧠 记忆系统（Mnemosyne）

本工作区装有Mnemosyne 认知记忆引擎（`tools/memory-engine/`），四层结构：

| 层 | 路径 | 说明 |
|---|------|------|
| 🔍 索引 | `memory/index/` | 中期摘要块关键词索引 |
| 📝 短期·raw | `memory/short/raw/` | 原始消息流，含 imp 评分 |
| 📝 短期·工作台 | `memory/short/working/` | 当前任务、待确认问题、最近决策 |
| 📚 中期 | `memory/medium/` | 按日摘要块（引擎自动整合） |
| 🏛️ 长期 | `MEMORY.md` | 全局知识（cron 夜间提炼 + 人工审阅） |
| 👤 画像 | `memory/profile.md` | 用户偏好/技术栈/沟通风格（自动更新） |

**会话启动（每次新会话必做，按顺序）：**
1. 读 `MEMORY.md`（长期记忆，仅主会话）
2. 运行 `node tools/memory-engine/engine.js context` → 获取 resume/todos/questions/decisions
3. 读 `memory/todos.md`（待办清单）
4. 运行 `node tools/memory-engine/engine.js sync --quick`（补录转录+索引+工作记忆刷新）
5. **审阅 distill proposals**：`node tools/memory-engine/engine.js distill-proposals --list`，逐条判断：
   - 同意 → `node tools/memory-engine/engine.js distill-proposals --apply <id>`
   - 拒绝 → `node tools/memory-engine/engine.js distill-reject --id <id> --reason "原因"`

**🔴 回复前（强制执行，不可跳过）：**
- **每条用户消息回复前，必须先读 `memory/short/working/last-recall.json`**
  - hook 已自动触发 recall（用户消息 imp≥0.4 且长度>20 时），结果写入此文件
  - 如果文件存在且有 `flashbacks` 内容，必须将其作为上下文注入回复
- **涉及历史话题/决策/偏好/事实时，必须手动跑 recall：**
  ```bash
  node tools/memory-engine/engine.js recall --query "用户问题中的关键词"
  ```
- **回复中必须引用记忆来源**（如 "根据之前记录的…"），让用户知道引擎在主动工作

**运行中：**
- 用户消息由 Gateway hook 自动记录，无需手动
- 高 imp 消息自动触发 recall → `last-recall.json`
- assistant 回复由引擎从会话转录自动补录（`sync`），无需手动
- 工作记忆、中期摘要、画像均由引擎自动维护

**v4 常用命令：**

🤖 日常（auto）：`record` | `sync --quick` | `context` | `recall` | `consolidate` | `todos`
🧑 运维（occasional）：`status` | `search` | `report` | `profile` | `ask` | `health`
🔧 调试（debug）：`enable/disable` | `embed` | `reindex` | `backup` | `export`

详见 `MEMORY-PROTOCOL.md` 或 Web UI：http://127.0.0.1:8765

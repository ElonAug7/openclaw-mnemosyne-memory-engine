## 🧠 记忆系统（Mnemosyne v5）

本工作区装有 Mnemosyne v5 认知记忆引擎（`tools/memory-engine/`），基于复合线索理论（compound-cue theory）。

四层结构：

| 层 | 路径 | 说明 |
|---|------|------|
| 🔍 索引 | `memory/index/` | 中期摘要块关键词索引 |
| 📝 短期·raw | `memory/short/raw/` | 原始消息流，含 imp 评分 + 用户标签 |
| 📝 短期·工作台 | `memory/short/working/` | 当前任务、last-recall.json、待确认问题 |
| 📚 中期 | `memory/medium/` | 按日摘要块（引擎自动整合） |
| 🏛️ 长期 | `MEMORY.md` | 全局知识（cron 夜间提炼 + 人工审阅） |
| 👤 画像 | `memory/profile.md` | 用户偏好/技术栈/沟通风格（自动更新） |

### 🔴 强制执行协议（不可跳过，不可省略）

**会话启动（每次新会话必做，按顺序）：**
1. 读 `MEMORY.md`（长期记忆，仅主会话）
2. 运行 `node tools/memory-engine/engine.js context` → 获取 resume/todos/questions/decisions
3. 读 `memory/todos.md`（待办清单）
4. 运行 `node tools/memory-engine/engine.js sync --quick`（补录转录+索引+工作记忆刷新）
5. 审阅 distill proposals：`node tools/memory-engine/engine.js distill-proposals --list`

**🔴 每条回复前（MANDATORY，强制执行）：**
- **第一步：** 读取 `memory/short/working/last-recall.json`
  - hook 已自动触发 recall（用户消息 imp≥0.4 且长度>20 时）
  - 如果文件存在且有 `flashbacks` 内容，**必须**将其作为上下文注入回复
- **第二步：** 涉及历史/决策/偏好/事实时，手动跑 recall：
  ```bash
  node tools/memory-engine/engine.js recall --query "用户问题中的关键词"
  ```
- **第三步：** 回复中**必须引用记忆来源**（如 "根据之前记录的…"，"MEMORY.md 中提到…"）
  - 格式：`Source: memory/YYYY-MM-DD.md` 或 `根据 MEMORY.md 记录…`

**违反后果：** 跳过任一强制步骤 = 回复质量不可靠 = 用户会质疑引擎是否在工作

**运行中：**
- 用户消息由 Gateway hook 自动记录，无需手动
- 高 imp 消息自动触发 recall → `last-recall.json`
- assistant 回复由引擎从会话转录自动补录（`sync`），无需手动
- 工作记忆、中期摘要、画像均由引擎自动维护
- 内存热区缓存自动加速检索（LRU 7天/500条）

### v5 常用命令

🤖 日常（auto）：`record` | `sync --quick` | `context` | `recall` | `consolidate` | `todos`
🧑 运维（occasional）：`status` | `search` | `report` | `profile` | `ask` | `health`
🔧 调试（debug）：`enable/disable` | `embed` | `reindex` | `profile-debug` | `tags`
📊 性能：`search --profile` 输出各阶段耗时

详见 `MEMORY-PROTOCOL.md` 或 Web UI：http://127.0.0.1:8765

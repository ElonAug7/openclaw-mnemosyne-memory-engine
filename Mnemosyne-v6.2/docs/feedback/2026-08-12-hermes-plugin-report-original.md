# Mnemosyne v6 × Hermes 原生插件接入报告（原始全文）

> 提交者：桦染霜&清弦AI | 日期：2026-08-12 | 渠道：微信
> 存档：小爪 2026-08-15，供上游审阅

---

## 一、背景

2026-08-10 完成 Mnemosyne v5-for-hermes 的 Hermes 适配（skill 协议路线）。当时踩的坑：install-elite.sh 在 MSYS (Git Bash) 下把 /e/mn/ 转成 E:\e\mn\，多转一层路径导致安装失败。绕过方式：skill_manage 直接创建 skill，路径全部替换为绝对路径。

2026-08-12 上游 v6（原生支持 Hermes）到手后，改为「原生 memory provider 插件」路线。本报告即本次改动的完整记录。

## 二、核心决策：为什么放弃 skill 协议，改走插件

v5 的 Hermes 接入是 skill 强制协议：每轮回复前手动跑 inject、回复后手动跑 post-reply。问题：

1. **依赖 agent 自觉** —— Hermes 没有 OpenClaw 那样的 Gateway hook，skill 协议是"要求模型每轮记得跑命令"，漏一轮丢一轮，实际长期空转。
2. **双记录风险** —— 协议仍在时，如果后续又加自动管道，同一轮会被记两次。
3. **无法兜底生命周期** —— 压缩前快照、会话结束、备份路径都没有挂钩点。

结论：Hermes 有官方的 MemoryProvider ABC（agent/memory_provider.py），prefetch/sync_turn 生命周期与 Mnemosyne 的 inject/post-reply 天然对应。正确做法是把 Mnemosyne 写成原生插件，让 Hermes 系统级自动调用，零自觉依赖。

## 三、插件结构

- 安装位置：`$HERMES_HOME/plugins/mnemosyne/`（本机实际：`C:\Users\Administrator\AppData\Local\hermes\plugins\mnemosyne\`）
- 文件清单：`__init__.py`（MemoryProvider 实现，约 16KB / 400 行）、`plugin.yaml`（元数据 + node 依赖声明）、`__pycache__`（运行时生成）
- 注册方式：Hermes 自动扫描 `$HERMES_HOME/plugins/` 下含 "register_memory_provider" 或 "MemoryProvider" 字样的目录，调用模块的 register(ctx) 完成注册。bundled 插件优先，同名不冲突。
- 激活配置：`hermes config set memory.provider mnemosyne`（config.yaml memory 段，仅此一处改动）

## 四、接线映射（核心）

Mnemosyne Elite bridge（v6.0.0）↔ Hermes MemoryProvider ABC：

| Hermes 生命周期 | Bridge 命令 | 实测耗时 |
|---|---|---|
| prefetch（每轮回复前） | inject --query | ~0.28s |
| sync_turn（每轮回复后） | post-reply --user/--asst | ~0.26s |
| on_pre_compress（压缩前） | record --role assistant | 后台 |
| on_memory_write（内置写） | record --role assistant | 后台 |
| backup_paths（hermes backup） | E:/mn/hermes-memory | 声明式 |

进程模型：Hermes(Python) 与 Mnemosyne(Node) 两进程，经 CLI 桥接。每轮两次 node 进程启停（inject + post-reply），对话无感。

超时/容错：MemoryManager 对外部 provider 有 8s prefetch 超时保护，provider 失败一律 non-fatal，引擎挂了最多召回为空，主循环不受影响。sync_turn 由 Hermes 后台 worker 执行，不阻塞对话轮。

## 五、暴露给模型的工具（4 个）

- `mnemo_search` —— 搜索记忆（--query --limit）
- `mnemo_context` —— 会话上下文（待办/问题/决策/话题）
- `mnemo_status` —— 引擎状态
- `mnemo_todos` —— 待办管理（list/add）

每轮 API 调用会多携带这 4 个工具 schema —— 这是唯一的常驻 token 开销。

## 六、实测验证（全部真实执行）

1. 插件发现：discover_memory_providers() 列出 mnemosyne，available=True
2. 加载：load_memory_provider('mnemosyne') 成功
3. prefetch：0.28s 返回历史记忆，含 `<memory-context>` 包装（Hermes 会包一层 [System note: 召回记忆非用户输入] 防注入混淆）
4. sync_turn 全链路：MemoryManager.sync_all → 后台 worker → bridge post-reply → 数据落盘（totalMessages 8 → 14，真实写入）
5. 四工具全通：mnemo_status/search/context/todos 均返回有效数据
6. hermes memory status：显示 "mnemosyne (no setup needed) ← active"

数据目录：E:/mn/hermes-memory（v5/v6 共用，零迁移成本）。分层：short/raw(30d) → short/working → medium(180d) → MEMORY.md(永久)

## 七、架构影响评估

零侵入。全部改动位于 Hermes 官方扩展点：
1. `$HERMES_HOME/plugins/mnemosyne/` —— 官方插件目录
2. `config.yaml memory.provider` —— 官方配置项
3. 每轮 4 个工具 schema —— 唯一长效开销（很小）

Hermes 核心源码一行未动，升级 Hermes 不碰插件。

## 八、封装与迁移

自包含：无 pip 依赖、无 API key、无网络、纯本地。迁移 = 拷 plugins/mnemosyne/ + E:/mn/ 两个目录 + 一条 config。root/bridge 路径均在 memory.mnemosyne 配置段可改，无需改代码。

## 九、踩坑与已知问题（给上游的反馈点）

1. **MSYS 路径 bug（v5 遗留，v6 的 platform.js 已修）**：install-elite.sh 在 Git Bash 下把 /e/mn/ 传原生 Node 时多转一层 E:\e\mn\。v6 已通过 platform.js 跨平台路径适配解决，已验证。
2. **install-elite.sh 的 Hermes skill 自动检测目录列表（v6 仍缺）**：列表是 ~/.hermes/workspace/skills、~/.hermes/skills 等，但 Hermes 桌面版实际 skill 目录是 %APPDATA%\Local\hermes\skills\（本机），插件目录是 %APPDATA%\Local\hermes\plugins\。建议把这两个路径加进 DETECTED_DIRS，或支持 --skill-dir 显式指定（--skill-dir 已支持，可兜底）。
3. **测试脚本陷阱（非产品问题）**：用一次性 python -c 调 sync_all 后立即退出，后台 daemon 线程会被解释器退出杀掉导致写盘丢失。真实 Hermes 长驻进程无此问题。测试需 sleep/wait 后再查。
4. **生效时机**：memory provider 在 agent 初始化时加载，配置改动后需新会话（/new）或重启才生效，热改不生效。
5. **【2026-08-12 补充】Web UI 环境变量不一致（v6.1.0 实测）**：ui.js 第 23 行只读 OPENCLAW_WORKSPACE 一个变量，不认 elite 层的 MNEMOSYNE_ROOT 抽象。未设 OPENCLAW_WORKSPACE 时默认指向 ~/.openclaw/workspace（OpenClaw 遗留默认值），表现为：引擎/CLI/bridge 数据全正常，唯独 UI 界面一片空白。本次排查确认：UI 进程未启动时 8765 无监听、无 node 进程；用 OPENCLAW_WORKSPACE="E:/mn/hermes-memory" 拉起后 /api/status 正常返回（totalMessages 30，root 正确）。建议：ui.js 的环境变量解析与 platform.js 统一——优先 MNEMOSYNE_ROOT → 回退 OPENCLAW_WORKSPACE → 再回退默认路径。

## 十、给上游的建议（可收编点）

1. Hermes 官方有 MemoryProvider ABC 这条更干净的扩展路径，建议 v6 的 elite 层增补"插件安装模式"：`install-elite.sh --hermes-plugin`，直接生成 $HERMES_HOME/plugins/mnemosyne/ 插件目录（本报告第三节结构），替代/补充现有 skill 协议路线。skill 协议适合无插件系统的 agent，插件适合 Hermes 系。
2. 本插件实现可直接收编：MemoryProvider ABC 的 6 个核心方法（is_available/initialize/prefetch/sync_turn/get_tool_schemas/handle_tool_call）+ 4 个可选 hook（on_pre_compress/on_memory_write/backup_paths/on_session_end）映射关系见第四节表格，与平台无关，Windows/Linux/macOS 通用。
3. README 可补一段 Hermes 插件安装说明（当前只有 skill 协议说明）。
4. 语义检索（semanticEnabled=true）在本机未启用 embedding，纯 TF-IDF 路线对中文效果可接受；如需中文语义增强，可考虑后续接入本地 embedding（如 bge-small-zh），但需注意守住"零依赖、无 API"的定位。

## 十一、文件位置速查

- 插件：C:\Users\Administrator\AppData\Local\hermes\plugins\mnemosyne\
- 引擎：E:\mn\Mnemosyne-v6\engine.js（v6.0.0）
- Bridge：E:\mn\Mnemosyne-v6\elite\hermes-bridge.js
- 数据：E:\mn\hermes-memory\
- Skill 手册：C:\Users\Administrator\AppData\Local\hermes\skills\mnemosyne-memory\
- v6 计划：E:\mn\Mnemosyne-v6\v6-plan.md

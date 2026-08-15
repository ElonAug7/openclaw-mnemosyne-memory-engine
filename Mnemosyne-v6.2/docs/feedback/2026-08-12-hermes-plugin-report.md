# 种子用户反馈：Mnemosyne v6 × Hermes 原生插件接入报告

- **提交者：** 桦染霜 & 清弦AI（首批跨平台测试者）
- **日期：** 2026-08-12
- **审阅状态：** ✅ 已核验（2026-08-15，小爪）
- **原始渠道：** 微信 / GitHub Issues

## 摘要

2026-08-10 完成 v5-for-hermes skill 协议适配（踩 MSYS 路径 bug）。08-12 拿到 v6 后改为 **Hermes 官方 MemoryProvider ABC 原生插件**路线：

- 放弃 skill 协议理由：依赖 agent 自觉（无 Gateway hook）、双记录风险、无生命周期兜底
- 插件结构：`$HERMES_HOME/plugins/mnemosyne/`（__init__.py ~400行 + plugin.yaml），自动发现注册，`config set memory.provider mnemosyne` 一处配置
- 接线：prefetch → inject（~0.28s）、sync_turn → post-reply（~0.26s）、on_pre_compress/on_memory_write → record、backup_paths 声明式
- 暴露 4 个工具：mnemo_search / mnemo_context / mnemo_status / mnemo_todos
- 容错：8s prefetch 超时、provider 失败 non-fatal、sync_turn 后台 worker
- 实测全通过：插件发现/加载/prefetch/sync_turn 落盘（totalMessages 8→14）/四工具/hermes memory status
- 数据目录 E:/mn/hermes-memory 与 v5/v6 共用，零迁移

## 反馈点与处理状态

| # | 问题 | 严重度 | 状态 |
|---|------|--------|------|
| 1 | MSYS 路径 bug（v5 遗留） | 🔴 P0 | ✅ v6 platform.js 已修（他们验证通过） |
| 2 | install-elite.sh DETECTED_DIRS 缺 Windows 路径（%LOCALAPPDATA%\hermes\{skills,plugins}） | 🟡 P1 | ✅ 已修（2026-08-15） |
| 3 | 测试脚本陷阱（python -c + 立即退出杀 daemon 线程） | ℹ️ 非产品问题 | 无需修，测试注意即可 |
| 4 | 生效时机：配置改动需 /new 或重启 | ℹ️ 已知行为 | 文档说明即可 |
| 5 | **ui.js 环境变量不一致（v6.1.0）**：只读 OPENCLAW_WORKSPACE，不认 MNEMOSYNE_ROOT，Hermes 下 UI 空白 | 🔴 P0 | ✅ 已修（2026-08-15）：统一为 MNEMOSYNE_ROOT → HERMES_WORKSPACE → OPENCLAW_WORKSPACE → ~/.mnemosyne |

## 收编建议（待决策）

1. install-elite.sh 增加 `--hermes-plugin` 插件安装模式（需先拿到插件代码）
2. 收编插件实现（MemoryProvider ABC 6 核心方法 + 4 可选 hook）
3. README 补 Hermes 插件安装说明
4. P2：中文语义本地 embedding（bge-small-zh），守住零依赖定位

## 原始报告

见同目录 `2026-08-12-hermes-plugin-report-original.md`。

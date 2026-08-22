# Mnemosyne Hermes 原生插件

通过 Hermes 官方 **MemoryProvider ABC**（`agent/memory_provider.py`）把 Mnemosyne 认知记忆引擎接入 Hermes：

- **系统级自动调用**：prefetch / sync_turn 由 Hermes 生命周期驱动，不依赖 agent 自觉
- **零依赖**：纯 Python 标准库 + Node.js ≥18，无 pip 包、无 API key、无网络
- **两进程桥接**：Python 适配层 ↔ `hermes-bridge.js`（Node）↔ `engine.js`

## 安装

方式一（推荐）：用 Elite 安装脚本一键安装

```bash
bash install-elite.sh --hermes-plugin --root E:/mn/hermes-memory
```

脚本会自动：复制本目录到 `$HERMES_HOME/plugins/mnemosyne/`、注入 bridge 绝对路径、打印激活命令。

方式二：手动安装

1. 复制本目录 → `$HERMES_HOME/plugins/mnemosyne/`
2. 把 `__init__.py` 里的 `@@BRIDGE_PATH@@` 替换为 `hermes-bridge.js` 的绝对路径
   （`@@ROOT_PATH@@` 同理，或改用环境变量/配置）
3. 激活：

```bash
hermes config set memory.provider mnemosyne
```

4. 新会话（/new）或重启 Hermes 生效（provider 在 agent 初始化时加载，热改不生效）

## 配置

config.yaml 的 `memory.mnemosyne` 段（均可选）：

```yaml
memory:
  mnemosyne:
    root: E:/mn/hermes-memory   # 数据目录
    node: node                  # Node 可执行文件
    bridge: E:/mn/hermes-bridge.js  # bridge 绝对路径
```

数据目录解析优先级：配置 root → 安装期注入 → `MNEMOSYNE_ROOT` → `HERMES_WORKSPACE` → `OPENCLAW_WORKSPACE` → `~/.mnemosyne`

## 暴露给模型的工具

| 工具 | 用途 |
|---|---|
| `mnemo_search` | 搜索记忆（关键词优先，复合线索评分排序） |
| `mnemo_context` | 会话上下文（待办/问题/决策/话题） |
| `mnemo_status` | 引擎状态 |
| `mnemo_todos` | 待办管理（list/add） |

## 容错

- Hermes 对 prefetch 有 8s 超时保护；本插件内部同样 8s 超时
- provider 任何失败均为 non-fatal：引擎挂了最多召回为空，主循环不受影响
- sync_turn 由 Hermes 后台 worker 执行，不阻塞对话轮

## 与 skill 协议的区别

| | skill 协议 | 本插件 |
|---|---|---|
| 触发方式 | agent 每轮自觉跑命令 | Hermes 生命周期自动调用 |
| 覆盖 | 乐观估计 ~80% | 100%（不依赖自觉） |
| 生命周期兜底 | 无 | 压缩前/会话结束/备份均有挂钩点 |
| 适用 | 无插件系统的 agent | Hermes 系 |

# Mnemosyne Backup Policy · 备份策略

## 策略摘要

| 类型 | 频率 | 内容 | 保留 |
|------|:--:|------|:--:|
| 增量 Incremental | 每日 03:00 | 新增 JSONL + 变更 MD | 30 天 |
| 全量 Full | 每周日 03:00 | 全部 memory/ + MEMORY.md | 12 周 |
| 清理 Cleanup | 自动 | >90 天旧快照 | -- |

## 命令

```bash
# 增量备份（默认）
node tools/memory-engine/engine.js backup --msg "daily"

# 全量备份
node tools/memory-engine/engine.js backup --full --msg "weekly"

# 查看备份历史
node tools/memory-engine/engine.js backup-log

# 清理旧备份
node tools/memory-engine/engine.js backup --cleanup
```

## 实现细节

- 增量：仅提交 `memory/short/raw/` 下 48h 内修改的 JSONL + 所有 MD 文件
- 全量：提交整个 `memory/` 目录 + `MEMORY.md` + `config.json`
- 压缩：不压缩（保持 Git diff 可读）
- 存储：本地 Git 仓库 `memory/.git/`，不推远程（隐私优先）
- 锁：写入时加进程锁，防止与 distill/sync 冲突

## 手动触发

```bash
# 随时手动备份
cd ~/.openclaw/workspace
node tools/memory-engine/engine.js backup --msg "pre-upgrade snapshot"

# 紧急回滚
node tools/memory-engine/engine.js backup-log
# 找到目标 commit hash，然后:
cd memory && git checkout <hash> -- .
```

## 存储估算

| 消息量 | 日增量 | 月全量 | 年总量 |
|------|:--:|:--:|:--:|
| 1,000 | ~50KB | ~1MB | ~12MB |
| 5,000 | ~200KB | ~3MB | ~36MB |
| 10,000 | ~400KB | ~6MB | ~72MB |

在 v5 零依赖架构下，备份完全走 Git CLI（`execFileSync('git', ...)`），无额外依赖。

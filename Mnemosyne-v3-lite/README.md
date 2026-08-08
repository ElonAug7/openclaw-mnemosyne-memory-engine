# 🦞 Mnemosyne v3-lite — 精简记忆引擎

> v3 完整版裁剪而来，保留核心功能，去掉非必要组件。

## 与 v3 的区别

| 类别 | v3 完整版 | v3-lite |
|------|----------|---------|
| CLI 命令 | 36 个 | 14 个 |
| API 端点 | 29 个 | 18 个 |
| 引擎行数 | 3092 | 2975 |
| 文件大小 | 124KB | 120KB |

### ✂️ 移除的功能

- ❌ 版本管理（快照/对比/冲突检测/恢复）
- ❌ Git 备份 / tar.gz 导出
- ❌ 会话视图 / 权限控制
- ❌ 蒸馏审阅（distill proposals / apply / reject）
- ❌ 手动信号发送
- ❌ 开发日志
- ❌ 内容索引
- ❌ 时间线
- ❌ imp 手动校准
- ❌ 配置命令（config.json 仍可手动编辑）
- ❌ record-raw 开关
- ❌ Web UI: 建议清理、回收站、层过滤、自动刷新、摘要按钮

### ✅ 保留的核心

- ✅ 消息记录（record）— 脱敏 + 压缩 + imp 评分
- ✅ 快速同步（sync --quick）— 转录 + 索引 + 工作记忆 + 整合
- ✅ 多模式搜索（keyword/semantic/hybrid/recent/history）
- ✅ 自动整合（consolidate）— imp 累积触发
- ✅ 引擎状态 + 健康检查
- ✅ 待办管理（含 v3 噪音过滤）
- ✅ 语义索引（本地 bigram+trigram）
- ✅ 清理（cleanup）
- ✅ Web UI: 文件浏览、搜索、查看、删除、开关记录
- ✅ POST+CSRF 安全加固
- ✅ raw 截断保护（imp≥0.7）
- ✅ hook 失效检测

### 命令参考

```
record    --role <user|assistant> --text "内容"
status
enable / disable
init
sync     [--quick]
consolidate [--check | --force]
search   --query "..." [--mode keyword|semantic|hybrid|recent|history]
todos    [--add "..." | --done <id>]
embed    [--force]
reindex
health
stats
cleanup  [--dry] [--confirm]
```

---

*Mnemosyne v3-lite · 精简版 · 核心全保留 · 非必要全移除*

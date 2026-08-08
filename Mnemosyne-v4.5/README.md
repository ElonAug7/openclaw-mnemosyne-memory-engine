# 🦞 Mnemosyne v4.5 — 精炼记忆引擎

> v4 Pro 精简版：砍掉 56% 命令和 70% UI，核心性能（搜索/imp/摘要）零退化

## 🎯 v4.5 vs v4 Pro

| 维度 | v4 Pro | v4.5 |
|------|--------|------|
| CLI 命令 | 44 | 19 |
| 引擎行数 | 3,767 | 3,029 |
| Web UI 功能 | 15+ | 6 |
| 评估工具 | 7 文件 + :8766 | 全部移除 |
| imp 评分 | TF-IDF KNN | TF-IDF KNN（保留） |
| 搜索模式 | 5 | 5（全保留） |
| cron 依赖 | 4 | 1（distill） |

## ✅ 保留的核心

**🤖 管线：** `record` `sync` `consolidate` `distill-proposals` `embed` `reindex`
**🧠 记忆回响：** `context`（话题续接）`recall`（自动闪回）`report` `profile`
**🔍 搜索：** 5 模式全保留（keyword/semantic/hybrid/recent/history）
**🎯 imp 评分：** TF-IDF KNN + regex 兜底
**🧹 维护：** `todos` `cleanup` `health` `stats` `enable/disable`

## ✂️ 移除的

`time-travel` `stale` `conflict` `ask` `timeline` `sessions` `content-index` `permission` `config` `devlog` `signal` `save` `export` `backup*` `version*` `record-raw` `reindex-all` `imp-calibrate` `distill-reject`

Web UI：工作台浮窗、浮动按钮、热力图、时光机、成长日志、"更多工具"组、层过滤、评估面板

## 📦 安装

### 方法一（推荐）：手动放到工作区

```bash
cp -r Mnemosyne-v4.5 ~/.openclaw/workspace/tools/
cd ~/.openclaw/workspace/tools/Mnemosyne-v4.5 && bash install.sh
openclaw gateway restart
```
将整个Mnemosyne-v4.5的文件夹放在.openclaw/workspace/tools后右键install以程序运行
### 方法二：从任意位置一键部署

```bash
bash /path/to/Mnemosyne-v4.5/install.sh
```

打开 `http://127.0.0.1:8765`

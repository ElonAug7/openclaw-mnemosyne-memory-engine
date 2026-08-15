# Mnemosyne 测试套件

一键运行全部测试：

```bash
bash tests/run-all.sh
```

每个测试都用**隔离临时目录**，不碰真实记忆库、不碰正在运行的服务、不碰真实 shell 配置（HOME 隔离）。

## 测试清单

| 文件 | 覆盖 | 回归的 bug |
|---|---|---|
| `test-engine-cli.sh` | 语法/init/record/status/context/search/recall/todos/health/report + **搜索 <50ms 硬指标** + 版本一致性 | — |
| `test-cleanup.sh` | cleanup --confirm 与 dry-run | dirsToCheck 未定义崩溃 |
| `test-distill.sh` | distill-reject / distill-proposals --apply | distill-reject 假命令 |
| `test-install.sh` | install-elite.sh --hermes-plugin 全流程（隔离 HOME） | set -u 未绑定变量、Windows 检测目录缺失 |
| `test-ui-env.sh` | ui.js 双环境（Hermes 仅 MNEMOSYNE_ROOT / OpenClaw） | UI root 回退错误、引擎 env 未注入 |
| `test-hermes-plugin.py` | Hermes MemoryManager 模拟集成（发现/加载/8s超时/sync_turn/4工具/3hook/容错/落盘） | 插件适配层回归 |

## 新增测试约定

- 引擎 bug 修复后，**必须**补一条回归测试（对应上表第三列）
- 测试输出以 `✓/✗` 标记，结尾打印通过数，非零退出码 = 失败
- 延迟类测试取 `--profile` 的 `multiPathSearch` 计算耗时（不含 node 启动开销）

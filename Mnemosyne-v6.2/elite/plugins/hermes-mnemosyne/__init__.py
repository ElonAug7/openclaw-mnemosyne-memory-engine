# -*- coding: utf-8 -*-
"""
Mnemosyne Hermes 原生插件 — MemoryProvider 适配层

把 Hermes 官方的 MemoryProvider ABC（agent/memory_provider.py）
桥接到 Mnemosyne Node 引擎（elite/hermes-bridge.js）。

生命周期映射（对照 Hermes MemoryProvider ABC）:
  prefetch          → bridge pre-reply   --query <本轮用户消息>
  sync_turn         → bridge post-reply  --user <...> --assistant <...>
  on_pre_compress   → bridge record      --role assistant --text <摘要>
  on_memory_write   → bridge record      --role assistant --text <内容>
  backup_paths      → [数据目录]（声明式，交给 hermes backup）
  on_session_end    → bridge record      --role assistant --text <摘要>

暴露给模型的 4 个工具:
  mnemo_search / mnemo_context / mnemo_status / mnemo_todos

设计原则:
  - 零 pip 依赖 / 零网络 / 零 API key，纯标准库
  - 失败一律 non-fatal：任何异常都被捕获并返回空/False，
    引擎挂了最多召回为空，绝不阻断 Hermes 主循环
  - 两进程模型：Hermes(Python) ↔ Mnemosyne(Node)，经 CLI 桥接
  - 数据目录优先级: ctx 配置 root → 安装期注入 @@ROOT_PATH@@
    → MNEMOSYNE_ROOT → HERMES_WORKSPACE → OPENCLAW_WORKSPACE → ~/.mnemosyne
"""
import json
import os
import shutil
import subprocess
import threading

# ---------------------------------------------------------------------------
# 安装期占位符（install-elite.sh --hermes-plugin 会替换为绝对路径）
# ---------------------------------------------------------------------------
_BRIDGE_PATH = "@@BRIDGE_PATH@@"   # hermes-bridge.js 绝对路径
_ROOT_PATH = "@@ROOT_PATH@@"       # 数据目录绝对路径

PLUGIN_NAME = "mnemosyne"
BRIDGE_TIMEOUT = 8     # prefetch 超时（与 Hermes MemoryManager 8s 保护对齐）
DEFAULT_NODE = "node"

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "mnemo_search",
            "description": "搜索 Mnemosyne 记忆库（关键词优先，复合线索评分排序）",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "limit": {"type": "integer", "description": "返回条数，默认 5", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mnemo_context",
            "description": "获取会话上下文：待办事项、遗留问题、近期决策、话题",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mnemo_status",
            "description": "查看 Mnemosyne 引擎状态（消息数、缓存、命中频率等）",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mnemo_todos",
            "description": "待办管理：列出或新增待办",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["list", "add"],
                        "description": "list=列出待办, add=新增待办",
                        "default": "list",
                    },
                    "text": {"type": "string", "description": "新增待办的文本（action=add 时必填）"},
                },
            },
        },
    },
]


def _resolve_ctx_config(ctx):
    """从 Hermes ctx 里尽力取出 memory.mnemosyne 配置段（容忍多种形状）。"""
    cfg = {}
    try:
        raw = getattr(ctx, "config", None)
        if isinstance(raw, dict):
            cfg = raw.get("memory", {}).get(PLUGIN_NAME, {}) or {}
        else:
            mm = getattr(raw, "memory", None)
            if mm is not None:
                mn = getattr(mm, PLUGIN_NAME, None)
                if mn is not None and hasattr(mn, "items"):
                    cfg = dict(mn)
    except Exception:
        cfg = {}
    return cfg if isinstance(cfg, dict) else {}


class MnemosyneMemoryProvider:
    """实现 Hermes MemoryProvider ABC 的 Mnemosyne 适配层。"""

    def __init__(self, ctx=None):
        self.ctx = ctx
        self.cfg = _resolve_ctx_config(ctx)
        self._initialized = False
        self._lock = threading.Lock()
        self._last_error = None
        self._root = self._resolve_root()
        self._bridge = self._resolve_bridge()
        self._node = str(self.cfg.get("node") or DEFAULT_NODE)

    # -- 路径解析 -------------------------------------------------------------
    def _resolve_root(self):
        if self.cfg.get("root"):
            return str(self.cfg["root"])
        if _ROOT_PATH and not _ROOT_PATH.startswith("@@"):
            return _ROOT_PATH
        return (
            os.environ.get("MNEMOSYNE_ROOT")
            or os.environ.get("HERMES_WORKSPACE")
            or os.environ.get("OPENCLAW_WORKSPACE")
            or os.path.join(os.path.expanduser("~"), ".mnemosyne")
        )

    def _resolve_bridge(self):
        if self.cfg.get("bridge"):
            return str(self.cfg["bridge"])
        if _BRIDGE_PATH and not _BRIDGE_PATH.startswith("@@"):
            return _BRIDGE_PATH
        # 兜底：源码树布局 elite/plugins/hermes-mnemosyne → elite/hermes-bridge.js
        here = os.path.dirname(os.path.abspath(__file__))
        guess = os.path.abspath(os.path.join(here, "..", "..", "hermes-bridge.js"))
        return guess if os.path.isfile(guess) else None

    # -- 桥接调用 -------------------------------------------------------------
    def _run_bridge(self, *args, **kw):
        timeout = kw.get("timeout") or BRIDGE_TIMEOUT
        if not self._bridge:
            self._last_error = "hermes-bridge.js 未找到"
            return {"ok": False, "error": self._last_error}
        cmd = [self._node, self._bridge] + [str(a) for a in args]
        env = dict(os.environ)
        env["MNEMOSYNE_ROOT"] = self._root
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                shell=False,
                encoding="utf-8",
                errors="replace",
                env=env,
            )
            out_text = (proc.stdout or "").strip()
            payload = None
            if out_text:
                try:
                    payload = json.loads(out_text)
                except Exception:
                    payload = {"raw": out_text[:1000]}
            ok = proc.returncode == 0
            if ok:
                self._last_error = None
            else:
                self._last_error = (proc.stderr or "").strip()[:500] or "bridge 非零退出"
            return {"ok": ok, "payload": payload, "error": self._last_error}
        except subprocess.TimeoutExpired:
            self._last_error = "bridge 超时 %ss" % timeout
            return {"ok": False, "error": self._last_error}
        except Exception as e:  # noqa: BLE001 — 插件必须 non-fatal
            self._last_error = str(e)[:500]
            return {"ok": False, "error": self._last_error}

    # -- 6 个核心方法 ----------------------------------------------------------
    def is_available(self):
        try:
            node_ok = shutil.which(self._node) is not None
            bridge_ok = bool(self._bridge) and os.path.isfile(self._bridge)
            return node_ok and bridge_ok
        except Exception:  # noqa: BLE001
            return False

    def initialize(self):
        if self._initialized:
            return True
        r = self._run_bridge("status", timeout=15)
        self._initialized = bool(r["ok"])
        return self._initialized

    def prefetch(self, query="", limit=None, **kwargs):
        """每轮回复前调用；返回 <memory-context> 包装的召回文本。"""
        q = query or kwargs.get("user_msg") or kwargs.get("message") or ""
        if not q:
            return ""
        r = self._run_bridge("pre-reply", "--query", q)
        if not r["ok"] or not r["payload"]:
            return ""
        p = r["payload"]
        text = p.get("memoryInjection") or ""
        if not text:
            fb = p.get("flashbacks") or []
            lines = [
                "- %s" % f.get("text", "")
                for f in fb
                if isinstance(f, dict) and f.get("text")
            ]
            text = "\n".join(lines)
        if not text.strip() or text.strip() == "（无相关记忆）":
            return ""
        return "<memory-context>\n%s\n</memory-context>" % text.strip()

    def sync_turn(self, user_msg="", asst_msg="", **kwargs):
        """每轮回复后调用（Hermes 后台 worker，不阻塞对话）。"""
        u = user_msg or kwargs.get("user") or ""
        a = asst_msg or kwargs.get("assistant") or ""
        if not u and not a:
            return False
        r = self._run_bridge("post-reply", "--user", u, "--assistant", a, timeout=15)
        return bool(r["ok"])

    def get_tool_schemas(self):
        return TOOL_SCHEMAS

    def handle_tool_call(self, name, args=None, **kwargs):
        args = args if isinstance(args, dict) else {}
        try:
            if name == "mnemo_search":
                q = args.get("query", "")
                if not q:
                    return self._err("mnemo_search 需要 query")
                limit = int(args.get("limit") or 5)
                return self._fmt(self._run_bridge("search", "--query", q, "--limit", limit))
            if name == "mnemo_context":
                return self._fmt(self._run_bridge("context"))
            if name == "mnemo_status":
                return self._fmt(self._run_bridge("status"))
            if name == "mnemo_todos":
                action = str(args.get("action") or "list")
                if action == "add" and args.get("text"):
                    return self._fmt(self._run_bridge("todos", "--add", args["text"]))
                return self._fmt(self._run_bridge("todos", "--list"))
            return self._err("未知工具: %s" % name)
        except Exception as e:  # noqa: BLE001
            return self._err(str(e))

    # -- 4 个可选 hook ----------------------------------------------------------
    def on_pre_compress(self, summary="", **kwargs):
        text = summary or kwargs.get("text") or ""
        if not text:
            return False
        self._run_bridge("record", "--role", "assistant", "--text", text, timeout=15)
        return True

    def on_memory_write(self, text="", **kwargs):
        t = text or kwargs.get("content") or ""
        if not t:
            return False
        self._run_bridge("record", "--role", "assistant", "--text", t, timeout=15)
        return True

    def backup_paths(self):
        return [self._root]

    def on_session_end(self, summary="", **kwargs):
        text = summary or kwargs.get("text") or ""
        if text:
            self._run_bridge("record", "--role", "assistant", "--text", text, timeout=15)
        return True

    # -- 辅助 -------------------------------------------------------------------
    def _fmt(self, r):
        if not r["ok"]:
            return self._err(r.get("error"))
        return json.dumps(r["payload"], ensure_ascii=False, default=str)

    @staticmethod
    def _err(msg):
        return json.dumps({"ok": False, "error": str(msg)[:300]}, ensure_ascii=False)


# ---------------------------------------------------------------------------
# 注册入口
# Hermes 自动扫描 $HERMES_HOME/plugins/ 下含 "register_memory_provider"
# 或 "MemoryProvider" 字样的目录，调用模块的 register(ctx) 完成注册。
# ---------------------------------------------------------------------------
def register(ctx=None):
    """插件注册入口。返回 MemoryProvider 实例。"""
    return MnemosyneMemoryProvider(ctx)


# 兼容不同发现规则命名的别名
register_memory_provider = register


__all__ = [
    "register",
    "register_memory_provider",
    "MnemosyneMemoryProvider",
    "TOOL_SCHEMAS",
    "PLUGIN_NAME",
]

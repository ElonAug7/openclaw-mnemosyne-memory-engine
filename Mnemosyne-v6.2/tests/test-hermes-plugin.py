#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
# Hermes MemoryManager 模拟集成测试
# 按种子用户（桦染霜&清弦AI）报告规格模拟 Hermes 生命周期：
#   发现 → 加载 → prefetch(8s超时保护) → sync_turn(后台worker)
#   → 4工具 → 3hook → 容错 → 数据落盘
# 用法: python3 tests/test-hermes-plugin.py
# ============================================================
import json
import os
import shutil
import sys
import tempfile
import threading
import time

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ENGINE_DIR = os.path.dirname(TESTS_DIR)
BRIDGE = os.path.join(ENGINE_DIR, 'elite', 'hermes-bridge.js')
SRC_DIR = os.path.join(ENGINE_DIR, 'elite', 'plugins', 'hermes-mnemosyne')

PASS = 0
FAIL = 0


def ok(msg):
    global PASS
    PASS += 1
    print('  ✓', msg)


def bad(msg):
    global FAIL
    FAIL += 1
    print('  ✗', msg)


def main():
    if not os.path.isfile(BRIDGE):
        bad(f'bridge 不存在: {BRIDGE}')
        return
    if not os.path.isfile(os.path.join(SRC_DIR, '__init__.py')):
        bad(f'插件源不存在: {SRC_DIR}')
        return

    TMP = tempfile.mkdtemp(prefix='mn-hermes-it-')
    try:
        HERMES_HOME = os.path.join(TMP, 'hermes-home')
        PLUGINS_DIR = os.path.join(HERMES_HOME, 'plugins')
        MN_ROOT = os.path.join(TMP, 'mn-data')
        os.makedirs(PLUGINS_DIR)
        os.makedirs(MN_ROOT)

        # 模拟安装：复制 + 路径注入
        src = open(os.path.join(SRC_DIR, '__init__.py'), encoding='utf-8').read()
        src = src.replace('@@BRIDGE_PATH@@', BRIDGE).replace('@@ROOT_PATH@@', MN_ROOT)
        os.makedirs(os.path.join(PLUGINS_DIR, 'mnemosyne'))
        with open(os.path.join(PLUGINS_DIR, 'mnemosyne', '__init__.py'), 'w', encoding='utf-8') as f:
            f.write(src)

        # ---- A. Hermes 自动发现 ----
        discovered = []
        for name in os.listdir(PLUGINS_DIR):
            d = os.path.join(PLUGINS_DIR, name)
            if not os.path.isdir(d):
                continue
            for f in os.listdir(d):
                if not f.endswith('.py'):
                    continue
                text = open(os.path.join(d, f), encoding='utf-8', errors='ignore').read()
                if 'register_memory_provider' in text or 'MemoryProvider' in text:
                    discovered.append(name)
                    break
        if discovered == ['mnemosyne']:
            ok('发现: discover_memory_providers 列出 mnemosyne')
        else:
            bad(f'发现失败: {discovered}')

        # ---- B. 加载 ----
        sys.path.insert(0, PLUGINS_DIR)
        import mnemosyne as plugin

        class FakeCtx:
            class Config:
                def __init__(self):
                    self.memory = {'mnemosyne': {'root': MN_ROOT}}
            def __init__(self):
                self.config = self.Config()

        provider = plugin.register(FakeCtx())
        if provider.is_available() and provider.initialize():
            ok('加载: is_available + initialize 成功')
        else:
            bad('加载失败')

        # ---- C. prefetch 带 8s 超时保护 ----
        result = {}

        def run_prefetch():
            try:
                result['v'] = provider.prefetch('上周的项目')
            except Exception as e:
                result['e'] = str(e)

        t = threading.Thread(target=run_prefetch, daemon=True)
        t.start()
        t.join(8)
        if t.is_alive():
            bad('prefetch 超过 8s 超时')
        else:
            ok('prefetch: 8s 内返回（超时保护内）')

        # ---- D. sync_turn 后台 worker ----
        worker = threading.Thread(
            target=provider.sync_turn, args=('用户消息A', '助手回复A'), daemon=True)
        worker.start()
        time.sleep(0.2)
        worker.join(timeout=10)
        if worker.is_alive():
            bad('sync_turn 超过 10s')
        else:
            ok('sync_turn: 后台 worker 完成，主循环不阻塞')

        # ---- E. 工具 ----
        schemas = provider.get_tool_schemas()
        names = [s['function']['name'] for s in schemas]
        if names == ['mnemo_search', 'mnemo_context', 'mnemo_status', 'mnemo_todos']:
            ok('工具: 4 个 schema 正确')
        else:
            bad(f'工具 schema 异常: {names}')
        status = json.loads(provider.handle_tool_call('mnemo_status'))
        if status.get('ok') and 'totalMessages' in json.dumps(status):
            ok('工具: mnemo_status 有效')
        else:
            bad('mnemo_status 失败')
        search = json.loads(provider.handle_tool_call('mnemo_search', {'query': '用户消息'}))
        if search.get('ok'):
            ok('工具: mnemo_search 有效')
        else:
            bad('mnemo_search 失败')
        ctx_r = json.loads(provider.handle_tool_call('mnemo_context'))
        if ctx_r.get('ok'):
            ok('工具: mnemo_context 有效')
        else:
            bad('mnemo_context 失败')
        todos = json.loads(provider.handle_tool_call('mnemo_todos', {'action': 'add', 'text': '集成测试待办'}))
        if todos.get('ok'):
            ok('工具: mnemo_todos add 有效')
        else:
            bad('mnemo_todos 失败')

        # ---- F. hooks ----
        if (provider.on_memory_write('内置写入测试')
                and provider.on_pre_compress('压缩前快照')
                and provider.on_session_end('会话结束摘要')
                and MN_ROOT in provider.backup_paths()):
            ok('hooks: on_memory_write/on_pre_compress/on_session_end/backup_paths 全过')
        else:
            bad('hooks 失败')

        # ---- G. 容错（bridge 失效 non-fatal）----
        provider._bridge = '/nonexistent/bridge.js'
        ok_txt = []
        if provider.prefetch('任意') != '':
            ok_txt.append('prefetch 未返回空串')
        if provider.is_available():
            ok_txt.append('is_available 未变 False')
        if not provider.handle_tool_call('mnemo_status').startswith('{"ok": false'):
            ok_txt.append('工具未返回错误 JSON')
        if not ok_txt:
            ok('容错: bridge 失效时全部 non-fatal')
        else:
            bad('容错失败: ' + '; '.join(ok_txt))

        # ---- H. 数据落盘 ----
        mem = os.path.join(MN_ROOT, 'memory')
        count = sum(len(fs) for _, _, fs in os.walk(mem)) if os.path.isdir(mem) else 0
        if count > 0:
            ok(f'落盘: memory 目录 {count} 个文件')
        else:
            bad('数据未落盘')
    finally:
        shutil.rmtree(TMP, ignore_errors=True)

    print(f'\n  [test-hermes-plugin] 通过 {PASS} / {PASS+FAIL}')
    if FAIL:
        sys.exit(1)


if __name__ == '__main__':
    main()

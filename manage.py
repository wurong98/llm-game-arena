#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""管理本地账号注册表（名字 <-> agent_id/api_key/provider/model/prompt_template）。

用法::

    # 注册一个新选手（同名会直接复用，不会在平台上重复注册）
    python3 manage.py register --name DeepSeek-A --provider deepseek --model deepseek-chat

    # 列出所有选手
    python3 manage.py list

    # 看某个选手的完整配置（含 prompt 模板）
    python3 manage.py show --name DeepSeek-A

    # 编辑 prompt 模板：不传 --file 就打开 $EDITOR 交互编辑
    python3 manage.py edit-prompt --name DeepSeek-A
    python3 manage.py edit-prompt --name DeepSeek-A --file my_prompt.txt

    # 改模型 / provider
    python3 manage.py set --name DeepSeek-A --model deepseek-reasoner

    # 本地移除（平台没有注销接口，这只是清掉本地记录）
    python3 manage.py remove --name DeepSeek-A
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile

from arena import config, registry
from arena.client import Arena

PROVIDERS = ["openai", "deepseek", "minimax", "ollama", "random", "probe"]


def cmd_register(args: argparse.Namespace) -> int:
    existing = registry.get(args.name)
    if existing and not args.force:
        print(f"[跳过注册] {args.name!r} 已存在，直接复用本地记录（agent_id={existing.get('agent_id')}）")
        entry = registry.upsert(args.name, provider=args.provider, model=args.model)
    else:
        arena = Arena(config.arena_base())
        entry = registry.register_or_get(arena, args.name, args.provider, args.model,
                                          description=args.description or "", force=args.force)
        print(f"[已注册] {args.name!r} -> agent_id={entry['agent_id']}")
    if args.prompt_file:
        with open(args.prompt_file, encoding="utf-8") as fp:
            registry.upsert(args.name, prompt_template=fp.read())
        print(f"[prompt] 已从 {args.prompt_file} 载入")
    return 0


def cmd_list(_args: argparse.Namespace) -> int:
    data = registry.load()
    if not data:
        print("（注册表为空，先用 register 注册一个）")
        return 0
    print(f"{'名字':<20}{'provider':<10}{'model':<24}{'agent_id':<16}")
    for name, e in data.items():
        print(f"{name:<20}{e.get('provider',''):<10}{e.get('model',''):<24}{e.get('agent_id',''):<16}")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    entry = registry.get(args.name)
    if not entry:
        print(f"没有 {args.name!r} 这个选手", file=sys.stderr)
        return 1
    for k, v in entry.items():
        if k == "api_key":
            v = (v[:8] + "...") if v else v
        if k == "prompt_template":
            print(f"{k}:\n---\n{v}\n---")
        else:
            print(f"{k}: {v}")
    return 0


def cmd_set(args: argparse.Namespace) -> int:
    if not registry.get(args.name):
        print(f"没有 {args.name!r} 这个选手，先 register", file=sys.stderr)
        return 1
    fields = {}
    if args.provider:
        fields["provider"] = args.provider
    if args.model:
        fields["model"] = args.model
    if args.temperature is not None:
        fields["temperature"] = args.temperature
    if args.base_url:
        fields["base_url"] = args.base_url
    registry.upsert(args.name, **fields)
    print(f"[已更新] {args.name}: {fields}")
    return 0


def cmd_edit_prompt(args: argparse.Namespace) -> int:
    entry = registry.get(args.name)
    if not entry:
        print(f"没有 {args.name!r} 这个选手，先 register", file=sys.stderr)
        return 1

    if args.file:
        with open(args.file, encoding="utf-8") as fp:
            text = fp.read()
    else:
        editor = os.environ.get("EDITOR", "vi")
        with tempfile.NamedTemporaryFile("w+", suffix=".txt", delete=False,
                                          encoding="utf-8") as tf:
            tf.write(entry.get("prompt_template") or registry.DEFAULT_PROMPT_TEMPLATE)
            path = tf.name
        subprocess.call([editor, path])
        with open(path, encoding="utf-8") as fp:
            text = fp.read()
        os.unlink(path)

    registry.upsert(args.name, prompt_template=text)
    print(f"[已更新 prompt] {args.name}\n---\n{text}\n---")
    return 0


def cmd_remove(args: argparse.Namespace) -> int:
    ok = registry.remove(args.name)
    print(f"{'已移除' if ok else '本来就没有'}: {args.name}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="管理对战平台的本地账号注册表")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("register", help="注册/复用一个选手")
    r.add_argument("--name", required=True)
    r.add_argument("--provider", required=True, choices=PROVIDERS)
    r.add_argument("--model", required=True)
    r.add_argument("--description", default="")
    r.add_argument("--prompt-file", default=None, help="用这个文件的内容作为 prompt 模板")
    r.add_argument("--force", action="store_true", help="即使本地已有同名记录，也重新向平台注册")
    r.set_defaults(func=cmd_register)

    sub.add_parser("list", help="列出所有选手").set_defaults(func=cmd_list)

    s = sub.add_parser("show", help="查看某个选手的完整配置")
    s.add_argument("--name", required=True)
    s.set_defaults(func=cmd_show)

    st = sub.add_parser("set", help="修改 provider/model/temperature/base_url")
    st.add_argument("--name", required=True)
    st.add_argument("--provider", default=None, choices=PROVIDERS)
    st.add_argument("--model", default=None)
    st.add_argument("--temperature", type=float, default=None)
    st.add_argument("--base-url", default=None)
    st.set_defaults(func=cmd_set)

    e = sub.add_parser("edit-prompt", help="编辑 prompt 模板（占位符: {board} {mark} {retry_hint}）")
    e.add_argument("--name", required=True)
    e.add_argument("--file", default=None, help="不传则打开 $EDITOR 交互编辑")
    e.set_defaults(func=cmd_edit_prompt)

    rm = sub.add_parser("remove", help="本地移除某个选手（不影响平台上的 agent_id）")
    rm.add_argument("--name", required=True)
    rm.set_defaults(func=cmd_remove)

    args = p.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

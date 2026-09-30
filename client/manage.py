#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""管理本地账号注册表（名字 <-> agent_id/api_key/provider/model/prompt_template）。

用法::

    # 交互向导：引导你选 provider、填 API Key / URL、选/填 model、起名字
    python3 manage.py register

    # 也可以命令行一把梭（同名会直接复用，不会在平台上重复注册）
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

    # 验证某个选手的 API Key / URL / model 是否真的能用（实际调一次模型）
    python3 manage.py ping --name DeepSeek-A

    # 本地移除（平台没有注销接口，这只是清掉本地记录）
    python3 manage.py remove --name DeepSeek-A
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
import time
from typing import Dict

from arena import config, registry, ui
from arena.client import Arena
from arena.providers import ProviderError, call_model

PROVIDERS = ["openai", "deepseek", "minimax", "ollama", "random", "probe"]

PROVIDER_LABELS = {
    "openai": "OpenAI（gpt-4o 等，需要 API Key）",
    "deepseek": "DeepSeek（deepseek-chat 等，需要 API Key）",
    "minimax": "MiniMax（abab6.5s-chat 等，需要 API Key）",
    "ollama": "Ollama（本地跑的开源模型，不需要 Key）",
    "random": "random（陪练：随机落子，不调模型）",
    "probe": "probe（陪练：固定选第一个空格，不调模型）",
}

MODEL_HINTS = {
    "openai": ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "o4-mini"],
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "minimax": ["abab6.5s-chat", "MiniMax-M1"],
    "ollama": ["llama3", "qwen2.5:7b", "deepseek-r1:7b"],
}

CUSTOM_MODEL = "· 自己输入其他 model 名字"


def _mask(v: str) -> str:
    return (v[:6] + "..." + v[-4:]) if v and len(v) > 12 else ("已设置" if v else "")


def _wizard_provider() -> str:
    return ui.select(PROVIDERS, title="选 provider（↑/↓ 选，回车确认）",
                      labels=[PROVIDER_LABELS[p] for p in PROVIDERS])


def _wizard_credentials(provider: str) -> None:
    """问 API Key / Base URL（Ollama 只问 URL），问完可选存进 config.json 长期复用。"""
    if provider in ("random", "probe"):
        return

    current = config.provider_defaults(provider)
    updates: Dict[str, str] = {}

    if provider != "ollama":
        hint = f"当前: {_mask(current.get('api_key', ''))}" if current.get("api_key") else "当前未设置"
        key = input(f"{provider} API Key（回车跳过，{hint}）: ").strip()
        if key:
            updates["api_key"] = key

    default_url = current.get("base_url", "")
    url = input(f"{provider} Base URL（回车用默认: {default_url}）: ").strip()
    if url:
        updates["base_url"] = url

    if updates and ui.confirm(f"把这些填的值存进 config.json，以后注册 {provider} 都自动复用？", default=True):
        config.save_provider_defaults(provider, **updates)
        print(f"[已保存] config.json -> providers.{provider}")


def _wizard_model(provider: str) -> str:
    hints = MODEL_HINTS.get(provider, [])
    if not hints:
        return input(f"{provider} 的 model 名字: ").strip()
    options = hints + [CUSTOM_MODEL]
    picked = ui.select(options, title=f"选 {provider} 的 model（↑/↓ 选，回车确认）")
    if picked == CUSTOM_MODEL:
        return input("输入 model 名字: ").strip()
    return picked


def _wizard_name(provider: str, model: str) -> str:
    data = registry.load()
    default_name = f"{provider.title()}-{model.split(':')[0].split('-')[-1]}"
    while True:
        name = input(f"给这个选手起个名字（回车默认 {default_name}）: ").strip() or default_name
        if name not in data:
            return name
        print(f"名字 {name!r} 已经在用了（agent_id={data[name].get('agent_id')}），换一个")
        default_name = ""


def wizard_register() -> argparse.Namespace:
    provider = _wizard_provider()
    _wizard_credentials(provider)
    model = _wizard_model(provider)
    name = _wizard_name(provider, model)
    return argparse.Namespace(name=name, provider=provider, model=model,
                               description="", prompt_file=None, force=False, from_wizard=True)


def _ping(name: str, prompt: str = "") -> bool:
    """实际调一次模型，验证 API Key / URL / model 名字是不是真的对。"""
    entry = registry.get(name)
    if not entry:
        print(f"没有 {name!r} 这个选手", file=sys.stderr)
        return False
    provider = entry["provider"]
    if provider in ("random", "probe"):
        print(f"{name} 是陪练档（{provider}），不调模型，没什么好测的")
        return True

    prompt = prompt or "这是一次连通性测试，请只回复两个字：pong"
    print(f"[测试中] {name} ({provider}/{entry.get('model')}) ...")
    t0 = time.time()
    try:
        raw = call_model(provider, prompt, dict(entry))
    except ProviderError as exc:
        print(f"[失败] {exc}")
        return False
    cost = int((time.time() - t0) * 1000)
    print(f"[成功] {cost}ms\n模型回复: {raw}")
    return True


def cmd_register(args: argparse.Namespace) -> int:
    from_wizard = getattr(args, "from_wizard", False)
    if not (args.name and args.provider and args.model):
        args = wizard_register()
        from_wizard = True
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

    if from_wizard and entry.get("provider") not in ("random", "probe"):
        if ui.confirm("现在测一下这个选手的 Key/URL/model 能不能用？", default=True):
            _ping(args.name)
    return 0


def cmd_ping(args: argparse.Namespace) -> int:
    return 0 if _ping(args.name, args.prompt) else 1


def cmd_list(_args: argparse.Namespace) -> int:
    data = registry.load()
    if not data:
        print("（注册表为空，先用 register 注册一个）")
        return 0
    name_w = max([len("名字")] + [len(n) for n in data]) + 2
    model_w = max([len("model")] + [len(e.get("model", "")) for e in data.values()]) + 2
    print(f"{'名字':<{name_w}}{'provider':<10}{'model':<{model_w}}{'agent_id':<16}")
    for name, e in data.items():
        print(f"{name:<{name_w}}{e.get('provider',''):<10}{e.get('model',''):<{model_w}}"
              f"{e.get('agent_id',''):<16}")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    entry = registry.get(args.name)
    if not entry:
        print(f"没有 {args.name!r} 这个选手", file=sys.stderr)
        return 1
    for k, v in entry.items():
        if k in ("api_key", "arena_api_key"):
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

    r = sub.add_parser("register", help="注册/复用一个选手（不传 --name/--provider/--model 就走交互向导）")
    r.add_argument("--name", default=None)
    r.add_argument("--provider", default=None, choices=PROVIDERS)
    r.add_argument("--model", default=None)
    r.add_argument("--description", default="")
    r.add_argument("--prompt-file", default=None, help="用这个文件的内容作为 prompt 模板")
    r.add_argument("--force", action="store_true", help="即使本地已有同名记录，也重新向平台注册")
    r.set_defaults(func=cmd_register, from_wizard=False)

    pg = sub.add_parser("ping", help="实际调一次模型，验证 API Key / URL / model 是否有效")
    pg.add_argument("--name", required=True)
    pg.add_argument("--prompt", default="", help="不传就用默认的连通性测试 prompt")
    pg.set_defaults(func=cmd_ping)

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

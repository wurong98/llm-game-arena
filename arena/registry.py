#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地账号注册表：name <-> agent_id/api_key/provider/model/prompt_template。

同名直接复用，不会重复向平台注册。文件里含 api_key，别提交进仓库。
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, Optional

HERE = os.path.dirname(os.path.abspath(__file__))
REGISTRY_PATH = os.path.join(os.path.dirname(HERE), "agents.json")

DEFAULT_PROMPT_TEMPLATE = (
    "你在玩井字棋，你执 {mark}。棋盘位置编号 0-8（从左到右从上到下）：\n"
    "0 1 2\n3 4 5\n6 7 8\n\n"
    "当前棋盘（空格用 . 表示）：\n{board}\n\n"
    "只回复一个数字（0-8）表示你要落子的位置，不要输出其他任何内容。"
)


def load() -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(REGISTRY_PATH):
        return {}
    with open(REGISTRY_PATH, encoding="utf-8") as fp:
        return json.load(fp)


def save(data: Dict[str, Dict[str, Any]]) -> None:
    with open(REGISTRY_PATH, "w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
    os.chmod(REGISTRY_PATH, 0o600)


def get(name: str) -> Optional[Dict[str, Any]]:
    return load().get(name)


def upsert(name: str, **fields: Any) -> Dict[str, Any]:
    data = load()
    entry = data.get(name, {"name": name, "prompt_template": DEFAULT_PROMPT_TEMPLATE,
                             "created_at": time.strftime("%Y-%m-%dT%H:%M:%S")})
    entry.update({k: v for k, v in fields.items() if v is not None})
    data[name] = entry
    save(data)
    return entry


def remove(name: str) -> bool:
    data = load()
    if name not in data:
        return False
    del data[name]
    save(data)
    return True


def register_or_get(arena, name: str, provider: str, model: str,
                     description: str = "", force: bool = False) -> Dict[str, Any]:
    """平台注册是一次性的（api_key 只返回一次），本地已有就直接复用。"""
    existing = get(name)
    if existing and not force:
        # provider/model 允许覆盖更新，agent_id/api_key 不变
        return upsert(name, provider=provider or existing.get("provider"),
                      model=model or existing.get("model"))

    reg = arena.register(name, description or f"provider={provider}, model={model}")
    return upsert(name, agent_id=reg["agent_id"], api_key=reg["api_key"],
                  provider=provider, model=model)

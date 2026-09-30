#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""集中配置：平台地址 + 各 provider 的默认 API Key/Base URL。

优先级：learning/config.json（本地，不入库，放真实 key） > 环境变量 > 内置默认值。
第一次用先 `cp config.example.json config.json` 再填。
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict

HERE = os.path.dirname(os.path.abspath(__file__))
LEARNING_DIR = os.path.dirname(HERE)
CONFIG_PATH = os.path.join(LEARNING_DIR, "config.json")

_DEFAULTS: Dict[str, Any] = {
    "arena_base": "http://localhost:4000",
    "game_type": "tic_tac_toe",
    "providers": {
        "openai": {"api_key": "", "base_url": "https://api.openai.com/v1"},
        "deepseek": {"api_key": "", "base_url": "https://api.deepseek.com"},
        "minimax": {"api_key": "", "group_id": "", "base_url": "https://api.minimax.chat/v1"},
        "ollama": {"base_url": "http://localhost:11434"},
    },
}

_ENV_MAP = {
    ("providers", "openai", "api_key"): "OPENAI_API_KEY",
    ("providers", "openai", "base_url"): "OPENAI_BASE_URL",
    ("providers", "deepseek", "api_key"): "DEEPSEEK_API_KEY",
    ("providers", "deepseek", "base_url"): "DEEPSEEK_BASE_URL",
    ("providers", "minimax", "api_key"): "MINIMAX_API_KEY",
    ("providers", "minimax", "group_id"): "MINIMAX_GROUP_ID",
    ("providers", "minimax", "base_url"): "MINIMAX_BASE_URL",
    ("providers", "ollama", "base_url"): "OLLAMA_BASE_URL",
    ("arena_base",): "ARENA_BASE",
}


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load() -> Dict[str, Any]:
    cfg = json.loads(json.dumps(_DEFAULTS))  # deep copy
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as fp:
            cfg = _deep_merge(cfg, json.load(fp))

    for path, env_key in _ENV_MAP.items():
        val = os.getenv(env_key)
        if not val:
            continue
        node = cfg
        for key in path[:-1]:
            node = node.setdefault(key, {})
        node[path[-1]] = val
    return cfg


def provider_defaults(provider: str) -> Dict[str, Any]:
    return dict(load().get("providers", {}).get(provider, {}))


def arena_base() -> str:
    return load()["arena_base"]


def game_type() -> str:
    return load()["game_type"]

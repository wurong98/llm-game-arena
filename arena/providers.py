#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统一的模型调用层：minimax / deepseek / openai / ollama / 陪练用的 random,probe。

新增一个 provider 只需要在这里加一个 call_xxx(prompt, cfg) -> str 函数，
再注册进 PROVIDERS 字典。cfg 是 registry.py 里存的那份 agent 配置 dict。
"""

from __future__ import annotations

import os
import random
from typing import Any, Dict, List

import requests

from . import config as _config


class ProviderError(RuntimeError):
    pass


def _get(cfg: Dict[str, Any], key: str, env_key: str = "", default: Any = None,
         provider: str = "") -> Any:
    """优先用 agent 自己存的配置，其次环境变量，其次 config.json，最后默认值。"""
    val = cfg.get(key)
    if val not in (None, ""):
        return val
    if env_key and os.getenv(env_key):
        return os.getenv(env_key)
    if provider:
        pv = _config.provider_defaults(provider).get(key)
        if pv:
            return pv
    return default


def _openai_compatible_chat(url: str, api_key: str, model: str, prompt: str,
                             temperature: Any = None, timeout: float = 90.0,
                             extra_headers: Dict[str, str] | None = None) -> str:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if extra_headers:
        headers.update(extra_headers)
    payload: Dict[str, Any] = {"model": model, "messages": [{"role": "user", "content": prompt}]}
    if temperature is not None:
        payload["temperature"] = temperature
    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if resp.status_code >= 400:
        raise ProviderError(f"HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    try:
        return (data["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError) as exc:
        raise ProviderError(f"返回格式不对: {data}") from exc


def call_openai(prompt: str, cfg: Dict[str, Any]) -> str:
    api_key = _get(cfg, "api_key", "OPENAI_API_KEY", provider="openai")
    if not api_key:
        raise ProviderError("缺少 OPENAI_API_KEY（可写进 learning/config.json 或环境变量）")
    base_url = _get(cfg, "base_url", "OPENAI_BASE_URL", "https://api.openai.com/v1", provider="openai")
    model = cfg.get("model") or "gpt-4o-mini"
    return _openai_compatible_chat(f"{base_url.rstrip('/')}/chat/completions", api_key, model,
                                    prompt, cfg.get("temperature"), cfg.get("timeout", 90.0))


def call_deepseek(prompt: str, cfg: Dict[str, Any]) -> str:
    api_key = _get(cfg, "api_key", "DEEPSEEK_API_KEY", provider="deepseek")
    if not api_key:
        raise ProviderError("缺少 DEEPSEEK_API_KEY（可写进 learning/config.json 或环境变量）")
    base_url = _get(cfg, "base_url", "DEEPSEEK_BASE_URL", "https://api.deepseek.com", provider="deepseek")
    model = cfg.get("model") or "deepseek-chat"
    return _openai_compatible_chat(f"{base_url.rstrip('/')}/chat/completions", api_key, model,
                                    prompt, cfg.get("temperature"), cfg.get("timeout", 90.0))


def call_minimax(prompt: str, cfg: Dict[str, Any]) -> str:
    api_key = _get(cfg, "api_key", "MINIMAX_API_KEY", provider="minimax")
    if not api_key:
        raise ProviderError("缺少 MINIMAX_API_KEY（可写进 learning/config.json 或环境变量）")
    group_id = _get(cfg, "group_id", "MINIMAX_GROUP_ID", provider="minimax")
    base_url = _get(cfg, "base_url", "MINIMAX_BASE_URL", "https://api.minimax.chat/v1", provider="minimax")
    model = cfg.get("model") or "abab6.5s-chat"
    url = f"{base_url.rstrip('/')}/text/chatcompletion_v2"
    if group_id:
        url += f"?GroupId={group_id}"
    return _openai_compatible_chat(url, api_key, model, prompt, cfg.get("temperature"),
                                    cfg.get("timeout", 90.0))


def call_ollama(prompt: str, cfg: Dict[str, Any]) -> str:
    base_url = _get(cfg, "base_url", "OLLAMA_BASE_URL", "http://localhost:11434", provider="ollama")
    model = cfg.get("model") or "llama3"
    payload: Dict[str, Any] = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }
    if cfg.get("temperature") is not None:
        payload["options"] = {"temperature": cfg["temperature"]}
    resp = requests.post(f"{base_url.rstrip('/')}/api/chat", json=payload,
                          timeout=cfg.get("timeout", 120.0))
    if resp.status_code >= 400:
        raise ProviderError(f"HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    try:
        return (data["message"]["content"] or "").strip()
    except (KeyError, TypeError) as exc:
        raise ProviderError(f"返回格式不对: {data}") from exc


def call_random(_prompt: str, cfg: Dict[str, Any]) -> str:
    free: List[int] = cfg.get("_free") or list(range(9))
    return str(random.choice(free))


def call_probe(_prompt: str, cfg: Dict[str, Any]) -> str:
    free: List[int] = cfg.get("_free") or list(range(9))
    return str(free[0])


PROVIDERS = {
    "openai": call_openai,
    "deepseek": call_deepseek,
    "minimax": call_minimax,
    "ollama": call_ollama,
    "random": call_random,
    "probe": call_probe,
}


def call_model(provider: str, prompt: str, cfg: Dict[str, Any]) -> str:
    fn = PROVIDERS.get(provider)
    if fn is None:
        raise ProviderError(f"未知 provider: {provider!r}，可选: {sorted(PROVIDERS)}")
    return fn(prompt, cfg)

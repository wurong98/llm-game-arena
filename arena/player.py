#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""单个 Agent 的对局循环：轮询状态 -> 拼 prompt -> 调 provider -> 提交落子。

作为子进程跑（被 run_match.py 拉起），也可以单独用命令行手动跑一个 agent。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from typing import Any, Dict, List, Optional

from . import config, registry
from .client import Arena
from .providers import ProviderError, call_model


def render_board(board: List[str]) -> str:
    cells = [c or "." for c in board]
    return "\n".join(" ".join(cells[r * 3:r * 3 + 3]) for r in range(3))


def build_prompt(template: str, board: List[str], mark: str, retry_hint: str = "") -> str:
    return template.format(board=render_board(board), mark=mark, retry_hint=retry_hint)


def parse_pos(raw: str) -> int:
    text = (raw or "").strip()
    if not text:
        raise ValueError("模型返回空内容")
    for pat in (r"<pos>\s*([0-8])\s*</pos>", r"\bpos\s*[=:]\s*([0-8])\b",
                r"位置\s*[是为:：]?\s*([0-8])\b"):
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return int(m.group(1))
    standalone = re.findall(r"(?<![0-9-])([0-8])(?![0-9])", text)
    if standalone:
        return int(standalone[-1])
    raise ValueError(f"没解析出 0-8 的合法落子位置: {raw!r}")


def detect_mark(state: Dict[str, Any], agent_id: str, forced: Optional[str]) -> str:
    if forced:
        return forced.upper()
    if state.get("player_x") == agent_id:
        return "X"
    if state.get("player_o") == agent_id:
        return "O"
    raise SystemExit("无法判断执子方：state 里的 player_x/player_o 都不是我的 agent_id")


def log_line(fp, **kw: Any) -> None:
    kw["at"] = time.strftime("%H:%M:%S")
    kw["ts"] = round(time.time(), 3)
    line = json.dumps(kw, ensure_ascii=False)
    print(line, flush=True)
    if fp:
        fp.write(line + "\n")
        fp.flush()


def run_agent(base: str, match_id: str, name: str, mark: Optional[str] = None,
              poll: float = 1.0, max_seconds: float = 900.0, max_retries: int = 3,
              log_path: Optional[str] = None) -> int:
    entry = registry.get(name)
    if not entry:
        raise SystemExit(f"注册表里没有名字 {name!r}，先用 manage.py register")

    arena = Arena(base, entry["api_key"])
    provider = entry["provider"]
    template = entry.get("prompt_template") or registry.DEFAULT_PROMPT_TEMPLATE
    log_fp = open(log_path, "a", encoding="utf-8") if log_path else None

    try:
        state = arena.state(match_id)
        my_mark = detect_mark(state, entry["agent_id"], mark)
        log_line(log_fp, ev="start", match=match_id, name=name, mark=my_mark,
                 provider=provider, model=entry.get("model"))

        rejected: List[int] = []
        deadline = time.time() + max_seconds
        while time.time() < deadline:
            state = arena.state(match_id)
            if state["status"] == "finished":
                log_line(log_fp, ev="finished", winner=state["winner"])
                return 0
            if state["turn"] != my_mark:
                time.sleep(poll)
                continue

            free = [i for i, c in enumerate(state["board"]) if not c]
            if not free:
                time.sleep(poll)
                continue

            retry_hint = ""
            if rejected:
                bad = [r for r in rejected if r >= 0]
                retry_hint = (f"你刚才下在 {', '.join(str(r) for r in bad)}，那些格已经被占了，这一步是废步。换一格。"
                              if bad else "你刚才的回复里没有给出 0-8 之间的合法位置，这一步作废，请换一格。")

            prompt = build_prompt(template, state["board"], my_mark, retry_hint)
            cfg = dict(entry, _free=free)
            t0 = time.time()
            try:
                raw = call_model(provider, prompt, cfg)
            except ProviderError as exc:
                log_line(log_fp, ev="model_error", error=str(exc))
                raw = ""

            try:
                pos = parse_pos(raw)
                bad = None if pos in free else pos
            except ValueError as exc:
                pos, bad = None, None
                log_line(log_fp, ev="parse_error", raw=raw[:200], error=str(exc))

            if bad is not None or pos is None:
                rejected = rejected + [bad if bad is not None else -1]
                log_line(log_fp, ev="blocked", pos=pos, free=free, raw=raw[:200], tries=len(rejected))
                if len(rejected) >= max_retries:
                    log_line(log_fp, ev="give_up", rejected=rejected)
                    return 2
                time.sleep(poll)
                continue

            resp = arena.move(match_id, pos, prompt, raw)
            cost = int((time.time() - t0) * 1000)
            if resp.get("ok"):
                log_line(log_fp, ev="move", pos=pos, raw=raw[:200], latency_ms=cost, free=free)
                rejected = []
            else:
                rejected = rejected + [pos]
                log_line(log_fp, ev="illegal", pos=pos, err=resp.get("error"), raw=raw[:200],
                         latency_ms=cost, tries=len(rejected))
                if len(rejected) >= max_retries:
                    log_line(log_fp, ev="give_up", rejected=rejected)
                    return 2

            time.sleep(poll)

        log_line(log_fp, ev="timeout", seconds=max_seconds)
        return 3
    finally:
        if log_fp:
            log_fp.close()


def main() -> int:
    p = argparse.ArgumentParser(description="拉起一个已注册的 agent 打指定对局")
    p.add_argument("--base", default=config.arena_base())
    p.add_argument("--match", required=True)
    p.add_argument("--name", required=True, help="registry 里的账号名")
    p.add_argument("--mark", default=None, help="X 或 O，留空自动判断")
    p.add_argument("--poll", type=float, default=1.0)
    p.add_argument("--max-seconds", type=float, default=900.0)
    p.add_argument("--max-retries", type=int, default=3)
    p.add_argument("--log", default=None)
    args = p.parse_args()
    return run_agent(args.base, args.match, args.name, args.mark, args.poll,
                      args.max_seconds, args.max_retries, args.log)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)

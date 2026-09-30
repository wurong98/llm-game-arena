#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""指定（或交互选择）两个已注册的选手，打 1v1，结束后打印平台排行榜。

不传 --x/--o 时进入交互模式：列出注册表选手，上下选，选完还能就地编辑 prompt。

用法::

    # 交互模式：列表里选 X / O，回车前可以再编辑一下 prompt
    python3 run_match.py

    # 直接指定，跑一局
    python3 run_match.py --x DeepSeek-A --o MiniMax-B

    # 连打 5 局（每局交替执先手），打完看战绩 + 平台榜
    python3 run_match.py --x DeepSeek-A --o MiniMax-B --rounds 5
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from typing import Dict, List, Optional

from arena import config, registry, ui
from arena.client import Arena

HERE = os.path.dirname(os.path.abspath(__file__))
PLAYER = [sys.executable, "-m", "arena.player"]
OUT_ROOT = os.path.join(HERE, "output")


def pick_name(data: Dict[str, dict], title: str, exclude: str = "") -> str:
    names = [n for n in data if n != exclude]
    labels = [f"{n}  ({data[n].get('provider')}/{data[n].get('model')})" for n in names]
    return ui.select(names, title=title, labels=labels)


def maybe_edit_prompt(name: str) -> None:
    entry = registry.get(name)
    print(f"\n--- {name} 当前 prompt 模板 ---")
    print(entry.get("prompt_template") or registry.DEFAULT_PROMPT_TEMPLATE)
    print("---")
    if ui.confirm(f"要改 {name} 的 prompt 吗？"):
        import manage  # noqa: E402  局部导入，复用 edit-prompt 的交互逻辑
        ns = argparse.Namespace(name=name, file=None)
        manage.cmd_edit_prompt(ns)


def interactive_pick() -> tuple[str, str]:
    data = registry.load()
    if len(data) < 2:
        raise SystemExit("注册表里选手不够两个，先用 manage.py register 注册")
    x_name = pick_name(data, "选 X 方（↑/↓ 选，回车确认）")
    o_name = pick_name(data, "选 O 方（↑/↓ 选，回车确认）", exclude=x_name)
    maybe_edit_prompt(x_name)
    maybe_edit_prompt(o_name)
    return x_name, o_name


EV_LABEL = {
    "calling": "调用模型中", "move": "落子", "illegal": "非法落子", "blocked": "本地拦下",
    "parse_error": "解析失败", "model_error": "调模型失败", "give_up": "放弃",
}


def _tail_new_events(trace_paths: Dict[str, str], positions: Dict[str, int],
                      names: Dict[str, str]) -> None:
    """把 trace_X.jsonl / trace_O.jsonl 里新增的行读出来，打印模型的原始回复。"""
    for mark, path in trace_paths.items():
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fp:
            fp.seek(positions[mark])
            while True:
                line = fp.readline()
                if not line:
                    break
                positions[mark] = fp.tell()
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ev = rec.get("ev")
                if ev not in EV_LABEL:
                    continue
                raw = (rec.get("raw") or "").replace("\n", " ")
                if len(raw) > 200:
                    raw = raw[:200] + "..."
                extra = f" pos={rec['pos']}" if "pos" in rec and rec["pos"] is not None else ""
                err = f" ({rec['error']})" if rec.get("error") else (f" ({rec['err']})" if rec.get("err") else "")
                cost = f" {rec['model_ms']/1000:.1f}s" if rec.get("model_ms") is not None else ""
                who = f"{mark}:{names[mark]}"
                print(f"    [{who}][{EV_LABEL[ev]}{extra}{err}]{cost} {raw}", flush=True)


def run_one_round(base: str, game_type: str, x_name: str, o_name: str,
                   move_timeout_ms: Optional[int], poll: float, max_seconds: float,
                   round_dir: str) -> Dict[str, str]:
    x_entry, o_entry = registry.get(x_name), registry.get(o_name)
    arena = Arena(base)
    match = arena.create_match(game_type, x_entry["agent_id"], o_entry["agent_id"], move_timeout_ms)
    match_id = match["match_id"]
    os.makedirs(round_dir, exist_ok=True)
    names = {"X": x_name, "O": o_name}

    print(f"\n对局 {match_id}:  X={x_name}  O={o_name}")

    trace_paths = {mark: os.path.join(round_dir, f"trace_{mark}.jsonl") for mark in ("X", "O")}
    trace_pos = {mark: 0 for mark in ("X", "O")}

    procs = []
    for mark, name in (("X", x_name), ("O", o_name)):
        log = open(os.path.join(round_dir, f"player_{mark}.log"), "w", encoding="utf-8")
        procs.append((mark, subprocess.Popen(
            PLAYER + ["--base", base, "--match", match_id, "--name", name, "--mark", mark,
                      "--poll", str(poll), "--max-seconds", str(max_seconds),
                      "--log", trace_paths[mark]],
            cwd=HERE, stdout=log, stderr=subprocess.STDOUT), log))

    deadline = time.time() + max_seconds + 60
    final = None
    while time.time() < deadline:
        st = arena.state(match_id)
        turn_name = names.get(st["turn"], st["turn"])
        print(f"  [{st['status']:<11}] 轮到 {st['turn']}({turn_name})  "
              f"{''.join(c or '.' for c in st['board'])}", flush=True)
        _tail_new_events(trace_paths, trace_pos, names)
        if st["status"] == "finished":
            final = st
            break
        time.sleep(2)
    _tail_new_events(trace_paths, trace_pos, names)

    for mark, proc, log in procs:
        if proc.poll() is None:
            proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()

    final = final or arena.state(match_id)
    winner = final.get("winner") or "draw"
    print(f"结果: {winner}   产物: {round_dir}")
    return {"match_id": match_id, "winner": winner, "x": x_name, "o": o_name}


def main() -> int:
    p = argparse.ArgumentParser(description="1v1 对抗，可交互选人，可连打多局")
    p.add_argument("--x", default=None, help="X 方账号名，不传则进交互选人")
    p.add_argument("--o", default=None, help="O 方账号名，不传则进交互选人")
    p.add_argument("--rounds", type=int, default=1, help="打几局，>1 时每局交替先后手")
    p.add_argument("--move-timeout-ms", type=int, default=None)
    p.add_argument("--poll", type=float, default=1.0)
    p.add_argument("--max-seconds", type=float, default=900.0)
    args = p.parse_args()

    base = config.arena_base()
    game_type = config.game_type()

    if args.x and args.o:
        x_name, o_name = args.x, args.o
        for n in (x_name, o_name):
            if not registry.get(n):
                raise SystemExit(f"注册表里没有 {n!r}，先用 manage.py register")
    else:
        x_name, o_name = interactive_pick()

    session_dir = os.path.join(OUT_ROOT, time.strftime("%Y%m%d-%H%M%S"))
    results: List[Dict[str, str]] = []
    for i in range(args.rounds):
        rx, ro = (x_name, o_name) if i % 2 == 0 else (o_name, x_name)
        round_dir = os.path.join(session_dir, f"round{i}")
        results.append(run_one_round(base, game_type, rx, ro, args.move_timeout_ms,
                                      args.poll, args.max_seconds, round_dir))

    if args.rounds > 1:
        score = {x_name: 0.0, o_name: 0.0}
        for r in results:
            if r["winner"] == "draw":
                score[r["x"]] += 0.5
                score[r["o"]] += 0.5
            else:
                winner_name = r["x"] if r["winner"] == "X" else r["o"]
                score[winner_name] += 1.0
        print(f"\n=== {args.rounds} 局战绩 ===")
        for name, s in score.items():
            print(f"  {name}: {s}")

    lb = Arena(base).leaderboard(game_type)
    lb = [row for row in lb if row["display_name"] in (x_name, o_name)] or lb
    print(f"\n=== 平台排行榜 ({game_type}) ===")
    print(f"{'选手':<20}{'rating':<8}{'胜':<5}{'负':<5}{'平':<5}{'非法率':<8}")
    for row in lb:
        print(f"{row['display_name']:<20}{row['rating']:<8}{row['wins']:<5}{row['losses']:<5}"
              f"{row['draws']:<5}{row['illegal_move_rate']:<8}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

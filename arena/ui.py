#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""终端里的上下键选择菜单（curses），不用敲编号。"""

from __future__ import annotations

import curses
from typing import List, Sequence


def select(options: Sequence[str], title: str = "", labels: Sequence[str] | None = None) -> str:
    """上下键 / j,k 移动，回车确认，Esc/q 取消（抛 KeyboardInterrupt）。

    options: 实际返回值列表；labels: 展示用的文案（不传就直接显示 options）。
    """
    if not options:
        raise ValueError("没有可选项")
    labels = list(labels) if labels else list(options)

    def _run(stdscr) -> int:
        curses.curs_set(0)
        curses.use_default_colors()
        curses.init_pair(1, curses.COLOR_BLACK, curses.COLOR_CYAN)
        idx = 0
        while True:
            stdscr.erase()
            if title:
                stdscr.addstr(0, 0, title, curses.A_BOLD)
            for i, label in enumerate(labels):
                y = i + (2 if title else 0)
                if i == idx:
                    stdscr.addstr(y, 0, f"> {label}", curses.color_pair(1))
                else:
                    stdscr.addstr(y, 0, f"  {label}")
            stdscr.addstr(len(labels) + (3 if title else 1), 0,
                          "↑/↓ 或 j/k 移动，回车确认，q 取消", curses.A_DIM)
            stdscr.refresh()

            key = stdscr.getch()
            if key in (curses.KEY_UP, ord("k")):
                idx = (idx - 1) % len(labels)
            elif key in (curses.KEY_DOWN, ord("j")):
                idx = (idx + 1) % len(labels)
            elif key in (curses.KEY_ENTER, 10, 13):
                return idx
            elif key in (27, ord("q")):
                return -1

    chosen = curses.wrapper(_run)
    if chosen < 0:
        raise KeyboardInterrupt("用户取消选择")
    return options[chosen]


def confirm(question: str, default: bool = False) -> bool:
    label = select(["是", "否"] if default else ["否", "是"], title=question)
    return label == "是"

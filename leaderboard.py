#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打印平台排行榜。"""

from __future__ import annotations

import argparse
import sys

from arena import config
from arena.client import Arena


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--game-type", default=config.game_type())
    args = p.parse_args()

    rows = Arena(config.arena_base()).leaderboard(args.game_type)
    if not rows:
        print("排行榜为空")
        return 0
    print(f"{'选手':<20}{'rating':<8}{'胜':<5}{'负':<5}{'平':<5}{'非法率':<8}{'延迟(ms)':<10}")
    for row in rows:
        print(f"{row['display_name']:<20}{row['rating']:<8}{row['wins']:<5}{row['losses']:<5}"
              f"{row['draws']:<5}{row['illegal_move_rate']:<8}{row.get('avg_latency_ms', ''):<10}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

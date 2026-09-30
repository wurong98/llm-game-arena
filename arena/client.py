#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""对战平台的最小 HTTP 客户端，对应 AGENT_GUIDE.md 里的接口。"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import requests


class Arena:
    def __init__(self, base: str, api_key: Optional[str] = None, timeout: float = 15.0) -> None:
        self.base = base.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.session = requests.Session()

    def _req(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None,
             auth: bool = False) -> Dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if auth:
            if not self.api_key:
                raise RuntimeError("需要 api_key 才能调用这个接口")
            headers["Authorization"] = f"Bearer {self.api_key}"
        resp = self.session.request(method, f"{self.base}{path}", json=payload,
                                     headers=headers, timeout=self.timeout)
        if resp.status_code >= 400:
            raise RuntimeError(f"{method} {path} -> HTTP {resp.status_code}: {resp.text[:300]}")
        return resp.json()

    def games(self) -> List[Dict[str, Any]]:
        return self._req("GET", "/games")

    def register(self, display_name: str, description: str = "",
                 supported_games: Optional[List[str]] = None) -> Dict[str, Any]:
        payload = {
            "display_name": display_name,
            "description": description,
            "supported_games": supported_games or ["tic_tac_toe"],
        }
        resp = self.session.post(f"{self.base}/agents/register", json=payload, timeout=self.timeout)
        if resp.status_code == 409:
            # 撞名：加时间戳后缀重试一次
            payload["display_name"] = f"{display_name}-{int(time.time()) % 100000}"
            resp = self.session.post(f"{self.base}/agents/register", json=payload, timeout=self.timeout)
        if resp.status_code >= 400:
            raise RuntimeError(f"register -> HTTP {resp.status_code}: {resp.text[:300]}")
        return resp.json()

    def create_match(self, game_type: str, player_x: str, player_o: str,
                      move_timeout_ms: Optional[int] = None) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"game_type": game_type, "player_x": player_x, "player_o": player_o}
        if move_timeout_ms is not None:
            payload["move_timeout_ms"] = move_timeout_ms
        return self._req("POST", "/matches", payload)

    def state(self, match_id: str) -> Dict[str, Any]:
        return self._req("GET", f"/matches/{match_id}/state")

    def move(self, match_id: str, pos: int, prompt: Optional[str] = None,
              raw: Optional[str] = None) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"pos": pos}
        if prompt is not None:
            payload["prompt_sent"] = prompt
        if raw is not None:
            payload["raw_response"] = raw
        return self._req("POST", f"/matches/{match_id}/move", payload, auth=True)

    def debug(self, match_id: str, move_index: int) -> Dict[str, Any]:
        return self._req("GET", f"/matches/{match_id}/moves/{move_index}/debug")

    def list_matches(self, game_type: Optional[str] = None,
                      status: Optional[str] = None) -> List[Dict[str, Any]]:
        qs = []
        if game_type:
            qs.append(f"game_type={game_type}")
        if status:
            qs.append(f"status={status}")
        suffix = ("?" + "&".join(qs)) if qs else ""
        return self._req("GET", f"/matches{suffix}")

    def leaderboard(self, game_type: str) -> List[Dict[str, Any]]:
        return self._req("GET", f"/leaderboard?game_type={game_type}")

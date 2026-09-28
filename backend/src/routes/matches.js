import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { getGameRule } from "../gameRegistry.js";
import { requireAgentAuth } from "../auth.js";
import { updateElo } from "../elo.js";

export const matchesRouter = Router();

const ILLEGAL_MOVE_LIMIT = 3;
const DEFAULT_MOVE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟,本地小模型也能参与

function checkTimeout(match) {
  if (match.status !== "in_progress" || !match.turn_started_at) return match;
  const timeoutMs = match.move_timeout_ms || DEFAULT_MOVE_TIMEOUT_MS;
  const elapsed = Date.now() - new Date(match.turn_started_at).getTime();
  if (elapsed <= timeoutMs) return match;

  const winner = match.turn === "X" ? "O" : "X";
  finishMatch(match, winner, "timeout");
  return db.prepare("SELECT * FROM matches WHERE match_id = ?").get(match.match_id);
}

function ensureRating(agent_id, game_type) {
  const existing = db
    .prepare("SELECT * FROM ratings WHERE agent_id = ? AND game_type = ?")
    .get(agent_id, game_type);
  if (!existing) {
    db.prepare(
      "INSERT INTO ratings (agent_id, game_type) VALUES (?, ?)"
    ).run(agent_id, game_type);
  }
}

function serializeMatch(row) {
  return {
    match_id: row.match_id,
    game_type: row.game_type,
    board: JSON.parse(row.board),
    turn: row.turn,
    status: row.status,
    winner: row.winner,
    end_reason: row.end_reason,
    player_x: row.player_x,
    player_o: row.player_o,
    created_at: row.created_at,
    ended_at: row.status === "finished" ? row.updated_at : null,
    move_timeout_ms: row.move_timeout_ms || DEFAULT_MOVE_TIMEOUT_MS,
    turn_started_at: row.turn_started_at,
  };
}

function getLatencyTotals(match_id, player_x, player_o) {
  const rows = db
    .prepare(
      "SELECT agent_id, SUM(latency_ms) AS total_latency FROM moves WHERE match_id = ? GROUP BY agent_id"
    )
    .all(match_id);
  const byAgent = {};
  for (const r of rows) byAgent[r.agent_id] = r.total_latency || 0;
  return {
    latency_x_ms: byAgent[player_x] || 0,
    latency_o_ms: byAgent[player_o] || 0,
  };
}

function getMoveHistory(match_id) {
  return db
    .prepare(
      "SELECT move_index, agent_id, mark, pos, valid, at FROM moves WHERE match_id = ? ORDER BY move_index ASC"
    )
    .all(match_id);
}

matchesRouter.post("/matches", (req, res) => {
  const { game_type, player_x, player_o, move_timeout_ms } = req.body || {};
  const rule = getGameRule(game_type);
  if (!rule) return res.status(400).json({ ok: false, error: "unknown_game_type" });

  const px = db.prepare("SELECT agent_id FROM agents WHERE agent_id = ?").get(player_x);
  const po = db.prepare("SELECT agent_id FROM agents WHERE agent_id = ?").get(player_o);
  if (!px || !po) return res.status(400).json({ ok: false, error: "unknown_agent" });

  const timeoutMs =
    typeof move_timeout_ms === "number" && move_timeout_ms > 0
      ? move_timeout_ms
      : DEFAULT_MOVE_TIMEOUT_MS;

  const match_id = "m_" + nanoid(10);
  const board = rule.init_board();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO matches (match_id, game_type, player_x, player_o, board, turn, status, created_at, updated_at, turn_started_at, move_timeout_ms)
     VALUES (?, ?, ?, ?, ?, 'X', 'in_progress', ?, ?, ?, ?)`
  ).run(match_id, game_type, player_x, player_o, JSON.stringify(board), now, now, now, timeoutMs);

  ensureRating(player_x, game_type);
  ensureRating(player_o, game_type);

  res.status(201).json({ match_id, status: "in_progress" });
});

matchesRouter.get("/matches", (req, res) => {
  const { game_type, status } = req.query;
  let query = "SELECT * FROM matches WHERE 1=1";
  const params = [];
  if (game_type) {
    query += " AND game_type = ?";
    params.push(game_type);
  }
  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  query += " ORDER BY created_at DESC";
  const rows = db.prepare(query).all(...params).map(checkTimeout);

  const latencyByMatch = {};
  if (rows.length) {
    const placeholders = rows.map(() => "?").join(",");
    const latRows = db
      .prepare(
        `SELECT match_id, agent_id, SUM(latency_ms) AS total_latency
         FROM moves WHERE match_id IN (${placeholders}) GROUP BY match_id, agent_id`
      )
      .all(...rows.map((r) => r.match_id));
    for (const lr of latRows) {
      latencyByMatch[lr.match_id] = latencyByMatch[lr.match_id] || {};
      latencyByMatch[lr.match_id][lr.agent_id] = lr.total_latency || 0;
    }
  }

  res.json(
    rows.map((r) => {
      const latency = latencyByMatch[r.match_id] || {};
      return {
        match_id: r.match_id,
        game_type: r.game_type,
        player_x: r.player_x,
        player_o: r.player_o,
        status: r.status,
        winner: r.winner,
        end_reason: r.end_reason,
        created_at: r.created_at,
        ended_at: r.status === "finished" ? r.updated_at : null,
        latency_x_ms: latency[r.player_x] || 0,
        latency_o_ms: latency[r.player_o] || 0,
      };
    })
  );
});

matchesRouter.get("/matches/:id/state", (req, res) => {
  let row = db.prepare("SELECT * FROM matches WHERE match_id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: "match_not_found" });
  row = checkTimeout(row);
  res.json({
    ...serializeMatch(row),
    ...getLatencyTotals(row.match_id, row.player_x, row.player_o),
    move_history: getMoveHistory(row.match_id),
  });
});

matchesRouter.get("/matches/:id/moves/:index/debug", (req, res) => {
  const row = db
    .prepare(
      "SELECT * FROM moves WHERE match_id = ? AND move_index = ?"
    )
    .get(req.params.id, Number(req.params.index));
  if (!row) return res.status(404).json({ ok: false, error: "move_not_found" });
  res.json({
    move_index: row.move_index,
    agent_id: row.agent_id,
    mark: row.mark,
    pos: row.pos,
    valid: !!row.valid,
    error: row.error,
    prompt_sent: row.prompt_sent,
    raw_response: row.raw_response,
    latency_ms: row.latency_ms,
    at: row.at,
  });
});

matchesRouter.post("/matches/:id/move", requireAgentAuth, (req, res) => {
  let match = db.prepare("SELECT * FROM matches WHERE match_id = ?").get(req.params.id);
  if (!match) return res.status(404).json({ ok: false, error: "match_not_found" });
  match = checkTimeout(match);
  if (match.status !== "in_progress") {
    return res.status(400).json({ ok: false, error: "match_finished" });
  }

  const rule = getGameRule(match.game_type);
  const mark = match.turn;
  const expectedAgent = mark === "X" ? match.player_x : match.player_o;
  if (req.agent.agent_id !== expectedAgent) {
    return res.status(403).json({ ok: false, error: "not_your_turn" });
  }

  const { pos, prompt_sent, raw_response, latency_ms } = req.body || {};
  const board = JSON.parse(match.board);
  const validation = rule.validate_move(board, mark, pos);
  const moveIndex = getMoveHistory(match.match_id).length;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO moves (match_id, move_index, agent_id, mark, pos, valid, error, prompt_sent, raw_response, latency_ms, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    match.match_id,
    moveIndex,
    req.agent.agent_id,
    mark,
    typeof pos === "number" ? pos : null,
    validation.ok ? 1 : 0,
    validation.ok ? null : validation.error,
    prompt_sent || null,
    raw_response || null,
    typeof latency_ms === "number" ? latency_ms : null,
    now
  );

  if (!validation.ok) {
    const countField = mark === "X" ? "illegal_move_count_x" : "illegal_move_count_o";
    const newCount = match[countField] + 1;
    if (newCount >= ILLEGAL_MOVE_LIMIT) {
      const winner = mark === "X" ? "O" : "X";
      finishMatch(match, winner, "illegal_moves");
      return res.json({
        ok: false,
        error: validation.error,
        illegal_move_count: newCount,
        match_finished: true,
        winner,
      });
    }
    db.prepare(
      `UPDATE matches SET ${countField} = ?, updated_at = ?, turn_started_at = ? WHERE match_id = ?`
    ).run(newCount, now, now, match.match_id);
    return res.json({ ok: false, error: validation.error, illegal_move_count: newCount });
  }

  const newBoard = rule.apply_move(board, mark, pos);
  const result = rule.check_end(newBoard);
  const nextTurn = mark === "X" ? "O" : "X";

  db.prepare(
    "UPDATE matches SET board = ?, turn = ?, updated_at = ?, turn_started_at = ? WHERE match_id = ?"
  ).run(JSON.stringify(newBoard), nextTurn, now, now, match.match_id);

  if (result.finished) {
    const reason = result.winner === "draw" ? "draw" : "win";
    finishMatch({ ...match, board: JSON.stringify(newBoard) }, result.winner, reason);
  }

  res.json({ ok: true, board: newBoard, next_turn: nextTurn });
});

function finishMatch(match, winner, reason) {
  db.prepare(
    "UPDATE matches SET status = 'finished', winner = ?, end_reason = ?, updated_at = ? WHERE match_id = ?"
  ).run(winner, reason, new Date().toISOString(), match.match_id);

  const gameType = match.game_type;
  const rx = db.prepare("SELECT * FROM ratings WHERE agent_id = ? AND game_type = ?").get(match.player_x, gameType);
  const ro = db.prepare("SELECT * FROM ratings WHERE agent_id = ? AND game_type = ?").get(match.player_o, gameType);

  let scoreX;
  if (winner === "draw") scoreX = 0.5;
  else if (winner === "X") scoreX = 1;
  else scoreX = 0;

  const { ratingA, ratingB } = updateElo(rx.rating, ro.rating, scoreX);

  const applyResult = (row, agent_id, score) => {
    const wins = row.wins + (score === 1 ? 1 : 0);
    const losses = row.losses + (score === 0 ? 1 : 0);
    const draws = row.draws + (score === 0.5 ? 1 : 0);
    return { wins, losses, draws };
  };

  const rxResult = applyResult(rx, match.player_x, scoreX);
  const roResult = applyResult(ro, match.player_o, 1 - scoreX);

  db.prepare(
    "UPDATE ratings SET rating = ?, wins = ?, losses = ?, draws = ? WHERE agent_id = ? AND game_type = ?"
  ).run(ratingA, rxResult.wins, rxResult.losses, rxResult.draws, match.player_x, gameType);

  db.prepare(
    "UPDATE ratings SET rating = ?, wins = ?, losses = ?, draws = ? WHERE agent_id = ? AND game_type = ?"
  ).run(ratingB, roResult.wins, roResult.losses, roResult.draws, match.player_o, gameType);
}

import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { getGameRule } from "../gameRegistry.js";
import { requireAgentAuth } from "../auth.js";
import { updateElo } from "../elo.js";

export const matchesRouter = Router();

const ILLEGAL_MOVE_LIMIT = 3;

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
    player_x: row.player_x,
    player_o: row.player_o,
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
  const { game_type, player_x, player_o } = req.body || {};
  const rule = getGameRule(game_type);
  if (!rule) return res.status(400).json({ ok: false, error: "unknown_game_type" });

  const px = db.prepare("SELECT agent_id FROM agents WHERE agent_id = ?").get(player_x);
  const po = db.prepare("SELECT agent_id FROM agents WHERE agent_id = ?").get(player_o);
  if (!px || !po) return res.status(400).json({ ok: false, error: "unknown_agent" });

  const match_id = "m_" + nanoid(10);
  const board = rule.init_board();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO matches (match_id, game_type, player_x, player_o, board, turn, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'X', 'in_progress', ?, ?)`
  ).run(match_id, game_type, player_x, player_o, JSON.stringify(board), now, now);

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
  const rows = db.prepare(query).all(...params);
  res.json(
    rows.map((r) => ({
      match_id: r.match_id,
      game_type: r.game_type,
      player_x: r.player_x,
      player_o: r.player_o,
      status: r.status,
      winner: r.winner,
    }))
  );
});

matchesRouter.get("/matches/:id/state", (req, res) => {
  const row = db.prepare("SELECT * FROM matches WHERE match_id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: "match_not_found" });
  res.json({ ...serializeMatch(row), move_history: getMoveHistory(row.match_id) });
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
  const match = db.prepare("SELECT * FROM matches WHERE match_id = ?").get(req.params.id);
  if (!match) return res.status(404).json({ ok: false, error: "match_not_found" });
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
      finishMatch(match, winner);
      return res.json({
        ok: false,
        error: validation.error,
        illegal_move_count: newCount,
        match_finished: true,
        winner,
      });
    }
    db.prepare(`UPDATE matches SET ${countField} = ?, updated_at = ? WHERE match_id = ?`).run(
      newCount,
      now,
      match.match_id
    );
    return res.json({ ok: false, error: validation.error, illegal_move_count: newCount });
  }

  const newBoard = rule.apply_move(board, mark, pos);
  const result = rule.check_end(newBoard);
  const nextTurn = mark === "X" ? "O" : "X";

  if (result.finished) {
    db.prepare(
      "UPDATE matches SET board = ?, turn = ?, updated_at = ? WHERE match_id = ?"
    ).run(JSON.stringify(newBoard), nextTurn, now, match.match_id);
    finishMatch({ ...match, board: JSON.stringify(newBoard) }, result.winner);
  } else {
    db.prepare(
      "UPDATE matches SET board = ?, turn = ?, updated_at = ? WHERE match_id = ?"
    ).run(JSON.stringify(newBoard), nextTurn, now, match.match_id);
  }

  res.json({ ok: true, board: newBoard, next_turn: nextTurn });
});

function finishMatch(match, winner) {
  db.prepare(
    "UPDATE matches SET status = 'finished', winner = ?, updated_at = ? WHERE match_id = ?"
  ).run(winner, new Date().toISOString(), match.match_id);

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

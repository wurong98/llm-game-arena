import { Router } from "express";
import { db } from "../db.js";

export const leaderboardRouter = Router();

leaderboardRouter.get("/leaderboard", (req, res) => {
  const { game_type, sort_by } = req.query;
  if (!game_type) {
    return res.status(400).json({ ok: false, error: "game_type_required" });
  }
  const rows = db
    .prepare(
      `SELECT r.*, a.display_name FROM ratings r
       JOIN agents a ON a.agent_id = r.agent_id
       WHERE r.game_type = ?`
    )
    .all(game_type);

  const result = rows.map((r) => ({
    agent_id: r.agent_id,
    display_name: r.display_name,
    game_type: r.game_type,
    rating: Math.round(r.rating),
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    illegal_move_rate: r.total_moves > 0 ? r.illegal_moves / r.total_moves : 0,
    avg_latency_ms: r.total_moves > 0 ? Math.round(r.total_latency_ms / r.total_moves) : 0,
  }));

  const sortKey = sort_by || "rating";
  result.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  res.json(result);
});

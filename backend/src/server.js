import express from "express";
import cors from "cors";
import "./db.js";
import { agentsRouter } from "./routes/agents.js";
import { gamesRouter } from "./routes/games.js";
import { matchesRouter } from "./routes/matches.js";
import { leaderboardRouter } from "./routes/leaderboard.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use(agentsRouter);
app.use(gamesRouter);
app.use(matchesRouter);
app.use(leaderboardRouter);

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`LLM Arena backend running on http://localhost:${PORT}`);
});

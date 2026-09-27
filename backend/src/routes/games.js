import { Router } from "express";
import { listGames } from "../gameRegistry.js";

export const gamesRouter = Router();

gamesRouter.get("/games", (req, res) => {
  res.json(listGames());
});

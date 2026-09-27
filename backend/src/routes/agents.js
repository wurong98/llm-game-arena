import { Router } from "express";
import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { db } from "../db.js";
import { hashKey } from "../auth.js";

export const agentsRouter = Router();

agentsRouter.post("/agents/register", (req, res) => {
  const { display_name, description, supported_games } = req.body || {};
  if (!display_name || typeof display_name !== "string") {
    return res.status(400).json({ ok: false, error: "display_name_required" });
  }
  const existing = db
    .prepare("SELECT agent_id FROM agents WHERE display_name = ?")
    .get(display_name);
  if (existing) {
    return res.status(409).json({ ok: false, error: "display_name_taken" });
  }

  const agent_id = "ag_" + nanoid(10);
  const apiKey = "sk_" + crypto.randomBytes(24).toString("hex");
  const keyHash = hashKey(apiKey);

  db.prepare(
    `INSERT INTO agents (agent_id, display_name, description, key_hash, supported_games, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    agent_id,
    display_name,
    description || "",
    keyHash,
    JSON.stringify(supported_games || []),
    new Date().toISOString()
  );

  res.status(201).json({ agent_id, api_key: apiKey });
});

agentsRouter.get("/agents", (req, res) => {
  const agents = db.prepare("SELECT agent_id, display_name, description, supported_games FROM agents").all();
  res.json(
    agents.map((a) => ({
      agent_id: a.agent_id,
      display_name: a.display_name,
      description: a.description,
      supported_games: JSON.parse(a.supported_games || "[]"),
    }))
  );
});

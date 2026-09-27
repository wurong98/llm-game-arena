import crypto from "node:crypto";
import { db } from "./db.js";

export function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function requireAgentAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const key = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!key) {
    return res.status(401).json({ ok: false, error: "missing_api_key" });
  }
  const keyHash = hashKey(key);
  const agent = db
    .prepare("SELECT * FROM agents WHERE key_hash = ?")
    .get(keyHash);
  if (!agent) {
    return res.status(401).json({ ok: false, error: "invalid_api_key" });
  }
  req.agent = agent;
  next();
}

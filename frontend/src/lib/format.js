export const POLL_INTERVAL_MS = 2000;

export const MATCH_STATUS_MAP = {
  in_progress: { label: "进行中", tone: "live" },
  finished: { label: "已结束", tone: "done" },
};

export function getMatchStatus(status) {
  return MATCH_STATUS_MAP[status] || { label: status, tone: "neutral" };
}

export const END_REASON_MAP = {
  win: { label: "获胜", tone: "winner" },
  draw: { label: "平局", tone: "neutral" },
  timeout: { label: "超时判负", tone: "warn" },
  illegal_moves: { label: "违规判负", tone: "warn" },
};

export function getEndReason(reason) {
  return END_REASON_MAP[reason] || null;
}

export function getAgentName(agents, agentId) {
  return agents.find((a) => a.agent_id === agentId)?.display_name || agentId;
}

export function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDuration(ms) {
  if (!ms || ms <= 0) return "0s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m${sec}s`;
}

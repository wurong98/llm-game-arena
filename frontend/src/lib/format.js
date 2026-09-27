export const POLL_INTERVAL_MS = 2000;

export const MATCH_STATUS_MAP = {
  in_progress: { label: "进行中", tone: "live" },
  finished: { label: "已结束", tone: "done" },
};

export function getMatchStatus(status) {
  return MATCH_STATUS_MAP[status] || { label: status, tone: "neutral" };
}

export function getAgentName(agents, agentId) {
  return agents.find((a) => a.agent_id === agentId)?.display_name || agentId;
}

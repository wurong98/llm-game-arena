const BASE = `${window.location.protocol}//${window.location.hostname}:4000`;

export async function getGames() {
  return (await fetch(`${BASE}/games`)).json();
}

export async function getAgents() {
  return (await fetch(`${BASE}/agents`)).json();
}

export async function getMatches(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return (await fetch(`${BASE}/matches?${qs}`)).json();
}

export async function getMatchState(id) {
  return (await fetch(`${BASE}/matches/${id}/state`)).json();
}

export async function getMoveDebug(matchId, index) {
  return (await fetch(`${BASE}/matches/${matchId}/moves/${index}/debug`)).json();
}

export async function getLeaderboard(game_type) {
  return (await fetch(`${BASE}/leaderboard?game_type=${game_type}`)).json();
}

export async function registerAgent(display_name, description, supported_games) {
  const res = await fetch(`${BASE}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name, description, supported_games }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "register_failed");
  return data;
}

export async function createMatch(game_type, player_x, player_o) {
  const res = await fetch(`${BASE}/matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_type, player_x, player_o }),
  });
  return res.json();
}

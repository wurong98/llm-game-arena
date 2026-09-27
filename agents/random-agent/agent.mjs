// 示例 Agent:随机落子,用于验证平台闭环(注册 -> 拉状态 -> 落子 -> 结束)
// 用法: node agent.mjs <display_name>

const BASE = process.env.ARENA_BASE_URL || "http://localhost:4000";
const displayName = process.argv[2];
if (!displayName) {
  console.error("用法: node agent.mjs <display_name>");
  process.exit(1);
}

async function registerOrReuse() {
  const res = await fetch(`${BASE}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      display_name: displayName,
      description: "随机落子示例 Agent",
      supported_games: ["tic_tac_toe"],
    }),
  });
  if (res.status === 409) {
    throw new Error(`名字已被占用: ${displayName},换一个名字`);
  }
  const data = await res.json();
  console.log(`注册成功: agent_id=${data.agent_id}`);
  return data;
}

function pickMove(board) {
  const empty = board.map((v, i) => (v === "" ? i : null)).filter((v) => v !== null);
  return empty[Math.floor(Math.random() * empty.length)];
}

async function playMatch(matchId, agentId, apiKey) {
  while (true) {
    const stateRes = await fetch(`${BASE}/matches/${matchId}/state`);
    const state = await stateRes.json();
    if (state.status === "finished") {
      console.log(`对局结束,胜者: ${state.winner}`);
      return;
    }

    const myMark = state.player_x === agentId ? "X" : "O";
    if (state.turn !== myMark) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    const pos = pickMove(state.board);
    const start = Date.now();
    const moveRes = await fetch(`${BASE}/matches/${matchId}/move`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        pos,
        prompt_sent: `当前棋盘: ${JSON.stringify(state.board)}`,
        raw_response: `随机选择落子位置 ${pos}`,
        latency_ms: Date.now() - start,
      }),
    });
    const result = await moveRes.json();
    console.log(`落子 pos=${pos} ->`, result);
    if (result.match_finished) {
      console.log(`对局结束,胜者: ${result.winner}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const { agent_id, api_key } = await registerOrReuse();
console.log(`Agent ${displayName} (${agent_id}) 已就绪,等待被加入对局...`);
console.log(`请用这个 agent_id 创建对局: ${agent_id}`);

// 简化:轮询是否已经被加入一个 match(通过查 matches 列表找自己)
while (true) {
  const res = await fetch(`${BASE}/matches?status=in_progress`);
  const matches = await res.json();
  const myMatch = matches.find(
    (m) => m.player_x === agent_id || m.player_o === agent_id
  );
  if (myMatch) {
    console.log(`发现对局 ${myMatch.match_id},开始对弈`);
    await playMatch(myMatch.match_id, agent_id, api_key);
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMatches, getAgents, createMatch } from "../api";

export default function MatchList() {
  const [matches, setMatches] = useState([]);
  const [agents, setAgents] = useState([]);
  const [px, setPx] = useState("");
  const [po, setPo] = useState("");

  const load = async () => {
    setMatches(await getMatches());
    setAgents(await getAgents());
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  const handleCreate = async () => {
    if (!px || !po || px === po) return;
    await createMatch("tic_tac_toe", px, po);
    load();
  };

  return (
    <div>
      <h2>对局列表</h2>

      <div style={{ marginBottom: 20, padding: 10, border: "1px solid #ccc" }}>
        <h3>创建对局(井字棋)</h3>
        <select value={px} onChange={(e) => setPx(e.target.value)}>
          <option value="">选择 X 方</option>
          {agents.map((a) => (
            <option key={a.agent_id} value={a.agent_id}>
              {a.display_name}
            </option>
          ))}
        </select>
        <select value={po} onChange={(e) => setPo(e.target.value)}>
          <option value="">选择 O 方</option>
          {agents.map((a) => (
            <option key={a.agent_id} value={a.agent_id}>
              {a.display_name}
            </option>
          ))}
        </select>
        <button onClick={handleCreate}>创建对局</button>
      </div>

      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>match_id</th>
            <th>X</th>
            <th>O</th>
            <th>状态</th>
            <th>胜者</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.match_id}>
              <td>
                <Link to={`/matches/${m.match_id}`}>{m.match_id}</Link>
              </td>
              <td>{agents.find((a) => a.agent_id === m.player_x)?.display_name || m.player_x}</td>
              <td>{agents.find((a) => a.agent_id === m.player_o)?.display_name || m.player_o}</td>
              <td>{m.status}</td>
              <td>{m.winner || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

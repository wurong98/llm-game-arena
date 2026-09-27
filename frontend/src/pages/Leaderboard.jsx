import { useEffect, useState } from "react";
import { getLeaderboard } from "../api";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    getLeaderboard("tic_tac_toe").then(setRows);
  }, []);

  return (
    <div>
      <h2>排行榜(井字棋)</h2>
      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>选手</th>
            <th>Rating</th>
            <th>胜</th>
            <th>负</th>
            <th>平</th>
            <th>非法落子率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.agent_id}>
              <td>{r.display_name}</td>
              <td>{r.rating}</td>
              <td>{r.wins}</td>
              <td>{r.losses}</td>
              <td>{r.draws}</td>
              <td>{(r.illegal_move_rate * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

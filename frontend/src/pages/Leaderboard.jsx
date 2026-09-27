import { useEffect, useState } from "react";
import { getLeaderboard } from "../api";
import styles from "./Leaderboard.module.css";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    getLeaderboard("tic_tac_toe").then(setRows);
  }, []);

  return (
    <div>
      <h2>排行榜(井字棋)</h2>
      <div className={styles.list}>
        {rows.map((r, i) => (
          <div key={r.agent_id} className={`${styles.row} ${i < 3 ? styles.top : ""}`}>
            <span className={styles.rank}>{String(i + 1).padStart(2, "0")}</span>
            <span className={styles.name}>{r.display_name}</span>
            <span className={styles.rating}>{r.rating}</span>
            <span className={styles.stats}>
              <span>{r.wins}胜{r.losses}负{r.draws}平</span>
              <span>非法率 {(r.illegal_move_rate * 100).toFixed(1)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import Badge from "../Badge/Badge";
import { getAgentName, getMatchStatus, formatDateTime, formatDuration } from "../../lib/format";
import styles from "./MatchCard.module.css";

export default function MatchCard({ match, agents }) {
  const status = getMatchStatus(match.status);
  const xName = getAgentName(agents, match.player_x);
  const oName = getAgentName(agents, match.player_o);

  return (
    <Link to={`/matches/${match.match_id}`} className={styles.card}>
      <span className={styles.matchId}>#{match.match_id}</span>
      <div className={styles.matchup}>
        <span className={`${styles.player} ${styles.x} ${match.winner === match.player_x ? styles.winner : ""}`}>
          <span className={styles.name}>{xName}</span>
          <span className={styles.time}>用时 {formatDuration(match.latency_x_ms)}</span>
        </span>
        <span className={styles.vs}>VS</span>
        <span className={`${styles.player} ${styles.o} ${match.winner === match.player_o ? styles.winner : ""}`}>
          <span className={styles.name}>{oName}</span>
          <span className={styles.time}>用时 {formatDuration(match.latency_o_ms)}</span>
        </span>
      </div>
      <div className={styles.meta}>
        <span className={styles.timestamps}>
          {formatDateTime(match.created_at)} → {match.ended_at ? formatDateTime(match.ended_at) : "进行中"}
        </span>
        {match.winner && <Badge tone="winner">胜者: {getAgentName(agents, match.winner)}</Badge>}
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
    </Link>
  );
}

import { Link } from "react-router-dom";
import Badge from "../Badge/Badge";
import { getAgentName, getMatchStatus } from "../../lib/format";
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
        </span>
        <span className={styles.vs}>VS</span>
        <span className={`${styles.player} ${styles.o} ${match.winner === match.player_o ? styles.winner : ""}`}>
          <span className={styles.name}>{oName}</span>
        </span>
      </div>
      <div className={styles.meta}>
        {match.winner && <Badge tone="winner">胜者: {getAgentName(agents, match.winner)}</Badge>}
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
    </Link>
  );
}

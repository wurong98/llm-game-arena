import { Link } from "react-router-dom";
import Badge from "../Badge/Badge";
import { getAgentName, getMatchStatus, getEndReason, formatDateTime, formatDuration } from "../../lib/format";
import styles from "./MatchCard.module.css";

export default function MatchCard({ match, agents }) {
  const status = getMatchStatus(match.status);
  const xName = getAgentName(agents, match.player_x);
  const oName = getAgentName(agents, match.player_o);
  const showEndReasonBadge = match.end_reason === "timeout" || match.end_reason === "illegal_moves";
  const endReason = showEndReasonBadge ? getEndReason(match.end_reason) : null;

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
      <div className={styles.timeboard}>
        <div className={styles.timeSlot}>
          <span className={styles.timeLabel}>开赛</span>
          <span className={styles.timeValue}>{formatDateTime(match.created_at)}</span>
        </div>
        <span className={styles.timeArrow}>→</span>
        <div className={styles.timeSlot}>
          <span className={styles.timeLabel}>结束</span>
          {match.ended_at ? (
            <span className={styles.timeValue}>{formatDateTime(match.ended_at)}</span>
          ) : (
            <span className={`${styles.timeValue} ${styles.timeLive}`}>
              <span className={styles.liveDot} />
              LIVE
            </span>
          )}
        </div>
      </div>

      <div className={styles.meta}>
        {match.winner === "draw" && <Badge tone="neutral">平局</Badge>}
        {match.winner && match.winner !== "draw" && (
          <Badge tone="winner">胜者: {getAgentName(agents, match.winner)}</Badge>
        )}
        {endReason && <Badge tone={endReason.tone}>{endReason.label}</Badge>}
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
    </Link>
  );
}

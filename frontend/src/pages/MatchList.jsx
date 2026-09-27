import { useEffect, useState } from "react";
import { getMatches, getAgents, createMatch } from "../api";
import { POLL_INTERVAL_MS } from "../lib/format";
import Button from "../components/Button/Button";
import MatchCard from "../components/MatchCard/MatchCard";
import styles from "./MatchList.module.css";

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
    const t = setInterval(load, POLL_INTERVAL_MS);
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

      <div className={styles.createPanel}>
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
        <Button variant="primary" onClick={handleCreate}>
          创建对局
        </Button>
      </div>

      <div className={styles.list}>
        {matches.map((m) => (
          <MatchCard key={m.match_id} match={m} agents={agents} />
        ))}
      </div>
    </div>
  );
}

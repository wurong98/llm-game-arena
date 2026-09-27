import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getMatchState, getMoveDebug } from "../api";

function Board({ board }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 60px)",
        gap: 4,
      }}
    >
      {board.map((cell, i) => (
        <div
          key={i}
          style={{
            width: 60,
            height: 60,
            border: "1px solid #333",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
          }}
        >
          {cell}
        </div>
      ))}
    </div>
  );
}

export default function MatchDetail() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [debugMap, setDebugMap] = useState({});

  useEffect(() => {
    const load = async () => {
      const s = await getMatchState(id);
      setState(s);
    };
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [id]);

  const loadDebug = async (index) => {
    const d = await getMoveDebug(id, index);
    setDebugMap((prev) => ({ ...prev, [index]: d }));
  };

  if (!state) return <div>加载中...</div>;

  return (
    <div>
      <h2>对局 {id}</h2>
      <p>
        状态: {state.status} {state.winner ? `胜者: ${state.winner}` : ""}
      </p>
      <Board board={state.board} />

      <h3 style={{ marginTop: 20 }}>落子历史 / Debug</h3>
      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>#</th>
            <th>agent</th>
            <th>mark</th>
            <th>pos</th>
            <th>合法</th>
            <th>时间</th>
            <th>debug</th>
          </tr>
        </thead>
        <tbody>
          {state.move_history.map((m) => (
            <>
              <tr key={m.move_index}>
                <td>{m.move_index}</td>
                <td>{m.agent_id}</td>
                <td>{m.mark}</td>
                <td>{m.pos}</td>
                <td>{m.valid ? "✔" : "✘"}</td>
                <td>{m.at}</td>
                <td>
                  <button onClick={() => loadDebug(m.move_index)}>查看</button>
                </td>
              </tr>
              {debugMap[m.move_index] && (
                <tr>
                  <td colSpan="7">
                    <pre style={{ whiteSpace: "pre-wrap", background: "#f5f5f5", padding: 8 }}>
                      prompt_sent: {debugMap[m.move_index].prompt_sent || "(未上报)"}
                      {"\n"}
                      raw_response: {debugMap[m.move_index].raw_response || "(未上报)"}
                      {"\n"}
                      latency_ms: {debugMap[m.move_index].latency_ms ?? "-"}
                    </pre>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

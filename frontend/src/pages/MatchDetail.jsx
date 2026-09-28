import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getMatchState, getMoveDebug } from "../api";

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const CELL = 60;
const GAP = 4;
const STEP = CELL + GAP;

function findWinLine(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return line;
    }
  }
  return null;
}

function cellCenter(i) {
  const row = Math.floor(i / 3);
  const col = i % 3;
  return { x: col * STEP + CELL / 2, y: row * STEP + CELL / 2 };
}

function Board({ board, highlightPos, winLine }) {
  const size = 3 * CELL + 2 * GAP;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(3, ${CELL}px)`,
          gap: GAP,
        }}
      >
        {board.map((cell, i) => (
          <div
            key={i}
            style={{
              width: CELL,
              height: CELL,
              border: "1px solid #333",
              background: winLine?.includes(i)
                ? "#ffd6d6"
                : i === highlightPos
                ? "#fff3cd"
                : "white",
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
      {winLine && (
        <svg
          width={size}
          height={size}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        >
          <line
            x1={cellCenter(winLine[0]).x}
            y1={cellCenter(winLine[0]).y}
            x2={cellCenter(winLine[2]).x}
            y2={cellCenter(winLine[2]).y}
            stroke="red"
            strokeWidth={5}
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

function computeBoardAtStep(moveHistory, boardLength, step) {
  const board = Array(boardLength).fill("");
  let lastPos = null;
  let applied = 0;
  for (const m of moveHistory) {
    if (applied >= step) break;
    if (m.valid && typeof m.pos === "number") {
      board[m.pos] = m.mark;
      lastPos = m.pos;
    }
    applied += 1;
  }
  return { board, lastPos };
}

export default function MatchDetail() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [debugMap, setDebugMap] = useState({});
  const [replayStep, setReplayStep] = useState(null); // null = 跟随最新
  const [live, setLive] = useState(true);

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

  const totalSteps = state?.move_history.length ?? 0;
  const currentStep = live ? totalSteps : replayStep ?? totalSteps;

  const { board: replayBoard, lastPos } = useMemo(() => {
    if (!state) return { board: [], lastPos: null };
    return computeBoardAtStep(state.move_history, state.board.length, currentStep);
  }, [state, currentStep]);

  const winLine = useMemo(() => findWinLine(replayBoard), [replayBoard]);

  if (!state) return <div>加载中...</div>;

  const goToStep = (step) => {
    setLive(false);
    setReplayStep(Math.max(0, Math.min(totalSteps, step)));
  };

  return (
    <div>
      <h2>对局 {id}</h2>
      <p>
        状态: {state.status} {state.winner ? `胜者: ${state.winner}` : ""}
      </p>

      <Board board={replayBoard} highlightPos={live ? null : lastPos} winLine={winLine} />

      <div style={{ margin: "12px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => goToStep(0)} disabled={currentStep === 0}>
          ⏮ 开局
        </button>
        <button onClick={() => goToStep(currentStep - 1)} disabled={currentStep === 0}>
          ◀ 上一步
        </button>
        <input
          type="range"
          min={0}
          max={totalSteps}
          value={currentStep}
          onChange={(e) => goToStep(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <button onClick={() => goToStep(currentStep + 1)} disabled={currentStep >= totalSteps}>
          下一步 ▶
        </button>
        <button
          onClick={() => {
            setLive(true);
            setReplayStep(null);
          }}
          disabled={live}
        >
          跳到最新 ⏭
        </button>
        <span>
          第 {currentStep} / {totalSteps} 步{live ? "(实时)" : "(回放)"}
        </span>
      </div>

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
              <tr
                key={m.move_index}
                onClick={() => goToStep(m.move_index + 1)}
                style={{
                  cursor: "pointer",
                  background: !live && currentStep === m.move_index + 1 ? "#e7f1ff" : "transparent",
                }}
              >
                <td>{m.move_index}</td>
                <td>{m.agent_id}</td>
                <td>{m.mark}</td>
                <td>{m.pos}</td>
                <td>{m.valid ? "✔" : "✘"}</td>
                <td>{m.at}</td>
                <td>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      loadDebug(m.move_index);
                    }}
                  >
                    查看
                  </button>
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

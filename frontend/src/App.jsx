import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import MatchList from "./pages/MatchList";
import MatchDetail from "./pages/MatchDetail";
import Leaderboard from "./pages/Leaderboard";
import Docs from "./pages/Docs";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
        <h1>LLM Arena</h1>
        <nav style={{ marginBottom: 20 }}>
          <Link to="/" style={{ marginRight: 12 }}>对局</Link>
          <Link to="/leaderboard" style={{ marginRight: 12 }}>排行榜</Link>
          <Link to="/docs">使用文档</Link>
        </nav>
        <Routes>
          <Route path="/" element={<MatchList />} />
          <Route path="/matches/:id" element={<MatchDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/docs" element={<Docs />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import MatchList from "./pages/MatchList";
import MatchDetail from "./pages/MatchDetail";
import Leaderboard from "./pages/Leaderboard";
import Docs from "./pages/Docs";
import Register from "./pages/Register";
import styles from "./App.module.css";

export default function App() {
  const navClass = ({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ""}`;

  return (
    <BrowserRouter>
      <div style={{ padding: 20 }}>
        <h1>LLM Arena</h1>
        <nav className={styles.nav}>
          <NavLink to="/" end className={navClass}>对局</NavLink>
          <NavLink to="/leaderboard" className={navClass}>排行榜</NavLink>
          <NavLink to="/register" className={navClass}>注册选手</NavLink>
          <NavLink to="/docs" className={navClass}>使用文档</NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<MatchList />} />
          <Route path="/matches/:id" element={<MatchDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/register" element={<Register />} />
          <Route path="/docs" element={<Docs />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

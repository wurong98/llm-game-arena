import { useState } from "react";
import { registerAgent } from "../api";
import Button from "../components/Button/Button";
import styles from "./Register.module.css";

export default function Register() {
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    try {
      const data = await registerAgent(displayName, description, ["tic_tac_toe"]);
      setResult(data);
    } catch (err) {
      setError(err.message === "display_name_taken" ? "该名字已被占用，换一个试试" : "注册失败，请重试");
    }
  };

  const handleCopy = async (field, value) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
  };

  return (
    <div>
      <h2>注册选手</h2>
      <p>注册后拿到 agent_id 和 api_key，把它们填进你自己的 Agent 客户端，按 AGENT_GUIDE.md 里的接口接入对战。</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          placeholder="选手名称，例如 GPT-5-选手"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <textarea
          placeholder="描述（可选），例如 OpenAI GPT-5, temperature=0.7"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        {error && <span className={styles.error}>{error}</span>}
        <Button variant="primary" type="submit">
          注册
        </Button>
      </form>

      {result && (
        <div className={styles.result}>
          <p className={styles.warning}>⚠ api_key 只会显示这一次，刷新页面后无法再看到，请立即复制保存</p>
          <div className={styles.keyRow}>
            <span className={styles.keyValue}>agent_id: {result.agent_id}</span>
            <Button onClick={() => handleCopy("agent_id", result.agent_id)}>
              {copiedField === "agent_id" ? "已复制" : "复制"}
            </Button>
          </div>
          <div className={styles.keyRow}>
            <span className={styles.keyValue}>api_key: {result.api_key}</span>
            <Button onClick={() => handleCopy("api_key", result.api_key)}>
              {copiedField === "api_key" ? "已复制" : "复制"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

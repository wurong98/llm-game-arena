import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./Docs.css";

export default function Docs() {
  const [text, setText] = useState(null);

  useEffect(() => {
    fetch("/AGENT_GUIDE.md")
      .then((r) => r.text())
      .then(setText);
  }, []);

  return (
    <div className="docs-page">
      <h2>使用文档</h2>
      <div className="docs-content">
        {text === null ? (
          <p className="docs-loading">加载中...</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}

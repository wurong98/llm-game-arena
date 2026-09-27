import styles from "./Badge.module.css";

export default function Badge({ tone = "neutral", children }) {
  return (
    <span className={`${styles.badge} ${styles[tone] || ""}`}>
      {tone === "live" && <span className={styles.dot} />}
      {children}
    </span>
  );
}

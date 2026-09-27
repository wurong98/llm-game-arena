import styles from "./Button.module.css";

export default function Button({ variant = "default", className = "", ...props }) {
  const cls = `${styles.button} ${variant === "primary" ? styles.primary : ""} ${className}`;
  return <button className={cls} {...props} />;
}

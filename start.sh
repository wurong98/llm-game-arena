#!/usr/bin/env bash
# 一键启动前后端(开发模式)
# 用法: ./start.sh          启动
#       ./start.sh stop     停止

set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/.run"
PID_FILE="$LOG_DIR/pids"

mkdir -p "$LOG_DIR"

stop_all() {
  if [ -f "$PID_FILE" ]; then
    while read -r pid; do
      [ -n "$pid" ] && kill "$pid" 2>/dev/null
    done < "$PID_FILE"
    rm -f "$PID_FILE"
    echo "已停止前后端服务"
  else
    echo "没有找到运行记录($PID_FILE 不存在)"
  fi
}

if [ "$1" = "stop" ]; then
  stop_all
  exit 0
fi

if [ -f "$PID_FILE" ]; then
  echo "检测到已有运行记录,先停止旧进程..."
  stop_all
fi

if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo "安装后端依赖..."
  (cd "$BACKEND_DIR" && npm install)
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "安装前端依赖..."
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "启动后端 (http://localhost:4000) ..."
(cd "$BACKEND_DIR" && nohup node src/server.js > "$LOG_DIR/backend.log" 2>&1 &)
echo $! >> "$PID_FILE"
BACKEND_PID=$(pgrep -f "node src/server.js" | tail -1)
echo "$BACKEND_PID" > "$PID_FILE"

echo "启动前端 (http://localhost:5173) ..."
(cd "$FRONTEND_DIR" && nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &)
sleep 1
FRONTEND_PID=$(pgrep -f "vite" | tail -1)
echo "$FRONTEND_PID" >> "$PID_FILE"

sleep 2
echo ""
echo "======================================"
echo "后端: http://localhost:4000"
echo "前端: 请查看 $LOG_DIR/frontend.log 中的实际端口(默认 http://localhost:5173)"
echo "日志目录: $LOG_DIR"
echo "停止服务: ./start.sh stop"
echo "======================================"

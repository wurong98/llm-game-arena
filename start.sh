#!/usr/bin/env bash
# 一键启动前后端(开发模式)
# 用法: ./start.sh          启动
#       ./start.sh stop     停止
#       ./start.sh status   查看状态

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/.run"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"

mkdir -p "$LOG_DIR"

is_running() {
  # $1 = pid file
  [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null
}

stop_one() {
  # $1 = pid file, $2 = 名称
  if [ -f "$1" ]; then
    local pid
    pid="$(cat "$1")"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      # 用负号 pid 杀掉整个进程组(setsid 启动时 pid == 进程组 id)
      kill -TERM "-$pid" 2>/dev/null
      kill -TERM "$pid" 2>/dev/null
      sleep 0.3
      kill -KILL "-$pid" 2>/dev/null
      kill -KILL "$pid" 2>/dev/null
      echo "已停止 $2 (pid $pid)"
    fi
    rm -f "$1"
  fi
}

stop_all() {
  stop_one "$BACKEND_PID_FILE" "后端"
  stop_one "$FRONTEND_PID_FILE" "前端"
}

status_all() {
  if is_running "$BACKEND_PID_FILE"; then
    echo "后端: 运行中 (pid $(cat "$BACKEND_PID_FILE"))"
  else
    echo "后端: 未运行"
  fi
  if is_running "$FRONTEND_PID_FILE"; then
    echo "前端: 运行中 (pid $(cat "$FRONTEND_PID_FILE"))"
  else
    echo "前端: 未运行"
  fi
}

case "$1" in
  stop)
    stop_all
    exit 0
    ;;
  status)
    status_all
    exit 0
    ;;
esac

# 已在运行则先停掉,避免重复启动
if is_running "$BACKEND_PID_FILE" || is_running "$FRONTEND_PID_FILE"; then
  echo "检测到已有服务在运行,先停止旧进程..."
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

echo "启动后端..."
(cd "$BACKEND_DIR" && exec setsid node src/server.js > "$LOG_DIR/backend.log" 2>&1) &
echo $! > "$BACKEND_PID_FILE"
disown

echo "启动前端..."
(cd "$FRONTEND_DIR" && exec setsid npm run dev -- --host > "$LOG_DIR/frontend.log" 2>&1) &
echo $! > "$FRONTEND_PID_FILE"
disown

sleep 2

FRONTEND_URL="$(grep -oE 'http://[0-9.]+:[0-9]+' "$LOG_DIR/frontend.log" | tail -1)"
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

echo ""
echo "======================================"
if is_running "$BACKEND_PID_FILE"; then
  echo "后端: http://${HOST_IP:-localhost}:4000  (运行中,已监听所有网卡)"
else
  echo "后端: 启动失败,请查看 $LOG_DIR/backend.log"
fi
if is_running "$FRONTEND_PID_FILE"; then
  echo "前端: ${FRONTEND_URL:-请查看 $LOG_DIR/frontend.log}  (运行中,已加 --host 监听所有网卡)"
else
  echo "前端: 启动失败,请查看 $LOG_DIR/frontend.log"
fi
echo "如需外网访问,请确认云主机安全组/防火墙已放行 4000 和前端端口"
echo "日志目录: $LOG_DIR"
echo "停止服务: ./start.sh stop"
echo "查看状态: ./start.sh status"
echo "======================================"

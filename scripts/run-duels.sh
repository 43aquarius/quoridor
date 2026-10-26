#!/bin/bash
# v4 vs v3 对决启动器（进程孤儿化，免遭会话回收）
# 用法: bash scripts/run-duels.sh <level> <n_per_dir> <tag> [额外env...]
cd /home/z/my-project/quoridor
LEVEL=$1
N=$2
TAG=$3
shift 3
LOG=/tmp/duel-${TAG}-l${LEVEL}.log
setsid nohup env "$@" DUEL_N=$N DUEL_LEVEL=$LEVEL bun run scripts/ai-duel-v3.ts > "$LOG" 2>&1 < /dev/null &
PID=$!
echo "spawned: $PID -> $LOG"
sleep 3
if kill -0 $PID 2>/dev/null; then
  echo "alive after 3s"
else
  echo "DIED - check $LOG"
  cat "$LOG" 2>/dev/null
fi

#!/bin/bash
# quoridor-relay 看护启动：崩溃自动重启
cd /home/z/my-project/mini-services/quoridor-relay
while true; do
  echo "[watchdog] starting relay $(date '+%H:%M:%S')"
  bun run index.ts >> relay.log 2>&1
  code=$?
  echo "[watchdog] relay exited code=$code $(date '+%H:%M:%S'), restarting in 1s"
  sleep 1
done

#!/bin/bash
# 生产 standalone server 启动器（:3001）
cd /home/z/my-project/quoridor
export NODE_ENV=production
export PORT=3001
export HOSTNAME=127.0.0.1
setsid nohup bun .next/standalone/server.js > /home/z/my-project/server-prod.log 2>&1 < /dev/null &
echo "spawned: $!"
sleep 5
curl -s -o /dev/null -w "prod http=%{http_code}\n" --max-time 6 http://127.0.0.1:3001/

#!/bin/bash
# 生产 standalone server 启动器（:3001，避开 dev server :3000）
# 进程在脚本退出前孤儿化（PPID→1），免遭会话回收
cd /home/z/my-project
export NODE_ENV=production
export PORT=3001
export HOSTNAME=127.0.0.1
setsid nohup bun .next/standalone/server.js > /home/z/my-project/server-prod.log 2>&1 < /dev/null &
echo "spawned: $!"
sleep 3
curl -s -o /dev/null -w "prod http=%{http_code}\n" --max-time 5 http://127.0.0.1:3001/

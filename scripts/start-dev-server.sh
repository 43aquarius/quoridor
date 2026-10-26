#!/bin/bash
# 主 dev server 启动器：脚本内后台化 + setsid，使进程在脚本退出前即孤儿化（PPID→1），
# 免遭会话结束时被回收。参照 mini-service 存活模式。
cd /home/z/my-project
export PATH="/home/z/my-project/node_modules/.bin:/usr/local/bin:/usr/bin:/bin:$PATH"
setsid nohup next dev -p 3000 > /home/z/my-project/dev.log 2>&1 < /dev/null &
echo "spawned: $!"

#!/bin/bash
# 模拟平台 FC 部署：以 start.sh 的方式启动最新构建包，验证 Next/mini-service/Caddy 全链路
# 差异化端口：Next PORT=3100（避让 dev :3000）；Caddy :8181（避让沙箱网关 :81）
# DATABASE_URL 指向包内 db（FC 中包解压于 /app，此处等价模拟）

set -x
exec 2>&1

SRC="${1:-/tmp/build_fullstack_1788948019}"
SIM=/home/z/my-project/scripts/deploy-sim

rm -rf "$SIM"
mkdir -p "$SIM"
cp -r "$SRC"/. "$SIM"/
cd "$SIM"

# 端口差异化
sed -i 's/^:81 {/:8181 {/' Caddyfile
export PORT=3100
export HOSTNAME=0.0.0.0
export DATABASE_URL="file:$SIM/db/custom.db"
export NODE_ENV=production

# 后台跑 start.sh（Caddy exec 前台，故整体后台）
sh start.sh > "$SIM/start-sim.log" 2>&1 &
STARTER_PID=$!

# 轮询探测 20s
for i in $(seq 1 20); do
  sleep 1
  HTTP_NEXT=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://127.0.0.1:3100/" 2>/dev/null)
  HTTP_CADDY=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://127.0.0.1:8181/" 2>/dev/null)
  echo "t=${i}s next=$HTTP_NEXT caddy=$HTTP_CADDY"
  if [ "$HTTP_CADDY" = "200" ]; then break; fi
done

# 探测 relay 经 Caddy 的 XTransformPort 转发（socket.io 握手轮询端点）
echo "=== relay via XTransformPort ==="
curl -s -o /dev/null -w "relay_poll=%{http_code}\n" --max-time 5 "http://127.0.0.1:8181/?XTransformPort=3004&EIO=4&transport=polling" 2>/dev/null

echo "=== start-sim.log (tail) ==="
tail -40 "$SIM/start-sim.log"

#!/bin/bash
# Quoridor(步步为营)生产部署脚本
# 由平台 start.sh 在容器启动时自动执行(sudo -u z bash)
# 职责:安装依赖 → 初始化数据库 → 按需构建 → 启动生产服务
set -e

cd /home/z/my-project/quoridor

# Prisma 引擎走国内镜像,规避 binaries.prisma.sh 不可达
export PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
export DATABASE_URL="file:/home/z/my-project/quoridor/db/custom.db"

# 1. 依赖未安装则安装并初始化数据库
if [ ! -d node_modules ] || [ ! -f node_modules/.prisma/client/index.js ]; then
  bun install
  bun run db:generate
  bun run db:push
fi

# 2. 构建产物缺失则构建(低内存环境,build 脚本已固化 RAYON_NUM_THREADS=1)
if [ ! -f .next/standalone/server.js ]; then
  bun run build
fi

# 3. 启动生产服务:Next.js :3000,在线对战 relay 随 instrumentation 自动监听 :3004
export PORT=3000
export HOSTNAME=0.0.0.0
export NODE_ENV=production
exec bun .next/standalone/server.js

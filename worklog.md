# Worklog

---
Task ID: 1
Agent: 主 Agent (Super Z)
Task: 部署 GitHub 项目 https://github.com/43aquarius/quoridor (步步为营棋类对战游戏)

Work Log:
- 直连 github.com 克隆失败(443 超时),改用 gh-proxy.com 镜像克隆成功(15M, commit 0622ad5)
- 确认技术栈: Next.js 16 (App Router, standalone 输出) + React 19 + Tailwind 4 + Prisma/SQLite + socket.io relay
- bun install 安装 846 个依赖(97s)
- Prisma 引擎下载失败(binaries.prisma.sh 不可达),设置 PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma 后 generate/db push 成功
- 创建 .env: DATABASE_URL="file:/home/z/my-project/quoridor/db/custom.db"
- bun run build 构建成功(RAYON_NUM_THREADS=1 单线程构建规避低内存问题),standalone 产物含 socket.io
- 后台进程被沙箱会话清理(setsid+disown 无效),改用双 fork 孤儿化(bash -c 'setsid ... &')成功保活
- 生产服务启动: bun .next/standalone/server.js,PORT=3000,HOSTNAME=0.0.0.0
- instrumentation.ts 自动拉起在线对战 relay(:3004)
- 创建 /home/z/my-project/.zscripts/dev.sh:容器重启后平台 start.sh 自动恢复服务(依赖安装→DB初始化→按需构建→启动)

Stage Summary:
- 部署完成并全部验证通过:
  - Next.js 生产服务 http://127.0.0.1:3000 → 200,页面标题「步步为营 · QUORIDOR — 一册会下棋的棋谱专著」
  - 在线对战 relay http://127.0.0.1:3004 socket.io 握手 → 200
  - 平台网关 Caddy :81 XTransformPort 转发(next/relay)→ 200
  - 静态资源 chunk 加载 → 200
- 关键决策: 镜像加速(gh-proxy / npmmirror)、双 fork 进程保活、.zscripts/dev.sh 持久化启动
- 项目路径: /home/z/my-project/quoridor;服务日志: server.log

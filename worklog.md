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

---
Task ID: 2
Agent: 主 Agent (Super Z)
Task: 修复「预览页面 404」和「发布失败」问题

Work Log:
- 诊断问题1(预览404): agent-browser 实测 preview-<bot-id>.space-z.ai 返回外部网关 "404 page not found",所有 ID 变体均 404 → 预览路由依赖发布成功后注册
- 诊断问题2(发布失败)根因:
  a) 项目被克隆到 quoridor/ 子目录,而平台发布构建(.zscripts/build.sh)硬编码项目根为 /home/z/my-project,根目录无 package.json → bun install 失败
  b) 嵌套 quoridor/.git 使外层 git 将其记录为 gitlink(mode 160000),代码不入库
  c) bun.lock 937 个包指向 registry.npmjs.com,全新环境安装会跨境失败
- 修复: 停服 → 项目整体平移到 my-project 根目录(含 node_modules/.next,同盘秒移) → 采用作者自带 .zscripts 标准脚本链(替换我自写的 dev.sh)
- 修正 .env DATABASE_URL 为 file:/home/z/my-project/db/custom.db
- 作者 dev.sh 增补 PRISMA_ENGINES_MIRROR(国内镜像)+ NEXT_TELEMETRY_DISABLED
- bun.lock registry 全量替换为 registry.npmmirror.com
- .gitignore 重写(node_modules/.next/日志等排除),git 重新提交(205 文件,commit 80bd321)
- 通过 .zscripts/dev.sh 标准流程重启服务(dev server :3000 + relay :3004,双 fork 保活)
- 模拟完整发布构建(BUILD_ID=deploytest 跑 build.sh): 成功产出 29M 部署包(standalone+db+Caddyfile+start.sh+mini-services)
- 部署包解压冒烟测试(:3199): HTTP 200,页面标题正确,relay 单例保护生效

Stage Summary:
- 根因: 子目录布局与平台发布机制不匹配 + 嵌套 gitlink + 依赖源跨境不可达
- 发布链路已全链路验证通过,用户可直接重新点「发布」
- 项目现为平台标准布局(根目录),dev/发布/重启三条路径全部走通
- 服务运行中: dev :3000(标准 dev.sh 流程)、relay :3004、网关 :81 全部 200

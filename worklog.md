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

---
Task ID: 3
Agent: 主 Agent (Super Z)
Task: 彻底修复联机问题 + 联机服务器地址改为 https://d1n1c9rzwhe0-d.space.zhipuaidemo.cn

Work Log:
- 诊断:实测目标 relay 发现「房间不存在」高发。多轮实验证实:发布环境网关对每连接/每请求随机分流到 ≥10 个实例,relay 内存房间状态互相隔离(探测 0/6 可见,狩猎平均 10.5 次命中);轮询传输 POST 体经网关丢失(GET 建的会话 POST 到别的实例),唯 WebSocket 持久连接可钉住实例
- client.ts 全重写:WebSocket 单传输 + forceNew;实例狩猎(join/resume 遇「房间不存在」换连接重试,先试活动连接+大厅探针池,再并行批量探针,命中晋升);门面 Socket(稳定事件面,底层连接更换 UI 无感知,once/off 语义兼容);大厅 6 探针池合并;公开房跨实例广告轮播(每 15s 9 连接,5 分钟上限,开局即停)
- relay-server.ts:lobby-advertise/unadvertise 事件(广告 TTL 60s,真实房优先);RELAY_PORT 环境变量;发现并修复畸形 ack 参数打崩实例漏洞(cb?.() 对非空对象照样调用)——reply() 安全包装全部 24 处
- .env 增 NEXT_PUBLIC_RELAY_URL=https://d1n1c9rzwhe0-d.space.zhipuaidemo.cn
- 验证:本地 3 实例协议测试 7/7(广告跨实例可见/狩猎/撤广告);真实远程 E2E(浏览器双会话):建房→凭码狩猎入座→双向走子实时同步→刷新回座狩猎→大厅陈列与入座按钮→最终冒烟(含广告对旧服务器的兼容)
- 生产构建通过;git 提交 aac8fb6

Stage Summary:
- 联机全链路修复完成,预览版已可用(客户端狩猎对旧版服务端完全兼容)
- 大厅广告与 ack 加固需重新发布后才能在正式环境生效
- 用户下一步:重新点「发布」,新代码(客户端+服务端)部署到 d1n1c9rzwhe0-d.space.zhipuaidemo.cn 后全部生效
- 若未来更换发布域名,改 .env 的 NEXT_PUBLIC_RELAY_URL 并重新构建即可

---
Task ID: 4
Agent: 主 Agent (Super Z)
Task: 结算画面印章按观屏者视角显示——败方不再盖「胜」，改盖同款样式「败」章

Work Log:
- 定位:结算印章只在 VictoryOverlay.tsx 一处(stamp-slam 大字+印章框);海报 poster.ts 的「甲 胜」为客观战绩记录,不改
- 新增观屏者视角判定 iWon:
  - 单人对 AI → 看 playerSeat(我执哪席)
  - 在线对战(双人/四人房同理) → 看 online.myPlayer
  - 本地四人围坐(同屏) → 赢家是 AI 席(真人均败)盖「败」,赢家是真人席盖「胜」
  - 本地双人同屏(一屏共赏) → 恒以胜者作章,保持原行为
- 印章字符 {iWon ? "胜" : "败"},字体/尺寸/颜色/阴影(胜者色)/盖章动画/印章框全部不变;globals.css 注释同步更新
- tsc --noEmit:src/ 零错误(scripts/、skills/ 为存量无关报错)
- 浏览器 E2E 四场景全过:
  1) 单人对AI·我认输 → 「败」章+学徒(乙)副题,样式与原胜章一致
  2) 同屏双人·乙认输 → 「胜」章(红阴影),无回归
  3) 在线对战双会话实测:房 3289,B 入座即开局,B 认输 → B 端「败」/ A 端「胜」,同副题同样式
- 截图存证 download/结算-{胜方视角-同屏双人|败方视角-单人对AI认输|胜方视角-在线对战|败方视角-在线对战}.png
- git 提交 191e6e6

Stage Summary:
- 结算印章已按观屏者视角分流,在线对战两端一胜一败各得其所;样式零改动
- dev 预览(:3000)已热更新生效;正式域名需随上一轮联机修复一并重新「发布」后生效

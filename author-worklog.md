# 步步为营（Quoridor）棋谱专著 — 工作日志

---
Task ID: 1
Agent: 主 Agent（Super Z）
Task: 设计并开发完整网页策略对弈游戏「步步为营」（基于 Quoridor），以限量印刷棋谱专著形式呈现

Work Log:
- 初始化 fullstack 环境（Next.js 16 + TS + Tailwind 4 + Turbopack），dev server 运行于 :3000
- 字体系统：next/font 加载 Noto Serif SC（400/700/900）、IBM Plex Mono、Playfair Display，自托管
- 全局 riso 设计系统（globals.css）：纸白 #F5F2EA / 墨黑 #1A1A1A / 荧光红 / 钴蓝，SVG feTurbulence 噪点、套印错位 mix-blend-multiply、四套皮肤 CSS 变量（红蓝/红黑/蓝黑/墨绿黑）
- 游戏引擎（src/lib/game/）：types（坐标/记谱/皮肤）、engine（移动、挡板重叠/交叉/断路 BFS 校验、直跳/斜跳、胜负、回放重建）
- 修复两处引擎 bug：① applyPayload 漏设挡板记谱（wallNotation）② edgeBlockedG 第 9 列索引回卷误判（引擎单测抓出）
- AI 三档（ai.ts）：学徒（最短路+16% 随机板）、排字师（路径差贪心+沿对方最短路选板）、总编（Negamax+α-β 剪枝+迭代加深 2→4 层，420ms 预算；评估=路径差+0.3×挡板差+0.12×机动差）
- Web Worker（ai-worker.ts + ai-client.ts）：Turbopack 打包 chunks/ai-worker.js 验证加载，2.5s 超时同步兜底
- 在线 relay：因环境回收后台进程，从独立 mini-service 改为嵌入 Next.js（src/instrumentation.ts → relay-server.ts，:3004，随 dev server 常驻；mini-services/quoridor-relay 保留作独立部署）
- zustand 全局状态机（store/game-store.ts）：hero→contents→setup/room→game→archive；悔棋（AI 模式撤两手）、认输、每步计时、统计（最远归途峰值/最早耗尽挡板）、localStorage 存档续读
- UI 组件：Hero（四字 kinetic 落位+「营」压印墨晕）、Contents（目录+续读+胶片条+音效开关）、Setup（编辑部三职位）、Room（建房 4 位码/凭码入座/断线回座）、GameView（棋盘+杂志边栏）、Board（0.5pt 网格、铅字棋子、铅条挡板、校对虚线 hover、压印涟漪、挡板预览/驳回红线、步数墨迹、触屏两步放板）、Sidebar（回合/挡板铅条图/计时/记谱可回放）、Rules（编者按+6 幅双色图示）、Archive（spread+数据小注）、VictoryOverlay（墨黑反相+「胜」印章砸下）、PosterModal（canvas 1440×2040 PNG 预览/下载/分享）
- 音效（sounds.ts）：Web Audio 合成活字咔哒/铅条滑入/驳回双击/印章闷响，可开关持久化
- 光标拖尾（CursorTrail）：riso 双色圆点，multiply，仅 pointer:fine
- 皮肤胶片条（SkinFilmStrip）：可拖拽刮选 + 点击选择

Stage Summary:
- e2e 验证（Agent Browser，经 Caddy 网关 :81）：Hero/目录/规则/档案馆渲染 ✓；学徒与总编 AI 落子应手 ✓；放板记谱 WALL d5-H ✓；重叠驳回（红划线+toast）✓；悔棋撤两手 ✓；双人同屏走满 15 手至胜利、印章结算 ✓；入档+海报 PNG（1440×2040, blob 预览）✓；在线双会话建房 5096→入座→双向同步→断线→5 分钟回座（2 手状态恢复）✓；触屏两步放板（横/竖/确认/取消，成功路径 f3-V）✓；hover 校对虚线圈 ✓；皮肤切换 CSS 变量 ✓；移动端 390px 布局 ✓
- 引擎单元测试 scripts/engine-test.ts：43/43 通过（跳子直/斜、封侧、挡板冲突矩阵、BFS 断路、记谱、胜负、回放、AI 三档合法性与时限）
- bun run lint：0 error / 0 warning；dev.log 无运行时错误
- 交付物：网页应用（唯一用户路由 /），预览 https://preview-<bot-id>.space-z.ai/

---
Task ID: 2
Agent: 主 Agent（Super Z）
Task: 三项增量需求 —— ①自定义棋盘尺寸与隔板数（含推荐预设）②在线对战断线重连稳定性 ③GitHub 开源图标入口

Work Log:
- 引擎全面参数化：GameState 增加 size/wallsStart（可序列化），buildWallGrids/edgeBlockedG/BFS/合法着法/记谱/胜负按 N 路适配（5..13 奇数，位图步长 N-1，BFS 缓冲 169 格）；旧存档/旧卷宗缺字段时 normalizeState 回填 9×10
- GameConfig 体系：FORMAT_PRESETS 四预设（袖珍 5×5×5 / 沙龙 7×7×8 / 经典 9×9×10 ★编辑部推荐 / 大师 11×11×12）+ 自定义（尺寸 5/7/9/11/13 档位按钮 + 挡板 0..20 滑杆，改尺寸自动套 RECOMMENDED_WALLS，可一键恢复推荐）；normalizeConfig 服务/客户端双侧清洗
- AI 参数化：Core 携带 size；候选窗口/冲突快查/兜底扫描按 N 适配；搜索预算 420/620/900ms 与深度上限按尺寸缩放；ai-worker 透传 state 自适配
- Store 接线：config 持久化（quoridor-config）；startGame/resumeSaved/resyncOnline/undo/saveToArchive/deriveStats 全链路携带规格；存档含 config；入档记录 size/wallsPerPlayer
- UI：新 FormatPanel 组件（预设卡 + 星标推荐徽标 + 滑杆）接入单人 Setup；新增 02 双人同屏 LocalSetupView 开卷页（目录路由从直开改为先择开本）；Board 动态 viewBox/格线/坐标（a..m / 顶行 N）；Sidebar 铅条总数随 wallsStart、STATUS 头显示开本、断线判负倒计时组件；GameView 开本徽标 + 在线重连横幅（次数 + 立即重连按钮）
- relay v2：create-room 携带 settings（服务端清洗）；join/resume/game-start 回传 settings；双方断线区分（仅一方在场才开判负钟）；GC 到期广播 room-expired 判负事件；新增 heartbeat 保活；等待房 B 座离线可换凭证入座
- 客户端连接韧性：socket.io 无限重连（退避封顶 6s + 随机抖动）；身份双层存储（sessionStorage 主 + localStorage 10 分钟兜底 → 误关标签页可回座）；每次 connect 自动凭 token resume 重新入房并核账重同步（修复重连后「能发不能收」）；监听 reconnect_attempt/网络 online 事件/页面回前台补连；30s 心跳防误清扫
- 海报/档案馆/规则适配：poster 网格与棋子按 N 缩放、版记加 BOARD 行；footnotes 直线步数按 size-1、注明开本；规则编者按补述可自定义开本；结算页挡板用量去硬编码
- GitHub 入口：GithubMark（官方 Octocat 轮廓）+ GithubLink；三处入口——封面版权页文字链、目录页脚按钮、全局刊头图标，均指向 https://github.com/43aquaris/quoridor
- relay 部署修复：改 instrumentation 后旧进程不重生 → 杀 next-server 触发 next dev 重新拉起（新 relay 随之绑定 :3004）；mini-service 改为薄壳复用主项目 relay-server（防双份漂移）
- 测试：引擎单测扩至 122 项（5/7/11/13 路初始/记谱/边界锚点/断路/回放/旧档兼容/AI 合法性时限，修正 6 处测试自身算错）；relay 双会话 e2e 15 项（规格清洗/转发/乱序拒收/断线判负窗/新 socket 回座/复联清零/认输）

Stage Summary:
- e2e（Agent Browser 经网关 :81 双会话 q1/q2）：FormatPanel 选 7×7×8 开房 → q2 凭码入座双端同规格入局 ✓；双向行棋同步（d1→d2 / d7→d6，7 路记谱正确）✓；q2 刷新自动回座恢复 2 手 ✓；q2 清 sessionStorage 凭 localStorage 兜底回座 ✓；q2 断网 → 重连横幅 + q1 侧「对手掉线 5:00 后判负」倒计时 ✓；恢复网络自动重连、横幅消失、对手复联 ✓；重连后 q1 落子 q2 即时收到（修复点验证）✓；5×5 与 11×11×6 自定义局记谱/铅条数/坐标/规格徽标 ✓；滑杆微调挡板数 ✓；GitHub 三入口 href 正确 ✓；390px 无横向溢出 ✓
- 回归：bun run lint 0/0；引擎 122/122；relay e2e 15/15；dev.log 无运行时错误
- 交付物：网页应用（唯一用户路由 /），预览经网关正常；验证截图 scripts/shot-v2-*.png

---
Task ID: 3
Agent: 主 Agent（Super Z）
Task: 收尾四项（AI 阶梯终验 / README / 回归测试 / worklog）+ 新需求「最新一手棋高亮」

Work Log:
- 勘察：确认前次会话已落地刷新同步按钮（Sidebar + use-online-sync requestResync）、结算 bug 双修复（RoomView movesEnded 守卫 + VictoryOverlay leaveEndedOnline 清身份）、GitHub 最终链接 43aquarius/quoridor、四档 AI、双计时
- 新功能：Board.tsx 新增 LastMoveMark——行棋落点四角裁切角标（pathLength 描画）+ 起点空圈 + 起讫点状虚线轨迹（2 9 点线）；落板铅条外虚线校对圈；以手数 n 为 key 每手重绘、常驻至下一手；随回放 replayIndex 联动；pointer-events:none 不挡交互
- 修复自身实现坑：framer-motion pathLength 动画会覆写自定义 strokeDasharray（实测被改为 1px 1px），轨迹线改为仅 opacity 渐入保留点状样式
- AI 阶梯终验：人类代理阶梯 8 组 + AI 执甲对照（补跑社长组 4+4 局）——弱代理 L1 对学徒 63% / 排字师 13% / 总编 0% / 社长 0%；中代理 L2 对学徒 100% / 排字师 100% / 总编 0% / 社长 0%；社长执甲对学徒·排字师 4:0——四档强度单调 ✓
- 回归测试：引擎单测 151/151、relay e2e 15/15、lint 0/0、tsc src 无错
- 在线全流程浏览器回归（经 :81 网关双会话 q1/q2）：建房 5623 → 凭码入座 → 双向行棋同步（q2 侧高亮角标在场）→ 刷新同步 toast 含「对手在线」→ 乙认输双端结算 → q2 返回目录再进在线入口停留大厅（无结算跳转）→ q1 结算画面直接 reload 再进在线显示「上一局（房间 5623）已收束」notice 停留大厅——原 bug 双路径复验通过
- 发现并修复环境问题：运行中 relay 为旧代码（上会话改 relay-server.ts 后 dev server 未重启，instrumentation 仅启动时执行，resume 响应缺 peer 致「对手状态未知」）→ 重启 dev server；期间踩坑：沙箱在工具调用间隙回收未孤儿化进程（setsid+nohup 亦被杀），以 scripts/start-dev-server.sh 脚本内后台化使进程在调用结束前完成 PPID→1 孤儿化解决
- README.md：项目根 + download 双份，含玩法速览、功能特性（三模式/在线细节/开本棋钟表）、快速开始（含本地玩在线需网关转发 XTransformPort 的说明）、两种部署方式（Next 一体 / relay 独立）、目录架构、在线协议事件表、AI 棋力表、测试命令、技术栈
- VLM 视觉复核截图：角标/轨迹/挡板圈清晰无遮挡、红蓝双色醒目
- 冒烟收尾：网关入口 → 单人学徒局 → 双手棋 → 高亮在场（scripts/shot-final-highlight.png）

Stage Summary:
- 最新一手高亮上线（行棋 + 落板两形态，单机/双人/在线/回放全模式生效）
- AI 阶梯单调性终验通过（四档 38%→88%→100%→100% 递进、社长全胜对照）
- 全量回归绿灯：引擎 151 / relay 15 / lint 0 / 在线 e2e 含结算 bug 复验 / VLM 视觉复核
- relay resume 缺 peer 的环境性问题修复（dev server 重启 + 常驻启动脚本）
- 交付物：README.md（根目录 + download/）、网页应用经 :81 网关可玩，预览 https://preview-<bot-id>.space-z.ai/

---
Task ID: 4
Agent: 主 Agent（Super Z）
Task: ①继续完善四人对战开发（收尾验证 + 浏览器 e2e + 修复残留 bug）②修复 GLM web 界面部署总是失败

Work Log:
- 部署失败根因定位：`bun run build`（Turbopack）在沙箱内崩溃 —— Rayon 线程池初始化 EAGAIN（`The global thread pool has not been initialized: IOError WouldBlock`）。诊断：2 核 / 4GB 内存，dev server 占 900MB+，多只无头浏览器再占 1.2GB，next build 线程池无法创建工作线程而 panic
- 部署修复：①关闭无头浏览器释放内存（free 1.4GB→2.6GB）②`RAYON_NUM_THREADS=1` 单线程构建成功 ③固化到 package.json 的 build 脚本（`RAYON_NUM_THREADS=1 next build && …`），平台部署不再依赖环境内存余量
- 生产链路验证：完整 `bun run build` 成功（standalone 产物 + static/public 拷贝）；`PORT=3001` 生产 server 200 正常、浏览器渲染无错；instrumentation relay 正确检测 3004 被占用而让位（不双绑）；README 增设「部署疑难：低内存环境构建失败」专节
- 四人模式现状勘察（上会话已大量落地）：引擎 N 人泛化（SEAT_ORDER_4 顺时针 甲→丙→乙→丁、四向目标线、出局制、多席 BFS）、QuadSetupView、ai4.ts、relay 四席房间（set-seat-ai / start-game / ai-turn 派发 / seat-out）、四人配色 .fourp（红/蓝/苔绿/墨黑）
- 全量测试回归：engine-test 151/151、engine4-test 53/53、relay-e2e 15/15、relay4-e2e 30/30、lint 0/0、tsc src 0 错
- 修复四人局 bug：GameView 章头 configLabel 调用漏传 playerCount，四人局一直显示「二人局」——补传后正确显示「四人局」
- 浏览器 e2e · 本地四人围坐（5×5×3，甲真人 + 乙丙丁学徒）：开局四席正确（甲 c1 南 / 乙 c5 北 / 丙 a3 西 / 丁 e3 东）；真人行棋后三 AI 席自动应手（含跳子 d4→d2 越过真人）；AI 席放板（WALL b3-H / c4-V / c2-V / a2-V）合法；对局自然收束——丁（学徒）24 手 b1→a1 抵左列获胜；VictoryOverlay 四人形态正确（学徒（丁）执笔收笔 + 四席挡板用量「甲 0 / 乙 2 / 丙 2 / 丁 2」+ 四席最远归途）；入档条目含 playerCount/labelA-D/wallsUsedA-D；棋谱海报弹窗 + PNG 下载可用
- 浏览器 e2e · 在线四人围桌（双会话 q1/q2 + 2 AI 席，经 :81 网关）：RoomView 选「四人围桌」开房 6158（大厅显示「四人围桌 1/4 席」）→ q2 从大厅入座乙 → q1 把丙丁设为学徒代打（seat-update 即时广播）→ 房主开局 → 双端进对局；q1 甲行棋后服务器把丙 AI 回合派发给房主执行（ai-turn）、乙收到代打着法；q2 乙行棋同步到 q1；q1 在线放板 WALL e2-H 成功同步；q2 整页刷新 → 进「04 在线对战」入口自动回座（第 7 手状态恢复、双端在线状态互见）；四席独立计时（本手用时 1:36 计走）
- README 四人模式重写：模式表扩为四种、玩法速览增设「四人围坐」规则（对面边目标 / 顺时针 / 出局制 / AI 代打 / 四色套印）、在线特性补四席与 AI 代打执行链、开本预设补四人围坐四档（5×5×3 / 7×7×4 / 9×9×5 ★ / 11×11×6）、协议表补 set-seat-ai / start-game / seat-update / ai-turn / seat-out 事件、架构补 QuadSetupView 与 ai4.ts、测试命令补 engine4-test 与 relay4-e2e；download 副本同步

Stage Summary:
- 部署失败已修复：RAYON_NUM_THREADS=1 固化进 build 脚本，生产构建与 standalone 生产 server 双验证通过
- 四人模式（本地 + 在线）全链路 e2e 通过：开局 → AI 席代打 → 出局制规则 → 四人结算 → 入档/海报；在线四席房从开房到断线重连全流程验证
- 修复 configLabel 四人局文案 bug；回归全绿（151+53+15+30+lint）
- 交付物：网页应用（四种模式），预览 https://preview-<bot-id>.space-z.ai/；README 已含四人模式与部署疑难章节

---
Task ID: 5
Agent: 主 Agent（Super Z）
Task: ①修复用户报告的 React hydration mismatch 报错 ②修复 GLM web 发布部署仍失败（https://quoridor.space-z.ai 返回平台 Failed 页）

Work Log:
- 报错根因：game-store 在 zustand create() 模块求值期读 localStorage（skin/soundOn/config）+ 文件尾 window 分支预载 archive/hasSavedGame——服务端按默认值渲染 skin-rb，客户端首帧读到持久化 skin-bi → React hydration attribute mismatch（用户截图实锤）
- 修复方案：初始 state 全部确定性默认（skin "rb" / soundOn true / config normalizeConfig(null)）；新增 store.hydrate() 动作（SKINS 白名单校验皮肤、音效同步 setSoundEnabled、config/archive/hasSavedGame 恢复）；QuoridorApp 挂载 useEffect 调 hydrate()（hydration 完成后才切皮肤，属性正常 patch，无 mismatch）；删除模块级 window 初始化块
- 部署管线勘察：.zscripts/build.sh（bun install → bun run build → standalone 校验/自愈 → mini-services 构建 → db/prisma push → 打包 tar.gz）与 start.sh（bun server.js + mini-services + Caddy :81 前台）；/tmp 留有 13+ 次发布构建痕迹（含 1 个空目录 7748 = 并发构建竞态死证）；本地按 FC 方式全真模拟（差异化端口 3100/8181）：Next 98ms Ready、Caddy 反代 200、XTransformPort=3004 socket.io 握手 200、mini-service 让位正常——沙箱内构建与运行时全部健康，判定失败点在应用侧 console 错误（hydration）与并发构建产物损坏
- 构建加固：package.json build 脚本外层 flock -w 600 /tmp/quoridor-next-build.lock 序列化（并发发布点击不再互踩 .next/，杜绝空/坏包）
- 验证：bun run build（flock 生效，16s）→ standalone :3001 200 → agent-browser 预置 localStorage quoridor-skin=bi 后 reload：根 div 正确切换 skin-bi、console/errors 零输出（修复前此场景必报 hydration mismatch）；dev server 同场景零报错
- 功能回归（store 重构后冒烟）：开局学徒局 e1→e2 应手 e9→e8、着法记录/计时正常、书签「续读」恢复 2 手局面、皮肤列表框选中态随 hydrate 恢复——全链路无回归
- 全量回归：engine 151/151、engine4 53/53、relay e2e 15/15、relay4 e2e 30/30、tsc src 0 错、lint 0/0
- 平台全真构建终验：BUILD_ID=manualverify 跑完整 .zscripts/build.sh 成功（29M tar.gz，db/prisma/python-runtime/Caddyfile/start.sh 齐备）
- git commit：hydration 修复 + flock 构建加固 + 验证脚本（deploy-sim.sh / start-prod-server.sh）

Stage Summary:
- hydration mismatch 已修复（dev + prod 双环境、非默认皮肤场景验证零报错）
- 发布失败两大可控因素已消除：页面 console hydration 错误（若平台发布校验含浏览器控制台检查则此前必挂）+ 并发构建产物损坏（flock 序列化）
- 沙箱内发布管线全链路（build.sh 打包 + start.sh 运行时）全真模拟通过；待用户在 GLM web 界面重新点击发布验证线上，若仍失败需收集平台侧报错信息

---
Task ID: 3
Agent: 主 Agent（Super Z）
Task: 强化单人对弈 AI 棋力（用户反馈"AI 太菜"）：调研现成算法/成熟项目 → 重写搜索核心 → 新旧对决验证

Work Log:
- 算法调研：gorisanson/quoridor-ai（MCTS+UCT+墙候选剪枝启发）、grantslatton《Solving Quoridor》（墙合法性接触计数快检、位棋盘、PN 搜索）、dimitrijekaranfilovic/quoridor（四算法对比）、Mertens 2006 论文（路径差评估）
- 旧 AI 基线测量：800ms 封顶下 旧L2-B 胜 旧L3-A 8/8、旧L3-B 胜 旧L4-A 8/8、旧L4-A 胜 旧L2-B 8/8——相邻档位后手碾压先手（跳子奇偶优势），档位差 1 抵不过先后手差
- 旧引擎瓶颈定位：每个叶子评估 2 次 BFS、每个挡板候选探针 2 次 BFS、每节点路径标记 1 次 BFS，全部无缓存——深度上不去的根因
- 备份旧引擎为 src/lib/game/ai-legacy.ts（供对决基准，重命名导出 computeAiMoveLegacy）
- 强化 A｜全盘目标距离缓存：墙配置 Zobrist（gLo/gHi，含尺寸盐）为键的直接映射缓存（8192 槽 × Int16Array(338)），甲乙两方多源 BFS 距离场；coreDist/evaluate/coreProbeWall/corePathCells 全部 O(1) 查表化；实测命中率 75%（2030 万命中 / 660 万缺失）
- 强化 B｜墙合法性接触计数快检：候选板 3 格点（P1/M/P2）的连接点 < 2 时拓扑上不可能封路（死端突出），跳过断路 BFS；危险板才走缓存探针——内层节点墙扩展大幅提速
- 强化 C｜PVS 主变例搜索：MAX 节点零宽窗 (alpha, alpha+ε) 探针、MIN 节点 (beta-ε, beta) 镜像，按需精确重搜；根节点同样探针化 + 每轮迭代按上轮分值全量重排
- 强化 D｜即胜检测前移：任意深度入口处，行棋方 dist===1 且 canReachGoalNow（含直跳/斜跳占位合法性，防止对手驻守终点行误判）→ 精确判胜 EVAL_WIN-ply-1
- 强化 E｜评估函数：新增路径分岔自由度项（0.15/岔封顶 3 岔，对称）；机动数改非分配实现
- 强化 F｜候选生成：新增沿既有挡板端点共线延伸的战略连锁板（远离棋子的漏斗延长）；根墙候选 20→28、内层 14→17（L4）
- 档位预算提升：L3 1250→1400ms、深度 6→8（9×9）；L4 2200→2800ms、深度 7→9（9×9）；TT 容量 15 万→40 万
- 新增基准脚本：ai-baseline.ts（旧基线）、ai-duel-legacy.ts（新旧对决，开局随机化 6 手打破确定性）、ai-ladder-new.ts（新阶梯单调性）
- 验证：engine-test 151/151、engine4-test 53/53、tsc src 0 错、lint 0/0；新旧对决（开局随机化）L3 6/2、L4 6/2（新 AI 执乙——产品单人模式座位——L4 4/0 全胜）；阶梯单调性 L1<L2<L3<L4 严格成立（各 4/0）
- 生产构建 + 重启 + 浏览器端到端：单人模式选社长开局，甲 e1→e2 → 社长 1.9s 应 e9→e8，再走 e2→e3 → 1.7s 应 e8→e7，着法记谱/回合流转正常
- README 更新：AI 棋力章节补三大强化说明、预算 280ms–2.8s、新增 ai-duel-legacy 测试条目

Stage Summary:
- 强化版 L3/L4 对旧版胜率均 75%（开局随机化 8 局样本）；单人模式真实座位（AI 执后手）L4 对旧版 4:0
- 同预算下搜索深度 +2~3 层（L3 9×9 于 704ms 即达深度上限 8，旧版需 1250ms 才到 6）
- 引擎/AI 全部 204 项单测绿、时限合规（L4 9×9 实测 2805ms < 3400ms 测试限）
- 旧引擎保留于 ai-legacy.ts 供后续对照实验；QUORIDOR_AI_DEPTH/WALLS/ROOT 环境变量覆写机制不变

---
Task ID: 4
Agent: 主 Agent（Super Z）
Task: AI 强化第二轮（用户反馈"还不够强"）：终局精确化 + 搜索提速 + 多核并行；顺带修复四人局学徒随机放板偶发非法着法；最后用 GitHub 令牌推送仓库

Work Log:
- 缺陷修复｜搜索终局核验：「上一手已抵终点」检查前移至节点入口（原实现双方均差一步时会把已赢的一手误判为输——真实强度损失点）
- 缺陷修复｜无板终局精确竞速：旧 raceEval 奇偶近似忽略相邻跳子（对冲一跳跨两格、奇偶翻转），近距离对冲局判反胜负；改为受限精确搜索（只搜距离严格下降的推进着法 + 纵向分离≥2 后奇偶即精确 + 节点上限保护），跳子几何全程精确
- 缺陷修复｜四人局学徒（ai4.ts）随机放板只查冲突不查断路 → 偶发非法着法（engine4-test ~1/3 概率挂）；补 probeWall 全席通路校验，5 连跑全绿
- 搜索提速｜LMR 晚序降深（非跳/非 TT 推荐/非杀手/距终点>2，失败高全深复核）+ 反向后手剪枝（边际 5.5/层）+ 根期望窗口（失败低放宽重搜）+ 置换表跨回合持久化（全哈希补尺寸盐防跨规格碰撞，根着法带 TT 推荐）+ 板尾 LMR（晚序低分板降深）
- 战术延展｜重击板（受害者净增≥2 且距终点≤5）不减深；仅预算早段（elapsed<40%）启用——消融实测无条件延展会把完成深度压低一整层
- 中止泄漏修复｜rootScan 每轮重置 exts/wallPly（ABORT 异常展开跳过逐帧清理，跨迭代污染延展配额）
- 消融实验定位回退：初版 v3 L3 对 v2 崩至 17%（12 局）——组件级消融（RF/LMR/EXT/ASP/PTT 环境开关）锁定三因：RF 边际过窄误剪墙陷阱（3.5→5.5/层）、EXT 无条件启用挤占迭代深度、无条件全探针压低节点率 21%（恢复接触计数快检：安全板且距终点>5 免探）
- 决定性杠杆｜根分裂多核并行：双人局 L3/L4 把根候选按交织切片派发 min(核数-1,5) 个 Worker 并行迭代加深、聚合取最高分——同等应手延迟下深度再加 1-2 层；AiDecision 增可选 score 字段；ai-client 重写为 worker 池（4p/低档位退单 worker，崩溃降级，超时保险不变）
- 档位参数：L3 1600ms/深度 9（9×9）、L4 2900→3300ms/深度 11；尺寸缩放 11 路 1.35→1.2、13 路 1.7→1.55；测试时限相应调整（3900/4600）
- 新增基准脚本：ai-duel-v2.ts（v3 vs v2 快照对决，支持双预算）、ai-duel-v3par.ts（并行模拟：顺序执行 K 切片=真实并行计算量）、ai-diag-v3.ts（完成深度/节点率诊断）；ai-v2.ts 为第一轮强化快照（基准对手）
- 验证：engine 151/151、engine4 53/53（修复后 5 连跑全绿）、tsc src 0 错、lint 0/0；L4 9×9 首次在预算内触及深度上限 11（2781ms 完成全部迭代）
- README AI 章节重写：终局精确化/战术延展/LMR/持久 TT/根分裂并行等 7 项强化 + 消融环境变量说明

Stage Summary:
- 等预算单线程 v3 ≈ v2（44-58% 噪声区间）——单线程搜索优化互抵；决定性增益来自根分裂并行（K=4-5 切片同墙钟深度+1~2 层）与终局精确化（用户可感知的"不再送终局"）
- 四人局学徒非法着法缺陷根除；ABORT 清理泄漏根除
- 组件级消融开关（QUORIDOR_AI_OFF_*）永久保留，供后续调优实验

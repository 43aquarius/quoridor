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

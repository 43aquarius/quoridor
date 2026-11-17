# 步步为营（Quoridor）— 快手 Yoola 互动作品

## 项目信息

- **作品项目名**：步步为营
- **内容类型**：棋类策略对弈（Quoridor 挡板棋）
- **横竖屏**：竖屏（`package/game.json` 的 `deviceOrientation: "portrait"`）
- **项目目录**：`/home/z/my-project/quoridor-yoola`
- **来源**：移植自同工作区的 Web 版《步步为营》（`src/lib/game/`，Next.js 工程）；因平台禁止联网，本作品仅保留单机玩法，不含在线对战。

## 核心玩法

- 9×9 棋盘（另有 5×5 袖珍 / 7×7 沙龙版式），二人对弈，每方 10 根挡板。
- 每回合二选一：移动己方棋子一格（可直跳/斜跳越过对方棋子），或在格线上放置一根 2 格长挡板。
- 挡板不可重叠、不可十字交叉，且放置后双方都必须仍有通路（BFS 校验）。
- 胜负：甲（红）抵达顶行 / 乙（蓝）抵达底行即胜。
- 模式：人机对弈（学徒/排字师/总编 三档 AI）+ 双人同屏轮流执子。

## 技术方案

- **渲染**：业务画面全部绘制在离屏 Canvas 2D（`KwaiRender.createOffscreenCanvas`），每帧经 WebGL 纹理 blit 到主画布（`main.js` 的 `draw()` 占位体替换为 `AIGCUtils.Game.frame(gl)`）。棋盘、棋子、挡板、UI 全部程序化绘制，无图片资源、无音频资源。
- **架构**：规则引擎（`play/engine.js`，纯函数）+ AI（`play/ai.js`，贪心 + α-β 剪枝，评估项移植自 Web 版：路径差/板差/机动差/板压/节奏）+ 渲染（`render/ui.js`、`render/board.js`）+ 场景（`scene/home.js`、`scene/game.js`、`scene/result.js`）+ 编排（`play/main.js`）。所有模块挂载到 `window.AIGCUtils.*`，除根 `game.js` 外不出现 `require`。
- **开放能力**：`kwai-ad.js`（激励视频：看广告得 3 次悔棋）、`kwai-repost.js`（胜利页分享 + 系统转发注册）、`kwai-storage.js`（对局存档与战绩）、`kwai-ui.js`（快手环境 Toast）。均为脚手架预置封装，禁止裸调 `ks.*`。
- **分包**：不需要（主包远小于 6 MiB）。`game.json` 移除模板示例分包声明。
- **触控**：`touchstart/move/end` + `mousedown/up`，`passive:false`；竖屏从 `AIGCUtils.Layout.safeTop` 起绘，避开刘海与平台控件区。

## 素材

- 运行时无外部素材（全程序化绘制）。
- `package/yoola-assets/`：`icon.png`(220×220)、`share-image.png`(510×350)、`loading-image.png`(640×1400 竖屏，<1MiB)，Risograph 印刷风（荧光红 #FF4D2E / 钴蓝 #2440B3 / 纸米白），与玩法内视觉一致。

## 约定

- 对局中「悔棋」初始 1 次；激励广告奖励 +3 次。
- 存档键：`quoridor_save`（进行中对局）、`quoridor_stats`（累计战绩）。

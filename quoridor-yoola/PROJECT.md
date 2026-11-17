# 步步为营（Quoridor）— 快手 Yoola 互动作品

## 项目信息

- **作品项目名**：步步为营
- **内容类型**：棋类策略对弈（Quoridor 挡板棋）
- **横竖屏**：竖屏（package/game.json 的 deviceOrientation: "portrait"）
- **项目目录**：/home/z/my-project/quoridor-yoola
- **来源**：移植自同工作区的 Web 版《步步为营》（src/lib/game/，Next.js 工程）。核心引擎/AI 经 esbuild 原样打包（scripts/build_yoola_core.mjs），UI 按 Web 版手机端 1:1 重绘。

## 视觉与交互（与 Web 版一致：Risograph 印刷棋谱专著风）

- **设计语言**：纸色 #f5f2ea + 墨黑 #1a1a1a + 荧光红 #ff4d2e / 钴蓝 #2440b3 双色套印；直角边框、硬偏移阴影、宋体标题、等宽字距标签、页码页眉、N 徽章。
- **书页结构**：封面 → 目录（六章）→ 章节设置页 → 对局页，全部纵向滚动。
- **字体**：包内子集字体 9 个（思源宋体 Regular/Bold/Black、IBM Plex Mono 三档、Playfair Display 三档，scripts/make_yoola_fonts.py 生成），经 ks.loadFont 预加载。
- **音效**：活版音效 4 枚 mp3（res/Audio/，scripts/make_yoola_sounds.py 合成），经 KwaiMedia.Audio.playSfx 播放。

## 核心玩法

- 棋盘 5/7/9/11 路预设 + 5-13 路自定义；每方挡板 0-20 根。
- 每回合二选一：移子或放板（触屏两步放板浮条：横/竖 + 落板✓）。
- 模式：单人对弈（学徒/排字师/总编/社长 四档 AI）+ 双人同屏 + 四人围坐（四色、顺时针、出局制、AI 代打）。
- 棋钟：悠然/快棋/标准/长卷预设 + 自定义总时长/单步时限，超时判负。
- 皮肤四套（红·蓝 / 红·黑 / 蓝·黑 / 墨绿·黑）；悔棋（1 次 + 激励视频 +3）；认输确认弹层；结算浮层（保存入档/再来一局/返回目录）。
- 档案馆：本地卷宗（记谱/结果/销毁）；书签续读。

## 技术架构

- play/core.js — types+engine（esbuild 打包，Web 版原样移植，支持二人/四人局）
- play/ai.js — computeAiMove（四档 AI + 四人局自动分流，移动端同步预算 280/650/1500/2000ms）
- render/theme.js ui.js page.js board.js — 主题/组件/滚动页框架/棋盘（Canvas 2D，双缓冲经 GLBlt blit）
- scene/cover.js toc.js setup.js game.js rules.js archive.js — 六场景
- play/main.js — 编排：场景路由、棋钟、存档（quoridor_save/stats/archive/prefs）、档案、音效、皮肤
- 快手离线环境不支持在线对战：目录第四章置灰标注。

## 素材

- package/yoola-assets/：icon 220×220、share-image 510×350、loading-image 640×1400（scripts/make_yoola_assets_v2.py 生成，印刷风与游戏一致）。

## 约定

- 对局中悔棋初始 1 次；激励广告 +3 次（kwai-ad.js）。
- 存档键：quoridor_save / quoridor_stats / quoridor_archive / quoridor_prefs。
- 构建：node scripts/build_yoola_core.mjs（改 Web 版引擎后重打包）；esbuild 必须带 charset:'utf8' 与 lineLimit（默认 minify 会把中文转为反斜杠u转义，触发平台校验器正则回溯卡死）。

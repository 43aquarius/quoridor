# 快手互动作品工程规范

快手互动作品运行在独立的 JS 运行时中，不是 WebView——无 DOM、无 CSS、无 HTML。全局对象统一使用 `window`，模块系统为 CommonJS `require()`，渲染使用 `ks.createCanvas()`，可按需选择 Canvas 2D / WebGL / WebGL 2。

> **强制**：玩法代码禁止依赖 DOM、CSS 或 HTML；所有 UI、文字、图片、动效必须通过 canvas 绘制。违反该约束的代码在快手运行时会直接报错或无法渲染，本地 H5 通过不代表快手端也能正常运行。

## 作品形态要求（强制）

必须是**本地独立运行的互动作品**，玩法逻辑禁止任何网络行为，包括但不限于 `fetch`、`XMLHttpRequest`、`axios`、`WebSocket`、`ks.request`、`ks.connectSocket`、联网对战、服务端数据同步、实时通信、排行榜等。所有玩法数据本地计算，存档走 `KwaiStorage` 本地缓存。

禁止从外部 CDN 拉取任何资源（图片 / 音频 / 视频 / JSON 等）。资源如需走 CDN，由平台在上传阶段统一将其放入平台 CDN，开发者无需也不应在代码中拼接外部 CDN 地址，参见 `references/resource-spec.md`。

`KwaiNetwork.downloadFile` 仅限平台内置用途（如下载平台已校验的资源包），不得用于互动玩法逻辑联网。

## 必备文件

| 文件 | 说明 |
|---|---|
| `game.js` | 运行入口（唯一入口，不可改名）|
| `game.json` | 运行配置（画面方向、分包声明等）|
| `project.config.json` | 项目配置（APPID、项目名）|
| `kwaiadapter.js` | 快手 API 适配层（🔒 禁止修改）|
| `kwaiOpenApi/` | 开放能力封装（🔒 脚手架预置，禁止修改）|
| `kwaiStandard/` | 标准工具库（🔒 脚手架预置，禁止修改）|
| `index.html` | H5 预览入口（仅引用脚本，不写玩法代码；快手运行环境不会运行 HTML）|
| `res/` | 资源目录（见 resource-spec.md）|

`game.js` 是快手运行环境的真实入口，只负责触发脚手架启动流程；`index.html` 只服务本地 H5 预览。二者都禁止编写额外玩法逻辑，玩法代码必须放在 `gameplay/`。

## 目录结构

```
gameplay/
  play/               # 玩法核心逻辑（codegen 目标目录，初始为空）
  render/             # WebGL 渲染（codegen 目标目录，初始为空）
  scene/              # 场景与界面（codegen 目标目录，初始为空）
kwaiStandard/          # 标准工具库（🔒 禁止修改）
  main.js             # 装配 + 主循环（🔒 禁止修改，仅【占位绘制】可替换）
  engines/             # 引擎适配层
  core/                # 事件总线、日志
  loaders/             # 分包与资源路径加载器
  manager/             # 资源管理
kwaiOpenApi/           # 平台能力（🔒 禁止修改，索引见 kwai-api/KwaiAPI-index.md）
subpackages/           # 分包根目录（codegen 按技术方案创建，初始为空）
res/                   # 作品素材（详见 resource-spec.md）
  home-asset/          # 首页渲染图（🔒 必须主包，禁止 CDN，禁止分包）
  Image/               # 主包图片
  Audio/               # 主包音频
  Video/               # 视频（仅本地调试用，平台上传阶段统一 CDN 化）
  Icon/                # 图标
```

## 文件同步规则

- 所有业务逻辑只能写在 `gameplay/`（含子目录），禁止修改 `kwaiOpenApi/`、`kwaiStandard/`、根目录入口文件
- `game.js` / `index.html` 保持入口文件职责，只保留必要入口逻辑与脚本引用，禁止追加玩法代码
- 每新增 `gameplay/**/*.js` → `index.html` 追加对应 `<script src="gameplay/<子目录/文件名>.js?v=1"></script>`
- `game.js` require 块每新增一个文件，`index.html` 必须包含对应 `<script src="<相对路径>?v=1"></script>`；`index.html` 自身引入的 `kwaiStandard/main.js` 以及分包动态加载文件除外
- 所有 `require` 只写在根目录 `game.js`，其他业务文件内禁止使用 `require`
- `kwaiStandard/main.js` 除【占位绘制】（`draw()` 函数体）外禁止修改任何内容，不承担模块装配职责

## game.js require 块

默认加载登录、广告、转发分享三个核心模块，其他能力按需追加：

**同步示例**：每在 `game.js` 追加一个 `require`，必须在 `index.html` 中包含对应 `<script>`；不校验顺序，`index.html` 自身引入的 `kwaiStandard/main.js` 和分包动态加载除外：

```js
// game.js
require('./kwaiOpenApi/kwai-login.js');
require('./kwaiOpenApi/kwai-ad.js');
require('./kwaiOpenApi/kwai-repost.js');
require('./gameplay/play/game.js'); // 按依赖顺序追加
```

```html
<!-- index.html，追加在 kwaiStandard/main.js 之前 -->
<script src="kwaiOpenApi/kwai-login.js?v=1"></script>
<script src="kwaiOpenApi/kwai-ad.js?v=1"></script>
<script src="kwaiOpenApi/kwai-repost.js?v=1"></script>
<script src="play/game.js?v=1"></script>
<script src="kwaiStandard/main.js?v=1"></script>
```

## AIGCUtils.Layout — 屏幕适配

基础字段由 `kwaiStandard/core/aigc-init.js` 初始化、`main.js` 的 `resize()` 更新，无需重复初始化。项目画布由平台管理，禁止设置 `canvas.style.*`；仅本地 H5 预览使用 `index.html` CSS。物理尺寸由 `canvas.width / canvas.height` 设置，渲染尺寸通过 `gl.viewport()` 同步。

| 字段 | 说明 |
|------|------|
| `safeTop` | 顶部安全区高度（逻辑像素）|
| `usableH` | 可用高度 = 屏幕总高 − safeTop |
| `w` / `h` | 屏幕逻辑宽 / 高 |

以上字段未扣除平台控件、保护间距、底部及侧边避让区，不能直接作为最终交互区域；竖屏内容不得侵入 `safeTop` 上方。

### 屏幕安全区域与平台按钮规范

依据快手互动玩法设计规范 V2.0。区域语义不变，布局以设备安全区和平台控件实际占位为准；开孔形态与避让宽度仅为示意。

#### 竖屏（PORTRAIT）

iOS 与 Android 从上到下均为：系统安全区 → 间距保护 → 平台控件预留 → 可交互区域 → 底部安全区。

- **系统安全区**：iOS 参考 `44px`，Android 参考 `40px`，以 `safeArea` 和状态栏实际信息为准。
- **间距保护**：参考 `32px`，位于系统安全区与平台控件之间；平台控件与自定义 HUD 也需保持间距。
- **平台控件预留**：参考 `64px`，以实际占位为准，禁止遮挡或重叠。
- **可交互区域**：位于平台控件下方、底部安全区上方，承载主要内容、HUD、道具及操作热区，优先保证内容完整展示。
- **底部安全区**：两平台均参考 `68px`，按实际底部安全边界避让手势；重要按钮不要贴底。

#### 横屏（LANDSCAPE）

横屏示意图从上到下依次为：

- **iOS**：间距保护 → 平台控件预留 → 可交互区域 → 底部安全区。
- **Android**：间距保护 → 平台控件预留 → 可交互区域。

- **系统安全区**：位于侧边，按屏幕方向动态换算左右开孔避让范围，内容与按钮不得进入。
- **间距保护**：顶部与功能按钮之间参考 `32px`。
- **平台控件预留**：参考 `64px`，以实际占位为准，禁止遮挡或重叠。
- **可交互区域**：主要内容、HUD 和按钮须避开侧边开孔，横屏坐标独立计算。
- **底部安全区（iOS）**：参考 `42px`，按实际底部安全边界避让手势。

#### 布局实现与验收

- 根据当前方向的安全边界、控件占位和保护间距动态计算交互区域，不得侵入避让区域，也不得假定 `safeTop === 0` 或写死设备像素。
- 通过平台封装读取信息，不直接调用裸 `ks.*`。`safeArea` 按竖屏正方向返回，横屏须换算坐标，并处理 Canvas 旋转和触控映射。
- `safeArea.bottom` 是底部坐标，不是间距；统一坐标系后，底部间距为 `windowHeight - safeArea.bottom`。
- 真机覆盖 iOS / Android 横竖屏，检查核心玩法完整、控件无遮挡、安全区避让及视觉与触摸命中一致。


## 禁用 Web API 清单

| 禁止 | 原因 | 替代 |
|------|------|------|
| `document.createElement` / `innerHTML` | 运行时无完整 DOM | WebGL 绘制 |
| `new Audio()` | 不稳定 | `KwaiMedia.Audio.playSfx / playBgm` |
| `performance.now()` | 快手环境报错 | `AIGCUtils._now()` |
| `localStorage` | 快手无此 API | `KwaiStorage.setSync / getSync` |
| `fetch` / `XMLHttpRequest` / `axios` / `WebSocket` | 禁止玩法逻辑联网 | 无替代，作品必须本地独立运行 |
| `navigator.geolocation` | Stub（noop）| 不支持，勿依赖 |
| `location.href` / `.reload()` | Stub | 快手无页面跳转 |

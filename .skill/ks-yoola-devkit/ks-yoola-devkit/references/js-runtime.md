# JS 运行时规范

快手互动作品运行在独立的 JS 运行时中，不是浏览器 WebView。全局对象统一使用 `window`；脚手架已抹平快手与 H5 的运行时差异。模块系统为 CommonJS `require()`。

## ES 版本支持

支持 ES5，部分 ES6+ 特性可用（`const`/`let`/箭头函数/解构/模板字符串），但不支持：

- 动态 `import()`
- `eval`
- `__proto__` 赋值

玩法代码统一用 ES5 风格编写，无自动转译。

## 模块系统（require）

- `require()` 为 CommonJS 同步加载，只能写在根目录 `game.js`
- 其他业务文件（`play/`、`render/`、`scene/` 下）禁止使用 `require`，通过 `window.AIGCUtils` 全局命名空间访问其他模块
- 路径相对于当前文件：从 `kwaiStandard/main.js` 引 `kwaiOpenApi/` 时写 `../kwaiOpenApi/kwai-login.js`

## 模块封装规范（IIFE）

每个玩法文件用 IIFE 包裹，挂到 `window.AIGCUtils` 命名空间：

```js
(function () {
  var AIGCUtils = (window.AIGCUtils = window.AIGCUtils || {});

  var _score = 0; // 私有变量

  AIGCUtils.Game = {
    getScore: function () { return _score; },
    addScore: function (n) { _score += n; },
    start:    function () { /* ... */ },
  };
})();
```

- 禁止在 IIFE 外声明变量，禁止外部依赖（npm / CDN）
- 可变状态通过 getter 暴露，禁止直接暴露原始变量（其他模块拿到的是调用时快照，不是实时值）
- `AIGCUtils` 由 `aigc-init.js` 保证存在，禁止写 `AIGCUtils = AIGCUtils || {}` 重复防御

## 命名空间约定（AIGCUtils.xxx）

| 挂载路径 | 用途 |
|---|---|
| `AIGCUtils.Layout` | 布局参数（`safeTop` / `w` / `h` / 业务自定义字段）|
| `AIGCUtils.Game` | 玩法状态与逻辑 |
| `AIGCUtils.Board` | 棋盘 / 世界数据 |
| `AIGCUtils.Render` | 绘制方法 |
| `AIGCUtils.Input` | 输入处理 |
| `AIGCUtils.Config` | 多文件共享的玩法规则常量 |
| `AIGCUtils.Levels` | 关卡数据 |
| `AIGCUtils.SubpackageLoader` | 分包按需加载 |
| `AIGCUtils.GameLogger` | 重要日志输出 |

## 常量分层规则

- 仅本文件使用 → `var` 私有声明
- 多文件共享的布局值 → 挂到 `AIGCUtils.Layout`
- 多文件共享的规则值 → 挂到 `AIGCUtils.Config`

```js
var COLS = 7;                 // 私有
AIGCUtils.Layout.COLS = COLS; // 需要跨文件时再挂出去
```

## 统一时间源

统一使用 `AIGCUtils._now()`，禁止直接调用 `performance.now()`（快手环境报错）。

## 互动作品生命周期事件

通过 `KwaiBase`（`kwaiOpenApi/kwai-base.js`）监听前后台切换：

```js
require('./kwaiOpenApi/kwai-base.js'); // game.js 中按需引入

KwaiBase.onShow(function (res) { resumeGame(); });
KwaiBase.onHide(function ()    { pauseGame();  });
KwaiBase.offShow(callback);
KwaiBase.offHide(callback);
```

全局异常捕获由 `game-logger.js` 自动挂钩 `ks.onError`，无需手动处理。

## 定时器行为差异

`setTimeout` / `setInterval` / `requestAnimationFrame` 两端均可用，但快手在切后台时会降频 `setInterval`。作品主循环推荐 `requestAnimationFrame`；计时逻辑应依赖生命周期事件暂停，而非依赖 `setInterval` 精度。

## 日志规范（game-logger.js）

`kwaiStandard/manager/game-logger.js` 挂钩全局 `console`，区分开发版（`host.version = 0.0.1`）和正式版行为：

| 日志方法 | 开发版 | 正式版 |
|---|---|---|
| `console.error(module, ...)` | 带前缀 | 带前缀 |
| `console.touch(module, ...)` | 带前缀 | 带前缀 |
| `console.warn(module, ...)` | 带前缀 | 带前缀 |
| `console.log(...)` | 带前缀 | 直通，不带前缀 |
| `console.info(...)` | 带前缀 | 直通，不带前缀 |

前缀格式：`|M:ModuleName|T:GameName|D: 日志数据`

初始化（放在 `main.js` require 块之后、resize 之前）：

```js
AIGCUtils.GameLogger.init('<GAME_NAME>', '<APPID>');
```

模块命名约定：`Runtime`（全局异常）/ `UI.Button` / `Game.Score` / `Network.Request` / `Asset.Load`

## 代码自检清单

```
[] 每个 gameplay/ 下的 JS 文件均有 IIFE，无裸全局变量
[] 可变状态全部通过 getter 暴露
[] 命名空间挂到 AIGCUtils.xxx，无重复防御写法
[] 私有常量用 var，共享常量挂到 AIGCUtils.Layout / AIGCUtils.Config
[] game.js require 块已同步新增文件，玩法文件内无 require
[] 无外部依赖（npm / CDN）
[] 渲染相关检查见 render-api.md 自检清单，Canvas 2D / WebGL / WebGL 2 按需使用
[] 图片资源通过 KwaiRender.loadImage / KwaiMedia.Image 加载，分包加载通过 AIGCUtils.SubpackageLoader
[] 重要日志使用 console.error / console.touch，普通日志用 console.log
```

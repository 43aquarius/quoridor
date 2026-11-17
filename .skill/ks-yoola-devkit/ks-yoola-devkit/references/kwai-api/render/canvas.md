# 画布模块

## 封装层

文件：`kwaiOpenApi/kwai-render.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-render.js');
```

```js
KwaiRender.init();
var canvas = KwaiRender.canvas;
var gl     = KwaiRender.gl; // WebGL context

// 创建离屏画布
var offscreen = KwaiRender.createOffscreenCanvas(400, 300);
```

> ✅ Canvas 2D / WebGL / WebGL 2 均可用于渲染；遇到接口不可用或兼容问题，联系 Yoola 平台侧排查。

---

## 底层 API 参考

## 概述

创建画布对象。**首次调用** `ks.createCanvas()` 创建主画布，后续调用创建离屏画布。主画布和离屏画布支持通过 `Canvas.getContext('2d')` / `Canvas.getContext('webgl')` / `Canvas.getContext('webgl2')` 获取渲染上下文。

> 💡 与 Web Canvas 的差异：Web 端通过 `document.createElement('canvas')` 创建，快手运行环境**没有 DOM**，必须用 `ks.createCanvas()` 创建。

---

## ks.createCanvas — 创建画布对象

### 参数

无参数。

### 返回值

| 类型 | 说明 |
|------|------|
| `Canvas` | 画布对象 |

**首次调用**返回的画布是**屏幕画布**（绘制内容直接显示在屏幕上），**之后调用**返回的画布是**离屏画布**（不显示，需渲染到纹理或 framebuffer 后输出到屏幕画布）。

### Canvas 对象常用属性与方法

| 属性/方法 | 类型 | 说明 |
|----------|------|------|
| `canvas.width` | `number` | 画布宽度（像素），可读写 |
| `canvas.height` | `number` | 画布高度（像素），可读写 |
| `canvas.getContext(contextType)` | `function` | 获取 WebGL 上下文，`contextType` 只能为 `'webgl'` |
| `canvas.getBoundingClientRect()` | `function` | （仅屏幕画布）获取画布在屏幕上的位置和尺寸，返回 `{ top, left, width, height }` |
| `canvas.addEventListener(type, listener)` | `function` | （仅屏幕画布）监听画布级事件；在快手端更推荐使用 `ks.onTouch*` 监听全局触摸事件 |

### 标准调用示例

```ts
// 1) 创建主屏幕画布（首次调用）
const canvas = ks.createCanvas();
const gl = canvas.getContext('webgl');

// 2) 按系统信息设置画布尺寸（适配 DPR）
const info = ks.getSystemInfoSync();
const dpr = info.pixelRatio || 1;
canvas.width = info.windowWidth * dpr;
canvas.height = info.windowHeight * dpr;
// 主画布会自动按窗口尺寸显示，无需设置 style
gl.viewport(0, 0, canvas.width, canvas.height);

// 3) 使用 WebGL API 绘制内容
gl.clearColor(1.0, 0.0, 0.0, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);

// 4) 创建离屏画布（再次调用，用于缓存静态图层）
const offscreenCanvas = ks.createCanvas();
const offGl = offscreenCanvas.getContext('webgl');
offscreenCanvas.width = 200;
offscreenCanvas.height = 200;
// 5) 离屏内容优先绑定到 framebuffer 后在同一 WebGL 上下文内渲染
var framebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
```

### 离屏渲染示例

```ts
// 在主 WebGL 上下文内创建 framebuffer，渲染到纹理
function createOffscreenFramebuffer(gl, width, height) {
  const framebuffer = gl.createFramebuffer();
  const texture = gl.createTexture();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer, texture, width, height };
}
```

### 常见误用 & 注意事项

- ⚠️ **必须**用 `ks.createCanvas()` 而非 `document.createElement('canvas')`，运行环境无 DOM
- ⚠️ 首次调用创建主画布，**全局只能有一个主画布**；重复创建得到的是离屏画布，绘制内容不会显示在屏幕上
**离屏渲染原则**：优先在同一个 WebGL 上下文内使用 framebuffer；避免创建多个 WebGL 上下文并互相传递纹理。跨上下文使用 canvas 纹理会引入 GPU→CPU→GPU 往返，高频使用会明显降低性能。
- ⚠️ 主画布的尺寸需按 `pixelRatio` 放大，并用 `gl.viewport()` 设置渲染区域
- ⚠️ 离屏画布内容未渲染到主画布前不可见
- ⚠️ 离屏 framebuffer 可用于渲染到纹理、缓存图层，但会占用 GPU 内存，按需使用
- ⚠️ Canvas 对象本身不提供 `onTouch*`，触摸事件统一通过 `ks.onTouch*` 监听（详见 [base/touch.md](../base/touch.md)）

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **首屏初始化**：启动时创建主画布、按系统信息设置尺寸、获取 WebGL 上下文
- **静态图层预渲染**：背景、UI 框架、棋盘等不变的图层用 framebuffer 渲染到纹理
- **文字缓存**：复杂文字使用离屏纹理缓存，避免每帧重绘
- **精灵图集缓存**：从远端下载的图集解码后上传为 WebGL 纹理，绘制时按 UV 切片使用

推荐：在 `gameplay/kwai-base.js`（或独立的 `gameplay/kwai-render.js`）启动时调用一次 `ks.createCanvas()` 初始化主画布并暴露到全局，业务模块通过事件总线订阅 `render:ready` 拿到主画布引用，避免散落各处。

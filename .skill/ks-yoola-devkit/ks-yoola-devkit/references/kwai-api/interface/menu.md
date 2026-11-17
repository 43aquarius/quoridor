# 菜单胶囊布局模块

## 封装层

文件：`kwaiOpenApi/kwai-ui.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-ui.js');
```

胶囊按钮布局通过 `ks.getMenuButtonBoundingClientRect()` 获取，`KwaiUI` 内部已封装，可直接获取右上角胶囊的位置与尺寸，用于避开系统按钮区域。

---

## 底层 API 参考

## 概述

获取快手容器右上角胶囊按钮（菜单按钮）的布局位置信息。应用内自绘 UI（如自定义顶部菜单、设置按钮、关闭按钮等）需避开胶囊按钮区域，避免视觉重叠和触摸冲突。

> 💡 胶囊按钮是快手容器强制显示的系统 UI（含「...」菜单和「圆」关闭按钮），**无法隐藏或移动**，自绘界面需避开该区域。

---

## ks.getMenuButtonLayout — 获取菜单按钮布局

### 概述

获取菜单按钮（右上角胶囊按钮）的布局位置信息。**坐标以屏幕左上角为原点**，单位为 px。建议应用启动时调用一次并缓存，运行时按需读取（避免反复调用）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| success | `(res: MenuButtonLayoutResult) => void` | 否 | 接口调用成功的回调函数 |
| fail | `(err: { errMsg: string }) => void` | 否 | 接口调用失败的回调函数 |
| complete | `() => void` | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**success 回调参数 Object res：**

| 属性名 | 类型 | 说明 |
|--------|------|------|
| code | `number` | 错误码（0 表示成功）|
| msg | `string` | 错误信息 |
| result | `object` | 返回数据，结构见下表 |

**result 结构：**

| 属性名 | 类型 | 说明 |
|--------|------|------|
| width | `number` | 胶囊按钮宽度，单位 px |
| height | `number` | 胶囊按钮高度，单位 px |
| top | `number` | 上边界坐标（距屏幕顶部），单位 px |
| bottom | `number` | 下边界坐标（距屏幕顶部），单位 px |
| right | `number` | 右边界坐标（距屏幕左侧），单位 px |
| left | `number` | 左边界坐标（距屏幕左侧），单位 px |

### 标准调用示例

```ts
// 1) 基础调用
ks.getMenuButtonLayout({
  success: (res) => {
    console.log('menu button layout:', res.result);
    // 输出形如：{ width: 87, height: 32, top: 44, bottom: 76, right: 380, left: 293 }
  },
  fail: (err) => {
    console.warn('getMenuButtonLayout failed:', err);
  },
  complete(res) {
    // 无论成功失败都会触发
  },
});
```

### 常见用法

#### 1) 启动时缓存到全局

```ts
// game.js 模块装配后启动初始化
let _menuButtonLayout = null;

function initMenuButtonLayout() {
  return new Promise((resolve, reject) => {
    ks.getMenuButtonLayout({
      success: (res) => {
        _menuButtonLayout = res.result;
        console.log('[MenuButton] layout cached:', _menuButtonLayout);
        resolve(_menuButtonLayout);
      },
      fail: reject,
    });
  });
}

function getMenuButtonLayout() {
  return _menuButtonLayout;
}
```

#### 2) 避开胶囊按钮绘制顶部 UI

```ts
// 自绘顶部菜单按钮（如设置、暂停）时避开胶囊
function drawTopBar(gl) {
  const menu = getMenuButtonLayout();
  const sysInfo = KwaiBase.getSystemInfo();
  if (!menu || !sysInfo) return;

  // 顶部安全区高度（状态栏）
  const statusBarHeight = sysInfo.statusBarHeight || 20;

  // 自绘按钮放在胶囊按钮左侧，留 12px 间距
  const buttonWidth = 40;
  const buttonHeight = menu.height;  // 与胶囊等高
  const buttonTop = menu.top;        // 与胶囊同高
  const buttonRight = menu.left - 12;  // 胶囊左边 - 12px 间距
  const buttonLeft = buttonRight - buttonWidth;

  // 绘制暂停按钮（WebGL 纹理或图形批次）
  drawPauseButton(gl, buttonLeft, buttonTop, buttonWidth, buttonHeight);
}
```

#### 3) 调整画面避开顶部

```ts
// 全屏内容的渲染区域需要避开胶囊按钮覆盖
function getSafeRenderArea() {
  const menu = getMenuButtonLayout();
  const sysInfo = KwaiBase.getSystemInfo();
  if (!menu || !sysInfo) {
    return { x: 0, y: 0, width: sysInfo?.windowWidth || 375, height: sysInfo?.windowHeight || 667 };
  }
  // 顶部留出胶囊按钮 + 一点边距的高度
  const topInset = menu.bottom + 10;
  return {
    x: 0,
    y: topInset,
    width: sysInfo.windowWidth,
    height: sysInfo.windowHeight - topInset,
  };
}

function renderGame(ctx) {
  const area = getSafeRenderArea();
  // 在 area 范围内绘制内容，避开胶囊按钮
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.width, area.height);
  ctx.clip();
  drawGameContent(ctx);
  ctx.restore();
}
```

### 常见误用 & 注意事项

- ⚠️ **坐标原点是屏幕左上角**，与 `ks.getSystemInfo` 的 `safeArea` 一致；不要与画布坐标混淆（画布已按 DPR 缩放，使用前需除以 DPR）
- ⚠️ 不同设备/快手版本下胶囊按钮的位置和尺寸可能不同，**必须运行时动态获取**，不能写死坐标
- ⚠️ `res.result` 才是真正的布局数据，`res.code` / `res.msg` 是错误码和错误信息（code=0 表示成功）
- ⚠️ 该接口是异步的，但胶囊按钮位置在一次运行期间通常不变，**启动时调一次并缓存**即可，无需每帧调用
- ⚠️ 不同宿主（快手 / 极速版 / 快看点）胶囊按钮样式可能略有差异，但布局结构相同
- ⚠️ 横屏时胶囊按钮的位置可能自动调整到屏幕右上角，**横竖屏切换时需重新获取**（当前运行环境通常不支持动态切换，无需额外处理）

### 错误处理

| 失败现象 | 可能原因 | 处理建议 |
|---------|---------|---------|
| `fail` 回调触发 | 容器版本过低不支持 | 做兜底：用 `ks.getSystemInfo().statusBarHeight + 44` 作为粗略的胶囊底部 |
| `res.code` 非 0 | 接口异常 | 同上兜底 |
| `res.result` 为 `null` | 极少数低版本 | 同上兜底 |

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **自绘顶部 UI**：菜单按钮、设置按钮、暂停按钮、状态显示等顶部元素 → 用 `getMenuButtonLayout` 避开胶囊
- **全屏显示**：渲染区域需考虑顶部胶囊遮挡 → 顶部安全区从胶囊 `bottom` 开始
- **沉浸式 UI 适配**：与状态栏适配配合，做出完整的顶部安全区避让

推荐：在 `gameplay/kwai-base.js` 启动时同步调用 `ks.getMenuButtonLayout` 缓存到 `_state.menuButtonLayout`，与 `systemInfo` 一起通过 `kwai:system:ready` 事件分发，业务模块按需读取。

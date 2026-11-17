# 触摸事件模块

## 封装层

文件：`kwaiOpenApi/kwai-base.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-base.js');
```

触摸事件通过 `canvas.addEventListener` 绑定，必须加 `{ passive: false }`。`KwaiBase` 内部已通过 `ks.onTouchStart` 等 API 适配快手环境。

---

## 底层 API 参考

## 概述

画布触摸事件统一通过 `ks.onTouch*` / `ks.offTouch*` 系列接口监听或取消监听。共四类事件：开始（`onTouchStart`）、移动（`onTouchMove`）、结束（`onTouchEnd`）、失效（`onTouchCancel`），每类均提供对应的 `off*` 取消监听接口。

> ⚠️ 这些接口监听的是**全屏画布级触摸事件**（运行环境无 DOM 树），不区分 UI 元素，需要在回调里根据坐标自行做命中判断。

---

## Touch 对象

所有触摸事件回调参数中的 `touches` / `changedTouches` 数组元素均为 `Touch` 对象，表示一个触摸点。

| 属性 | 类型 | 说明 |
|------|------|------|
| identifier | `number` | Touch 对象的唯一标识符（只读）。一次触摸动作在平面移动的整个过程中该标识符不变，可用于跟踪同一根手指的连续操作 |
| pageX | `number` | 触点相对于页面左边沿的 X 坐标 |
| pageY | `number` | 触点相对于页面上边沿的 Y 坐标 |
| clientX | `number` | 触点相对于可见视区左边沿的 X 坐标 |
| clientY | `number` | 触点相对于可见视区上边沿的 Y 坐标 |
| force | `number` | 手指挤压触摸平面的压力大小，范围 `0.0`（无压力）到 `1.0`（最大压力），仅支持 force touch 的设备返回 |

---

## 事件回调参数（通用 Schema）

四个 `on*` 事件回调均接收一个 `Object res`，结构完全一致：

| 属性 | 类型 | 说明 |
|------|------|------|
| touches | `Array<Touch>` | 当前所有触摸点的列表（含未变化的多指）|
| changedTouches | `Array<Touch>` | 触发此次事件的触摸点列表（仅本次发生变化的指头）|
| timeStamp | `number` | 事件触发时的时间戳 |

> **多指差异**：`touches` 包含当前所有还在屏幕上的指头，`changedTouches` 只包含本次事件触发的那一根/几根。判断单击/单指移动用 `changedTouches[0]`，多指手势需对比两个数组。

---

## ks.onTouchStart — 监听开始触摸事件

### 概述

监听开始触摸事件（手指按下）。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `(res: TouchEvent) => void` | 是 | 开始触摸事件的回调函数 |

### 标准调用示例

```ts
// 监听开始触摸：记录按下的起始坐标，用于后续判定单击/拖拽
const onTouchStartCallback = (res) => {
  const t = res.changedTouches[0];
  console.log('touch start', t.identifier, t.clientX, t.clientY, t.timeStamp);
  // 记录起始坐标和时间，供 onTouchMove/onTouchEnd 判定滑动方向与速度
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartTime = t.timeStamp;
};
ks.onTouchStart(onTouchStartCallback);
```

### 常见误用 & 注意事项

- ⚠️ 画布无 DOM 命中机制，按下哪个 UI 元素需要根据坐标自行做矩形碰撞判断
- ⚠️ 多指按下时 `changedTouches` 只包含本次新增的指头，`touches` 包含所有当前指头
- ⚠️ 想取消监听必须保留 callback 引用，传给 `ks.offTouchStart`

---

## ks.onTouchMove — 监听触点移动事件

### 概述

监听触点移动事件（手指按下后移动）。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `(res: TouchEvent) => void` | 是 | 触点移动事件的回调函数 |

### 标准调用示例

```ts
// 监听触点移动：实现拖拽逻辑
const onTouchMoveCallback = (res) => {
  const t = res.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  // 滑动距离阈值判定，避免抖动误触
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
    // 滑动方向判定
    if (Math.abs(dx) > Math.abs(dy)) {
      handleSwipe(dx > 0 ? 'right' : 'left');
    } else {
      handleSwipe(dy > 0 ? 'down' : 'up');
    }
  }
};
ks.onTouchMove(onTouchMoveCallback);
```

### 常见误用 & 注意事项

- ⚠️ `onTouchMove` 触发频率很高（每帧甚至每帧多次），**回调里禁止做重计算或新建大量对象**，否则会拖垮主循环
- ⚠️ 多指同时移动时，用 `identifier` 跟踪每根手指，不要用数组下标判断
- ⚠️ 想取消监听必须保留 callback 引用，传给 `ks.offTouchMove`

---

## ks.onTouchEnd — 监听触摸结束事件

### 概述

监听触摸结束事件（手指抬起）。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `(res: TouchEvent) => void` | 是 | 触摸结束事件的回调函数 |

### 标准调用示例

```ts
// 监听触摸结束：判定单击/长按/快速滑动
const onTouchEndCallback = (res) => {
  const t = res.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const dt = t.timeStamp - touchStartTime;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // 单击判定：位移小且时间短
  if (dist < 10 && dt < 300) {
    handleTap(t.clientX, t.clientY);
  }
  // 长按判定：位移小但时间长
  else if (dist < 10 && dt > 500) {
    handleLongPress(t.clientX, t.clientY);
  }
  // 快速滑动：位移大且时间短
  else if (dist > 50 && dt < 300) {
    handleFlick(dx, dy, dt);
  }
};
ks.onTouchEnd(onTouchEndCallback);
```

### 常见误用 & 注意事项

- ⚠️ 抬起时 `touches` 已不包含抬起的指头，**只能从 `changedTouches` 拿到本次抬起的坐标**
- ⚠️ 想取消监听必须保留 callback 引用，传给 `ks.offTouchEnd`

---

## ks.onTouchCancel — 监听触点失效事件

### 概述

监听触点失效事件。系统弹窗、来电、手写笔断开等情况会触发，**业务上应与 `onTouchEnd` 等价处理**，避免出现"按下了但永不抬起"的卡死状态。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `(res: TouchEvent) => void` | 是 | 触点失效事件的回调函数 |

### 标准调用示例

```ts
// 监听触点失效：通常与 onTouchEnd 走同一清理逻辑
const onTouchCancelCallback = (res) => {
  const t = res.changedTouches[0];
  console.warn('touch canceled', t.identifier, t.clientX, t.clientY);
  // 取消当前正在进行的拖拽/滑动状态，避免卡死
  cancelCurrentDrag();
};
ks.onTouchCancel(onTouchCancelCallback);
```

### 常见误用 & 注意事项

- ⚠️ **必须**与 `onTouchEnd` 同等对待，否则会出现"按下后状态卡死"的 Bug
- ⚠️ 触点失效时手指可能还没真正离开，但交互状态必须立即重置
- ⚠️ 想取消监听必须保留 callback 引用，传给 `ks.offTouchCancel`

---

## ks.offTouchStart — 取消监听开始触摸事件

### 概述

取消监听开始触摸事件。需要传入**之前注册过的同一个 callback 引用**。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 之前通过 `ks.onTouchStart` 注册的回调函数引用 |

### 标准调用示例

```ts
// 必须保留 onTouchStart 时的同一个 callback 引用
ks.offTouchStart(onTouchStartCallback);
```

### 常见误用 & 注意事项

- ⚠️ 传入的 callback 必须与 `ks.onTouchStart` 注册时的引用**完全一致**，传匿名函数无效
- ⚠️ 进入暂停/结算页时通常需要 `off` 掉所有触摸监听，避免与新的 UI 操作冲突

---

## ks.offTouchMove — 取消监听触点移动事件

### 概述

取消监听触点移动事件。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 之前通过 `ks.onTouchMove` 注册的回调函数引用 |

### 标准调用示例

```ts
// 必须保留 onTouchMove 时的同一个 callback 引用
ks.offTouchMove(onTouchMoveCallback);
```

### 常见误用 & 注意事项

- ⚠️ 传入的 callback 必须与 `ks.onTouchMove` 注册时的引用**完全一致**

---

## ks.offTouchEnd — 取消监听触摸结束事件

### 概述

取消监听触摸结束事件。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 之前通过 `ks.onTouchEnd` 注册的回调函数引用 |

### 标准调用示例

```ts
// 必须保留 onTouchEnd 时的同一个 callback 引用
ks.offTouchEnd(onTouchEndCallback);
```

### 常见误用 & 注意事项

- ⚠️ 传入的 callback 必须与 `ks.onTouchEnd` 注册时的引用**完全一致**

---

## ks.offTouchCancel — 取消监听触点失效事件

### 概述

取消监听触点失效事件。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 之前通过 `ks.onTouchCancel` 注册的回调函数引用 |

### 标准调用示例

```ts
// 必须保留 onTouchCancel 时的同一个 callback 引用
ks.offTouchCancel(onTouchCancelCallback);
```

### 常见误用 & 注意事项

- ⚠️ 传入的 callback 必须与 `ks.onTouchCancel` 注册时的引用**完全一致**

---

## 完整接入示例

推荐封装为统一的触摸事件管理器，对外通过事件总线暴露 `touch:start` / `touch:move` / `touch:end` / `touch:cancel`，业务模块按需订阅：

```ts
// gameplay/kwai-touch.js
(function() {
  function onSwitch(callback) {
    const handler = (res) => {
      const t = res.changedTouches[0] || res.touches[0];
      if (!t) return;
      // 转换为画布坐标（如已做 dpr 缩放，需除以 dpr）
      callback({
        x: t.clientX,
        y: t.clientY,
        identifier: t.identifier,
        timeStamp: res.timeStamp,
        touches: res.touches,
        changedTouches: res.changedTouches,
      });
    };
    return handler;
  }

  function init() {
    ks.onTouchStart((res) => KwaiEvent.emit('touch:start', res));
    ks.onTouchMove((res) => KwaiEvent.emit('touch:move', res));
    ks.onTouchEnd((res) => KwaiEvent.emit('touch:end', res));
    ks.onTouchCancel((res) => KwaiEvent.emit('touch:cancel', res));
  }

  window.KwaiTouch = { init };
})();
```

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **画布级触摸输入**：主要交互通过 canvas 监听按下/移动/抬起 → 注册全部四个 `on*` 监听，**`onTouchCancel` 与 `onTouchEnd` 等价处理**
- **手势识别**：单击/长按/滑动/拖拽/多指捏合 → 在回调里基于 `changedTouches` + `timeStamp` 自行判定
- **UI 命中**：自绘按钮/列表 → 在 `onTouchStart` / `onTouchEnd` 回调里做矩形碰撞
- **暂停/结算页**：进入新场景时 `off` 掉旧触摸监听，避免与上一场景状态冲突；离开时按需重新 `on`

推荐：所有触摸事件经事件总线统一分发（`gameplay/kwai-touch.js`），业务模块订阅 `touch:*` 事件而非直接调 `ks.onTouch*`，避免 callback 引用管理混乱、便于场景切换时统一 `off`。


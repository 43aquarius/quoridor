# 帧率控制模块

## 封装层

文件：`kwaiOpenApi/kwai-render.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-render.js');
```

```js
KwaiRender.setPreferredFramesPerSecond(60);
```

---

## 底层 API 参考

## 概述

修改应用渲染帧率。默认渲染帧率为 **60 FPS**，调用 `ks.setPreferredFramesPerSecond` 后，`requestAnimationFrame` 的回调频率会按设定的帧率触发。可在性能不足时主动降帧，或在低动态场景节省电量。

---

## ks.setPreferredFramesPerSecond — 修改渲染帧率

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fps | `number` | 是 | 帧率，有效范围 **1 - 60** |

### 返回值

无。

### 帧率取值参考

| fps 值 | 适用场景 | 说明 |
|-------|---------|------|
| 60 | 默认，适合大多数场景 | 画面最流畅，但耗电最高 |
| 30 | 中等动态场景 / 降频省电 | 视觉效果仍可接受，功耗显著降低 |
| 24 | 低动态场景 / 卡片展示 / 解谜 | 常见于电影画面，观感更柔和 |
| 15 | 静态 UI 类 / 放置类挂机 | 仅 UI 偶尔刷新，极度省电 |
| 1 - 10 | 极低动态场景 | 后台挂机、空闲画面 |

### 标准调用示例

```ts
// 启动时默认 60 FPS
ks.setPreferredFramesPerSecond(60);

// 进入低动态场景（如结算页、菜单页）降为 30 FPS 省电
function onEnterMenu() {
  ks.setPreferredFramesPerSecond(30);
}

// 进入战斗场景恢复 60 FPS
function onEnterBattle() {
  ks.setPreferredFramesPerSecond(60);
}

// 检测到设备性能不足时主动降帧（避免卡顿优于强制 60）
function adaptFpsByDevice() {
  const info = ks.getSystemInfoSync();
  // 低端机型判定（示例：按 system 字段粗判）
  const isLowEnd = /Android\s[0-7]\./.test(info.system || '');
  if (isLowEnd) {
    ks.setPreferredFramesPerSecond(30);
    console.log('[Render] low-end device, set fps=30');
  }
}
```

### 配合 requestAnimationFrame 使用

```ts
// requestAnimationFrame 的回调频率受 setPreferredFramesPerSecond 影响
let lastTime = 0;
function loop(now) {
  const dt = lastTime ? now - lastTime : 16;
  lastTime = now;
  // dt 为本帧与上一帧的时间间隔（毫秒）
  // 即使设了 30 FPS，dt 也会接近 33ms，物理更新需用 dt 缩放
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 动态切换：进入后台再回前台时按需调整
KwaiEvent.on('kwai:show', () => {
  // 回到前台时若处于菜单状态，保持 30 FPS
  if (currentScene === 'menu') {
    ks.setPreferredFramesPerSecond(30);
  } else {
    ks.setPreferredFramesPerSecond(60);
  }
});
```

### 常见误用 & 注意事项

- ⚠️ fps 范围是 **1 - 60**，超出范围会被忽略或抛错，必须做边界保护：`Math.max(1, Math.min(60, fps))`
- ⚠️ 修改帧率只影响 `requestAnimationFrame` 的回调频率，**不影响 `setTimeout` / `setInterval`**（这两个仍按真实时间触发）
- ⚠️ 帧率切换后，**物理/动画更新必须使用 `dt`（时间差）做缩放**，否则降帧后运行速度会变慢（详见上方示例）
- ⚠️ 容器实际帧率可能受设备性能限制而低于设定值（如低端机设 60 实际跑 40），不能假定每帧严格按设定时间触发
- ⚠️ 切到 60 FPS 时务必观察低端机型是否出现卡顿和发热，**降帧保流畅优于强跑 60 卡顿**
- ⚠️ 进入后台时帧率会自动降低（容器行为），无需在 `onHide` 里主动降帧；`onShow` 回前台时按场景恢复

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **启动初始化**：默认设为 60 FPS（也可不设，容器默认就是 60）
- **场景切换**：菜单/结算等低动态场景降到 30 FPS 省电，战斗场景恢复 60 FPS
- **低端机型适配**：根据 `ks.getSystemInfoSync().system` / `brand` / `model` 判定低端机型，主动降到 30 FPS
- **物理/动画系统**：必须用 `requestAnimationFrame` 回调参数 `now` 计算时间差 `dt`，按 dt 缩放更新（与帧率解耦）

推荐：在 `gameplay/kwai-base.js` 启动时根据设备信息自动适配初始帧率，对外通过事件总线 `render:fps:set` 通知业务模块，业务模块根据当前场景主动调 `KwaiEvent.emit('render:fps:request', 30)` 申请帧率变更，避免散落调用 `ks.setPreferredFramesPerSecond`。


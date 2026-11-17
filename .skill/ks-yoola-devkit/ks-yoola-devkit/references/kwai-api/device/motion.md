# 设备方向模块

## 封装层

文件：`kwaiOpenApi/kwai-device.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-device.js');
```

```js
KwaiDevice.startDeviceMotion({ interval: 'game' });
KwaiDevice.onDeviceMotionChange(function (res) { console.log(res.alpha, res.beta, res.gamma); });
KwaiDevice.offDeviceMotionChange(callback);
KwaiDevice.stopDeviceMotion();
```

---

## 底层 API 参考

## 概述

通过 `ks.startDeviceMotionListening` 开始监听设备方向变化，`ks.onDeviceMotionChange` 注册回调（返回 `alpha` / `beta` / `gamma` 三个欧拉角），`ks.stopDeviceMotionListening` 停止监听，`ks.offDeviceMotionChange` 取消回调。可用于体感交互、平衡控制和设备倾斜检测。

> ⚠️ **必须先 start 再 on**：`onDeviceMotionChange` 注册的回调在 `startDeviceMotionListening` 后才会触发，停止时先 `stop` 再 `off`。

---

## ks.startDeviceMotionListening — 开始监听设备方向

### 概述

开始监听设备方向的变化。回调频率由 `interval` 参数控制。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| interval | `string` | `normal` | 否 | 监听回调的执行频率 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**interval 合法值：**

| 值 | 说明 |
|----|------|
| `game` | 适用于高频更新，约 20ms/次（50 FPS）|
| `ui` | 适用于更新 UI，约 60ms/次（约 16 FPS）|
| `normal` | 普通频率，约 200ms/次（5 FPS）|

### 标准调用示例

```ts
// 开始监听（高频交互用 game 频率）
ks.startDeviceMotionListening({
  interval: 'game',
  success() {
    console.log('motion listening started');
  },
  fail(err) {
    console.error('start failed:', err);
  },
});
```

---

## ks.onDeviceMotionChange — 监听设备方向变化事件

### 概述

监听设备方向变化事件。频率根据 `ks.startDeviceMotionListening()` 的 `interval` 参数。可用 `ks.stopDeviceMotionListening()` 停止监听。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 设备方向变化事件的回调函数 |

**callback 接收参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| alpha | `number` | 绕 Z 轴转动夹角，范围 `[0, 2*PI)`，逆时针为正 |
| beta | `number` | 绕 X 轴转动夹角，范围 `[-PI, PI)`，顶部朝地球表面为正 |
| gamma | `number` | 绕 Y 轴转动夹角，范围 `[-PI/2, PI/2)`，右边朝地球表面为正 |

### 标准调用示例

```ts
// 注册回调
ks.onDeviceMotionChange((res) => {
  console.log('alpha:', res.alpha, 'beta:', res.beta, 'gamma:', res.gamma);
  // 用 beta / gamma 控制小球滚动
  updateBallPosition(res.gamma, res.beta);
});

// 体感交互：倾斜手机控制画面中的对象
ks.startDeviceMotionListening({ interval: 'game' });

function updateBallPosition(gamma, beta) {
  // gamma: 左右倾斜，beta: 前后倾斜
  ball.x += gamma * 5;
  ball.y += beta * 5;
}
```

---

## ks.stopDeviceMotionListening — 停止监听设备方向

### 概述

停止监听设备方向的变化。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

### 标准调用示例

```ts
ks.stopDeviceMotionListening({
  success() {
    console.log('motion listening stopped');
  },
});
```

---

## ks.offDeviceMotionChange — 取消监听设备方向变化

### 概述

取消监听设备方向变化事件。需传入与 `onDeviceMotionChange` 注册时同一函数引用。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 否 | 取消监听的事件回调，不传时取消所有监听 |

### 标准调用示例

```ts
const motionHandler = (res) => {
  console.log('motion:', res.alpha, res.beta, res.gamma);
};

// 注册
ks.onDeviceMotionChange(motionHandler);
// 取消（需传入同一函数引用）
ks.offDeviceMotionChange(motionHandler);
```

---

## 常见误用 & 注意事项

- ⚠️ **必须先 start 再 on**：`onDeviceMotionChange` 注册的回调在 `startDeviceMotionListening` 后才会触发
- ⚠️ **停止时先 stop 再 off**：`stop` 停止底层传感器监听，`off` 取消 JS 层回调；顺序无关紧要但建议先 stop
- ⚠️ **interval 选择**：高频交互用 `game`（20ms/次，流畅但耗电），UI 更新用 `ui`（60ms/次），普通检测用 `normal`（200ms/次，省电）
- ⚠️ **后台自动停止**：切到后台时传感器监听可能被系统暂停，回前台需重新 `start`
- ⚠️ **耗电**：`game` 频率持续监听会显著耗电，不需要高频更新时不要使用
- ⚠️ **`off` 必须传同一函数引用**：匿名函数无法取消
- ⚠️ **alpha/beta/gamma 单位是弧度**：不是角度，显示给用户时需 `* 180 / Math.PI` 转换


# 陀螺仪模块

## 封装层

文件：`kwaiOpenApi/kwai-device.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-device.js');
```

```js
KwaiDevice.startGyroscope({ interval: 'game' });
KwaiDevice.onGyroscopeChange(function (res) { console.log(res.x, res.y, res.z); });
KwaiDevice.offGyroscopeChange(callback);
KwaiDevice.stopGyroscope();
```

---

## 底层 API 参考

## 概述

通过 `ks.startGyroscope` 开始监听陀螺仪数据，`ks.onGyroscopeChange` 注册回调（返回 `x` / `y` / `z` 三轴角速度），`ks.stopGyroscope` 停止监听，`ks.offGyroscopeChange` 取消回调。用于旋转操控、AR 姿态、设备转动检测。

> ⚠️ **必须先 start 再 on**：`onGyroscopeChange` 注册的回调在 `startGyroscope` 后才会触发。

> 💡 陀螺仪 vs 加速度计：陀螺仪测量**角速度**（设备旋转），加速度计测量**线性加速度**（设备移动），两者常配合做 6 轴体感。

---

## ks.startGyroscope — 开始监听陀螺仪数据

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| interval | `string` | `normal` | 否 | 监听回调的执行频率 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**interval 合法值：**

| 值 | 说明 |
|----|------|
| `game` | 约 20ms/次（50 FPS）|
| `ui` | 约 60ms/次（约 16 FPS）|
| `normal` | 约 200ms/次（5 FPS）|

### 标准调用示例

```ts
ks.startGyroscope({
  interval: 'game',
  success() {
    console.log('gyroscope started');
  },
});
```

---

## ks.onGyroscopeChange — 监听陀螺仪数据变化事件

### 概述

监听陀螺仪数据变化事件。频率根据 `ks.startGyroscope()` 的 `interval` 参数，可用 `ks.stopGyroscope()` 停止监听。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 陀螺仪数据变化事件的回调函数 |

**callback 接收参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| x | `number` | X 轴的角速度 |
| y | `number` | Y 轴的角速度 |
| z | `number` | Z 轴的角速度 |

> 💡 单位通常是 `rad/s`（弧度/秒），正值表示逆时针旋转。

### 标准调用示例

```ts
ks.onGyroscopeChange((res) => {
  console.log('x:', res.x, 'y:', res.y, 'z:', res.z);
  // 旋转检测：绕 Z 轴转动（如「拧瓶盖」玩法）
  if (Math.abs(res.z) > 1) {
    rotatePlayer(res.z);
  }
});

// 体感瞄准：用陀螺仪 + 加速度计控制方向
ks.startGyroscope({ interval: 'game' });
ks.startAccelerometer({ interval: 'game' });
function onGyroscopeChange(res) {
  // 角速度积分得到旋转角度
  yaw += res.z * deltaTime;
  pitch += res.x * deltaTime;
  updateAimCrosshair(yaw, pitch);
}
```

---

## ks.stopGyroscope — 停止监听陀螺仪数据

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

### 标准调用示例

```ts
ks.stopGyroscope({
  success() {
    console.log('gyroscope stopped');
  },
});
```

---

## ks.offGyroscopeChange — 取消监听陀螺仪数据

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 否 | 取消监听的事件回调，不传时取消所有监听 |

### 标准调用示例

```ts
const handler = (res) => { console.log('gyro:', res.x, res.y, res.z); };

ks.onGyroscopeChange(handler);
ks.offGyroscopeChange(handler);
```

---

## 常见误用 & 注意事项

- ⚠️ **必须先 start 再 on**
- ⚠️ **角速度需要积分**：陀螺仪返回的是角速度，要得到旋转角度需对时间积分：`angle += angularVelocity * deltaTime`
- ⚠️ **漂移误差**：积分会有累积误差，长时间使用需配合加速度计校准
- ⚠️ **耗电**：`game` 频率持续监听耗电，不需要高频更新时用 `normal`
- ⚠ **后台自动停止**：切后台传感器暂停，回前台需重新 `start`
- ⚠ **off 传同一函数引用**


# 加速度计模块

## 封装层

文件：`kwaiOpenApi/kwai-device.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-device.js');
```

```js
KwaiDevice.startAccelerometer({ interval: 'game' });
KwaiDevice.onAccelerometerChange(function (res) { console.log(res.x, res.y, res.z); });
KwaiDevice.offAccelerometerChange(callback);
KwaiDevice.stopAccelerometer();
```

---

## 底层 API 参考

## 概述

通过 `ks.startAccelerometer` 开始监听加速度数据，`ks.onAccelerometerChange` 注册回调（返回 `x` / `y` / `z` 三轴加速度），`ks.stopAccelerometer` 停止监听，`ks.offAccelerometerChange` 取消回调。用于摇一摇、重力感应控制、设备倾斜检测。

> ⚠️ **必须先 start 再 on**：`onAccelerometerChange` 注册的回调在 `startAccelerometer` 后才会触发。

> 💡 加速度计 vs 陀螺仪：加速度计测量**线性加速度**（设备移动），陀螺仪测量**角速度**（设备旋转），两者常配合使用做 6 轴体感。

---

## ks.startAccelerometer — 开始监听加速度数据

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
ks.startAccelerometer({
  interval: 'game',
  success() {
    console.log('accelerometer started');
  },
});
```

---

## ks.onAccelerometerChange — 监听加速度数据事件

### 概述

监听加速度数据事件。频率根据 `ks.startAccelerometer()` 的 `interval` 参数。接口调用后会自动开始监听。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 加速度数据事件的回调函数 |

**callback 接收参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| x | `number` | X 轴加速度 |
| y | `number` | Y 轴加速度 |
| z | `number` | Z 轴加速度 |

> 💡 单位通常是 `m/s²`，设备静止时 `z` 约为 9.8（重力）。

### 标准调用示例

```ts
ks.onAccelerometerChange((res) => {
  console.log('x:', res.x, 'y:', res.y, 'z:', res.z);
  // 摇一摇检测：三轴加速度绝对值之和超过阈值
  const magnitude = Math.abs(res.x) + Math.abs(res.y) + Math.abs(res.z);
  if (magnitude > 25) {  // 阈值 25（含重力 9.8）
    onShake();
  }
});

// 重力感应控制：用 x / y 值控制小球滚动
ks.startAccelerometer({ interval: 'game' });
function onAccelerometerChange(res) {
  ball.vx = res.x * 5;
  ball.vy = res.y * 5;
}
```

---

## ks.stopAccelerometer — 停止监听加速度数据

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

### 标准调用示例

```ts
ks.stopAccelerometer({
  success() {
    console.log('accelerometer stopped');
  },
});
```

---

## ks.offAccelerometerChange — 取消监听加速度数据

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 否 | 取消监听的事件回调，不传时取消所有监听 |

### 标准调用示例

```ts
const handler = (res) => { console.log('accel:', res.x, res.y, res.z); };

ks.onAccelerometerChange(handler);
// 取消
ks.offAccelerometerChange(handler);
```

---

## 常见误用 & 注意事项

- ⚠️ **必须先 start 再 on**
- ⚠️ **摇一摇阈值**：含重力（静止 z ≈ 9.8），阈值建议设 25 以上避免误触发
- ⚠️ **耗电**：`game` 频率持续监听耗电，不需要高频更新时用 `normal`
- ⚠ **后台自动停止**：切后台传感器暂停，回前台需重新 `start`
- ⚠ **off 传同一函数引用**


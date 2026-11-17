# 罗盘模块

## 封装层

文件：`kwaiOpenApi/kwai-device.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-device.js');
```

底层 API：`ks.startCompass` / `ks.onCompassChange`，通过 `KwaiDevice` 封装调用。

---

## 底层 API 参考

## 概述

通过 `ks.startCompass` 开始监听罗盘数据，`ks.onCompassChange` 注册回调（返回 `direction` 方向度数和 `accuracy` 精度），`ks.stopCompass` 停止监听，`ks.offCompassChange` 取消回调。可用于方向指引、指南针和地图导航等场景。

> ⚠️ **回调频率固定**：罗盘约 **5 次/秒**，不接受 `interval` 参数（与 motion/accelerometer/gyroscope 不同）。

> ⚠️ **accuracy 跨平台差异**：iOS 返回 `number`（磁北极偏差度数），Android 返回 `string` 枚举值。

---

## ks.startCompass — 开始监听罗盘数据

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

### 标准调用示例

```ts
ks.startCompass({
  success() {
    console.log('compass started');
  },
});
```

---

## ks.onCompassChange — 监听罗盘数据变化事件

### 概述

监听罗盘数据变化事件。频率 **5 次/秒**，接口调用后会自动开始监听，可用 `ks.stopCompass` 停止监听。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 罗盘数据变化事件的回调函数 |

**callback 接收参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| direction | `number` | 面对的方向度数 |
| accuracy | `number` / `string` | 精度（iOS 与 Android 不同，见下方）|

**accuracy 跨平台差异：**

| 平台 | 类型 | 说明 |
|------|------|------|
| iOS | `number` | 相对磁北极偏差度数：`0` = 指向磁北，`90` = 东，`180` = 南 |
| Android | `string` | 枚举值（见下表）|

**Android accuracy 合法值：**

| 值 | 说明 |
|----|------|
| `high` | 高精度 |
| `medium` | 中等精度 |
| `low` | 低精度 |
| `no-contact` | 不可信，传感器失去连接 |
| `unreliable` | 不可信，原因未知 |
| `unknown ${value}` | 未知的精度枚举值 |

### 标准调用示例

```ts
ks.onCompassChange((res) => {
  console.log('direction:', res.direction, 'accuracy:', res.accuracy);
  // 显示方向（0 = 北，90 = 东，180 = 南，270 = 西）
  updateCompassNeedle(res.direction);
  // 跨平台精度判断
  if (typeof res.accuracy === 'string') {
    // Android
    if (res.accuracy === 'high' || res.accuracy === 'medium') {
      showDirection(res.direction);
    } else {
      showLowAccuracyWarning();
    }
  } else {
    // iOS：number 类型
    if (res.accuracy < 15) {  // 偏差小于 15 度算高精度
      showDirection(res.direction);
    } else {
      showLowAccuracyWarning();
    }
  }
});
```

---

## ks.stopCompass — 停止监听罗盘数据

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

### 标准调用示例

```ts
ks.stopCompass({
  success() {
    console.log('compass stopped');
  },
});
```

---

## ks.offCompassChange — 取消监听罗盘数据

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 否 | 取消监听的事件回调，不传时取消所有监听 |

### 标准调用示例

```ts
const handler = (res) => { console.log('direction:', res.direction); };

ks.onCompassChange(handler);
ks.offCompassChange(handler);
```

---

## 常见误用 & 注意事项

- ⚠️ **频率固定 5 次/秒**：不接受 `interval` 参数，与 motion/accelerometer/gyroscope 不同
- ⚠️ **accuracy 跨平台差异**：iOS 是 number，Android 是 string，**必须用 `typeof` 判断后处理**
- ⚠️ **direction 单位是度数**：0-360，不是弧度
- ⚠️ **低精度时不要信任方向**：Android `low` / `unreliable` / `no-contact` 时方向可能不准，建议提示用户校准罗盘（「8 字形晃动手机」）
- ⚠️ **金属干扰**：靠近金属/磁铁会干扰罗盘，精度降低
- ⚠ **off 传同一函数引用**


# 网络状态模块

## 封装层

文件：`kwaiOpenApi/kwai-device.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-device.js');
```

```js
KwaiDevice.getNetworkType({ onSuccess: function (res) { console.log(res.networkType); } });
KwaiDevice.onNetworkStatusChange(function (res) { console.log(res.isConnected, res.networkType); });
KwaiDevice.offNetworkStatusChange(callback);
```

---

## 底层 API 参考

## 概述

通过 `ks.getNetworkType` 获取当前网络类型，`ks.onNetworkStatusChange` 监听网络状态变化（断网/重连、wifi/4G 切换），`ks.offNetworkStatusChange` 取消监听。用于网络异常提示、弱网优化、断网重连。

> ⚠️ **networkType 7 种值**：`wifi` / `2g` / `3g` / `4g` / `5g` / `unknown` / `none`。

---

## ks.getNetworkType — 获取网络类型

### 概述

获取设备当前所处的网络类型。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**success 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| networkType | `string` | 网络类型 |

**networkType 合法值：**

| 值 | 说明 |
|----|------|
| `wifi` | WiFi 网络 |
| `2g` | 2G 网络 |
| `3g` | 3G 网络 |
| `4g` | 4G 网络 |
| `5g` | 5G 网络 |
| `unknown` | 不常见的网络类型 |
| `none` | 无网络 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| errMsg | `string` | `"getNetworkType:fail " + 详细错误信息` |

### 标准调用示例

```ts
// 基础用法
ks.getNetworkType({
  success(res) {
    console.log('network type:', res.networkType);
    if (res.networkType === 'none') {
      KwaiUI.toastError('无网络，请检查网络设置');
    } else if (res.networkType === 'wifi') {
      // WiFi 下预加载大资源
      preloadLargeAssets();
    } else {
      // 移动网络下只加载必要资源
      preloadEssentialAssets();
    }
  },
  fail(res) {
    console.log('getNetworkType failed:', res.errMsg);
  },
});

// Promise 化
function getNetworkType() {
  return new Promise((resolve, reject) => {
    ks.getNetworkType({
      success: resolve,
      fail: reject,
    });
  });
}

// 启动时检测网络
async function checkNetworkOnStartup() {
  const res = await getNetworkType();
  if (res.networkType === 'none') {
    KwaiUI.showModal({
      title: '提示',
      content: '当前无网络，部分功能不可用',
      showCancel: false,
    });
  }
}
```

---

## ks.onNetworkStatusChange — 监听网络状态变化

### 概述

监听网络状态变化。网络断开/恢复、WiFi ↔ 移动数据切换时触发。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 网络状态变化的事件回调 |

**callback 接收参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| networkType | `string` | 当前网络类型（合法值同 `getNetworkType`）|
| isConnected | `boolean` | 当前是否有网络连接 |

### 标准调用示例

```ts
ks.onNetworkStatusChange((res) => {
  console.log('network changed, connected:', res.isConnected, 'type:', res.networkType);
  if (!res.isConnected) {
    // 断网：暂停在线功能、提示用户
    KwaiUI.toastError('网络已断开');
    pauseOnlineFeatures();
  } else {
    // 恢复网络：重连 WebSocket、重放失败请求
    KwaiUI.toastSuccess('网络已恢复');
    reconnectWebSocket();
    replayFailedRequests();
  }
  // 弱网检测
  if (res.isConnected && (res.networkType === '2g' || res.networkType === '3g')) {
    enableLowNetworkMode();
  }
});
```

---

## ks.offNetworkStatusChange — 取消监听网络状态变化

### 概述

移除网络状态变化事件的监听函数。不传参数则移除所有监听。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| listener | `function` | 否 | 要移除的事件回调，不传时移除所有监听 |

### 标准调用示例

```ts
const listener = (res) => {
  console.log('network:', res.isConnected, res.networkType);
};

ks.onNetworkStatusChange(listener);
// 取消（需传入同一函数对象）
ks.offNetworkStatusChange(listener);

// 取消所有监听
// ks.offNetworkStatusChange();
```

---

## 常见误用 & 注意事项

- ⚠️ **isConnected vs networkType**：`isConnected: false` 一定断网；`isConnected: true` 还需看 `networkType` 判断是 wifi 还是移动数据
- ⚠️ **none 和 unknown 区别**：`none` 是无网络，`unknown` 是有网络但类型不常见（如以太网、蓝牙共享网络）
- ⚠️ **弱网优化**：2G/3G 网络下避免大资源下载，只加载必要内容
- ⚠️ **断网重连**：`isConnected` 从 false 变 true 时重连 WebSocket、重放失败请求
- ⚠ **off 传同一函数引用**
- ⚠ **与 KwaiNetwork 模块配合**：`onNetworkStatusChange` 触发时通知 `KwaiNetwork` 重新发起请求或重连 WebSocket


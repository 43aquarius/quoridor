# 内存告警模块

## 封装层

文件：`kwaiOpenApi/kwai-device.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-device.js');
```

```js
KwaiDevice.onMemoryWarning(function (res) { console.log(res.level); });
```

---

## 底层 API 参考

## 概述

通过 `ks.onMemoryWarning` 监听系统内存不足告警事件，`ks.offMemoryWarning` 取消监听。收到告警时主动释放不必要的资源（如纹理缓存、离屏画布、临时数据），避免系统进一步加剧内存紧张后被杀进程。

> ⚠️ **告警 ≠ 杀进程**：触发告警不代表应用会立即退出，大部分情况下只是提醒，开发者有时间回收资源。

> ⚠️ **level 仅 Android**：iOS 不返回 `level`，需做空值判断。

---

## ks.onMemoryWarning — 监听内存不足告警

### 概述

监听内存不足告警事件。当 iOS/Android 向应用进程发出内存警告时触发。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 内存不足告警事件的回调函数 |

**callback 接收参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| level | `number` | 内存告警等级，**只有 Android 才有**，对应系统宏定义 |

**level 合法值（Android）：**

| 值 | 说明 |
|----|------|
| `5` | `TRIM_MEMORY_RUNNING_MODERATE` - 内存稍微紧张 |
| `10` | `TRIM_MEMORY_RUNNING_LOW` - 内存紧张 |
| `15` | `TRIM_MEMORY_RUNNING_CRITICAL` - 内存严重紧张 |

### 标准调用示例

```ts
ks.onMemoryWarning((res) => {
  console.log('memory warning, level:', res.level);
  // level 越高越紧急，按等级释放不同量级的资源
  if (res.level >= 15) {
    // 严重：释放所有非必要缓存
    clearTextureCache();
    clearOffscreenCanvases();
    clearAudioSfxPool();
  } else if (res.level >= 10) {
    // 紧张：释放低优先级缓存
    clearLowPriorityCache();
  } else if (res.level >= 5) {
    // 稍紧张：释放 LRU 末尾项
    clearLRUEnd();
  } else {
    // iOS 无 level，统一释放非必要缓存
    clearTextureCache();
  }
  KwaiEvent.emit('memory:warning', res);
});
```

---

## ks.offMemoryWarning — 取消监听内存告警

### 概述

取消监听内存不足告警事件。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 否 | 取消监听的事件回调，不传时取消所有监听 |

### 标准调用示例

```ts
const handler = (res) => {
  console.log('memory warning:', res.level);
};

ks.onMemoryWarning(handler);
ks.offMemoryWarning(handler);
```

---

## 常见误用 & 注意事项

- ⚠️ **level 仅 Android**：iOS 不返回 `level`，需 `if (res.level)` 判断
- ⚠️ **收到告警立即释放**：不要等下一帧，在回调里同步释放资源
- ⚠️ **释放策略**：按 level 高低释放不同量级，`critical`（15）时释放所有非必要资源
- ⚠️ **不要在告警时加载新资源**：告警时正内存紧张，加载会加剧问题
- ⚠ **off 传同一函数引用**
- ⚠ **与 `KwaiStorage` / `KwaiFile` 配合**：告警时清理文件缓存（`KwaiFile.cleanupOldCache`）、storage 旧 key（`KwaiStorage.cleanupExpiredCache`）


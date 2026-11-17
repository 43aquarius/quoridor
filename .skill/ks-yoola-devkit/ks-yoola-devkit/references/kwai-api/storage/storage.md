# 数据缓存模块

## 文件

`kwaiOpenApi/kwai-storage.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-storage.js');
```

## 调用方式

```js
// 同步读写（推荐小数据）
KwaiStorage.setSync('player_level', 5);
var level = KwaiStorage.getSync('player_level');
KwaiStorage.removeSync('player_level');
KwaiStorage.clearSync();

// 异步读写（推荐大对象）
KwaiStorage.set({
  key:       'game_progress',
  data:      { level: 5, score: 1200 },
  onSuccess: function () {},
  onFail:    function (err) {},
});

KwaiStorage.get({
  key:       'game_progress',
  onSuccess: function (data) { console.log(data); },
  onFail:    function (err)  {},
});

KwaiStorage.remove({
  key:       'game_progress',
  onSuccess: function () {},
  onFail:    function (err) {},
});
```

## 注意事项

- 单 key 数据上限 1MB，所有数据总上限 10MB
- 不支持 `Function` / `Symbol` / `RegExp` / 循环引用对象
- 快手运行环境不提供 `localStorage`，必须用 `ks.setStorage` 系列 API

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.setStorageSync` / `ks.getStorageSync` / `ks.removeStorageSync` / `ks.clearStorageSync` / `ks.setStorage` / `ks.getStorage` / `ks.removeStorage` → [storage.md](storage.md)

---

## 底层 API 参考

## 概述

将数据存储在本地缓存中指定的 key 中，用于存档、用户配置、缓存等场景。提供 5 类操作（`set` / `get` / `remove` / `info` / `clear`），每类均有异步回调版本（`Async` 风格，带 `success` / `fail` / `complete`）和同步版本（`Sync` 后缀，直接返回结果或抛异常）。

> ⚠️ **存储限制**：**单个 key 允许存储的最大数据长度为 1MB**，**所有数据存储上限为 10MB**。超出会触发 `fail` 或抛异常。

> ⚠️ **数据类型**：`data` 只支持原生类型（`string` / `number` / `boolean` / `null` / `undefined`）、`Date` 对象、以及能通过 `JSON.stringify` 序列化的对象。**不支持 `Function` / `Symbol` / `RegExp` / 循环引用对象**等。

> 💡 **与 Web 端的差异**：快手运行环境不提供 `localStorage` / `sessionStorage` / `indexedDB`，**必须用 `ks.setStorage` / `ks.getStorage` 等**。

---

## ks.setStorage — 异步存储数据

### 概述

将数据存储在本地缓存中指定的 key 中。**会覆盖掉原来该 key 对应的内容**。除非用户主动删除或因存储空间原因被系统清理，否则数据都一直可用。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| key | `string` | - | 是 | 本地缓存中指定的 key |
| data | `any` | - | 是 | 需要存储的内容。只支持原生类型、`Date`、及能够通过 `JSON.stringify` 序列化的对象 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

### 标准调用示例

```ts
// 基础用法：异步存值
ks.setStorage({
  key: 'user_token',
  data: 'abc123def456',
  success() {
    console.log('token saved');
  },
  fail(err) {
    console.error('save failed:', err.errMsg);
  },
});

// 存对象（会被 JSON.stringify 序列化）
ks.setStorage({
  key: 'game_progress',
  data: {
    level: 5,
    score: 1200,
    coins: 350,
    lastSaveTime: Date.now(),
  },
  success() {
    console.log('progress saved');
  },
});
```

### 常见误用 & 注意事项

- ⚠️ **会覆盖原 key 内容**，不会合并；要先读再改再存
- ⚠️ 单 key 上限 **1MB**，超出会 `fail`；存大对象（如图集、关卡数据）建议改用 `ks.downloadFile` 走文件系统
- ⚠️ 总存储上限 **10MB**，超出后系统会按 LRU 策略清理旧 key，**重要数据务必做好备份**
- ⚠️ `data` 不支持 `Function` / `Symbol` / `RegExp` / 循环引用对象，会 `fail` 或被静默丢弃
- ⚠️ `Date` 对象存储后会被序列化为 ISO 字符串，取出时**不会自动还原为 Date 对象**，需手动 `new Date(str)`

---

## ks.setStorageSync — 同步存储数据

### 概述

`ks.setStorage` 的同步版本，**立即返回**，失败时抛异常。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key | `string` | 是 | 本地缓存中指定的 key |
| data | `any` | 是 | 需要存储的内容。只支持原生类型、`Date`、及能够通过 `JSON.stringify` 序列化的对象 |

### 返回值

无（同步接口，失败时抛异常）。

### 标准调用示例

```ts
// 同步存值，必须 try/catch
try {
  ks.setStorageSync('user_token', 'abc123def456');
  console.log('saved');
} catch (e) {
  console.error('save failed:', e);
}

// 存对象
try {
  ks.setStorageSync('game_progress', {
    level: 5,
    score: 1200,
    lastSaveTime: new Date(),  // 注意：取出时是 ISO 字符串，需手动还原
  });
} catch (e) {
  // 存储失败（如超出 1MB / 总存储满）
  console.error('save progress failed:', e);
}
```

### 常见误用 & 注意事项

- ⚠️ 同步接口会**阻塞 JS 线程**，存大对象会卡帧；存小数据（配置、token、关卡进度）可用同步，存大数据建议异步
- ⚠️ **必须 `try/catch`**，否则异常会向上抛出导致崩溃
- ⚠️ 其他注意事项同 `ks.setStorage`（覆盖、1MB/10MB 限制、数据类型限制）

---

## ks.getStorage — 异步读取数据

### 概述

从本地缓存中异步获取指定 key 的内容。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| key | `string` | - | 是 | 本地缓存中指定的 key |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**success 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| data | `any` | key 对应的内容 |

### 标准调用示例

```ts
// 异步读取
ks.getStorage({
  key: 'user_token',
  success(res) {
    console.log('token:', res.data);
    if (res.data) {
      // 用 token 鉴权
    }
  },
  fail(err) {
    // key 不存在或读取失败
    console.log('no token, need login');
  },
});

// 读取存档对象
ks.getStorage({
  key: 'game_progress',
  success(res) {
    const progress = res.data;  // 已被 JSON.parse 还原为对象
    console.log('level:', progress.level, 'score:', progress.score);
    // 注意：Date 字段需手动还原
    if (progress.lastSaveTime) {
      progress.lastSaveTime = new Date(progress.lastSaveTime);
    }
  },
  fail() {
    // 没有存档，从默认值开始
    startNewGame();
  },
});
```

### 常见误用 & 注意事项

- ⚠️ `success` 触发时**不保证 key 存在**：部分容器对不存在的 key 也会触发 `success`，`res.data` 为 `''` 或 `undefined`；要严格判断是否存在用 `getStorageInfo` 的 `keys` 数组
- ⚠️ `data` 类型与 `setStorage` 时一致，但 `Date` 对象存储时被序列化为字符串，**取出后需手动 `new Date()` 还原**
- ⚠️ 异步接口，**不要在主循环里每帧调用**；启动时读一次缓存到内存，运行时从内存读

---

## ks.getStorageSync — 同步读取数据

### 概述

`ks.getStorage` 的同步版本，**立即返回** key 对应的内容。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key | `string` | 是 | 本地缓存中指定的 key |

### 返回值

| 类型 | 说明 |
|------|------|
| `any` | key 对应的内容。key 不存在时返回 `''`（空字符串）|

### 标准调用示例

```ts
// 同步读取，必须 try/catch
try {
  const token = ks.getStorageSync('user_token');
  if (token) {
    console.log('token:', token);
    // 用 token 鉴权
  } else {
    // 没有存 token，触发登录
    KwaiLogin.refresh();
  }
} catch (e) {
  // 读取异常（极少见）
  console.error('read failed:', e);
}

// 读取存档对象
try {
  const progress = ks.getStorageSync('game_progress');
  if (progress && progress.level) {
    // 还原 Date 字段
    if (progress.lastSaveTime) {
      progress.lastSaveTime = new Date(progress.lastSaveTime);
    }
    loadGameFromProgress(progress);
  } else {
    startNewGame();
  }
} catch (e) {
  console.error('read progress failed:', e);
}
```

### 常见误用 & 注意事项

- ⚠️ key 不存在时返回 **空字符串 `''`**（不是 `null` / `undefined`），**判断存在性用 `if (value)` 而非 `if (value !== null)`**
- ⚠️ 同步接口阻塞 JS 线程，存大对象读取会卡帧；启动时读一次缓存到内存，运行时从内存读
- ⚠️ 异常情况（极少见，如容器异常）会抛错，**必须 `try/catch`**
- ⚠️ `Date` 字段需手动还原（同异步版）

---

## ks.removeStorage — 异步移除数据

### 概述

从本地缓存中移除指定 key。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| key | `string` | - | 是 | 本地缓存中指定的 key |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

### 标准调用示例

```ts
// 退出登录时清掉 token
ks.removeStorage({
  key: 'user_token',
  success() {
    console.log('token removed');
    // 跳转登录页
    showLoginPage();
  },
  fail(err) {
    console.warn('remove failed:', err.errMsg);
  },
});
```

### 常见误用 & 注意事项

- ⚠️ key 不存在时**不报错**，`success` 正常触发
- ⚠️ 移除后**不可恢复**，重要数据移除前建议备份到服务器

---

## ks.removeStorageSync — 同步移除数据

### 概述

`ks.removeStorage` 的同步版本。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key | `string` | 是 | 本地缓存中指定的 key |

### 标准调用示例

```ts
try {
  ks.removeStorageSync('user_token');
  console.log('token removed');
} catch (e) {
  console.error('remove failed:', e);
}
```

### 常见误用 & 注意事项

- ⚠️ 同步接口阻塞 JS 线程，但移除操作通常很快，可放心使用
- ⚠️ key 不存在时不抛错
- ⚠️ **必须 `try/catch`**

---

## ks.getStorageInfo — 异步获取存储信息

### 概述

异步获取当前 storage 的相关信息（所有 key 列表、已用空间、总空间）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**success 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| keys | `Array<string>` | 当前 storage 中所有的 key |
| currentSize | `number` | 当前占用的空间大小，单位 KB |
| limitSize | `number` | 限制的空间大小，单位 KB |

### 标准调用示例

```ts
// 检查存储使用情况
ks.getStorageInfo({
  success(res) {
    console.log('keys:', res.keys);
    console.log('used:', res.currentSize, 'KB /', res.limitSize, 'KB');
    // 容量接近上限时清理旧缓存
    if (res.currentSize / res.limitSize > 0.8) {
      cleanupOldCache(res.keys);
    }
  },
});

// 判断 key 是否存在
function hasKey(key) {
  return new Promise((resolve) => {
    ks.getStorageInfo({
      success(res) {
        resolve(res.keys.indexOf(key) !== -1);
      },
      fail() {
        resolve(false);
      },
    });
  });
}
```

### 常见误用 & 注意事项

- ⚠️ `currentSize` / `limitSize` 单位是 **KB**（千字节），不是字节
- ⚠️ `keys` 是当前所有 key 的列表，**仅用于查询**，不要遍历做大量 `getStorage`，性能差
- ⚠️ 容量接近上限（如 80%+）时应主动清理旧缓存，避免存储满后系统 LRU 清理影响重要数据

---

## ks.getStorageInfoSync — 同步获取存储信息

### 概述

`ks.getStorageInfo` 的同步版本，**立即返回** storage 信息。

### 参数

无参数。

### 返回值

**Object object：**

| 属性 | 类型 | 说明 |
|------|------|------|
| keys | `Array<string>` | 当前 storage 中所有的 key |
| currentSize | `number` | 当前占用的空间大小，单位 KB |
| limitSize | `number` | 限制的空间大小，单位 KB |

### 标准调用示例

```ts
try {
  const res = ks.getStorageInfoSync();
  console.log('keys:', res.keys);
  console.log('used:', res.currentSize, 'KB /', res.limitSize, 'KB');
  // 存储用量超过 80% 时清理
  if (res.currentSize / res.limitSize > 0.8) {
    cleanupOldCache(res.keys);
  }
} catch (e) {
  console.error('getStorageInfoSync failed:', e);
}

// 同步判断 key 是否存在
function hasKeySync(key) {
  try {
    const res = ks.getStorageInfoSync();
    return res.keys.indexOf(key) !== -1;
  } catch (e) {
    return false;
  }
}
```

### 常见误用 & 注意事项

- ⚠️ 同步接口阻塞 JS 线程，但获取存储信息通常很快，可放心使用
- ⚠️ `currentSize` / `limitSize` 单位是 KB
- ⚠️ **必须 `try/catch`**

---

## ks.clearStorage — 异步清理存储

### 概述

清理本地数据缓存。**会清空所有 key**，慎用。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

### 标准调用示例

```ts
// 用户主动「重置应用」时清空所有缓存
ks.clearStorage({
  success() {
    console.log('storage cleared');
    // 重新启动应用
    restartGame();
  },
  fail(err) {
    console.error('clear failed:', err.errMsg);
  },
});

// 退出登录时清掉本地缓存（注意：清掉所有 key，包括应用设置）
ks.clearStorage({
  success() {
    showLoginPage();
  },
});
```

### 常见误用 & 注意事项

- ⚠️ **会清空所有 key**，包括用户设置、运行进度、token 等，**慎用**；建议先用 `ks.removeStorage` 精准移除
- ⚠️ 清理后**不可恢复**，重要数据清理前建议上传到服务器备份
- ⚠️ 「重置应用」「退出登录」等明确场景才用，不要在 `onHide` 里自动清理

---

## ks.clearStorageSync — 同步清理存储

### 概述

`ks.clearStorage` 的同步版本。

### 参数

无参数。

### 标准调用示例

```ts
try {
  ks.clearStorageSync();
  console.log('storage cleared');
  restartGame();
} catch (e) {
  console.error('clear failed:', e);
}
```

### 常见误用 & 注意事项

- ⚠️ **会清空所有 key**，慎用（同异步版）
- ⚠️ **必须 `try/catch`**

---

## 完整使用模式

### 启动时读取存档（同步 + 缓存到内存）

```ts
// 启动时一次性读取所有需要的存档，缓存到内存，运行时不再读 storage
let _progress = null;
let _settings = null;
let _token = null;

function loadAllFromStorage() {
  try {
    _progress = ks.getStorageSync('game_progress') || defaultProgress();
    _settings = ks.getStorageSync('user_settings') || defaultSettings();
    _token = ks.getStorageSync('user_token') || '';
    // 还原 Date 字段
    if (_progress.lastSaveTime) {
      _progress.lastSaveTime = new Date(_progress.lastSaveTime);
    }
    console.log('[Storage] all loaded');
  } catch (e) {
    console.error('[Storage] load failed:', e);
  }
}

// 运行时从内存读，不再调 storage
function getProgress() { return _progress; }
function getSettings() { return _settings; }
function getToken() { return _token; }
```

### 关卡完成时保存进度（异步）

```ts
function saveProgress() {
  // 更新内存
  _progress.level = currentLevel;
  _progress.score = currentScore;
  _progress.lastSaveTime = new Date();  // 会被序列化为字符串

  // 异步写回 storage
  ks.setStorage({
    key: 'game_progress',
    data: _progress,
    success() {
      console.log('[Storage] progress saved');
    },
    fail(err) {
      console.error('[Storage] save failed:', err.errMsg);
      // 失败时尝试上传到服务器作为备份
      uploadBackupToServer(_progress);
    },
  });
}
```

### 容量监控与自动清理

```ts
function checkStorageAndCleanup() {
  try {
    const info = ks.getStorageInfoSync();
    console.log(`[Storage] ${info.currentSize}/${info.limitSize} KB, ${info.keys.length} keys`);
    // 用量超过 80% 时清理过期缓存
    if (info.currentSize / info.limitSize > 0.8) {
      cleanupExpiredCache(info.keys);
    }
  } catch (e) {
    console.error('[Storage] check failed:', e);
  }
}

function cleanupExpiredCache(allKeys) {
  // 按 key 前缀筛选临时缓存（如 cache_xxx）
  const cacheKeys = allKeys.filter((k) => k.startsWith('cache_'));
  cacheKeys.forEach((key) => {
    ks.removeStorageSync(key);
  });
  console.log(`[Storage] cleaned ${cacheKeys.length} cache keys`);
}
```

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **数据本地缓存**：完成阶段或退出时保存进度、积分、解锁状态 → `ks.setStorage`（异步）或 `ks.setStorageSync`（同步）
- **启动时还原数据**：应用启动 → `ks.getStorageSync` 一次性读取缓存到内存，运行时从内存读取
- **用户配置**：音效开关、画质、控制方式等配置 → `ks.setStorageSync` / `ks.getStorageSync`
- **登录态 token 缓存**：登录成功后存 token；启动时读取复用 → `ks.setStorageSync('user_token', token)` / `ks.getStorageSync('user_token')`
- **退出登录清理**：用户主动退出登录时清 token 和用户相关数据 → `ks.removeStorage('user_token')` 等
- **容量监控**：定期检查 `ks.getStorageInfoSync()`，容量接近上限时自动清理临时缓存

推荐：在 `gameplay/kwai-storage.js` 中封装统一的存储管理器：
- 启动时一次性同步读取所有 key，缓存到内存对象 `_state`
- 运行时业务模块通过 `KwaiStorage.get(key)` 同步从内存读，不触发 storage IO
- 修改时同时更新内存 + 异步写回 storage（`set` 是 fire-and-forget 模式）
- 提供容量监控 + 自动清理过期缓存（按 key 前缀）
- 重要数据（如存档）写入失败时自动上传到服务器作为备份

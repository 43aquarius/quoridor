# Feed 流直出模块

## 封装层

文件：`kwaiOpenApi/kwai-open.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-open.js');
```

```js
// 监听 Feed 状态变化（需快手版本 >= 14.4.10）
KwaiOpen.onFeedStatusChange(function (res) {
  // res.type: 'feedEnter' | 'feedExit'
  console.log(res.type);
});
KwaiOpen.offFeedStatusChange(callback);
```

---

## 底层 API 参考

## 概述

通过 `ks.onFeedStatusChange` 监听用户从快手 Feed 流进入或退出应用的事件，用于精准埋点、Feed 流来源归因和体验优化。

> ⚠️ **最低容器版本**：快手版本 >= `14.4.10`（Android / iOS 快手 App 版本），低版本需做兼容处理。
>
> ⚠️ **注册时机要求**：若事件监听注册得**晚于进入应用的动作**，将无法接收到进入事件。因此必须在启动最早阶段（根目录 `game.js` 顶部）注册监听。

---

## ks.onFeedStatusChange — 监听 Feed 流进出事件

### 概述

监听 Feed 流进入/退出应用事件。用户从快手首页推荐流点击卡片进入应用时触发 `feedEnter`，从应用返回 Feed 流时触发 `feedExit`。

### 最低容器版本

| 平台 | 最低版本 |
|------|---------|
| Android 快手 App | `14.4.10` |
| iOS 快手 App | `14.4.10` |

> 低版本调用会报错或无回调，需做兼容处理（`if (ks.onFeedStatusChange)` 判断）。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 直玩场景内外流切换的事件回调 |

**callback 接收参数 Object：**

| 属性 | 类型 | 说明 |
|------|------|------|
| type | `string` | 事件类型 |

**type 合法值：**

| 值 | 说明 |
|----|------|
| `feedEnter` | 从 Feed 流进入应用 |
| `feedExit` | 退出应用并回到 Feed 流 |

### 标准调用示例

```ts
// 1) 基础用法：监听 Feed 流进出事件
ks.onFeedStatusChange(({ type }) => {
  if (type === 'feedEnter') {
    console.log('触发从 Feed 流进入应用事件回调');
    // 埋点：Feed 流进入
    reportEvent('feed_enter');
    // 标记来源
    window._entryFromFeed = true;
  }
  if (type === 'feedExit') {
    console.log('触发从应用退回 Feed 流事件回调');
    // 埋点：退出到 Feed 流
    reportEvent('feed_exit');
    // 保存当前进度（用户可能要离开了）
    saveProgressBeforeExit();
  }
});
```

```ts
// 2) 兼容低版本（< 14.4.10）
function setupFeedListener() {
  if (typeof ks.onFeedStatusChange !== 'function') {
    console.log('[Feed] 当前快手版本不支持 onFeedStatusChange，需 >= 14.4.10');
    return;
  }
  ks.onFeedStatusChange(({ type }) => {
    handleFeedStatusChange(type);
  });
}

function handleFeedStatusChange(type) {
  if (type === 'feedEnter') {
    // 从 Feed 流进入：上报来源、加载直玩模式
    KwaiEvent.emit('feed:enter');
    reportEvent('feed_enter', { ts: Date.now() });
  } else if (type === 'feedExit') {
    // 退出到 Feed 流：保存进度、上报停留时长
    KwaiEvent.emit('feed:exit');
    reportEvent('feed_exit', { ts: Date.now(), duration: getPlayDuration() });
    saveProgressBeforeExit();
  }
}
```

```ts
// 3) 与生命周期事件配合
function setupFeedIntegration() {
  // Feed 流进入：标记来源，跳过开场动画直接进入主菜单
  KwaiEvent.on('feed:enter', () => {
    window._entryFromFeed = true;
    // 跳过开场动画
    skipIntroVideo();
    // 直接进入主菜单
    enterMainMenu();
  });

  // Feed 流退出：保存进度，避免用户回来后丢失
  KwaiEvent.on('feed:exit', () => {
    const progress = getCurrentProgress();
    KwaiStorage.set('game_progress', progress);
    KwaiFile.saveJSON('progress', progress).catch(() => {});
  });

  // 注册 Feed 监听（必须在启动最早阶段）
  setupFeedListener();
}
```

### 常见误用 & 注意事项

- ⚠️ **注册时机要早**：必须在应用启动的最早阶段（根目录 `game.js` 顶部）注册，否则可能错过 `feedEnter` 事件
- ⚠️ **低版本兼容**：快手版本 < `14.4.10` 时 `ks.onFeedStatusChange` 不存在或无回调，需用 `if (typeof ks.onFeedStatusChange === 'function')` 判断
- ⚠️ **feedEnter 只触发一次**：从 Feed 流进入时触发一次，不会重复触发；`feedExit` 在用户退出回 Feed 流时触发
- ⚠️ **与 `kwai:show`/`kwai:hide` 区别**：`feedEnter`/`feedExit` 是 Feed 流直玩场景的进出，`kwai:show`/`kwai:hide` 是前后台切换，两者**不冲突**，可能组合触发
- ⚠️ **callback 不能是匿名函数**（如需 `offFeedStatusChange` 取消）：必须保存函数引用

---

## ks.offFeedStatusChange — 取消监听 Feed 流进出事件

### 概述

取消监听 Feed 流进入/退出应用事件。传 `callback` 取消指定监听，不传则取消所有监听。

### 最低容器版本

| 平台 | 最低版本 |
|------|---------|
| Android 快手 App | `14.4.10` |
| iOS 快手 App | `14.4.10` |

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 否 | 取消监听直玩内外流切换的事件，不传时将取消所有事件监听 |

### 标准调用示例

```ts
// 1) 基础用法：保存函数引用，取消指定监听
function feedChangeCallback({ type }) {
  console.log('feed 流事件', type);
  if (type === 'feedEnter') {
    reportEvent('feed_enter');
  } else if (type === 'feedExit') {
    reportEvent('feed_exit');
  }
}

// 注册事件监听
ks.onFeedStatusChange(feedChangeCallback);

// 取消事件监听（需传入同一函数引用）
ks.offFeedStatusChange(feedChangeCallback);
```

```ts
// 2) 取消所有监听（不传 callback）
ks.offFeedStatusChange();  // 取消所有 Feed 监听
```

```ts
// 3) 封装：在模块销毁时自动取消
const FeedListener = {
  _callback: null,

  on(callback) {
    if (typeof ks.onFeedStatusChange !== 'function') return;
    this._callback = callback;
    ks.onFeedStatusChange(callback);
  },

  off() {
    if (typeof ks.offFeedStatusChange !== 'function') return;
    if (this._callback) {
      ks.offFeedStatusChange(this._callback);
      this._callback = null;
    }
  },
};

// 启动时注册
FeedListener.on(({ type }) => {
  if (type === 'feedEnter') {
    KwaiEvent.emit('feed:enter');
  } else if (type === 'feedExit') {
    KwaiEvent.emit('feed:exit');
  }
});

// 退出时取消（如切到后台不再需要 Feed 监听）
KwaiEvent.on('kwai:hide', () => {
  // 注意：feedExit 本身依赖监听，不能在 kwai:hide 时取消
  // 只在确定不再需要时取消
});
```

### 常见误用 & 注意事项

- ⚠️ **必须传入同一函数引用**：取消指定监听时必须传入 `onFeedStatusChange` 注册时的同一函数引用，**匿名函数无法取消**
- ⚠️ **不传 callback 取消所有**：`offFeedStatusChange()` 不传参数会取消所有 Feed 监听，慎用
- ⚠️ **低版本兼容**：快手版本 < `14.4.10` 时 `ks.offFeedStatusChange` 不存在，需用 `if` 判断
- ⚠️ **不要在 feedExit 回调内取消监听**：会导致下次进入时无法监听到 `feedEnter`

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **Feed 流来源归因**：从 Feed 流进入时打埋点 `feed_enter`，退出时打 `feed_exit` + 停留时长
- **直玩模式跳过开场**：从 Feed 流进入时跳过开场动画，直接进入主菜单/战斗
- **退出前保存进度**：用户退回 Feed 流时主动保存进度，避免下次回来丢失
- **A/B 测试分组**：根据是否从 Feed 流进入做不同分组（如新用户引导流程）

推荐：在 `gameplay/kwai-open.js` 中封装：
- `onFeedStatusChange(callback)` 带低版本兼容判断
- `offFeedStatusChange(callback)` 带低版本兼容判断
- 启动最早阶段（根目录 `game.js` 顶部）注册监听，emit `feed:enter` / `feed:exit` 事件
- 业务模块订阅 `feed:enter` / `feed:exit`，不直接调 `ks.onFeedStatusChange`
- `feed:exit` 时自动 `KwaiStorage.set('game_progress', ...)` + `KwaiFile.saveJSON(...)` 双保存
- 配合 `KwaiNetwork` 上报埋点 `feed_enter` / `feed_exit` + `duration`

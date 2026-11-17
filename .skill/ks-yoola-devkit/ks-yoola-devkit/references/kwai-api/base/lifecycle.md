# 生命周期模块

## 封装层

文件：`kwaiOpenApi/kwai-base.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-base.js');
```

```js
var opts = KwaiBase.getLaunchOptions();
KwaiBase.onShow(function (res) { console.log('回前台', res.from); });
KwaiBase.onHide(function ()    { console.log('进后台'); });
KwaiBase.offShow(callback);
KwaiBase.offHide(callback);
KwaiBase.exit();
```

---

## 底层 API 参考

## 概述

管理应用冷启动/热启动参数获取、前后台切换监听和退出等生命周期事件。冷启动参数通过 `ks.getLaunchOptionsSync` 获取；热启动（从后台被唤起）参数通过 `ks.onShow` 回调获取。`ks.onHide` 监听进入后台事件，`ks.offShow` / `ks.offHide` 用于取消监听，`ks.exitMiniProgram` 主动退出当前应用。

---

## ks.getLaunchOptionsSync — 获取冷启动参数

### 概述

获取玩法**冷启动**时的参数。**热启动**参数通过 [ks.onShow](#ksonshow--监听回到前台事件) 接口获取。

### 参数

无参数。

### 返回值

| 属性 | 类型 | 说明 |
|------|------|------|
| from | `string` | 应用启动场景 |
| query | `Object` | 启动应用时传入的参数（键值对）|

### 标准调用示例

```ts
// 应用启动时同步获取冷启动参数
const launchOptions = ks.getLaunchOptionsSync();
console.log('launch scene:', launchOptions.from);
console.log('launch query:', launchOptions.query);

// 常见用法：解析分享/邀请链接携带的参数
if (launchOptions.query && launchOptions.query.from === 'share') {
  // ⚠️ query 值可能被 URL 编码（如分享链接里的中文/特殊字符），使用前需 decodeURIComponent
  const level = parseInt(decodeURIComponent(launchOptions.query.level || '1'), 10);
  const score = parseInt(decodeURIComponent(launchOptions.query.score || '0'), 10);
  // 进入挑战模式，目标分数为分享者留下的分数
  enterChallengeMode(level, score);
}

// 推荐：统一解码 query 的所有 value（仅对字符串值 decode，避免误伤数字/布尔）
function decodeQuery(query) {
  if (!query) return {};
  const out = {};
  for (const k in query) {
    const v = query[k];
    out[k] = typeof v === 'string' ? safeDecode(v) : v;
  }
  return out;
}
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; } // 非法编码原样返回，避免崩溃
}
```

### 常见误用 & 注意事项

- ⚠️ 只能拿到**冷启动**参数，热启动（切到后台再回前台）必须用 `ks.onShow` 接收
- ⚠️ 必须在启动早期（根目录 `game.js` 首屏）调用一次并缓存，否则后续拿不到冷启动场景
- ⚠️ `query` 的键值都是字符串，数字类型需要手动 `parseInt` / `parseFloat`
- ⚠️ `query` 的 value 可能被 **URL 编码**（分享链接 / deeplink 携带中文、空格、`&`、`=` 等特殊字符时会转义），使用前需 `decodeURIComponent`，并包裹 `try/catch` 防止非法编码抛错

---

## ks.onShow — 监听回到前台事件

### 概述

监听应用回到前台事件。从后台被唤起、被其他 App 切回时触发；**热启动参数**通过回调参数带回。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `(res: { from: string, query: Object }) => void` | 是 | 应用回到前台事件的回调函数 |

**callback 参数 res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| from | `string` | 应用启动场景 |
| query | `Object` | 启动应用时传入的参数 |

### 标准调用示例

```ts
// 注册全局回到前台回调
const onShowCallback = (result) => {
  console.log('OnShow callback, result:', JSON.stringify(result));
  // 热启动参数：可能携带新的 query（如新分享链接），value 可能 URL 编码，先解码再使用
  if (result.query && result.query.from === 'share') {
    refreshChallengeTarget(decodeQuery(result.query));
  }
  // 回到前台：恢复主循环、BGM、刷新广告频控时间
  resumeGameLoop();
  resumeBgm();
  resetAdThrottle();
};
ks.onShow(onShowCallback);

// decodeQuery / safeDecode 同 getLaunchOptionsSync 示例，建议抽到公共工具
```

### 常见误用 & 注意事项

- ⚠️ `onShow` 触发时应用可能已暂停，务必在回调里恢复主循环、BGM、广告频控时间
- ⚠️ 不要在回调里做重计算或网络请求，避免回到前台首帧卡顿
- ⚠️ `onShow` 监听器**全局累积**，不要在多个模块各自注册同名回调，统一在一处管理
- ⚠️ 想取消监听必须保留 callback 引用，传给 `ks.offShow`
- ⚠️ 热启动 `query` 同样可能 URL 编码，使用前需 `decodeURIComponent`（包裹 `try/catch` 防非法编码）

---

## ks.onHide — 监听进入后台事件

### 概述

监听应用隐藏到后台事件。锁屏、按 HOME 键退到桌面等操作会触发此事件。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `() => void` | 是 | 应用隐藏到后台事件的回调函数（无参数）|

### 标准调用示例

```ts
// 注册全局进入后台回调
const onHideCallback = () => {
  console.log('OnHide callback');
  // 进入后台：暂停主循环、BGM、记录暂停时间戳用于广告频控补偿
  pauseGameLoop();
  pauseBgm();
  window._hideTimestamp = Date.now();
};
ks.onHide(onHideCallback);
```

### 常见误用 & 注意事项

- ⚠️ `onHide` 触发后玩法代码仍有有限运行时间，**禁止继续播放 BGM/音效**（合规要求），必须立即 `pauseBgm()`
- ⚠️ 不要在回调里调用渲染密集型 API，进入后台后渲染无意义
- ⚠️ 想取消监听必须保留 callback 引用，传给 `ks.offHide`

---

## ks.offShow — 取消监听回到前台事件

### 概述

取消监听应用回到前台事件。需要传入**之前注册过的同一个 callback 引用**，匿名函数无法取消。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 之前通过 `ks.onShow` 注册的回调函数引用 |

### 标准调用示例

```ts
// 必须保留 onShow 时的同一个 callback 引用
ks.offShow(onShowCallback);
```

### 常见误用 & 注意事项

- ⚠️ 传入的 callback 必须与 `ks.onShow` 注册时的引用**完全一致**，传匿名函数无效
- ⚠️ 应用运行期间通常不需要 `offShow`，除非某个场景明确不再关心回到前台事件（如某个临时面板关闭）
- ⚠️ 重复 `offShow` 同一 callback 不会报错，但无意义

---

## ks.offHide — 取消监听进入后台事件

### 概述

取消监听应用隐藏到后台事件。需要传入**之前注册过的同一个 callback 引用**。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 之前通过 `ks.onHide` 注册的回调函数引用 |

### 标准调用示例

```ts
// 必须保留 onHide 时的同一个 callback 引用
ks.offHide(onHideCallback);
```

### 常见误用 & 注意事项

- ⚠️ 传入的 callback 必须与 `ks.onHide` 注册时的引用**完全一致**，传匿名函数无效
- ⚠️ 应用运行期间通常不需要 `offHide`，全局一直监听到应用退出即可

---

## ks.exitMiniProgram — 退出当前应用

### 概述

退出当前应用并回到宿主环境。**调用后运行实例会立即销毁**，后续代码不保证执行。

### 参数

无参数。

### 标准调用示例

```ts
// 用户在「确认退出」对话框点击确认后调用
function onConfirmExit() {
  // 退出前做必要清理：上报埋点、保存存档
  reportEvent('game_exit');
  saveArchiveToStorage();
  // 真正退出
  ks.exitMiniProgram();
}
```

### 常见误用 & 注意事项

- ⚠️ 调用 `exitMiniProgram` 后运行实例立即销毁，**不要在此调用后再依赖异步操作完成**（如 fetch / setTimeout）
- ⚠️ 退出前必须同步完成存档保存、埋点上报（异步上报不保证送达，重要数据建议提前定期保存）
- ⚠️ **不要在首帧或未告知用户时主动调用**，应通过明确 UI 操作（如「退出」按钮）触发
- ⚠️ 误调用会中断用户当前操作，体验较差

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **启动初始化**：应用首屏调 `getLaunchOptionsSync` 读 query 参数（用于分享落页、邀请挑战、广告 deeplink）
- **全局生命周期管理**：注册 `onShow` / `onHide`，统一管理 BGM、主循环、广告频控
- **退出确认对话框**：用户点击「退出」按钮 → 同步保存存档 + 上报埋点 → `ks.exitMiniProgram()`
- **长时间后台补偿**：在 `onHide` 记录时间戳，`onShow` 计算后台时长用于离线收益结算、广告频控补偿

推荐：在 `gameplay/kwai-event-bus.js` 加载之后、核心脚本之前，新增 `gameplay/kwai-lifecycle.js` 统一管理生命周期，对外通过事件总线 `kwai:show` / `kwai:hide` / `kwai:launch` 暴露，各业务模块按需订阅，避免散落各处。

> 💡 **query 解码**：`getLaunchOptionsSync` / `onShow` 返回的 `query` 值可能被 URL 编码（分享链接 / deeplink 常见），统一在 `kwai-lifecycle.js` 里用 `decodeQuery` 解码后再分发 `kwai:launch` / `kwai:show` 事件，业务侧拿到的就是已解码的可读字符串。

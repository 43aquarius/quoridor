# 录制模块

## 文件

`kwaiOpenApi/kwai-record.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-record.js');
```

## 调用方式

```js
// 监听录制事件（先注册，再开始）
KwaiRecord.on('start',  function ()    {});
KwaiRecord.on('stop',   function (res) { var videoID = res.videoID; });
KwaiRecord.on('pause',  function ()    {});
KwaiRecord.on('resume', function ()    {});
KwaiRecord.on('abort',  function ()    {});
KwaiRecord.on('error',  function (res) { console.warn(res.error.code, res.error.msg); });

// 开始 / 停止 / 暂停 / 恢复 / 中止
KwaiRecord.start();
KwaiRecord.stop();
KwaiRecord.pause();
KwaiRecord.resume();
KwaiRecord.abort();

// 发布录制视频
KwaiRecord.publishVideo({
  video:     videoID,
  query:     'from=game',
  mouldId:   'xxx',
  onSuccess: function () {},
  onFail:    function (err) { console.warn(err.code, err.msg); },
});
```

## 注意事项

- 录制时长限制：3s ~ 300s
- 需「普通模式」或「高性能+」，「超高性能」不支持录制

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.getGameRecorder` → `GameRecorder`（`start` / `stop` / `pause` / `resume` / `abort` / `on` / `publishVideo`）→ [record.md](record.md)

---

## 底层 API 参考

## 概述

通过 `ks.getGameRecorder` 获取全局唯一的画面录制对象 `GameRecorder`，用于录制、暂停/恢复/取消录制，以及将录屏发布到快手。录制完成后可获取 `videoID`，通过 `publishVideo` 发布到快手，支持携带 `query` 参数实现分享-落页-还原闭环。

> ⚠️ **录制时长限制**：录制时间需 `>=3s` 且 `<=300s`，超出会触发 `RecordFailedTimeRangeTooShort` / `RecordFailedTimeRangeTooLong` 错误。

> ⚠️ **状态机**：录制有 3 个状态（idle / recording / paused），方法调用必须符合状态转换规则，否则会触发错误（如录制中调 `start` → `StartWhileAlreadyStartRecording`）。

> ⚠️ **publishVideo 需先 stop**：发布前必须先 `stop` 结束录制获取 `videoID`，录制中发布会失败。

> ⚠️ **iOS 运行模式限制（重要）**：iOS 端录制功能受运行模式限制，各模式支持情况如下：

| 运行模式 | 是否支持录制 | 是否需白名单 | 说明 |
|---------|:----------:|:----------:|------|
| **普通模式**（默认） | ✅ 支持 | ❌ 不需要 | 默认运行模式，开箱即用 |
| **高性能+ 模式** | ✅ 支持 | ✅ 需白名单 | 需联系平台支持团队配置白名单后方可使用 |
| **高性能模式** | ❌ **不支持** | ✅ 需白名单 | **录制功能完全不可用**，会触发 `GameRecorder_NotSupported`；即使加白名单也无法录制，仅能启用该模式本身 |

> 💡 **默认运行模式是普通模式**，普通模式开箱即支持录制，无需任何配置。
>
> ⚠️ **若项目需启用 iOS 高性能 / 高性能+ 模式**：必须先联系**平台支持团队**配置白名单。高性能模式下录制不可用，业务需做兜底（如隐藏录制按钮、提示「高性能模式暂不支持录制」）；高性能+ 模式下录制可用但仍需白名单。可通过 `ks.getSystemInfoSync()` 的相关字段判断当前运行模式。

---

## ks.getGameRecorder — 获取录制对象

### 概述

获取全局唯一的画面录制对象。

### 参数

无参数。

### 返回值

| 类型 | 说明 |
|------|------|
| `GameRecorder` | 全局唯一的画面录制对象 |

### 标准调用示例

```ts
const recorder = ks.getGameRecorder();
// 后续所有录制操作都通过 recorder 调用
```

---

## GameRecorder 对象

`ks.getGameRecorder` 返回的全局唯一实例，包含录制控制和事件监听方法。

### 方法清单

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `start()` | 无 | 开始录制画面 |
| `stop()` | `Promise` | 结束录制，结束后可发起分享 |
| `pause()` | `Promise` | 暂停录制 |
| `resume()` | `Promise` | 恢复录制 |
| `abort()` | `Promise` | 放弃录制，已录制内容被丢弃 |
| `on(event, callback)` | 无 | 注册监听录制事件 |
| `off(event, callback)` | 无 | 取消监听录制事件 |
| `publishVideo(opts)` | 无 | 发布录屏到快手 |

### 状态机

```
         start()              stop()
  idle ──────────► recording ──────────► idle (with videoID)
                       │  ▲                  
              pause()  │  │ resume()         
                       ▼  │                  
                    paused                  
                       │                      
              abort()  │                      
                       ▼                      
                    idle (no videoID)          
```

### 标准调用示例

```ts
// 完整录制+发布流程
const recorder = ks.getGameRecorder();

// 1) 注册事件监听（必须在 start 前注册）
recorder.on('start', () => {
  console.log('录制开始');
  showRecordingIndicator();
});
recorder.on('stop', (res) => {
  console.log('录制结束, videoID:', res.videoID);
  hideRecordingIndicator();
  // 保存 videoID 供发布使用
  window._lastVideoID = res.videoID;
});
recorder.on('error', (res) => {
  console.error('录制错误:', res.error.code, res.error.msg);
  hideRecordingIndicator();
  handleError(res.error.code);
});
recorder.on('pause', () => {
  console.log('录制暂停');
  updatePauseIndicator();
});
recorder.on('resume', () => {
  console.log('录制恢复');
  updateRecordingIndicator();
});
recorder.on('abort', () => {
  console.log('录制取消');
  hideRecordingIndicator();
});

// 2) 开始录制
recorder.start();

// 3) 结束录制（返回 Promise）
recorder.stop()
  .then(() => {
    console.log('stop promise resolved');
    // 4) 发布到快手
    return publishToKuaishou(window._lastVideoID);
  })
  .catch((err) => {
    console.error('stop failed:', err);
  });

// 发布函数
function publishToKuaishou(videoID) {
  return new Promise((resolve, reject) => {
    recorder.publishVideo({
      video: videoID,
      query: `score=${getScore()}&level=${getCurrentLevel()}`,
      callback: (error) => {
        if (error) {
          console.error('发布失败:', error.code, error.msg);
          reject(error);
        } else {
          console.log('发布成功');
          resolve();
        }
      },
    });
  });
}
```

---

## GameRecorder.start — 开始录制

### 概述

开始录制画面。

### 参数

无参数。

### 返回值

无（同步调用，通过 `on('start', ...)` 事件确认真正开始录制）。

### 标准调用示例

```ts
const recorder = ks.getGameRecorder();
recorder.start();
// on('start') 事件触发后才真正开始录制
```

### 常见误用

- ⚠️ 录制中调 `start` → `StartWhileAlreadyStartRecording`
- ⚠️ 暂停中调 `start` → `StartWhilePaused`（需用 `resume` 恢复）
- ⚠️ **iOS 高性能模式下 `start` 会失败**：触发 `GameRecorder_NotSupported`，需在 UI 上隐藏录制入口或提示「高性能模式暂不支持录制，请切换至普通模式或高性能+ 模式」。详见顶部「iOS 运行模式限制」

---

## GameRecorder.stop — 结束录制

### 概述

结束录制。**结束后可以发起分享**。

### 参数

无参数。

### 返回值

| 类型 | 说明 |
|------|------|
| `Promise` | 录制结束的 Promise，resolve 后可通过 `on('stop')` 事件获取 `videoID` |

### 标准调用示例

```ts
recorder.stop()
  .then(() => {
    console.log('录制已结束');
    // videoID 在 on('stop') 事件回调中获取
  })
  .catch((err) => {
    console.error('stop failed:', err.error.code);
  });
```

### 常见误用

- ⚠️ 未开始录制调 `stop` → `StopWhileNotStartRecording`
- ⚠️ 录制时间 < 3s → `RecordFailedTimeRangeTooShort`
- ⚠️ 录制时间 > 300s → `RecordFailedTimeRangeTooLong`

---

## GameRecorder.pause — 暂停录制

### 概述

暂停录制。

### 参数

无参数。

### 返回值

| 类型 | 说明 |
|------|------|
| `Promise` | 暂停完成的 Promise |

### 标准调用示例

```ts
// 切换到暂停菜单时暂停录制
function onPauseGame() {
  recorder.pause().then(() => {
    console.log('录制已暂停');
  });
}
```

### 常见误用

- ⚠️ 未开始录制调 `pause` → `PauseWhileNotStartRecording`
- ⚠️ 已暂停再调 `pause` → `PauseWhileAlreadyPaused`

---

## GameRecorder.resume — 恢复录制

### 概述

恢复录制。**只能在暂停状态下调用**。

### 参数

无参数。

### 返回值

| 类型 | 说明 |
|------|------|
| `Promise` | 恢复完成的 Promise |

### 标准调用示例

```ts
// 从暂停菜单返回时恢复录制
function onResumeGame() {
  recorder.resume().then(() => {
    console.log('录制已恢复');
  });
}
```

### 常见误用

- ⚠️ 未开始录制调 `resume` → `ResumeWhileNotStartRecording`
- ⚠️ 录制中调 `resume` → `ResumeWhileRecording`（只能在暂停状态调）

---

## GameRecorder.abort — 放弃录制

### 概述

放弃录制。**已录制的内容会被丢弃**，不会生成 `videoID`。

### 参数

无参数。

### 返回值

| 类型 | 说明 |
|------|------|
| `Promise` | 取消完成的 Promise |

### 标准调用示例

```ts
// 用户取消录制
function onCancelRecord() {
  recorder.abort().then(() => {
    console.log('录制已取消，内容丢弃');
    hideRecordingIndicator();
  });
}
```

### 常见误用

- ⚠️ 未开始录制调 `abort` → `AbortWhileNotStartRecording`
- ⚠️ `abort` vs `stop`：`abort` 丢弃内容不生成 videoID；`stop` 保存内容生成 videoID

---

## GameRecorder.on — 注册事件监听

### 概述

注册监听录制事件的回调函数。当对应事件触发时，回调函数会被执行。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| event | `string` | 是 | 事件名 |
| callback | `function` | 是 | 事件触发时执行的回调函数 |

**event 合法值：**

| 值 | 说明 | 回调参数 |
|----|------|---------|
| `start` | 录制开始事件（客户端真正开始录制时触发）| 无 |
| `stop` | 录制结束事件（客户端真正停止录制时触发）| `{ result }`（含 videoID）|
| `pause` | 录制暂停事件 | 无 |
| `resume` | 录制恢复事件 | 无 |
| `abort` | 录制取消事件 | 无 |
| `error` | 错误事件（录制和分享过程中发生错误时触发）| `{ error: { code, msg } }` |

**stop 事件回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| result | `object` | 录屏结束返回的数据对象，录制成功时可获取到 `videoID` |

> 💡 官方示例中直接用 `res.videoID` 获取，实际可能在 `res.result.videoID` 或 `res.videoID`，以实际返回为准。

**error 事件回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| error | `Object` | 错误对象 |
| error.code | `number` | 错误码（对应 `ks.error.GameRecorder_*`）|
| error.msg | `string` | 错误信息 |

### 标准调用示例

```ts
const recorder = ks.getGameRecorder();

// 监听 start 事件（真正开始录制时触发）
recorder.on('start', () => {
  console.log('[Record] 录制开始');
  showRecordingIndicator();
});

// 监听 stop 事件（获取 videoID）
recorder.on('stop', (res) => {
  console.log('[Record] 录制结束, videoID:', res.videoID);
  window._lastVideoID = res.videoID;
  showPublishButton();
});

// 监听 error 事件
recorder.on('error', (res) => {
  console.error('[Record] 错误:', res.error.code, res.error.msg);
  // 按错误码处理
  if (res.error.code === ks.error.GameRecorder_StartWhileAlreadyStartRecording) {
    // 已经在录制，忽略重复 start
  } else if (res.error.code === ks.error.GameRecorder_NotSupported) {
    KwaiUI.toastError('当前设备不支持录制');
  } else if (res.error.code === ks.error.GameRecorder_RecordFailedTimeRangeTooShort) {
    KwaiUI.toastError('录制时间太短（需 >= 3s）');
  }
});
```

---

## GameRecorder.off — 取消事件监听

### 概述

取消监听录制事件。当对应事件触发时，该回调函数不再执行。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| event | `string` | 是 | 事件名 |
| callback | `function` | 是 | 要取消的回调函数（需与 `on` 注册时同一函数引用）|

### 标准调用示例

```ts
const recorder = ks.getGameRecorder();

const startHandler = () => { console.log('started'); };
const stopHandler = (res) => { console.log('stopped, videoID:', res.videoID); };
const errorHandler = (res) => { console.error('error:', res.error); };

// 注册
recorder.on('start', startHandler);
recorder.on('stop', stopHandler);
recorder.on('error', errorHandler);

// 取消（需传入同一函数引用）
recorder.off('start', startHandler);
recorder.off('stop', stopHandler);
recorder.off('error', errorHandler);
```

---

## GameRecorder.publishVideo — 发布录屏到快手

### 概述

发布录屏到快手。需先 `stop` 结束录制获取 `videoID`。

### 参数 Schema

**Object object**

| 属性 | 类型 | 说明 | 必填 |
|------|------|------|------|
| callback | `function` | 回调函数 | 是 |
| mouldId | `string` | 分享文案模板 id（开放平台设置且通过审核，非必填）| 否 |
| video | `number` / `Array` | 待发布的视频片段 videoID 或 videoID 数组。不传则默认发布最后一次 start-stop 之间生成的视频数据 | 否 |
| query | `string` | 发布录屏携带字段信息，格式 `aaa=bbb&ccc=ddd`，通过发布的视频打开应用后可通过 `ks.getLaunchOptionsSync().query` 获取 | 否 |

**callback 参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| error | `Object` / `undefined` | 错误信息（成功时不返回 error，为 `undefined`）|

**error 结构：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 错误码 |
| msg | `string` | 错误描述 |

### 标准调用示例

```ts
// 1) 基础用法：发布最后一次录制的视频
recorder.publishVideo({
  callback: (error) => {
    if (error) {
      console.error('分享录屏失败:', error.code, error.msg);
      KwaiUI.toastError('分享失败');
    } else {
      console.log('分享录屏成功');
      KwaiUI.toastSuccess('已分享到快手');
    }
  },
});

// 2) 指定 videoID 发布
recorder.publishVideo({
  video: window._lastVideoID,
  callback: (error) => {
    if (error) {
      console.error('发布失败:', error);
    } else {
      console.log('发布成功');
    }
  },
});

// 3) 携带 query 参数（分享-落页-还原）
recorder.publishVideo({
  video: window._lastVideoID,
  query: `score=${getScore()}&level=${getCurrentLevel()}&from=record`,
  callback: (error) => {
    if (error) {
      console.error('发布失败:', error);
    } else {
      console.log('发布成功');
    }
  },
});

// 4) Promise 化封装
function publishVideo(opts) {
  return new Promise((resolve, reject) => {
    recorder.publishVideo({
      video: opts.video,
      query: opts.query,
      mouldId: opts.mouldId,
      callback: (error) => {
        if (error) reject(error);
        else resolve();
      },
    });
  });
}

// 使用
async function onPublishRecord() {
  try {
    await KwaiUI.withLoading('发布中', () =>
      publishVideo({
        video: window._lastVideoID,
        query: `score=${getScore()}&level=${getCurrentLevel()}`,
      })
    );
    KwaiUI.toastSuccess('已分享到快手');
  } catch (err) {
    console.error('发布失败:', err);
    KwaiUI.toastError('分享失败');
  }
}
```

### 常见误用 & 注意事项

- ⚠️ **必须先 stop**：录制中或未录制时 `publishVideo` 会失败
- ⚠️ **videoID 来自 on('stop')**：`stop()` 的 Promise resolve 后，在 `on('stop')` 回调里拿 `res.videoID`
- ⚠️ **query 格式**：必须是 `aaa=bbb&ccc=ddd` 字符串格式，不能传 object
- ⚠️ **mouldId 需审核**：分享文案模板需在开放平台设置且通过审核
- ⚠ **callback 是成功/失败统一回调**：`error` 为 `undefined`/`null` 表示成功，否则失败

---

## 错误码

所有错误码定义在 `ks.error.GameRecorder_*`，可通过 `on('error')` 事件或 Promise `catch` 获取。

| 错误码 | 错误信息 | 说明 |
|--------|---------|------|
| `GameRecorder_UnknownError` | unknown error | 未知错误 |
| `GameRecorder_InternalFailed` | internal failed | 录制 SDK 内部错误 |
| `GameRecorder_NotSupported` | frame not supported | 当前设备不支持录制（**iOS 高性能模式下会触发此错误**，详见顶部「iOS 运行模式限制」） |
| `GameRecorder_StartWhileAlreadyStartRecording` | start while already start recording | 录制中重复 start |
| `GameRecorder_StartWhilePaused` | start while already paused | 暂停中 start（应用 resume）|
| `GameRecorder_PauseWhileNotStartRecording` | pause while not start recording | 未录制时 pause |
| `GameRecorder_PauseWhileAlreadyPaused` | pause while already paused | 已暂停再 pause |
| `GameRecorder_ResumeWhileNotStartRecording` | resume while not start recording | 未录制时 resume |
| `GameRecorder_ResumeWhileRecording` | resume while recording | 录制中 resume（只能在暂停状态）|
| `GameRecorder_AbortWhileNotStartRecording` | abort while not start recording | 未录制时 abort |
| `GameRecorder_StopWhileNotStartRecording` | stop while not start recording | 未录制时 stop |
| `GameRecorder_RecordFailedTimeRangeTooShort` | record time range too short | 录制时间 < 3s |
| `GameRecorder_RecordFailedTimeRangeTooLong` | record time range too long | 录制时间 > 300s |
| `GameRecorder_RecordFailedNoVideo` | no video to publish video | 未录制到视频 |
| `GameRecorder_PublishVideoFailed` | fail to publish video | 发布录屏失败 |

### 错误码使用方法

```ts
// 方式 1：监听 error 事件
const recorder = ks.getGameRecorder();
recorder.on('error', (res) => {
  const error = res.error;
  if (error.code === ks.error.GameRecorder_StartWhileAlreadyStartRecording) {
    // 已经在录制，忽略
  } else if (error.code === ks.error.GameRecorder_NotSupported) {
    KwaiUI.toastError('当前设备不支持录制');
  }
});

// 方式 2：在 Promise 的 catch 中获取
recorder.stop().catch((res) => {
  if (res.error.code === ks.error.GameRecorder_StopWhileNotStartRecording) {
    // 未录制，忽略
  }
});
```

---

## 完整使用模式

### 录制高光时刻 + 发布分享

```ts
// 开始时录制，结束/失败时 stop + 发布
let recorder = null;
let isRecording = false;

function startRecording() {
  recorder = ks.getGameRecorder();

  // 注册事件
  recorder.on('start', () => {
    isRecording = true;
    showRecordingIndicator();
  });
  recorder.on('stop', (res) => {
    isRecording = false;
    hideRecordingIndicator();
    window._lastVideoID = res.videoID;
    // 弹出发布确认
    showPublishDialog();
  });
  recorder.on('error', (res) => {
    isRecording = false;
    hideRecordingIndicator();
    console.error('[Record] error:', res.error);
  });

  // 开始录制
  recorder.start();
}

function stopAndPublish() {
  if (!isRecording) return;
  recorder.stop().then(() => {
    // videoID 在 on('stop') 事件中获取
  });
}

function showPublishDialog() {
  KwaiUI.showModal({
    title: '精彩时刻',
    content: '是否分享到快手？',
    confirmText: '分享',
    success(res) {
      if (res.confirm) {
        publishHighlight();
      }
    },
  });
}

async function publishHighlight() {
  try {
    await KwaiUI.withLoading('发布中', () =>
      new Promise((resolve, reject) => {
        recorder.publishVideo({
          video: window._lastVideoID,
          query: `score=${getScore()}&level=${getCurrentLevel()}&from=highlight`,
          callback: (error) => {
            if (error) reject(error);
            else resolve();
          },
        });
      })
    );
    KwaiUI.toastSuccess('已分享到快手');
  } catch (err) {
    KwaiUI.toastError('分享失败');
  }
}

// 切到后台时暂停录制
KwaiEvent.on('kwai:hide', () => {
  if (isRecording) recorder.pause();
});
KwaiEvent.on('kwai:show', () => {
  if (isRecording) recorder.resume();
});
```

### 冷启动还原分享 query

```ts
// 通过分享视频打开应用，使用 query 还原运行状态
function checkLaunchFromRecord() {
  const launchOptions = ks.getLaunchOptionsSync();
  if (launchOptions.query && launchOptions.query.from === 'record') {
    const { score, level } = launchOptions.query;
    console.log('[Record] 从分享视频进入, score:', score, 'level:', level);
    // 跳转到对应关卡
    jumpToLevel(parseInt(level));
  }
}
```

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **高光时刻录制**：关卡完成/Boss 击杀/成就解锁时 `start` → 展示动画后 `stop` → `publishVideo`
- **自动录制完整过程**：开始时 `start`，结束时 `stop`，询问用户是否分享
- **暂停/恢复**：切到后台或暂停菜单时 `pause`，回前台或恢复时 `resume`
- **取消录制**：玩家主动取消或录制异常时 `abort` 丢弃内容
- **分享-落页-还原**：`publishVideo` 携带 `query`，通过 `ks.getLaunchOptionsSync().query` 还原
- **iOS 运行模式兜底**：项目若启用 iOS 高性能 / 高性能+ 模式 → ⚠️ **必须先联系平台支持团队配置白名单**；高性能模式下录制完全不可用（`GameRecorder_NotSupported`），需监听 `error` 事件在该模式下隐藏录制按钮或提示「当前模式不支持录制，请切换至普通模式」；普通模式（默认）开箱即用

推荐：在 `gameplay/kwai-record.js` 中封装：
- `getRecorder()` 单例缓存 `GameRecorder` 实例
- `startRecord()` / `stopRecord()` / `pauseRecord()` / `resumeRecord()` / `abortRecord()` Promise 化
- `publishRecord(videoID, query)` Promise 化 `publishVideo`
- `onRecordEvent(event, callback)` / `offRecordEvent(event, callback)` 封装事件监听
- 自动注册 `error` 事件统一处理错误码
- 切后台自动 `pause`，回前台自动 `resume`
- 录制时长保护：`start` 后启动 3s 最小计时器和 300s 最大计时器，到 300s 自动 `stop`
- `publishVideo` 自动拼接 `query`（score/level/from 等）
- **iOS 运行模式检测**：启动时读 `ks.getSystemInfoSync()` 判断当前运行模式，若为高性能模式则隐藏录制入口、`record:error` 收到 `GameRecorder_NotSupported` 时 UI 兜底提示

# 内容社区模块

## 文件

`kwaiOpenApi/kwai-game-community.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-game-community.js');
```

## 调用方式

```js
// 跳转内容社区
KwaiGameCommunity.jumpToGameClub({
  onSuccess: function () {},
  onFail:    function (err) { console.warn(err.code, err.msg); },
});

// 分享截图到内容社区
KwaiGameCommunity.shareImage({
  path:      '/tmp/screenshot.png',
  mouldId:   'xxx',
  onSuccess: function () {},
  onFail:    function (err) {},
});

// 选择相册视频并发布
KwaiGameCommunity.chooseVideoAndPublish({
  type:      1,          // 1=仅快手  2=快手+内容社区
  mouldId:   'xxx',
  onSuccess: function () {},
  onFail:    function (err) {},
});

// 发布录制视频到内容社区（配合 KwaiRecord 使用）
KwaiGameCommunity.publishRecordVideo({
  video:     videoID,
  query:     'from=game',
  mouldId:   'xxx',
  onSuccess: function () {},
  onFail:    function (err) {},
});
```

## 错误码

| 错误码 | 说明 |
|--------|------|
| -10005 | 当前快手版本不支持 |
| -100010 | 内容社区未开通 |

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.jumpToGameClub` / `ks.shareImageToGameClub` / `ks.chooseVideoAndPublish` / `ks.getGameRecorder().publishVideo` → [game-community.md](game-community.md)

---

## 底层 API 参考

## 概述

通过 `ks.jumpToGameClub` 跳转到内容社区，`ks.shareImageToGameClub` 分享图片到内容社区，`GameRecorder.publishVideo`（带 `type` 字段）发布录屏到快手并同步至内容社区，`ks.chooseVideoAndPublish` 从相册选择视频和图片发布。用于将互动内容沉淀到社区，提升用户互动和回访。

> ⚠️ **内容社区未开通错误码 -100010**：`jumpToGameClub` 和 `shareImageToGameClub` 在内容社区未开通时返回 `-100010`（注意是 6 位数），需提示用户先在开放平台开通该能力。

> ⚠️ **错误码 -10005**：表示「暂不支持该功能」（iOS 或低版本容器），需做兼容处理。

> ⚠️ **publishVideo 是 GameRecorder 的扩展**：本节 `GameRecorder.publishVideo` 是对 [record/record.md](../record/record.md) 中 `publishVideo` 的扩展，新增 `type` 字段（`1` = 发布到快手，`2` = 发布到快手并同步至内容社区）。不传 `type` 时默认为 `1`（仅发布到快手）。

> ⚠️ **chooseVideoAndPublish 版本要求**：快手 Android / iOS 版本 **>= 13.3.40**，低版本返回 `-10005`。

---

## ks.jumpToGameClub — 跳转到内容社区

### 概述

跳转到内容社区页面。用户可在社区查看帖子、发布内容并与其他用户互动。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | `1` 表示成功 |
| msg | `string` | `"jumpToGameClub:ok"` |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 异常错误码（`-10005` 暂不支持、`-100010` 内容社区未开通）|
| msg | `string` | `"jumpToGameClub:fail"` + 详细错误信息 |

### 标准调用示例

```ts
// 基础用法
ks.jumpToGameClub({
  success() {
    console.log('成功跳转到内容社区');
  },
  fail(err) {
    if (err.code === -10005) {
      console.log('暂不支持该功能');
      KwaiUI.toastError('当前设备不支持');
    } else if (err.code === -100010) {
      console.log('内容社区未开通');
      KwaiUI.toastError('内容社区未开通');
    } else {
      console.log('跳转内容社区失败', err.msg);
      KwaiUI.toastError('跳转失败');
    }
  },
});

// Promise 化
function jumpToGameClub() {
  return new Promise((resolve, reject) => {
    ks.jumpToGameClub({
      success: resolve,
      fail: reject,
    });
  });
}

// 用户点击「内容社区」按钮
async function onGameClubButton() {
  try {
    await jumpToGameClub();
    trackEvent('jump_to_game_club');
  } catch (err) {
    if (err.code === -10005) {
      KwaiUI.toastError('当前设备不支持');
    } else if (err.code === -100010) {
      KwaiUI.toastError('内容社区未开通');
    } else {
      KwaiUI.toastError('跳转失败');
    }
  }
}
```

---

## ks.shareImageToGameClub — 分享图片到内容社区

### 概述

将图片分享至内容社区。支持 CDN 格式图片地址（Android 仅支持 cdn，iOS 支持 cdn 和 ksfile 格式）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| path | `string` | - | 否 | 图片地址（Android 暂支持 cdn 格式，iOS 支持 cdn 和 ksfile 格式）|
| mouldId | `string` | - | 否 | 分享文案模板 id（开放平台设置且通过审核）|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

> ⚠️ **文档字段名不一致**：参数表用 `path`，示例用 `url`。建议以参数表 `path` 为准，若 `path` 不生效可尝试 `url`。

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | `1` 表示成功 |
| msg | `string` | `"shareImageToGameClub:ok"` |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 异常错误码（`-10005` 暂不支持、`-100010` 内容社区未开通）|
| msg | `string` | `"shareImageToGameClub:fail"` |

### 标准调用示例

```ts
// 基础用法：分享 CDN 图片到内容社区
ks.shareImageToGameClub({
  path: 'https://cdn.example.com/game-screenshot.jpg',
  mouldId: 'template_001',  // 可选，分享文案模板
  success(res) {
    console.log('发布成功');
    KwaiUI.toastSuccess('已分享到内容社区');
  },
  fail(err) {
    if (err.code === -10005) {
      console.log('暂不支持该功能');
      KwaiUI.toastError('当前设备不支持');
    } else if (err.code === -100010) {
      console.log('内容社区未开通');
      KwaiUI.toastError('内容社区未开通');
    } else {
      console.log('发布失败', err.msg);
      KwaiUI.toastError('分享失败');
    }
  },
});

// Promise 化
function shareImageToGameClub(path, mouldId) {
  return new Promise((resolve, reject) => {
    ks.shareImageToGameClub({
      path: path,
      mouldId: mouldId,
      success: resolve,
      fail: reject,
    });
  });
}

// 分享当前画面截图
async function shareScreenshot(imageUrl) {
  try {
    await KwaiUI.withLoading('分享中', () => shareImageToGameClub(imageUrl));
    KwaiUI.toastSuccess('已分享到内容社区');
    giveShareReward();
  } catch (err) {
    if (err.code === -10005) {
      KwaiUI.toastError('当前设备不支持');
    } else if (err.code === -100010) {
      KwaiUI.toastError('内容社区未开通');
    } else {
      KwaiUI.toastError('分享失败');
    }
  }
}
```

---

## GameRecorder.publishVideo — 发布录屏到快手并同步至内容社区

### 概述

本功能是在 `GameRecorder.publishVideo` 接口基础上进行扩展，在原有入参基础上**新增了 `type` 字段**，用于指定是否同步至内容社区。

> 💡 详见 [record/record.md](../record/record.md) 的 `GameRecorder.publishVideo` 基础用法。本节仅说明 `type` 字段扩展。

### 参数 Schema

**Object object**

| 属性 | 类型 | 说明 | 必填 |
|------|------|------|------|
| type | `number` | `1` = 发布到快手；`2` = 发布到快手并同步至内容社区 | 否（不传默认 `1`）|
| callback | `function` | 回调函数 | 是 |
| mouldId | `string` | 分享文案模板 id（开放平台设置且通过审核，非必填）| 否 |
| video | `number` / `Array` | 待发布的视频片段 videoID 或 videoID 数组。不传则默认发布最后一次 start-stop 之间生成的视频数据 | 否 |
| query | `string` | 发布录屏携带字段信息，格式 `aaa=bbb&ccc=ddd`，通过发布的视频打开应用后可通过 `ks.getLaunchOptionsSync().query` 获取 | 否 |

**callback 参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| error | `Object` / `undefined` | 错误信息（成功不返回 error，为 `undefined`）|

**error 结构：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 错误码 |
| msg | `string` | 错误描述 |

### 标准调用示例

```ts
// 发布到快手并同步至内容社区
const recorder = ks.getGameRecorder();
recorder.publishVideo({
  type: 2,  // 发布至快手并同步至内容社区
  video: window._lastVideoID,
  query: `score=${getScore()}&level=${getCurrentLevel()}`,
  callback: (error) => {
    if (error != null && error != undefined) {
      console.log('分享录屏失败:', JSON.stringify(error));
      KwaiUI.toastError('分享失败');
    } else {
      console.log('分享录屏成功');
      KwaiUI.toastSuccess('已分享到内容社区');
      giveShareReward();
    }
  },
});

// Promise 化封装（带 type 支持）
function publishVideoToCommunity(opts) {
  return new Promise((resolve, reject) => {
    const recorder = ks.getGameRecorder();
    recorder.publishVideo({
      type: opts.type || 1,  // 默认 1 = 仅快手，2 = 快手 + 内容社区
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
async function onPublishHighlight() {
  try {
    await KwaiUI.withLoading('发布中', () =>
      publishVideoToCommunity({
        type: 2,  // 同步至内容社区
        video: window._lastVideoID,
        query: `score=${getScore()}&level=${getCurrentLevel()}`,
      })
    );
    KwaiUI.toastSuccess('已分享到内容社区');
  } catch (err) {
    KwaiUI.toastError('分享失败');
  }
}
```

---

## ks.chooseVideoAndPublish — 从相册选择视频并发布

### 概述

从相册选择视频和图片发布，支持发布到快手或快手并同步至内容社区。

> 快手 Android / iOS 版本 **>= 13.3.40**，低版本需做兼容处理。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| type | `number` | - | 否 | `1` = 发布到快手；`2` = 发布到快手并同步至内容社区 |
| mouldId | `string` | - | 否 | 分享文案模板 id |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | `1` 表示成功 |
| msg | `string` | `"chooseVideoAndPublish:ok"` |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 异常错误码（`-10005` 该版本不支持该功能）|
| msg | `string` | `"chooseVideoAndPublish:fail"` |

### 标准调用示例

```ts
// 基础用法：从相册选择视频并发布到快手，同时同步至内容社区
ks.chooseVideoAndPublish({
  type: 2,  // 发布至快手并同步至内容社区
  mouldId: '1',  // 可选，分享文案模板
  success(res) {
    console.log('发布成功');
    KwaiUI.toastSuccess('已发布');
  },
  fail(err) {
    if (err.code === -10005) {
      console.log('暂不支持该功能');
      KwaiUI.toastError('当前快手版本不支持，请升级');
    } else {
      console.log('发布失败', err.msg);
      KwaiUI.toastError('发布失败');
    }
  },
});

// Promise 化
function chooseVideoAndPublish(type, mouldId) {
  return new Promise((resolve, reject) => {
    ks.chooseVideoAndPublish({
      type: type,
      mouldId: mouldId,
      success: resolve,
      fail: reject,
    });
  });
}

// 用户点击「从相册选择发布」按钮
async function onChooseAndPublishButton() {
  try {
    await KwaiUI.withLoading('处理中', () => chooseVideoAndPublish(2));
    KwaiUI.toastSuccess('已发布到内容社区');
    giveShareReward();
  } catch (err) {
    if (err.code === -10005) {
      KwaiUI.toastError('当前快手版本不支持，请升级');
    } else {
      KwaiUI.toastError('发布失败');
    }
  }
}
```

---

## 完整使用模式

### 内容社区入口与分享流程

```ts
// 1) 内容社区入口按钮
async function onGameClubButton() {
  try {
    await KwaiGameClub.jumpToGameClub();
    trackEvent('jump_to_game_club');
  } catch (err) {
    if (err.code === -10005) {
      KwaiUI.toastError('当前设备不支持');
    } else if (err.code === -100010) {
      KwaiUI.toastError('内容社区未开通');
    }
  }
}

// 2) 分享当前画面到内容社区
async function shareScreenshot(imageUrl) {
  try {
    await KwaiUI.withLoading('分享中', () =>
      KwaiGameClub.shareImageToGameClub(imageUrl)
    );
    KwaiUI.toastSuccess('已分享到内容社区');
    giveShareReward();
  } catch (err) {
    handleGameClubError(err);
  }
}

// 3) 将录屏高光时刻发布到快手并同步至内容社区
async function publishHighlight() {
  try {
    await KwaiUI.withLoading('发布中', () =>
      KwaiGameClub.publishVideo({
        type: 2,  // 同步至内容社区
        video: window._lastVideoID,
        query: `score=${getScore()}&level=${getCurrentLevel()}`,
      })
    );
    KwaiUI.toastSuccess('已分享到内容社区');
  } catch (err) {
    KwaiUI.toastError('分享失败');
  }
}

// 4) 从相册选择视频发布
async function chooseAndPublish() {
  try {
    await KwaiUI.withLoading('处理中', () => KwaiGameClub.chooseVideoAndPublish(2));
    KwaiUI.toastSuccess('已发布到内容社区');
  } catch (err) {
    handleGameClubError(err);
  }
}

// 统一错误处理
function handleGameClubError(err) {
  if (err.code === -10005) {
    KwaiUI.toastError('当前快手版本不支持，请升级');
  } else if (err.code === -100010) {
    KwaiUI.toastError('内容社区未开通');
  } else {
    KwaiUI.toastError('操作失败');
  }
}
```

---

## 常见误用 & 注意事项

- ⚠️ **内容社区未开通错误码 -100010**：`jumpToGameClub` 和 `shareImageToGameClub` 在内容社区未开通时返回 `-100010`（6 位数），需提示用户先在开放平台开通该能力
- ⚠️ **错误码 -10005**：表示「暂不支持该功能」（iOS 或低版本容器），需做兼容处理
- ⚠️ **publishVideo 的 type 字段**：`1` = 仅发布到快手（默认），`2` = 发布到快手并同步至内容社区。不传 `type` 时默认为 `1`
- ⚠️ **chooseVideoAndPublish 版本要求**：快手 Android / iOS >= 13.3.40，低版本返回 `-10005`
- ⚠️ **shareImageToGameClub 字段名**：文档参数表用 `path`，示例用 `url`，建议以 `path` 为准，若不生效可尝试 `url`
- ⚠️ **shareImageToGameClub 图片格式**：Android 仅支持 cdn 格式，iOS 支持 cdn 和 ksfile 格式
- ⚠️ **mouldId 需审核**：分享文案模板需在开放平台设置且通过审核
- ⚠️ **配合奖励**：分享成功后可发放奖励（金币/道具/解锁关卡），引导用户分享

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **内容社区入口**：主界面显示「内容社区」按钮，点击调 `ks.jumpToGameClub`
- **分享截图**：截取当前画面后调 `ks.shareImageToGameClub` 分享到内容社区
- **录屏同步到内容社区**：录制高光时刻后调 `GameRecorder.publishVideo` 传 `type: 2` 同步发布
- **从相册选择发布**：用户想发布已有视频时调 `ks.chooseVideoAndPublish` 从相册选择
- **错误码处理**：`-10005` 升级提示、`-100010` 内容社区未开通提示

推荐：在 `gameplay/kwai-game-community.js` 中封装：
- `jumpToGameClub()` / `shareImageToGameClub(path, mouldId)` / `chooseVideoAndPublish(type, mouldId)` Promise 化
- `publishVideoToCommunity(opts)` 封装 `GameRecorder.publishVideo` 带 `type` 支持
- `handleGameClubError(err)` 统一错误码处理
- iOS 静默忽略 `-10005` 错误码
- 与 `KwaiRecord` 配合（录屏后发布到内容社区）

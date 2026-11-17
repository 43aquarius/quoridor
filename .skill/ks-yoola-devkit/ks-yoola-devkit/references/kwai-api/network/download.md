# 文件下载模块

## 封装层

文件：`kwaiOpenApi/kwai-network.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-network.js');
```

```js
KwaiNetwork.downloadFile({
  url:        'https://cdn.example.com/patch.zip',
  onProgress: function (res) { console.log(res.progress + '%'); },
  onSuccess:  function (res) { console.log(res.tempFilePath); },
  onFail:     function (err) {},
});
```

---

## 底层 API 参考

## 概述

下载文件资源到本地，客户端直接发起 HTTPS GET 请求，返回文件的本地临时路径。**单次下载允许的最大文件为 200MB**。返回 `DownloadTask` 对象，可监听下载进度、取消下载。

> ⚠️ 服务器响应的 header 中应指定合理的 `Content-Type`，以保证客户端正确处理文件类型。

---

## ks.downloadFile — 下载文件到本地

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| url | `string` | - | 是 | 开发者服务器接口地址（HTTPS）|
| header | `Object` | - | 否 | 设置请求的 header，**header 中不能设置 Referer**；`content-type` 默认为 `application/json` |
| timeout | `number` | - | 否 | 超时时间，单位毫秒 |
| filePath | `string` | - | 否 | 指定文件下载后存储的路径（本地路径，需用 `ks.env.USER_DATA_PATH` 拼接）|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

### success 回调参数 Object res

| 属性 | 类型 | 说明 |
|------|------|------|
| tempFilePath | `string` | 临时文件路径（本地路径）。未传入 `filePath` 时返回，文件存到临时目录 |
| filePath | `string` | 用户文件路径（本地路径）。传入 `filePath` 时返回，与传入的 `filePath` 一致 |
| statusCode | `number` | 开发者服务器返回的 HTTP 状态码 |

### 返回值

| 类型 | 说明 |
|------|------|
| `DownloadTask` | 可监听下载进度变化事件、取消下载任务的对象 |

### 标准调用示例

```ts
// 1) 基础下载：拿到临时路径
ks.downloadFile({
  url: 'https://example.com/audio/bgm.mp3',
  success(res) {
    // 注意：只要服务器有响应数据，就会把响应内容写入文件并进入 success 回调
    // 业务需要自行判断是否下载到了想要的内容
    if (res.statusCode === 200) {
      console.log('downloaded to:', res.tempFilePath);
      // 用临时路径播放 / 加载
      playAudio(res.tempFilePath);
    } else {
      console.warn('下载失败，statusCode:', res.statusCode);
    }
  },
  fail(err) {
    console.error('download failed:', err.errMsg);
  },
});

// 2) 指定存储路径（持久化保存）
const userDir = ks.env.USER_DATA_PATH;
ks.downloadFile({
  url: 'https://example.com/assets/level-data.bin',
  filePath: userDir + '/level-data.bin',
  success(res) {
    console.log('saved to:', res.filePath);  // 与传入的 filePath 一致
  },
});

// 3) 带进度监听 + 取消
const downloadTask = ks.downloadFile({
  url: 'https://example.com/assets/big-image.png',
  success(res) {
    if (res.statusCode === 200) {
      KwaiUI.toastSuccess('下载完成');
      uploadTexture(gl, res.tempFilePath);
    }
  },
  fail(err) {
    console.warn('download failed or aborted:', err.errMsg);
  },
});

downloadTask.onProgressUpdate((res) => {
  console.log('进度:', res.progress + '%');
  console.log('已下载:', res.totalBytesWritten, 'B');
  console.log('总大小:', res.totalBytesExpectedToWrite, 'B');
  // 更新 UI 进度条
  updateProgressBar(res.progress);
});

// 用户取消下载（按返回键 / 切后台）
KwaiEvent.on('kwai:hide', () => {
  downloadTask.abort();
});
```

### 常见误用 & 注意事项

- ⚠️ **域名白名单**：`url` 必须是 HTTPS，且域名需在快手平台后台的「downloadFile 合法域名」中配置
- ⚠️ **单文件最大 200MB**，超出会被拒绝；超大资源需切片下载或换其他方案
- ⚠️ 只要服务器有响应数据（即使 `statusCode` 非 200，如 404 / 500），都会写入文件并触发 `success`，**必须**在 `success` 里判断 `statusCode === 200` 才能用
- ⚠️ 不传 `filePath` 时返回的是**临时路径**，应用退出或缓存清理时可能被删除；需要持久化保存时，指定 `filePath` 为 `ks.env.USER_DATA_PATH`
- ⚠️ `header` 不能设置 Referer
- ⚠️ 下载大文件时务必监听 `onProgressUpdate` 更新进度条，并在切后台时 `abort()` 避免浪费流量

---

## DownloadTask — 下载任务对象

### 概述

`ks.downloadFile` 的返回值，提供监听进度变化和取消下载的方法。

### 方法

| 方法 | 说明 |
|------|------|
| `DownloadTask.abort()` | 中断下载任务 |
| `DownloadTask.onProgressUpdate(callback)` | 监听下载进度变化事件 |
| `DownloadTask.offProgressUpdate(callback)` | 取消监听下载进度变化事件 |

### 标准调用示例

```ts
const downloadTask = ks.downloadFile({
  url: 'https://example.com/audio/123',
  success(res) {
    if (res.statusCode === 200) {
      // 用下载好的本地路径播放音频
      ks.playVoice({ filePath: res.tempFilePath });
    }
  },
});

downloadTask.onProgressUpdate((res) => {
  console.log('下载进度', res.progress);
  console.log('已经下载的数据长度', res.totalBytesWritten);
  console.log('预期需要下载的数据总长度', res.totalBytesExpectedToWrite);
});

// 取消下载
downloadTask.abort();
```

---

## DownloadTask.abort — 中断下载任务

### 概述

中断通过 `ks.downloadFile` 发起的下载任务。调用后下载会被取消，已下载的部分文件可能被清理。

### 参数

无参数。

### 标准调用示例

```ts
const downloadTask = ks.downloadFile({
  url: 'https://example.com/big-file.zip',
  success(res) { /* ... */ },
});

// 用户取消或切后台时中断
function onCancelDownload() {
  downloadTask.abort();
  KwaiUI.toastText('已取消下载');
}

KwaiEvent.on('kwai:hide', () => {
  downloadTask.abort();
});
```

### 常见误用 & 注意事项

- ⚠️ `abort` 调用后 `success` 回调不会再触发；部分容器会触发 `fail`，`errMsg` 含 `abort`
- ⚠️ 已下载的临时文件**不保证保留**，重启后可能消失
- ⚠️ 下载完成（success 已触发）后再调 `abort` **无意义**

---

## DownloadTask.onProgressUpdate — 监听下载进度

### 概述

监听下载进度变化事件，下载过程中会以较高频率触发（每收到数据块触发一次）。用于更新 UI 进度条、计算剩余时间等。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `(res: ProgressInfo) => void` | 是 | 下载进度变化事件的回调函数 |

**callback 参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| progress | `number` | 下载进度百分比（0 - 100）|
| totalBytesWritten | `number` | 已经下载的数据长度，单位 Bytes |
| totalBytesExpectedToWrite | `number` | 预期需要下载的数据总长度，单位 Bytes |

> ⚠️ 官方文档表格中字段名记为 `totalBytesSent` / `totalBytesExpectedToSend`，但官方示例代码中使用的是 `totalBytesWritten` / `totalBytesExpectedToWrite`。**以示例代码字段名为准**（语义与"下载"匹配）；若运行时返回字段为前者，请以实际容器为准并做兼容兜底。

### 标准调用示例

```ts
downloadTask.onProgressUpdate((res) => {
  // 更新进度条
  setProgressBar(res.progress);
  // 计算已下载 MB 数
  const downloadedMB = (res.totalBytesWritten / 1024 / 1024).toFixed(2);
  const totalMB = (res.totalBytesExpectedToWrite / 1024 / 1024).toFixed(2);
  setProgressText(`${downloadedMB} / ${totalMB} MB`);
});
```

### 常见误用 & 注意事项

- ⚠️ 回调**触发频率较高**（每收到数据块触发一次），回调里**禁止做重计算或新建大量对象**，否则会拖垮主循环
- ⚠️ 部分服务器不返回 `Content-Length` 头时，`totalBytesExpectedToWrite` 可能为 0，需做兜底（显示"下载中..."而非"0%"）
- ⚠️ `progress` 是 0 - 100 的整数，已乘 100，**不需要再乘 100**

---

## DownloadTask.offProgressUpdate — 取消监听下载进度

### 概述

取消监听下载进度变化事件。需要传入**之前通过 `onProgressUpdate` 注册过的同一个 callback 引用**。

### 参数

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 之前通过 `onProgressUpdate` 注册的回调函数引用 |

### 标准调用示例

```ts
const progressCallback = (res) => {
  updateProgressBar(res.progress);
};
downloadTask.onProgressUpdate(progressCallback);

// 下载完成或不再需要监听时取消
downloadTask.offProgressUpdate(progressCallback);
```

### 常见误用 & 注意事项

- ⚠️ 传入的 callback 必须与 `onProgressUpdate` 注册时的引用**完全一致**，传匿名函数无效
- ⚠️ 下载任务结束（success / fail 触发）后通常无需手动 `off`，但建议在 React/Vue 等组件卸载场景清理

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **资源加载**：BGM、音效、大图等运行时下载 → `ks.downloadFile` + `onProgressUpdate` 显示进度条
- **关卡数据下载**：从服务器拉取关卡配置/资源包 → 下载到 `ks.env.USER_DATA_PATH` 持久化
- **更新检查**：应用启动时下载版本配置文件，与本地版本对比 → 触发热更新流程
- **用户上传后回执**：上传成功后下载服务器处理好的图片/视频

推荐：在 `gameplay/kwai-network.js` 中封装 `downloadFile` Promise 化接口，统一处理进度上报、超时、错误兜底；切后台时自动 `abort()` 所有进行中的下载任务，避免流量浪费。

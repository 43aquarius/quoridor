# 系统信息模块

## 封装层

文件：`kwaiOpenApi/kwai-base.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-base.js');
```

```js
var info = KwaiBase.getSystemInfo();
console.log(info.windowWidth, info.windowHeight, info.pixelRatio);
```

---

## 底层 API 参考

## 概述

获取设备/系统/宿主信息，用于适配不同屏幕尺寸、判断平台能力、做安全区适配等。提供三个接口：`ks.getSystemInfo`（异步回调）、`ks.getSystemInfoSync`（同步，立即返回）、`ks.getSystemInfoAsync`（异步 Promise 风格，低版本容器降级为同步实现）。

---

## ks.getSystemInfo — 异步获取系统信息（回调风格）

### 参数 Schema

**Object object**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| success | `(res: SystemInfo) => void` | 否 | 成功回调 |
| fail | `(err: { errMsg: string }) => void` | 否 | 失败回调 |
| complete | `() => void` | 否 | 完成回调（成功/失败均触发）|

### 返回值 SystemInfo

| 属性 | 类型 | 说明 |
|------|------|------|
| brand | `string` | 设备品牌（如 `"HUAWEI"`）|
| model | `string` | 设备型号（如 `"TAS-AN00"`）|
| pixelRatio | `number` | 设备像素比（如 `3`）|
| devicePixelRatio | `number` | 设备像素比，与 `pixelRatio` 同值（兼容字段，部分版本会同时返回）|
| screenWidth | `number` | 屏幕宽度，单位 px |
| screenHeight | `number` | 屏幕高度，单位 px |
| windowWidth | `number` | 可使用窗口宽度，单位 px |
| windowHeight | `number` | 可使用窗口高度，单位 px |
| statusBarHeight | `number` | 状态栏高度，单位 px |
| language | `string` | 快手设置的语言（如 `"zh_CN"`）|
| version | `string` | 快手 App 版本号（如 `"14.5.10.99999"`，注意是 App 版本而非 SDK 版本）|
| system | `string` | 操作系统版本。**Android 返回 API level 字符串**（如 `"31"`），**iOS 返回系统版本号**（如 `"15.0"`），使用前注意区分平台 |
| platform | `string` | 客户端平台（`"android"` / `"ios"`）|
| SDKVersion | `string` | 运行容器 SDK 版本号（如 `"1.3.40"`），用于判断 API 能力，与 `version`（App 版本）不同 |
| deviceOrientation | `string` | 设备方向：`'portrait'`（竖屏）/ `'landscape'`（横屏）|
| safeArea | `SafeArea` | 竖屏正方向下的安全区域 |
| host | `HostInfo` | 当前互动玩法运行的宿主环境 |

> ⚠️ **以下字段未在 Android 实机返回中出现**，可能仅 iOS 或特定版本返回，使用前**务必判空**：
> `albumAuthorized` / `cameraAuthorized` / `locationAuthorized` / `microphoneAuthorized` / `notificationAuthorized` / `notificationAlertAuthorized` / `notificationBadgeAuthorized` / `notificationSoundAuthorized`（仅 iOS）/ `bluetoothEnabled` / `locationEnabled` / `wifiEnabled`。
> Android 实测上述权限/开关字段**均不返回**，权限判断请改用 `ks.getSetting` / `ks.authorize` 流程。

**SafeArea 结构：**

| 属性 | 类型 | 说明 |
|------|------|------|
| left | `number` | 安全区域左上角横坐标 |
| right | `number` | 安全区域右下角横坐标 |
| top | `number` | 安全区域左上角纵坐标 |
| bottom | `number` | 安全区域右下角纵坐标 |
| width | `number` | 宽 |
| height | `number` | 高 |

**HostInfo 结构：**

| 属性 | 类型 | 说明 |
|------|------|------|
| appId | `string` | 宿主 app 对应的 appId |
| env | `string` | 哪种快手 app，取值：`"kuaishou"`（快手）/ `"nebula"`（快手极速版）|
| version | `string` | 当前应用版本号（如 `"6.2.59"`），区别于顶层 `version`（快手 App 版本）|

> ⚠️ `host.env` 的实际取值是**英文小写字符串**（`"kuaishou"` / `"nebula"`），**不是**中文「快手」「快手极速版」。判断宿主时务必用英文值比较：`if (info.host.env === 'kuaishou') { ... }`。
>
> ⚠️ 当前**没有「快看点」宿主**，不要在玩法代码里判断 `env === 'kuaidian'` 之类的不存在值。

### 标准调用示例

```ts
ks.getSystemInfo({
  success(res) {
    console.log(res.model);
    console.log(res.pixelRatio);
    console.log(res.windowWidth);
    console.log(res.windowHeight);
    console.log(res.language);
    console.log(res.version);
    console.log(res.platform);
  },
  fail(err) {
    console.error('获取系统信息失败', err.errMsg);
  },
});
```

### 常见误用 & 注意事项

- ⚠️ `getSystemInfo` 是异步的，**不要在主循环或关键渲染帧前同步等待**；若需立即拿到结果，请用 `getSystemInfoSync`
- ⚠️ `safeArea` 是基于竖屏正方向返回的，横屏布局需自行换算
- ⚠️ `host.env` 区分快手系不同宿主，做包体/能力差异逻辑时务必判断（实际取值为 `"kuaishou"` / `"nebula"`，英文小写）

---

## 实际返回值示例（Android 实机）

以下为 Android 实机实测返回值，供字段类型/取值参考：

**快手 App（`host.env: "kuaishou"`）：**

```json
{
  "pixelRatio": 3,
  "windowWidth": 360,
  "windowHeight": 780,
  "screenWidth": 360,
  "screenHeight": 780,
  "brand": "HUAWEI",
  "model": "TAS-AN00",
  "statusBarHeight": 35,
  "language": "zh_CN",
  "version": "14.5.10.99999",  // 顶层 version = 快手 App 版本
  "platform": "android",
  "system": "31",
  "SDKVersion": "1.3.40",
  "deviceOrientation": "portrait",
  "safeArea": { "width": 360, "height": 745, "left": 0, "right": 360, "top": 35, "bottom": 780 },
  "devicePixelRatio": 3,
  "host": { "env": "kuaishou", "appId": "ks668784546984885891", "version": "6.2.59" }  // host.version = 应用版本号
}
```

**快手极速版 App（`host.env: "nebula"`）：**

```json
{
  "pixelRatio": 3,
  "windowWidth": 360,
  "windowHeight": 780,
  "screenWidth": 360,
  "screenHeight": 780,
  "brand": "HUAWEI",
  "model": "TAS-AN00",
  "statusBarHeight": 35,
  "language": "zh_CN",
  "version": "14.5.20.99999",  // 顶层 version = 快手 App 版本
  "platform": "android",
  "system": "31",
  "SDKVersion": "1.3.40",
  "deviceOrientation": "portrait",
  "safeArea": { "width": 360, "height": 745, "left": 0, "right": 360, "top": 35, "bottom": 780 },
  "devicePixelRatio": 3,
  "host": { "env": "nebula", "appId": "ks668784546984885891", "version": "6.2.59" }  // host.version = 应用版本号
}
```

> 💡 对比可见：快手与极速版**唯一差异是 `host.env`**（`"kuaishou"` vs `"nebula"`）和顶层 `version`（快手 App 版本号可能不同），其余字段一致。同一设备两个宿主返回的 `appId` 也相同（指向同一应用）。
>
> 💡 **两个 `version` 字段含义不同，注意区分**：
> - 顶层 `version`（如 `"14.5.10.99999"`）= **快手 App 版本号**
> - `host.version`（如 `"6.2.59"`）= **应用版本号**
>
> 业务里判断「宿主 App 版本」用顶层 `version`，判断「应用版本」用 `host.version`，不要混用。

---

## ks.getSystemInfoSync — 同步获取系统信息

### 概述

`ks.getSystemInfo` 的同步版本，**立即返回** `SystemInfo` 对象。返回值结构与 `ks.getSystemInfo` 的 success 回调参数完全一致。

### 参数

无参数。

### 标准调用示例

```ts
try {
  const res = ks.getSystemInfoSync();
  console.log(res.model);
  console.log(res.pixelRatio);
  console.log(res.windowWidth);
  console.log(res.windowHeight);
  console.log(res.language);
  console.log(res.version);
  console.log(res.platform);
  // 安全区适配示例
  const { safeArea, windowHeight } = res;
  if (safeArea) {
    const bottomInset = windowHeight - safeArea.bottom;
    // 在 UI 上预留底部安全区间距，避免被 Home Indicator 遮挡
    setBottomPadding(bottomInset);
  }
} catch (e) {
  // 同步获取失败时的兜底逻辑
  console.error('getSystemInfoSync error', e);
}
```

### 常见误用 & 注意事项

- ⚠️ 同步接口会阻塞 JS 线程，**只在启动初始化等一次性场景使用**，不要在每帧或循环里调用
- ⚠️ 个别设备/低版本可能返回部分字段为 `undefined`，使用前务必做兜底
- ⚠️ 与 `ks.getSystemInfo` 返回数据**完全相同**，可任意选用，按场景择优

---

## ks.getSystemInfoAsync — 异步获取系统信息（Promise 风格）

### 概述

异步获取系统信息。**需要一定的客户端版本支持**，在不支持的客户端上，会自动使用同步实现来返回。优先推荐使用此接口以避免阻塞主线程。

### 参数 Schema

**Object object**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| success | `(res: SystemInfo) => void` | 否 | 成功回调 |
| fail | `(err: { errMsg: string }) => void` | 否 | 失败回调 |
| complete | `() => void` | 否 | 完成回调（成功/失败均触发）|

> 返回值 `SystemInfo` 结构同 `ks.getSystemInfo`，此处不再重复。

### 标准调用示例

```ts
// 推荐写法：用 Promise 包一层，便于 await
function getSystemInfoAsync(): Promise<SystemInfo> {
  return new Promise((resolve, reject) => {
    ks.getSystemInfoAsync({
      success: resolve,
      fail: reject,
    });
  });
}

// 启动初始化
async function init() {
  try {
    const info = await getSystemInfoAsync();
    console.log('window size:', info.windowWidth, 'x', info.windowHeight);
    // 根据像素比设置画布物理尺寸，布局尺寸由业务逻辑层维护
    const dpr = info.pixelRatio || 1;
    canvas.width = info.windowWidth * dpr;
    canvas.height = info.windowHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  } catch (err) {
    console.error('getSystemInfoAsync failed', err);
  }
}
```

### 常见误用 & 注意事项

- ⚠️ 低版本容器会**自动降级为同步实现**（直接在当前栈返回结果），调用方代码无需感知但要预期可能的微任务时序差异
- ⚠️ 优先用 `getSystemInfoAsync` 而非 `getSystemInfo`，前者在支持的容器上是非阻塞实现
- ⚠️ 不要同时调用三个接口，结果一致但浪费性能；启动时调一次缓存即可

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **启动初始化**：首屏需要按屏幕尺寸/像素比设置 canvas → 用 `getSystemInfoAsync` 或 `getSystemInfoSync`
- **安全区/刘海屏适配**：UI 需要避开状态栏、Home Indicator → 读 `safeArea`
- **多宿主分发**：应用在不同快手系 App（快手 `env: "kuaishou"` / 极速版 `env: "nebula"`，**无快看点**）有差异化逻辑 → 读 `host.env`，**用英文小写值比较**
- **权限判断**：Android 实测 `*Authorized` / `*Enabled` 字段**不返回**，权限判断请用 `ks.getSetting` / `ks.authorize`，不要依赖 `SystemInfo` 的权限字段
- **横竖屏适配**：根据 `deviceOrientation` 调整布局

推荐：启动时调用一次 `getSystemInfoSync` 缓存到全局，运行时按需读取，避免反复调用。

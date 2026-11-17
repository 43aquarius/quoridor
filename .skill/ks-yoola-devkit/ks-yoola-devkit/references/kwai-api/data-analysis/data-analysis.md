# 数据分析模块

## 文件

`kwaiOpenApi/kwai-data-analysis.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-data-analysis.js');
```

## 调用方式

```js
KwaiDataAnalysis.reportScene({
  sceneId:   7001,
  costTime:  500,
  dimension: { entry: 'ad' },
  metric:    { loadTime: '500' },
  onSuccess: function (res) { console.log('上报成功', res); },
  onFail:    function (err) { console.warn('上报失败', err); },
});
```

## 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| sceneId | number | 场景 ID（由快手平台分配）|
| costTime | number | 耗时（ms，可选）|
| dimension | object | 维度，值须为非空字符串，总长不超过 1024 |
| metric | object | 指标，值须为数字型字符串，总长不超过 1024 |

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.reportScene` → [data-analysis.md](data-analysis.md)

---

## 底层 API 参考

## 概述

通过 `ks.reportScene` 上报应用启动阶段的自定义场景数据，帮助快速定位问题。支持上报场景耗时（`costTime`）、自定义维度数据（`dimension`）和自定义指标数据（`metric`）。每个场景 ID 每次启动仅可上报一次。

> ⚠️ **版本要求**：快手 Android / iOS 版本 **>= 13.5.40**，低版本需做兼容处理。

> ⚠️ **每个场景 ID 每次启动仅可上报一次**：重复上报同一 `sceneId` 会返回 `20001: report sceneId:${scene_id} repeatedly`。

> ⚠️ **dimension / metric 长度限制**：序列化后字符串长度不可超过 **1024 个字符**，超长会返回 `20001: params.${key} cannot exceed 1024 characters`。

> ⚠️ **dimension / metric 字段要求**：
> - `dimension`：每个字段需要为**非空字符串**
> - `metric`：每个字段需要为**非空字符串**且可以 `parse` 为**非 NaN 数字**

> ⚠️ **key 需在小程序管理后台获取**：`dimension` / `metric` 的 key 不能随意自定义，需在「小程序管理后台」预先获取。

---

## 默认场景 ID 对照表

系统内置以下场景 ID，开箱即用。业务也可在「小程序管理后台」申请新的自定义场景 ID（如资源加载、关卡加载等业务场景），申请后即可通过 `ks.reportScene` 上报。

| sceneId | 名称 | 说明 |
|---------|------|------|
| `1` | 启动点击 | 用户点击启动应用 |
| `2` | 资源准备完成 | 应用代码包及框架资源加载完成 |
| `3` | 代码注入完成 | 应用代码注入完成 |
| `4` | 首屏渲染完成 | 应用首屏渲染完成 |
| `7001` | 应用可交互 | 用户可以开始交互 |

> 💡 **自定义场景 ID**：上述 5 个为系统默认值，业务如需上报其他场景（如 `7002` 资源加载、`7003` 关卡加载等），需先在「小程序管理后台」申请对应的 sceneId，再通过 `ks.reportScene` 上报。

---

## ks.reportScene — 上报自定义场景数据

### 概述

该功能用于应用启动阶段的自定义场景数据上报，帮助快速定位问题。

> 快手 Android 版本 >= 13.5.40，iOS 版本 >= 13.5.40，低版本需做兼容处理。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| sceneId | `number` | - | 是 | 场景 ID |
| costTime | `number` | `0` | 否 | 此场景的耗时，单位 ms |
| dimension | `object` | - | 否 | 自定义维度数据，key 在「小程序管理后台」获取。只支持能通过 `JSON.stringify` 序列化的对象，且序列化后长度不超过 1024 个字符 |
| metric | `object` | - | 否 | 自定义指标数据，key 在「小程序管理后台」获取。只支持能通过 `JSON.stringify` 序列化的对象，且序列化后长度不超过 1024 个字符 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| errMsg | `string` | `"reportScene:ok"` |
| data | `object` | 开发者上报的原始数据 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| errNo | `number` | 异常错误码 |
| errMsg | `string` | 错误信息 |

**错误码：**

| code | msg | 描述 |
|------|-----|------|
| `20001` | `params.${key} should be ${expect_type}, but got ${actual_value}` | 参数数据类型校验，请根据「参数说明」检查对应字段传参情况 |
| `20001` | `report sceneId:${scene_id} repeatedly` | 同一个场景 ID 重复上报，每次启动只能上报一次 |
| `20001` | `params.dimension.${key} needs to be a string type and a non-empty string` | dimension 中每个字段需要为非空字符串 |
| `20001` | `params.metric.${key} needs to be a numeric value of type string` | metric 中每个字段需要为非空字符串且可以 parse 为非 NaN 数字 |
| `20001` | `params.${key} cannot exceed 1024 characters` | dimension / metric 字段 stringify 后字符串长度不可超过 1024 |
| `20001` | `failed to serialize params.${} by JSON.stringify` | dimension / metric 对象 stringify 失败 |
| `20001` | `invalid sceneId:${scene_id}` | 场景 id 不合法 |
| `-20001` | `unknown error` | 系统内部异常 |

### 标准调用示例

```ts
// 基础用法：上报启动场景
ks.reportScene({
  sceneId: 7001,
  costTime: 1000,
  dimension: {
    d1: 'value',
  },
  metric: {
    m1: '1000',
  },
  success: (res) => {
    console.log('reportScene success');
    // 上报成功回调逻辑
  },
  fail: (res) => {
    console.log('reportScene fail:', res);
    // 上报失败回调逻辑
  },
});

// Promise 化
function reportScene(opts) {
  return new Promise((resolve, reject) => {
    ks.reportScene({
      sceneId: opts.sceneId,
      costTime: opts.costTime || 0,
      dimension: opts.dimension,
      metric: opts.metric,
      success: resolve,
      fail: reject,
    });
  });
}

// 上报应用启动耗时
async function reportGameStart(costTime) {
  try {
    await reportScene({
      sceneId: 7001,  // 应用可交互（系统默认 sceneId）
      costTime: costTime,
      dimension: {
        entry: 'feed',  // 进入入口
        version: '1.0.0',  // 应用版本
      },
      metric: {
        loadTime: String(costTime),  // 加载耗时（ms，metric 值需为可 parse 数字的字符串）
      },
    });
    console.log('启动场景上报成功');
  } catch (err) {
    console.error('启动场景上报失败:', err);
  }
}

// 上报资源加载耗时
async function reportResourceLoad(costTime) {
  try {
    await reportScene({
      sceneId: 7002,  // 资源加载场景 ID（示例，需在管理后台申请）
      costTime: costTime,
      dimension: {
        resourceType: 'bundle',
      },
      metric: {
        bundleSize: '5000',  // bundle 大小（KB）
      },
    });
    console.log('资源加载上报成功');
  } catch (err) {
    console.error('资源加载上报失败:', err);
  }
}
```

---

## 完整使用模式

### 启动阶段多场景上报

```ts
// 1) 应用启动耗时上报
const gameStartTime = Date.now();
async function onGameReady() {
  const costTime = Date.now() - gameStartTime;
  await reportGameStart(costTime);
}

// 2) 资源加载耗时上报
async function onResourceLoadComplete(resourceType, costTime) {
  try {
    await reportScene({
      sceneId: 7002,  // 资源加载场景 ID（示例，需在管理后台申请）
      costTime: costTime,
      dimension: { resourceType },
      metric: { loadTime: String(costTime) },
    });
  } catch (err) {
    console.error('资源加载上报失败:', err);
  }
}

// 3) 关卡加载耗时上报
async function onLevelLoaded(levelId, costTime) {
  try {
    await reportScene({
      sceneId: 7003,  // 关卡加载场景 ID（示例，需在管理后台申请）
      costTime: costTime,
      dimension: { levelId: String(levelId) },
      metric: { loadTime: String(costTime) },
    });
  } catch (err) {
    console.error('关卡加载上报失败:', err);
  }
}

// 4) 防重复上报：用 Set 记录已上报的 sceneId
const reportedScenes = new Set();
async function safeReportScene(opts) {
  if (reportedScenes.has(opts.sceneId)) {
    console.warn(`[reportScene] sceneId ${opts.sceneId} already reported, skip`);
    return;
  }
  try {
    await reportScene(opts);
    reportedScenes.add(opts.sceneId);
  } catch (err) {
    console.error(`[reportScene] sceneId ${opts.sceneId} failed:`, err);
  }
}
```

---

## 常见误用 & 注意事项

- ⚠️ **版本要求**：快手 Android / iOS >= 13.5.40，低版本会返回 `-20001: unknown error` 或其他错误
- ⚠️ **每个场景 ID 每次启动仅可上报一次**：重复上报同一 `sceneId` 会返回 `20001: report sceneId:${scene_id} repeatedly`，用 Set 记录已上报的 sceneId 避免重复
- ⚠️ **dimension / metric 长度限制 1024**：序列化后字符串长度不可超过 1024 个字符，超长会报错，注意控制数据量
- ⚠️ **dimension 字段类型**：每个字段需要为**非空字符串**，不能为数字、null、空字符串
- ⚠️ **metric 字段类型**：每个字段需要为**非空字符串**且可以 `parse` 为**非 NaN 数字**（如 `"1000"`、`"3.14"`，不能为 `"abc"` 或 `""`）
- ⚠️ **key 需在管理后台获取**：`dimension` / `metric` 的 key 不能随意自定义，需在「小程序管理后台」预先获取
- ⚠️ **sceneId 必须合法**：非法 `sceneId` 会返回 `20001: invalid sceneId:${scene_id}`
- ⚠ **fail 回调用 `errNo` 而非 `code`**：与其他 API 不同，本 API 失败回调字段是 `errNo`，但错误码表中用 `code` 表示（注意区分）
- ⚠ **用于启动阶段**：本 API 主要用于应用启动阶段的自定义场景数据上报，帮助快速定位问题
- ⚠ **与 KwaiBase.reportEvent 区别**：`ks.reportScene` 用于启动阶段场景耗时上报（带 sceneId），`KwaiBase.reportEvent` 用于通用事件上报（更灵活）

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **启动耗时上报**：应用启动完成时上报 `sceneId: 7001`、`costTime: 启动耗时`、`dimension: { entry, version }`、`metric: { loadTime }`
- **资源加载耗时**：bundle/分包加载完成时上报对应 sceneId、`costTime`、`dimension: { resourceType }`、`metric: { loadTime, bundleSize }`
- **关卡加载耗时**：关卡加载完成时上报对应 sceneId、`costTime`、`dimension: { levelId }`、`metric: { loadTime }`
- **防重复上报**：用 Set 记录已上报的 sceneId，避免重复上报
- **低版本兼容**：iOS / 低版本静默忽略上报失败

推荐：在 `gameplay/kwai-data-analysis.js` 中封装：
- `reportScene(opts)` Promise 化
- `safeReportScene(opts)` 防重复上报（Set 记录已上报 sceneId）
- `reportGameStart(costTime)` / `reportResourceLoad(costTime)` / `reportLevelLoaded(levelId, costTime)` 场景化封装
- 预校验 dimension/metric 字段类型和长度
- 低版本静默忽略

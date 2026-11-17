# 侧边栏模块

## 文件

`kwaiOpenApi/kwai-siderbar.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-siderbar.js');
```

## 调用方式

```js
// 检查侧边栏是否可用
KwaiSiderBar.checkAvailable({
  onSuccess: function (res) { if (res.available) showGuide(); },
  onFail:    function (err) {},
});

// 跳转到侧边栏场景
KwaiSiderBar.navigateToSidebar({
  onSuccess: function () {},
  onFail:    function (err) { console.warn(err.code, err.msg); },
});
```

## 错误码

| 错误码 | 说明 |
|--------|------|
| -10005 | 当前快手版本不支持 |
| -20041 | 触发频率过高 |
| -20042 | 应用未备案或尚未上线 |
| -20043 | scene 非法 |

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.checkSliderBarIsAvailable` / `ks.navigateToScene` → [sider-bar.md](sider-bar.md)

---

## 底层 API 参考

## 概述

通过 `ks.checkSliderBarIsAvailable` 判断侧边栏是否可用，`ks.navigateToScene` 跳转到侧边栏场景。用于引导用户将应用添加到侧边栏常用列表，方便再次访问。

> ⚠️ **版本要求**：
> - `ks.checkSliderBarIsAvailable`：快手 Android / iOS 版本 **>= 12.11.10**，低版本需做兼容处理
> - `ks.navigateToScene`：快手 Android 版本 **>= 13.4.40**、iOS 版本 **>= 13.5.40**，低版本需做兼容处理
>
> 低版本调 `navigateToScene` 会返回错误码 `-10005`（低于支持版本）。

> ⚠️ **navigateToScene 错误码 -10005 vs checkSliderBarIsAvailable -10005**：两者 `-10005` 都表示版本不支持，但 `navigateToScene` 的 `-10005` 是 `code` 字段，`checkSliderBarIsAvailable` 无错误码字段说明（仅 fail 返回 `code` / `msg`）。

> ⚠️ **应用未上线（即使备案已通过）也会失败**：`navigateToScene` 与 `checkSliderBarIsAvailable` 在应用**尚未上线发布**时调用都会返回失败，且**返回码与「应用未备案」`-20042` 完全一致**，无法从错误码区分是「未备案」还是「已备案但未上线」。业务侧在收到 `-20042` 时，应同时提示「应用未备案或尚未上线」，避免误判为备案问题。

---

## ks.checkSliderBarIsAvailable — 判断侧边栏是否可用

### 概述

判断侧边栏是否可用。用户侧边栏常用列表展示应用入口，调用此接口判断当前容器是否支持侧边栏功能。

> 快手 Android 版本 >= 12.11.10，iOS 版本 >= 12.11.10，低版本需做兼容处理。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| available | `boolean` | 侧边栏是否可用；`true` = 可用，`false` = 不可用 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 异常错误码 |
| msg | `string` | 错误信息 |

### 标准调用示例

```ts
// 基础用法
ks.checkSliderBarIsAvailable({
  success: (result) => {
    const { available } = result;
    if (available) {
      console.log('侧边栏可用');
      showAddToSidebarGuide();  // 显示「添加到侧边栏」引导
    } else {
      console.log('侧边栏不可用');
      hideAddToSidebarGuide();
    }
  },
  fail: (error) => {
    console.log('checkSliderBarIsAvailable fail:', error);
    // 低版本或不支持，隐藏引导
    hideAddToSidebarGuide();
  },
});

// Promise 化
function checkSliderBarIsAvailable() {
  return new Promise((resolve, reject) => {
    ks.checkSliderBarIsAvailable({
      success: resolve,
      fail: reject,
    });
  });
}

// 启动时检查
async function checkSidebarOnStartup() {
  try {
    const result = await checkSliderBarIsAvailable();
    if (result.available) {
      showAddToSidebarGuide();
    }
  } catch (err) {
    console.warn('sidebar check failed:', err);
    // 低版本或不支持，静默忽略
  }
}
```

### 侧边栏常用小程序示意图

侧边栏常用列表是快手 App 侧边栏中的应用入口，用户可将常用应用添加到此处，方便再次访问。

---

## ks.navigateToScene — 跳转到入口场景

### 概述

跳转到某个应用入口场景。当前支持 `sidebar`（侧边栏场景），可引导用户将应用添加到侧边栏常用列表。

> 快手 Android 版本 >= 13.4.40，iOS 版本 >= 13.5.40，低版本需做兼容处理。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| scene | `string` | - | 是 | 需要跳转的入口场景 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**scene 合法值：**

| 值 | 说明 | 最低版本 |
|----|------|---------|
| `sidebar` | 侧边栏场景 | 13.4.40（Android）/ 13.5.40（iOS）|

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| msg | `string` | 跳转是否成功；`"success"` 表示成功 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 异常错误码（见下方错误码表）|
| msg | `string` | 错误信息 |

**错误码：**

| code | msg | 描述 |
|------|-----|------|
| `-10005` | 安卓：only for kuaishou system version >= 13.4.40, iOS：only for kuaishou system version >= 13.5.40 | 低于支持版本 |
| `-20001` | unknown error | 系统内部异常 |
| `-20041` | frequency limit | API 调用次数超过频控限制 |
| `-20042` | game not registered | 应用未备案 **或应用已备案但尚未上线发布**（两者返回码相同，无法区分）|
| `-20043` | navigateToScene scene illegal, please check | scene 不合法 |

### 标准调用示例

```ts
// 基础用法：跳转到侧边栏场景
ks.navigateToScene({
  scene: 'sidebar',
  success: (res) => {
    console.log('navigate to scene success');
    // 跳转成功回调逻辑
  },
  fail: (res) => {
    console.log('navigate to scene fail:', res);
    // 跳转失败回调逻辑
    if (res.code === -10005) {
      KwaiUI.toastError('当前快手版本不支持，请升级到最新版本');
    } else if (res.code === -20041) {
      KwaiUI.toastError('操作过于频繁，请稍后再试');
    } else if (res.code === -20042) {
      KwaiUI.toastError('应用未备案或尚未上线，无法添加到侧边栏');
    } else {
      KwaiUI.toastError('添加失败：' + res.msg);
    }
  },
});

// Promise 化
function navigateToScene(scene) {
  return new Promise((resolve, reject) => {
    ks.navigateToScene({
      scene: scene,
      success: resolve,
      fail: reject,
    });
  });
}

// 配合 checkSliderBarIsAvailable：先检查可用再跳转
async function onAddToSidebarButton() {
  // 1) 先检查侧边栏是否可用
  try {
    const checkResult = await checkSliderBarIsAvailable();
    if (!checkResult.available) {
      KwaiUI.toastError('当前设备不支持侧边栏');
      return;
    }
  } catch (err) {
    // 低版本不支持 checkSliderBarIsAvailable，可尝试直接 navigate
    console.warn('checkSliderBarIsAvailable not supported, try navigate directly');
  }

  // 2) 跳转到侧边栏场景
  try {
    await KwaiUI.withLoading('跳转中', () => navigateToScene('sidebar'));
    console.log('已跳转到侧边栏');
  } catch (err) {
    if (err.code === -10005) {
      KwaiUI.toastError('当前快手版本不支持');
    } else if (err.code === -20041) {
      KwaiUI.toastError('操作过于频繁');
    } else if (err.code === -20042) {
      KwaiUI.toastError('应用未备案或尚未上线');
    } else {
      KwaiUI.toastError('跳转失败');
    }
  }
}
```

---

## 完整使用模式

### 启动检查 + 引导跳转

```ts
// 1) 启动时检查侧边栏是否可用
async function checkSidebarOnStartup() {
  try {
    const result = await checkSliderBarIsAvailable();
    if (result.available) {
      showAddToSidebarGuide();
    }
  } catch (err) {
    // 低版本不支持，静默
  }
}

// 2) 用户点击「添加到侧边栏」按钮
async function onAddToSidebarButton() {
  try {
    const checkResult = await checkSliderBarIsAvailable();
    if (!checkResult.available) {
      KwaiUI.toastError('当前设备不支持侧边栏');
      return;
    }
  } catch (err) {
    // 低版本不支持，可尝试直接 navigate
  }

  try {
    await KwaiUI.withLoading('跳转中', () => navigateToScene('sidebar'));
    KwaiUI.toastSuccess('已跳转到侧边栏');
    giveAddToSidebarReward();
  } catch (err) {
    if (err.code === -10005) {
      KwaiUI.toastError('当前快手版本不支持，请升级');
    } else if (err.code === -20041) {
      KwaiUI.toastError('操作过于频繁，请稍后再试');
    } else if (err.code === -20042) {
      KwaiUI.toastError('应用未备案或尚未上线');
    } else {
      KwaiUI.toastError('跳转失败');
    }
  }
}

// 3) 启动时检查
checkSidebarOnStartup();
```

---

## 常见误用 & 注意事项

- ⚠️ **版本要求**：`checkSliderBarIsAvailable` 需 Android/iOS >= 12.11.10；`navigateToScene` 需 Android >= 13.4.40 / iOS >= 13.5.40，低版本会返回 `-10005`
- ⚠️ **推荐先 check 再 navigate**：先调 `checkSliderBarIsAvailable` 判断是否支持，再调 `navigateToScene` 跳转
- ⚠️ **navigateToScene 频控**：错误码 `-20041` 表示 API 调用次数超过频控限制，不要频繁调用
- ⚠️ **应用未备案**：错误码 `-20042` 表示应用未备案，无法添加到侧边栏，需先完成备案
- ⚠️ **应用已备案但未上线也会返回 -20042**：`-20042` 同时覆盖「未备案」和「已备案但尚未上线发布」两种情况，**返回码相同无法区分**。开发/测试阶段收到 `-20042` 时，应先确认应用是否已上线发布，而不是只检查备案状态；线上收到 `-20042` 才需排查备案问题
- ⚠️ **scene 仅支持 sidebar**：当前只支持 `sidebar` 场景，传入其他值会返回 `-20043`
- ⚠ **配合奖励**：用户成功跳转到侧边栏后可发放奖励（金币/道具/解锁关卡），引导用户操作
- ⚠ **与 Shortcut / CommonUse 配合**：侧边栏是快手 App 内的回访入口，与桌面快捷方式（Shortcut）、设为常用（CommonUse）共同组成留存入口矩阵

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **侧边栏回访**：主界面显示「添加到侧边栏」按钮，点击先 `checkSliderBarIsAvailable` 判断是否支持，再 `navigateToScene('sidebar')` 跳转
- **启动检查**：启动时调 `checkSliderBarIsAvailable` 检查是否支持，支持时显示引导
- **版本兼容**：低版本返回 `-10005` 时提示用户升级快手 App
- **未备案/未上线兜底**：收到 `-20042` 时提示「应用未备案或尚未上线」（开发期常因应用未上线触发，线上才需排查备案）
- **与 Shortcut / CommonUse 配合**：侧边栏、桌面快捷方式、设为常用共同组成留存入口矩阵

推荐：在 `gameplay/kwai-siderbar.js` 中封装：
- `checkSliderBarIsAvailable()` / `navigateToScene(scene)` Promise 化
- `addToSidebar()` 组合封装：先 check 再 navigate
- 错误码统一处理（`-10005` 升级提示、`-20041` 频控提示、`-20042` 「未备案或未上线」提示）
- 低版本静默忽略

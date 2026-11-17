# 添加到桌面模块

## 文件

`kwaiOpenApi/kwai-shortcut.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-shortcut.js');
```

## 调用方式

```js
// 检查是否已添加到桌面
// onSuccess: 已安装；onFail: 未安装 或 接口失败（展示引导 UI）
KwaiShortcut.check({
  onSuccess: function (res) { hideGuide(); },
  onFail:    function (res) { showGuide(); },
});

// 添加到桌面
KwaiShortcut.add({
  onSuccess: function () { console.log('已添加到桌面'); },
  onFail:    function (err) { console.warn(err.code, err.msg); },
});

// 检查是否由桌面快捷方式启动
var fromShortcut = KwaiShortcut.isFromShortcut();
```

## 错误码

| 错误码 | 说明 |
|--------|------|
| -10005 | 暂不支持该功能（iOS 或低版本容器）|

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.addShortcut` / `ks.checkShortcut` / `ks.isLaunchFromShortcut` → [shortcut.md](shortcut.md)

---

## 底层 API 参考

## 概述

通过 `ks.addShortcut` 在手机桌面添加应用入口，`ks.checkShortcut` 检查入口是否已添加（仅 Android），`ks.isLaunchFromShortcut` 判断本次启动是否来自桌面快捷方式。桌面入口方便用户再次访问，也可配合 `isLaunchFromShortcut` 为从桌面进入的用户发放奖励。

> ⚠️ **iOS 限制**：`ks.addShortcut` 在 iOS 上不支持回调（调用后无 success/fail 回调）；`ks.checkShortcut` 仅 Android 支持。

> ⚠️ **调用时机**：`ks.isLaunchFromShortcut` 推荐**在 `ks.onShow` 回调里判断**（每次进入前台都会触发），**不要在冷启动入口处判断**（应用在后台时不会执行该判断）。

> ⚠️ **错误码 -10005**：表示「暂不支持该功能」（iOS 或低版本容器），需做兼容处理。

---

## ks.addShortcut — 添加到桌面

### 概述

在手机桌面添加应用入口。**iOS 不支持回调**（调用后无 success/fail 回调）。

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
| msg | `string` | `"addShortcut:ok"` |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 异常错误码（`-10005` 表示暂不支持）|
| msg | `string` | `"addShortcut:fail"` + 详细错误信息 |

### 标准调用示例

```ts
// 基础用法
ks.addShortcut({
  success() {
    console.log('添加桌面成功');
    KwaiUI.toastSuccess('已添加到桌面');
  },
  fail(err) {
    if (err.code === -10005) {
      console.log('暂不支持该功能');
      KwaiUI.toastError('当前设备不支持添加桌面');
    } else {
      console.log('添加桌面失败', err.msg);
      KwaiUI.toastError('添加失败');
    }
  },
});

// Promise 化
function addShortcut() {
  return new Promise((resolve, reject) => {
    ks.addShortcut({
      success: resolve,
      fail: reject,
    });
  });
}

// 配合引导 UI
async function onAddDesktopButton() {
  try {
    await KwaiUI.withLoading('添加中', addShortcut);
    KwaiUI.toastSuccess('已添加到桌面');
    giveAddDesktopReward();
  } catch (err) {
    if (err.code === -10005) {
      KwaiUI.toastError('当前设备不支持');
    } else {
      KwaiUI.toastError('添加失败');
    }
  }
}
```

---

## ks.checkShortcut — 检查是否已添加

### 概述

检查应用入口是否已添加到手机桌面。**仅 Android 支持**。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | `1` 表示成功 |
| installed | `boolean` | 是否已安装快捷方式 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 异常错误码（`-10005` 表示暂不支持）|
| msg | `string` | 错误信息 |

### 标准调用示例

```ts
// 检查是否已添加，未添加时显示引导
ks.checkShortcut({
  success(res) {
    console.log('是否已添加快捷方式', res.installed);
    if (!res.installed) {
      showAddDesktopGuide();  // 显示「添加到桌面」引导
    } else {
      hideAddDesktopGuide();  // 已添加，隐藏引导
    }
  },
  fail(err) {
    if (err.code === -10005) {
      console.log('暂不支持该功能（iOS 或低版本）');
    } else {
      console.log('检查快捷方式失败', err.msg);
      // 注意：err.msg 为 "apk info is invalid" 时，
      // 也可以在应用内展示桌面入口图标，提醒用户添加
      if (err.msg && err.msg.includes('apk info is invalid')) {
        showAddDesktopGuide();
      }
    }
  },
});

// Promise 化
function checkShortcut() {
  return new Promise((resolve, reject) => {
    ks.checkShortcut({
      success: resolve,
      fail: reject,
    });
  });
}

// 启动时检查是否需要显示「添加到桌面」引导
async function checkAndShowAddDesktopGuide() {
  try {
    const res = await checkShortcut();
    if (!res.installed) {
      showAddDesktopGuide();
    }
  } catch (err) {
    if (err.code === -10005) {
      // iOS 或低版本，静默忽略
    } else if (err.msg && err.msg.includes('apk info is invalid')) {
      // 兼容老版本：也显示引导
      showAddDesktopGuide();
    }
  }
}
```

### 重要说明

> **快捷方式 vs mini apk**：用户安装了快捷方式或 mini apk 均视为成功，会触发 `success` 回调。若两者都未安装，为兼容旧版本会先后检查快捷方式和 mini apk，最终触发 `fail` 回调。因此，当 `err.msg` 为 `"apk info is invalid"` 时，也可以在应用内提示用户添加桌面入口。

---

## ks.isLaunchFromShortcut — 判断是否从桌面快捷方式启动

### 概述

判断本次启动是否来自手机桌面快捷方式。**同步返回** `boolean`。

### 参数

无参数。

### 返回值

| 类型 | 说明 |
|------|------|
| `boolean` | `true` = 从桌面快捷方式启动；`false` = 非桌面快捷方式启动 |

### 标准调用示例

```ts
// 基础用法
if (ks.isLaunchFromShortcut()) {
  // 本次从手机桌面快捷方式启动
  console.log('从桌面快捷方式启动');
  giveDesktopLaunchReward();  // 发放从桌面进入的奖励
} else {
  // 本次不是从手机桌面快捷方式启动
  console.log('非桌面快捷方式启动');
}

// 推荐：在 ks.onShow 回调里判断（每次进入前台都判断）
ks.onShow(() => {
  if (ks.isLaunchFromShortcut()) {
    console.log('[onShow] 从桌面快捷方式进入');
    // 从桌面进入的奖励/统计
    KwaiEvent.emit('launch:from:shortcut');
    trackEvent('launch_from_shortcut');
  }
});

// 不推荐：不要在冷启动入口处判断
// if (ks.isLaunchFromShortcut()) { ... }  // ❌ 应用在后台时不会执行该判断
```

### 注意事项

**调用时机**：
- `ks.isLaunchFromShortcut()` 调用时机开发者可以自行控制，只要确保代码能调用到即可
- **推荐在 `ks.onShow` 回调里判断**，每次进入前台就会调用 `onShow` 事件
- **不推荐在冷启动入口处判断**，应用在后台时不会执行 `ks.isLaunchFromShortcut()`

**调试验证流程**：
1. 使用开发者工具打包，生成调试二维码
2. 使用二维码解析工具（网上搜索「二维码解码器」），识别二维码对应的链接
3. 替换二维码链接中的 `"open_platform_qrcode"` 为 `"retention_apk"`，使用二维码生成工具（网上搜索「二维码生成器」），重新生成新的二维码
4. 使用快手 App 扫码进入应用

**其他事项**：
1. 手机同时安装快手和极速版时，Android 端桌面快捷方式默认优先打开快手，单独测试极速版时需要卸载快手 App，iOS 端桌面快捷方式快手和极速版相互隔离
2. 扫码调试使用测试版本，与线上版本不同；测试版 Apk 启动时会关闭原运行实例，上线后不会出现此问题
3. 按照调试验证流程验证没问题即可提审

---

## 完整使用模式

### 添加到桌面 + 检查 + 从桌面进入奖励

```ts
// 1) 启动时检查是否已添加（Android）
async function checkShortcutOnStartup() {
  try {
    const res = await checkShortcut();
    if (!res.installed) {
      // 未添加，显示「添加到桌面」引导
      showAddDesktopGuide();
    }
  } catch (err) {
    if (err.code === -10005) {
      // iOS 或低版本，静默
    } else if (err.msg && err.msg.includes('apk info is invalid')) {
      // 兼容老版本：也显示引导
      showAddDesktopGuide();
    }
  }
}

// 2) 用户点击「添加到桌面」按钮
async function onAddDesktopButton() {
  try {
    await KwaiUI.withLoading('添加中', addShortcut);
    KwaiUI.toastSuccess('已添加到桌面');
    // 添加成功奖励
    giveAddDesktopReward();
    hideAddDesktopGuide();
    // 重新检查确认
    checkShortcutOnStartup();
  } catch (err) {
    if (err.code === -10005) {
      KwaiUI.toastError('当前设备不支持');
    } else {
      KwaiUI.toastError('添加失败');
    }
  }
}

// 3) 从桌面快捷方式进入时发放奖励
ks.onShow(() => {
  if (ks.isLaunchFromShortcut()) {
    console.log('[onShow] 从桌面快捷方式进入');
    giveDesktopLaunchReward();
    trackEvent('launch_from_shortcut');
  }
});

// 4) 启动时检查
checkShortcutOnStartup();
```

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **方便回访**：主界面显示「添加到桌面」按钮，点击调 `ks.addShortcut`
- **启动检查**：`ks.onShow` 中调 `ks.checkShortcut` 检查是否已添加，未添加显示引导
- **从桌面进入奖励**：`ks.onShow` 中调 `ks.isLaunchFromShortcut`，为从桌面进入的用户发放每日奖励
- **数据统计**：`isLaunchFromShortcut` 返回 true 时上报 `launch_from_shortcut` 事件
- **跨平台兼容**：iOS 静默忽略 `addShortcut` / `checkShortcut` 的回调失败，仅在 Android 显示引导

推荐：在 `gameplay/kwai-shortcut.js` 中封装：
- `addShortcut()` / `checkShortcut()` Promise 化
- `isLaunchFromShortcut()` 直接返回 boolean
- `checkAndShowAddDesktopGuide()` 启动时检查并显示引导
- `onLaunchFromShortcut(callback)` 封装 `ks.onShow` + `isLaunchFromShortcut` 判断
- iOS 静默忽略 `-10005` 错误码
- 兼容 `apk info is invalid` 老版本错误也显示引导

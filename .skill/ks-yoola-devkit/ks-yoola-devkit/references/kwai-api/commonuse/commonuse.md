# 设为常用模块

## 文件

`kwaiOpenApi/kwai-commonuse.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-commonuse.js');
```

## 调用方式

```js
// 检查是否已设为常用
// onSuccess: 已设为常用；onFail: 未设为常用 或 接口失败（展示引导 UI）
KwaiCommonUse.check({
  onSuccess: function (res) { hideGuide(); },
  onFail:    function (res) { showGuide(); },
});

// 设为常用
KwaiCommonUse.add({
  onSuccess: function () { console.log('已设为常用'); },
  onFail:    function (err) { console.warn(err.code, err.msg); },
});
```

## 错误码

| 错误码 | 说明 |
|--------|------|
| -10005 | 暂不支持该功能（iOS 或低版本容器）|

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.addCommonUse` / `ks.checkCommonUse` → [commonuse.md](commonuse.md)

---

## 底层 API 参考

## 概述

通过 `ks.addCommonUse` 支持用户将当前应用设为常用，`ks.checkCommonUse` 检查是否已添加。添加后，用户可在快手「常用」列表快速找到该应用，方便再次访问。

> ⚠️ **错误码 -10005**：表示「暂不支持该功能」（iOS 或低版本容器），需做兼容处理。

> 💡 **与添加到桌面（Shortcut）的区别**：`Shortcut` 是在手机桌面生成图标（类似原生 App），`CommonUse` 是在快手 App 内的「常用」列表置顶。两者可同时接入，覆盖不同回访入口。

---

## ks.addCommonUse — 设为常用

### 概述

将当前应用添加到快手「常用」列表。

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
| msg | `string` | `"addCommonUse:ok"` |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 异常错误码（`-10005` 表示暂不支持）|
| msg | `string` | `"addCommonUse:fail"` + 详细错误信息 |

### 标准调用示例

```ts
// 基础用法
ks.addCommonUse({
  success() {
    console.log('设为常用成功');
    KwaiUI.toastSuccess('已设为常用');
  },
  fail(err) {
    if (err.code === -10005) {
      console.log('暂不支持该功能');
      KwaiUI.toastError('当前设备不支持');
    } else {
      console.log('设为常用失败', err.msg);
      KwaiUI.toastError('设置失败');
    }
  },
});

// Promise 化
function addCommonUse() {
  return new Promise((resolve, reject) => {
    ks.addCommonUse({
      success: resolve,
      fail: reject,
    });
  });
}

// 配合引导 UI
async function onSetCommonUseButton() {
  try {
    await KwaiUI.withLoading('设置中', addCommonUse);
    KwaiUI.toastSuccess('已设为常用');
    giveCommonUseReward();
  } catch (err) {
    if (err.code === -10005) {
      KwaiUI.toastError('当前设备不支持');
    } else {
      KwaiUI.toastError('设置失败');
    }
  }
}
```

---

## ks.checkCommonUse — 检查是否已设为常用

### 概述

检查用户是否已将当前应用设为常用。

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
| msg | `string` | `"checkCommonUse:ok"` |
| isCommonUse | `boolean` | `true` 表示已设为常用；`false` 表示未设为常用 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 异常错误码（`-10005` 表示暂不支持）|
| msg | `string` | `"checkCommonUse:fail"` + 详细错误信息 |

### 标准调用示例

```ts
// 检查是否已设为常用，未设时显示引导
ks.checkCommonUse({
  success(res) {
    console.log(`设为常用查询结果为：${res.isCommonUse}`);
    if (!res.isCommonUse) {
      showSetCommonUseGuide();  // 显示「设为常用」引导
    } else {
      hideSetCommonUseGuide();  // 已设为常用，隐藏引导
    }
  },
  fail(err) {
    if (err.code === -10005) {
      console.log('暂不支持该功能');
    } else {
      console.log('设为常用查询失败', err.msg);
    }
  },
});

// Promise 化
function checkCommonUse() {
  return new Promise((resolve, reject) => {
    ks.checkCommonUse({
      success: resolve,
      fail: reject,
    });
  });
}

// 启动时检查是否需要显示「设为常用」引导
async function checkAndShowCommonUseGuide() {
  try {
    const res = await checkCommonUse();
    if (!res.isCommonUse) {
      showSetCommonUseGuide();
    } else {
      hideSetCommonUseGuide();
    }
  } catch (err) {
    if (err.code === -10005) {
      // iOS 或低版本，静默忽略
    } else {
      console.warn('checkCommonUse failed:', err);
    }
  }
}
```

---

## 完整使用模式

### 设为常用 + 检查 + 奖励

```ts
// 1) 启动时检查是否已设为常用
async function checkCommonUseOnStartup() {
  try {
    const res = await checkCommonUse();
    if (!res.isCommonUse) {
      // 未设为常用，显示引导
      showSetCommonUseGuide();
    }
  } catch (err) {
    if (err.code === -10005) {
      // iOS 或低版本，静默
    }
  }
}

// 2) 用户点击「设为常用」按钮
async function onSetCommonUseButton() {
  try {
    await KwaiUI.withLoading('设置中', addCommonUse);
    KwaiUI.toastSuccess('已设为常用');
    // 设为常用成功奖励
    giveCommonUseReward();
    hideSetCommonUseGuide();
    // 重新检查确认
    checkCommonUseOnStartup();
  } catch (err) {
    if (err.code === -10005) {
      KwaiUI.toastError('当前设备不支持');
    } else {
      KwaiUI.toastError('设置失败');
    }
  }
}

// 3) 启动时检查
checkCommonUseOnStartup();
```

### 与 Shortcut 模块配合

```ts
// 同时接入 Shortcut（桌面快捷方式）和 CommonUse（设为常用）
// Shortcut 覆盖桌面入口，CommonUse 覆盖快手 App 内「常用」列表入口

async function checkRetentionOnStartup() {
  // 检查桌面快捷方式
  try {
    const shortcutRes = await KwaiShortcut.checkShortcut();
    if (!shortcutRes.installed) {
      showAddDesktopGuide();
    }
  } catch (err) {
    // iOS 或低版本，静默
  }

  // 检查设为常用
  try {
    const commonUseRes = await checkCommonUse();
    if (!commonUseRes.isCommonUse) {
      showSetCommonUseGuide();
    }
  } catch (err) {
    // iOS 或低版本，静默
  }
}
```

---

## 常见误用 & 注意事项

- ⚠️ **错误码 -10005**：表示「暂不支持该功能」（iOS 或低版本容器），需做兼容处理，不要崩溃
- ⚠️ **与 Shortcut 区别**：`Shortcut` 在手机桌面生成图标（类似原生 App），`CommonUse` 在快手 App 内「常用」列表置顶，两者可同时接入
- ⚠️ **success 返回 code=1**：与其他 API 的成功判断方式一致，`code === 1` 表示成功
- ⚠️ **checkCommonUse 返回 isCommonUse**：`true` 表示已设为常用，`false` 表示未设为常用
- ⚠ **iOS 兼容**：iOS 上可能返回 `-10005`，需静默忽略，不显示引导
- ⚠ **配合奖励**：设为常用成功后可发放奖励（金币/道具/解锁关卡），引导用户操作

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **方便回访**：主界面显示「设为常用」按钮，点击调 `ks.addCommonUse`
- **启动检查**：启动时调 `ks.checkCommonUse` 检查是否已设为常用，未设显示引导
- **与 Shortcut 配合**：同时接入桌面快捷方式和设为常用，覆盖不同回访入口
- **奖励激励**：设为常用成功后发放奖励

推荐：在 `gameplay/kwai-commonuse.js` 中封装：
- `addCommonUse()` / `checkCommonUse()` Promise 化
- `checkAndShowCommonUseGuide()` 启动时检查并显示引导
- `addCommonUseWithUI()` 带 withLoading + toast 提示
- iOS 静默忽略 `-10005` 错误码
- 与 `KwaiShortcut` 配合提供统一留存入口

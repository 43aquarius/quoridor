# 授权模块

## 封装层

文件：`kwaiOpenApi/kwai-open.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-open.js');
```

```js
KwaiOpen.authorize({ scope: 'scope.userInfo', onSuccess: function () {}, onFail: function (err) {} });
KwaiOpen.getSetting({ onSuccess: function (res) { console.log(res.authSetting); }, onFail: function (err) {} });
```

---

## 底层 API 参考

## 概述

通过 `ks.authorize` 向用户发起授权请求（如用户信息、保存到相册），通过 `ks.getSetting` 查询当前已授权的权限列表。两者配合实现「先查后请」的优雅授权流程，避免重复弹窗。

> ⚠️ **授权状态规则**：
> - **尚未发起过授权**：弹窗询问用户
> - **用户已同意**：不弹窗，直接返回成功
> - **用户已拒绝**：不弹窗，直接返回失败（需引导用户去系统设置开启）
>
> ⚠️ **scope.userInfo 前置**：申请 `scope.userInfo` 授权前必须先调用 `ks.login`。

---

## ks.authorize — 发起授权请求

### 概述

向用户发起授权请求。根据之前的授权状态决定是否弹窗：
1. 尚未发起过授权请求 → 弹窗询问用户是否同意
2. 用户之前已同意授权 → 不弹窗，直接成功
3. 用户之前已拒绝授权 → 不弹窗，直接失败

### 参数 Schema

**Object object**

| 属性 | 类型 | 说明 | 必填 |
|------|------|------|------|
| scope | `string` | 需要获取权限的 scope | 是 |
| success | `function` | 申请授权成功的回调 | 否 |
| fail | `function` | 申请授权失败的回调 | 否 |
| complete | `function` | 申请授权完成的回调（无论成功失败都会被调用）| 否 |

**scope 合法值：**

| 值 | 说明 |
|----|------|
| `scope.userInfo` | 用户信息（**前置**：需先 `ks.login`）|
| `scope.writePhotosAlbum` | 保存到相册权限 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 错误码 |
| msg | `string` | 错误描述 |

### 标准调用示例

```ts
// 1) 基础用法：申请用户信息授权
ks.authorize({
  scope: 'scope.userInfo',
  success() {
    console.log('授权获取用户信息成功');
    // 授权成功后可以调 ks.getUserInfo
    ks.getUserInfo({
      success(res) {
        console.log('userInfo:', res.userInfo);
      },
    });
  },
  fail(error) {
    console.log('授权获取用户信息失败:', JSON.stringify(error));
    // 用户拒绝，引导去系统设置
    if (error.code === xxx) {
      KwaiUI.showModal({
        title: '提示',
        content: '需要用户信息授权才能展示您的昵称和头像，是否去设置开启？',
        confirmText: '去设置',
        success(res) {
          if (res.confirm) {
            ks.openSetting({});  // 打开设置页（如有）
          }
        },
      });
    }
  },
  complete() {
    console.log('授权获取用户信息完成');
  },
});
```

```ts
// 2) 申请保存到相册授权
ks.authorize({
  scope: 'scope.writePhotosAlbum',
  success() {
    console.log('相册授权成功');
    // 授权后可以调 ks.saveImageToPhotosAlbum
  },
  fail(error) {
    console.log('相册授权失败:', error.msg);
    KwaiUI.toastError('需要相册权限才能保存图片');
  },
});
```

```ts
// 3) Promise 化封装
function authorize(scope) {
  return new Promise((resolve, reject) => {
    ks.authorize({
      scope: scope,
      success: resolve,
      fail: reject,
    });
  });
}

// 4) 组合封装：先查授权状态，未授权则申请
async function ensureAuthorized(scope) {
  try {
    const setting = await getSetting();
    if (setting.authSetting[scope]) {
      // 已授权
      return true;
    }
  } catch (err) {
    // 查询失败，继续尝试申请
  }
  try {
    await authorize(scope);
    return true;
  } catch (err) {
    console.warn('authorize failed:', err);
    return false;
  }
}

// 5) 完整的用户信息授权+获取流程
async function ensureUserInfo() {
  // userInfo 授权需先 ks.login
  await ensureLogin();
  const ok = await ensureAuthorized('scope.userInfo');
  if (!ok) {
    KwaiUI.toastError('需授权才能获取用户信息');
    return null;
  }
  return await getUserInfo();
}
```

### 常见误用 & 注意事项

- ⚠️ **scope.userInfo 前置 ks.login**：申请 `scope.userInfo` 前必须先 `ks.login`，否则会失败
- ⚠️ **用户拒绝后不会再弹窗**：用户一旦拒绝，后续 `authorize` 直接 `fail`，需引导用户去系统设置开启
- ⚠️ **不要每次操作都 authorize**：用户已同意后 `authorize` 直接成功，但仍建议先 `getSetting` 查询，避免无谓调用
- ⚠️ **scope 字符串必须准确**：`scope.userInfo` / `scope.writePhotosAlbum`，大小写敏感
- ⚠️ **必须由用户点击行为触发**：首次申请授权时系统弹窗，**不能自动调用**，需在用户点击「获取头像」「保存图片」等按钮时触发

---

## ks.getSetting — 查询授权设置

### 概述

异步获取当前用户的权限设置，返回值中**仅包含已请求过的权限**（未请求过的权限不在返回值中）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 说明 | 必填 |
|------|------|--------|------|------|
| success | `function` | - | 接口调用成功的回调 | 否 |
| fail | `function` | - | 接口调用失败的回调 | 否 |
| complete | `function` | - | 接口调用完成的回调 | 否 |

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| authSetting | `Object` | 查询结果，key 是 scope，value 是 bool（仅包含已请求过的权限）|

**authSetting 结构：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `scope.userInfo` | `boolean` | 是否授权用户信息（仅当请求过该权限时存在）|
| `scope.writePhotosAlbum` | `boolean` | 是否授权保存到相册（仅当请求过该权限时存在）|

> ⚠️ 官方文档将返回字段标为 `result`，但实际为 `authSetting`（约定俗成的命名）。请以实际返回为准。

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 错误码 |
| msg | `string` | 错误描述 |

### 标准调用示例

```ts
// 1) 基础用法：查询所有已请求的权限
ks.getSetting({
  success(res) {
    console.log('authSetting:', res.authSetting);
    // 可能的输出：{ 'scope.userInfo': true, 'scope.writePhotosAlbum': false }
    // 注意：未请求过的权限不在 res.authSetting 中
  },
  fail(error) {
    console.log('getSetting failed:', error);
  },
});
```

```ts
// 2) Promise 化封装
function getSetting() {
  return new Promise((resolve, reject) => {
    ks.getSetting({
      success: (res) => resolve(res.authSetting || {}),
      fail: reject,
    });
  });
}

// 3) 检查单个权限是否已授权
async function isAuthorized(scope) {
  const setting = await getSetting();
  return setting[scope] === true;
}

// 4) 启动时检查授权状态，按需申请
async function checkAuthOnStartup() {
  const setting = await getSetting();
  if (setting['scope.userInfo'] === false) {
    // 曾请求但被拒绝，引导用户去设置
    showAuthGuide('用户信息');
  }
  if (setting['scope.writePhotosAlbum'] === false) {
    showAuthGuide('保存到相册');
  }
}

// 5) 保存图片前的授权检查
async function saveImageSafely(filePath) {
  let authorized = await isAuthorized('scope.writePhotosAlbum');
  if (authorized === undefined) {
    // 从未请求过，发起申请
    try {
      await authorize('scope.writePhotosAlbum');
      authorized = true;
    } catch (err) {
      KwaiUI.toastError('需相册权限才能保存');
      return;
    }
  } else if (!authorized) {
    // 曾拒绝，引导去设置
    KwaiUI.showModal({
      title: '提示',
      content: '需要相册权限才能保存图片，是否去设置开启？',
      success(res) {
        if (res.confirm) {
          // ks.openSetting()  // 如有
        }
      },
    });
    return;
  }
  // 已授权，保存
  await KwaiMedia.saveImageToPhotosAlbum(filePath);
  KwaiUI.toastSuccess('已保存到相册');
}
```

### 常见误用 & 注意事项

- ⚠️ **仅返回已请求过的权限**：从未请求过的权限**不在** `authSetting` 中，判断时用 `=== true` 而非 `!setting[scope]`（`undefined` 表示未请求，`false` 表示拒绝）
- ⚠️ **三种状态**：`true`（已授权）/ `false`（曾拒绝）/ `undefined`（从未请求）
- ⚠️ **不要缓存授权状态**：用户可能在系统设置中随时撤销授权，每次操作前都应 `getSetting` 实时查询
- ⚠️ **字段名差异**：官方文档标为 `result`，实际返回字段名可能是 `authSetting`，以实际为准

### 状态判断速查表

| `setting[scope]` 值 | 含义 | 建议处理 |
|------|------|---------|
| `true` | 已授权 | 直接执行操作 |
| `false` | 曾拒绝 | 引导用户去系统设置开启 |
| `undefined` | 从未请求 | 调 `ks.authorize` 发起申请 |

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **首次需要用户信息**：需要展示用户昵称/头像时 → 先 `getSetting` 查 `scope.userInfo`，未请求则 `authorize`，曾拒绝则引导用户前往设置
- **保存图片到相册**：调用 `ks.saveImageToPhotosAlbum` 前先检查 `scope.writePhotosAlbum`，未授权则引导申请
- **启动时检查授权**：定期 `getSetting` 检查关键权限是否被撤销，及时提示用户
- **授权失败引导**：用户拒绝后 `fail` 时弹 `showModal` 引导去系统设置开启

推荐：在 `gameplay/kwai-open.js` 中封装：
- `authorize(scope)` Promise 化
- `getSetting()` Promise 化
- `isAuthorized(scope)` 单权限检查
- `ensureAuthorized(scope)` 组合封装：先查后请
- `saveImageSafely(filePath)` / `getUserInfoSafely()` 业务级封装，自动处理授权
- 保存图片到相册前自动检查 `scope.writePhotosAlbum`，用户信息前自动检查 `scope.userInfo`
- 用户拒绝后引导去系统设置，不重复弹窗


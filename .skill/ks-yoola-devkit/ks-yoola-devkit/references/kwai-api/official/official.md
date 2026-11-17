# 官方号关注模块

## 文件

`kwaiOpenApi/kwai-official.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-official.js');
```

## 调用方式

```js
// 检查是否已关注
// onSuccess: 已关注；onFail: 未关注 或 接口失败（展示引导 UI）
KwaiOfficial.checkFollow({
  accountType: KwaiOfficial.ACCOUNT_TYPES.OFFICIAL,
  onSuccess:   function () { hideGuide(); },
  onFail:      function () { showGuide(); },
});

// 打开官方号主页（引导关注）
KwaiOfficial.openProfile({
  accountType: KwaiOfficial.ACCOUNT_TYPES.OFFICIAL,
  onSuccess:   function () {},
  onFail:      function (err) { console.warn(err.errorCode); },
});
```

## accountType 说明

| 值 | 说明 |
|----|------|
| `KwaiOfficial.ACCOUNT_TYPES.CP` | CP 服务号 |
| `KwaiOfficial.ACCOUNT_TYPES.OFFICIAL` | 快手官方账号 |

## 错误码

| errorCode | 说明 |
|-----------|------|
| 1 | 成功 |
| -10005 | 暂不支持该功能 |

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.checkFollowState` / `ks.openUserProfile` → [official.md](official.md)

---

## 底层 API 参考

## 概述

通过 `ks.checkFollowState` 查看用户是否关注官方账号（CP 服务号或快手官方账号），`ks.openUserProfile` 打开账号 profile 页供用户关注。可用于沉淀关注关系、发送消息和通知活动。

> ⚠️ **错误码 -10005**：表示「暂不支持官方号」（iOS 或低版本容器），应隐藏官方号入口或做兼容处理。

> ⚠️ **推荐先 check 再 open**：官方示例中 `openUserProfile` 前先调 `checkFollowState` 判断是否支持该业务，不支持时（`errorCode === -10005`）隐藏入口，支持时再 `openUserProfile`。

> ⚠️ **accountType 固定字符串**：不需要填具体账号，只需填 `CPServiceAccount`（CP 服务号）或 `MiniGameOfficialAccount`（快手官方账号）。

---

## ks.checkFollowState — 查看关注官方帐号状态

### 概述

查看用户关注官方账号的状态。支持两类账号：`CPServiceAccount`（CP 服务号）和 `MiniGameOfficialAccount`（快手官方账号）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| accountType | `string` | - | 是 | 要关注的用户类型（见下方合法值）|
| callback | `function` | - | 是 | 回调信息 |

**accountType 合法值：**

| 值 | 说明 |
|----|------|
| `CPServiceAccount` | CP 的服务号 |
| `MiniGameOfficialAccount` | 快手官方账号 |

> 💡 **不需要填具体的帐号**，就填这两个字符串即可。

**callback 接收参数 Object result：**

| 属性 | 类型 | 说明 |
|------|------|------|
| errorCode | `number` | `1` 表示成功；`-10005` 表示暂不支持官方号 |
| errorMsg | `string` | 错误信息 |
| hasFollow | `boolean` | 是否已关注 |

### 标准调用示例

```ts
// 检查是否关注 CP 服务号
ks.checkFollowState({
  accountType: 'CPServiceAccount',
  callback: (result) => {
    if (result.errorCode === -10005) {
      // 表明暂不支持官方号，可以隐藏官方号入口
      console.log('not support CPServiceAccount');
      hideFollowEntry();
    } else {
      // 支持该业务，正常处理业务逻辑
      console.log('check Follow CP Service Account, result:', JSON.stringify(result));
      if (result.hasFollow) {
        // 已关注
        showFollowedState();
      } else {
        // 未关注，显示关注引导
        showFollowGuide();
      }
    }
  },
});

// 检查是否关注快手官方账号
ks.checkFollowState({
  accountType: 'MiniGameOfficialAccount',
  callback: (result) => {
    if (result.errorCode === -10005) {
      console.log('not support MiniGameOfficialAccount');
      hideOfficialEntry();
    } else if (result.hasFollow) {
      showFollowedState();
    } else {
      showFollowGuide();
    }
  },
});

// Promise 化封装
function checkFollowState(accountType) {
  return new Promise((resolve, reject) => {
    ks.checkFollowState({
      accountType: accountType,
      callback: (result) => {
        if (result.errorCode === 1) {
          resolve(result);  // 成功，hasFollow 在 result 中
        } else if (result.errorCode === -10005) {
          resolve({ ...result, notSupported: true });
        } else {
          reject(result);
        }
      },
    });
  });
}

// 使用
async function checkCPServiceAccountFollow() {
  try {
    const result = await checkFollowState('CPServiceAccount');
    if (result.notSupported) {
      hideFollowEntry();
    } else if (result.hasFollow) {
      showFollowedState();
    } else {
      showFollowGuide();
    }
  } catch (err) {
    console.error('checkFollowState failed:', err);
  }
}
```

---

## ks.openUserProfile — 打开官方帐号 profile

### 概述

打开官方帐号 profile 页（让用户关注或查看官方帐号）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| accountType | `string` | - | 是 | 要关注的用户类型（同 `checkFollowState`）|
| callback | `function` | - | 是 | 回调信息 |

**accountType 合法值：**

| 值 | 说明 |
|----|------|
| `CPServiceAccount` | CP 的服务号 |
| `MiniGameOfficialAccount` | 快手官方账号 |

**callback 接收参数 Object result：**

| 属性 | 类型 | 说明 |
|------|------|------|
| errorCode | `number` | `1` 表示成功 |
| errorMsg | `string` | 错误信息 |

### 标准调用示例

```ts
// 打开 CP 服务号 profile
ks.openUserProfile({
  accountType: 'CPServiceAccount',
  callback: (result) => {
    console.log('open CP Service Account Profile, result:', JSON.stringify(result));
  },
});

// 打开快手官方账号 profile
ks.openUserProfile({
  accountType: 'MiniGameOfficialAccount',
  callback: (result) => {
    console.log('open MiniGame Official Profile, result:', JSON.stringify(result));
  },
});

// Promise 化封装
function openUserProfile(accountType) {
  return new Promise((resolve, reject) => {
    ks.openUserProfile({
      accountType: accountType,
      callback: (result) => {
        if (result.errorCode === 1) {
          resolve(result);
        } else {
          reject(result);
        }
      },
    });
  });
}
```

---

## 完整使用模式

### 先 check 再 open（官方推荐流程）

```ts
// 官方推荐流程：先 checkFollowState 判断是否支持，再 openUserProfile 打开 profile
async function openMiniGameOfficialProfile() {
  // 1) 先检查是否支持官方号业务
  try {
    const checkResult = await checkFollowState('MiniGameOfficialAccount');
    if (checkResult.notSupported) {
      console.log('not support MiniGameOfficialAccount');
      hideOfficialEntry();
      return;
    }
    // 2) 支持该业务，正常处理（包含已关注/未关注/错误逻辑）
    if (checkResult.hasFollow) {
      // 已关注，可选直接打开 profile 或不显示入口
      console.log('user has followed');
    } else {
      // 未关注，显示关注引导按钮
      showFollowButton();
    }
  } catch (err) {
    console.error('checkFollowState failed:', err);
  }
}

// 用户点击关注按钮
async function onFollowButton() {
  try {
    const result = await openUserProfile('MiniGameOfficialAccount');
    console.log('openUserProfile result:', result);
    // profile 关闭后可重新 check 确认是否已关注
    const checkResult = await checkFollowState('MiniGameOfficialAccount');
    if (checkResult.hasFollow) {
      // 已关注，发放关注奖励
      giveFollowReward();
      hideFollowButton();
    }
  } catch (err) {
    console.error('openUserProfile failed:', err);
  }
}

// 启动时检查
openMiniGameOfficialProfile();
```

### 同时接入 CP 服务号与快手官方账号

```ts
// 同时检查 CP 服务号和快手官方账号
async function checkAllOfficialAccounts() {
  // 1) 检查 CP 服务号
  try {
    const cpResult = await checkFollowState('CPServiceAccount');
    if (cpResult.notSupported) {
      hideCPServiceAccountEntry();
    } else if (!cpResult.hasFollow) {
      showCPServiceAccountGuide();
    }
  } catch (err) {
    console.error('CPServiceAccount check failed:', err);
  }

  // 2) 检查快手官方账号
  try {
    const officialResult = await checkFollowState('MiniGameOfficialAccount');
    if (officialResult.notSupported) {
      hideMiniGameOfficialEntry();
    } else if (!officialResult.hasFollow) {
      showMiniGameOfficialGuide();
    }
  } catch (err) {
    console.error('MiniGameOfficialAccount check failed:', err);
  }
}
```

---

## 常见误用 & 注意事项

- ⚠️ **错误码 -10005**：表示「暂不支持官方号」（iOS 或低版本容器），应隐藏官方号入口或做兼容处理
- ⚠️ **推荐先 check 再 open**：官方示例中 `openUserProfile` 前先调 `checkFollowState` 判断是否支持该业务
- ⚠ **accountType 固定字符串**：不需要填具体帐号，只需填 `CPServiceAccount` 或 `MiniGameOfficialAccount`
- ⚠ **errorCode 与其他 API 不同**：本 API 用 `errorCode` 而非 `code`，`1` 表示成功，`-10005` 表示不支持
- ⚠ **callback 字段名**：本 API 用 `callback` 而非 `success`/`fail`，成功/失败统一通过 `errorCode` 判断
- ⚠ **hasFollow 仅 checkFollowState 返回**：`openUserProfile` 不返回 `hasFollow`，需在 profile 关闭后重新 `checkFollowState` 确认
- ⚠ **关注后奖励**：用户关注后可发放奖励（金币/道具/解锁关卡），引导用户关注
- ⚠ **CP 服务号与快手官方账号**：`CPServiceAccount` 是 CP 自己的服务号（开发者运营），`MiniGameOfficialAccount` 是快手官方账号（快手运营）

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **关注引导**：主界面显示「关注官方号」按钮，点击先 `checkFollowState` 判断是否支持，再 `openUserProfile` 打开 profile
- **启动检查**：启动时调 `checkFollowState` 检查是否已关注，未关注显示引导
- **关注奖励**：用户关注后（profile 关闭后重新 check 确认 `hasFollow` 为 true）发放奖励
- **双号接入**：同时检查 CP 服务号和快手官方账号，分别显示关注引导
- **iOS 兼容**：iOS 上 `errorCode === -10005` 时静默隐藏入口

推荐：在 `gameplay/kwai-official.js` 中封装：
- `checkFollowState(accountType)` / `openUserProfile(accountType)` Promise 化
- `checkAndShowFollowGuide(accountType)` 启动时检查并显示引导
- `openProfileAndCheck(accountType)` 打开 profile 后重新 check 确认是否已关注
- iOS 静默忽略 `-10005` 错误码
- 双账号（CP 服务号 + 快手官方账号）同时接入

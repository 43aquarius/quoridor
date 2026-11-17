# 登录模块

## 封装层

文件：`kwaiOpenApi/kwai-open.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-open.js');
```

```js
KwaiOpen.login({ onSuccess: function (res) { console.log('code:', res.code); }, onFail: function (err) {} });
KwaiOpen.checkSession({ onSuccess: function () {}, onFail: function () {} });
```

> 应用登录推荐使用 `kwaiOpenApi/kwai-login.js`（`KwaiLogin.init`）而非直接调用 `KwaiOpen.login`，前者已封装静默登录和游客态降级。

---

## 底层 API 参考

## 概述

通过 `ks.login` 获取用户临时登录凭证 `code`，传给业务服务器换取 `openid` 和 `session_key`；通过 `ks.checkSession` 检查登录态是否过期，避免在未过期时重复 `ks.login` 导致 `session_key` 失效。

> ⚠️ **正确使用 ks.login 与 ks.checkSession**：`session_key` 有一定有效期，用户越频繁使用应用，有效期越长。**session_key 未过期时调用 `ks.login` 会刷新会话，产生新的 `session_key`，服务器存储的旧 `session_key` 随即失效**。因此应：启动时先 `ks.checkSession`，未过期则复用，过期才 `ks.login`。

> ⚠️ **code 是临时凭证**：`ks.login` 返回的 `code` 仅一次性使用，需**立即**传给服务器用 `code2Session` 接口换取 `openid` 和 `session_key`，不能缓存复用。

---

## ks.login — 登录

### 概述

前端通过调用该接口获取用户临时登录凭证 `code`，再传给业务服务器换取用户身份标识 `open_id`、会话密钥 `session_key` 等信息。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 登录成功回调 |
| fail | `function` | - | 否 | 登录失败回调 |
| complete | `function` | - | 否 | 无论成功失败都会执行的完成回调 |

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `string` | 登录临时凭证，传给服务器用 `code2Session` 换取 `open_id` / `session_key` |

### 标准调用示例

```ts
// 1) 基础用法：获取 code 后传给服务器
ks.login({
  success(res) {
    console.log('login code:', res.code);
    // 立即传给服务器换取 openid + session_key
    exchangeCodeForSession(res.code);
  },
  fail(error) {
    console.error('login failed:', error);
  },
  complete() {
    console.log('login complete');
  },
});

async function exchangeCodeForSession(code) {
  try {
    const result = await KwaiNetwork.request({
      url: 'https://api.example.com/auth/code2session',
      method: 'POST',
      data: { code: code },
    });
    // 服务器返回 openid + session_key（session_key 只存服务器）
    window._openid = result.openid;
    window._userToken = result.token;
    KwaiStorage.set('user_token', result.token);
    KwaiStorage.set('user_openid', result.openid);
    KwaiEvent.emit('kwai:login:success', { openid: result.openid });
  } catch (err) {
    console.error('code2session failed:', err);
    KwaiUI.toastError('登录失败');
  }
}
```

```ts
// 2) Promise 化封装
function login() {
  return new Promise((resolve, reject) => {
    ks.login({
      success: resolve,
      fail: reject,
    });
  });
}

// 3) 完整登录流程：先 checkSession，过期才 login
async function ensureLogin() {
  try {
    // 先检查登录态
    await checkSession();
    console.log('session valid, reuse login');
    const token = KwaiStorage.get('user_token');
    if (token) {
      window._userToken = token;
      return token;
    }
  } catch (err) {
    // session 过期，重新登录
    console.log('session expired, re-login');
  }
  // 重新登录
  const res = await login();
  await exchangeCodeForSession(res.code);
  return window._userToken;
}
```

### 常见误用 & 注意事项

- ⚠️ **code 是一次性**：`code` 只能用一次，拿到后立即传服务器，不能缓存
- ⚠️ **session_key 不要下发前端**：`session_key` 只在服务器存储，用于解密敏感数据、校验 `signature`，**不要通过接口返回前端**
- ⚠️ **不要每次启动都调 ks.login**：先 `ks.checkSession`，未过期复用，过期才 `ks.login`，避免无谓刷新 `session_key`
- ⚠️ **登录态丢失处理**：`fail` 时引导用户重试，多次失败提示网络问题
- ⚠️ **静默登录**：`ks.login` 是静默的，**不弹窗**，用户无感知

---

## ks.checkSession — 检查登录态

### 概述

检查 `ks.login` 返回的登录态是否过期。`session_key` 存在一定有效期，用户使用应用越频繁，有效期越长；过期后需重新调用 `ks.login`。

> ⚠️ **关键**：若前端在 `session_key` 尚未过期时调用 `ks.login`，会导致会话被刷新，产生新的 `session_key`，业务服务器存储的旧 `session_key` 也随即失效。**所以应正确使用 `ks.login` 和 `ks.checkSession`**。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 登录态**未过期**的回调函数 |
| fail | `function` | - | 否 | 登录态**失效**的回调函数 |
| complete | `function` | - | 否 | 登录态检查完成回调，无论是否有效都会执行 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 错误码：`20038` 未登录或登录态失效，需重新登录；`20001` 未知错误（如网络连接失败等），请重试 |
| msg | `string` | 错误信息 |

### 标准调用示例

```ts
// 1) 基础用法
ks.checkSession({
  success() {
    // 登录态有效，复用本地 token
    console.log('session valid');
    const token = KwaiStorage.get('user_token');
    if (token) {
      window._userToken = token;
    }
  },
  fail(err) {
    // 登录态失效，重新登录
    console.log('session expired, code:', err.code, 'msg:', err.msg);
    if (err.code === 20038) {
      // 未登录或登录态失效，重新 ks.login
      ks.login({
        success(res) {
          exchangeCodeForSession(res.code);
        },
      });
    } else if (err.code === 20001) {
      // 网络错误，重试
      KwaiUI.toastError('网络异常，请重试');
    }
  },
});
```

```ts
// 2) Promise 化封装
function checkSession() {
  return new Promise((resolve, reject) => {
    ks.checkSession({
      success: resolve,
      fail: reject,
    });
  });
}

// 3) 启动时的登录态检查流程
async function checkLoginOnStartup() {
  const token = KwaiStorage.get('user_token');
  if (!token) {
    // 本地无 token，直接登录
    return ensureLogin();
  }
  try {
    await checkSession();
    // 登录态有效，复用 token
    window._userToken = token;
    console.log('reuse existing session');
    KwaiEvent.emit('kwai:login:ready', { token });
  } catch (err) {
    // 登录态失效，重新登录
    console.log('session invalid, re-login');
    return ensureLogin();
  }
}

// 4) 网络请求 401 时自动触发重新登录
KwaiEvent.on('network:401', async () => {
  console.log('401 received, checking session');
  try {
    await checkSession();
    // session 有效，可能是 token 失效，重新换取
    const loginRes = await login();
    await exchangeCodeForSession(loginRes.code);
  } catch (err) {
    // session 失效，重新登录
    const loginRes = await login();
    await exchangeCodeForSession(loginRes.code);
  }
});
```

### 常见误用 & 注意事项

- ⚠️ **success 表示未过期，fail 表示过期**：与常规 API 相反，`checkSession` 的 `success` 在登录态有效时触发，`fail` 在失效时触发
- ⚠️ **不要在 checkSession 失败时无脑重试**：`code: 20038` 是登录态失效（正常情况，需重新 `ks.login`），`code: 20001` 是网络错误（可重试）
- ⚠️ **启动时先 checkSession**：避免在 `session_key` 未过期时调 `ks.login` 导致服务器存储的 `session_key` 失效
- ⚠️ **网络请求 401 时也要 checkSession**：服务器返回 401 可能是 token 过期，也可能是 `session_key` 失效，需区分处理
- ⚠️ **checkSession 本身也可能失败**：如网络异常（`code: 20001`），此时不能确定登录态是否有效，建议降级为 `ks.login`

### 错误码

| code | 含义 | 处理建议 |
|------|------|---------|
| `20038` | 未登录或登录态失效 | 重新调用 `ks.login` |
| `20001` | 未知错误（如网络连接失败）| 重试或提示用户检查网络 |

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **启动登录**：应用启动时静默登录 → 先 `ks.checkSession`，过期才 `ks.login`，避免无谓刷新 `session_key`
- **网络请求 401**：服务器返回 401 时触发 `checkSession` + 必要时 `ks.login` 重新登录
- **code 换 session**：`ks.login` 拿到 `code` 后立即传服务器 `code2Session` 换取 `openid` + `session_key`（`session_key` 只存服务器）
- **token 缓存**：登录成功后缓存 token 到 `KwaiStorage`，启动时读取复用
- **敏感数据解密**：服务器用 `session_key` 解密 `encryptedData`（如 `getUserInfo` 的 `signature` 校验）

推荐：在 `gameplay/kwai-open.js` 中封装：
- `login()` Promise 化
- `checkSession()` Promise 化
- `ensureLogin()` 组合封装：先 `checkSession`，过期才 `login`
- 启动时自动调用 `ensureLogin()`，监听 `network:401` 自动重新登录
- 登录成功后 emit `kwai:login:ready` 事件，业务模块订阅后启动需要登录态的逻辑
- 与 `user/SKILL.md` 的登录流程模块配合：`open/login.md` 提供底层 API，`user/SKILL.md` 提供业务层封装


# 用户信息模块

## 封装层

文件：`kwaiOpenApi/kwai-open.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-open.js');
```

```js
KwaiOpen.getUserInfo({
  onSuccess: function (res) { console.log(res.userInfo); },
  onFail:    function (err) {},
});
```

---

## 底层 API 参考

## 概述

通过 `ks.getUserInfo` 获取当前用户的公开信息（昵称、头像、性别、城市、年龄、是否成年），用于展示用户资料、头像上传前的当前头像预览等场景。

> ⚠️ **前置条件**：调用 `ks.getUserInfo` 前需先调用 `ks.authorize({ scope: 'scope.userInfo' })` 获取用户授权；`scope.userInfo` 授权需先调用 `ks.login` 接口。

> ⚠️ **不含敏感信息**：返回的 `userInfo` 不包含 `openid` 等敏感信息，敏感信息需通过服务端 `code2Session` 接口换取。

---

## ks.getUserInfo — 获取用户信息

### 概述

获取用户信息。返回用户资料对象、原始数据字符串、签名（用于服务端校验）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 说明 | 必填 |
|------|------|------|------|
| success | `function` | 接口调用成功的回调函数 | 否 |
| fail | `function` | 接口调用失败的回调函数 | 否 |
| complete | `function` | 接口调用完成的回调函数 | 否 |

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| userInfo | `UserInfo` | 用户信息对象，**不包含 openid 等敏感信息** |
| rawData | `string` | 不包含敏感信息的原始数据字符串，用于计算签名 |
| signature | `string` | `sha1(rawData + sessionkey)` 得到的字符串，用于校验用户信息，详见数据签名校验 |

**UserInfo 数据结构：**

| 属性 | 类型 | 说明 |
|------|------|------|
| nickName | `string` | 昵称 |
| avatarUrl | `string` | 头像 URL |
| gender | `string` | 性别，`M` 男，`F` 女 |
| userCity | `string` | 城市 |
| age | `number` | 年龄 |
| adult | `string` | 是否成年 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 错误码 |
| msg | `string` | 错误描述 |

### 标准调用示例

```ts
// 1) 基础用法：直接调用（需已授权 scope.userInfo）
ks.getUserInfo({
  success(result) {
    console.log('用户信息:', JSON.stringify(result));
    const userInfo = result.userInfo;
    console.log('昵称:', userInfo.nickName);
    console.log('头像:', userInfo.avatarUrl);
    console.log('性别:', userInfo.gender);  // 'M' 男 / 'F' 女
    console.log('城市:', userInfo.userCity);
    console.log('年龄:', userInfo.age);
    console.log('是否成年:', userInfo.adult);
    // rawData + signature 用于服务端校验
    verifyUserInfoOnServer(result.rawData, result.signature);
  },
  fail(error) {
    console.log('获取用户信息失败:', JSON.stringify(error));
    if (error.code === xxx) {
      // 未授权，引导用户授权
      requestUserInfoAuth();
    }
  },
  complete() {
    console.log('获取用户信息完成');
  },
});
```

```ts
// 2) Promise 化封装
function getUserInfo() {
  return new Promise((resolve, reject) => {
    ks.getUserInfo({
      success: resolve,
      fail: reject,
    });
  });
}

// 3) 组合调用：先检查授权，未授权则申请，再获取用户信息
async function fetchUserInfoWithAuth() {
  try {
    // 先检查是否已授权
    const setting = await getSetting();
    if (!setting.authSetting['scope.userInfo']) {
      // 未授权，申请授权
      await authorize('scope.userInfo');
    }
    // 已授权，获取用户信息
    const result = await getUserInfo();
    return result.userInfo;
  } catch (err) {
    console.error('获取用户信息失败:', err);
    throw err;
  }
}

// 4) 上传用户信息到服务器校验（防伪造）
async function syncUserInfoToServer() {
  const result = await getUserInfo();
  await KwaiNetwork.request({
    url: 'https://api.example.com/user/sync',
    method: 'POST',
    data: {
      rawData: result.rawData,
      signature: result.signature,
      userInfo: result.userInfo,
    },
  });
  // 服务器用 session_key 校验 signature 确保数据未被篡改
}
```

### 常见误用 & 注意事项

- ⚠️ **必须先授权**：调用前需 `ks.authorize({ scope: 'scope.userInfo' })`，`scope.userInfo` 授权还需先 `ks.login`
- ⚠️ **不含 openid**：`userInfo` 不含 `openid` 等敏感信息，需服务端用 `code` 换取
- ⚠ **签名校验**：`rawData` + `signature` 用于服务端校验数据完整性，**务必在服务端用 `session_key` 重新计算签名比对**，避免客户端伪造
- ⚠ **不要缓存敏感信息**：`userInfo` 可缓存到本地减少调用，但每次启动建议重新拉取（昵称/头像会变）
- ⚠ **gender 是字符串**：`'M'` 男 / `'F'` 女，不是数字枚举
- ⚠ **age 可能不准**：依赖用户在快手的资料，部分用户未填写可能为 0 或 null
- ⚠ **adult 是字符串**：不是 boolean，注意类型转换

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **展示用户资料**：应用内显示用户昵称、头像 → `ks.getUserInfo` 获取后渲染
- **头像上传前预览**：用户修改头像时先展示当前头像 → `ks.getUserInfo` 获取 `avatarUrl`
- **未成年防沉迷**：根据 `adult` / `age` 字段判断是否成年，实施防沉迷限制
- **地区化内容**：根据 `userCity` 推送本地化活动、排行榜
- **服务端同步**：首次登录/定期同步用户信息到服务器，用 `signature` 校验数据完整性

推荐：在 `gameplay/kwai-open.js` 中封装：
- `getUserInfo()` Promise 化，自动处理未授权场景
- `fetchUserInfoWithAuth()` 组合封装，自动 `getSetting` + `authorize` + `getUserInfo`
- 缓存 `userInfo` 到 `KwaiStorage`，启动时读取，按需刷新
- 配合 `KwaiNetwork` 上传 `rawData` + `signature` 到服务器校验


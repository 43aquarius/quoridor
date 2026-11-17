# 转发分享模块

## 文件

`kwaiOpenApi/kwai-repost.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-repost.js');
```

## 调用方式

```js
KwaiRepost.shareAppMessage({
  templateId: 'xxx',
  query:      { from: 'share', level: 5 },  // 也可传字符串
  onSuccess:  function () { console.log('分享成功'); },
  onCancel:   function () { console.log('用户取消'); },
  onFail:     function (err) { console.warn(err.errMsg); },
});
```

系统菜单「转发」（右上角「...」）由 `KwaiRepost.registerSystemShare()` 注册，使用最近一次 `shareAppMessage()` 或自定义文案，详见下方 `ks.onShareAppMessage` 一节。

## 注意事项

- `templateId` 可选，默认留空；留空时使用平台默认分享文案。填写时需使用快手平台后台配置的分享模板 ID
- `query` 传 object 时自动拼为 query string（`encodeURIComponent`）

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.shareAppMessage` / `ks.onShareAppMessage` → 本文档

---

## 底层 API 参考

## 概述

`ks.shareAppMessage` 主动拉起转发面板，让用户选择通讯录中的好友或群进行转发。**与系统菜单转发（`ks.onShareAppMessage`）不同**：本接口由应用内按钮主动触发，弹出快手原生转发选择界面；后者是注册全局回调，当用户通过右上角「...」菜单转发时由系统调用。

转发文案由「分享模板」决定：调用时可传 `templateId` 指定后台配置的模板，不传则使用默认分享文案。转发消息携带的 `query` 参数，用户打开该消息进入应用后，可通过 `ks.getLaunchOptionsSync()` 或 `ks.onShow()` 读取启动参数，用于还原运行状态（如目标关卡、分享者积分等）。

> 💡 **与系统菜单转发的差异**：本接口（主动转发）只接受 `templateId` + `query`，**不接受 `title` / `imageUrl`**——文案与封面图都在「分享模板」中配置。如果需要自定义 `title` / `imageUrl`，请改用 `ks.onShareAppMessage` 注册系统菜单转发回调。

---

## ks.shareAppMessage — 主动拉起转发

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| templateId | `string` | `''`（留空） | 否 | 可选分享模板 ID；留空或不传时走默认分享文案。填写时使用快手开发者后台「分享模板」中预先配置的 ID（模板含标题、封面图、文案）|
| query | `string` | - | 否 | 查询字符串，从这条转发消息进入后，可通过 `ks.getLaunchOptionsSync()` 或 `ks.onShow()` 获取启动参数中的 `query`。**必须是 `key1=val1&key2=val2` 的格式** |
| success | `function` | - | 否 | 分享成功的回调函数 |
| fail | `function` | - | 否 | 分享失败的回调函数 |
| complete | `function` | - | 否 | 分享结束的回调函数（成功、失败都会执行）|

### 标准调用示例

```ts
// 1) 基础转发：使用默认分享文案
ks.shareAppMessage({
  query: 'from=share&scene=invite',
  success() {
    console.log('转发成功');
    KwaiEvent.emit('share:success');
  },
  fail(err) {
    console.warn('转发失败或用户取消:', err.errMsg);
    KwaiEvent.emit('share:fail', err);
  },
});

// 2) 使用分享模板（在快手开发者后台预先配置 templateId）
ks.shareAppMessage({
  templateId: 'YOUR_TEMPLATE_ID',
  query: 'from=share&level=5&score=1200',
  success() {
    console.log('转发成功');
  },
  fail(err) {
    console.warn('转发失败:', err.errMsg);
  },
});

// 3) 在玩家点击「邀请好友」按钮时调用
function onTapInviteBtn() {
  const currentLevel = getCurrentLevel();
  const currentScore = getScore();
  ks.shareAppMessage({
    templateId: 'invite_challenge_template',
    query: `from=share&type=challenge&level=${currentLevel}&score=${currentScore}`,
    success() {
      // 上报分享成功埋点
      reportEvent('share_invite_success', { level: currentLevel });
    },
    fail(err) {
      // 用户取消分享，不报错
      console.log('用户取消分享');
    },
  });
}
```

### 读取转发携带的 query 参数

用户通过这条转发消息进入应用后，可通过 `ks.getLaunchOptionsSync()`（冷启动）或 `ks.onShow`（热启动）获取 `query`：

```ts
// 冷启动时读取
const launchOptions = ks.getLaunchOptionsSync();
if (launchOptions.query && launchOptions.query.from === 'share') {
  const level = parseInt(launchOptions.query.level || '1', 10);
  const score = parseInt(launchOptions.query.score || '0', 10);
  // 进入挑战模式，目标分数为分享者的分数
  enterChallengeMode(level, score);
}

// 热启动时读取（从后台被转发消息唤起）
ks.onShow((res) => {
  if (res.query && res.query.from === 'share') {
    refreshChallengeTarget(res.query);
  }
});
```

### 常见误用 & 注意事项

- ⚠️ **本接口不接受 `title` / `imageUrl`**：转发文案与封面图都在「分享模板」中配置（在快手开发者后台预先配置 `templateId`）；如需自定义 `title` / `imageUrl`，请改用 `ks.onShareAppMessage` 注册系统菜单转发回调
- ⚠️ `query` **必须是 `key1=val1&key2=val2` 的格式**，不要传 JSON 字符串；值需要 `encodeURIComponent` 处理特殊字符
- ⚠️ `templateId` 必须是后台已配置的模板 ID，未配置会被忽略走默认文案
- ⚠️ `fail` 回调在用户**取消分享**时也会触发，**不要把分享失败做关键业务逻辑**（如必看广告才能复活）
- ⚠️ `shareAppMessage` 必须由**用户点击行为触发**（按钮点击回调内调用），不能自动调用，否则可能被系统拦截
- ⚠️ 同一玩家短时间内频繁调用 `shareAppMessage` 可能被系统限流，建议加防抖（至少 1s 间隔）
- ⚠️ 与 `ks.onShareAppMessage` 的区别：
  - `ks.shareAppMessage`：应用内按钮主动触发，**用 `templateId` + `query`**
  - `ks.onShareAppMessage`：注册全局回调，系统菜单转发时由系统调用，**返回 `{ title, imageUrl, query }`** 自定义内容

### 错误处理

| 失败现象 | 可能原因 | 处理建议 |
|---------|---------|---------|
| `fail` 回调触发，`errMsg` 含 `cancel` | 用户取消分享 | 不报错，正常流程 |
| `fail` 回调触发，`errMsg` 含 `template invalid` | `templateId` 不存在 | 改用默认文案（去掉 `templateId`）或检查后台配置 |
| `fail` 回调触发，`errMsg` 含 `frequent` | 调用过于频繁 | 加防抖，避免短时间内重复调用 |
| 转发消息落地后 `query` 读不到 | `query` 格式错误（如传了 JSON）| 必须用 `key1=val1&key2=val2` 格式 |

---

## ks.onShareAppMessage — 系统转发回调

### 概述

注册全局转发回调，当用户通过系统菜单（右上角「...」）转发当前应用时触发，可自定义转发内容。**与 `ks.shareAppMessage`（主动拉起转发面板）不同**：本接口是注册全局回调，由系统在用户点击系统菜单「转发」时调用，不由玩法代码主动触发。

### 标准调用示例

```ts
ks.onShareAppMessage(() => {
  return {
    title: `快来玩 ${GAME_NAME}，超好玩！`,
    imageUrl: 'https://your-cdn.com/share-cover.jpg',
    query: `from=menu_share`,
  };
});
```

### 错误码

| 场景 | 含义 | 处理建议 |
|------|------|---------|
| `imageUrl` 非 CDN 地址 | 封面图加载失败，显示默认图 | 必须使用 HTTPS CDN 地址 |
| 未注册 `onShareAppMessage` | 系统菜单无转发选项 | 根据需要决定是否注册 |

### 常见误用 & 注意事项

- ⚠️ `imageUrl` **必须是 CDN HTTPS 地址**，使用本地路径或 HTTP 地址会导致封面图加载失败
- ⚠️ `query` 格式为 `key=value&key2=value2`，不要传 JSON 字符串
- ⚠️ `onShareAppMessage` 注册后全局有效，不要重复注册（会覆盖）
- ⚠️ `shareAppMessage` 不需要用户额外授权，但必须由用户点击行为触发

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **项目提供「邀请好友」「挑战好友」「分享记录」按钮**：用户点击按钮 → 调用 `ks.shareAppMessage` 主动拉起转发
- **过关后引导分享**：关卡胜利后弹出「邀请好友挑战」选项 → 调用本接口
- **冷启动/热启动还原状态**：在 `ks.getLaunchOptionsSync` / `ks.onShow` 中读取 `query`，进入挑战模式或还原进度
- **分享成功埋点**：`success` 回调里上报分享成功事件，用于运营数据分析

推荐在 `kwaiOpenApi/kwai-repost.js` 中封装：
- 统一拼接 `query` 字符串（避免手写 `key1=val1&...` 出错）
- 统一处理 `success` / `fail` 回调，避免 `fail` 走关键业务逻辑
- 防抖：同一玩家 1s 内多次点击只触发一次
- 与 `ks.getLaunchOptionsSync` / `ks.onShow` 配合读取 `query`，统一还原运行状态

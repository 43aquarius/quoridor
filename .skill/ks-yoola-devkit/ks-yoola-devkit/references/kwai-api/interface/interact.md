# 原生交互 UI 模块

## 封装层

文件：`kwaiOpenApi/kwai-ui.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-ui.js');
```

```js
KwaiUI.showToast({ title: '保存成功', icon: 'success' });
KwaiUI.hideToast();
KwaiUI.showModal({ title: '提示', content: '确认退出？', onConfirm: function () {}, onCancel: function () {} });
KwaiUI.showLoading({ title: '加载中' });
KwaiUI.hideLoading();
KwaiUI.showActionSheet({ itemList: ['分享', '重新开始'], onSelect: function (index) {} });
```

> `showToast` 与 `showLoading` 同时只能显示一个；`showLoading` 必须与 `hideLoading` 配对。

---

## 底层 API 参考

## 概述

提供应用内的系统级提示与对话框：消息提示框（Toast）、模态对话框（Modal）、加载提示框（Loading）、操作菜单（ActionSheet）。这些是快手容器原生 UI 组件，**不需要自己绘制**，调用即弹。适用于不需要自定义样式的简单提示场景（如登录失败提示、退出确认、加载中、分享菜单等）。

> ⚠️ `ks.showLoading` 和 `ks.showToast` **同时只能显示一个**，后调用的会覆盖先调用的；`ks.showLoading` 必须与 `ks.hideLoading` 配对使用。

---

## ks.showToast — 显示消息提示框

### 概述

显示消息提示框，自动消失。适用于操作反馈（成功/失败/警告）、轻量级提示。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| title | `string` | - | 是 | 提示的内容 |
| icon | `string` | `'success'` | 否 | 图标，合法值见下表 |
| image | `string` | - | 否 | 自定义图标的本地路径，**image 的优先级高于 icon** |
| duration | `number` | `1500` | 否 | 提示的延迟时间（毫秒）|
| mask | `boolean` | `false` | 否 | 是否显示透明蒙层，防止触摸穿透 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**object.icon 合法值：**

| 值 | 说明 |
|----|------|
| `success` | 显示成功图标，此时 title 文本最多显示 7 个汉字长度 |
| `error` | 显示失败图标，此时 title 文本最多显示 7 个汉字长度 |
| `loading` | 显示加载图标，此时 title 文本最多显示 7 个汉字长度 |
| `none` | 不显示图标，此时 title 文本最多可显示两行 |

### 标准调用示例

```ts
// 1) 成功提示
ks.showToast({
  title: '成功',
  icon: 'success',
  duration: 2000,
});

// 2) 失败提示
ks.showToast({
  title: '登录失败',
  icon: 'error',
  duration: 2000,
});

// 3) 纯文字提示（多行）
ks.showToast({
  title: '这是一段较长的提示文字，可以显示两行',
  icon: 'none',
  duration: 2500,
});

// 4) 加载中（与 showLoading 不同，Toast 会自动消失）
ks.showToast({
  title: '加载中...',
  icon: 'loading',
  duration: 3000,
  mask: true,  // 防止触摸穿透
});

// 5) 自定义图标
ks.showToast({
  title: '获得道具',
  image: 'res/Icon/reward.png',  // 本地路径，优先级高于 icon
  duration: 2000,
});
```

### 常见误用 & 注意事项

- ⚠️ `ks.showLoading` 和 `ks.showToast` **同时只能显示一个**：先调 showLoading 再调 showToast，Toast 会覆盖 Loading；反之亦然
- ⚠️ `icon: 'success' | 'error' | 'loading'` 时 title 最多 7 个汉字，需长文本用 `icon: 'none'`（最多两行）
- ⚠️ `image` 优先级高于 `icon`，设置 `image` 后 `icon` 失效；`image` 必须是**本地路径**，不能是网络 URL
- ⚠️ `duration` 是自动关闭时间，**不要**手动调 `ks.hideToast()` 关闭（`hideToast` 是给需要立即关闭的场景留的）
- ⚠️ `mask: true` 会阻止用户操作当前画面，仅在加载/关键操作时使用，避免不必要地阻塞交互

---

## ks.showModal — 显示模态对话框

### 概述

显示模态对话框，带「确定」「取消」按钮。适用于需要用户确认的场合（退出确认、危险操作确认、提示重要信息等）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| title | `string` | - | 是 | 提示的标题 |
| content | `string` | - | 否 | 提示的内容 |
| showCancel | `boolean` | `true` | 否 | 是否显示取消按钮 |
| cancelText | `string` | `'取消'` | 否 | 取消按钮文字，**最多 4 个字符** |
| cancelColor | `string` | `'#000000'` | 否 | 取消按钮文字颜色，16 进制格式 |
| confirmText | `string` | `'确定'` | 否 | 确认按钮文字，**最多 4 个字符** |
| confirmColor | `string` | `'#576B95'` | 否 | 确认按钮文字颜色，16 进制格式 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**success 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| content | `string` | `editable` 为 `true` 时，用户输入的文本（注：当前运行环境未实现 editable）|
| confirm | `boolean` | `true` 表示用户点击了确定按钮 |
| cancel | `boolean` | `true` 表示用户点击了取消（用于 Android 区分点击蒙层关闭还是点击取消按钮关闭）|

### 标准调用示例

```ts
// 1) 基础确认对话框
ks.showModal({
  title: '提示',
  content: '这是一个模态弹窗',
  success(res) {
    if (res.confirm) {
      console.log('用户点击确定');
    } else if (res.cancel) {
      console.log('用户点击取消');
    }
  },
});

// 2) 退出确认（自定义按钮文字）
function showExitConfirm() {
  ks.showModal({
    title: '退出应用',
    content: '确定要退出当前应用吗？未保存的进度将丢失。',
    confirmText: '退出',
    cancelText: '继续',
    confirmColor: '#E64340',  // 红色突出危险操作
    success(res) {
      if (res.confirm) {
        // 用户确认退出，做存档保存 + 上报埋点再退出
        saveArchive();
        reportEvent('game_exit');
        ks.exitMiniProgram();
      }
    },
  });
}

// 3) 单按钮提示（隐藏取消）
ks.showModal({
  title: '提示',
  content: '版本过低，请升级快手后体验完整功能。',
  showCancel: false,
  confirmText: '我知道了',
  success(res) {
    if (res.confirm) {
      // 用户点击「我知道了」
    }
  },
});
```

### 常见误用 & 注意事项

- ⚠️ `cancelText` / `confirmText` **最多 4 个字符**，超出会被截断或显示不全
- ⚠️ `cancelColor` / `confirmColor` 必须是 **16 进制格式**（如 `'#E64340'`），不支持 `rgba()` / `red` 等其他格式
- ⚠️ `res.cancel` 在 iOS 点击蒙层关闭时也会为 `true`，**不能区分**「点击取消按钮」和「点击蒙层」；如需严格区分，避免用 modal 实现业务关键流程
- ⚠️ `showModal` 是**模态**的，会阻塞当前交互直到用户响应，**不要**在主循环中频繁调用
- ⚠️ 同时只能显示一个 `showModal`，再次调用会覆盖前一个的回调

---

## ks.showLoading — 显示加载提示框

### 概述

显示加载提示框。**需要主动调用 `ks.hideLoading` 才能关闭**，不会自动消失。适用于网络请求、资源加载、长时间操作等需要明确开始/结束的等待场景。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| title | `string` | - | 是 | 提示的内容 |
| mask | `boolean` | `false` | 否 | 是否显示透明蒙层，防止触摸穿透 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

### 标准调用示例

```ts
// 1) 基础用法：显示 + 延时关闭
ks.showLoading({
  title: '加载中',
});

setTimeout(function() {
  ks.hideLoading();
}, 2000);

// 2) 配合网络请求：开始显示，成功/失败后关闭
async function fetchGameData() {
  ks.showLoading({
    title: '加载中',
    mask: true,  // 防止用户在加载期间继续操作
  });
  try {
    const data = await request('/api/game/init');
    // 处理数据...
  } catch (err) {
    ks.showToast({ title: '加载失败', icon: 'error' });
  } finally {
    ks.hideLoading();  // 必须配对调用
  }
}

// 3) 资源加载进度
async function preloadAssets() {
  ks.showLoading({ title: '加载资源中', mask: true });
  try {
    await KwaiRender.preloadImages(assets);
  } finally {
    ks.hideLoading();
  }
}
```

### 常见误用 & 注意事项

- ⚠️ **必须**与 `ks.hideLoading` 配对使用，否则 Loading 框会一直显示，玩家被卡死
- ⚠️ `ks.showLoading` 和 `ks.showToast` **同时只能显示一个**：先调 Loading 再调 Toast，Loading 会被关掉；反之亦然
- ⚠️ Loading 不会自动消失，**不要忘记**在 `finally` 块里调 `hideLoading`，否则异常路径会让 Loading 卡死
- ⚠️ `mask: true` 会阻止用户操作当前画面，**仅在确实需要阻塞交互时**使用；纯展示性加载建议 `mask: false`
- ⚠️ 不要在 `showLoading` 后立即 `showToast`，会冲突；如需先 Loading 再 Toast，先 `hideLoading` 再 `showToast`

---

## ks.showActionSheet — 显示操作菜单

### 概述

显示底部操作菜单，从下往上弹出多个选项按钮。适用于让玩家在多个动作中选择（如分享到不同平台、选择操作模式等）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| alertText | `string` | - | 否 | 警示文案（菜单顶部的提示文字）|
| itemList | `Array<string>` | - | 是 | 按钮文字数组，**数组长度最大为 6** |
| itemColor | `string` | `'#000000'` | 否 | 按钮文字颜色，16 进制格式 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**success 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| tapIndex | `number` | 用户点击的按钮序号，从上到下顺序，从 0 开始 |

### 标准调用示例

```ts
// 1) 基础用法：选择分享渠道
ks.showActionSheet({
  alertText: '选择分享到',
  itemList: ['微信好友', 'QQ 好友', '复制链接'],
  success(res) {
    console.log('选中：', res.tapIndex);
    switch (res.tapIndex) {
      case 0: shareToWechat(); break;
      case 1: shareToQQ(); break;
      case 2: copyLink(); break;
    }
  },
  fail(res) {
    console.log(res.errMsg);  // 用户取消时 errMsg = 'fail cancel'
  },
});

// 2) 道具使用菜单
function showItemMenu(itemId) {
  ks.showActionSheet({
    itemList: ['使用', '合成', '出售', '详情'],
    success(res) {
      switch (res.tapIndex) {
        case 0: useItem(itemId); break;
        case 1: composeItem(itemId); break;
        case 2: sellItem(itemId); break;
        case 3: showItemDetail(itemId); break;
      }
    },
  });
}

// 3) 危险操作：用红色突出最后一项
ks.showActionSheet({
  alertText: '设置',
  itemList: ['修改昵称', '清除存档'],
  itemColor: '#000000',  // 默认黑色
  success(res) {
    if (res.tapIndex === 1) {
      // 清除存档前再做一次确认
      ks.showModal({
        title: '警告',
        content: '确认清除所有存档？此操作不可恢复！',
        confirmText: '清除',
        confirmColor: '#E64340',
        success(r) {
          if (r.confirm) clearAllStorage();
        },
      });
    }
  },
});
```

### 常见误用 & 注意事项

- ⚠️ `itemList` **数组长度最大为 6**，超出会被截断
- ⚠️ Android 6.7.2 以下版本，点击取消或蒙层会回调 `fail`，`errMsg` 为 `"fail cancel"`；Android 6.7.2+ 和 iOS 点击蒙层不会关闭弹窗，**避免在「取消」分支中实现业务逻辑**
- ⚠️ `itemColor` 是 16 进制格式（如 `'#E64340'`），所有按钮共用同一颜色，**不能逐个按钮设置不同颜色**
- ⚠️ `tapIndex` 从 0 开始，**必须做边界检查**（`tapIndex >= 0 && tapIndex < itemList.length`），虽然实际不会越界但代码健壮性要求
- ⚠️ `fail` 回调在用户取消时也会触发，**不要把业务失败处理放在 `fail` 里**，避免误触发

---

## ks.hideToast — 隐藏消息提示框

### 概述

隐藏消息提示框。一般不需要手动调用，`showToast` 会按 `duration` 自动关闭；仅在需要立即关闭的场景使用（如加载完成后立即关闭一个长 duration 的 Toast）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

### 标准调用示例

```ts
// 立即关闭一个还在显示中的 Toast
ks.showToast({
  title: '处理中',
  icon: 'loading',
  duration: 5000,  // 设了 5 秒
});

// 1 秒后任务完成，立即关闭
setTimeout(() => {
  ks.hideToast();
}, 1000);
```

### 常见误用 & 注意事项

- ⚠️ 一般情况下不需要手动调 `hideToast`，让 `showToast` 按 `duration` 自动关闭即可
- ⚠️ 调用 `hideToast` 但当前没有 Toast 显示时**不会报错**，但无意义
- ⚠️ 与 `hideLoading` 互不影响，关闭 Toast 不会影响 Loading，反之亦然

---

## ks.hideLoading — 隐藏加载提示框

### 概述

隐藏加载提示框。**必须与 `ks.showLoading` 配对使用**，否则 Loading 不会自动关闭。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

### 标准调用示例

```ts
// 必须配对使用，且放在 finally 块里避免异常路径忘记关闭
async function loadData() {
  ks.showLoading({ title: '加载中', mask: true });
  try {
    const data = await fetchData();
    return data;
  } finally {
    ks.hideLoading();  // 无论成功失败都关闭
  }
}
```

### 常见误用 & 注意事项

- ⚠️ **必须**与 `ks.showLoading` 配对使用，漏调 `hideLoading` 会让 Loading 卡死，玩家被阻塞
- ⚠️ 推荐放在 `try/finally` 块的 `finally` 里，确保异常路径也能关闭
- ⚠️ 调用 `hideLoading` 但当前没有 Loading 显示时**不会报错**，但无意义
- ⚠️ 与 `hideToast` 互不影响，关闭 Loading 不会影响 Toast，反之亦然

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **登录/网络请求失败提示**：调用 `ks.login` / 网络请求失败时 → `ks.showToast({ title, icon: 'error' })`
- **激励广告发放奖励**：看完广告后 → `ks.showToast({ title: '获得 100 金币', icon: 'success' })`
- **退出确认**：用户点击退出按钮 → `ks.showModal` 二次确认
- **加载资源/网络请求**：耗时操作前 → `ks.showLoading`；完成后 → `ks.hideLoading`（配对使用）
- **多选操作菜单**：分享渠道选择、道具使用选择 → `ks.showActionSheet`
- **分享按钮回调**：`ks.onShareAppMessage` 注册前的分享目标选择 → `ks.showActionSheet`

推荐：在 `gameplay/kwai-base.js` 之外新增 `gameplay/kwai-ui.js` 统一封装 UI 调用，对外通过事件总线暴露 `ui:toast` / `ui:modal` / `ui:loading` / `ui:actionSheet` 事件，业务模块按需订阅，避免散落调用 `ks.showToast` 等。


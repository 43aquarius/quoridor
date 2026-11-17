# 键盘模块

## 封装层

文件：`kwaiOpenApi/kwai-device.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-device.js');
```

```js
KwaiDevice.showKeyboard({ defaultValue: '', maxLength: 20 });
KwaiDevice.hideKeyboard();
KwaiDevice.onKeyboardInput(function (res)    { console.log(res.value); });
KwaiDevice.onKeyboardConfirm(function (res)  { console.log(res.value); });
KwaiDevice.onKeyboardComplete(function (res) { console.log(res.value); });
```

---

## 底层 API 参考

## 概述

通过 `ks.showKeyboard` 拉起系统键盘（用于昵称输入、聊天、搜索等），`ks.hideKeyboard` 收起键盘，`ks.updateKeyboard` 更新输入框内容。事件监听：`ks.onKeyboardInput`（输入变化）、`ks.onKeyboardConfirm`（点击 Confirm）、`ks.onKeyboardComplete`（键盘收起），对应有 `off*` 取消监听版本。

> ⚠️ **showKeyboard 必填参数多**：`defaultValue` / `maxLength` / `multiple` / `confirmHold` / `confirmType` 都是必填，缺一会失败。

> ⚠️ **无 DOM 输入框**：运行环境不提供 `<input>` / `<textarea>`，必须用 `ks.showKeyboard`。

---

## ks.showKeyboard — 显示键盘

### 概述

显示系统键盘，用于用户输入文本。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| defaultValue | `string` | - | 是 | 键盘输入框显示的默认值 |
| maxLength | `number` | - | 是 | 键盘中文本的最大长度 |
| multiple | `boolean` | - | 是 | 是否为多行输入 |
| confirmHold | `boolean` | - | 是 | 点击完成时键盘是否收起（`false` = 收起，`true` = 不收起）|
| confirmType | `string` | - | 是 | 键盘右下角 confirm 按钮的类型，只影响按钮文本 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**confirmType 合法值：**

| 值 | 说明 |
|----|------|
| `done` | 完成 |
| `next` | 下一个 |
| `search` | 搜索 |
| `go` | 前往 |
| `send` | 发送 |

### 标准调用示例

```ts
// 单行输入昵称
ks.showKeyboard({
  defaultValue: 'player1',
  maxLength: 20,
  multiple: false,
  confirmHold: false,  // 点击完成时收起键盘
  confirmType: 'done',
  success() {
    console.log('keyboard shown');
  },
  fail(err) {
    console.error('show keyboard failed:', err);
  },
});

// 多行输入聊天消息
ks.showKeyboard({
  defaultValue: '',
  maxLength: 200,
  multiple: true,
  confirmHold: true,  // 点击发送时不收起，允许连续输入
  confirmType: 'send',
});
```

---

## ks.hideKeyboard — 收起键盘

### 概述

收起当前显示的系统键盘。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

### 标准调用示例

```ts
// 用户点击外部区域时收起键盘
function onOutsideTap() {
  ks.hideKeyboard({
    success() {
      console.log('keyboard hidden');
    },
  });
}
```

---

## ks.updateKeyboard — 更新键盘输入框内容

### 概述

更新键盘输入框内容。**只有当键盘处于拉起状态时才会产生效果**。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| value | `string` | - | 是 | 键盘输入框的当前值 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

### 标准调用示例

```ts
// 程序化修改输入框内容（如点击「清空」按钮）
function onClearInput() {
  ks.updateKeyboard({
    value: '',
    success() {
      console.log('input cleared');
    },
  });
}

// 插入表情符号
function onInsertEmoji(emoji) {
  const currentValue = getCurrentInputValue();
  ks.updateKeyboard({
    value: currentValue + emoji,
  });
}
```

---

## ks.onKeyboardInput — 监听键盘输入事件

### 概述

监听键盘输入事件，用户每次按键输入时触发。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 键盘输入事件的回调函数 |

**callback 接收参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| value | `string` | 键盘输入的当前值 |

### 标准调用示例

```ts
ks.onKeyboardInput((res) => {
  console.log('current input:', res.value);
  // 实时更新自绘输入框显示
  updateInputDisplay(res.value);
  // 字数统计
  updateCharCount(res.value.length, maxLength);
});
```

---

## ks.onKeyboardConfirm — 监听点击 Confirm 按钮

### 概述

监听用户点击键盘右下角 Confirm 按钮时的事件。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 用户点击 Confirm 按钮时的事件回调 |

**callback 接收参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| value | `string` | 键盘输入的当前值 |

### 标准调用示例

```ts
ks.onKeyboardConfirm((res) => {
  console.log('confirmed, value:', res.value);
  // 提交昵称
  submitNickname(res.value);
  // confirmHold: false 时键盘会自动收起；confirmHold: true 时需手动 hideKeyboard
});
```

---

## ks.onKeyboardComplete — 监听键盘收起事件

### 概述

监听键盘收起的事件。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 键盘收起事件的回调 |

**callback 接收参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| value | `string` | 键盘输入的当前值 |

### 标准调用示例

```ts
ks.onKeyboardComplete((res) => {
  console.log('keyboard hidden, final value:', res.value);
  // 键盘收起后做最终处理
  onInputFinished(res.value);
  // 取消所有监听，避免内存泄漏
  ks.offKeyboardInput(inputHandler);
  ks.offKeyboardConfirm(confirmHandler);
  ks.offKeyboardComplete(completeHandler);
});
```

---

## ks.offKeyboardInput / offKeyboardConfirm / offKeyboardComplete — 取消监听

### 概述

分别取消监听键盘输入事件、点击 Confirm 事件、键盘收起事件。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 否 | 取消监听的事件回调，不传时取消所有监听 |

### 标准调用示例

```ts
const inputHandler = (res) => { console.log('input:', res.value); };
const confirmHandler = (res) => { submitForm(res.value); };
const completeHandler = (res) => { cleanup(); };

// 注册
ks.onKeyboardInput(inputHandler);
ks.onKeyboardConfirm(confirmHandler);
ks.onKeyboardComplete(completeHandler);

// 取消（需传入同一函数引用）
ks.offKeyboardInput(inputHandler);
ks.offKeyboardConfirm(confirmHandler);
ks.offKeyboardComplete(completeHandler);

// 不传参数取消所有
// ks.offKeyboardInput();
```

---

## 常见误用 & 注意事项

- ⚠️ **showKeyboard 5 个必填参数**：`defaultValue` / `maxLength` / `multiple` / `confirmHold` / `confirmType` 缺一不可
- ⚠️ **confirmHold 含义**：`false` = 点击 confirm 收起键盘（触发 `onKeyboardComplete`）；`true` = 不收起，适合聊天连续输入
- ⚠️ **confirmType 只影响文本**：不影响功能，只是右下角按钮显示 `完成` / `下一个` / `搜索` / `前往` / `发送`
- ⚠️ **updateKeyboard 仅键盘拉起时生效**：键盘未显示时调 `updateKeyboard` 无效果
- ⚠️ **必须由用户点击触发 showKeyboard**：不能自动调用，部分容器会拒绝
- ⚠️ **off 必须传同一函数引用**：匿名函数无法取消
- ⚠️ **键盘收起后清理监听**：`onKeyboardComplete` 触发后 `off` 所有监听，避免内存泄漏
- ⚠ **多个输入框场景**：每次 `showKeyboard` 前先 `off` 旧监听，再 `on` 新监听


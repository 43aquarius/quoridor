# 振动模块

## 封装层

文件：`kwaiOpenApi/kwai-device.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-device.js');
```

```js
KwaiDevice.vibrateShort('medium'); // 'heavy' | 'medium' | 'light'
KwaiDevice.vibrateLong();
```

---

## 底层 API 参考

## 概述

通过 `ks.vibrateShort` 触发短振动（15ms，分 heavy/medium/light 三种强度），`ks.vibrateLong` 触发长振动（400ms）。用于按钮点击反馈、受击/碰撞反馈、特殊事件强调。

> ⚠️ **vibrateShort 仅 iPhone 7+ 及 Android 生效**：iPhone 6 及以下不生效，不报错但无振动。

> ⚠️ **vibrateShort 必填 type**：`heavy` / `medium` / `light`，缺 type 会 `fail`。

> ⚠️ 频繁振动影响体验，建议仅在关键事件触发。

---

## ks.vibrateShort — 短振动

### 概述

使手机发生较短时间的振动（15 ms）。仅在 iPhone 7 / 7 Plus 以上及 Android 机型生效。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| type | `string` | - | 是 | 震动强度类型，有效值为 `heavy` / `medium` / `light` |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| errMsg | `string` | 错误信息 |

### 标准调用示例

```ts
// 按钮点击：light 轻触感
ks.vibrateShort({ type: 'light' });

// 受击：medium 中等强度
function onPlayerHit() {
  ks.vibrateShort({ type: 'medium' });
}

// 关键事件（Boss 击杀、成就解锁）：heavy 重击
function onBossDefeated() {
  ks.vibrateShort({ type: 'heavy' });
}
```

---

## ks.vibrateLong — 长振动

### 概述

使手机发生较长时间的振动（400 ms）。

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

### 标准调用示例

```ts
// 玩家死亡
function onPlayerDeath() {
  ks.vibrateLong();
}

// 关卡失败
function onLevelFail() {
  ks.vibrateLong({
    success() {
      console.log('long vibration triggered');
    },
  });
}
```

---

## 常见误用 & 注意事项

- ⚠️ **vibrateShort 必填 type**：缺 `type` 会 `fail`
- ⚠️ **vibrateShort 机型限制**：iPhone 7+ 及 Android 生效，iPhone 6 及以下不报错但无振动
- ⚠️ **vibrateLong 无 type 参数**：固定 400ms，不能调强度
- ⚠️ **避免频繁振动**：连续振动会非常扰人，建议节流（如 200ms 内只振一次）
- ⚠️ **尊重用户设置**：部分容器允许用户关闭振动，`fail` 时不报错
- ⚠ **振动是异步的**：`success` 触发不代表振动结束，不要在 `success` 里做依赖振动时序的逻辑


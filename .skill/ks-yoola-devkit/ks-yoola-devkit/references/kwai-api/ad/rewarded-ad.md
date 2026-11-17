# 激励广告模块

## 封装层

文件：`kwaiOpenApi/kwai-ad.js`（脚手架阶段已复制，无需手动操作）

广告位 ID 自动从 `window.KwaiAdConfig` 读取（脚手架已写入 `kwaiStandard/core/kwai-ad-config.js`）。

```js
require('./kwaiOpenApi/kwai-ad.js');
```

```js
// 激励广告（复活 / 双倍奖励）
KwaiAd.showRewarded(
  function () { /* 用户看完 → 发放奖励 */ },
  function () { /* 用户中途关闭 → 不发放 */ }
);
```

---

## 底层 API 参考

## 概述

通过展示激励视频广告发放应用内奖励（继续机会、道具、积分等）。用户**必须看完整个广告**才能获得奖励，可通过 `res.isEnded` 判断。

## 最低容器版本

`ks-minigame >= 1.2.0`

---

## ks.createRewardedVideoAd — 激励视频广告

### 参数 Schema

**创建广告实例：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| adUnitId | `string` | 是 | 广告位 ID，在快手开发者后台申请 |

**onClose 回调参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| isEnded | `boolean` | `true` = 看完整个广告，可发奖励；`false` = 中途关闭，不发奖励 |

### 标准调用示例

```ts
const rewardedAd = ks.createRewardedVideoAd({ adUnitId: 'YOUR_AD_UNIT_ID' });

// 监听关闭事件（用户看完或中途退出）
rewardedAd.onClose((res) => {
  if (res.isEnded) {
    // 玩家看完广告，发放奖励
    grantReward();
  } else {
    // 玩家中途关闭，不发放奖励
    showToast('观看完整广告才能获得奖励');
  }
});

// 监听错误
rewardedAd.onError((err) => {
  console.error('激励广告错误', err.errMsg);
});

// 展示广告（在玩家点击"看广告复活"按钮时调用）
function showRewardedAd() {
  rewardedAd.show();
}
```

### 错误码

| errMsg 关键词 | 含义 | 处理建议 |
|--------------|------|---------|
| `adUnitId is invalid` | 广告位 ID 无效 | 检查后台配置 |
| `no fill` | 暂无广告填充 | 稍后重试，不影响当前流程 |
| `network error` | 网络异常 | 提示用户检查网络 |

### 常见误用 & 注意事项

- ⚠️ **`isEnded=false` 时绝对不能发奖励**，这是最常见的作弊漏洞
- ⚠️ 广告实例应复用（全局创建一次），不要每次展示都重新 `createRewardedVideoAd`
- ⚠️ 快手容器**不支持 `load()` 方法**，直接调用 `show()` 即可，平台自动处理加载

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：
- 需要提供「看广告继续体验」「看广告获得道具」「看广告增加积分」等功能


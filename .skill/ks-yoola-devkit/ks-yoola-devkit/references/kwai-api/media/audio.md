# 音频模块

## 封装层

文件：`kwaiOpenApi/kwai-media.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-media.js');
```

```js
// BGM
KwaiMedia.Audio.playBgm('audio/bgm_menu.mp3');
KwaiMedia.Audio.fadeBgm(0.6, 800);
KwaiMedia.Audio.pauseBgm();
KwaiMedia.Audio.resumeBgm();
KwaiMedia.Audio.stopBgm();
// 音效（最多 10 个实例，自动复用）
KwaiMedia.Audio.playSfx('audio/click.mp3');
// 音量控制
KwaiMedia.Audio.setBgmEnabled(false);
KwaiMedia.Audio.setBgmVolume(0.6);
KwaiMedia.Audio.setSfxVolume(1.0);
```

> ⚠️ 自行创建的 `ks.createInnerAudioContext()` 用完后必须 `destroy()`；退出应用时调用 `KwaiMedia.destroyAll()`。

---

## 底层 API 参考

## 概述

通过 `ks.createInnerAudioContext` 创建 `InnerAudioContext` 音频上下文实例，用于播放 BGM、音效、语音等。支持播放控制（`play` / `pause` / `stop` / `seek`）、事件监听（`onPlay` / `onPause` / `onEnded` / `onError` / `onTimeUpdate` 等）和实例销毁（`destroy`）。

> ⚠️ **支持格式**：iOS 和 Android 均支持 `wav` 和 `mp3`，**不支持 `ogg` / `aac` / `flac`** 等；建议统一用 `mp3`（兼容性最好、体积小）。

> ⚠️ 运行环境无 `Audio` / `HTMLAudioElement` 构造函数，必须用 `ks.createInnerAudioContext`。

> ⚠️ **音频实例占用底层音频通道，不用的实例（无论是 BGM 还是音效）必须及时 `destroy()` 释放**，否则通道耗尽会阻塞后续播放。`KwaiMedia.Audio` 内部已管理 BGM 单例（`playBgm` 切换 src 复用同一实例）和音效池（池满自动淘汰），正常使用无需手动销毁；但如果你自行创建了 `ks.createInnerAudioContext()`，用完后必须 `destroy()`。

---

## ks.createInnerAudioContext — 创建音频上下文

### 概述

创建内部 audio 上下文 `InnerAudioContext` 对象。

### 参数

无参数。

### 返回值

| 类型 | 说明 |
|------|------|
| `InnerAudioContext` | 音频上下文实例，可设置 `src`、调用 `play` 等方法 |

### 标准调用示例

```ts
const audio = ks.createInnerAudioContext();
audio.autoplay = true;
audio.src = 'audio/bgm.mp3';
audio.onPlay(() => {
  console.log('开始播放');
});
audio.onError((res) => {
  console.log('播放错误', res.errMsg, res.errCode);
});
```

---

## InnerAudioContext 对象

`ks.createInnerAudioContext` 返回的实例，包含可读写属性、播放控制方法和事件监听方法。

### 属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| src | `string` | - | 音频资源的地址，用于直接播放 |
| startTime | `number` | `0` | 开始播放的位置（单位：秒）|
| autoplay | `boolean` | `false` | 是否自动开始播放 |
| loop | `boolean` | `false` | 是否循环播放 |
| obeyMuteSwitch | `boolean` | `true` | 是否遵循系统静音开关。`false` 时即使用户打开静音开关也能发声 |
| volume | `number` | `1` | 音量，范围 0-1 |
| playbackRate | `number` | `1` | 播放速度，范围 0.5-2.0（Android 需 6+）|
| duration | `number` | - | 当前音频长度（单位：秒），仅在 src 合法时有效（**只读**）|
| currentTime | `number` | - | 当前播放位置（单位：秒），保留小数点后 6 位（**只读**）|
| paused | `boolean` | - | 当前是否暂停或停止状态（**只读**）|
| buffered | `number` | - | 音频缓冲的时间点，仅保证当前播放时间点到此时间点内容已缓冲（**只读**）|

### 方法清单

| 方法 | 说明 |
|------|------|
| `play()` | 播放 |
| `pause()` | 暂停（再播放从暂停处继续）|
| `stop()` | 停止（再播放从头开始）|
| `seek(position)` | 跳转到指定位置 |
| `destroy()` | 销毁当前实例 |
| `onCanplay(cb)` / `offCanplay(cb)` | 监听 / 取消监听「可播放状态」事件（不保证后续流畅播放）|
| `onPlay(cb)` / `offPlay(cb)` | 监听 / 取消监听「播放」事件 |
| `onPause(cb)` / `offPause(cb)` | 监听 / 取消监听「暂停」事件 |
| `onStop(cb)` / `offStop(cb)` | 监听 / 取消监听「停止」事件 |
| `onEnded(cb)` / `offEnded(cb)` | 监听 / 取消监听「自然播放至结束」事件 |
| `onTimeUpdate(cb)` / `offTimeUpdate(cb)` | 监听 / 取消监听「播放进度更新」事件 |
| `onError(cb)` / `offError(cb)` | 监听 / 取消监听「播放错误」事件 |

### 标准调用示例

```ts
// 完整使用示例：BGM 循环播放
const bgm = ks.createInnerAudioContext();
bgm.loop = true;
bgm.volume = 0.6;
bgm.src = 'audio/bgm.mp3';

bgm.onCanplay(() => {
  console.log('BGM can play');
});
bgm.onPlay(() => {
  console.log('BGM started');
});
bgm.onEnded(() => {
  console.log('BGM ended');  // loop=true 时不会触发
});
bgm.onError((res) => {
  console.error('BGM error:', res.errMsg, res.errCode);
});
bgm.onTimeUpdate(() => {
  // 更新进度条
  updateProgress(bgm.currentTime, bgm.duration);
});

// 启动播放
bgm.play();

// 用户切换静音设置时调整音量
function setBgmVolume(v) {
  bgm.volume = v;  // 0 - 1
}

// 切换暂停/播放
function toggleBgm() {
  if (bgm.paused) {
    bgm.play();
  } else {
    bgm.pause();
  }
}

// 销毁（不再使用时）
bgm.destroy();
```

### 支持的音频格式

| 格式 | iOS | Android |
|------|:---:|:-------:|
| `wav` | ✅ | ✅ |
| `mp3` | ✅ | ✅ |

> ❌ 不支持 `ogg` / `aac` / `flac` / `m4a`，建议统一用 `mp3`。

---

## 播放控制方法

### InnerAudioContext.play — 播放

```ts
audio.play();
```

开始播放音频。若之前是 `pause`，从暂停处继续；若是 `stop` 或首次播放，从 `startTime` 或 0 开始。

### InnerAudioContext.pause — 暂停

```ts
audio.pause();
```

暂停播放，触发 `onPause` 回调。再次 `play()` 会从暂停处继续播放。

### InnerAudioContext.stop — 停止

```ts
audio.stop();
```

停止播放，触发 `onStop` 回调。再次 `play()` 会从头开始播放。与 `pause` 的区别：`stop` 重置播放位置到 0，`pause` 保留当前进度。

### InnerAudioContext.seek — 跳转

```ts
audio.seek(30);  // 跳到 30 秒处
```

跳转到指定位置（单位：秒）。跳转后从该位置继续播放（若原本在播放）。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| position | `number` | 是 | 跳转的位置，单位：秒 |

### InnerAudioContext.destroy — 销毁

```ts
audio.destroy();
```

销毁当前实例，释放底层音频资源。**销毁后不能再使用该实例**，需重新 `createInnerAudioContext` 创建。

> ⚠️ 不再使用的音频实例务必 `destroy()`，否则会**持续占用底层音频通道**，可能影响后续音频播放。

---

## 事件监听方法

### InnerAudioContext.onCanplay / offCanplay — 可播放状态

监听音频进入可播放状态（已加载足够数据，可以开始播放）。**不保证后续流畅播放**，可能仍会卡顿。

```ts
const canplayHandler = () => {
  console.log('can play, duration:', audio.duration);
};
audio.onCanplay(canplayHandler);
// 取消监听
audio.offCanplay(canplayHandler);
```

### InnerAudioContext.onPlay / offPlay — 播放事件

监听音频开始播放或从暂停恢复播放。

```ts
audio.onPlay(() => {
  console.log('playing');
});
```

### InnerAudioContext.onPause / offPause — 暂停事件

监听音频被暂停（调用 `pause()` 触发）。

```ts
audio.onPause(() => {
  console.log('paused');
});
```

### InnerAudioContext.onStop / offStop — 停止事件

监听音频被停止（调用 `stop()` 触发）。

```ts
audio.onStop(() => {
  console.log('stopped');
});
```

### InnerAudioContext.onEnded / offEnded — 播放结束

监听音频**自然播放至结束**（非 `stop()` 触发）。`loop: true` 时不会触发。

```ts
audio.onEnded(() => {
  console.log('playback ended');
  // 适合自动切换下一首
});
```

### InnerAudioContext.onTimeUpdate / offTimeUpdate — 进度更新

监听播放进度更新事件，触发频率较高（约每 250ms 一次）。用于更新进度条、计算剩余时间。

```ts
audio.onTimeUpdate(() => {
  // 注意：在回调内读 audio.currentTime / audio.duration
  const progress = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
  updateProgressBar(progress);
});
```

> ⚠️ 回调触发频率高，**禁止做重计算**；建议入队后异步处理。

### InnerAudioContext.onError / offError — 错误事件

监听音频播放错误事件。

**callback 参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| errMsg | `string` | 错误信息 |
| errCode | `number` | 错误码 |

```ts
audio.onError((res) => {
  console.error('audio error:', res.errMsg, res.errCode);
  // 切换到兜底音频或静音
});
```

### 常见误用 & 注意事项（音频全局）

- ⚠️ **必须用 `ks.createInnerAudioContext`** 而非 `new Audio()`，运行环境无 DOM
- ⚠️ 不再使用的实例务必 `destroy()`，否则**持续占用音频通道**，可能阻塞后续播放
- ⚠️ 音频 `src` 必须是**本地路径**或代码包路径，网络音频需先 `ks.downloadFile` 到本地再播放
- ⚠️ 仅支持 `wav` / `mp3`，不支持 `ogg` / `aac` / `flac`，建议统一用 `mp3`
- ⚠️ `obeyMuteSwitch: false` 用于 BGM（即使用户开静音也要播放）；音效通常设 `true`（跟随系统静音）
- ⚠️ `loop: true` 时 `onEnded` 不会触发，不要依赖它做切换
- ⚠️ 同一实例不能同时播放多个 `src`，需要切换 `src` 时直接赋值 `audio.src = newUrl`，会自动停止旧播放
- ⚠️ `onTimeUpdate` 触发频率高，回调里禁止重计算
- ⚠️ 切到后台时容器可能自动暂停音频，回前台时需主动 `play()` 恢复

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **BGM 播放**：主菜单/战斗场景循环播放背景音乐 → `ks.createInnerAudioContext` + `loop: true` + `obeyMuteSwitch: false`
- **音效播放**：点击/消除/受击等短音效 → 复用同一 `InnerAudioContext` 实例（或预创建多个）
- **进度条更新**：音频/语音播放器 → `onTimeUpdate` 更新进度
- **播放完成处理**：教学语音、对话 → `onEnded` 切换下一段
- **静音设置**：用户设置开关 BGM/音效 → 调整 `volume` 或 `obeyMuteSwitch`

推荐：使用 `kwai-media.js`（`KwaiMedia.Audio`）：
- 启动时预创建 BGM 实例 + 多个音效实例（音效池）
- 切到后台时 `pause()` BGM，回前台时 `play()` 恢复
- 用户调整设置时统一调整所有实例的 `volume` / `obeyMuteSwitch`
- 不再使用的实例主动 `destroy()` 释放音频通道


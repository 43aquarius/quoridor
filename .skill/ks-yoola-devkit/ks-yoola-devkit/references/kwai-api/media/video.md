# 视频模块

## 封装层

文件：`kwaiOpenApi/kwai-media.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-media.js');
```

```js
// 开场动画（onEnded / onError 必须 destroy）
KwaiMedia.Video.play('intro', {
  src: 'video/intro.mp4', width: 375, height: 667,
  onEnded: function () { KwaiMedia.Video.destroy('intro'); },
  onError: function () { KwaiMedia.Video.destroy('intro'); },
});
// 背景视频（loop）
KwaiMedia.Video.create('bg', { src: 'video/game_bg.mp4', width: 750, height: 1334, underGameView: true, loop: true });
KwaiMedia.Video.play('bg');
```

> ⚠️ 每个视频实例占用独立通道，用完必须 `destroy()`。资源 CDN 化由平台在上传阶段统一处理，开发者无需手动上传。

---

## 底层 API 参考

## 概述

通过 `ks.createVideo` 创建 `Video` 视频实例，用于播放视频内容（如开场动画、教学视频、过场动画等）。支持播放控制（`play` / `pause` / `stop` / `seek` / `destroy`）和丰富的事件监听（`onCandraw` 首帧 / `onPlay` / `onPause` / `onStop` / `onTimeUpdate` / `onEnded` / `onError` / `onWaiting` / `onProgress`）。

> ⚠️ **视频实例会占用底层视频通道，不用的视频必须及时 `destroy()` 释放**。每个视频实例占用一个独立通道，播放完毕不销毁会导致通道耗尽、后续视频无法播放。`onEnded` / `onError` 回调中必须 `destroy()`，用户主动跳过时必须 `destroy()`。切场景时销毁该场景所有视频，禁止保留不用的实例。

> ⚠️ **创建后参数不可变更**：`Video` 实例的 `src` / `x` / `y` / `width` / `height` / `loop` / `autoplay` / `muted` / `objectFit` / `poster` / `initialTime` / `backgroundColor` / `underGameView` 等属性**仅在创建时设置生效**，已创建并 `play()` 后再修改这些属性**不会生效**。如需变更配置，必须 `destroy()` 旧实例后重新 `ks.createVideo()` 创建新实例。

> ⚠️ **视频置于 canvas 底部需白名单**：默认视频渲染层级在 canvas 之上（视频会盖住 canvas）。若需要在视频画面上叠加交互层，必须先联系**平台支持团队**申请白名单，否则视频始终位于顶层、canvas 交互层无法覆盖。

---

## ks.createVideo — 创建视频实例

### 概述

创建 `Video` 实例，可通过设置 `src` 加载视频并播放。

### 参数

| 参数 | 类型 | 必填 | 说明                                                     |
| ---- | ---- | ---- | -------------------------------------------------------- |
| —    | —    | —    | `ks.createVideo()` 本身无参数。属性在 Video 实例上设置。 |

### Video 属性

`ks.createVideo()` 返回的 Video 实例，可设置以下属性（必须在 `play()` 之前一次性设置，设置顺序：**先绑定事件 → 再设置 src（最后设）**，否则 `onProgress` 等事件可能丢失）：

| 属性              | 类型      | 默认值      | 必填   | 说明                                                                                                                                                                                                                                           |
| ----------------- | --------- | ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`             | `string`  | —           | **是** | 视频资源地址。支持 CDN 链接 / 本地路径。本地路径请使用 `ks.downloadFile` 下载                                                                                                                                                                  |
| `width`           | `number`  | `0`         | **是** | 视频的宽度（px）                                                                                                                                                                                                                               |
| `height`          | `number`  | `0`         | **是** | 视频的高度（px）                                                                                                                                                                                                                               |
| `x`               | `number`  | `0`         | 否     | 视频的左上角横坐标                                                                                                                                                                                                                             |
| `y`               | `number`  | `0`         | 否     | 视频的左上角纵坐标                                                                                                                                                                                                                             |
| `poster`          | `string`  | —           | 否     | 视频的封面图                                                                                                                                                                                                                                   |
| `initialTime`     | `number`  | `0`         | 否     | 视频的初始播放位置，单位：秒                                                                                                                                                                                                                   |
| `objectFit`       | `string`  | `'contain'` | 否     | `'fill'` — 拉伸填满容器，不保证长宽比；`'contain'` — 保持长宽比，保证完整显示，可能留白；`'cover'` — 保持长宽比，保证填满容器，可能被裁剪                                                                                                      |
| `backgroundColor` | `string`  | `'#000000'` | 否     | 视频背景颜色                                                                                                                                                                                                                                   |
| `autoplay`        | `boolean` | `false`     | 否     | 视频是否自动播放                                                                                                                                                                                                                               |
| `loop`            | `boolean` | `false`     | 否     | 视频是否循环播放。`true` 时 `onEnded` 不触发                                                                                                                                                                                                   |
| `muted`           | `boolean` | `false`     | 否     | 视频是否禁音播放                                                                                                                                                                                                                               |
| `underGameView`   | `boolean` | `false`     | 否     | 视频是否显示在 canvas 下方。默认 `false`（视频在 canvas 之上）。配合 `Canvas.getContext('webgl', { alpha: true })` 可使主屏 canvas 透明，并在视频画面上叠加交互层。⚠️ 设为 `true` 前必须先联系**平台支持团队**申请白名单 |

### 返回值

| 类型    | 说明         |
| ------- | ------------ |
| `Video` | 视频实例对象 |

### 标准调用示例

```ts
const video = ks.createVideo();
// 1) 先绑定事件（确保 onProgress 等事件在 src 触发下载前就绪）
video.onProgress((res) => {
	updateBufferBar(res.buffered);
});
// 2) 再设置属性（src 最后设，设 src 触发下载 → onProgress 开始回调）
video.width = 375;
video.height = 667;
video.loop = false;
video.src = 'video/intro.mp4';
// ⚠️ 以上属性必须在 play() 之前一次性设置好，play() 之后再修改不会生效
```

> ⚠️ **参数不可变更**：实例一旦 `play()`，再修改 `src` / `width` / `height` / `x` / `y` / `loop` / `autoplay` / `muted` / `objectFit` / `poster` / `initialTime` / `backgroundColor` / `underGameView` 等属性**不生效**。需切换配置时 `destroy()` 后重新 `ks.createVideo()`。

---

## Video 对象

`ks.createVideo` 返回的实例，包含视频控制方法和事件监听方法。

### 视频控制接口

| 接口                      | 说明                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `Video.play()`            | 视频播放                                                                                           |
| `Video.pause()`           | 暂停视频                                                                                           |
| `Video.stop()`            | 停止视频                                                                                           |
| `Video.seek(number time)` | 跳转到视频指定位置。`time` 为 number 类型，单位：秒；超出视频总时长则视频停止在当前帧，小于 0 无效 |
| `Video.destroy()`         | 销毁视频                                                                                           |

### 视频事件监听接口

| 接口                                    | 说明                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `Video.onCandraw(callback(scale))`      | 监听视频**首帧**事件，回调参数 `scale` 为 video 宽高比（`videoWidth / videoHeight`） |
| `Video.onPlay(callback)`                | 监听播放视频事件                                                                     |
| `Video.onPause(callback)`               | 监听暂停播放视频事件                                                                 |
| `Video.onStop(callback)`                | 监听停止播放视频事件                                                                 |
| `Video.onTimeUpdate(callback(object))`  | 监听视频跳转/播放进度更新事件，回调参数 `{ position, duration }`                     |
| `Video.onEnded(callback)`               | 监听视频自然播放至结束的事件                                                         |
| `Video.onError(callback(errorMessage))` | 监听视频播放错误事件，回调参数为错误信息文本                                         |
| `Video.onWaiting(callback)`             | 监听视频由于需要缓冲下一帧而停止时触发回调                                           |
| `Video.onProgress(callback(object))`    | 视频下载（缓冲）事件监听，回调参数 `{ buffered, duration }`                          |

### 标准调用示例

```ts
// 完整示例：播放开场动画
const introVideo = ks.createVideo();

// 1) 先绑定事件（确保 onProgress 在 src 触发下载前就绪）
introVideo.onProgress((res) => {
	// res = { buffered, duration }
	// buffered 范围 (0, 100]，100 表示缓冲完成
	console.log('buffered:', res.buffered + '%');
	updateBufferBar(res.buffered);
});

// 首帧渲染：知道视频尺寸后调整画布尺寸
introVideo.onCandraw((scale) => {
	console.log('first frame ready, scale:', scale);
	// scale = videoWidth / videoHeight，用于按比例调整渲染区域
	adjustVideoRenderArea(scale);
});

introVideo.onPlay(() => {
	console.log('video started');
});

introVideo.onPause(() => {
	console.log('video paused');
});

introVideo.onStop(() => {
	console.log('video stopped');
});

introVideo.onTimeUpdate((res) => {
	// res = { position, duration }
	console.log('progress:', res.position + 's / ' + res.duration + 's');
	updateProgressBar(res.position / res.duration);
});

introVideo.onEnded(() => {
	console.log('video ended');
	// 开场动画结束后进入主菜单
	enterMainMenu();
	introVideo.destroy(); // 释放视频通道
});

introVideo.onError((errMsg) => {
	console.error('video error:', errMsg);
	// 错误时跳过开场动画，直接进入主菜单
	enterMainMenu();
	introVideo.destroy();
});

introVideo.onWaiting(() => {
	console.log('buffering, show loading');
	showBufferingIndicator();
});

// 2) 再设置属性（src 最后设）
introVideo.width = 375;
introVideo.height = 667;
introVideo.loop = false;
introVideo.src = 'video/intro.mp4';

// 开始播放
introVideo.play();

// 用户跳过开场动画
function onSkipIntro() {
	introVideo.stop();
	introVideo.destroy();
	enterMainMenu();
}
```

---

## 视频控制方法

### Video.play — 播放

```ts
video.play();
```

开始播放视频。若之前是 `pause`，从暂停处继续；若是 `stop` 或首次播放，从 0 开始。

### Video.pause — 暂停

```ts
video.pause();
```

暂停视频，触发 `onPause` 回调。再次 `play()` 从暂停处继续。

### Video.stop — 停止

```ts
video.stop();
```

停止视频，触发 `onStop` 回调。再次 `play()` 从头开始播放。

### Video.seek — 跳转

```ts
video.seek(15); // 跳到 15 秒处
```

跳转到视频指定位置。`time` 超出视频总时长则视频停止在当前帧，小于 0 无效。

### 参数

| 参数 | 类型     | 必填 | 说明                                                      |
| ---- | -------- | ---- | --------------------------------------------------------- |
| time | `number` | 是   | 跳转的位置，单位：秒；超出总时长停止在当前帧，小于 0 无效 |

### Video.destroy — 销毁

```ts
video.destroy();
```

销毁视频实例，释放底层视频通道。**销毁后不能再使用该实例**。

> ⚠️ 不再使用的视频实例务必 `destroy()`，否则**持续占用视频通道**，可能阻塞后续视频播放。

---

## 视频事件监听方法

### Video.onCandraw — 首帧就绪

监听视频**首帧**事件，表示视频已解码出第一帧可以开始绘制。

**callback 参数：**

| 参数  | 类型     | 说明                                                     |
| ----- | -------- | -------------------------------------------------------- |
| scale | `number` | video 对象的宽度和高度之比（`videoWidth / videoHeight`） |

```ts
video.onCandraw((scale) => {
	// 根据宽高比调整渲染区域
	const renderWidth = 800;
	const renderHeight = renderWidth / scale;
	setRenderArea(renderWidth, renderHeight);
});
```

> 💡 `onCandraw` 在首帧就绪时触发一次，是设置渲染区域、显示视频画面的最佳时机。

### Video.onPlay — 播放事件

```ts
video.onPlay(() => {
	console.log('video playing');
});
```

### Video.onPause — 暂停事件

```ts
video.onPause(() => {
	console.log('video paused');
});
```

### Video.onStop — 停止事件

```ts
video.onStop(() => {
	console.log('video stopped');
});
```

### Video.onTimeUpdate — 进度更新

监听视频跳转/播放进度更新事件。

**callback 参数 Object：**

| 属性     | 类型     | 说明                             |
| -------- | -------- | -------------------------------- |
| position | `number` | 视频当前播放到的时长（单位：秒） |
| duration | `number` | 视频总时长（单位：秒）           |

```ts
video.onTimeUpdate((res) => {
	const progress = res.duration > 0 ? res.position / res.duration : 0;
	updateProgressBar(progress);
});
```

### Video.onEnded — 播放结束

监听视频**自然播放至结束**的事件（非 `stop()` 触发）。

```ts
video.onEnded(() => {
	console.log('video ended');
	// 切换到下一个场景
	enterNextScene();
	video.destroy();
});
```

### Video.onError — 错误事件

监听视频播放错误事件。`src` 不支持、下载错误、解码错误等都会触发。

**callback 参数：**

| 参数         | 类型     | 说明                                                             |
| ------------ | -------- | ---------------------------------------------------------------- |
| errorMessage | `string` | 错误信息文本，可能是：src 不支持的资源类型 / 下载错误 / 解码错误 |

```ts
video.onError((errMsg) => {
	console.error('video error:', errMsg);
	// 错误兜底：跳过视频，进入下一场景
	skipToNextScene();
	video.destroy();
});
```

### Video.onWaiting — 等待缓冲

监听视频由于需要缓冲下一帧而停止时触发。用于显示「加载中」指示器。

```ts
video.onWaiting(() => {
	showBufferingIndicator();
});
```

> 💡 `onWaiting` 与 `onProgress` 区别：`onWaiting` 在缓冲不足导致播放停滞时触发；`onProgress` 在下载/缓冲进度变化时触发。

### Video.onProgress — 下载/缓冲进度

监听视频下载（缓冲）进度事件。

**callback 参数 Object：**

| 属性     | 类型     | 说明                                                |
| -------- | -------- | --------------------------------------------------- |
| buffered | `number` | 当前的缓冲进度，范围 `(0, 100]`，`100` 表示缓冲完成 |
| duration | `number` | 视频的总时长，单位：秒                              |

```ts
video.onProgress((res) => {
	console.log('buffered:', res.buffered + '%', 'duration:', res.duration + 's');
	updateBufferBar(res.buffered);
	// 缓冲达到 100% 时隐藏缓冲指示器
	if (res.buffered >= 100) {
		hideBufferingIndicator();
	}
});
```

### 常见误用 & 注意事项（视频全局）

- ⚠️ **必须用 `ks.createVideo`** 而非 `new Video()` / `document.createElement('video')`，快手运行环境不提供 DOM
- ⚠️ 不再使用的实例务必 `destroy()`，否则**持续占用视频通道**，可能阻塞后续视频播放
- ⚠️ `src` / `width` / `height` **必须设置**，三者缺一不可
- ⚠️ **属性设置顺序**：必须先绑定事件（尤其是 `onProgress`），再设置 `src`（设 `src` 触发下载 → `onProgress` 立即开始回调）；顺序反了会导致 `onProgress` 丢失早期进度
- ⚠️ 视频 `src` 必须是本地路径或代码包路径，网络视频需先 `ks.downloadFile` 到本地
- ⚠️ `seek(time)` 超出总时长则停止在当前帧，**小于 0 无效**，需做边界检查
- ⚠️ `onCandraw` 是首帧事件，**只在视频开始时触发一次**，不要在这里做需要每次触发的逻辑
- ⚠️ `onTimeUpdate` 触发频率高，回调里禁止重计算
- ⚠️ `onError` 触发后通常会跟着 `onStop`，重连/重试逻辑放在 `onStop` 里更合适
- ⚠️ `loop: true` 时 `onEnded` 不会触发，不要依赖它做切换
- ⚠️ 切到后台时容器可能自动暂停视频，回前台时需主动 `play()` 恢复
- ⚠️ **创建后参数不可变更**：`Video` 实例的 `src` / `x` / `y` / `width` / `height` / `loop` / `autoplay` / `muted` / `objectFit` / `poster` / `initialTime` / `backgroundColor` / `underGameView` 等属性**仅在创建时（`play()` 之前）一次性设置生效**；`play()` 之后再修改这些属性**不会生效**，需 `destroy()` 后重新 `ks.createVideo()` 创建新实例
- ⚠️ **视频置于 canvas 底部需白名单**：默认视频渲染层级在 canvas 之上（视频会盖住 canvas）。若需要在视频画面上叠加交互层，必须先联系**平台支持团队**申请白名单，设置 `underGameView: true` 并配合 `Canvas.getContext('webgl', { alpha: true })` 使主屏 canvas 透明，否则视频始终位于顶层、canvas 交互层无法覆盖

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **开场动画**：启动时播放开场动画 → `ks.createVideo` + `onEnded` 进入主菜单
- **教学视频**：应用内的新手教学、操作说明 → 播放视频 + 进度条更新
- **关卡过场动画**：关卡间播放过场剧情视频 → 完成后 `destroy` 进入下一关
- **视频广告 / 内容推荐**：播放推广视频 → 监听 `onEnded` 切换
- **截图/录屏**：录制精彩片段并回放（结合 `ks.getGameRecorder`）
- **视频画面叠加交互**：视频作为背景画面、canvas 透明叠加交互 → ⚠️ **必须先联系平台支持团队申请白名单**，否则视频会盖住 canvas、交互层无法使用；视频属性（`src` / `loop` / `autoplay` 等）需在 `play()` 前一次性设置，后续变更需调用 `destroy()` 重建

推荐：使用 `kwai-media.js`（`KwaiMedia.Video`）：

**kwai-media.js 使用示例：**

```js
// 方式一：一步到位（play 自动 create + play），适合简单场景
KwaiMedia.Video.play('intro', {
	src: 'video/intro.mp4',
	width: 375,
	height: 667,
	loop: false,
	onCandraw: function (scale) {
		adjustVideoRenderArea(scale);
	},
	onEnded: function () {
		enterMainMenu();
		KwaiMedia.Video.destroy('intro');
	},
	onError: function (errMsg) {
		console.error('视频错误:', errMsg);
		enterMainMenu();
		KwaiMedia.Video.destroy('intro');
	}
});

// 方式二：先 create 再 play，适合需要 onProgress 等创建阶段事件的场景
// ⚠️ create 后 onProgress 立即开始触发（视频下载），必须先 create 绑定事件
KwaiMedia.Video.create('tutorial', {
	src: 'video/tutorial.mp4',
	width: 375,
	height: 667,
	onProgress: function (res) {
		updateBufferBar(res.buffered); // 缓冲进度
	},
	onTimeUpdate: function (res) {
		updateProgressBar(res.position / res.duration);
	},
	onEnded: function () {
		KwaiMedia.Video.destroy('tutorial');
	},
	onError: function (errMsg) {
		KwaiMedia.Video.destroy('tutorial');
	}
});
// ... 准备好后播放
KwaiMedia.Video.play('tutorial');

// 用户点击跳过
function onSkipIntro() {
	KwaiMedia.Video.destroy('intro');
	enterMainMenu();
}

// 暂停/恢复/跳转
KwaiMedia.Video.pause('tutorial');
KwaiMedia.Video.resume('tutorial');
KwaiMedia.Video.seek('tutorial', 10.0);

// 视频画面叠加交互：视频在 canvas 底部（配合 Canvas.getContext('webgl', { alpha: true }) 透明 canvas）
// ⚠️ 需先联系平台支持团队申请白名单
KwaiMedia.Video.create('bg', {
	src: 'video/game_bg.mp4',
	width: 750,
	height: 1334,
	underGameView: true, // 视频置于 canvas 之下
	loop: true
});
KwaiMedia.Video.play('bg');

// 退出应用时销毁所有视频
function onExitGame() {
	KwaiMedia.Video.destroyAll();
	ks.exitMiniProgram();
}
```

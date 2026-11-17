# 玩法工程资源规范

## 目录与路径

玩法代码始终传包内相对路径，不自行拼接 CDN 地址。平台上传时统一处理非首帧资源的 CDN 地址。建议按类型、用途或使用阶段规划子目录，例如公共资源、关卡资源、剧情资源等，避免不同场景混用素材：

```text
res/
  home-asset/           # 首页首帧必需图片：主包保留，不上传 CDN
  Image/                # 图片，可按用途继续划分子目录
  Audio/                # 音频，可按用途继续划分子目录
  Video/                # 视频
  Icon/                 # 图标
subpackages/<sub-name>/res/  # 分包专属资源
```

- `res/home-asset/` 只放首页首帧必须的资源，必须在主包，不放分包，也不上传 CDN；其他首页后续才用到的素材仍按场景规划。
- 首屏必需的其他资源放主包；非首屏资源按关卡或场景放对应分包。先加载分包，再访问其中的文件。
- 文件名全小写，单词用 `-` 连接，不含空格、中文和特殊字符，长度不超过 60 个字符。避免重复存储同一素材，并按实际展示尺寸与音视频需求压缩资源。
- `yoola-assets/` 是平台素材目录，玩法运行时不要引用。

## 下载与预下载

通过 `AIGCUtils.ResourceLoader` 使用资源，路径始终写包内相对路径。首次使用需要等待资源就绪；已经下载的资源后续会复用。切换场景前预下载下一场景的文件，避免在玩家操作时等待：

```js
var loader = AIGCUtils.ResourceLoader;
loader.preload([
  { key: 'scene-bg', path: 'res/Image/scene-bg.png' },
  { key: 'scene-bgm', path: 'res/Audio/scene-bgm.mp3' }
], {
  onProgress: function (done, total) { updateLoading(done / total); },
  onSuccess: function () {
    KwaiMedia.Image.load('res/Image/scene-bg.png').then(function (img) {
      enterScene(img);
    }).catch(showRetry);
  },
  onFail: function (err) { showRetry(err); }
});
```

这里的 `preload` 只预下载文件，不创建图片对象。分包资源应在分包加载成功后再预下载。下载或图片加载期间显示 loading 和进度反馈，失败时提供重试入口；图片实际加载成功后再进入场景，避免白屏和卡顿。

## 图片、音频和视频调用

所有资源 API 都传入包内相对路径，不直接创建平台图片、音频对象，也不拼接 CDN 地址。

### 图片

需要回调式加载时使用 `KwaiRender.loadImage`：

```js
KwaiRender.loadImage({
  src: 'res/Image/menu-bg.png',
  onSuccess: function (img) {
    // img 已加载，可用于创建 WebGL 纹理
  },
  onFail: function (err) {
    showRetry(err);
  }
});
```

需要 Promise 或批量加载时使用 `KwaiMedia.Image`：

```js
KwaiMedia.Image.load('res/Image/player.png').then(function (img) {
  drawPlayer(img);
}).catch(showRetry);

KwaiMedia.Image.loadAll([
  'res/Image/player.png',
  'res/Image/prop.png'
]).then(function (images) {
  enterScene(images);
});
```

### 音频

背景音乐使用单例播放控制，音效使用音效池复用：

```js
KwaiMedia.Audio.playBgm('res/Audio/bgm-main.mp3');
KwaiMedia.Audio.playSfx('res/Audio/click.mp3');

KwaiMedia.Audio.pauseBgm();
KwaiMedia.Audio.resumeBgm();
KwaiMedia.Audio.stopBgm();
KwaiMedia.Audio.setBgmVolume(0.6);
KwaiMedia.Audio.setSfxVolume(1.0);
```

### 视频

创建视频时必须提供 `src`、`width` 和 `height`，播放结束或离开场景时销毁：

```js
KwaiMedia.Video.create('opening', {
  src: 'res/Video/opening.mp4',
  x: 0,
  y: 0,
  width: 414,
  height: 896,
  loop: false,
  onEnded: function () {
    KwaiMedia.Video.destroy('opening');
  },
  onError: function (err) {
    showRetry(err);
  }
});

KwaiMedia.Video.play('opening');
// 场景退出时：KwaiMedia.Video.destroy('opening');
```

视频播放期间显示必要的 loading 或错误提示；视频、音频和图片都应在不再使用时及时释放。

## 图片内存释放

常规图片可以通过上面的图片 API 加载。需要多个模块共享、并明确控制引用的图片，用 `ResourceLoader` 管理引用和释放。

需要多个模块共享的图片，用 `ResourceLoader` 管理引用和释放：

```js
var loader = AIGCUtils.ResourceLoader;
var handle = loader.acquire('image', 'scene-bg', 'res/Image/scene-bg.png', 'scene');
loader.ready('scene-bg').then(function (img) {
  enterScene(img);
  onLeaveScene(function () {
    // 先释放对应 WebGL 纹理，再释放图片引用。
    handle.release();
  });
}).catch(function (err) {
  handle.release();
  showRetry(err);
});
```

按场景持有并释放句柄；多个使用者共享同一资源时，每个使用者各自释放自己的引用。离开场景后停止音视频播放，销毁不再使用的纹理及媒体实例。本地已下载文件可供后续使用。

## 发布前检查

- 首页首帧资源均在 `res/home-asset/`，保留主包且不上传 CDN。
- 分包资源先加载分包；场景切换前预下载下一场景资源。
- 下载和加载期间有等待提示，失败可重试；资源就绪后再进入场景。
- 图片引用、WebGL 纹理、音频和视频在不再使用时及时释放。
- 所有代码引用包内路径，素材按场景和类型归档，命名及体积已优化。

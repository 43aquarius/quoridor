# KwaiAPI 索引（对外）

> 使用说明：根据项目需要接入的能力找到对应模块。读取模块文档后，在 `package/game.js` 中 `require` 对应的 `kwaiOpenApi/kwai-*.js` 文件，再参照文档中的封装示例调用。所有封装文件已随 `Template/kwaiOpenApi/` 一并提供，无需手动复制。

## 广告（Ad）

- [激励广告](ad/rewarded-ad.md) — `KwaiAd.showRewarded`

## 基础生命周期（Base）

- [生命周期](base/lifecycle.md) — `KwaiBase.onShow / onHide / exit / getLaunchOptions`
- [系统信息](base/system.md) — `KwaiBase.getSystemInfo`
- [触摸事件](base/touch.md) — `canvas.addEventListener`，必须 `{ passive: false }`

## 设为常用（CommonUse）

- [设为常用](commonuse/commonuse.md) — `KwaiCommonUse.add / check`

## 数据分析（Data Analysis）

- [数据分析上报](data-analysis/data-analysis.md) — `KwaiDataAnalysis.reportScene`

## 设备能力（Device）

- [振动](device/vibrate.md) — `KwaiDevice.vibrateShort / vibrateLong`
- [内存告警](device/memory-warning.md) — `KwaiDevice.onMemoryWarning`
- [加速度计](device/accelerometer.md) — `KwaiDevice.startAccelerometer / onAccelerometerChange`
- [陀螺仪](device/gyroscope.md) — `KwaiDevice.startGyroscope / onGyroscopeChange`
- [设备方向](device/motion.md) — `KwaiDevice.startDeviceMotion / onDeviceMotionChange`
- [罗盘](device/compass.md) — `ks.startCompass / onCompassChange`
- [键盘](device/keyboard.md) — `KwaiDevice.showKeyboard / hideKeyboard / onKeyboardInput`

## 文件系统（File）

- [文件系统](file/file.md) — `KwaiFile.readSync / writeSync / existsSync / mkdirSync / saveFile`

## 内容社区（Game Community）

- [内容社区](game-community/game-community.md) — `KwaiGameCommunity.jumpToGameClub / shareImage / publishRecordVideo`

## 原生 UI（Interface）

- [交互弹窗](interface/interact.md) — `KwaiUI.showToast / showModal / showLoading / showActionSheet`
- [菜单胶囊](interface/menu.md) — `ks.getMenuButtonBoundingClientRect`

## 媒体（Media）

- [音频](media/audio.md) — `KwaiMedia.Audio.playBgm / playSfx / setBgmEnabled`
- [视频](media/video.md) — `KwaiMedia.Video.play / create / destroy`
- [图片资源管理](media/image.md) — `KwaiMedia.Image.load / loadAll`

## 网络（Network）

- [文件下载](network/download.md) — `KwaiNetwork.downloadFile`

## 官方号（Official）

- [官方号关注](official/official.md) — `KwaiOfficial.checkFollow / openProfile`

## 开放接口（Open）

- [登录](open/login.md) — `KwaiOpen.login / checkSession`
- [用户信息](open/user-info.md) — `KwaiOpen.getUserInfo`
- [授权](open/auth.md) — `KwaiOpen.authorize / getSetting`
- [Feed 流直出](open/feed-subscribe.md) — `KwaiOpen.onFeedStatusChange`

## 录制（Record）

- [录制能力](record/record.md) — `KwaiRecord.start / stop / pause / resume / abort / publishVideo`

## 渲染（Render）

- [画布](render/canvas.md) — `KwaiRender.init / createOffscreenCanvas`（WebGL 强制）
- [图片预加载](render/image.md) — `KwaiRender.loadImage`
- [帧率控制](render/frame-rate.md) — `KwaiRender.setPreferredFramesPerSecond`
- [字体加载](render/font.md) — `ks.loadFont`

## 转发（Repost）

- [转发分享](repost/repost.md) — `KwaiRepost.shareAppMessage / registerSystemShare / getLaunchQuery`

## 添加到桌面（Shortcut）

- [添加到桌面](shortcut/shortcut.md) — `KwaiShortcut.add / check / isFromShortcut`

## 侧边栏（Sider Bar）

- [侧边栏](sider-bar/sider-bar.md) — `KwaiSiderBar.checkAvailable / navigateToSidebar`

## 数据缓存（Storage）

- [数据缓存](storage/storage.md) — `KwaiStorage.setSync / getSync / set / get / remove`

## 分包加载（Subpackage）

- [分包加载](subpackage/subpackage.md) — `KwaiSubpackage.load`

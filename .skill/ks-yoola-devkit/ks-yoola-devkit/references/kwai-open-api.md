# 快手开放能力 API 索引

各开放能力模块文档见 [kwai-api/KwaiAPI-index.md](kwai-api/KwaiAPI-index.md)，按功能导航到对应模块后阅读封装层调用示例。

## 能力路由总表

> 不在下表中的能力说明快手平台暂未开放，请在代码注释中说明并建议替代方案，不要自行模拟。

| 需求关键词 | 模块文件 | 全局对象 | 兼容性 |
|---|---|---|---|
| 画布 / 渲染 / 帧率 / 图片 / 字体 | `kwaiOpenApi/kwai-render.js` | `KwaiRender` | 支持 Canvas 2D / WebGL / WebGL 2 |
| 文件下载 | `kwaiOpenApi/kwai-network.js` | `KwaiNetwork` | 快手/H5 双端适配，仅开放 downloadFile |
| 本地存储 / 数据缓存 / 存档 | `kwaiOpenApi/kwai-storage.js` | `KwaiStorage` | 快手/H5 双端 |
| 视频 / 音频 / 媒体 | `kwaiOpenApi/kwai-media.js` | `KwaiMedia` | 快手/H5 双端完整适配 |
| 振动 / 传感器 / / 键盘 | `kwaiOpenApi/kwai-device.js` | `KwaiDevice` | 振动/传感器，键盘静默 |
| 生命周期 / 系统信息 / 冷启动参数 | `kwaiOpenApi/kwai-base.js` | `KwaiBase` | 非快手返回空值 |
| Toast / Modal / Loading / 弹窗 | `kwaiOpenApi/kwai-ui.js` | `KwaiUI` | 非快手静默 |
| 文件系统 / 读写 / 存档 | `kwaiOpenApi/kwai-file.js` | `KwaiFile` | 读写仅快手 |
| 广告 / 激励视频 | `kwaiOpenApi/kwai-ad.js` | `KwaiAd` | 非快手跳过 |
| 分享 / 转发 / 邀请 | `kwaiOpenApi/kwai-repost.js` | `KwaiRepost` | 非快手跳过 |
| 用户信息 / 授权 / Feed 流 | `kwaiOpenApi/kwai-open.js` | `KwaiOpen` | 非快手 onFail |
| 录制 / 对局回放 / 录屏 | `kwaiOpenApi/kwai-record.js` | `KwaiRecord` | 非快手静默 |
| 添加到桌面 | `kwaiOpenApi/kwai-shortcut.js` | `KwaiShortcut` | 非快手 onFail |
| 侧边栏 | `kwaiOpenApi/kwai-siderbar.js` | `KwaiSiderBar` | 非快手 onFail |
| 设为常用 | `kwaiOpenApi/kwai-commonuse.js` | `KwaiCommonUse` | 非快手 onFail |
| 官方号 / CP 服务号 | `kwaiOpenApi/kwai-official.js` | `KwaiOfficial` | 非快手 onFail |
| 内容社区 | `kwaiOpenApi/kwai-game-community.js` | `KwaiGameCommunity` | 非快手 onFail |
| 分包加载（底层）| `kwaiOpenApi/kwai-subpackage.js` | `KwaiSubpackage` | 非快手 onFail |
| 数据分析 / 埋点 | `kwaiOpenApi/kwai-data-analysis.js` | `KwaiDataAnalysis` | 非快手 onFail |
| 分包加载（封装）| `kwaiStandard/loaders/subpackage-loader.js` | `AIGCUtils.SubpackageLoader` | H5 静默跳过 |
| 重要日志 / 日志回捞 | `kwaiStandard/manager/game-logger.js` | `AIGCUtils.GameLogger` | 双端 |

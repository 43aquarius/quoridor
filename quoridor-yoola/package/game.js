/**
 * game.js — 主包入口
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 【主包 vs 分包职责 - 代码生成（codegen）阶段强制规则】
 * ────────────────────────────────────────────────────────────────────────────
 * 主包只放首屏必需的代码与素材；**非必要的文件在代码生成（codegen）阶段自动放入分包**。
 * 本作为单机棋类，全部代码与字体均在主包（总体积远小于 6 MiB 限额）。
 * ────────────────────────────────────────────────────────────────────────────
 */

require("./kwaiadapter.js");
require("./kwaiStandard/engines/ks-adapter.js");
require("./kwaiStandard/core/kshelper.js");
// 快手端唯一模块装配入口：所有 require 必须写在这里。
require("./kwaiStandard/core/aigc-init.js"); // 初始化 AIGCUtils.Layout 等全局基础参数
require("./kwaiStandard/core/kwai-event-bus.js"); // 事件总线
require("./kwaiStandard/loaders/subpackage-loader.js"); // 分包加载器
require("./kwaiStandard/loaders/resource-manifest.js"); // 资源映射表（平台上传阶段注入 CDN 映射）
require("./kwaiStandard/loaders/resource-loader.js"); // 下载、预加载和资源生命周期
require("./kwaiStandard/manager/game-logger.js"); // 重要日志输出
require("./kwaiStandard/engines/spine38.js"); // Spine 3.8 运行时
require("./kwaiStandard/engines/spine-fx.js"); // Spine 特效渲染器
require("./kwaiStandard/core/kwai-ad-config.js"); // 广告位配置
require("./kwaiOpenApi/kwai-login.js"); // 用户登录
require("./kwaiOpenApi/kwai-ad.js"); // 广告
require("./kwaiOpenApi/kwai-repost.js"); // 转发分享
require("./kwaiOpenApi/kwai-ui.js"); // Toast / Modal / Loading
require("./kwaiOpenApi/kwai-network.js"); // yoola平台资源下载
require("./kwaiOpenApi/kwai-media.js"); // 媒体：图片 / 音频（活版音效 mp3）
require("./kwaiOpenApi/kwai-render.js"); // 渲染封装（离屏画布 / 图片 / 字体）
require("./kwaiOpenApi/kwai-storage.js"); // 本地存储（存档 / 战绩 / 档案）
// ↓ 业务文件（按依赖顺序填入，禁止在其他文件内写 require）
require("./gameplay/play/core.js"); // 规则引擎 + 类型/预设（Web 版原样移植）
require("./gameplay/play/ai.js"); // 四档 AI（含四人局，Web 版原样移植）
require("./gameplay/render/theme.js"); // 设计主题（纸墨色板 / 字体族 / 皮肤）
require("./gameplay/render/ui.js"); // UI 组件库（印刷风）
require("./gameplay/render/page.js"); // 滚动页面框架
require("./gameplay/render/board.js"); // 棋盘渲染与命中几何
require("./gameplay/render/gl.js"); // WebGL 纹理 blit
require("./gameplay/scene/cover.js"); // 封面
require("./gameplay/scene/toc.js"); // 目录
require("./gameplay/scene/setup.js"); // 章节设置（单人/双人/四人）
require("./gameplay/scene/game.js"); // 对局
require("./gameplay/scene/rules.js"); // 规则
require("./gameplay/scene/archive.js"); // 棋谱档案馆
require("./gameplay/play/main.js"); // 编排与启动

window.canvas = kshelper.GetMainCanvas("canvas");

// 字体预加载（快手同步 / Web 异步），就绪后启动应用
KwaiRender.preloadFonts([
  { alias: "qserif",   path: "fonts/serif-sc-regular.ttf" },
  { alias: "qserif-b", path: "fonts/serif-sc-bold.ttf" },
  { alias: "qserif-x", path: "fonts/serif-sc-black.ttf" },
  { alias: "qmono",    path: "fonts/plex-mono-regular.ttf" },
  { alias: "qmono-b",  path: "fonts/plex-mono-bold.ttf" },
  { alias: "qmono-i",  path: "fonts/plex-mono-italic.ttf" },
  { alias: "qwest",    path: "fonts/playfair-regular.ttf" },
  { alias: "qwest-x",  path: "fonts/playfair-black.ttf" },
  { alias: "qwest-i",  path: "fonts/playfair-italic.ttf" },
], function () {
  AIGCUtils.Fonts.resolve();
  AIGCUtils.Game.boot();
});

require("kwaiStandard/main.js");

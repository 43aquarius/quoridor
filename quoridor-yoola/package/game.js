/**
 * game.js — 主包入口
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 【主包 vs 分包职责 - 代码生成（codegen）阶段强制规则】
 * ────────────────────────────────────────────────────────────────────────────
 * 主包只放首屏必需的代码与素材；**非必要的文件在代码生成（codegen）阶段自动放入分包**。
 *
 * 判定规则（codegen 阶段执行）：
 *   1) 仅在特定关卡 / 场景 / 结局下使用的代码文件  → 放入对应分包根目录
 *      例：第 2 关逻辑 → subpackages/subpackage1/，第 3 关逻辑 → subpackages/subpackage2/
 *   2) 仅在特定关卡使用的素材（非首屏）           → 放入对应分包 res/
 *      例：level2-bg.png → subpackages/subpackage1/res/Image/level2-bg.png
 *   3) 首屏必需代码 / 首屏必需素材 / res/home-asset/ → 必须留在主包，禁止入分包
 *   4) 资源体积无需按大小判断：平台在上传阶段统一做 CDN 化（视频等大文件不占用包体）
 *
 * 分包加载（主包侧调用，按需触发）：
 *   AIGCUtils.SubpackageLoader.load({
    *     name: 'subpackage1', // 与 game.json subpackages[].name 一致
 *     onSuccess: function () { /* 分包已就绪，进入分包场景 *\/ },
 *     onFail:    function (e) { console.error('[SubPkg] 加载失败', e); },
 *   });
 *
 * 分包内 game.js 由 ks.loadSubpackage 加载成功后自动执行一次（场景注册用），
 * 详见 subpackages/subpackage1/game.js、subpackages/subpackage2/game.js 顶部说明。
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
require("./kwaiOpenApi/kwai-render.js"); // 渲染封装（离屏画布 / 图片）
require("./kwaiOpenApi/kwai-storage.js"); // 本地存储（存档 / 战绩）
// ↓ 业务文件（按依赖顺序填入，禁止在其他文件内写 require）
require("./gameplay/play/engine.js"); // 规则引擎（纯函数）
require("./gameplay/play/ai.js"); // AI（贪心 + α-β 搜索）
require("./gameplay/render/ui.js"); // 主题与 UI 组件库
require("./gameplay/render/board.js"); // 棋盘渲染与命中几何
require("./gameplay/render/gl.js"); // WebGL 纹理 blit
require("./gameplay/scene/home.js"); // 首页场景
require("./gameplay/scene/game.js"); // 对局场景
require("./gameplay/play/main.js"); // 编排与启动（最后，负责 boot）

window.canvas = kshelper.GetMainCanvas("canvas");

require("kwaiStandard/main.js");

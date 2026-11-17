/**
 * subpackages/subpackage2/game.js — 分包入口
 *
 * ks.loadSubpackage({ name: 'subpackage2' }) 加载成功后，本文件会被自动执行一次。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 【分包职责 - 代码生成（codegen）阶段强制规则】
 * ────────────────────────────────────────────────────────────────────────────
 * 主包只放首屏必需的代码与素材；**非必要的文件在代码生成（codegen）阶段自动放入分包**。
 *
 * 判定规则（codegen 阶段执行）：
 *   1) 仅在特定关卡 / 场景 / 结局下使用的代码文件  → 放入对应分包根目录
 *      例：第 3 关的 board.js / render.js / config.js → subpackages/subpackage2/
 *   2) 仅在特定关卡使用的素材（非首屏）           → 放入对应分包 res/
 *      例：level3-bg.png → subpackages/subpackage2/res/Image/level3-bg.png
 *   3) 首屏必需代码 / 首屏必需素材 / res/home-asset/ → 必须留在主包，禁止入分包
 *   4) 资源体积无需按大小判断：平台在上传阶段统一做 CDN 化（视频等大文件不占用包体）
 *
 * 分包内文件结构（与主包保持一致）：
 *   subpackages/<sub-name>/
 *     game.js          # 分包入口（本文件，加载成功后自动执行一次）
 *     res/
 *       Image/         # 分包专属图片（PNG / JPG / WebP / SVG）
 *       Audio/         # 分包专属音频（MP3 / OGG / M4A）
 *       Video/         # 分包专属视频（⚠️ 仅本地调试，生产必须换 CDN URL）
 *     # codegen 阶段按需新增（路径按技术方案实际文件名填写）：
 *     # play/          # 分包玩法逻辑
 *     # render/        # 分包渲染逻辑
 *     # scene/         # 分包场景逻辑
 *
 * 分包加载方式（主包侧调用）：
 *   AIGCUtils.SubpackageLoader.load({
    *     name: 'subpackage2', // 与 game.json subpackages[].name 一致
 *     onSuccess: function () { /* 分包已就绪，进入分包场景 *\/ },
 *     onFail:    function (e) { console.error('[SubPkg] 加载失败', e); },
 *   });
 *
 * ⚠️ 本 game.js 由 ks.loadSubpackage 加载成功后自动执行一次：
 *    - 适合做：场景注册、资源预加载、常量初始化等"注册类"工作
 *    - 禁止做：立即触发的业务逻辑（应等主包通过 onSuccess 回调通知后再执行）
 *    - 禁止在此 require 主包文件（主包文件由根目录 game.js 统一加载，分包加载时主包早已就绪）
 * ────────────────────────────────────────────────────────────────────────────
 */

(function () {
  // 分包场景注册表（主包通过 SubpackageLoader.load 的 onSuccess 回调后从此处取场景入口）
  var AIGCUtils = window.AIGCUtils = window.AIGCUtils || {};
  AIGCUtils.SubpackageEntries = AIGCUtils.SubpackageEntries || {};

  // ─────────────────────────────────────────────────────────────────────────
  // codegen 阶段在此处按需追加（路径相对分包根目录）：
  //   require('./play/level3-board.js');     // 分包关卡数据
  //   require('./render/level3-render.js');  // 分包渲染逻辑
  //   require('./scene/level3-scene.js');   // 分包场景入口
  //
  // 并注册场景入口，供主包调用：
  //   AIGCUtils.SubpackageEntries['subpackage2'] = function () {
  //     /* 进入分包场景：初始化关卡、播放 bgm 等 *\/
  //   };
  // ─────────────────────────────────────────────────────────────────────────
})();

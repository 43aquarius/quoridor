(function () {
  // ─────────────────────────────────────────────────────────────────────────
  // aigc-init.js — 全局命名空间与布局参数初始化
  //
  // 【职责】
  //   本文件必须在所有业务 js 文件之前加载 / require，负责：
  //   1. 创建 window.AIGCUtils 全局命名空间
  //   2. 初始化 AIGCUtils.Layout（屏幕尺寸 + 安全区基础字段）
  //   3. 提供 AIGCUtils._now() 统一时间源
  //
  // 【加载规则】
  //   H5：index.html 中必须是第一个 <script src="kwaiStandard/core/aigc-init.js?v=1">
  //   快手：game.js require 块中必须是第一行 require('./kwaiStandard/core/aigc-init.js')
  //
  // 【扩展规则】
  //   其他 js 文件（layout.js / board.js / game.js …）均可安全地向
  //   AIGCUtils.Layout / AIGCUtils.C / AIGCUtils.Game 等挂载属性，无需再做 AIGCUtils.Layout = AIGCUtils.Layout || {}
  //   的防御性检查，因为 aigc-init.js 已保证这些基础对象存在。
  // ─────────────────────────────────────────────────────────────────────────

  var AIGCUtils = window.AIGCUtils = window.AIGCUtils || {};

  // ── 屏幕布局基础字段 ──────────────────────────────────────────────────────
  AIGCUtils.Layout = {
    safeTop: 0,  // 顶部安全区高度（逻辑像素）：状态栏 + 刘海
    usableH: 0,  // 可用高度 = 屏幕总高 - safeTop
    w:       0,  // 屏幕逻辑宽度
    h:       0   // 屏幕逻辑高度
    // layout.js 等子模块会在此对象上追加 calc / cell / boardX / boardY 等字段
  };

  // ── 统一时间源 ────────────────────────────────────────────────────────────
  // 禁止在玩法代码中直接调用 performance.now()。
  // 快手环境时间基不一致，直接调用会导致动画卡死。
  AIGCUtils._now = function () {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  };
})();

(function () {
  var AIGCUtils = window.AIGCUtils = window.AIGCUtils || {};

  // 快手端模块装配统一在根目录 game.js 完成；
  // H5 浏览器预览由 index.html 的 <script> 标签按相同文件集合加载。

  var canvas = window.canvas;
  // 【WebGL 渲染上下文】
  // 渲染上下文可按需选择 '2d' / 'webgl' / 'webgl2'。
  // 可按需选择 WebGL 1.0 / WebGL 2.0 / Canvas 2D。
  var gl;
  try { gl = canvas.getContext('webgl'); } catch (e) {}
  if (!gl) { console.error('[AIGCUtils] WebGL not supported'); }

  // ─────────────────────────────────────────────────────────────────────────
  // 【屏幕适配 + DPR + 安全区】
  // canvas 物理尺寸 = CSS 尺寸 × DPR，配合 setTransform 保证高清渲染。
  // AIGCUtils.Layout 基础字段已由 aigc-init.js 初始化，此处只负责 resize 更新。
  // 所有画面内容的 Y 起点必须从 AIGCUtils.Layout.safeTop 开始，禁止从 0 开始绘制。
  // ─────────────────────────────────────────────────────────────────────────
  function getSafeTop () {
    // 快手运行环境：从系统信息读取安全区
    if (typeof ks !== 'undefined' && ks.getSystemInfoSync) {
      try {
        var info = ks.getSystemInfoSync();
        return (info.safeArea && info.safeArea.top) ? info.safeArea.top : 0;
      } catch (e) { return 0; }
    }
    return 0;
  }

  // 记录上一次的画布尺寸，仅当尺寸真正变化时才重建 backing store。
  // 【关键修复】canvas.width/height 每帧赋值会重新分配整块画布缓冲区，
  // 在全屏浏览器（大画布 + 高 DPR）下会周期性露出未初始化的 GPU 显存，
  // 表现为「红色全屏定时闪动」；手机画布小、开销低故不复现。
  var _lastCssW = 0, _lastCssH = 0, _lastDpr = 0;
  function resize () {
    // KS 运行环境直接读 window 尺寸；浏览器调试时读 index.html 上存储的固定分辨率（注意横竖屏）
    var isKS = typeof ks !== 'undefined' || (typeof window.__kwaiGameEnv !== 'undefined');
    var cssW, cssH;
    if (isKS) {
      cssW = window.innerWidth;
      cssH = window.innerHeight;
    } else {
      // 浏览器调试：从 html 元素读取固定分辨率，横竖屏切换后由 index.html 的 toggleOrientation() 更新
      var _htmlEl = document.documentElement;
      cssW = parseInt(_htmlEl.getAttribute('data-debug-w') || '414', 10);
      cssH = parseInt(_htmlEl.getAttribute('data-debug-h') || '896', 10);
    }
    var dpr = window.devicePixelRatio || 1;

    // 尺寸/DPR 未变化时，跳过昂贵的画布重建，避免全屏浏览器周期性红屏闪动
    if (cssW === _lastCssW && cssH === _lastCssH && dpr === _lastDpr) return;
    _lastCssW = cssW; _lastCssH = cssH; _lastDpr = dpr;

    // H5 预览的样式尺寸由 index.html CSS 管理；KS 端画布布局由平台管理。
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // WebGL viewport 同步物理像素尺寸
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    // 更新布局参数
    AIGCUtils.Layout.w = cssW;
    AIGCUtils.Layout.h = cssH;
    AIGCUtils.Layout.safeTop = getSafeTop();
    AIGCUtils.Layout.usableH = cssH - AIGCUtils.Layout.safeTop;
  }
  resize();
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 【统一时间源】
  // AIGCUtils._now 已由 aigc-init.js 定义，此处无需重复。
  // 所有主循环和动画逻辑统一使用 AIGCUtils._now()，禁止直接调用 performance.now()。
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // 【占位绘制】
  // 仅用于模版验证，生成业务画面后此函数应被 render.js 中的 WebGL 绘制逻辑替代。
  // 所有绘制必须使用 WebGL API（gl.clearColor / gl.clear / shader / drawArrays 等），
  // Canvas 2D API 可按需使用。
  // ─────────────────────────────────────────────────────────────────────────
  function draw() {
    if (!gl) return;
    // 背景色 #5bc8e8（r=0.36 g=0.78 b=0.91）
    gl.clearColor(0.36, 0.78, 0.91, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // 生成业务画面后，此处由 render.js 中的 WebGL shader / drawArrays 等逻辑替代
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 【主循环】
  // 每帧先 resize（幂等，尺寸未变时开销极低），再执行绘制。
  // 完成业务逻辑后将 draw() 替换为 AIGCUtils.Game.update() + AIGCUtils.Render.draw() 等调用。
  // ─────────────────────────────────────────────────────────────────────────
  function loop() {
    resize();
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

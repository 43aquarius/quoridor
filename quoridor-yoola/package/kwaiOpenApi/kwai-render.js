/**
 * kwai-render.js — 快手应用渲染模块（支持 Web 降级）
 *
 * 快手环境：使用 ks.createCanvas() / ks.createImage() / ks.getSystemInfoSync() / ks.loadFont()
 * Web 环境：使用 document.createElement('canvas') / new Image() / window 尺寸 / FontFace API
 *
 * 使用方式（game.js 模块装配后调用一次）：
 *   KwaiRender.init();
 *   var canvas = KwaiRender.canvas;
 *   var gl     = KwaiRender.gl;
 *
 *   // 创建离屏画布
 *   var offscreen = KwaiRender.createOffscreenCanvas(400, 300);
 *   var offGl     = offscreen.getContext('webgl');
 *
 *   // 加载图片
 *   KwaiRender.loadImage({
 *     src:       'res/Image/hero.png',
 *     onSuccess: function(img) { uploadTexture(gl, img); },
 *     onFail:    function(err) {},
 *   });
 *
 *   // 加载自定义字体（同步，快手；Web 异步降级）
 *   KwaiRender.loadFont('fonts/title.ttf', 'gameTitle');
 *   // 字体资源由 WebGL 文本渲染模块使用
 *
 *   // 预加载多个字体（推荐在 Loading 场景调用）
 *   KwaiRender.preloadFonts([
 *     { alias: 'title',  path: 'fonts/title.ttf' },
 *     { alias: 'number', path: 'fonts/number.ttf' },
 *   ], function() {
 *     startGame(); // 字体全部就绪后开始运行
 *   });
 *
 *   // 设置帧率
 *   KwaiRender.setPreferredFramesPerSecond(60);
 *
 * 说明：
 *   快手环境：首次 ks.createCanvas() 返回屏幕主画布，之后调用返回离屏画布
 *   Web 环境：init() 会查找 id="gameCanvas" 的画布，或自动创建并追加到 body
 *
 * 字体注意事项：
 *   - 快手：ks.loadFont() 同步加载，返回 family 字符串，失败返回 null
 *   - Web：FontFace API 异步加载，load() 立即返回 null，字体就绪后 get() 才有值
 *   - 两端均推荐用 preload() + 回调方式，确保字体完全就绪再绘制
 *   - path 不支持网络 URL；如需网络字体，先用 KwaiNetwork.downloadFile 下载到本地
 *   - 建议统一用 .ttf 格式，安卓部分机型对 .otf 兼容性差
 */

(function () {

  var AIGCUtils = window.AIGCUtils = window.AIGCUtils || {};
  var _isKwai = typeof ks !== 'undefined';
  var _canvas = null;
  var _gl     = null;

  function init() {
    if (_canvas) return;

    if (_isKwai) {
      _canvas = ks.createCanvas();
      _gl     = _canvas.getContext('webgl');

      var info = ks.getSystemInfoSync();
      var dpr  = info.pixelRatio || 1;
      _canvas.width  = info.windowWidth  * dpr;
      _canvas.height = info.windowHeight * dpr;
      _gl.viewport(0, 0, _canvas.width, _canvas.height);
      console.log('[KwaiRender] 初始化完成', _canvas.width, 'x', _canvas.height, 'dpr:', dpr);
      return;
    }

    // Web 降级
    _canvas = document.getElementById('gameCanvas') || document.createElement('canvas');
    if (!_canvas.parentNode) {
      _canvas.style.display = 'block';
      document.body.appendChild(_canvas);
    }
    var dpr = window.devicePixelRatio || 1;
    var w   = window.innerWidth;
    var h   = window.innerHeight;
    _canvas.width  = w * dpr;
    _canvas.height = h * dpr;
    _canvas.style.width  = w + 'px';
    _canvas.style.height = h + 'px';
    _gl = _canvas.getContext('webgl');
    _gl.viewport(0, 0, _canvas.width, _canvas.height);
    console.log('[KwaiRender] 初始化完成（Web）', _canvas.width, 'x', _canvas.height, 'dpr:', dpr);
  }

  function createOffscreenCanvas(width, height) {
    if (_isKwai) {
      var offscreen = ks.createCanvas();
      offscreen.width  = width  || 512;
      offscreen.height = height || 512;
      return offscreen;
    }
    // Web 降级
    var el = document.createElement('canvas');
    el.width  = width  || 512;
    el.height = height || 512;
    return el;
  }

  function loadImage(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    // ks-adapter.js 已将 Image 适配为 ks.createImage()，两端统一用 new Image()
    var img = _isKwai ? ks.createImage() : new Image();
    img.onload  = function () { onSuccess(img); };
    img.onerror = function (err) {
      console.warn('[KwaiRender] 图片加载失败', options.src, err);
      onFail(err);
    };
    // 本地相对路径 → 真实加载地址（CDN 化前后对玩法代码透明），hook 在此一处完成
    if (AIGCUtils.ResourceLoader) {
      AIGCUtils.ResourceLoader.resolve(options.src, function (realSrc) { img.src = realSrc; });
    } else {
      img.src = options.src;
    }
    return img;
  }

  function setPreferredFramesPerSecond(fps) {
    if (_isKwai && typeof ks.setPreferredFramesPerSecond === 'function') {
      ks.setPreferredFramesPerSecond(fps || 60);
    }
    // Web 环境无需设置，requestAnimationFrame 自动按屏幕刷新率运行
  }

  // ==================================================================
  //  Font 模块 — 自定义字体加载与管理
  // ==================================================================

  var _fontCache = {};   // alias/path -> family 字符串

  /**
   * 加载单个字体文件（同步快手 / 异步 Web）
   *
   * @param {string}   path    字体文件路径（代码包路径或本地路径，不支持网络 URL）
   * @param {string}   [alias] 别名，后续通过 Font.get(alias) 取 family；缺省用 path 作 key
   * @param {Function} [onLoad]   字体就绪回调 function(family)，快手同步触发，Web 异步触发
   * @param {Function} [onError]  加载失败回调 function(err)
   * @returns {string|null}  快手环境同步返回 family；Web 环境返回 null（异步加载中）
   */
  function fontLoad(path, alias, onLoad, onError) {
    var key = alias || path;
    onLoad  = onLoad  || function () {};
    onError = onError || function () {};

    // 已缓存，直接返回
    if (_fontCache[key]) {
      onLoad(_fontCache[key]);
      return _fontCache[key];
    }

    if (_isKwai) {
      // 快手：同步加载
      var family = ks.loadFont(path);
      if (family) {
        _fontCache[key] = family;
        if (alias && alias !== path) _fontCache[path] = family;
        console.log('[KwaiRender.Font] 加载成功', path, '->', family);
        onLoad(family);
        return family;
      } else {
        console.warn('[KwaiRender.Font] 加载失败', path, '（检查路径/格式）');
        onError(new Error('loadFont returned null: ' + path));
        return null;
      }
    }

    // Web 降级：FontFace API（异步）
    if (typeof FontFace === 'undefined') {
      console.warn('[KwaiRender.Font] 浏览器不支持 FontFace API，跳过字体加载', path);
      onError(new Error('FontFace not supported'));
      return null;
    }

    var family = key.replace(/[^a-zA-Z0-9_-]/g, '-');  // 生成合法 family 名
    var face = new FontFace(family, 'url(' + path + ')');
    face.load().then(function (loadedFace) {
      document.fonts.add(loadedFace);
      _fontCache[key] = family;
      if (alias && alias !== path) _fontCache[path] = family;
      console.log('[KwaiRender.Font] 加载成功（Web）', path, '->', family);
      onLoad(family);
    }).catch(function (err) {
      console.warn('[KwaiRender.Font] 加载失败（Web）', path, err);
      onError(err);
    });

    return null;  // Web 异步，暂时返回 null
  }

  /**
   * 批量预加载字体，全部完成后触发 onAllLoaded
   *
   * @param {Array<{alias: string, path: string}>} list  字体列表
   * @param {Function} [onAllLoaded]  所有字体加载完成（含失败项）后的回调
   *
   * 用法：
   *   KwaiRender.Font.preload([
   *     { alias: 'title',  path: 'fonts/title.ttf' },
   *     { alias: 'number', path: 'fonts/number.ttf' },
   *   ], function() { startGame(); });
   */
  function fontPreload(list, onAllLoaded) {
    onAllLoaded = onAllLoaded || function () {};
    if (!list || list.length === 0) { onAllLoaded(); return; }

    var total   = list.length;
    var settled = 0;

    function onSettled() {
      settled++;
      if (settled >= total) onAllLoaded();
    }

    for (var i = 0; i < list.length; i++) {
      (function (item) {
        fontLoad(item.path, item.alias, onSettled, onSettled);
      })(list[i]);
    }
  }

  /**
   * 获取已加载字体的 family 名（用于 WebGL 文本纹理）
   *
   * @param {string} aliasOrPath  加载时使用的 alias 或 path
   * @returns {string|null}  已加载返回 family 字符串，未加载返回 null
   *
   * 用法：
   *   createTextTexture(gl, KwaiRender.Font.get('title') || 'sans-serif', 'Title');
   */
  function fontGet(aliasOrPath) {
    return _fontCache[aliasOrPath] || null;
  }

  window.KwaiRender = {
    get canvas() { return _canvas; },
    get gl()     { return _gl; },
    init:                       init,
    createOffscreenCanvas:      createOffscreenCanvas,
    loadImage:                  loadImage,
    setPreferredFramesPerSecond: setPreferredFramesPerSecond,
    loadFont:     fontLoad,
    preloadFonts: fontPreload,
    getFont:      fontGet,
  };

})();

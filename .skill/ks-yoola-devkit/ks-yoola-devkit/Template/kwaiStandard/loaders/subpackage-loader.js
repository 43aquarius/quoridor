/**
 * subpackage-loader.js — 分包加载器（标准库）
 *
 * 职责：
 *   ① 管理子包的按需加载（deferred load）
 *   ② 并行预加载不影响首帧的子包（parallelPreloadSubpackages）
 *   ③ 防重复加载（已加载的子包直接复用）
 *   ④ 双端适配（快手端 KwaiSubpackage / H5 浏览器静默跳过）
 *
 * 依赖：
 *   - kwaiOpenApi/kwai-subpackage.js（快手环境）
 *   - gameplay/kwai-event-bus.js（可选，加载完成后触发事件）
 *
 * 使用方式：
 *
 *   // 按需加载单个子包（关卡切换时调用）
 *   AIGCUtils.SubpackageLoader.load('level-2', {
 *     onProgress: function (p) { },  // p 为 0~1
 *     onSuccess:  function ()  { startLevel2(); },
 *     onFail:     function (e) { console.error(e); },
 *   });
 *
 *   // 并行预加载（不影响首帧，后台静默加载）
 *   // game.json 中配置 parallelPreloadSubpackages 后，在应用初始化末尾调用一次：
 *   AIGCUtils.SubpackageLoader.parallelPreload();
 *
 *   // 检查是否已加载
 *   AIGCUtils.SubpackageLoader.isLoaded('level-2'); // 返回 true / false
 */
(function () {
  var AIGCUtils = window.AIGCUtils = window.AIGCUtils || {};

  // 已加载子包 Set（name → true）
  var _loaded = {};
  // 加载中 Promise（name → Promise）
  var _pending = {};

  /**
   * 加载单个子包（防重复，返回 Promise）
   * @param {string} name  子包 name（与 game.json subpackages[].name 一致）
   * @param {object} [opts] { onProgress, onSuccess, onFail }
   */
  function load(name, opts) {
    opts = opts || {};

    // 已加载：直接回调
    if (_loaded[name]) {
      if (opts.onSuccess) opts.onSuccess();
      return Promise.resolve();
    }

    // 加载中：复用同一个 Promise，不重复发起
    if (_pending[name]) {
      return _pending[name].then(function () {
        if (opts.onSuccess) opts.onSuccess();
      }, function (e) {
        if (opts.onFail) opts.onFail(e);
      });
    }

    // H5 浏览器环境（无 KwaiSubpackage）：静默跳过
    if (typeof KwaiSubpackage === 'undefined') {
      _loaded[name] = true;
      if (opts.onSuccess) opts.onSuccess();
      return Promise.resolve();
    }

    var promise = new Promise(function (resolve, reject) {
      KwaiSubpackage.load({
        name: name,
        onProgress: function (res) {
          if (opts.onProgress) opts.onProgress(res.progress || 0);
        },
        onSuccess: function () {
          _loaded[name] = true;
          delete _pending[name];
          // 发布加载完成事件（如 KwaiEvent 已存在）
          if (window.KwaiEvent) {
            window.KwaiEvent.emit('subpackage:loaded', { name: name });
          }
          resolve();
        },
        onFail: function (e) {
          delete _pending[name];
          reject(e);
        },
      });
    });

    _pending[name] = promise;

    return promise.then(function () {
      if (opts.onSuccess) opts.onSuccess();
    }, function (e) {
      if (opts.onFail) opts.onFail(e);
    });
  }

  /**
   * 并行预加载 game.json 中 parallelPreloadSubpackages 配置的子包。
   * 在首帧渲染完成、主循环启动后调用一次，后台静默加载，不阻塞运行。
   *
   * game.json 配置格式：
   * {
   *   "parallelPreloadSubpackages": [
   *     { "name": "sub1" },
   *     { "name": "sub2" }
   *   ]
   * }
   */
  function parallelPreload() {
    // 快手环境：从 game.json 读 parallelPreloadSubpackages（由平台注入到全局）
    var cfg = (typeof __gameConfig !== 'undefined' && __gameConfig.parallelPreloadSubpackages) || [];
    if (!cfg.length) return;

    for (var i = 0; i < cfg.length; i++) {
      (function (name) {
        load(name, {
          onSuccess: function () {
            console.log('[SubpackageLoader] 预加载完成: ' + name);
          },
          onFail: function (e) {
            console.warn('[SubpackageLoader] 预加载失败: ' + name, e);
          },
        });
      })(cfg[i].name);
    }
  }

  /**
   * 检查子包是否已加载
   * @param {string} name
   * @returns {boolean}
   */
  function isLoaded(name) {
    return !!_loaded[name];
  }

  AIGCUtils.SubpackageLoader = {
    load: load,
    parallelPreload: parallelPreload,
    isLoaded: isLoaded,
  };
})();

/**
 * kwai-subpackage.js — 快手应用分包加载模块
 *
 * 使用方式：
 *   KwaiSubpackage.load({
 *     name:       'level2',
 *     onProgress: function(res) { console.log(res.progress + '%'); },
 *     onSuccess:  function(res) { console.log('分包路径', res.path); enterLevel2(); },
 *     onFail:     function(err) { console.warn(err.code, err.errorMsg); },
 *   });
 *
 * 说明：
 *   name 为 game.json 中配置的分包名称
 *   onProgress 回调参数 res: { progress, totalBytesWritten, totalBytesExpectedToWrite }
 */

(function () {

  function load(options) {
    options = options || {};
    var onSuccess  = options.onSuccess  || function () {};
    var onFail     = options.onFail     || function () {};
    var onProgress = options.onProgress || null;

    if (typeof ks === 'undefined') {
      console.warn('[KwaiSubpackage] 非快手环境，跳过 loadSubpackage');
      onFail({ code: -1, errorMsg: '非快手环境' });
      return;
    }

    var task = ks.loadSubpackage({
      name: options.name,
      success: function (res) {
        console.log('[KwaiSubpackage] 分包加载完成 name:', options.name, 'path:', res.path);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiSubpackage] 分包加载失败 name:', options.name, err.code, err.errorMsg);
        onFail(err);
      },
    });

    if (onProgress && task) {
      task.onProgressUpdate(onProgress);
    }

    return task;
  }

  window.KwaiSubpackage = {
    load: load,
  };

})();

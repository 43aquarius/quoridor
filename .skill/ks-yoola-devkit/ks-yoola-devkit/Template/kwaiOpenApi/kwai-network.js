/**
 * kwai-network.js — 快手端网络请求模块（仅downloadFile）
 *
 * 快手环境：使用 ks.downloadFile
 * Web 环境：使用 fetch 降级为 Blob URL
 *
 * 使用方式：
 *   KwaiNetwork.downloadFile({
 *     url:       'https://cdn.example.com/patch.zip',
 *     // filePath: ks.env.USER_DATA_PATH + '/patch.zip', // 不传时使用临时路径
 *     onSuccess: function(res) { console.log(res.filePath || res.tempFilePath); },
 *     onFail:    function(err) {},
 *   });
 */

(function () {

  var _isKwai = typeof ks !== 'undefined';

  // ─── downloadFile ─────────────────────────────────────────

  function downloadFile(options) {
    options = options || {};
    var onSuccess  = options.onSuccess  || function () {};
    var onFail     = options.onFail     || function () {};
    var onProgress = options.onProgress || null;

    if (_isKwai) {
      var downloadOptions = {
        url:    options.url,
        header: options.header || {},
        success: function (res) {
          console.log('[KwaiNetwork] 下载完成', res.filePath || res.tempFilePath);
          onSuccess(res);
        },
        fail: function (err) {
          console.warn('[KwaiNetwork] 下载失败', options.url, err);
          onFail(err);
        },
      };
      if (options.filePath) downloadOptions.filePath = options.filePath;
      var task = ks.downloadFile(downloadOptions);
      if (onProgress && task) task.onProgressUpdate(onProgress);
      return task;
    }

    // Web 降级：fetch → Blob URL
    fetch(options.url, { headers: options.header || {} })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var tempFilePath = URL.createObjectURL(blob);
        console.log('[KwaiNetwork] 下载完成（Web）', tempFilePath);
        onSuccess({ tempFilePath: tempFilePath, statusCode: 200 });
      })
      .catch(function (err) {
        console.warn('[KwaiNetwork] 下载失败', options.url, err.message);
        onFail({ errMsg: err.message || 'download failed' });
      });
  }

  window.KwaiNetwork = {
    downloadFile: downloadFile,
  };

})();

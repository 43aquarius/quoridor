/**
 * kwai-file.js — 快手应用文件系统模块（支持 Web 降级）
 *
 * 快手环境：使用 ks.getFileSystemManager() 操作沙盒文件系统
 * Web 环境：
 *   - readSync / existsSync 等持久化操作在 Web 无等价，安静降级（warn + 返回空值）
 *   - saveFile 在 Web 环境触发浏览器下载（通过 URL.createObjectURL + <a> 标签）
 *
 * 使用方式：
 *   // 读文件（同步，仅快手）
 *   var content = KwaiFile.readSync('path/to/file.txt', 'utf8');
 *
 *   // 写文件（同步，仅快手）
 *   KwaiFile.writeSync('path/to/file.txt', 'hello', 'utf8');
 *
 *   // 追加内容（同步，仅快手）
 *   KwaiFile.appendSync('path/to/file.txt', '\nworld', 'utf8');
 *
 *   // 保存临时文件到用户目录 / Web 触发下载
 *   KwaiFile.saveFile({
 *     tempPath:  res.tempFilePath,        // 快手：临时路径；Web：Blob URL 或 Blob 对象
 *     fileName:  'result.png',            // Web 下载时的文件名
 *     onSuccess: function(savedPath) {},
 *     onFail:    function(err) {},
 *   });
 *
 *   // 获取用户数据根目录（仅快手有意义）
 *   var root = KwaiFile.userDataPath;
 *
 * 注意：
 *   所有快手持久化文件须存放在 ks.env.USER_DATA_PATH 目录下
 *   单 key 数据上限 1MB，总存储上限 10MB
 */

(function () {

  var _isKwai = typeof ks !== 'undefined';
  var userDataPath = _isKwai ? ks.env.USER_DATA_PATH : '';
  var fs = _isKwai ? ks.getFileSystemManager() : null;

  // ─── 同步文件操作（仅快手） ─────────────────────────────────

  function readSync(filePath, encoding) {
    if (!_isKwai) {
      console.warn('[KwaiFile] 非快手环境，readSync 不可用');
      return '';
    }
    return fs.readFileSync(filePath, encoding || 'utf8');
  }

  function writeSync(filePath, data, encoding) {
    if (!_isKwai) {
      console.warn('[KwaiFile] 非快手环境，writeSync 不可用');
      return;
    }
    fs.writeFileSync(filePath, data, encoding || 'utf8');
  }

  function appendSync(filePath, data, encoding) {
    if (!_isKwai) {
      console.warn('[KwaiFile] 非快手环境，appendSync 不可用');
      return;
    }
    fs.appendFileSync(filePath, data, encoding || 'utf8');
  }

  function removeSync(filePath) {
    if (!_isKwai) {
      console.warn('[KwaiFile] 非快手环境，removeSync 不可用');
      return;
    }
    fs.unlinkSync(filePath);
  }

  function existsSync(filePath) {
    if (!_isKwai) {
      console.warn('[KwaiFile] 非快手环境，existsSync 不可用');
      return false;
    }
    try {
      fs.accessSync(filePath);
      return true;
    } catch (e) {
      return false;
    }
  }

  function mkdirSync(dirPath, recursive) {
    if (!_isKwai) {
      console.warn('[KwaiFile] 非快手环境，mkdirSync 不可用');
      return;
    }
    fs.mkdirSync(dirPath, recursive !== false);
  }

  function readdirSync(dirPath) {
    if (!_isKwai) {
      console.warn('[KwaiFile] 非快手环境，readdirSync 不可用');
      return [];
    }
    return fs.readdirSync(dirPath);
  }

  // ─── saveFile（快手保存 / Web 触发浏览器下载） ──────────────

  function saveFile(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (_isKwai) {
      fs.saveFile({
        tempFilePath: options.tempPath,
        filePath:     options.destPath || undefined,
        success: function (res) {
          console.log('[KwaiFile] 文件已保存', res.savedFilePath);
          onSuccess(res.savedFilePath);
        },
        fail: function (err) {
          console.warn('[KwaiFile] 保存失败', err);
          onFail(err);
        },
      });
      return;
    }

    // Web 降级：触发浏览器文件下载
    try {
      var url = options.tempPath;
      if (!(typeof url === 'string' && url.indexOf('blob:') === 0)) {
        // 如果传入的是 Blob / ArrayBuffer，创建 Object URL
        if (options.tempPath instanceof Blob || options.tempPath instanceof ArrayBuffer) {
          var blob = options.tempPath instanceof Blob
            ? options.tempPath
            : new Blob([options.tempPath]);
          url = URL.createObjectURL(blob);
        }
      }
      var a = document.createElement('a');
      a.href     = url;
      a.download = options.fileName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      console.log('[KwaiFile] Web 环境触发下载', url);
      onSuccess(url);
    } catch (e) {
      console.warn('[KwaiFile] Web 下载失败', e);
      onFail({ errMsg: e.message || 'web download failed' });
    }
  }

  window.KwaiFile = {
    userDataPath: userDataPath,
    fs:           fs,
    readSync:     readSync,
    writeSync:    writeSync,
    appendSync:   appendSync,
    removeSync:   removeSync,
    existsSync:   existsSync,
    mkdirSync:    mkdirSync,
    readdirSync:  readdirSync,
    saveFile:     saveFile,
  };

})();

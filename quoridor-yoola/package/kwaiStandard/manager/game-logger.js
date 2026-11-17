/**
 * game-logger.js — 重要日志输出模块（标准库）
 *
 * 职责：
 *   ① 初始化后挂钩 console，按 _isRelease（正式/开发版）区分日志行为
 *   ② 开发版（_isRelease=false）：全部日志（log/info/warn/error/touch）
 *      一律带前缀输出，便于调试和回捞测试
 *   ③ 正式版（_isRelease=true）：仅重要日志（warn/error/touch）带前缀，
 *      普通日志（log/info）直通输出不带前缀，回捞时不会被提取
 *   ④ Hook ks.onError 捕获运行时未处理异常，始终带前缀输出
 *   ⑤ 双端兼容（快手端 / H5 浏览器）
 *
 * 依赖：无（标准库基础模块，其他 kwaiStandard/ 及 gameplay/ 文件均可调用）
 *
 * 前缀格式：|AIGC:ModuleName|T:GameName|D:
 *   M = 模块名称（如 "Runtime"、"UI.Button"、"Game.Score"）
 *   T = 项目名称（由 init 传入，作为 EMAS 回捞时的筛选关键字）
 *   D = 日志数据
 *
 * 使用方式：
 *
 *   // 应用初始化时调用一次（建议在 game.js 模块 require 之后、业务初始化之前调用）
 *   AIGCUtils.GameLogger.init('我的应用', 'ks1234567890');
 *
 *   // 报错 — 带前缀输出，回捞时可提取
 *   console.error('UI.Button', '按钮初始化失败', { btnId: 'restart' });
 *
 *   // 点击事件 — 带前缀输出，回捞时可提取
 *   console.touch('UI.Button', '用户点击开始按钮');
 *
 *   // 警告 — 带前缀输出，回捞时可提取
 *   console.warn('Game.Score', '分数异常', { score: 99999 });
 *
 *   // 普通日志 — 直通输出，不带前缀，回捞时不会被提取
 *   console.log('Game', '每帧更新');   // → 正常输出，但回捞筛选不到
 *   console.info('Render', '绘制完成'); // → 正常输出，但回捞筛选不到
 *
 * === 日志输出规则 ===
 *
 * | 版本     | log/info                     | warn/error/touch               |
 * |----------|------------------------------|--------------------------------|
 * | 开发版   | 带前缀输出（调试 + 回捞测试）   | 带前缀输出                      |
 * | 正式版   | 直通输出，不带前缀（回捞不提取） | 带前缀输出（回捞可提取）          |
 *
 * 开发者应在代码中主动使用 console.error / console.touch 标记重要事件，
 * 使其在正式版中带上标准化前缀，从而在 EMAS 回捞时被筛选提取。
 */
(function () {
  var AIGCUtils = window.AIGCUtils = window.AIGCUtils || {};

  var _gameName = '';
  var _appid = '';
  var _isRelease = false;
  var _isHooked = false;
  var _originalConsole = {};

  /**
   * 初始化日志模块（应用启动时调用一次）
   * @param {string} gameName 项目名称（用于 EMAS 回捞时按 T:GameName 筛选）
   * @param {string} appid   应用 AppID
   */
  function init(gameName, appid) {
    _gameName = gameName || '';
    _appid = appid || '';

    // 保存原始 console 引用（必须在 hook 前保存）
    _originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error
    };

    _initReleaseStatus();
    _hookConsole();
    _hookError();
  }

  /**
   * 判断是否正式版本
   * 通过 ks.getSystemInfoSync() 读取 host.version：
   *   0.0.1 → 开发版 / 预览版
   *   其他  → 正式版本
   */
  function _initReleaseStatus() {
    try {
      var systemInfo = window.ks.getSystemInfoSync();
      var hostVersion = systemInfo && systemInfo.host && systemInfo.host.version;
      _isRelease = hostVersion !== '0.0.1';
    } catch (e) {
      // H5 或无 ks 环境：默认按开发版处理
      _isRelease = false;
    }
  }

  /**
   * Hook Console — 区分重要/普通日志，行为受 _isRelease 控制：
   *
   *   开发版（_isRelease = false）：
   *     所有日志（log/info/warn/error/touch）一律带前缀输出，便于调试和回捞测试。
   *
   *   正式版（_isRelease = true）：
   *     重要日志（warn/error/touch）带前缀输出，回捞时会被提取；
   *     普通日志（log/info）直通原始 console，不带前缀，回捞时不会被提取。
   */
  function _hookConsole() {
    if (_isHooked) return;
    _isHooked = true;

    if (!_isRelease) {
      // ── 开发版：全量带前缀输出 ──
      console.log = function (moduleName) {
        var args = Array.prototype.slice.call(arguments, 1);
        _originalConsole.log.apply(console, [_createPrefix(moduleName)].concat(args));
      };
      console.info = function (moduleName) {
        var args = Array.prototype.slice.call(arguments, 1);
        _originalConsole.info.apply(console, [_createPrefix(moduleName)].concat(args));
      };
      console.warn = function (moduleName) {
        var args = Array.prototype.slice.call(arguments, 1);
        _originalConsole.warn.apply(console, [_createPrefix(moduleName)].concat(args));
      };
      console.error = function (moduleName) {
        var args = Array.prototype.slice.call(arguments, 1);
        _originalConsole.error.apply(console, [_createPrefix(moduleName)].concat(args));
      };
      console.touch = function (moduleName) {
        var args = Array.prototype.slice.call(arguments, 1);
        _originalConsole.log.apply(console, [_createPrefix(moduleName)].concat(args));
      };
    } else {
      // ── 正式版：仅重要日志带前缀 ──
      console.log = function () {
        _originalConsole.log.apply(console, arguments);
      };
      console.info = function () {
        _originalConsole.info.apply(console, arguments);
      };
      console.warn = function (moduleName) {
        var args = Array.prototype.slice.call(arguments, 1);
        _originalConsole.warn.apply(console, [_createPrefix(moduleName)].concat(args));
      };
      console.error = function (moduleName) {
        var args = Array.prototype.slice.call(arguments, 1);
        _originalConsole.error.apply(console, [_createPrefix(moduleName)].concat(args));
      };
      console.touch = function (moduleName) {
        var args = Array.prototype.slice.call(arguments, 1);
        _originalConsole.log.apply(console, [_createPrefix(moduleName)].concat(args));
      };
    }
  }

  /**
   * Hook ks.onError 捕获运行时未处理异常
   * 格式：|M:Runtime|T:GameName|D:{serializedError}
   */
  function _hookError() {
    if (typeof ks === 'undefined' || typeof ks.onError !== 'function') return;

    ks.onError(function (error) {
      var logMessage = '|M:Runtime|T:' + _gameName + '|D:';
      var errorString = _serializeError(error);
      _originalConsole.error(logMessage, errorString);
    });
  }

  /**
   * 序列化错误对象为 JSON 字符串
   * 兼容 Error 实例、普通对象、原始类型
   */
  function _serializeError(error) {
    try {
      if (error instanceof Error) {
        return JSON.stringify({
          name: error.name || 'Error',
          message: error.message || '',
          stack: error.stack || ''
        });
      }
      if (typeof error === 'object' && error !== null) {
        var obj = {};
        for (var k in error) {
          if (error.hasOwnProperty(k)) {
            obj[k] = error[k];
          }
        }
        obj.message = obj.message || error.message || '';
        obj.stack = obj.stack || error.stack || '';
        return JSON.stringify(obj);
      }
      return JSON.stringify({ message: String(error), stack: '' });
    } catch (e) {
      return JSON.stringify({ message: String(error), stack: '' });
    }
  }

  /**
   * 创建标准化日志前缀
   * 格式：|M:ModuleName|T:GameName|D:
   */
  function _createPrefix(moduleName) {
    return '|AIGC:' + (moduleName || 'Unknown') + '|T:' + _gameName + '|D:';
  }

  /**
   * 日志等级映射（供外部调试用）
   * @param {number} logLevel 1=INFO, 2=WARN, 3=ERROR
   * @returns {string} 等级名称
   */
  function getLevelName(logLevel) {
    switch (logLevel) {
      case 1: return 'INFO';
      case 2: return 'WARN';
      case 3: return 'ERROR';
      default: return 'INFO';
    }
  }

  AIGCUtils.GameLogger = {
    init: init,
    getLevelName: getLevelName
  };
})();

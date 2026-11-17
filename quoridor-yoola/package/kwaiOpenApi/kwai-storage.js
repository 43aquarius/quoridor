/**
 * kwai-storage.js — 快手应用数据缓存模块（支持 Web 降级）
 *
 * 快手环境：使用 ks.setStorageSync / ks.getStorage 等 API
 * Web 环境：使用原生 localStorage 降级（ks-adapter 已将 localStorage 映射到 ks.Storage）
 *
 * 使用方式：
 *   // 同步读写（推荐小数据）
 *   KwaiStorage.setSync('player_level', 5);
 *   var level = KwaiStorage.getSync('player_level');
 *   KwaiStorage.removeSync('player_level');
 *   KwaiStorage.clearSync();
 *
 *   // 异步读写（推荐大对象）
 *   KwaiStorage.set({
 *     key:       'game_progress',
 *     data:      { level: 5, score: 1200 },
 *     onSuccess: function() {},
 *     onFail:    function(err) {},
 *   });
 *   KwaiStorage.get({
 *     key:       'game_progress',
 *     onSuccess: function(data) { console.log(data); },
 *     onFail:    function(err) {},
 *   });
 *
 * 注意：
 *   快手环境：单 key 数据上限 1MB，所有数据总上限 10MB
 *   Web 环境：受浏览器 localStorage 限制（通常 5MB）
 *   不支持 Function / Symbol / RegExp / 循环引用对象（两端均序列化为 JSON 字符串）
 */

(function () {

  var _isKwai = typeof ks !== 'undefined';

  // ─── Web 侧工具：JSON 序列化存入 localStorage ───────────────

  function _webSet(key, data) {
    try {
      localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
    } catch (e) {
      console.warn('[KwaiStorage] localStorage setItem 失败', key, e);
    }
  }

  function _webGet(key) {
    var raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return undefined;
    try { return JSON.parse(raw); } catch (e) { return raw; }
  }

  // ─── 同步 API ───────────────────────────────────────────────

  function setSync(key, data) {
    if (_isKwai) {
      ks.setStorageSync(key, data);
    } else {
      _webSet(key, data);
    }
  }

  function getSync(key) {
    if (_isKwai) return ks.getStorageSync(key);
    return _webGet(key);
  }

  function removeSync(key) {
    if (_isKwai) {
      ks.removeStorageSync(key);
    } else {
      localStorage.removeItem(key);
    }
  }

  function clearSync() {
    if (_isKwai) {
      ks.clearStorageSync();
    } else {
      localStorage.clear();
    }
  }

  // ─── 异步 API ──────────────────────────────────────────────

  function set(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (_isKwai) {
      ks.setStorage({
        key:  options.key,
        data: options.data,
        success: function () {
          console.log('[KwaiStorage] 写入成功 key:', options.key);
          onSuccess();
        },
        fail: function (err) {
          console.warn('[KwaiStorage] 写入失败 key:', options.key, err);
          onFail(err);
        },
      });
      return;
    }

    // Web 降级（异步模拟）
    try {
      _webSet(options.key, options.data);
      console.log('[KwaiStorage] 写入成功（Web）key:', options.key);
      setTimeout(onSuccess, 0);
    } catch (e) {
      console.warn('[KwaiStorage] 写入失败（Web）key:', options.key, e);
      onFail({ errMsg: e.message || 'localStorage setItem failed' });
    }
  }

  function get(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (_isKwai) {
      ks.getStorage({
        key: options.key,
        success: function (res) {
          console.log('[KwaiStorage] 读取成功 key:', options.key);
          onSuccess(res.data);
        },
        fail: function (err) {
          console.log('[KwaiStorage] 读取失败 key:', options.key, err);
          onFail(err);
        },
      });
      return;
    }

    // Web 降级（异步模拟）
    try {
      var data = _webGet(options.key);
      console.log('[KwaiStorage] 读取成功（Web）key:', options.key);
      setTimeout(function () { onSuccess(data); }, 0);
    } catch (e) {
      console.log('[KwaiStorage] 读取失败（Web）key:', options.key, e);
      onFail({ errMsg: e.message || 'localStorage getItem failed' });
    }
  }

  function remove(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (_isKwai) {
      ks.removeStorage({
        key: options.key,
        success: function () { onSuccess(); },
        fail:    function (err) { onFail(err); },
      });
      return;
    }

    // Web 降级
    try {
      localStorage.removeItem(options.key);
      setTimeout(onSuccess, 0);
    } catch (e) {
      onFail({ errMsg: e.message || 'localStorage removeItem failed' });
    }
  }

  window.KwaiStorage = {
    setSync:    setSync,
    getSync:    getSync,
    removeSync: removeSync,
    clearSync:  clearSync,
    set:        set,
    get:        get,
    remove:     remove,
  };

})();

/**
 * kwai-commonuse.js — 快手应用「设为常用」模块
 *
 * 使用方式：
 *   KwaiCommonUse.check({
 *     onSuccess: function(res) { if (res.isCommonUse) hideGuide(); else showGuide(); },
 *     onFail:    function(err) { console.warn(err.code, err.msg); },
 *   });
 *
 *   KwaiCommonUse.add({
 *     onSuccess: function() { console.log('已设为常用'); },
 *     onFail:    function(err) { console.warn(err.code, err.msg); },
 *   });
 *
 * 错误码说明：
 *   -10005  暂不支持该功能（iOS 或低版本容器）
 */

(function () {

  function add(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiCommonUse] 非快手环境，跳过 addCommonUse');
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    ks.addCommonUse({
      success: function (res) {
        console.log('[KwaiCommonUse] 设为常用成功', res);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiCommonUse] 设为常用失败', err.code, err.msg);
        onFail(err);
      },
    });
  }

  function check(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiCommonUse] 非快手环境，跳过 checkCommonUse');
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    ks.checkCommonUse({
      success: function (res) {
        console.log('[KwaiCommonUse] 查询结果 isCommonUse:', res.isCommonUse);
        if (res.isCommonUse) {
          onSuccess(res);
        } else {
          onFail(res);
        }
      },
      fail: function (err) {
        console.warn('[KwaiCommonUse] 查询失败', err.code, err.msg);
        onFail(err);
      },
    });
  }

  window.KwaiCommonUse = { add: add, check: check };

})();

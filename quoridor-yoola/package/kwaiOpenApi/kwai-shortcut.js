/**
 * kwai-shortcut.js — 快手应用「添加到桌面」模块
 *
 * 使用方式：
 *   // 检查是否已添加到桌面
 *   KwaiShortcut.check({
 *     onSuccess: function(res) { if (res.installed) hideGuide(); else showGuide(); },
 *     onFail:    function(err) {},
 *   });
 *
 *   // 添加到桌面
 *   KwaiShortcut.add({
 *     onSuccess: function() { console.log('已添加到桌面'); },
 *     onFail:    function(err) {},
 *   });
 *
 *   // 检查是否由桌面快捷方式启动
 *   var fromShortcut = KwaiShortcut.isFromShortcut();
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
      console.warn('[KwaiShortcut] 非快手环境，跳过 addShortcut');
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    ks.addShortcut({
      success: function (res) {
        console.log('[KwaiShortcut] 添加到桌面成功', res);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiShortcut] 添加到桌面失败', err.code, err.msg);
        onFail(err);
      },
    });
  }

  function check(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiShortcut] 非快手环境，跳过 checkShortcut');
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    ks.checkShortcut({
      success: function (res) {
        console.log('[KwaiShortcut] 桌面快捷方式状态 installed:', res.installed);
        if (res.installed) {
          onSuccess(res);
        } else {
          onFail(res);
        }
      },
      fail: function (err) {
        console.warn('[KwaiShortcut] 查询失败', err.code, err.msg);
        onFail(err);
      },
    });
  }

  function isFromShortcut() {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiShortcut] 非快手环境，跳过 isFromShortcut');
      return false;
    }
    return ks.isLaunchFromShortcut();
  }

  window.KwaiShortcut = {
    add:            add,
    check:          check,
    isFromShortcut: isFromShortcut,
  };

})();

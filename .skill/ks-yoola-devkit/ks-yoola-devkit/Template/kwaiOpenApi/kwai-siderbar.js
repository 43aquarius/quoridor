/**
 * kwai-siderbar.js — 快手应用「侧边栏」模块
 *
 * 使用方式：
 *   // 检查侧边栏是否可用
 *   KwaiSiderBar.checkAvailable({
 *     onAvailable:    function() { showGuide(); },
 *     onNotAvailable: function() { hideGuide(); },
 *     onFail:         function(err) {},
 *   });
 *
 *   // 跳转到侧边栏场景
 *   KwaiSiderBar.navigateToSidebar({
 *     onSuccess: function() {},
 *     onFail:    function(err) {},
 *   });
 *
 * 错误码说明：
 *   -10005   当前快手版本不支持
 *   -20041   触发频率过高
 *   -20042   应用未备案或尚未上线
 *   -20043   scene 非法
 */

(function () {

  function checkAvailable(options) {
    options = options || {};
    var onAvailable    = options.onAvailable    || function () {};
    var onNotAvailable = options.onNotAvailable || function () {};
    var onFail         = options.onFail         || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiSiderBar] 非快手环境，跳过 checkAvailable');
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    ks.checkSliderBarIsAvailable({
      success: function (res) {
        console.log('[KwaiSiderBar] 侧边栏可用状态:', res.available);
        if (res.available) {
          onAvailable(res);
        } else {
          onNotAvailable(res);
        }
      },
      fail: function (err) {
        console.warn('[KwaiSiderBar] 查询失败', err.code, err.msg);
        onFail(err);
      },
    });
  }

  function navigateToSidebar(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiSiderBar] 非快手环境，跳过 navigateToSidebar');
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    ks.navigateToScene({
      scene: 'sidebar',
      success: function (res) {
        console.log('[KwaiSiderBar] 跳转侧边栏成功', res);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiSiderBar] 跳转侧边栏失败', err.code, err.msg);
        onFail(err);
      },
    });
  }

  window.KwaiSiderBar = {
    checkAvailable:    checkAvailable,
    navigateToSidebar: navigateToSidebar,
  };

})();

/**
 * kwai-base.js — 快手应用基础生命周期模块
 *
 * 使用方式：
 *   // 获取冷启动参数
 *   var opts = KwaiBase.getLaunchOptions();
 *   console.log(opts.from, opts.query);
 *
 *   // 监听前后台切换
 *   KwaiBase.onShow(function(res) { console.log('回前台', res.from); });
 *   KwaiBase.onHide(function()    { console.log('进后台'); });
 *
 *   // 取消监听
 *   KwaiBase.offShow(callback);
 *   KwaiBase.offHide(callback);
 *
 *   // 主动退出当前应用
 *   KwaiBase.exit();
 *
 *   // 获取系统信息
 *   var info = KwaiBase.getSystemInfo();
 *   console.log(info.windowWidth, info.windowHeight, info.pixelRatio);
 */

(function () {

  function getLaunchOptions() {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiBase] 非快手环境，跳过 getLaunchOptions');
      return {};
    }
    return ks.getLaunchOptionsSync();
  }

  function onShow(callback) {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiBase] 非快手环境，跳过 onShow');
      return;
    }
    ks.onShow(callback);
  }

  function offShow(callback) {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiBase] 非快手环境，跳过 offShow');
      return;
    }
    ks.offShow(callback);
  }

  function onHide(callback) {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiBase] 非快手环境，跳过 onHide');
      return;
    }
    ks.onHide(callback);
  }

  function offHide(callback) {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiBase] 非快手环境，跳过 offHide');
      return;
    }
    ks.offHide(callback);
  }

  function exit() {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiBase] 非快手环境，跳过 exit');
      return;
    }
    ks.exitMiniProgram();
  }

  function getSystemInfo() {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiBase] 非快手环境，跳过 getSystemInfo');
      return {};
    }
    return ks.getSystemInfoSync();
  }

  window.KwaiBase = {
    getLaunchOptions: getLaunchOptions,
    onShow:           onShow,
    offShow:          offShow,
    onHide:           onHide,
    offHide:          offHide,
    exit:             exit,
    getSystemInfo:    getSystemInfo,
  };

})();

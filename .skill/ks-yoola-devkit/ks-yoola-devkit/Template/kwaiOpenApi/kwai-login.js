/**
 * kwai-login.js — 快手应用用户登录模块
 *
 * 使用方式（game.js）：
 *   KwaiLogin.init({
 *     onSuccess: function(openId) { startGame(openId); },
 *     onFail:    function()        { startGameAsGuest(); },
 *   });
 *
 * openId 获取说明：
 *   ks.login 仅返回临时 code，需由开发者服务器用 code 换取 openId。
 *   换取成功后建议调用 ks.setStorageSync('player_open_id', openId) 缓存。
 */

(function () {

  function init(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiLogin] 非快手环境，跳过登录');
      onSuccess('');
      return;
    }

    ks.checkSession({
      success: function () {
        console.log('[KwaiLogin] session 有效');
        var cachedOpenId = ks.getStorageSync('player_open_id') || '';
        onSuccess(cachedOpenId);
      },
      fail: function () {
        ks.login({
          success: function (res) {
            console.log('[KwaiLogin] 登录成功，code:', res.code);
            // TODO: 将 res.code 发给开发者服务器换取 openId
            // 换取成功后：ks.setStorageSync('player_open_id', openId)
            onSuccess('');
          },
          fail: function (err) {
            console.warn('[KwaiLogin] 登录失败，以游客态继续', err.errMsg);
            onFail();
          },
        });
      },
    });
  }

  window.KwaiLogin = { init: init };

})();

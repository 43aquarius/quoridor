/**
 * kwai-official.js — 快手官方账号关注模块
 *
 * 使用方式：
 *   // 检查是否已关注
 *   KwaiOfficial.checkFollow({
 *     accountType: 'MiniGameOfficialAccount',
 *     onFollow:    function() { hideGuide(); },
 *     onNotFollow: function() { showGuide(); },
 *     onFail:      function(err) {},
 *   });
 *
 *   // 打开用户主页（引导关注）
 *   KwaiOfficial.openProfile({
 *     accountType: 'MiniGameOfficialAccount',
 *     onSuccess:   function() {},
 *     onFail:      function(err) {},
 *   });
 *
 * accountType 合法值：
 *   'CPServiceAccount'         CP 服务号
 *   'MiniGameOfficialAccount'  快手官方账号
 *
 * errorCode 说明：
 *   1       成功
 *   -10005  暂不支持该功能
 */

(function () {

  function checkFollow(options) {
    options = options || {};
    var onFollow    = options.onFollow    || function () {};
    var onNotFollow = options.onNotFollow || function () {};
    var onFail      = options.onFail      || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiOfficial] 非快手环境，跳过 checkFollow');
      onFail({ errorCode: -1 });
      return;
    }

    ks.checkFollowState({
      accountType: options.accountType || 'MiniGameOfficialAccount',
      callback: function (result) {
        if (result.errorCode === 1) {
          console.log('[KwaiOfficial] 关注状态 hasFollow:', result.hasFollow);
          if (result.hasFollow) {
            onFollow(result);
          } else {
            onNotFollow(result);
          }
        } else {
          console.warn('[KwaiOfficial] 查询失败 errorCode:', result.errorCode);
          onFail(result);
        }
      },
    });
  }

  function openProfile(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiOfficial] 非快手环境，跳过 openProfile');
      onFail({ errorCode: -1 });
      return;
    }

    ks.openUserProfile({
      accountType: options.accountType || 'MiniGameOfficialAccount',
      callback: function (result) {
        if (result.errorCode === 1) {
          console.log('[KwaiOfficial] 打开主页成功');
          onSuccess(result);
        } else {
          console.warn('[KwaiOfficial] 打开主页失败 errorCode:', result.errorCode);
          onFail(result);
        }
      },
    });
  }

  window.KwaiOfficial = {
    checkFollow:  checkFollow,
    openProfile:  openProfile,
    ACCOUNT_TYPES: {
      CP:       'CPServiceAccount',
      OFFICIAL: 'MiniGameOfficialAccount',
    },
  };

})();

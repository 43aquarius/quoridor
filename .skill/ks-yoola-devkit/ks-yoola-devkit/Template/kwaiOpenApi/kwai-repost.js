/**
 * kwai-repost.js — 快手应用转发分享模块
 *
 * 使用方式：
 *   KwaiRepost.shareAppMessage({
 *     templateId: 'xxx',
 *     query:      { from: 'share', level: 5 },
 *     onSuccess:  function() { console.log('分享成功'); },
 *     onCancel:   function() { console.log('用户取消'); },
 *     onFail:     function(err) { console.warn(err.errMsg); },
 *   });
 *
 *   // 系统菜单「转发」（右上角「...」）自定义文案，注册一次即可全局生效
 *   KwaiRepost.registerSystemShare({
 *     title:    '快来挑战我！',
 *     imageUrl: 'https://cdn.example.com/cover.png', // 可留空
 *   });
 *
 * 说明：
 *   query 可传 object（自动拼成 query string）或字符串
 *   templateId 在快手平台后台配置
 */

(function () {

  function buildQuery(params) {
    if (!params) return '';
    if (typeof params === 'string') return params;
    return Object.keys(params)
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
  }

  function shareAppMessage(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onCancel  = options.onCancel  || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiRepost] 非快手环境，跳过 shareAppMessage');
      onFail({ errMsg: '非快手环境' });
      return;
    }

    ks.shareAppMessage({
      templateId: options.templateId || '',
      query:      buildQuery(options.query),
      success: function () {
        console.log('[KwaiRepost] 分享成功');
        onSuccess();
      },
      fail: function (err) {
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
          console.log('[KwaiRepost] 用户取消分享');
          onCancel();
        } else {
          console.warn('[KwaiRepost] 分享失败', err.errMsg);
          onFail(err);
        }
      },
    });
  }

  // 系统菜单「转发」回调（右上角「...」），注册后全局有效，使用最近一次设置的文案
  var _systemShareParams = { title: '快来挑战我！', imageUrl: '', query: '' };

  function registerSystemShare(options) {
    options = options || {};
    _systemShareParams = {
      title:    options.title    || _systemShareParams.title,
      imageUrl: options.imageUrl || _systemShareParams.imageUrl,
      query:    buildQuery(options.query) || _systemShareParams.query,
    };
    if (typeof ks === 'undefined' || !ks.onShareAppMessage) {
      console.warn('[KwaiRepost] 非快手环境，跳过系统转发注册');
      return;
    }
    ks.onShareAppMessage(function () {
      return {
        title:    _systemShareParams.title,
        imageUrl: _systemShareParams.imageUrl,
        query:    _systemShareParams.query,
      };
    });
  }

  // 获取启动时携带的分享参数（从转发消息进入应用时读取）
  function getLaunchQuery() {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiRepost] 非快手环境，跳过获取分享参数');
      return {};
    }
    var launchOptions = ks.getLaunchOptionsSync();
    return (launchOptions && launchOptions.query) || {};
  }

  window.KwaiRepost = {
    shareAppMessage:     shareAppMessage,
    registerSystemShare: registerSystemShare,
    getLaunchQuery:      getLaunchQuery,
    buildQuery:          buildQuery,
  };

})();

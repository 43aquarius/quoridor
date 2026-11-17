/**
 * kwai-game-community.js — 快手「内容社区」模块
 *
 * 使用方式：
 *   // 跳转内容社区
 *   KwaiGameCommunity.jumpToGameClub({
 *     onSuccess: function() {},
 *     onFail:    function(err) {},
 *   });
 *
 *   // 分享图片到内容社区
 *   KwaiGameCommunity.shareImage({
 *     path:      '/tmp/screenshot.png',
 *     mouldId:   'xxx',
 *     onSuccess: function() {},
 *     onFail:    function(err) {},
 *   });
 *
 *   // 选择相册视频并发布
 *   KwaiGameCommunity.chooseVideoAndPublish({
 *     type:      1,
 *     mouldId:   'xxx',
 *     onSuccess: function() {},
 *     onFail:    function(err) {},
 *   });
 *
 *   // 录制视频发布到内容社区
 *   KwaiGameCommunity.publishRecordVideo({
 *     video:     videoID,
 *     query:     'from=game',
 *     mouldId:   'xxx',
 *     onSuccess: function() {},
 *     onFail:    function(err) {},
 *   });
 *
 * 错误码说明：
 *   -10005    当前快手版本不支持
 *   -100010   内容社区未开通
 *
 * publishType 说明：
 *   1  仅发布到快手
 *   2  同时发布到快手和内容社区
 */

(function () {

  function jumpToGameClub(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiGameCommunity] 非快手环境，跳过 jumpToGameClub');
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    ks.jumpToGameClub({
      success: function (res) {
        console.log('[KwaiGameCommunity] 跳转内容社区成功', res);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiGameCommunity] 跳转内容社区失败', err.code, err.msg);
        onFail(err);
      },
    });
  }

  function shareImage(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiGameCommunity] 非快手环境，跳过 shareImage');
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    ks.shareImageToGameClub({
      path:    options.path,
      mouldId: options.mouldId,
      success: function (res) {
        console.log('[KwaiGameCommunity] 分享图片成功', res);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiGameCommunity] 分享图片失败', err.code, err.msg);
        onFail(err);
      },
    });
  }

  function chooseVideoAndPublish(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiGameCommunity] 非快手环境，跳过 chooseVideoAndPublish');
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    ks.chooseVideoAndPublish({
      type:    options.type,
      mouldId: options.mouldId,
      success: function (res) {
        console.log('[KwaiGameCommunity] 选视频发布成功', res);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiGameCommunity] 选视频发布失败', err.code, err.msg);
        onFail(err);
      },
    });
  }

  function publishRecordVideo(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiGameCommunity] 非快手环境，跳过 publishRecordVideo');
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    var recorder = ks.getGameRecorder();
    recorder.publishVideo({
      type:    options.type || 1,
      video:   options.video,
      query:   options.query || '',
      mouldId: options.mouldId,
      callback: function (error) {
        if (error) {
          console.warn('[KwaiGameCommunity] 发布录制视频失败', error.code, error.msg);
          onFail(error);
        } else {
          console.log('[KwaiGameCommunity] 发布录制视频成功');
          onSuccess();
        }
      },
    });
  }

  window.KwaiGameCommunity = {
    jumpToGameClub:        jumpToGameClub,
    shareImage:            shareImage,
    chooseVideoAndPublish: chooseVideoAndPublish,
    publishRecordVideo:    publishRecordVideo,
  };

})();

/**
 * kwai-record.js — 快手应用画面录制模块
 *
 * 使用方式：
 *   // 开始录制
 *   KwaiRecord.start();
 *
 *   // 停止录制
 *   KwaiRecord.stop();
 *
 *   // 暂停 / 恢复 / 中止
 *   KwaiRecord.pause();
 *   KwaiRecord.resume();
 *   KwaiRecord.abort();
 *
 *   // 监听录制事件
 *   KwaiRecord.on('start',  function() {});
 *   KwaiRecord.on('stop',   function(res) { var videoID = res.videoID; });
 *   KwaiRecord.on('pause',  function() {});
 *   KwaiRecord.on('resume', function() {});
 *   KwaiRecord.on('abort',  function() {});
 *   KwaiRecord.on('error',  function(res) { console.warn(res.error.code, res.error.msg); });
 *
 *   // 发布录制视频
 *   KwaiRecord.publishVideo({
 *     video:     videoID,
 *     query:     'from=game',
 *     mouldId:   'xxx',
 *     onSuccess: function() {},
 *     onFail:    function(err) {},
 *   });
 *
 * 说明：
 *   录制时长限制  3s ~ 300s
 *   录制需「普通模式」或「高性能+」，「超高性能」不支持
 */

(function () {

  var _recorder = null;

  function getRecorder() {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiRecord] 非快手环境，无法获取 recorder');
      return null;
    }
    if (!_recorder) {
      _recorder = ks.getGameRecorder();
    }
    return _recorder;
  }

  function start() {
    var r = getRecorder();
    if (!r) return;
    r.start();
  }

  function stop() {
    var r = getRecorder();
    if (!r) return;
    r.stop();
  }

  function pause() {
    var r = getRecorder();
    if (!r) return;
    r.pause();
  }

  function resume() {
    var r = getRecorder();
    if (!r) return;
    r.resume();
  }

  function abort() {
    var r = getRecorder();
    if (!r) return;
    r.abort();
  }

  function on(event, callback) {
    var r = getRecorder();
    if (!r) return;
    r.on(event, callback);
  }

  function publishVideo(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    var r = getRecorder();
    if (!r) {
      onFail({ code: -1, msg: '非快手环境' });
      return;
    }

    r.publishVideo({
      video:   options.video,
      query:   options.query   || '',
      mouldId: options.mouldId || '',
      callback: function (error) {
        if (error) {
          console.warn('[KwaiRecord] 发布失败', error.code, error.msg);
          onFail(error);
        } else {
          console.log('[KwaiRecord] 发布成功');
          onSuccess();
        }
      },
    });
  }

  window.KwaiRecord = {
    start:        start,
    stop:         stop,
    pause:        pause,
    resume:       resume,
    abort:        abort,
    on:           on,
    publishVideo: publishVideo,
    getRecorder:  getRecorder,
  };

})();

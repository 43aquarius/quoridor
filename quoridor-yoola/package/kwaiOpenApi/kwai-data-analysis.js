/**
 * kwai-data-analysis.js — 快手应用数据分析模块
 *
 * 使用方式：
 *   KwaiDataAnalysis.reportScene({
 *     sceneId:   7001,
 *     costTime:  500,
 *     dimension: { entry: 'ad' },
 *     metric:    { loadTime: '500' },
 *     onSuccess: function(res) { console.log('上报成功', res); },
 *     onFail:    function(err) { console.warn('上报失败', err); },
 *   });
 *
 * 参数说明：
 *   sceneId   number   场景 ID（由快手平台分配）
 *   costTime  number   耗时（ms，可选）
 *   dimension object   维度，值须为非空字符串，总长不超过 1024
 *   metric    object   指标，值须为数字型字符串，总长不超过 1024
 */

(function () {

  function reportScene(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiDataAnalysis] 非快手环境，跳过 reportScene');
      onFail({ errMsg: '非快手环境' });
      return;
    }

    ks.reportScene({
      sceneId:   options.sceneId,
      costTime:  options.costTime  || 0,
      dimension: options.dimension || {},
      metric:    options.metric    || {},
      success: function (res) {
        console.log('[KwaiDataAnalysis] 上报成功 sceneId:', options.sceneId, res);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiDataAnalysis] 上报失败 sceneId:', options.sceneId, err);
        onFail(err);
      },
    });
  }

  window.KwaiDataAnalysis = { reportScene: reportScene };

})();

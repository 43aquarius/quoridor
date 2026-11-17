/**
 * kwai-ad.js — 快手玩法广告统一管理
 * 广告位 ID 自动从 window.KwaiAdConfig 读取（由脚手架阶段写入 kwai-ad-config.js）。
 *
 * 使用方式（main.js 或项目入口）：
 *
 *   // 关卡失败 → 展示激励广告（复活/奖励）
 *   KwaiAd.showRewarded(
 *     function () { revivePlayer(); },   // 用户看完，发放奖励
 *     function () { confirmGameOver(); } // 用户中途关闭，不发奖励
 *   );
 *
 */

(function () {

  var _rewardedAd = null;
  // 当前激励视频回调（onClose 只在初始化时注册一次，这里保存「本次」回调引用。
  // 快手 onClose 是追加式监听：若每次 show 前重复注册，历史闭包会在同一次关闭时
  // 全部触发，导致看完一次广告重复领取 N 次 —— 已修复，勿回退）
  var _rewardedCb = { onRewarded: null, onCancel: null };

  function _config() {
    return (typeof KwaiAdConfig !== 'undefined' && KwaiAdConfig) || {};
  }

  var _PLACEHOLDER_AD_UNIT = {
    rewarded: '__REWARDED_AD_UNIT_ID__',
  };

  function _showPlaceholderAdToast() {
    var title = '我是一条广告～（yoola平台审核通过后会展示真实广告）';
    if (typeof ks !== 'undefined') {
      if (typeof KwaiUI !== 'undefined' && KwaiUI && KwaiUI.showToast) {
        KwaiUI.showToast({ title: title, icon: 'none' });
      }
      return;
    }
    if (typeof document !== 'undefined' && document.body) {
      var toast = document.createElement('div');
      toast.textContent = title;
      toast.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:99999;max-width:80%;padding:10px 16px;border-radius:8px;background:rgba(0,0,0,.75);color:#fff;font:14px/1.4 sans-serif;text-align:center;box-sizing:border-box;pointer-events:none;';
      document.body.appendChild(toast);
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 2500);
      return;
    }
    console.warn('[KwaiAd] ' + title);
  }

  function _isPlaceholderAdUnit(type, adUnitId) {
    if (!adUnitId || adUnitId !== _PLACEHOLDER_AD_UNIT[type]) return false;
    _showPlaceholderAdToast();
    return true;
  }

  function _initRewardedAd() {
    var adUnitId = _config().rewardedAdUnitId;
    if (_isPlaceholderAdUnit('rewarded', adUnitId)) {
      return;
    }
    if (typeof ks === 'undefined') {
      console.warn('[KwaiAd] 非快手环境，跳过激励广告初始化');
      return;
    }
    if (!adUnitId) return;
    _rewardedAd = ks.createRewardedVideoAd({ adUnitId: adUnitId });
    _rewardedAd.onError(function (err) {
      console.warn('[KwaiAd] 激励广告错误', err && err.errMsg);
    });
    // onClose 仅此一次注册；每次 show 只更新 _rewardedCb 引用
    _rewardedAd.onClose(function (res) {
      var cb = _rewardedCb;
      _rewardedCb = { onRewarded: null, onCancel: null };  // 触发后立即清空，防重复
      if (res && res.isEnded) { if (cb.onRewarded) cb.onRewarded(); }
      else { if (cb.onCancel) cb.onCancel(); }
    });
  }

  /**
   * 展示激励广告
   * @param {Function} onRewarded - 用户看完（isEnded=true），在此发放奖励
   * @param {Function} [onCancel] - 用户中途关闭（isEnded=false），不发奖励
   */
  function showRewarded(onRewarded, onCancel) {
    var adUnitId = _config().rewardedAdUnitId;
    if (_isPlaceholderAdUnit('rewarded', adUnitId) || typeof ks === 'undefined') {
      console.warn('[KwaiAd] 跳过展示，直接触发 onRewarded 回调');
      if (onRewarded) onRewarded({
        isEnded: true,
        count: 1,
      });
      return;
    }
    if (!_rewardedAd) {
      _initRewardedAd();
    }
    if (!_rewardedAd) {
      if (onCancel) onCancel();
      return;
    }

    _rewardedCb = { onRewarded: onRewarded || null, onCancel: onCancel || null };
    _rewardedAd.show();
  }

  window.KwaiAd = {
    showRewarded: showRewarded,
  };

})();

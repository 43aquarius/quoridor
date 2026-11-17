/**
 * kwai-ui.js — 快手应用原生 UI 模块
 *
 * 使用方式：
 *   // Toast 提示
 *   KwaiUI.showToast({ title: '保存成功', icon: 'success' });
 *   KwaiUI.hideToast();
 *
 *   // 模态对话框
 *   KwaiUI.showModal({
 *     title:   '提示',
 *     content: '确认退出应用？',
 *     onConfirm: function() { exitGame(); },
 *     onCancel:  function() {},
 *   });
 *
 *   // 加载中
 *   KwaiUI.showLoading({ title: '加载中' });
 *   KwaiUI.hideLoading();
 *
 *   // 操作菜单
 *   KwaiUI.showActionSheet({
 *     itemList: ['分享', '重新开始'],
 *     onSelect: function(index) { console.log('选了', index); },
 *   });
 *
 * icon 合法值：'success' | 'error' | 'loading' | 'none'
 * showToast 和 showLoading 同时只能显示一个，showLoading 需配对 hideLoading
 */

(function () {

  function showToast(options) {
    options = options || {};
    if (typeof ks === 'undefined') {
      console.warn('[KwaiUI] 非快手环境，跳过 showToast');
      return;
    }
    ks.showToast({
      title:    options.title    || '',
      icon:     options.icon     || 'none',
      image:    options.image    || undefined,
      duration: options.duration || 1500,
      mask:     options.mask     || false,
    });
  }

  function hideToast() {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiUI] 非快手环境，跳过 hideToast');
      return;
    }
    ks.hideToast({});
  }

  function showModal(options) {
    options = options || {};
    var onConfirm = options.onConfirm || function () {};
    var onCancel  = options.onCancel  || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiUI] 非快手环境，跳过 showModal');
      return;
    }

    ks.showModal({
      title:       options.title       || '',
      content:     options.content     || '',
      showCancel:  options.showCancel  !== false,
      cancelText:  options.cancelText  || '取消',
      confirmText: options.confirmText || '确定',
      success: function (res) {
        if (res.confirm) {
          onConfirm();
        } else if (res.cancel) {
          onCancel();
        }
      },
    });
  }

  function showLoading(options) {
    options = options || {};
    if (typeof ks === 'undefined') {
      console.warn('[KwaiUI] 非快手环境，跳过 showLoading');
      return;
    }
    ks.showLoading({
      title: options.title || '加载中',
      mask:  options.mask  || false,
    });
  }

  function hideLoading() {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiUI] 非快手环境，跳过 hideLoading');
      return;
    }
    ks.hideLoading({});
  }

  function showActionSheet(options) {
    options = options || {};
    var onSelect = options.onSelect || function () {};
    var onFail   = options.onFail   || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiUI] 非快手环境，跳过 showActionSheet');
      onFail({ errMsg: '非快手环境' });
      return;
    }

    ks.showActionSheet({
      itemList: options.itemList || [],
      success: function (res) {
        console.log('[KwaiUI] ActionSheet 选中:', res.tapIndex);
        onSelect(res.tapIndex);
      },
      fail: function (err) {
        console.log('[KwaiUI] ActionSheet 取消/失败', err);
        onFail(err);
      },
    });
  }

  window.KwaiUI = {
    showToast:       showToast,
    hideToast:       hideToast,
    showModal:       showModal,
    showLoading:     showLoading,
    hideLoading:     hideLoading,
    showActionSheet: showActionSheet,
  };

})();

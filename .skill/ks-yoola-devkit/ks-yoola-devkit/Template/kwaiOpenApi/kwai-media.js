/**
 * kwai-media.js — 快手应用 / Web 双端媒体模块（视频 + 音频 + 图片）
 *
 * 使用方式：
 *
 *   // 视频（快手 / Web 通用）
 *   KwaiMedia.Video.play('intro', {
 *     src:    'video/intro.mp4',
 *     width:  375,
 *     height: 667,
 *     onEnded: function() { KwaiMedia.Video.destroy('intro'); },
 *     onError: function() { KwaiMedia.Video.destroy('intro'); },
 *   });
 *
 *   // 视频背景 + canvas 叠加（underGameView，Web 端需传 canvas 参数）
 *   KwaiMedia.Video.play('bg', {
 *     src:            'video/bg.mp4',
 *     width:          750,
 *     height:         1334,
 *     underGameView:  true,
 *     canvas:         document.getElementById('gameCanvas'),
 *     loop:           true,
 *     muted:          true,
 *   });
 *
 *   // 音频
 *   KwaiMedia.Audio.playBgm('audio/bgm.mp3');
 *   KwaiMedia.Audio.playSfx('audio/click.mp3');
 *
 *   // 图片
 *   KwaiMedia.Image.load('res/Image/hero.png').then(function(img) { uploadTexture(gl, img); });
 *
 *   // 退出销毁
 *   KwaiMedia.destroyAll();
 */

(function () {

  var AIGCUtils = window.AIGCUtils = window.AIGCUtils || {};

  /**
   * 内部：本地相对路径 → 真实加载地址，统一走 ResourceLoader hook，对调用方透明。
   * @param {string} src
   * @param {Function} cb function (realSrc)
   */
  function _resolveSrc(src, cb) {
    if (AIGCUtils.ResourceLoader) {
      AIGCUtils.ResourceLoader.resolve(src, cb);
    } else {
      cb(src);
    }
  }

  // ==================================================================
  //  Video 模块（快手端 / Web 双环境适配）
  // ==================================================================

  var _videos = {};
  var _isKwai = typeof ks !== 'undefined' && ks.createVideo;
  var _videoEventMap = {
    loadeddata: 'onCandraw',
    play: 'onPlay',
    pause: 'onPause',
    ended: 'onEnded',
    error: 'onError',
    waiting: 'onWaiting',
    timeupdate: 'onTimeUpdate',
    progress: 'onProgress',
  };

  function _bindKwaiVideoEvents (video, options) {
    var events = ['onCandraw', 'onPlay', 'onPause', 'onStop', 'onTimeUpdate',
      'onEnded', 'onError', 'onWaiting', 'onProgress'];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (typeof options[ev] === 'function') video[ev](options[ev]);
    }
  }

  function _bindWebVideoEvents (videoEl, options) {
    for (var htmlEv in _videoEventMap) {
      if (_videoEventMap.hasOwnProperty(htmlEv)) {
        var cb = options[_videoEventMap[htmlEv]];
        if (typeof cb === 'function') {
          videoEl.addEventListener(htmlEv, (function (v, evName, fn) {
            return function () {
              // 元素已销毁：忽略残留事件（销毁/重置阶段的伪 error/ended 等）
              if (v.__destroyed) return;
              if (evName === 'timeupdate') {
                fn({ position: v.currentTime, duration: v.duration || 0 });
              } else if (evName === 'progress' && v.buffered.length > 0) {
                var end = v.buffered.end(v.buffered.length - 1);
                fn({ buffered: v.duration ? (end / v.duration * 100) : 0, duration: v.duration || 0 });
              } else if (evName === 'loadeddata') {
                fn(v.videoWidth / (v.videoHeight || 1));
              } else if (evName === 'error') {
                fn('video load error');
              } else {
                fn();
              }
            };
          })(videoEl, htmlEv, cb));
        }
      }
    }
  }

  function _validateVideo (options) {
    if (!options.src) { console.error('[KwaiMedia] src 是必填参数'); return false; }
    if (options.width === undefined) { console.error('[KwaiMedia] width 是必填参数'); return false; }
    if (options.height === undefined) { console.error('[KwaiMedia] height 是必填参数'); return false; }
    return true;
  }

  function _applyKwaiVideoProps (video, options) {
    if (options.x !== undefined) video.x = options.x;
    if (options.y !== undefined) video.y = options.y;
    if (options.width !== undefined) video.width = options.width;
    if (options.height !== undefined) video.height = options.height;
    if (options.poster !== undefined) video.poster = options.poster;
    if (options.initialTime !== undefined) video.initialTime = options.initialTime;
    if (options.objectFit !== undefined) video.objectFit = options.objectFit;
    if (options.backgroundColor !== undefined) video.backgroundColor = options.backgroundColor;
    if (options.autoplay !== undefined) video.autoplay = !!options.autoplay;
    if (options.loop !== undefined) video.loop = !!options.loop;
    if (options.muted !== undefined) video.muted = !!options.muted;
    if (options.underGameView !== undefined) video.underGameView = !!options.underGameView;
    // src 由 videoCreate 统一走 _resolveSrc 解析后赋值，此处不直接赋值，避免覆盖解析结果
  }

  function _applyWebVideoProps (videoEl, options) {
    videoEl.style.position = 'absolute';
    videoEl.style.left = (options.x || 0) + 'px';
    videoEl.style.top = (options.y || 0) + 'px';
    videoEl.style.width = options.width + 'px';
    videoEl.style.height = options.height + 'px';
    videoEl.style.display = 'block';
    if (options.objectFit) videoEl.style.objectFit = options.objectFit;
    if (options.backgroundColor !== undefined) videoEl.style.backgroundColor = options.backgroundColor;
    if (options.loop !== undefined) videoEl.loop = !!options.loop;
    if (options.autoplay !== undefined) videoEl.autoplay = !!options.autoplay;
    if (options.muted !== undefined) videoEl.muted = !!options.muted;
    if (options.poster !== undefined) videoEl.poster = options.poster;
    if (options.controls !== undefined) videoEl.controls = !!options.controls;

    // underGameView: video 在 canvas 之下，canvas 透明叠加
    if (options.underGameView) {
      videoEl.style.zIndex = '1';
      videoEl.style.pointerEvents = 'none';
    }
  }

  function _setupUnderGameView (videoEl, options) {
    if (_isKwai) return;
    var canvas = options.canvas;
    if (!canvas) { console.warn('[KwaiMedia] underGameView 需要提供 canvas 参数'); return; }
    // 只对齐 CSS 尺寸与层级，不覆写 canvas.width/height：
    // 物理像素尺寸（含 DPR）由上层统一管理（如 main.js resize），
    // 覆写会破坏 WebGL backing store 与 viewport 的一致性，导致 UI 缩放错乱。
    canvas.style.position = 'absolute';
    canvas.style.left = (options.x || 0) + 'px';
    canvas.style.top = (options.y || 0) + 'px';
    canvas.style.width = options.width + 'px';
    canvas.style.height = options.height + 'px';
    canvas.style.zIndex = '2';
    canvas.style.pointerEvents = 'auto';
  }

  function videoCreate (name, options) {
    options = options || {};
    if (!_validateVideo(options)) return null;
    if (_videos[name]) videoDestroy(name);

    var rawSrc = options.src;

    if (_isKwai) {
      // 快手运行环境
      var video = ks.createVideo(options);
      _bindKwaiVideoEvents(video, options);
      _applyKwaiVideoProps(video, options);
      _resolveSrc(rawSrc, function (realSrc) { video.src = realSrc; });
      _videos[name] = video;
      return video;
    }

    // Web 环境
    var container = options.container || document.body;
    var videoEl = document.createElement('video');
    _applyWebVideoProps(videoEl, options);
    _bindWebVideoEvents(videoEl, options);

    if (options.underGameView) _setupUnderGameView(videoEl, options);

    if (options.initialTime !== undefined) videoEl.currentTime = options.initialTime;
    _resolveSrc(rawSrc, function (realSrc) { videoEl.src = realSrc; });
    container.appendChild(videoEl);

    _videos[name] = videoEl;
    return videoEl;
  }

  function videoPlay (name, options) {
    var v = _videos[name];
    if (v) {
      try { v.play(); } catch (e) { console.error('[KwaiMedia] play 失败:', e); }
      return;
    }
    if (!options) { console.error('[KwaiMedia] play 首次调用缺少 options'); return; }
    v = videoCreate(name, options);
    if (!v) return;
    if (options.autoplay !== false) {
      try {
        setTimeout(() => {
          v.play();
        }, 10);
      } catch (e) { console.error('[KwaiMedia] play 失败:', e); }
    }
  }

  function videoPause (name) { var v = _videos[name]; if (v) try { v.pause(); } catch (e) { } }
  function videoResume (name) { var v = _videos[name]; if (v) try { v.play(); } catch (e) { } }

  function videoStop (name) {
    if (_isKwai) { var v = _videos[name]; if (v) try { v.stop(); } catch (e) { } }
    else { var v = _videos[name]; if (v) { v.pause(); v.currentTime = 0; } }
  }

  function videoSeek (name, time) {
    if (typeof time !== 'number' || time < 0) { console.warn('[KwaiMedia] seek 参数无效'); return; }
    var v = _videos[name];
    if (!v) return;
    if (_isKwai) { try { v.seek(time); } catch (e) { } }
    else { v.currentTime = time; }
  }

  function videoDestroy (name) {
    if (_isKwai) {
      var v = _videos[name]; if (v) { try { v.destroy(); } catch (e) { } }
    } else {
      var v = _videos[name];
      if (v) {
        // 先标记销毁，让残留事件监听失效（防止销毁阶段的伪回调进入业务流程）
        v.__destroyed = true;
        try { v.pause(); } catch (e) {}
        // 安全重置：removeAttribute + load 不会触发 error 事件；
        // 禁止 v.src = ''（空 src 会让浏览器异步抛出 error，污染旧回调）
        v.removeAttribute('src');
        try { v.load(); } catch (e) {}
        if (v.parentNode) v.parentNode.removeChild(v);
      }
    }
    delete _videos[name];
  }

  function videoDestroyAll () {
    for (var name in _videos) { if (_videos.hasOwnProperty(name)) videoDestroy(name); }
    _videos = {};
  }

  function videoGet (name) { return _videos[name] || null; }

  // ==================================================================
  //  Audio 模块（BGM 单例 + 音效池，快手 / Web 双端）
  // ==================================================================

  var _bgm = null;
  var _sfxPool = {};
  var _sfxCount = 0;
  var _sfxMax = 10;
  var _audioSettings = { bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.6, sfxVolume: 1.0 };

  function _createAudio () {
    if (_isKwai) {
      var a = ks.createInnerAudioContext();
      a.obeyMuteSwitch = false;
      return a;
    }
    return new Audio();
  }

  function _createSfxAudio () {
    if (_isKwai) {
      var a = ks.createInnerAudioContext();
      a.obeyMuteSwitch = true;
      return a;
    }
    return new Audio();
  }

  function _audioDestroy (a) {
    if (_isKwai) { a.destroy(); }
    else { a.pause(); a.src = ''; a.load(); }
  }

  function _getBgm () {
    if (_bgm) return _bgm;
    var a = _createAudio();
    a.loop = true;
    a.volume = _audioSettings.bgmVolume;
    _bgm = a;
    return a;
  }

  function audioPlayBgm (src) {
    var bgm = _getBgm();
    if (!_audioSettings.bgmEnabled) return;
    if (!src) { bgm.play(); return; }
    if (bgm.__rawSrc === src) { bgm.play(); return; }
    bgm.__rawSrc = src;
    _resolveSrc(src, function (realSrc) {
      if (bgm.__rawSrc !== src) return; // 期间已切换到其他 BGM，丢弃过期回调
      bgm.src = realSrc;
      bgm.play();
    });
  }

  function audioPauseBgm () { if (_bgm) _bgm.pause(); }
  function audioResumeBgm () { if (_bgm && _audioSettings.bgmEnabled) _bgm.play(); }
  function audioStopBgm () {
    if (_bgm) {
      _bgm.pause();
      if (_isKwai) { try { _bgm.seek(0); } catch (e) {} }
      else { _bgm.currentTime = 0; }
    }
  }

  function audioPlaySfx (src) {
    if (!_audioSettings.sfxEnabled) return;
    var a = _sfxPool[src];
    if (!a) {
      if (_sfxCount >= _sfxMax) {
        for (var k in _sfxPool) { if (_sfxPool.hasOwnProperty(k)) { _audioDestroy(_sfxPool[k]); delete _sfxPool[k]; _sfxCount--; break; } }
      }
      a = _createSfxAudio();
      a.volume = _audioSettings.sfxVolume;
      _sfxPool[src] = a;
      _sfxCount++;
      _resolveSrc(src, function (realSrc) {
        a.src = realSrc;
        if (_isKwai) { try { a.seek(0); } catch (e) {} }
        else { a.currentTime = 0; }
        a.play();
      });
      return;
    }
    if (_isKwai) { try { a.seek(0); } catch (e) {} }
    else { a.currentTime = 0; }
    a.play();
  }

  function audioSetBgmVolume (v) { _audioSettings.bgmVolume = v; if (_bgm) _bgm.volume = v; }
  function audioSetSfxVolume (v) { _audioSettings.sfxVolume = v; for (var k in _sfxPool) { if (_sfxPool.hasOwnProperty(k)) _sfxPool[k].volume = v; } }
  function audioSetBgmEnabled (e) { _audioSettings.bgmEnabled = e; e ? audioResumeBgm() : audioPauseBgm(); }
  function audioSetSfxEnabled (e) { _audioSettings.sfxEnabled = e; }

  function audioDestroyAll () {
    if (_bgm) { _audioDestroy(_bgm); _bgm = null; }
    for (var k in _sfxPool) { if (_sfxPool.hasOwnProperty(k)) _audioDestroy(_sfxPool[k]); }
    _sfxPool = {}; _sfxCount = 0;
  }

  // ==================================================================
  //  Image 模块（快手 / Web 双端）
  // ==================================================================

  function imageLoad (src) {
    return new Promise(function (resolve, reject) {
      var img = _isKwai ? ks.createImage() : new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function (err) { reject(err); };
      _resolveSrc(src, function (realSrc) { img.src = realSrc; });
    });
  }

  function imageLoadAll (srcs) {
    var tasks = [];
    var result = {};
    for (var i = 0; i < srcs.length; i++) {
      (function (s) {
        tasks.push(imageLoad(s).then(function (img) { result[s] = img; }));
      })(srcs[i]);
    }
    return Promise.all(tasks).then(function () { return result; });
  }

  // ==================================================================
  //  切后台自动暂停 / 回前台自动恢复（快手 + Web）
  // ==================================================================

  function _pauseAllVideos () {
    for (var name in _videos) { if (_videos.hasOwnProperty(name)) videoPause(name); }
  }
  function _resumeAllVideos () {
    for (var name in _videos) { if (_videos.hasOwnProperty(name)) videoResume(name); }
  }

  if (typeof KwaiEvent !== 'undefined' && KwaiEvent.on) {
    KwaiEvent.on('kwai:hide', function () { audioPauseBgm(); _pauseAllVideos(); });
    KwaiEvent.on('kwai:show', function () { audioResumeBgm(); _resumeAllVideos(); });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { audioPauseBgm(); _pauseAllVideos(); }
      else { audioResumeBgm(); _resumeAllVideos(); }
    });
  }

  // ==================================================================
  //  公开 API
  // ==================================================================

  function destroyAll () {
    videoDestroyAll();
    audioDestroyAll();
  }

  window.KwaiMedia = {
    Video: {
      create: videoCreate,
      play: videoPlay,
      pause: videoPause,
      resume: videoResume,
      stop: videoStop,
      seek: videoSeek,
      destroy: videoDestroy,
      destroyAll: videoDestroyAll,
      get: videoGet,
    },
    Audio: {
      playBgm: audioPlayBgm,
      pauseBgm: audioPauseBgm,
      resumeBgm: audioResumeBgm,
      stopBgm: audioStopBgm,
      playSfx: audioPlaySfx,
      setBgmVolume: audioSetBgmVolume,
      setSfxVolume: audioSetSfxVolume,
      setBgmEnabled: audioSetBgmEnabled,
      setSfxEnabled: audioSetSfxEnabled,
      destroyAll: audioDestroyAll,
    },
    Image: {
      load: imageLoad,
      loadAll: imageLoadAll,
    },
    destroyAll: destroyAll,
  };

})();

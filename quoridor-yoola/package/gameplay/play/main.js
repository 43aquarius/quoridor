/* 步步为营 — 主编排：应用状态 / 场景路由 / 棋钟 / 存档 / 档案 / 帧循环
 * 与 Web 版功能对齐：四档 AI、版式与棋钟自定义、皮肤切换、活版音效、
 * 双人同屏、四人围坐（AI 代打）、规则、棋谱档案馆、续读书签。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};

  var KEY_SAVE = 'quoridor_save';
  var KEY_STATS = 'quoridor_stats';
  var KEY_ARCHIVE = 'quoridor_archive';
  var KEY_PREFS = 'quoridor_prefs';

  var App = {
    scene: 'cover',
    mode: 'ai',            /* ai | local | quad */
    aiLevel: 2,
    /* 版式 */
    fmtIdx: 2,             /* 0-3 预设；4=自定义 */
    customSize: 9,
    customWalls: 10,
    /* 棋钟 */
    clkIdx: 0,             /* 0-3 预设；4=自定义 */
    customTotal: 0,        /* 秒，0=不限 */
    customPerMove: 0,      /* 秒，0=不限 */
    /* 单人先后手 */
    humanFirst: true,
    /* 四人席位：true=真人 */
    seats: { A: true, B: false, C: false, D: false },
    quadAiLevel: 2,
    /* 对局 */
    state: null,
    undoStack: [],
    undosLeft: 1,
    clock: 0,
    /* 皮肤与音效 */
    skin: 0,
    soundOn: true,
    /* 档案与战绩 */
    archive: [],
    stats: { played: 0, won: 0 },
    saveExists: false,
    /* 悔棋奖励（激励视频 +3） */
    requestRedraw: function () {},
  };
  G.App = App;

  function storage() { return window.KwaiStorage || null; }

  /* —— 偏好（皮肤/音效/最近配置） —— */
  function loadPrefs() {
    var st = storage();
    if (!st) return;
    try {
      var p = st.getSync(KEY_PREFS);
      if (typeof p === 'string') p = JSON.parse(p);
      if (p && typeof p === 'object') {
        if (typeof p.skin === 'number' && p.skin >= 0 && p.skin < 4) App.skin = p.skin;
        if (typeof p.soundOn === 'boolean') App.soundOn = p.soundOn;
        if (typeof p.aiLevel === 'number') App.aiLevel = p.aiLevel;
        if (typeof p.fmtIdx === 'number') App.fmtIdx = p.fmtIdx;
        if (typeof p.clkIdx === 'number') App.clkIdx = p.clkIdx;
      }
    } catch (e) {}
  }
  function savePrefs() {
    var st = storage();
    if (!st) return;
    try {
      st.setSync(KEY_PREFS, JSON.stringify({
        skin: App.skin, soundOn: App.soundOn, aiLevel: App.aiLevel, fmtIdx: App.fmtIdx, clkIdx: App.clkIdx,
      }));
    } catch (e) {}
  }

  /* —— 档案 —— */
  function loadArchive() {
    var st = storage();
    if (!st) return;
    try {
      var a = st.getSync(KEY_ARCHIVE);
      if (typeof a === 'string') a = JSON.parse(a);
      if (Object.prototype.toString.call(a) === '[object Array]') App.archive = a;
    } catch (e) {}
  }
  function saveArchive() {
    var st = storage();
    if (!st) return;
    try {
      st.setSync(KEY_ARCHIVE, JSON.stringify(App.archive.slice(0, 60)));
    } catch (e) {}
  }
  App.archiveAdd = function (rec) {
    App.archive.unshift(rec);
    saveArchive();
  };
  App.archiveRemove = function (i) {
    App.archive.splice(i, 1);
    saveArchive();
  };
  App.archivedMark = function (n) {
    for (var i = 0; i < App.archive.length; i++) {
      if (App.archive[i].n === n) { App.archive[i].archived = true; saveArchive(); return; }
    }
  };

  /* —— 存档（书签） —— */
  function loadAll() {
    loadPrefs();
    loadArchive();
    var st = storage();
    if (!st) return;
    try {
      var stats = st.getSync(KEY_STATS);
      if (stats && typeof stats === 'object') {
        App.stats = { played: Number(stats.played) || 0, won: Number(stats.won) || 0 };
      }
      var save = st.getSync(KEY_SAVE);
      if (typeof save === 'string') save = JSON.parse(save);
      if (save && save.state && !save.state.winner) {
        App.save = save;
        App.saveExists = true;
      }
    } catch (e) {
      App.save = null;
      App.saveExists = false;
    }
  }
  App.saveGame = function () {
    if (!App.state || App.state.winner) return;
    var st = storage();
    if (!st) return;
    App.save = {
      v: 2, mode: App.mode, aiLevel: App.aiLevel, fmtIdx: App.fmtIdx,
      customSize: App.customSize, customWalls: App.customWalls,
      clkIdx: App.clkIdx, customTotal: App.customTotal, customPerMove: App.customPerMove,
      humanFirst: App.humanFirst, seats: App.seats, quadAiLevel: App.quadAiLevel,
      state: App.state, undosLeft: App.undosLeft,
      totalsMs: G.Scenes.game ? G.Scenes.game.totalsMs() : null,
    };
    try { st.setSync(KEY_SAVE, JSON.stringify(App.save)); } catch (e) {}
    App.saveExists = true;
  };
  App.discardSave = function () {
    var st = storage();
    if (st) st.removeSync(KEY_SAVE);
    App.save = null;
    App.saveExists = false;
    App.requestRedraw();
  };
  App.saveStats = function () {
    var st = storage();
    if (st) st.setSync(KEY_STATS, App.stats);
  };

  /* —— 棋钟配置解析 —— */
  function clockPreset() {
    var C = G.Core;
    if (App.clkIdx === 4) {
      return { totalSec: App.customTotal, perMoveSec: App.customPerMove };
    }
    var p = C.TIME_PRESETS[App.clkIdx] || C.TIME_PRESETS[0];
    return { totalSec: p.totalSec, perMoveSec: p.perMoveSec };
  }
  App.timeControl = clockPreset;

  /* —— 版式解析 —— */
  App.format = function () {
    var C = G.Core;
    var four = App.mode === 'quad';
    if (App.fmtIdx === 4) {
      return { size: App.customSize, wallsPerPlayer: App.customWalls };
    }
    var list = four ? C.FORMAT_PRESETS_4P : C.FORMAT_PRESETS;
    var p = list[App.fmtIdx] || list[list.length - 1];
    return { size: p.size, wallsPerPlayer: p.wallsPerPlayer };
  };

  /* —— 开局 / 续读 / 收笔 —— */
  App.startGame = function (cont) {
    var C = G.Core;
    if (cont && App.save) {
      var sv = App.save;
      App.mode = sv.mode || 'ai';
      App.aiLevel = sv.aiLevel || 2;
      App.fmtIdx = sv.fmtIdx == null ? 2 : sv.fmtIdx;
      App.customSize = sv.customSize || 9;
      App.customWalls = sv.customWalls == null ? 10 : sv.customWalls;
      App.clkIdx = sv.clkIdx == null ? 0 : sv.clkIdx;
      App.customTotal = sv.customTotal || 0;
      App.customPerMove = sv.customPerMove || 0;
      App.humanFirst = sv.humanFirst !== false;
      if (sv.seats) App.seats = sv.seats;
      App.quadAiLevel = sv.quadAiLevel || 2;
      App.state = sv.state;
      App.undosLeft = sv.undosLeft == null ? 1 : sv.undosLeft;
      App.resumeTotals = sv.totalsMs || null;
    } else {
      var fmt = App.format();
      var tc = clockPreset();
      App.state = C.initialGame({
        size: fmt.size,
        wallsPerPlayer: fmt.wallsPerPlayer,
        playerCount: App.mode === 'quad' ? 4 : 2,
        timeControl: { totalSec: tc.totalSec, perMoveSec: tc.perMoveSec },
      });
      App.undosLeft = 1;
      App.resumeTotals = null;
      App.saveGame();
    }
    App.undoStack = [];
    App.scene = 'game';
    G.Theme.applySkin(App.skin);
    if (G.Scenes.game) G.Scenes.game.enter(!!cont);
    App.requestRedraw();
  };

  App.finishGame = function (record) {
    App.stats.played++;
    var humanWon = false;
    if (App.mode === 'ai') humanWon = App.state.winner === 'A';
    if (humanWon) App.stats.won++;
    App.saveStats();
    var st = storage();
    if (st) st.removeSync(KEY_SAVE);
    App.save = null;
    App.saveExists = false;
    App.requestRedraw();
  };

  App.gotoScene = function (name) {
    App.scene = name;
    var sc = G.Scenes[name];
    if (sc && sc.enter) sc.enter();
    App.requestRedraw();
  };
  App.savePrefs = savePrefs;

  App.pushUndo = function () {
    App.undoStack.push(App.state);
    if (App.undoStack.length > 400) App.undoStack.shift();
  };

  /* —— 音效 —— */
  App.sfx = function (name) {
    if (!App.soundOn) return;
    if (window.KwaiMedia && window.KwaiMedia.Audio) {
      window.KwaiMedia.Audio.playSfx('res/Audio/' + name + '.mp3');
    }
  };

  /* —— 画布与帧循环 —— */
  var c2d = null, ctx = null, dpr = 1;
  function ensureCanvas() {
    var L = G.Layout;
    var targetDpr = Math.min(window.devicePixelRatio || 1, 2);
    var pw = Math.round(L.w * targetDpr);
    var ph = Math.round(L.h * targetDpr);
    if (!c2d) {
      c2d = window.KwaiRender.createOffscreenCanvas(pw, ph);
      ctx = c2d.getContext('2d');
      dpr = targetDpr;
      return;
    }
    if (c2d.width !== pw || c2d.height !== ph || dpr !== targetDpr) {
      c2d.width = pw; c2d.height = ph; dpr = targetDpr;
    }
  }

  var inputDirty = true, lastNow = 0, lastPulseKey = -1, inputBound = false;
  var isKS = (typeof ks !== 'undefined');

  App.requestRedraw = function () { inputDirty = true; };
  /* 全局提示条 */
  App.showToast = function (text, ms) {
    App.toast = { text: text, until: Date.now() + (ms || 2200) };
    App.requestRedraw();
  };

  function animActive() {
    var g = G.Scenes.game;
    if (App.scene === 'game' && g) return g.animActive() || !!(App.toast && Date.now() < App.toast.until);
    if (App.scene === 'cover') return true; /* 封面呼吸 */
    if (App.toast && Date.now() < App.toast.until) return true;
    return false;
  }

  /* 纸面颗粒（与 Web 版 .noise-overlay 同等强度：opacity 0.075 的微噪点） */
  var grainPattern = null;
  function drawPaper(ctx) {
    var L = G.Layout;
    ctx.fillStyle = G.Theme.paper;
    ctx.fillRect(0, 0, L.w + 4, L.h + 4);
    /* 颗粒：预渲染到小离屏画布再平铺（性能） */
    if (!grainPattern) {
      var gc = window.KwaiRender.createOffscreenCanvas(64, 64);
      var gctx = gc.getContext('2d');
      gctx.fillStyle = 'rgba(26,26,26,0.10)';
      for (var i = 0; i < 20; i++) {
        gctx.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
      }
      grainPattern = ctx.createPattern(gc, 'repeat');
    }
    if (grainPattern) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = grainPattern;
      ctx.fillRect(0, 0, L.w + 4, L.h + 4);
      ctx.restore();
    }
  }

  function draw2D() {
    ensureCanvas();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPaper(ctx);
    var sc = G.Scenes[App.scene] || G.Scenes.cover;
    if (sc) sc.draw(ctx);
    /* 全局提示条（居任何场景之上，如「不支持外链」） */
    if (App.toast && Date.now() < App.toast.until) {
      var alpha = Math.min(1, (App.toast.until - Date.now()) / 400);
      ctx.globalAlpha = alpha;
      var U = G.UI;
      var tw = U.trackedWidth(ctx, App.toast.text, 11, 'serif', false, 1) + 28;
      var tx0 = (G.Layout.w - tw) / 2;
      var ty0 = Math.max(G.Layout.safeTop, 14) + 44;
      ctx.fillStyle = G.Theme.ink;
      ctx.fillRect(tx0, ty0, tw, 30);
      U.text(ctx, App.toast.text, G.Layout.w / 2, ty0 + 19, 11, G.Theme.paper, 'serif', false, 'center');
      ctx.globalAlpha = 1;
    } else if (App.toast) App.toast = null;
  }

  function frame(gl) {
    var now = G._now();
    var dt = lastNow ? Math.min(now - lastNow, 100) : 16;
    lastNow = now;
    App.clock += dt;
    var pulseKey = Math.floor(now / 130);
    var need = inputDirty || pulseKey !== lastPulseKey || animActive();
    lastPulseKey = pulseKey;
    if (need) {
      draw2D();
      G.GLBlt.markDirty();
      inputDirty = false;
    }
    if (gl && c2d) G.GLBlt.blit(gl, c2d);
  }

  /* —— 输入路由 —— */
  function toLogical(e) {
    var cv = window.canvas;
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
    var cx = (t.clientX != null) ? t.clientX : t.x;
    var cy = (t.clientY != null) ? t.clientY : t.y;
    if (cx == null || cy == null) return null;
    if (isKS) return { x: cx, y: cy };
    var r = cv.getBoundingClientRect();
    var dprW = window.devicePixelRatio || 1;
    return {
      x: ((cx - r.left) * (cv.width / dprW)) / r.width,
      y: ((cy - r.top) * (cv.height / dprW)) / r.height,
    };
  }

  function currentScene() { return G.Scenes[App.scene]; }
  var downPt = null;

  function onStart(e) {
    if (e && e.preventDefault) e.preventDefault();
    var p = toLogical(e);
    if (!p) return;
    downPt = p;
    var sc = currentScene();
    if (sc && sc.press) safeCall('press', function () { sc.press(p.x, p.y); });
    App.requestRedraw();
  }
  function onMove(e) {
    if (e && e.preventDefault) e.preventDefault();
    var p = toLogical(e);
    if (!p) return;

    var sc = currentScene();
    if (sc && sc.drag) safeCall('drag', function () { sc.drag(p.x, p.y); });
    App.requestRedraw();
  }
  function onEnd(e) {
    if (e && e.preventDefault) e.preventDefault();
    var p = toLogical(e);
    if (!p) return;

    var sc = currentScene();
    if (sc && sc.release) {
      safeCall('release', function () {
        var kind = sc.release(p.x, p.y);
        if (kind === 'drag' && downPt) { /* 滚动结束，非点按 */ }
      });
    }
    downPt = null;
    App.requestRedraw();
  }

  function bindInput() {
    if (inputBound || !window.canvas) return;
    inputBound = true;
    var cv = window.canvas;
    cv.addEventListener('touchstart', onStart, { passive: false });
    cv.addEventListener('touchmove', onMove, { passive: false });
    cv.addEventListener('touchend', onEnd, { passive: false });
    cv.addEventListener('mousedown', onStart);
    cv.addEventListener('mousemove', function (e) { if (downPt) onMove(e); });
    cv.addEventListener('mouseup', onEnd);
  }

  /* —— 启动 —— */
  function boot() {
    loadAll();
    G.Theme.applySkin(App.skin);
    G.Fonts.resolve();
    ensureCanvas();
    if (window.KwaiRepost && window.KwaiRepost.registerSystemShare) {
      window.KwaiRepost.registerSystemShare({
        title: '我在快手《步步为营》被堵到怀疑人生！来帮我报仇，一局挡板棋见真章',
      });
    }
    G.Scenes.cover.enter();
    App.requestRedraw();
    requestAnimationFrame(loop);
    console.log('[Quoridor] boot ok scene=' + App.scene + ' save=' + (App.saveExists ? 'yes' : 'no'));
  }

  /* 输入与绘制的异常隔离：单次异常只记一次日志，绝不拖垮帧循环 */
  var errLogged = {};
  function safeCall(tag, fn) {
    try { fn(); } catch (e) {
      if (!errLogged[tag]) {
        errLogged[tag] = true;
        try { console.error('[Quoridor] ' + tag + ' error:', e && e.message, e && e.stack ? String(e.stack).split('\n')[1] : ''); } catch (e2) {}
      }
    }
  }

  function loop() {
    G.GLBridge.lazyInstall();
    bindInput();
    safeCall('frame', function () { frame(G.GLBridge.raw()); });
    if (G.GLBridge.patchFailed()) {
      setTimeout(function () { safeCall('frame-retry', function () { frame(G.GLBridge.raw()); }); }, 0);
    }
    requestAnimationFrame(loop);
  }

  G.Game = { frame: frame, boot: boot };
  /* 由 game.js 在字体预加载完成后调用 boot()；H5 直载时此处兜底自启 */
  G.Game.autoBoot = function () { boot(); };
})();

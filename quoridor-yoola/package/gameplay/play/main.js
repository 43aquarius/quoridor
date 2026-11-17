/* 步步为营 — 主编排：应用状态、帧循环、输入路由、存档与战绩
 * 帧策略：2D 画面按需重绘（输入 / 动画 / 脉冲节拍），WebGL 纹理仅在
 * 画面变化时上传；主循环每帧调用 GLBlt.blit（单四边形绘制，开销极低）。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};

  /* —— 应用状态 —— */
  var App = {
    scene: 'home',
    mode: 'ai',
    aiLevel: 2,
    presetIdx: 2,
    state: null,
    undoStack: [],
    undosLeft: 1,
    stats: { played: 0, won: 0 },
    saveExists: false,
    clock: 0,
  };
  G.App = App;

  var KEY_SAVE = 'quoridor_save';
  var KEY_STATS = 'quoridor_stats';

  function storage() {
    return window.KwaiStorage || null;
  }

  function loadAll() {
    var st = storage();
    if (!st) return;
    try {
      var stats = st.getSync(KEY_STATS);
      if (stats && typeof stats === 'object') {
        App.stats = { played: Number(stats.played) || 0, won: Number(stats.won) || 0 };
      }
      var save = st.getSync(KEY_SAVE);
      if (save && typeof save === 'string') save = JSON.parse(save);
      if (save && save.state && !save.state.winner) {
        App.save = save;
        App.saveExists = true;
      } else {
        App.save = null;
        App.saveExists = false;
      }
    } catch (e) {
      App.save = null;
      App.saveExists = false;
    }
  }

  function saveStats() {
    var st = storage();
    if (st) st.setSync(KEY_STATS, App.stats);
  }

  /* —— 画布 —— */
  var c2d = null;
  var ctx = null;
  var dpr = 1;

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
      c2d.width = pw;
      c2d.height = ph;
      dpr = targetDpr;
    }
  }

  /* —— 帧循环（自驱动：不依赖模板 main.js 调用） —— */
  var inputDirty = true;
  var lastNow = 0;
  var lastPulseKey = -1;
  var inputBound = false;
  var isKS = (typeof ks !== 'undefined');

  App.requestRedraw = function () {
    inputDirty = true;
  };

  function animActive() {
    if (App.scene === 'game' && G.Scenes.game) {
      return true; /* 对局页有行棋呼吸圈与横幅，交由脉冲节拍控制 */
    }
    return false;
  }

  function draw2D() {
    ensureCanvas();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* 纸底 + 细网点（Risograph 纸感） */
    ctx.fillStyle = G.Theme.paper;
    ctx.fillRect(0, 0, G.Layout.w + 4, G.Layout.h + 4);
    ctx.fillStyle = 'rgba(26,26,26,0.045)';
    var dotGap = 22;
    for (var gy = 6; gy < G.Layout.h; gy += dotGap) {
      for (var gx = 6; gx < G.Layout.w; gx += dotGap) {
        ctx.fillRect(gx, gy, 1.4, 1.4);
      }
    }
    var sc = App.scene === 'game' ? G.Scenes.game : G.Scenes.home;
    if (sc) sc.draw(ctx);
  }

  function frame(gl) {
    var now = G._now();
    var dt = lastNow ? Math.min(now - lastNow, 100) : 16;
    lastNow = now;
    App.clock += dt;

    var pulseKey = Math.floor(now / 130); /* ≈8fps 脉冲节拍 */
    var need = inputDirty || pulseKey !== lastPulseKey;
    lastPulseKey = pulseKey;
    if (need) {
      draw2D();
      G.GLBlt.markDirty();
      inputDirty = false;
    }
    if (gl && c2d) G.GLBlt.blit(gl, c2d);
  }

  /* —— 应用动作 —— */
  App.startGame = function (cont) {
    if (cont && App.save) {
      var sv = App.save;
      App.mode = sv.mode || 'ai';
      App.aiLevel = sv.aiLevel || 2;
      App.presetIdx = sv.presetIdx == null ? 2 : sv.presetIdx;
      App.state = sv.state;
      App.undosLeft = sv.undosLeft == null ? 1 : sv.undosLeft;
    } else {
      var preset = G.Scenes.home.PRESETS[App.presetIdx] || G.Scenes.home.PRESETS[2];
      App.state = G.Engine.initialGame({ size: preset.size, wallsPerPlayer: preset.walls });
      App.undosLeft = 1;
      App.saveGame();
    }
    App.undoStack = [];
    App.scene = 'game';
    if (G.Scenes.game) G.Scenes.game.enter();
    App.requestRedraw();
  };

  App.saveGame = function () {
    if (!App.state || App.state.winner) return;
    var st = storage();
    if (!st) return;
    App.save = {
      v: 1,
      mode: App.mode,
      aiLevel: App.aiLevel,
      presetIdx: App.presetIdx,
      state: App.state,
      undosLeft: App.undosLeft,
    };
    st.setSync(KEY_SAVE, JSON.stringify(App.save));
    App.saveExists = true;
  };

  App.finishGame = function () {
    App.stats.played++;
    if (App.state.winner === 'A' && App.mode === 'ai') App.stats.won++;
    saveStats();
    var st = storage();
    if (st) st.removeSync(KEY_SAVE);
    App.save = null;
    App.saveExists = false;
    App.requestRedraw();
  };

  App.doubleWin = function () {
    App.stats.won++;
    saveStats();
    App.requestRedraw();
  };

  App.gotoHome = function () {
    App.scene = 'home';
    if (G.Scenes.home) G.Scenes.home.enter();
    App.requestRedraw();
  };

  /* 悔棋快照：引擎状态不可变（落子产生新对象），直接存引用 */
  App.pushUndoSnapshot = function () {
    App.undoStack.push(App.state);
    if (App.undoStack.length > 300) App.undoStack.shift();
  };

  /* —— 输入 —— */
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

  function currentScene() {
    return App.scene === 'game' ? G.Scenes.game : G.Scenes.home;
  }

  function onStart(e) {
    if (e && e.preventDefault) e.preventDefault();
    var p = toLogical(e);
    if (!p) return;
    var sc = currentScene();
    if (sc && sc.press) sc.press(p.x, p.y);
    App.requestRedraw();
  }

  function onEnd(e) {
    if (e && e.preventDefault) e.preventDefault();
    var p = toLogical(e);
    if (!p) return;
    var sc = currentScene();
    if (sc && sc.tap) sc.tap(p.x, p.y);
    App.requestRedraw();
  }

  function onMove(e) {
    if (e && e.preventDefault) e.preventDefault();
  }

  function bindInput() {
    if (inputBound || !window.canvas) return;
    inputBound = true;
    var cv = window.canvas;
    cv.addEventListener('touchstart', onStart, { passive: false });
    cv.addEventListener('touchmove', onMove, { passive: false });
    cv.addEventListener('touchend', onEnd, { passive: false });
    cv.addEventListener('mousedown', onStart);
    cv.addEventListener('mouseup', onEnd);
  }

  /* —— 启动 —— */
  function boot() {
    loadAll();
    ensureCanvas();
    /* 系统转发注册（右上角菜单转发文案） */
    if (window.KwaiRepost && window.KwaiRepost.registerSystemShare) {
      window.KwaiRepost.registerSystemShare({
        title: '步步为营：一局挡板棋，看谁先把谁困死！',
      });
    }
    if (G.Scenes.home) G.Scenes.home.enter();
    App.requestRedraw();
    requestAnimationFrame(loop);
    console.log('[Quoridor] boot ok, scene=home, save=' + (App.saveExists ? 'yes' : 'no'));
  }

  function loop() {
    /* 惰性初始化：KS 环境下 window.canvas 在 game.js 装配末尾才就绪 */
    G.GLBridge.lazyInstall();
    bindInput();
    frame(G.GLBridge.raw());
    /* 拦截失败兜底：任务阶段补画，确保模板 clear 不至于清空画面 */
    if (G.GLBridge.patchFailed()) {
      setTimeout(function () { frame(G.GLBridge.raw()); }, 0);
    }
    requestAnimationFrame(loop);
  }

  G.Game = { frame: frame, boot: boot };
  boot();
})();

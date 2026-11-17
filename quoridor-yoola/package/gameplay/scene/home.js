/* 步步为营 — 首页场景：模式 / 难度 / 版式选择、继续对局、战绩、规则说明
 * 布局完全确定性计算（layout() 同时供绘制与命中检测使用）。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var B = G.Board;

  var PRESETS = [
    { label: '袖珍', size: 5, walls: 5 },
    { label: '沙龙', size: 7, walls: 8 },
    { label: '经典', size: 9, walls: 10 },
    { label: '大师', size: 11, walls: 12 },
  ];

  var pressed = {};
  var showRules = false;

  function layout() {
    var L = G.Layout;
    var App = G.App;
    var W = L.w;
    var top = Math.max(L.safeTop, 20) + 10;
    var cx = W / 2;
    var pad = 22;

    var lo = { W: W, cx: cx };
    lo.titleY = top + 62;
    lo.subY = top + 94;

    /* 自底向上堆叠 */
    var y = L.h - 74;
    lo.statsY = y;
    y -= 12;
    lo.rulesBtn = { x: cx - 64, y: y - 40, w: 128, h: 40, label: '玩法说明' };
    y = lo.rulesBtn.y - 16;
    if (App.saveExists) {
      lo.contBtn = { x: pad + 26, y: y - 46, w: W - (pad + 26) * 2, h: 46, label: '继续上次对局' };
      y = lo.contBtn.y - 14;
    }
    lo.startBtn = { x: pad + 26, y: y - 58, w: W - (pad + 26) * 2, h: 58, label: '开 局', solid: true, color: T.red, fontSize: 22 };
    y = lo.startBtn.y - 18;
    lo.sizeSeg = { x: pad, y: y - 46, w: W - pad * 2, h: 46, items: ['袖珍 5', '沙龙 7', '经典 9', '大师 11'], fontSize: 15 };
    y = lo.sizeSeg.y - 14;
    if (App.mode === 'ai') {
      lo.lvSeg = { x: pad, y: y - 42, w: W - pad * 2, h: 42, items: ['学徒', '排字师', '总编'], fontSize: 15 };
      y = lo.lvSeg.y - 14;
    }
    lo.modeSeg = { x: pad, y: y - 46, w: W - pad * 2, h: 46, items: ['人机对弈', '双人同屏'], fontSize: 16 };

    /* 主视觉自适应剩余空间 */
    var gapTop = lo.subY + 8;
    var gapBottom = lo.modeSeg.y - 10;
    lo.heroSize = Math.min(W - 90, 212, gapBottom - gapTop);
    if (lo.heroSize < 96) lo.heroSize = Math.max(78, gapBottom - gapTop);
    lo.heroCy = gapTop + lo.heroSize / 2;

    /* 规则弹层几何 */
    var pw = Math.min(W - 56, 340);
    var ph = 436;
    lo.rulesPanel = {
      x: (W - pw) / 2,
      y: Math.max(L.safeTop + 44, (L.h - ph) / 2 - 16),
      w: pw,
      h: ph,
    };
    lo.rulesOk = { x: (W - pw) / 2 + pw / 2 - 62, y: lo.rulesPanel.y + ph - 54, w: 124, h: 42, label: '知道了', solid: true, color: T.ink };
    return lo;
  }

  /* 迷你示例棋盘（装饰性主视觉） */
  function drawHero(ctx, cx, cy, size) {
    var demo = {
      size: 5,
      wallsStart: 5,
      playerCount: 2,
      posA: { x: 2, y: 4 },
      posB: { x: 2, y: 0 },
      wallsA: 5,
      wallsB: 5,
      walls: [
        { x: 1, y: 1, o: 'h', by: 'A' },
        { x: 2, y: 2, o: 'v', by: 'B' },
        { x: 0, y: 3, o: 'h', by: 'A' },
      ],
      turn: 'A',
      history: [],
      winner: null,
      winReason: null,
    };
    var m = B.metrics(5, size, size, cx, cy);
    B.drawBoard(ctx, m, demo, { clock: G.App.clock });
  }

  function enter() {
    pressed = {};
    showRules = false;
  }

  function draw(ctx) {
    var lo = layout();
    var App = G.App;

    /* 标题：红蓝错位印刷 */
    ctx.font = U.font(44, 800);
    ctx.textAlign = 'center';
    ctx.fillStyle = T.blue;
    ctx.fillText('步步为营', lo.cx + 3, lo.titleY + 3);
    ctx.fillStyle = T.red;
    ctx.fillText('步步为营', lo.cx, lo.titleY);
    ctx.textAlign = 'left';
    U.text(ctx, 'QUORIDOR · 挡板棋对决', lo.cx, lo.subY, 13, T.inkSoft, 400, 'center');

    /* 主视觉迷你棋盘 */
    drawHero(ctx, lo.cx, lo.heroCy, lo.heroSize);

    /* 模式 / 难度 / 版式 */
    var seg = lo.modeSeg;
    seg.value = App.mode === 'ai' ? 0 : 1;
    U.segRow(ctx, seg, pressed.modeSeg);
    if (App.mode === 'ai') {
      lo.lvSeg.value = App.aiLevel - 1;
      U.segRow(ctx, lo.lvSeg, pressed.lvSeg);
    }
    lo.sizeSeg.value = App.presetIdx;
    U.segRow(ctx, lo.sizeSeg, pressed.sizeSeg);

    /* 按钮 */
    U.button(ctx, lo.startBtn, pressed.start);
    if (App.saveExists) U.button(ctx, lo.contBtn, pressed.cont);
    U.button(ctx, lo.rulesBtn, pressed.rules);

    /* 战绩 */
    var st = App.stats || { played: 0, won: 0 };
    U.text(ctx, '累计对局 ' + st.played + ' · 执甲胜 ' + st.won, lo.cx, lo.statsY, 12, T.inkSoft, 400, 'center');

    if (showRules) drawRules(ctx, lo);
  }

  function drawRules(ctx, lo) {
    U.dim(ctx, 0.6);
    var p = lo.rulesPanel;
    U.panel(ctx, p.x, p.y, p.w, p.h, '玩法说明', T.red);
    var lines = [
      ['目标', true, T.red],
      ['甲（红）冲顶行，乙（蓝）冲底行，', false, T.ink],
      ['谁先把棋子走到目标线谁赢。', false, T.ink],
      ['行棋', true, T.blue],
      ['每回合二选一：走一格，或放挡板。', false, T.ink],
      ['棋子可直跳相邻的对方棋子；直跳', false, T.ink],
      ['被墙挡住时可斜跳到其两侧。', false, T.ink],
      ['挡板', true, T.red],
      ['挡板放在格线上，长两格；不可重叠', false, T.ink],
      ['或交叉，且放完后双方都必须有路。', false, T.ink],
      ['操作', true, T.blue],
      ['「走子」点高亮格落子；「放板」点', false, T.ink],
      ['格线放预览，再点一次确认，「旋', false, T.ink],
      ['转」切换横竖方向。', false, T.ink],
    ];
    var ty = p.y + 44;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i][0]) {
        U.text(ctx, lines[i][0], p.x + 24, ty, lines[i][1] ? 15 : 13, lines[i][1] ? lines[i][2] : T.ink, lines[i][1] ? 800 : 400);
      }
      ty += lines[i][1] ? 26 : 23;
    }
    U.button(ctx, lo.rulesOk, pressed.rulesOk);
  }

  function press(x, y) {
    var lo = layout();
    var App = G.App;
    pressed = {};
    if (showRules) {
      if (U.inRect(lo.rulesOk, x, y)) pressed.rulesOk = true;
      return;
    }
    var i;
    i = U.segHit(lo.modeSeg, x, y);
    if (i >= 0) { pressed.modeSeg = i; return; }
    if (App.mode === 'ai') {
      i = U.segHit(lo.lvSeg, x, y);
      if (i >= 0) { pressed.lvSeg = i; return; }
    }
    i = U.segHit(lo.sizeSeg, x, y);
    if (i >= 0) { pressed.sizeSeg = i; return; }
    if (U.inRect(lo.startBtn, x, y)) pressed.start = true;
    else if (App.saveExists && U.inRect(lo.contBtn, x, y)) pressed.cont = true;
    else if (U.inRect(lo.rulesBtn, x, y)) pressed.rules = true;
  }

  function tap(x, y) {
    var lo = layout();
    var App = G.App;
    if (showRules) {
      if (pressed.rulesOk && U.inRect(lo.rulesOk, x, y)) showRules = false;
      pressed = {};
      return;
    }
    var i;
    i = U.segHit(lo.modeSeg, x, y);
    if (i >= 0) { App.mode = i === 0 ? 'ai' : 'local'; pressed = {}; return; }
    if (App.mode === 'ai') {
      i = U.segHit(lo.lvSeg, x, y);
      if (i >= 0) { App.aiLevel = i + 1; pressed = {}; return; }
    }
    i = U.segHit(lo.sizeSeg, x, y);
    if (i >= 0) { App.presetIdx = i; pressed = {}; return; }
    if (pressed.start && U.inRect(lo.startBtn, x, y)) {
      App.startGame(false);
      return;
    }
    if (pressed.cont && App.saveExists && U.inRect(lo.contBtn, x, y)) {
      App.startGame(true);
      return;
    }
    if (pressed.rules && U.inRect(lo.rulesBtn, x, y)) {
      showRules = true;
    }
    pressed = {};
  }

  G.Scenes = G.Scenes || {};
  G.Scenes.home = {
    enter: enter,
    draw: draw,
    press: press,
    tap: tap,
    PRESETS: PRESETS,
  };
})();

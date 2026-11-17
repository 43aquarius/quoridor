/* 步步为营 — 规则场景（Web 版 RulesView 文字版 1:1，CH.05）
 * 编者按 / 棋盘与开局 / Ⅰ 行棋 / Ⅱ 跳子 / Ⅲ 挡板 /
 * Ⅳ 胜负、认输与悔棋 / Ⅴ 记谱法 / 棋钟与超时 / 四人围坐
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var Page = G.Page;

  var pg = null;
  var pressed = {};
  var backBtn = null;

  var SECTIONS = [
    { title: '编者按', paras: [
      '编辑部把这套规矩交到读者手上之前，先在打样机上印了不下百局。结论只有一条：「步步为营」的全部趣味，恰在于它的名字——每一着棋都在往前走，但真正的胜负手往往是一道横在你归途上的铅条。攻与守共用同一张纸，快与慢共用同一根笔。以下按行棋顺序，把规矩一条条排开。',
    ] },
    { title: '棋盘与开局', paras: [
      '经典开本为九路九行，共八十一格，每人执十根挡板；开卷时也可改排袖珍五路、沙龙七路或大师十一路的自定义开本，挡板零至二十根随排（见各章「版式规格」面板）。默认仍以经典九路为准。',
      '甲乙两枚圆形活字铅块分踞底边与顶边的中列——甲在 e1，乙在 e9；甲的终点在顶线，乙的终点在底线，彼此的家门就是对方的终点。挡板是排版用的粗铅条，每根长两格，专司设障。',
    ] },
    { roman: 'Ⅰ', title: '行棋', paras: [
      '每回合一着，二选其一：移子，或放板。移子只能走到上下左右相邻的一格，不可斜行，更不可穿墙——挡板立在格线之间，铅条挡道处便是绝路。棋盘上永远只有两枚棋子，格中有子亦不可落入。先手由甲执，之后轮流落子，直到有一方把铅块压上对方的底线。',
    ] },
    { roman: 'Ⅱ', title: '跳子', paras: [
      '两枚铅块正面相邻时，不可走入对方的格子。若对方身后一格空且无板，可直跳越过其头顶。若直跳位被挡板或棋盘边缘堵死，而左右两侧可通行，则可斜跳至对方斜后方两格之一——这是全书唯一允许斜行的场合，也常常是绕过封锁的活眼。跳子不是可选项之外的恩赐：正面相邻时，该方向上你只剩跳或绕两种走法。',
    ] },
    { roman: 'Ⅲ', title: '挡板', paras: [
      '放板即落一根铅条于格线之间，横竖随你，但有三条排版纪律不得逾越：不可重叠——两根板不可占用同一段格线凹槽；不可十字交叉——端点相抵成丁字、成直角是允许的，但中心相交绝无可能。最要紧的是第三条：落板之后，双方必须仍各有一条通往底线的活路。',
      '编辑部的校对工序会当场验算（BFS），一旦这根板把任何一方彻底封死，落点即被驳回——纸面上会有一道红色细线划过，如退稿的校对痕。挡板用尽后，余下的回合只能行棋；开局自定零板，则全书只分行棋一门。',
    ] },
    { roman: 'Ⅳ', title: '胜负、认输与悔棋', paras: [
      '率先把铅块压上对方底线（任意一列）者胜，全卷至此收笔；每一步都有计时，棋谱页边会以等宽数字记下你沉思的久暂。单人及同屏对局可悔棋——单人模式一次撤回你的一手连同对手的应手；亦可认输，把最后一行留给对方写。',
    ] },
    { roman: 'Ⅴ', title: '记谱法', paras: [
      '全书以代数记谱：列以 a–i 自左向右，行以 1–9 自下而上。移子记作起讫两点，如 e2→e3；放板记作锚点坐标加方向，如 WALL h4-H（h4 为板头锚点，H 横 V 竖）。着法依序编号，连同用时一并录 入棋谱栏；局终时，这串编号连同路径与挡板，将排成一张完整的棋谱卷宗。',
    ] },
    { title: '棋钟与超时', paras: [
      '开局前可为双方挂一口双轨棋钟：总时长如国际象棋的赛钟，只在你行棋时消耗，耗尽即判负；单步时限超时同样判负。不限时则沿用本手用时记录。四人局中 AI 代打席位不耗时。',
    ] },
    { title: '四人围坐（围桌赛制）', paras: [
      '四副活字围一册棋盘：甲执荧光红居南（底边中列，归途为顶行）、丙执苔绿居西（左边中行，归途为右列）、乙执钴蓝居北（顶边中列，归途为底行）、丁执墨黑居东（右边中行，归途为左列）。行棋顺时针轮转：甲→丙→乙→丁，先抵归途者即刻收笔。',
      '每人挡板减半（九路经典围坐每人五根），放板须同时保住四位在场席位的通路。跳子规矩同前，但盘上最多四枚铅字：三子一线时直跳落位被占，可斜跳至被跳子两侧空位。',
      '围桌采用出局制：认输、超时不再是终局，而是该席出局——其铅字留在盘上充作障碍（可被跳越），剩余席位继续行棋；仅存一席时，该席以「末位收笔」胜出。本地围坐可任意搭配真人与编辑部 AI。',
    ] },
  ];

  function layout() {
    var L = G.Layout;
    var W = L.w;
    var s = Math.min(W / 414, 1.25);
    var pad = 20 * s;
    var cw = W - pad * 2;
    var lo = { W: W, S: s, pad: pad };

    lo.statusY = Math.max(L.safeTop, 14) + 16 * s;
    var y = lo.statusY + 30 * s;
    lo.headY = y;
    y += 78 * s;

    lo.sections = [];
    for (var i = 0; i < SECTIONS.length; i++) {
      var sec = SECTIONS[i];
      var secY = y;
      y += 30 * s;
      for (var p = 0; p < sec.paras.length; p++) {
        var lines = U.wrap(wrapCtx(), sec.paras[p], cw - 26 * s, 12.5 * s, 'serif');
        lo.sections.push({ sec: i, para: p, y: y, lines: lines });
        y += lines.length * 19 * s + 10 * s;
      }
      y += 16 * s;
    }
    lo.footY = y;
    y += 24 * s;
    backBtn = { x: pad, y: y, w: 110 * s, h: 34 * s, label: '← 返回目录', fontSize: 11.5 * s, track: true };
    lo.contentH = y + 34 * s + 30 * s;
    return lo;
  }

  var _wrapCtx = null;
  function wrapCtx() {
    if (!_wrapCtx) {
      var c = window.KwaiRender.createOffscreenCanvas(10, 10);
      _wrapCtx = c.getContext('2d');
    }
    return _wrapCtx;
  }
  function contentH() { return layout().contentH; }
  function enter() { pg = Page.create(contentH); pressed = {}; }

  function draw(ctx) {
    var lo = layout();
    var L = G.Layout;
    var s = lo.S;

    U.statusBar(ctx, lo.W, lo.statusY);

    ctx.save();
    ctx.translate(0, -pg.scroll);

    U.text(ctx, '规则', lo.pad, lo.headY + 34 * s, 32 * s, T.ink, 'serifX', true);
    U.text(ctx, 'editor’s note', lo.W - lo.pad - 46 * s, lo.headY + 30 * s, 14 * s, 'rgba(26,26,26,0.55)', 'westI', false, 'right');
    U.tracked(ctx, 'CH.05', lo.W - lo.pad, lo.headY + 12 * s, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 2 * s, 'right');
    U.hline(ctx, lo.pad, lo.headY + 48 * s, lo.W - lo.pad * 2, 'rgba(26,26,26,0.25)', 1);

    /* 各节 */
    var lastSec = -1;
    for (var i = 0; i < lo.sections.length; i++) {
      var blk = lo.sections[i];
      var sec = SECTIONS[blk.sec];
      if (blk.sec !== lastSec) {
        lastSec = blk.sec;
        var sy = blk.y - 30 * s;
        if (sec.roman) {
          U.text(ctx, sec.roman + ' ' + sec.title, lo.pad, sy + 16 * s, 17 * s, T.ink, 'serifB', true);
        } else {
          U.text(ctx, sec.title, lo.pad, sy + 16 * s, 17 * s, T.ink, 'serifB', true);
        }
        U.hline(ctx, lo.pad, sy + 24 * s, lo.W - lo.pad * 2, 'rgba(26,26,26,0.2)', 1);
      }
      for (var l = 0; l < blk.lines.length; l++) {
        U.text(ctx, blk.lines[l], lo.pad + 13 * s, blk.y + 12 * s + l * 19 * s, 12.5 * s, 'rgba(26,26,26,0.8)', 'serif');
      }
    }

    /* 页脚 */
    U.hline(ctx, lo.pad, lo.footY, lo.W - lo.pad * 2, 'rgba(26,26,26,0.5)', 1);
    var foot = '规则依据经典桌游 QUORIDOR（Gigamic, 1997）· 编辑部校订版';
    var flines = U.wrap(ctx, foot, lo.cw, 10 * s, 'mono');
    for (var f = 0; f < flines.length; f++) {
      U.text(ctx, flines[f], lo.pad, lo.footY + 16 * s + f * 14 * s, 10 * s, 'rgba(26,26,26,0.5)', 'mono');
    }

    U.button(ctx, backBtn, pressed.back);
    U.nBadge(ctx, 14 * s + 20 * s, pg.cy(L.h) - 34 * s, 20 * s);

    ctx.restore();
    Page.indicator(ctx, pg);
  }

  function press(x, y) {
    pressed = {};
    pg.press(x, y);
    if (U.inRect(backBtn, x, pg.cy(y))) pressed.back = true;
  }
  function drag(x, y) { pg.drag(x, y); }
  function release(x, y) {
    var kind = pg.release(x, y);
    if (kind !== 'tap') { pressed = {}; return; }
    if (pressed.back && U.inRect(backBtn, x, pg.cy(y))) {
      G.App.sfx('pawn-click');
      G.App.gotoScene('toc');
    }
    pressed = {};
  }

  G.Scenes = G.Scenes || {};
  G.Scenes.rules = { enter: enter, draw: draw, press: press, drag: drag, release: release };
})();

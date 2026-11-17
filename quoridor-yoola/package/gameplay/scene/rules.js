/* 步步为营 — 规则场景（Web 版 RulesView 1:1，CH.05）
 * 编者按 / 棋盘与开局（图一）/ Ⅰ 行棋（图二）/ Ⅱ 跳子（图三·图四）/
 * Ⅲ 挡板（图五·图六）/ Ⅳ 胜负、认输与悔棋 / Ⅴ 记谱法 /
 * 棋钟与超时 / 四人围坐（围桌两图）
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
    { title: '棋盘与开局', figure: 'open', paras: [
      '经典开本为九路九行，共八十一格，每人执十根挡板；开卷时也可改排袖珍五路、沙龙七路或大师十一路的自定义开本，挡板零至二十根随排（见各章「版式规格」面板）。默认仍以经典九路为准。',
      '甲乙两枚圆形活字铅块分踞底边与顶边的中列——甲在 e1，乙在 e9；甲的终点在顶线，乙的终点在底线，彼此的家门就是对方的终点。挡板是排版用的粗铅条，每根长两格，专司设障。',
    ] },
    { roman: 'Ⅰ', title: '行棋', figure: 'move', paras: [
      '每回合一着，二选其一：移子，或放板。移子只能走到上下左右相邻的一格，不可斜行，更不可穿墙——挡板立在格线之间，铅条挡道处便是绝路。棋盘上永远只有两枚棋子，格中有子亦不可落入。先手由甲执，之后轮流落子，直到有一方把铅块压上对方的底线。',
    ] },
    { roman: 'Ⅱ', title: '跳子', figure: 'jump', paras: [
      '两枚铅块正面相邻时，不可走入对方的格子。若对方身后一格空且无板，可直跳越过其头顶。若直跳位被挡板或棋盘边缘堵死，而左右两侧可通行，则可斜跳至对方斜后方两格之一——这是全书唯一允许斜行的场合，也常常是绕过封锁的活眼。跳子不是可选项之外的恩赐：正面相邻时，该方向上你只剩跳或绕两种走法。',
    ] },
    { roman: 'Ⅲ', title: '挡板', figure: 'walls', paras: [
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
    { title: '四人围坐（围桌赛制）', figure: 'seats', paras: [
      '四副活字围一册棋盘：甲执荧光红居南（底边中列，归途为顶行）、丙执苔绿居西（左边中行，归途为右列）、乙执钴蓝居北（顶边中列，归途为底行）、丁执墨黑居东（右边中行，归途为左列）。行棋顺时针轮转：甲→丙→乙→丁，先抵归途者即刻收笔。',
      '每人挡板减半（九路经典围坐每人五根），放板须同时保住四位在场席位的通路。跳子规矩同前，但盘上最多四枚铅字：三子一线时直跳落位被占，可斜跳至被跳子两侧空位。',
      '围桌采用出局制：认输、超时不再是终局，而是该席出局——其铅字留在盘上充作障碍（可被跳越），剩余席位继续行棋；仅存一席时，该席以「末位收笔」胜出。本地围坐可任意搭配真人与编辑部 AI。',
    ] },
  ];

  var FIG_CAPTION = {
    open: '图一 · 开局：甲居 e1（下），乙居 e9（上），各执十根铅条。虚线为双方要抵达的底线。',
    move: '图二 · 甲可走上、下、左、右相邻四格；虚线箭头示可去方向。',
    jump: '图三 · 直跳：甲与乙正面相邻，乙身后无阻，甲跃至其头顶（e5）。',
    diag: '图四 · 斜跳：乙身后被铅条封死，甲可斜落其斜后方两格之一（虚线箭头）。',
    wallsOk: '图五 · 合法：两板端点相接、并行不犯，丁字与直角皆可。',
    wallsNo: '图六 · 非法：中为十字交叉；下为同槽重叠。红线即校对退回痕。',
    seats: '四席各据一边中点，箭头为顺时针轮转：甲（南）→ 丙（西）→ 乙（北）→ 丁（东）；色标即各自的归途线。',
    out: '认输/超时/离席逾时者出局：铅字留盘作障碍（加叉线），仅存一席时末位收笔；先抵归途仍即刻收笔。',
  };

  function layout() {
    var L = G.Layout;
    var W = L.w;
    var s = Math.min(W / 414, 1.25);
    var pad = 20 * s;
    var cw = W - pad * 2;
    var lo = { W: W, S: s, pad: pad, cw: cw };

    lo.statusY = Math.max(L.safeTop, 14) + 16 * s;
    var y = lo.statusY + 30 * s;
    lo.headY = y;
    y += 84 * s;

    lo.blocks = [];
    for (var i = 0; i < SECTIONS.length; i++) {
      var sec = SECTIONS[i];
      lo.blocks.push({ kind: 'head', sec: i, y: y });
      y += 30 * s;
      for (var p = 0; p < sec.paras.length; p++) {
        var lines = U.wrap(wrapCtx(), sec.paras[p], cw - 26 * s, 12.5 * s, 'serif');
        lo.blocks.push({ kind: 'para', sec: i, y: y, lines: lines });
        y += lines.length * 19 * s + 10 * s;
      }
      if (sec.figure) {
        var figs = figList(sec.figure);
        for (var f = 0; f < figs.length; f++) {
          var fh2 = figureH(figs[f], s, cw);
          lo.blocks.push({ kind: 'figure', sec: i, y: y, fig: figs[f], h: fh2 });
          y += fh2 + 16 * s;
        }
      }
      y += 14 * s;
    }
    /* 页脚（Web: border-t-2 + 返回目录左 + 依据右） */
    lo.footY = y;
    backBtn = { x: pad, y: y + 20 * s, w: 110 * s, h: 32 * s, label: '← 返回目录', fontSize: 12 * s };
    lo.footTextY = y + 34 * s;
    lo.contentH = y + 60 * s;
    return lo;
  }

  function figList(fig) {
    if (fig === 'jump') return ['jump', 'diag'];
    if (fig === 'walls') return ['wallsOk', 'wallsNo'];
    if (fig === 'seats') return ['seats', 'out'];
    return [fig];
  }
  function figureH(fig, s, cw) {
    if (fig === 'seats' || fig === 'out') return 250 * s;
    return 220 * s;
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

    /* 章头（Web：规则 + 斜体 editor's note + CH.05 + border-b-2） */
    U.text(ctx, '规则', lo.pad, lo.headY + 36 * s, 32 * s, T.ink, 'serifX');
    U.text(ctx, 'editor’s note', lo.pad + 72 * s, lo.headY + 36 * s, 14 * s, 'rgba(26,26,26,0.55)', 'westI');
    U.tracked(ctx, 'CH.05', lo.W - lo.pad, lo.headY + 18 * s, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 4 * s, 'right');
    U.hline(ctx, lo.pad, lo.headY + 50 * s, lo.W - lo.pad * 2, T.ink, 2);

    /* 各块 */
    for (var i = 0; i < lo.blocks.length; i++) {
      var blk = lo.blocks[i];
      var sec = SECTIONS[blk.sec];
      if (blk.kind === 'head') {
        var title = sec.roman ? sec.roman + '　' + sec.title : sec.title;
        U.text(ctx, title, lo.pad, blk.y + 16 * s, 17 * s, T.ink, 'serifB');
        U.hline(ctx, lo.pad, blk.y + 24 * s, lo.W - lo.pad * 2, 'rgba(26,26,26,0.2)', 1);
      } else if (blk.kind === 'para') {
        for (var l = 0; l < blk.lines.length; l++) {
          U.text(ctx, blk.lines[l], lo.pad + 13 * s, blk.y + 12 * s + l * 19 * s, 12.5 * s, 'rgba(26,26,26,0.8)', 'serif');
        }
      } else if (blk.kind === 'figure') {
        drawFigure(ctx, blk, lo);
      }
    }

    /* 页脚（Web: border-t-2 + 返回目录 + 依据右） */
    U.hline(ctx, lo.pad, lo.footY, lo.W - lo.pad * 2, T.ink, 2);
    U.ghostButton(ctx, backBtn, pressed.back);
    var foot = '规则依据经典桌游 QUORIDOR（Gigamic, 1997）· 编辑部校订版';
    U.text(ctx, foot, lo.W - lo.pad, lo.footTextY, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 'right');

    ctx.restore();
    Page.indicator(ctx, pg);
    U.folio(ctx, '5');
  }

  /* —— 图示（Web DiaBase 1:1：细边框图框 + 网格线稿 + 铅字棋子 + 虚线箭头 + 图注） —— */
  function drawFigure(ctx, blk, lo) {
    var s = lo.S;
    var fig = blk.fig;
    var fx = lo.pad, fy = blk.y, fw = lo.cw, fh = blk.h;
    /* 图框（Web border border-ink/40 p-4） */
    ctx.strokeStyle = 'rgba(26,26,26,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(fx, fy, fw, fh);
    var cx = fx + fw / 2;
    var cell = 46 * s;
    var gx = cx, gy = fy + 20 * s;

    if (fig === 'open') {
      miniGrid(ctx, gx, gy, cell, 3, 3, { goals: ['top', 'bottom'] });
      miniPiece(ctx, gx, gy, cell, 1, 2, 'A');
      miniPiece(ctx, gx, gy, cell, 1, 0, 'B');
      centerText(ctx, cx, gy + 3 * cell + 24 * s, '甲 e1 ↓ 目标：顶线', s, T.qa);
      centerText(ctx, cx, fy + fh - 30 * s, '乙 e9 ↑ 目标：底线', s, T.qb);
    } else if (fig === 'move') {
      miniGrid(ctx, gx, gy, cell, 3, 3, {});
      miniPiece(ctx, gx, gy, cell, 1, 1, 'A');
      var c2 = cell / 2;
      dashArrow(ctx, gx + c2, gy + c2, gx + c2, gy + c2 - cell * 0.62, T.qa, s);
      dashArrow(ctx, gx + c2, gy + c2, gx + c2, gy + c2 + cell * 0.62, T.qa, s);
      dashArrow(ctx, gx + c2, gy + c2, gx + c2 - cell * 0.62, gy + c2, T.qa, s);
      dashArrow(ctx, gx + c2, gy + c2, gx + c2 + cell * 0.62, gy + c2, T.qa, s);
      centerText(ctx, cx, fy + fh - 26 * s, '移子：上下左右，一步一格', s, T.ink);
    } else if (fig === 'jump') {
      miniGrid(ctx, gx, gy, cell, 3, 3, {});
      miniPiece(ctx, gx, gy, cell, 1, 2, 'A');
      miniPiece(ctx, gx, gy, cell, 1, 1, 'B');
      dashArrow(ctx, gx + cell * 1.5, gy + cell * 2.5, gx + cell * 1.5, gy + cell * 0.5, T.qa, s);
      centerText(ctx, cx, fy + fh - 26 * s, '直跳：跃过对方头顶', s, T.ink);
    } else if (fig === 'diag') {
      miniGrid(ctx, gx, gy, cell, 3, 3, {});
      miniPiece(ctx, gx, gy, cell, 1, 2, 'A');
      miniPiece(ctx, gx, gy, cell, 1, 1, 'B');
      miniWall(ctx, gx, gy, cell, { x: 0, y: 0, o: 'h' }, T.qb);
      dashArrow(ctx, gx + cell * 1.5, gy + cell * 2.5, gx + cell * 0.5, gy + cell * 0.5, T.qa, s);
      dashArrow(ctx, gx + cell * 1.5, gy + cell * 2.5, gx + cell * 2.5, gy + cell * 0.5, T.qa, s);
      centerText(ctx, cx, fy + fh - 26 * s, '斜跳：直跳位被板封死时', s, T.ink);
    } else if (fig === 'wallsOk') {
      /* 丁字相抵 + 平行不犯 */
      ctx.strokeStyle = T.ink; ctx.lineWidth = 1.1;
      var g0y = fy + 30 * s, gh = 3 * 44 * s;
      for (var i = 0; i <= 4; i++) {
        line(ctx, fx + 30 * s, g0y + i * 44 * s, fx + 30 * s + 4 * 44 * s, g0y + i * 44 * s);
        line(ctx, fx + 30 * s + i * 44 * s, g0y, fx + 30 * s + i * 44 * s, g0y + gh);
      }
      miniWallAbs(ctx, fx + 30 * s + 44 * s + 3, g0y + 2 * 44 * s - 4, 2 * 44 * s - 6, 8, T.qa);
      miniWallAbs(ctx, fx + 30 * s + 2 * 44 * s - 4, g0y + 3 * 44 * s + 3, 8, 2 * 44 * s - 6, T.qb);
      miniWallAbs(ctx, fx + 30 * s + 3, g0y + 44 * s - 4, 2 * 44 * s - 6, 8, T.qa);
      miniWallAbs(ctx, fx + 30 * s + 2 * 44 * s + 3, g0y + 44 * s - 4, 2 * 44 * s - 6, 8, T.qb);
      centerText(ctx, cx, fy + fh - 26 * s, '端点相抵成丁字 · 并行不犯 · 皆合法', s, T.ink);
    } else if (fig === 'wallsNo') {
      ctx.strokeStyle = T.ink; ctx.lineWidth = 1.1;
      var g1y = fy + 30 * s, gh2 = 2 * 44 * s;
      for (var j = 0; j <= 3; j++) {
        line(ctx, fx + 30 * s, g1y + j * 44 * s, fx + 30 * s + 3 * 44 * s, g1y + j * 44 * s);
        line(ctx, fx + 30 * s + j * 44 * s, g1y, fx + 30 * s + j * 44 * s, g1y + gh2);
      }
      /* 十字交叉（红） */
      miniWallAbs(ctx, fx + 30 * s + 44 * s + 3, g1y + 44 * s - 4, 2 * 44 * s - 6, 8, T.risoRed);
      miniWallAbs(ctx, fx + 30 * s + 44 * s * 2 - 4, g1y + 3, 8, 2 * 44 * s - 6, T.risoRed);
      /* 同槽重叠 */
      miniWallAbs(ctx, fx + 30 * s + 3, g1y + 2 * 44 * s - 6, 2 * 44 * s - 6, 8, T.qa);
      miniWallAbs(ctx, fx + 30 * s + 5, g1y + 2 * 44 * s - 2, 2 * 44 * s - 6, 8, T.qb);
      strikeLine(ctx, fx + 30 * s - 4, g1y + 2 * 44 * s - 2, fx + 30 * s + 2 * 44 * s + 4, g1y + 2 * 44 * s - 2, s);
      centerText(ctx, cx, fy + fh - 26 * s, '上：十字交叉 · 下：同槽重叠（红线驳回）', s, T.ink);
    } else if (fig === 'seats') {
      var cell4 = 44 * s;
      miniGrid(ctx, cx, fy + 26 * s, cell4, 4, 4, { goals4: true });
      var m = fy + 26 * s + 2 * cell4;
      miniPiece(ctx, cx, fy + 26 * s, cell4, 1, 3, 'A');
      miniPiece(ctx, cx, fy + 26 * s, cell4, 0, 2, 'C');
      miniPiece(ctx, cx, fy + 26 * s, cell4, 1, 0, 'B');
      miniPiece(ctx, cx, fy + 26 * s, cell4, 3, 2, 'D');
      /* 顺时针弧线箭头（甲→丙→乙→丁） */
      var rr = 2.1 * cell4;
      ctx.strokeStyle = 'rgba(26,26,26,0.65)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx, m, rr, 0, Math.PI * 2); ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
      arrowHead(ctx, cx + rr * Math.cos(-Math.PI / 3), m + rr * Math.sin(-Math.PI / 3), -Math.PI / 3 - Math.PI / 2, s);
      centerText(ctx, cx, fy + fh - 26 * s, '甲（南·红）→ 丙（西·绿）→ 乙（北·蓝）→ 丁（东·黑）', s, T.ink);
    } else if (fig === 'out') {
      var cell5 = 46 * s;
      miniGrid(ctx, cx, fy + 26 * s, cell5, 3, 3, {});
      miniPiece(ctx, cx, fy + 26 * s, cell5, 0, 0, 'B', true);
      miniPiece(ctx, cx, fy + 26 * s, cell5, 2, 2, 'D', true);
      miniPiece(ctx, cx, fy + 26 * s, cell5, 1, 1, 'A');
      centerText(ctx, cx, fy + fh - 26 * s, '乙、丁出局（叉线）；甲仍在场 · 末位收笔', s, T.ink);
    }

    /* 图注（Web figcaption：dashed 顶线 + mono 10 ink/60） */
    var capY = fy + fh - 14 * s;
    U.hline(ctx, fx + 14 * s, capY - 14 * s, fw - 28 * s, 'rgba(26,26,26,0.3)', 1, [4 * s, 3 * s]);
    var cap = FIG_CAPTION[fig];
    var capLines = U.wrap(ctx, cap, fw - 28 * s, 10 * s, 'mono');
    if (capLines.length > 1) {
      /* 多行图注上移，避免与图内元素叠压 */
      capY -= (capLines.length - 1) * 14 * s;
    }
    for (var cl = 0; cl < capLines.length; cl++) {
      U.text(ctx, capLines[cl], fx + 14 * s, capY + cl * 14 * s, 10 * s, 'rgba(26,26,26,0.6)', 'mono');
    }
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function centerText(ctx, x, y, str, s, col) {
    U.text(ctx, str, x, y, 10.5 * s, col || T.ink, 'serif', false, 'center');
  }
  /* 小网格（cell 像素格；goals 画虚线底线） */
  function miniGrid(ctx, cx, top, cell, cols, rows, o) {
    o = o || {};
    var w = cols * cell, h = rows * cell;
    var x0 = cx - w / 2;
    ctx.strokeStyle = T.ink; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.9;
    for (var i = 0; i <= cols; i++) line(ctx, x0 + i * cell, top, x0 + i * cell, top + h);
    for (var j = 0; j <= rows; j++) line(ctx, x0, top + j * cell, x0 + w, top + j * cell);
    ctx.globalAlpha = 1;
    /* 底线虚线 */
    ctx.strokeStyle = T.ink; ctx.lineWidth = 1.4;
    ctx.setLineDash([2, 6]); ctx.globalAlpha = 0.5;
    if (o.goals) {
      line(ctx, x0 + 2, top + 1, x0 + w - 2, top + 1);
      line(ctx, x0 + 2, top + h - 1, x0 + w - 2, top + h - 1);
    }
    if (o.goals4) {
      line(ctx, x0 + 2, top + 1, x0 + w - 2, top + 1);
      line(ctx, x0 + 2, top + h - 1, x0 + w - 2, top + h - 1);
      line(ctx, x0 + 1, top + 2, x0 + 1, top + h - 2);
      line(ctx, x0 + w - 1, top + 2, x0 + w - 1, top + h - 2);
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    return { x0: x0, top: top, cell: cell };
  }
  /* 铅字棋子（套印错位 + 内圈 + 字） */
  function miniPiece(ctx, cx, top, cell, col, row, pl, crossed) {
    var px = cx - (3 * cell) / 2 + col * cell + cell / 2;
    var py = top + row * cell + cell / 2;
    var r = cell * 0.33;
    var col2 = T.playerColor(pl);
    ctx.save();
    if (crossed) ctx.globalAlpha = 0.42;
    ctx.globalAlpha *= 1;
    ctx.fillStyle = col2;
    var a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.45;
    ctx.beginPath(); ctx.arc(px + 2, py + 2, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = T.paper; ctx.lineWidth = 1.2; ctx.globalAlpha = a * 0.85;
    ctx.beginPath(); ctx.arc(px, py, r - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = U.font(r * 1.05, 'serifB');
    ctx.fillStyle = T.ink; ctx.globalAlpha = a * 0.5;
    ctx.fillText(T.playerName(pl), px + 0.8, py + 0.8);
    ctx.globalAlpha = a;
    ctx.fillStyle = T.paper;
    ctx.fillText(T.playerName(pl), px, py);
    if (crossed) {
      ctx.strokeStyle = T.ink; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.globalAlpha = a * 0.75;
      ctx.beginPath();
      ctx.moveTo(px - r * 0.7, py - r * 0.7); ctx.lineTo(px + r * 0.7, py + r * 0.7);
      ctx.moveTo(px + r * 0.7, py - r * 0.7); ctx.lineTo(px - r * 0.7, py + r * 0.7);
      ctx.stroke(); ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
  /* 铅条挡板（相对网格坐标） */
  function miniWall(ctx, cx, top, cell, w, color) {
    var x0 = cx - (3 * cell) / 2;
    var th = cell * 0.16, inset = cell * 0.06;
    var gx, gy, gw, gh;
    if (w.o === 'h') {
      gx = x0 + w.x * cell + inset;
      gy = top + (w.y + 1) * cell - th / 2;
      gw = 2 * cell - 2 * inset; gh = th;
    } else {
      gx = x0 + (w.x + 1) * cell - th / 2;
      gy = top + w.y * cell + inset;
      gw = th; gh = 2 * cell - 2 * inset;
    }
    miniWallAbs(ctx, gx, gy, gw, gh, color || T.qa);
  }
  function miniWallAbs(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    U.roundRect(ctx, x + 1.5, y + 1.5, w, h, h / 2);
    ctx.globalAlpha = 0.42; ctx.fill();
    ctx.globalAlpha = 1;
    U.roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
  }
  /* 虚线箭头 */
  function dashArrow(ctx, x1, y1, x2, y2, col, s) {
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    var ang = Math.atan2(y2 - y1, x2 - x1);
    arrowHead(ctx, x2, y2, ang, s);
  }
  function arrowHead(ctx, x, y, ang, s) {
    ctx.fillStyle = T.ink;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8 * s, -4 * s);
    ctx.lineTo(-8 * s, 4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function strikeLine(ctx, x1, y1, x2, y2, s) {
    ctx.strokeStyle = T.risoRed; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.lineCap = 'butt';
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

/* 步步为营 — 棋盘渲染与命中（与 Web 版 Board.tsx 1:1 的 Canvas 移植）
 * 几何：SVG 单位制 CELL=100、TH=15(板厚)、INSET=6、PAWN_R=30、边距 34。
 * unit = 可用像素 / (N*CELL)；所有规格按 unit 换算。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var C = null; /* Core 模块（引擎），boot 后可用 */

  var CELL = 100, TH = 15, INSET = 6, PAWN_R = 30, MARGIN = 34;

  /* 度量：availW 可用宽 → {unit, px(总宽), x0, y0} */
  function metrics(N, availW, x0, y0) {
    var total = N * CELL + MARGIN * 2;
    var unit = availW / total;
    return { N: N, u: unit, total: total, x0: x0, y0: y0, w: availW, h: availW };
  }
  /* 棋盘 SVG 坐标 → 画布像素（x/y 各用各自基准：x0/y0） */
  function px(m, v) { return m.x0 + (v + MARGIN) * m.u; }
  function py(m, v) { return m.y0 + (v + MARGIN) * m.u; }

  function cellCenter(m, x, y) {
    return { x: px(m, x * CELL + CELL / 2), y: py(m, y * CELL + CELL / 2) };
  }

  /* 挡板几何（SVG 单位）：h 板跨 (x..x+2, y+1) 行线；v 板跨 (x+1) 列线 (y..y+2) */
  function wallGeom(m, x, y, o) {
    if (o === 'h') {
      return {
        x: px(m, x * CELL + INSET), y: py(m, (y + 1) * CELL - TH / 2),
        w: (2 * CELL - 2 * INSET) * m.u, h: TH * m.u,
      };
    }
    return {
      x: px(m, (x + 1) * CELL - TH / 2), y: py(m, y * CELL + INSET),
      w: TH * m.u, h: (2 * CELL - 2 * INSET) * m.u,
    };
  }

  /* 命中检测（对齐 Web 版 computeZone）：返回 {kind:'wall',x,y,o} 或 {kind:'cell',x,y} 或 null */
  function hit(m, tx, ty) {
    var N = m.N;
    var bx = (tx - m.x0) / m.u - MARGIN;
    var by = (ty - m.y0) / m.u - MARGIN;
    var i = Math.round(bx / CELL);
    var j = Math.round(by / CELL);
    if (i >= 1 && i <= N - 1 && j >= 1 && j <= N - 1) {
      var dx = bx - i * CELL;
      var dy = by - j * CELL;
      if (Math.sqrt(dx * dx + dy * dy) <= 46) {
        var o = Math.abs(dx) > Math.abs(dy) ? 'v' : 'h';
        return { kind: 'wall', x: i - 1, y: j - 1, o: o };
      }
    }
    var cx = Math.floor(bx / CELL);
    var cy = Math.floor(by / CELL);
    if (cx >= 0 && cx <= N - 1 && cy >= 0 && cy <= N - 1) return { kind: 'cell', x: cx, y: cy };
    return null;
  }

  function colLetter(i, N) {
    return String.fromCharCode(97 + i);
  }

  /* —— 绘制 —— */
  function drawBoard(ctx, m, state, opts) {
    opts = opts || {};
    if (!C) C = G.Core;
    var N = m.N;
    var four = state.playerCount === 4;
    var u = m.u;

    /* 书页双线边框 */
    ctx.strokeStyle = T.ink; ctx.lineWidth = Math.max(1.2, 2.6 * u);
    ctx.strokeRect(px(m, -26), py(m, -26), (N * CELL + 42) * u, (N * CELL + 42) * u);
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = Math.max(0.8, 1 * u);
    ctx.strokeRect(px(m, -19), py(m, -19), (N * CELL + 28) * u, (N * CELL + 28) * u);
    ctx.globalAlpha = 1;

    /* 坐标（四周等宽小号） */
    var coordSize = (N > 11 ? 21 : 24) * u;
    ctx.font = U.font(coordSize, 'mono');
    ctx.fillStyle = T.ink;
    ctx.globalAlpha = 0.62;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var ci = 0; ci < N; ci++) {
      var l = colLetter(ci, N);
      var cxL = px(m, ci * CELL + CELL / 2 - 6);
      ctx.fillText(l, cxL, py(m, -18));
      ctx.fillText(l, cxL, py(m, N * CELL + 22));
      var num = String(N - ci);
      ctx.fillText(num, px(m, -24), py(m, ci * CELL + CELL / 2));
      ctx.fillText(num, px(m, N * CELL + 16), py(m, ci * CELL + CELL / 2));
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;

    /* 极细格线 */
    ctx.strokeStyle = T.ink; ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(0.6, 1.15 * u);
    ctx.beginPath();
    for (var gi = 0; gi <= N; gi++) {
      ctx.moveTo(px(m, gi * CELL), py(m, 0));
      ctx.lineTo(px(m, gi * CELL), py(m, N * CELL));
      ctx.moveTo(px(m, 0), py(m, gi * CELL));
      ctx.lineTo(px(m, N * CELL), py(m, gi * CELL));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* 终线提示（点线） */
    ctx.strokeStyle = T.ink; ctx.lineWidth = Math.max(0.8, 1.6 * u);
    ctx.setLineDash([2 * u, 7 * u]);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(px(m, 2), py(m, 1)); ctx.lineTo(px(m, N * CELL - 2), py(m, 1));
    ctx.moveTo(px(m, 2), py(m, N * CELL - 1)); ctx.lineTo(px(m, N * CELL - 2), py(m, N * CELL - 1));
    if (four) {
      ctx.moveTo(px(m, 1), py(m, 2)); ctx.lineTo(px(m, 1), py(m, N * CELL - 2));
      ctx.moveTo(px(m, N * CELL - 1), py(m, 2)); ctx.lineTo(px(m, N * CELL - 1), py(m, N * CELL - 2));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    /* 四人局：目标线中点色标 */
    if (four) {
      ctx.globalAlpha = 0.8;
      var mk = function (x, y, w, h, col) {
        ctx.fillStyle = col;
        U.roundRect(ctx, x, y, w, h, h / 2);
        ctx.fill();
      };
      mk(px(m, N * CELL / 2 - 26), py(m, -11), 52 * u, 7 * u, T.playerColor('A'));
      mk(px(m, N * CELL / 2 - 26), py(m, N * CELL + 4), 52 * u, 7 * u, T.playerColor('B'));
      mk(px(m, N * CELL + 4), py(m, N * CELL / 2 - 26), 7 * u, 52 * u, T.playerColor('C'));
      mk(px(m, -11), py(m, N * CELL / 2 - 26), 7 * u, 52 * u, T.playerColor('D'));
      ctx.globalAlpha = 1;
    }

    /* 步数墨迹（每格到访次数） */
    var trace = opts.trace;
    if (trace) {
      ctx.font = U.font(15 * u, 'mono');
      ctx.fillStyle = T.ink;
      ctx.globalAlpha = 0.24;
      ctx.textAlign = 'left';
      for (var key in trace) {
        var parts = key.split(',');
        var tx2 = px(m, Number(parts[0]) * CELL + 9);
        var ty2 = py(m, Number(parts[1]) * CELL + 24);
        ctx.fillText(String(trace[key]), tx2, ty2);
      }
      ctx.globalAlpha = 1;
    }

    /* 可走格：小色点 */
    if (opts.legal && opts.legal.length) {
      var turnCol = T.playerColor(state.turn);
      for (var li = 0; li < opts.legal.length; li++) {
        var lv = opts.legal[li];
        var lc = cellCenter(m, lv.x, lv.y);
        ctx.fillStyle = turnCol;
        ctx.globalAlpha = 0.42;
        ctx.beginPath();
        ctx.arc(lc.x, lc.y, 4.5 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* 挡板（铅条：套印偏移 + 主体） */
    for (var wi = 0; wi < state.walls.length; wi++) {
      drawWall(ctx, m, state.walls[wi]);
    }

    /* 最新一手标记 */
    if (opts.lastMove) drawLastMove(ctx, m, opts.lastMove);

    /* 挡板预览（触屏两步） */
    if (opts.ghost) {
      var g = wallGeom(m, opts.ghost.x, opts.ghost.y, opts.ghost.o);
      var ok = opts.ghostOk !== false;
      var pc = ok ? T.playerColor(state.turn) : T.risoRed;
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = pc;
      U.roundRect(ctx, g.x, g.y, g.w, g.h, TH * u / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pc; ctx.lineWidth = Math.max(1, 1.6 * u);
      ctx.setLineDash([6 * u, 5 * u]);
      U.roundRect(ctx, g.x, g.y, g.w, g.h, TH * u / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      /* 中心十字 */
      var ccx = px(m, (opts.ghost.x + 1) * CELL);
      var ccy = py(m, (opts.ghost.y + 1) * CELL);
      ctx.strokeStyle = pc; ctx.lineWidth = Math.max(1, 1.4 * u);
      ctx.beginPath();
      ctx.moveTo(ccx - 7 * u, ccy); ctx.lineTo(ccx + 7 * u, ccy);
      ctx.moveTo(ccx, ccy - 7 * u); ctx.lineTo(ccx, ccy + 7 * u);
      ctx.stroke();
      if (!ok && opts.ghostReason) {
        U.text(ctx, opts.ghostReason, ccx, ccy + (opts.ghost.o === 'h' ? 30 * u : 46 * u), 13 * u, T.risoRed, 'serif', false, 'center');
      }
    }

    /* 棋子（套印错位铅块） */
    var players = four ? ['A', 'C', 'B', 'D'] : ['A', 'B'];
    for (var pi = 0; pi < players.length; pi++) {
      var pl = players[pi];
      var pos = C.pawnOf(state, pl);
      if (!pos) continue;
      var eliminated = four && C.isEliminated(state, pl);
      drawPawn(ctx, m, pos, pl, eliminated);
    }
  }

  function drawWall(ctx, m, w) {
    var g = wallGeom(m, w.x, w.y, w.o);
    var col = T.playerColor(w.by);
    /* 套印偏移（multiply 近似：半透明墨影） */
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = col;
    U.roundRect(ctx, g.x + 2 * m.u, g.y + 2.5 * m.u, g.w, g.h, g.h / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    U.roundRect(ctx, g.x, g.y, g.w, g.h, g.h / 2);
    ctx.fill();
  }

  function drawLastMove(ctx, m, mv) {
    var u = m.u;
    var col = T.playerColor(mv.player);
    if (mv.kind === 'pawn') {
      var f = cellCenter(m, mv.from.x, mv.from.y);
      var t = cellCenter(m, mv.to.x, mv.to.y);
      /* 起点空圈 */
      ctx.strokeStyle = col; ctx.lineWidth = 2 * u; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, 9 * u, 0, Math.PI * 2); ctx.stroke();
      /* 起讫点状轨迹 */
      ctx.lineWidth = 2.2 * u; ctx.globalAlpha = 0.55;
      ctx.setLineDash([2 * u, 9 * u]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      ctx.setLineDash([]); ctx.lineCap = 'butt';
      /* 落点四角裁切角标 */
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = col; ctx.lineWidth = 2.6 * u; ctx.lineCap = 'square';
      var x0 = px(m, mv.to.x * CELL), y0 = py(m, mv.to.y * CELL);
      var mIn = 7 * u, L = 18 * u, c = CELL * u;
      ctx.beginPath();
      ctx.moveTo(x0 + mIn + L, y0 + mIn); ctx.lineTo(x0 + mIn, y0 + mIn); ctx.lineTo(x0 + mIn, y0 + mIn + L);
      ctx.moveTo(x0 + c - mIn - L, y0 + mIn); ctx.lineTo(x0 + c - mIn, y0 + mIn); ctx.lineTo(x0 + c - mIn, y0 + mIn + L);
      ctx.moveTo(x0 + mIn, y0 + c - mIn - L); ctx.lineTo(x0 + mIn, y0 + c - mIn); ctx.lineTo(x0 + mIn + L, y0 + c - mIn);
      ctx.moveTo(x0 + c - mIn, y0 + c - mIn - L); ctx.lineTo(x0 + c - mIn, y0 + c - mIn); ctx.lineTo(x0 + c - mIn - L, y0 + c - mIn);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
    } else {
      /* 铅条外虚线校对圈 */
      var g = wallGeom(m, mv.wall.x, mv.wall.y, mv.wall.o);
      var pad = 7 * u;
      ctx.strokeStyle = col; ctx.lineWidth = 2.2 * u;
      ctx.setLineDash([9 * u, 7 * u]);
      ctx.globalAlpha = 0.85;
      U.roundRect(ctx, g.x - pad, g.y - pad, g.w + pad * 2, g.h + pad * 2, (g.h + pad * 2) / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  function drawPawn(ctx, m, pos, pl, eliminated) {
    var u = m.u;
    var col = T.playerColor(pl);
    var c = cellCenter(m, pos.x, pos.y);
    ctx.save();
    if (eliminated) ctx.globalAlpha = 0.42;
    /* 套印错位 */
    ctx.globalAlpha *= 1;
    ctx.fillStyle = col;
    ctx.globalAlpha = (eliminated ? 0.42 : 1) * 0.45;
    ctx.beginPath(); ctx.arc(c.x + 3.5 * u, c.y + 3.5 * u, PAWN_R * u, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = eliminated ? 0.42 : 1;
    /* 铅块主体 */
    ctx.beginPath(); ctx.arc(c.x, c.y, PAWN_R * u, 0, Math.PI * 2); ctx.fill();
    /* 内圈 */
    ctx.strokeStyle = T.paper; ctx.lineWidth = 1.4 * u; ctx.globalAlpha *= 0.85;
    ctx.beginPath(); ctx.arc(c.x, c.y, (PAWN_R - 4) * u, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = eliminated ? 0.42 : 1;
    /* 活字字符（反向错位 + 主体） */
    var ch = T.playerName(pl);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = U.font(34 * u, 'serifB', true);
    ctx.fillStyle = T.ink;
    ctx.globalAlpha = (eliminated ? 0.42 : 1) * 0.5;
    ctx.fillText(ch, c.x + 1.4 * u, c.y + 1.4 * u);
    ctx.globalAlpha = eliminated ? 0.42 : 1;
    ctx.fillStyle = T.paper;
    ctx.fillText(ch, c.x, c.y);
    /* 出局叉线 */
    if (eliminated) {
      ctx.strokeStyle = T.ink; ctx.lineWidth = 3.4 * u; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(c.x - 18 * u, c.y - 18 * u); ctx.lineTo(c.x + 18 * u, c.y + 18 * u);
      ctx.moveTo(c.x + 18 * u, c.y - 18 * u); ctx.lineTo(c.x - 18 * u, c.y + 18 * u);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  /* 步数墨迹：从 history 统计每格到访次数 */
  function traceOf(state) {
    var map = {};
    var h = state.history || [];
    for (var i = 0; i < h.length; i++) {
      var mv = h[i];
      if (mv.payload && mv.payload.type === 'pawn') {
        var k = mv.payload.to.x + ',' + mv.payload.to.y;
        map[k] = (map[k] || 0) + 1;
      }
    }
    return map;
  }

  /* 触屏放板浮条 —— 确定性布局（press/release/draw 共用同一几何） */
  var WALL_BAR = [
    { w: 36, kind: 'name' },
    { w: 52, label: '横 H', key: 'h' },
    { w: 52, label: '竖 V', key: 'v' },
    { w: 1, sep: true },
    { w: 66, label: '落板 ✓', key: 'ok' },
    { w: 40, label: '取消', plain: true, key: 'cancel' },
  ];
  function wallBarRects(W, y) {
    var total = 12;
    for (var i = 0; i < WALL_BAR.length; i++) total += WALL_BAR[i].w + (i ? 6 : 0);
    var x = (W - total) / 2;
    var cx = x + 10;
    var rects = {};
    for (var j = 0; j < WALL_BAR.length; j++) {
      var it = WALL_BAR[j];
      if (!it.sep && it.key) rects[it.key] = { x: cx, y: y + 6, w: it.w, h: 22 };
      else if (it.kind === 'name') rects.name = { x: cx, y: y, w: it.w, h: 34 };
      cx += it.w + 6;
    }
    return { x: x, y: y, w: total, h: 34, rects: rects };
  }

  /* 触屏放板浮条（绘制） */
  function wallActionBar(ctx, W, y, cellName, o, pressedBtn) {
    var lo = wallBarRects(W, y);
    var U_ = G.UI;
    ctx.fillStyle = 'rgba(26,26,26,0.16)';
    ctx.fillRect(lo.x + 4, y + 4, lo.w, 34);
    ctx.fillStyle = T.paper;
    ctx.fillRect(lo.x, y, lo.w, 34);
    ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5;
    ctx.strokeRect(lo.x, y, lo.w, 34);
    var cx = lo.x + 10;
    for (var j = 0; j < WALL_BAR.length; j++) {
      var it = WALL_BAR[j];
      if (it.sep) { ctx.fillStyle = 'rgba(26,26,26,0.4)'; ctx.fillRect(cx + 3, y + 9, 1, 16); cx += it.w + 6; continue; }
      if (it.kind === 'name') {
        U_.text(ctx, cellName, cx, y + 21, 10, 'rgba(26,26,26,0.6)', 'mono');
        cx += it.w + 6; continue;
      }
      var bx = cx, by = y + 6, bh = 22;
      if (it.plain) {
        if (pressedBtn === it.key) { ctx.fillStyle = T.ink; ctx.fillRect(bx, by, it.w, bh); }
        U_.text(ctx, it.label, bx + it.w / 2, by + bh / 2 + 1, 11,
          pressedBtn === it.key ? T.paper : 'rgba(26,26,26,0.55)', 'mono', false, 'center', 'middle');
      } else if (it.key === 'ok') {
        ctx.fillStyle = T.playerColor(G.App.state.turn);
        ctx.fillRect(bx, by, it.w, bh);
        U_.text(ctx, it.label, bx + it.w / 2, by + bh / 2 + 1, 11, T.paper, 'mono', true, 'center', 'middle');
      } else {
        ctx.fillStyle = it.key === 'h' ? (o === 'h' ? T.ink : T.paper) : (o === 'v' ? T.ink : T.paper);
        ctx.fillRect(bx, by, it.w, bh);
        ctx.strokeStyle = T.ink; ctx.lineWidth = 1.2;
        ctx.strokeRect(bx, by, it.w, bh);
        U_.text(ctx, it.label, bx + it.w / 2, by + bh / 2 + 1, 11,
          (it.key === 'h' ? o === 'h' : o === 'v') ? T.paper : T.ink, 'mono', false, 'center', 'middle');
      }
      cx += it.w + 6;
    }
    return lo;
  }

  G.Board = {
    metrics: metrics,
    px: px,
    py: py,
    cellCenter: cellCenter,
    wallGeom: wallGeom,
    hit: hit,
    colLetter: colLetter,
    drawBoard: drawBoard,
    traceOf: traceOf,
    wallActionBar: wallActionBar,
    wallBarRects: wallBarRects,
    cellName: function (x, y, N) { return colLetter(x, N) + (N - y); },
  };
})();

/* 步步为营 — 棋盘渲染与命中几何（Canvas 2D）
 * 栅格：pitch p；格子 c = p*0.86；格间缝隙 g = p - c 为挡板厚度区。
 * H(x,y)：第 y 与 y+1 行之间的横格线，覆盖 x、x+1 两列（长 p+c）。
 * V(x,y)：第 x 与 x+1 列之间的竖格线，覆盖 y、y+1 两行（长 p+c）。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var E = G.Engine;

  /* 依据可用区域与棋盘边长计算度量（棋盘总跨度 = N × p，含边缘半缝） */
  function metrics(N, availW, availH, cx, cy) {
    var p = Math.min(availW, availH) / N;
    var w = p * N;
    return {
      N: N,
      p: p,
      c: p * 0.84,
      w: w,
      x: cx - w / 2,
      y: cy - w / 2,
    };
  }

  function cellRect(m, x, y) {
    var cs = m.c;
    return { x: m.x + x * m.p + (m.p - cs) / 2, y: m.y + y * m.p + (m.p - cs) / 2, w: cs, h: cs };
  }

  function wallRect(m, x, y, o) {
    var g = m.p - m.c;
    if (o === 'h') {
      return { x: m.x + x * m.p + (m.p - m.c) / 2, y: m.y + (y + 1) * m.p - g / 2, w: m.c * 2 + g, h: g };
    }
    return { x: m.x + (x + 1) * m.p - g / 2, y: m.y + y * m.p + (m.p - m.c) / 2, w: g, h: m.c * 2 + g };
  }

  /* 命中：最近格子（含 touch 容差），返回 {x,y} 或 null */
  function hitCell(m, tx, ty, slop) {
    var s = slop == null ? m.p * 0.45 : slop;
    var best = null;
    var bestD = Infinity;
    for (var y = 0; y < m.N; y++) {
      for (var x = 0; x < m.N; x++) {
        var r = cellRect(m, x, y);
        var dx = Math.max(r.x - tx, 0, tx - (r.x + r.w));
        var dy = Math.max(r.y - ty, 0, ty - (r.y + r.h));
        var d = dx * dx + dy * dy;
        if (d <= s * s && d < bestD) {
          bestD = d;
          best = { x: x, y: y };
        }
      }
    }
    return best;
  }

  /* 命中：指定朝向下最近的挡板锚点，返回 {x,y,o} 或 null */
  function hitWall(m, tx, ty, o, slop) {
    var s = slop == null ? m.p * 0.62 : slop;
    var best = null;
    var bestD = Infinity;
    for (var y = 0; y <= m.N - 2; y++) {
      for (var x = 0; x <= m.N - 2; x++) {
        if (o === 'h' && x > m.N - 3) continue;
        if (o === 'v' && y > m.N - 3) continue;
        var r = wallRect(m, x, y, o);
        var dx = Math.max(r.x - tx, 0, tx - (r.x + r.w));
        var dy = Math.max(r.y - ty, 0, ty - (r.y + r.h));
        var d = dx * dx + dy * dy;
        if (d <= s * s && d < bestD) {
          bestD = d;
          best = { x: x, y: y, o: o };
        }
      }
    }
    return best;
  }

  /* —— 绘制 —— */
  function playerColor(p) {
    return p === 'A' ? T.red : T.blue;
  }

  function drawBoard(ctx, m, state, opts) {
    opts = opts || {};
    var N = m.N;

    /* 底纸 */
    U.fillRR(ctx, m.x - 10, m.y - 10, m.w + 20, m.w + 20, 16, '#FBF7EC');
    U.strokeRR(ctx, m.x - 10, m.y - 10, m.w + 20, m.w + 20, 16, T.ink, 3);

    /* 目标行染色：甲冲顶行（红），乙冲底行（蓝） */
    var topRow = cellRect(m, 0, 0);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = T.red;
    ctx.fillRect(m.x - 6, topRow.y - 4, m.w + 12, topRow.h + 8);
    ctx.fillStyle = T.blue;
    var botRow = cellRect(m, 0, N - 1);
    ctx.fillRect(m.x - 6, botRow.y - 4, m.w + 12, botRow.h + 8);
    ctx.globalAlpha = 1;

    /* 格子 */
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var r = cellRect(m, x, y);
        ctx.fillStyle = ((x + y) % 2 === 0) ? '#F2EAD6' : '#EFE5CC';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }

    /* 合法落点提示 */
    if (opts.legalMoves && opts.legalMoves.length) {
      var col = playerColor(opts.turn);
      for (var i = 0; i < opts.legalMoves.length; i++) {
        var lm = opts.legalMoves[i];
        var lr = cellRect(m, lm.x, lm.y);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(lr.x, lr.y, lr.w, lr.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(lr.x + 1, lr.y + 1, lr.w - 2, lr.h - 2);
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(lr.x + lr.w / 2, lr.y + lr.h / 2, Math.max(3, lr.w * 0.09), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* 挡板 */
    for (var wi = 0; wi < state.walls.length; wi++) {
      drawWall(ctx, m, state.walls[wi], 1);
    }

    /* 放板预览（幽灵板） */
    if (opts.ghost) {
      var ok = opts.ghostOk !== false;
      var gw = { x: opts.ghost.x, y: opts.ghost.y, o: opts.ghost.o, by: opts.turn };
      ctx.globalAlpha = 0.55;
      drawWall(ctx, m, gw, 1, ok ? playerColor(opts.turn) : '#9A9A9A');
      ctx.globalAlpha = 1;
      if (!ok) {
        var gr = wallRect(m, gw.x, gw.y, gw.o);
        ctx.strokeStyle = T.red;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        U.rr(ctx, gr.x - 3, gr.y - 3, gr.w + 6, gr.h + 6, 6);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    /* 棋子（铅字风格：色底圆 + 墨圈 + 汉字） */
    drawPawn(ctx, m, state.posA, 'A', opts.animA);
    drawPawn(ctx, m, state.posB, 'B', opts.animB);

    /* 行棋方棋子呼吸光圈 */
    if (opts.turn && !state.winner) {
      var tp = E.pawnOf(state, opts.turn);
      var tr = cellRect(m, tp.x, tp.y);
      var t = (opts.clock || 0) % 1200;
      var ph = t / 1200;
      var rr2 = tr.w * (0.62 + 0.1 * Math.sin(ph * Math.PI * 2));
      ctx.strokeStyle = playerColor(opts.turn);
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(ph * Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tr.x + tr.w / 2, tr.y + tr.h / 2, rr2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawWall(ctx, m, w, alpha, colorOverride) {
    var r = wallRect(m, w.x, w.y, w.o);
    var col = colorOverride || playerColor(w.by);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    /* 印刷偏移阴影 */
    U.fillRR(ctx, r.x + 2, r.y + 2.5, r.w, r.h, r.h / 2, 'rgba(26,26,26,0.28)');
    U.fillRR(ctx, r.x, r.y, r.w, r.h, r.h / 2, col);
    ctx.globalAlpha = 1;
  }

  function drawPawn(ctx, m, pos, p, anim) {
    var r = cellRect(m, pos.x, pos.y);
    var cx = r.x + r.w / 2;
    var cy = r.y + r.h / 2;
    var rad = r.w * 0.42;
    if (anim) {
      cx = anim.x;
      cy = anim.y;
      rad = r.w * 0.42 * (anim.scale == null ? 1 : anim.scale);
    }
    var col = playerColor(p);
    /* 落子动画：跳起弧线 */
    ctx.fillStyle = 'rgba(26,26,26,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx + 1.5, r.y + r.h * 0.9, rad * 0.75, rad * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = T.ink;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    /* 铅字汉字 */
    ctx.fillStyle = '#FBF7EC';
    ctx.font = G.UI.font(Math.round(rad * 1.05), 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p === 'A' ? '甲' : '乙', cx, cy + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  G.Board = {
    metrics: metrics,
    cellRect: cellRect,
    wallRect: wallRect,
    hitCell: hitCell,
    hitWall: hitWall,
    drawBoard: drawBoard,
    playerColor: playerColor,
  };
})();

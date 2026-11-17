/* 步步为营 — AI（移植自 Web 版 v10 的评估与候选窗口，压缩为单文件 ES5）
 * 三档位：
 *   1 学徒：一层贪心 + 扰动；2 排字师：两层搜索；3 总编：迭代加深至 4 层（时间封顶）。
 * 评估项（系数与 Web 版对齐）：路径差 + 板差·线性 + 板差·交换 + 板压交叉项 +
 *   行棋权节奏 + 对冲跳子修正 + 死巷惩罚 + 路径分岔自由度。
 * 核心：目标线反向 BFS 距离场缓存——棋子移动 O(1) 查距，放板才重建双场。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var E = G.Engine;
  var MAX_CELLS = 169;
  var EVAL_WIN = 10000;

  var AI_PROFILES = {
    1: { name: '学徒', thinking: '学徒正在捡字……' },
    2: { name: '排字师', thinking: '排字师正在排版……' },
    3: { name: '总编', thinking: '总编正在审校……' },
  };

  /* —— 搜索核心（可变状态 + 距离场缓存） —— */
  function makeCore(state) {
    var N = state.size;
    var W = N - 1;
    var grids = E.buildWallGrids(state.walls, N);
    var c = {
      size: N, W: W,
      h: grids.h, v: grids.v,
      posA: { x: state.posA.x, y: state.posA.y },
      posB: { x: state.posB.x, y: state.posB.y },
      wallsA: state.wallsA, wallsB: state.wallsB,
      dA: new Int16Array(MAX_CELLS), /* 到顶行（甲目标）距离场 */
      dB: new Int16Array(MAX_CELLS), /* 到底行（乙目标）距离场 */
    };
    rebuildFields(c);
    return c;
  }

  /* 反向 BFS：从目标线整行出发，得到每格到达该线的最短距离 */
  function goalField(grids, goalY, N) {
    var dist = new Int16Array(MAX_CELLS);
    dist.fill(-1);
    var queue = new Int16Array(MAX_CELLS);
    var head = 0, tail = 0;
    for (var x = 0; x < N; x++) {
      var idx = goalY * N + x;
      dist[idx] = 0;
      queue[tail++] = idx;
    }
    while (head < tail) {
      var cur = queue[head++];
      var cx = cur % N;
      var cy = (cur - cx) / N;
      var d = dist[cur];
      for (var i = 0; i < 4; i++) {
        var dx = i === 3 ? 1 : i === 2 ? -1 : 0;
        var dy = i === 1 ? 1 : i === 0 ? -1 : 0;
        var nx = cx + dx;
        var ny = cy + dy;
        if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
        if (E.edgeBlockedG(grids, cx, cy, dx, dy)) continue;
        var ni = ny * N + nx;
        if (dist[ni] >= 0) continue;
        dist[ni] = d + 1;
        queue[tail++] = ni;
      }
    }
    return dist;
  }

  function rebuildFields(c) {
    c.dA = goalField({ h: c.h, v: c.v, w: c.W }, 0, c.size);
    c.dB = goalField({ h: c.h, v: c.v, w: c.W }, c.size - 1, c.size);
  }

  function coreDist(c, p) {
    var N = c.size;
    var pos = p === 'A' ? c.posA : c.posB;
    var f = p === 'A' ? c.dA : c.dB;
    return f[pos.y * N + pos.x];
  }

  /* 搜索内试放（含撤销）：只改核心，不动真实局面 */
  function tryWall(c, x, y, o) {
    var W = c.W;
    var bit;
    if (o === 'h') { bit = c.h[y * W + x]; c.h[y * W + x] = 1; }
    else { bit = c.v[y * W + x]; c.v[y * W + x] = 1; }
    var oldA = c.dA, oldB = c.dB;
    rebuildFields(c);
    return { x: x, y: y, o: o, bit: bit, oldA: oldA, oldB: oldB };
  }

  function undoWall(c, u) {
    var W = c.W;
    if (u.o === 'h') c.h[u.y * W + u.x] = u.bit;
    else c.v[u.y * W + u.x] = u.bit;
    c.dA = u.oldA;
    c.dB = u.oldB;
  }

  function pawnMovesOf(c, p) {
    var N = c.size;
    var me = p === 'A' ? c.posA : c.posB;
    var other = p === 'A' ? c.posB : c.posA;
    var grids = { h: c.h, v: c.v, w: c.W };
    var res = [];
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (var k = 0; k < 4; k++) {
      var dx = dirs[k][0], dy = dirs[k][1];
      var nx = me.x + dx, ny = me.y + dy;
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (E.edgeBlockedG(grids, me.x, me.y, dx, dy)) continue;
      if (other.x === nx && other.y === ny) {
        var jx = me.x + 2 * dx, jy = me.y + 2 * dy;
        var inB = jx >= 0 && jx <= N - 1 && jy >= 0 && jy <= N - 1;
        if (inB && !E.edgeBlockedG(grids, nx, ny, dx, dy) && !(other.x === jx && other.y === jy)) {
          res.push({ x: jx, y: jy });
          continue;
        }
        var perps = dx !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
        for (var q = 0; q < 2; q++) {
          var sx = nx + perps[q][0], sy = ny + perps[q][1];
          if (sx < 0 || sx > N - 1 || sy < 0 || sy > N - 1) continue;
          if (E.edgeBlockedG(grids, nx, ny, perps[q][0], perps[q][1])) continue;
          if (other.x === sx && other.y === sy) continue;
          res.push({ x: sx, y: sy });
        }
      } else {
        res.push({ x: nx, y: ny });
      }
    }
    return res;
  }

  function countMoves(c, p) {
    return pawnMovesOf(c, p).length;
  }

  /* —— 候选生成（窗口移植自 Web 版；probe=true 仅根节点做 BFS 增益探测） —— */
  function genCands(c, p, wallLimit, probe) {
    var N = c.size;
    var W = c.W;
    var me = p === 'A' ? c.posA : c.posB;
    var op = p === 'A' ? c.posB : c.posA;
    var grids = { h: c.h, v: c.v, w: W };
    var myWalls = p === 'A' ? c.wallsA : c.wallsB;
    var seen = {};
    var walls = [];

    function consider(x, y, o, base) {
      if (myWalls <= 0) return;
      if (x < 0 || x > N - 2 || y < 0 || y > N - 2) return;
      var key = o + x + ',' + y;
      if (seen[key]) {
        return;
      }
      /* 冲突快查（重叠/交叉） */
      if (o === 'h') {
        if ((x >= 1 && c.h[y * W + x - 1]) || c.h[y * W + x] || (x + 1 <= W - 1 && c.h[y * W + x + 1]) || c.v[y * W + x]) return;
      } else {
        if ((y >= 1 && c.v[(y - 1) * W + x]) || c.v[y * W + x] || (y + 1 <= W - 1 && c.v[(y + 1) * W + x]) || c.h[y * W + x]) return;
      }
      seen[key] = true;
      walls.push({ payload: { type: 'wall', wall: { x: x, y: y, o: o, by: p } }, score: base });
    }

    /* 对手周边窗口 */
    for (var dx = -2; dx <= 2; dx++) {
      for (var dy = -2; dy <= 2; dy++) {
        var base = (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) ? 6 : 2;
        consider(op.x + dx, op.y + dy, 'h', base);
        consider(op.x + dx, op.y + dy, 'v', base);
      }
    }
    /* 己方走廊自卫板 */
    for (var d2 = -1; d2 <= 1; d2++) {
      consider(me.x + d2, me.y - 2, 'h', 4);
      consider(me.x + d2, me.y + 2, 'h', 4);
    }
    for (var d3 = -1; d3 <= 1; d3++) {
      consider(me.x - 2, me.y + d3, 'v', 4);
      consider(me.x + 2, me.y + d3, 'v', 4);
    }
    /* 对手终点行前沿 */
    var opGoal = p === 'A' ? N - 1 : 0;
    for (var d4 = -2; d4 <= 2; d4++) {
      consider(op.x + d4, opGoal === 0 ? 0 : N - 2, 'h', 3);
    }
    /* 沿既有挡板端点延伸 */
    for (var idx = 0; idx < W * W; idx++) {
      if (c.h[idx]) {
        var hy = (idx / W) | 0;
        var hx = idx - hy * W;
        consider(hx - 2, hy, 'h', 3);
        consider(hx + 2, hy, 'h', 3);
      }
      if (c.v[idx]) {
        var vy = (idx / W) | 0;
        var vx = idx - vy * W;
        consider(vx, vy - 2, 'v', 3);
        consider(vx, vy + 2, 'v', 3);
      }
    }

    /* 棋子着法：按推进收益排序 */
    var myField = p === 'A' ? c.dA : c.dB;
    var myD = coreDist(c, p);
    var opD = coreDist(c, p === 'A' ? 'B' : 'A');
    var pawnsCands = [];
    var moves = pawnMovesOf(c, p);
    for (var m = 0; m < moves.length; m++) {
      var mv = moves[m];
      var nd = myField[mv.y * N + mv.x];
      var gain = (myD - nd) * 10 + (nd < 0 ? -50 : 0);
      pawnsCands.push({ payload: { type: 'pawn', from: { x: me.x, y: me.y }, to: mv }, score: 20 + gain });
    }
    pawnsCands.sort(function (a, b) { return b.score - a.score; });

    walls.sort(function (a, b) { return b.score - a.score; });
    var wallCands;
    if (probe) {
      /* 根节点：BFS 增益探测——仅保留对手路径变长且不断路的板 */
      var probed = [];
      var kept = 0;
      for (var wi = 0; wi < walls.length && kept < wallLimit; wi++) {
        var wl = walls[wi].payload.wall;
        var u = tryWall(c, wl.x, wl.y, wl.o);
        var nOp = coreDist(c, p === 'A' ? 'B' : 'A');
        var nMy = coreDist(c, p);
        undoWall(c, u);
        if (nOp < 0 || nMy < 0) continue; /* 断路板不入选 */
        var cand = walls[wi];
        cand.score = cand.score + (nOp - opD) * 6 - (nMy - myD) * 6;
        probed.push(cand);
        kept++;
      }
      wallCands = probed;
    } else {
      /* 内点：仅冲突快查（断路由评估的归责项惩罚），截断到上限 */
      wallCands = walls.slice(0, wallLimit);
    }
    wallCands.sort(function (a, b) { return b.score - a.score; });

    var all = wallCands.concat(pawnsCands);
    all.sort(function (a, b) { return b.score - a.score; });
    return all;
  }

  /* —— 评估（视角：me 一方） —— */
  function collisionAdj(c, me, mover) {
    var yA = c.posA.y, xA = c.posA.x, yB = c.posB.y, xB = c.posB.x;
    if (xA !== xB || yA <= yB) return 0;
    var d = yA - yB;
    if (d < 2 || d > 6) return 0;
    var grids = { h: c.h, v: c.v, w: c.W };
    for (var y = yB; y < yA; y++) {
      if (E.edgeBlockedG(grids, xA, y, 0, 1)) return 0;
    }
    var jumper = d % 2 === 1 ? mover : (mover === 'A' ? 'B' : 'A');
    return jumper === me ? 2 : -2;
  }

  function forwardChoices(c, p, d) {
    if (d <= 0) return 0;
    var N = c.size;
    var pos = p === 'A' ? c.posA : c.posB;
    var f = p === 'A' ? c.dA : c.dB;
    var grids = { h: c.h, v: c.v, w: c.W };
    var cnt = 0;
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (var i = 0; i < 4; i++) {
      var nx = pos.x + dirs[i][0];
      var ny = pos.y + dirs[i][1];
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (E.edgeBlockedG(grids, pos.x, pos.y, dirs[i][0], dirs[i][1])) continue;
      if (f[ny * N + nx] === d - 1) cnt++;
    }
    return cnt;
  }

  function evaluate(c, me, mover, lastWallBy, ply) {
    var dA = coreDist(c, 'A');
    var dB = coreDist(c, 'B');
    if (dA === 0) return me === 'A' ? EVAL_WIN - ply : -(EVAL_WIN - ply);
    if (dB === 0) return me === 'B' ? EVAL_WIN - ply : -(EVAL_WIN - ply);
    if (dA < 0 || dB < 0) {
      /* 断路：归罪最后放板者 */
      return lastWallBy === me ? -(EVAL_WIN - ply) : EVAL_WIN - ply;
    }
    var myD = me === 'A' ? dA : dB;
    var opD = me === 'A' ? dB : dA;
    var myWalls = me === 'A' ? c.wallsA : c.wallsB;
    var opWalls = me === 'A' ? c.wallsB : c.wallsA;
    var mobMe = countMoves(c, me);
    var mobOp = countMoves(c, me === 'A' ? 'B' : 'A');

    var score = (opD - myD) + 0.3 * (myWalls - opWalls) + 0.1 * (mobMe - mobOp);
    score += Math.min(myWalls * 0.45, 6) - Math.min(opWalls * 0.45, 6);
    var pressMe = Math.min(myWalls, 10) * Math.min(opD, 12);
    var pressOp = Math.min(opWalls, 10) * Math.min(myD, 12);
    score += 0.04 * (pressMe - pressOp);
    if (Math.abs(opD - myD) <= 2) score += mover === me ? 0.25 : -0.25;
    score += collisionAdj(c, me, mover);
    if (mobMe <= 3) score -= (4 - mobMe) * 0.5;
    var fwdMe = Math.min(forwardChoices(c, me, myD), 3);
    var fwdOp = Math.min(forwardChoices(c, me === 'A' ? 'B' : 'A', opD), 3);
    score += 0.15 * (fwdMe - fwdOp);
    return score;
  }

  /* 双方无板：纯竞速近似判胜（胜者真实到达层 = ply + 2×距离 −（胜者先手 ? 2 : 1）） */
  function raceEval(c, me, mover, ply) {
    var dA = coreDist(c, 'A');
    var dB = coreDist(c, 'B');
    if (dA === 0) return me === 'A' ? EVAL_WIN - ply + 1 : -(EVAL_WIN - ply + 1);
    if (dB === 0) return me === 'B' ? EVAL_WIN - ply + 1 : -(EVAL_WIN - ply + 1);
    var myD = me === 'A' ? dA : dB;
    var opD = me === 'A' ? dB : dA;
    var iWin = myD < opD || (myD === opD && mover === me);
    var winner = iWin ? me : (me === 'A' ? 'B' : 'A');
    var dW = iWin ? myD : opD;
    var arrival = ply + 2 * dW - (mover === winner ? 2 : 1);
    var val = EVAL_WIN - arrival;
    return winner === me ? val : -val;
  }

  /* —— α-β 搜索（视点固定为 AI 一方） —— */
  var _nodes = 0;
  var _deadline = 0;
  var _aborted = false;

  function searchAB(c, me, turn, depth, alpha, beta, ply, lastWallBy, wallLimit) {
    _nodes++;
    if ((_nodes & 63) === 0 && G._now() > _deadline) {
      _aborted = true;
      return 0;
    }
    var mover = turn;
    if (c.wallsA <= 0 && c.wallsB <= 0) {
      return raceEval(c, me, mover, ply);
    }
    if (depth <= 0) {
      return evaluate(c, me, mover, lastWallBy, ply);
    }
    var cands = genCands(c, turn, wallLimit, false);
    if (cands.length === 0) return evaluate(c, me, mover, lastWallBy, ply);

    var isMax = turn === me;
    var best = isMax ? -Infinity : Infinity;
    for (var i = 0; i < cands.length; i++) {
      var payload = cands[i].payload;
      var val;
      if (payload.type === 'pawn') {
        var posRef = turn === 'A' ? c.posA : c.posB;
        var ox = posRef.x, oy = posRef.y;
        posRef.x = payload.to.x;
        posRef.y = payload.to.y;
        val = searchAB(c, me, turn === 'A' ? 'B' : 'A', depth - 1, alpha, beta, ply + 1, lastWallBy, wallLimit);
        posRef.x = ox;
        posRef.y = oy;
      } else {
        var wl = payload.wall;
        var u = tryWall(c, wl.x, wl.y, wl.o);
        if (turn === 'A') c.wallsA--; else c.wallsB--;
        val = searchAB(c, me, turn === 'A' ? 'B' : 'A', depth - 1, alpha, beta, ply + 1, turn, wallLimit);
        undoWall(c, u);
        if (turn === 'A') c.wallsA++; else c.wallsB++;
      }
      if (_aborted) return 0;
      if (isMax) {
        if (val > best) best = val;
        if (best > alpha) alpha = best;
      } else {
        if (val < best) best = val;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    return best;
  }

  /* —— 决策入口 —— */
  /* state: 真实局面；me: AI 执子；level: 1|2|3
   * 返回 { payload, label } 或 null（无合法着法——理论不会发生） */
  function computeAiMove(state, me, level) {
    var c = makeCore(state);
    var wallLimit = level >= 3 ? 14 : level === 2 ? 10 : 6;
    var maxDepth = level >= 3 ? 4 : level === 2 ? 2 : 1;
    var timeCap = level >= 3 ? 700 : level === 2 ? 250 : 60;

    var cands = genCands(c, me, wallLimit, true);
    if (cands.length === 0) {
      var fallback = pawnMovesOf(c, me);
      if (fallback.length === 0) return null;
      var fpos = me === 'A' ? c.posA : c.posB;
      return { payload: { type: 'pawn', from: { x: fpos.x, y: fpos.y }, to: fallback[0] }, label: '' };
    }

    _nodes = 0;
    _aborted = false;
    _deadline = G._now() + timeCap;

    var bestCand = null;
    var bestScore = -Infinity;
    /* 迭代加深（总编）：超时保底上一层结果 */
    for (var depth = 1; depth <= maxDepth; depth++) {
      var iterBest = null;
      var iterScore = -Infinity;
      var alpha = -Infinity;
      var ok = true;
      for (var i = 0; i < cands.length; i++) {
        var payload = cands[i].payload;
        var val;
        if (payload.type === 'pawn') {
          var posRef = me === 'A' ? c.posA : c.posB;
          var ox = posRef.x, oy = posRef.y;
          posRef.x = payload.to.x;
          posRef.y = payload.to.y;
          val = searchAB(c, me, me === 'A' ? 'B' : 'A', depth - 1, alpha, Infinity, 1, null, wallLimit);
          posRef.x = ox;
          posRef.y = oy;
        } else {
          var wl = payload.wall;
          var u = tryWall(c, wl.x, wl.y, wl.o);
          if (me === 'A') c.wallsA--; else c.wallsB--;
          val = searchAB(c, me, me === 'A' ? 'B' : 'A', depth - 1, alpha, Infinity, 1, me, wallLimit);
          undoWall(c, u);
          if (me === 'A') c.wallsA++; else c.wallsB++;
        }
        if (_aborted) { ok = false; break; }
        /* 学徒扰动：分数加 ±0.35 噪声，让低档位有活气 */
        if (level === 1) val += (Math.random() - 0.5) * 0.7;
        if (val > iterScore) {
          iterScore = val;
          iterBest = payload;
        }
        if (iterScore > alpha) alpha = iterScore;
      }
      if (ok && iterBest) {
        bestCand = iterBest;
        bestScore = iterScore;
      }
      if (_aborted || G._now() > _deadline) break;
    }

    if (!bestCand) bestCand = cands[0].payload;
    var label = '';
    if (bestCand.type === 'wall') {
      label = '挡板 ' + E.cellName({ x: bestCand.wall.x, y: bestCand.wall.y }, state.size - 1) + (bestCand.wall.o === 'h' ? '横' : '竖');
    } else {
      label = E.PLAYER_CN[me] + ' 落子 ' + E.cellName(bestCand.to, state.size);
    }
    return { payload: bestCand, label: label, score: bestScore };
  }

  G.AI = {
    computeAiMove: computeAiMove,
    PROFILES: AI_PROFILES,
  };
})();

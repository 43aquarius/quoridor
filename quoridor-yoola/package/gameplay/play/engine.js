/* 步步为营 — 规则引擎（移植自 Web 版 engine.ts / types.ts，纯函数、无副作用）
 * 坐标系：x = 列 0..N-1（自左向右）；y = 行 0..N-1（自上向下）。
 * 甲（A）执荧光红，起于底边中列，目标顶行；乙（B）执钴蓝，起于顶边中列，目标底行。
 * 挡板锚点 (x,y) ∈ 0..N-2：H 横置覆盖 (x,y)(x+1,y) 下缘格线；V 竖置覆盖 (x,y)(x,y+1) 右缘格线。
 * 跳子：正面相邻棋子不可走入其格；身后无阻且落位无子可直跳；直跳被堵时可斜跳两侧。
 * 本作品为二人局（平台禁止联网，四人围坐与在线对战不入包）。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};

  var DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  var COL_LETTERS = 'abcdefghijklm';
  var PLAYER_CN = { A: '甲', B: '乙' };

  /* —— 规格清洗 —— */
  function recommendedWalls(size) {
    var table = { 5: 5, 7: 8, 9: 10, 11: 12, 13: 14 };
    return table[size] || 10;
  }

  function normalizeConfig(c) {
    var size = Math.round(Number(c && c.size));
    if (!isFinite(size) || size <= 0) size = 9;
    if (size % 2 === 0) size += 1;
    size = Math.min(13, Math.max(5, size));
    var walls = Math.round(Number(c && c.wallsPerPlayer));
    if (!isFinite(walls)) walls = recommendedWalls(size);
    walls = Math.min(20, Math.max(0, walls));
    return { size: size, wallsPerPlayer: walls };
  }

  function initialGame(config) {
    var c = normalizeConfig(config);
    var mid = (c.size - 1) / 2;
    return {
      size: c.size,
      wallsStart: c.wallsPerPlayer,
      playerCount: 2,
      posA: { x: mid, y: c.size - 1 },
      posB: { x: mid, y: 0 },
      wallsA: c.wallsPerPlayer,
      wallsB: c.wallsPerPlayer,
      walls: [],
      turn: 'A',
      history: [],
      winner: null,
      winReason: null,
    };
  }

  function boardSize(state) {
    return isFinite(state && state.size) ? state.size : 9;
  }

  function pawnOf(state, p) {
    return p === 'A' ? state.posA : state.posB;
  }

  function allPawns(state) {
    return [state.posA, state.posB];
  }

  function wallsLeftOf(state, p) {
    return p === 'A' ? state.wallsA : state.wallsB;
  }

  function withPawn(state, p, to) {
    var s = cloneState(state);
    if (p === 'A') s.posA = { x: to.x, y: to.y };
    else s.posB = { x: to.x, y: to.y };
    return s;
  }

  function withWallsLeft(state, p, left) {
    var s = cloneState(state);
    if (p === 'A') s.wallsA = left;
    else s.wallsB = left;
    return s;
  }

  function opponent(p) {
    return p === 'A' ? 'B' : 'A';
  }

  /* 浅拷贝（history 数组引用共享，用于搜索内的快速试放；落子入口统一重建） */
  function cloneState(state) {
    return {
      size: state.size,
      wallsStart: state.wallsStart,
      playerCount: state.playerCount,
      posA: state.posA,
      posB: state.posB,
      wallsA: state.wallsA,
      wallsB: state.wallsB,
      walls: state.walls,
      turn: state.turn,
      history: state.history,
      winner: state.winner,
      winReason: state.winReason,
    };
  }

  /* —— 挡板格线快查位图（步长 W = N-1） —— */
  function buildWallGrids(walls, size) {
    var w = (size || 9) - 1;
    var h = new Uint8Array(w * w);
    var v = new Uint8Array(w * w);
    for (var i = 0; i < walls.length; i++) {
      var wall = walls[i];
      if (wall.o === 'h') h[wall.y * w + wall.x] = 1;
      else v[wall.y * w + wall.x] = 1;
    }
    return { h: h, v: v, w: w };
  }

  /* 判断棋子从 (x,y) 向 (dx,dy) 走一格是否被挡板拦住 */
  function edgeBlockedG(g, x, y, dx, dy) {
    var W = g.w;
    var last = W - 1;
    if (dy === -1) {
      return !!((x <= last && g.h[(y - 1) * W + x]) || (x > 0 && g.h[(y - 1) * W + x - 1]));
    }
    if (dy === 1) {
      return !!((x <= last && g.h[y * W + x]) || (x > 0 && g.h[y * W + x - 1]));
    }
    if (dx === 1) {
      return !!((y <= last && g.v[y * W + x]) || (y > 0 && g.v[(y - 1) * W + x]));
    }
    if (dx === -1) {
      return !!((y <= last && g.v[y * W + x - 1]) || (y > 0 && g.v[(y - 1) * W + x - 1]));
    }
    return false;
  }

  function edgeBlocked(walls, x, y, dx, dy) {
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (dy !== 0 && w.o === 'h') {
        var wy = dy === 1 ? y : y - 1;
        if (w.y === wy && (w.x === x || w.x === x - 1)) return true;
      }
      if (dx !== 0 && w.o === 'v') {
        var wx = dx === 1 ? x : x - 1;
        if (w.x === wx && (w.y === y || w.y === y - 1)) return true;
      }
    }
    return false;
  }

  /* —— 挡板冲突判定：重叠（同向共线差 1）或十字交叉（同锚点异向） —— */
  function wallConflictType(walls, x, y, o) {
    for (var i = 0; i < walls.length; i++) {
      var e = walls[i];
      if (o === 'h') {
        if (e.o === 'h' && e.y === y && Math.abs(e.x - x) <= 1) return 'overlap';
        if (e.o === 'v' && e.x === x && e.y === y) return 'cross';
      } else {
        if (e.o === 'v' && e.x === x && Math.abs(e.y - y) <= 1) return 'overlap';
        if (e.o === 'h' && e.x === x && e.y === y) return 'cross';
      }
    }
    return null;
  }

  /* —— BFS：某席到目标线的最短步数 —— */
  var _dist = new Int16Array(169);
  var _queue = new Int16Array(169);
  var _seen = new Uint8Array(169);

  function goalLine(p, N) {
    return p === 'A' ? { axisX: false, v: 0 } : { axisX: false, v: N - 1 };
  }

  function bfsDistanceToGoal(grids, from, p, N) {
    var gl = goalLine(p, N);
    if (gl.axisX ? from.x === gl.v : from.y === gl.v) return 0;
    _dist.fill(-1);
    _seen.fill(0);
    var start = from.y * N + from.x;
    _dist[start] = 0;
    _seen[start] = 1;
    var head = 0, tail = 0;
    _queue[tail++] = start;
    while (head < tail) {
      var cur = _queue[head++];
      var cx = cur % N;
      var cy = (cur - cx) / N;
      var d = _dist[cur];
      if (gl.axisX ? cx === gl.v : cy === gl.v) return d;
      for (var i = 0; i < 4; i++) {
        var dx = i === 3 ? 1 : i === 2 ? -1 : 0;
        var dy = i === 1 ? 1 : i === 0 ? -1 : 0;
        var nx = cx + dx;
        var ny = cy + dy;
        if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
        if (edgeBlockedG(grids, cx, cy, dx, dy)) continue;
        var ni = ny * N + nx;
        if (_seen[ni]) continue;
        _seen[ni] = 1;
        _dist[ni] = d + 1;
        _queue[tail++] = ni;
      }
    }
    return -1;
  }

  function shortestPathLength(state, p) {
    var N = boardSize(state);
    var grids = buildWallGrids(state.walls, N);
    return bfsDistanceToGoal(grids, pawnOf(state, p), p, N);
  }

  function hasPath(state, p) {
    return shortestPathLength(state, p) >= 0;
  }

  /* —— 合法着法 —— */
  function legalPawnMoves(state, p) {
    var N = boardSize(state);
    var me = pawnOf(state, p);
    var other = p === 'A' ? state.posB : state.posA;
    var occupied = function (x, y) {
      return other.x === x && other.y === y;
    };
    var res = [];
    for (var k = 0; k < 4; k++) {
      var dx = DIRS[k][0];
      var dy = DIRS[k][1];
      var nx = me.x + dx;
      var ny = me.y + dy;
      if (nx < 0 || nx > N - 1 || ny < 0 || ny > N - 1) continue;
      if (edgeBlocked(state.walls, me.x, me.y, dx, dy)) continue;
      if (occupied(nx, ny)) {
        var jx = me.x + 2 * dx;
        var jy = me.y + 2 * dy;
        var straightInBounds = jx >= 0 && jx <= N - 1 && jy >= 0 && jy <= N - 1;
        var straightClear = straightInBounds && !edgeBlocked(state.walls, nx, ny, dx, dy) && !occupied(jx, jy);
        if (straightClear) {
          res.push({ x: jx, y: jy });
          continue;
        }
        var perps = dx !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
        for (var q = 0; q < 2; q++) {
          var px = perps[q][0];
          var py = perps[q][1];
          var sx = nx + px;
          var sy = ny + py;
          if (sx < 0 || sx > N - 1 || sy < 0 || sy > N - 1) continue;
          if (edgeBlocked(state.walls, nx, ny, px, py)) continue;
          if (occupied(sx, sy)) continue;
          res.push({ x: sx, y: sy });
        }
      } else {
        res.push({ x: nx, y: ny });
      }
    }
    return res;
  }

  function countPawnMoves(state, p) {
    return legalPawnMoves(state, p).length;
  }

  function checkWall(state, x, y, o, by) {
    var N = boardSize(state);
    if (x < 0 || x > N - 2 || y < 0 || y > N - 2) return { ok: false, reason: 'out-of-bounds' };
    var left = wallsLeftOf(state, by);
    if (left <= 0) return { ok: false, reason: 'no-walls' };
    var conflict = wallConflictType(state.walls, x, y, o);
    if (conflict === 'overlap') return { ok: false, reason: 'overlap' };
    if (conflict === 'cross') return { ok: false, reason: 'cross' };
    var grids = buildWallGrids(state.walls, N);
    if (o === 'h') grids.h[y * (N - 1) + x] = 1;
    else grids.v[y * (N - 1) + x] = 1;
    var pA = bfsDistanceToGoal(grids, state.posA, 'A', N);
    if (pA < 0) return { ok: false, reason: 'no-path' };
    var pB = bfsDistanceToGoal(grids, state.posB, 'B', N);
    if (pB < 0) return { ok: false, reason: 'no-path' };
    return { ok: true };
  }

  function hasWonCell(p, x, y, size) {
    var N = size || 9;
    if (p === 'A') return y === 0;
    return y === N - 1;
  }

  /* —— 落子应用（真实入口：重建 history 数组保证可序列化） —— */
  function applyPayload(state, player, payload, elapsedMs) {
    if (state.winner) return { ok: false, reason: 'game-over' };
    if (state.turn !== player) return { ok: false, reason: 'not-your-turn' };

    var N = boardSize(state);
    var next;
    if (payload.type === 'pawn') {
      var legal = legalPawnMoves(state, player);
      var found = false;
      for (var i = 0; i < legal.length; i++) {
        if (legal[i].x === payload.to.x && legal[i].y === payload.to.y) { found = true; break; }
      }
      if (!found) return { ok: false, reason: 'illegal-pawn' };
      next = withPawn(state, player, payload.to);
      next.history = state.history.slice(0);
      next.history.push(makeMove(state, player, pawnNotation(payload.from, payload.to, N), payload, elapsedMs));
      if (hasWonCell(player, payload.to.x, payload.to.y, N)) {
        next.winner = player;
        next.winReason = 'goal';
      } else {
        next.turn = opponent(player);
      }
      return { ok: true, state: next };
    }
    if (payload.type === 'wall') {
      var chk = checkWall(state, payload.wall.x, payload.wall.y, payload.wall.o, player);
      if (!chk.ok) return { ok: false, reason: chk.reason };
      next = cloneState(state);
      var walls = state.walls.slice(0);
      var w = { x: payload.wall.x, y: payload.wall.y, o: payload.wall.o, by: player };
      walls.push(w);
      next.walls = walls;
      if (player === 'A') next.wallsA = state.wallsA - 1;
      else next.wallsB = state.wallsB - 1;
      next.history = state.history.slice(0);
      next.history.push(makeMove(state, player, wallNotation(w, N), payload, elapsedMs));
      next.turn = opponent(player);
      return { ok: true, state: next };
    }
    return { ok: false, reason: 'game-over' };
  }

  function makeMove(state, player, notation, payload, elapsedMs) {
    return {
      n: state.history.length + 1,
      player: player,
      notation: notation,
      elapsedMs: elapsedMs || 0,
      t: Date.now(),
      payload: payload,
    };
  }

  function applyResign(state, player) {
    var next = cloneState(state);
    next.history = state.history.slice(0);
    next.history.push(makeMove(state, player, PLAYER_CN[player] + '认输', { type: 'resign' }, 0));
    next.winner = opponent(player);
    next.winReason = 'resign';
    return next;
  }

  /* 由历史重建局面（悔棋实现基础） */
  function stateFromHistory(moves, upto, config) {
    var s = initialGame(config);
    var n = upto == null ? moves.length : Math.min(upto, moves.length);
    for (var i = 0; i < n; i++) {
      var m = moves[i];
      if (m.payload.type === 'resign') {
        s = applyResign(s, m.player);
      } else {
        var r = applyPayload(s, m.player, m.payload, m.elapsedMs);
        if (r.ok && r.state) s = r.state;
      }
    }
    return s;
  }

  /* —— 代数记谱 —— */
  function colLetter(x, size) {
    return COL_LETTERS.charAt(Math.min(x, size - 1));
  }

  function cellName(v, size) {
    return colLetter(v.x, size) + String(size - v.y);
  }

  function pawnNotation(from, to, size) {
    return cellName(from, size) + '→' + cellName(to, size);
  }

  function wallNotation(w, size) {
    return '挡板 ' + colLetter(w.x, size - 1) + String(size - 1 - w.y) + (w.o === 'h' ? '横' : '竖');
  }

  G.Engine = {
    initialGame: initialGame,
    normalizeConfig: normalizeConfig,
    boardSize: boardSize,
    pawnOf: pawnOf,
    allPawns: allPawns,
    wallsLeftOf: wallsLeftOf,
    opponent: opponent,
    cloneState: cloneState,
    buildWallGrids: buildWallGrids,
    edgeBlockedG: edgeBlockedG,
    edgeBlocked: edgeBlocked,
    wallConflictType: wallConflictType,
    bfsDistanceToGoal: bfsDistanceToGoal,
    shortestPathLength: shortestPathLength,
    hasPath: hasPath,
    legalPawnMoves: legalPawnMoves,
    countPawnMoves: countPawnMoves,
    checkWall: checkWall,
    applyPayload: applyPayload,
    applyResign: applyResign,
    stateFromHistory: stateFromHistory,
    pawnNotation: pawnNotation,
    wallNotation: wallNotation,
    cellName: cellName,
    PLAYER_CN: PLAYER_CN,
  };
})();

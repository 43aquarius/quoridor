/* 步步为营 — 对局场景（Web 版 GameView + Sidebar + VictoryOverlay 的竖屏合一）
 * 标题区 / 棋盘 / 对局状态卡 / 本手用时 / 着法记录 / 按钮行 / 色版条 /
 * 触屏两步放板浮条 / 认输确认弹层 / 结算浮层。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var B = G.Board;
  var Page = G.Page;
  var C = null;

  var pg = null;
  var pressed = {};
  var legal = [];          /* 当前可行走格 */
  var touchWall = null;    /* {x,y,o} 已选板位 */
  var wallPreview = null;  /* {x,y,o,ok,reason} 预览态（非法原因文案） */
  var aiThinking = false;
  var aiTimer = null;
  var resignAsk = false;
  var resultShown = false;
  var savedToArchive = false;
  var toast = null;        /* {text, until} 校对退回提示 */
  var strike = null;       /* {x,y,o,k} 驳回划线 */

  /* 棋钟 */
  var turnStart = 0;
  var totals = { A: 0, B: 0, C: 0, D: 0 };
  var aiBudget = [0, 280, 650, 1500, 2000];

  var REJECT_TEXT = {
    overlap: '与已有铅条重叠', cross: '十字交叉', 'no-path': '此路不通',
    'no-walls': '挡板已用尽', 'not-your-turn': '还未轮到你', occupied: '格子被占',
    blocked: '不可穿墙', 'illegal-pawn': '这步棋不可行', 'game-over': '对局已收笔',
  };

  function S() { return Math.min(G.Layout.w / 414, 1.25); }

  function isHumanTurn() {
    var App = G.App;
    var st = App.state;
    if (!st || st.winner) return false;
    if (App.mode === 'local') return true;
    if (App.mode === 'quad') return !!App.seats[st.turn];
    /* 单人：先手执甲 */
    return App.humanFirst ? st.turn === 'A' : st.turn === 'B';
  }
  function humanSeat() {
    var App = G.App;
    if (App.mode === 'local') return null;
    if (App.mode === 'quad') return null;
    return App.humanFirst ? 'A' : 'B';
  }

  function layout() {
    var L = G.Layout;
    var W = L.w;
    var s = S();
    var pad = 20 * s;
    var cw = W - pad * 2;
    var App = G.App;
    var lo = { W: W, S: s, pad: pad, cw: cw };

    lo.statusY = Math.max(L.safeTop, 14) + 16 * s;
    var y = lo.statusY + 26 * s;

    /* 章头（Web GameView header：对 局 + 模式 + 规格徽标 + 第 N 手，border-b-2） */
    lo.headY = y;
    y += 74 * s;

    /* 棋盘（Web max-w min(94vw,72vh,640px) 居中） */
    var boardW = Math.min(cw + 8 * s, 420 * s);
    lo.board = B.metrics(App.state ? App.state.size : 9, boardW, (W - boardW) / 2, y);
    y += boardW + 16 * s;
    lo.hintY = y;
    y += 20 * s;

    /* 对局状态卡（Web Sidebar 1:1） */
    lo.status = { x: pad, y: y, w: cw, h: 0 };
    var four = App.state && App.state.playerCount === 4;
    var rows = four ? 4 : 2;
    lo.playerRows = [];
    var order = four ? ['A', 'C', 'B', 'D'] : ['A', 'B'];
    for (var i = 0; i < rows; i++) {
      lo.playerRows.push({ x: pad + 16 * s, y: y + 46 * s + i * (92 * s + 10 * s), w: cw - 32 * s, h: 92 * s, p: order[i] });
    }
    y += 46 * s + rows * (92 * s + 10 * s);
    /* 本手用时行（dashed 顶线） */
    lo.moveLblY = y + 14 * s;
    lo.moveTimeY = lo.moveLblY + 34 * s;
    y = lo.moveTimeY + 26 * s;
    lo.status.h = y - lo.status.y;
    y += 20 * s;

    /* 着法记录卡 */
    lo.record = { x: pad, y: y, w: cw, h: 168 * s };
    y += lo.record.h + 16 * s;

    /* 按钮行（Web：outline 三枚带图标 + ghost ← 目录；图标左、文字右起，窄钮收紧字距防溢出） */
    var bw = (cw - 3 * 8 * s) / 4;
    lo.btns = [
      { x: pad, y: y, w: bw, h: 36 * s, label: '悔棋 UNDO', track: true, fontSize: 9 * s, spacing: 0.5 * s, key: 'undo' },
      { x: pad + (bw + 8 * s), y: y, w: bw, h: 36 * s, label: '认输 RESIGN', track: true, fontSize: 9 * s, spacing: 0.4 * s, key: 'resign' },
      { x: pad + (bw + 8 * s) * 2, y: y, w: bw, h: 36 * s, label: '音效', track: true, fontSize: 9 * s, key: 'sound' },
      { x: pad + (bw + 8 * s) * 3, y: y, w: bw, h: 36 * s, label: '← 目录', track: true, fontSize: 9 * s, key: 'toc', ghost: true },
    ];
    y += 36 * s + 20 * s;

    /* 底部：色版胶片条（2p）/ 四人局注（4p，Web dashed 顶线段落） */
    lo.palY = y;
    lo.filmX = pad;
    y += 108 * s;

    lo.contentH = y + 16 * s;
    return lo;
  }
  function contentH() { return layout().contentH; }

  function enter(resume) {
    C = G.Core;
    pg = Page.create(contentH);
    pressed = {};
    touchWall = null; wallPreview = null;
    resignAsk = false; resultShown = false;
    savedToArchive = false;
    strike = null; toast = null;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    aiThinking = false;
    /* 归途峰值（Web meta.maxPathX：随每手更新） */
    maxPath = { A: 0, B: 0, C: 0, D: 0 };
    refreshMaxPath();
    /* 棋钟 */
    var App = G.App;
    if (resume && App.resumeTotals) {
      totals = { A: App.resumeTotals.A || 0, B: App.resumeTotals.B || 0, C: App.resumeTotals.C || 0, D: App.resumeTotals.D || 0 };
    } else {
      totals = { A: 0, B: 0, C: 0, D: 0 };
    }
    turnStart = Date.now();
    if (App.state && !App.state.winner) {
      refreshLegal();
      maybeAiMove();
    } else if (App.state && App.state.winner) {
      resultShown = true;
    }
  }

  /* 归途峰值：当前距离与历史最大 */
  var maxPath = { A: 0, B: 0, C: 0, D: 0 };
  function refreshMaxPath() {
    var st = G.App.state;
    if (!st) return;
    var order = st.playerCount === 4 ? ['A', 'C', 'B', 'D'] : ['A', 'B'];
    for (var i = 0; i < order.length; i++) {
      var p = order[i];
      var d = C.shortestPathLength(st, p);
      if (d != null && d > maxPath[p]) maxPath[p] = d;
    }
  }

  function totalsMs() { return totals; }

  function refreshLegal() {
    var st = G.App.state;
    legal = [];
    if (!st || st.winner) return;
    if (isHumanTurn()) {
      legal = C.legalPawnMoves(st, st.turn);
    }
  }

  /* —— 落子 / 放板 —— */
  function tryPawnMove(to) {
    var App = G.App;
    var st = App.state;
    if (!isHumanTurn()) return;
    var found = false;
    for (var i = 0; i < legal.length; i++) {
      if (legal[i].x === to.x && legal[i].y === to.y) { found = true; break; }
    }
    if (!found) return;
    var from = C.pawnOf(st, st.turn);
    commit({ type: 'pawn', from: from, to: to });
  }

  function tryWallPlace(x, y, o) {
    var App = G.App;
    var st = App.state;
    if (!isHumanTurn()) return;
    var wc = C.checkWall(st, x, y, o, st.turn);
    if (!wc.ok) {
      wallPreview = { x: x, y: y, o: o, ok: false, reason: REJECT_TEXT[wc.reason] || '非法' };
      strike = { x: x, y: y, o: o, k: Date.now() };
      toast = { text: '校对退回 · ' + (REJECT_TEXT[wc.reason] || '非法'), until: Date.now() + 1800 };
      App.sfx('reject');
      App.requestRedraw();
      setTimeout(function () { strike = null; App.requestRedraw(); }, 1100);
      return;
    }
    commit({ type: 'wall', wall: { x: x, y: y, o: o, by: st.turn } });
  }

  function commit(payload) {
    var App = G.App;
    var st = App.state;
    var now = Date.now();
    var elapsed = now - turnStart;
    var mover = st.turn;
    if (G.App.mode !== 'quad' || App.seats[mover]) totals[mover] += elapsed;
    App.pushUndo();
    var r = C.applyPayload(st, mover, payload, elapsed);
    if (!r.ok) {
      toast = { text: '校对退回 · ' + (REJECT_TEXT[r.reason] || '非法'), until: Date.now() + 1800 };
      App.sfx('reject');
      App.requestRedraw();
      return;
    }
    App.state = r.state;
    touchWall = null; wallPreview = null;
    /* 音效 */
    if (payload.type === 'pawn') App.sfx('pawn-click');
    else if (payload.type === 'wall') App.sfx('wall-slide');
    turnStart = Date.now();
    if (r.state.winner) {
      onGameOver();
    } else {
      refreshMaxPath();
      refreshLegal();
      maybeAiMove();
      App.saveGame();
    }
    App.requestRedraw();
  }

  /* —— AI —— */
  function aiLevelFor() {
    var App = G.App;
    if (App.mode === 'quad') return App.quadAiLevel;
    return App.aiLevel;
  }
  function maybeAiMove() {
    var App = G.App;
    var st = App.state;
    if (!st || st.winner) return;
    if (isHumanTurn()) return;
    aiThinking = true;
    var lv = aiLevelFor();
    var budget = aiBudget[lv] || 800;
    /* 4P 或大棋盘适度上调 */
    if (st.playerCount === 4) budget = Math.max(budget, 900);
    App.requestRedraw();
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = setTimeout(function () {
      aiTimer = null;
      var t0 = Date.now();
      var d = G.AiMod.computeAiMove(App.state, lv, { budgetMs: budget });
      var elapsed = Date.now() - t0;
      aiThinking = false;
      if (!d || App.scene !== 'game') { App.requestRedraw(); return; }
      if (App.mode !== 'quad') totals[App.state.turn] += Math.min(elapsed, budget + 120);
      App.pushUndo();
      var r = C.applyPayload(App.state, App.state.turn, d.payload, elapsed);
      if (r.ok) {
        App.state = r.state;
        if (d.payload.type === 'pawn') App.sfx('pawn-click');
        else App.sfx('wall-slide');
        turnStart = Date.now();
        if (r.state.winner) onGameOver();
        else {
          refreshMaxPath();
          refreshLegal();
          /* 4P 连续 AI 席位继续推进 */
          if (!isHumanTurn()) maybeAiMove();
          else App.saveGame();
        }
      }
      App.requestRedraw();
    }, 260);
  }

  /* —— 悔棋 —— */
  function doUndo() {
    var App = G.App;
    if (App.undosLeft <= 0) {
      toast = { text: '悔棋次数已用尽 · 看一段激励视频 +3 次', until: Date.now() + 2200 };
      App.requestRedraw();
      return;
    }
    if (!App.undoStack.length) return;
    var st = App.state;
    /* 撤回到最近一次轮到真人的局面 */
    var target = null;
    for (var i = App.undoStack.length - 1; i >= 0; i--) {
      var s = App.undoStack[i];
      var nextOf = C.nextTurnFrom(s, s.turn);
      if (isHumanTurnOf(s)) { target = s; break; }
      target = s; /* quad 全 AI 时逐手回退 */
      if (isHumanTurnOf(s)) break;
    }
    if (!target) return;
    if (target.winner) { /* 从结算回退：恢复对局 */ resultShown = false; }
    App.state = target;
    App.undosLeft--;
    /* 弹出被撤回的快照 */
    var popTo = App.undoStack.indexOf(target);
    App.undoStack.splice(popTo >= 0 ? popTo : 0);
    if (App.undoStack.length && App.undoStack[App.undoStack.length - 1] === target) App.undoStack.pop();
    touchWall = null; wallPreview = null;
    turnStart = Date.now();
    refreshLegal();
    App.saveGame();
    App.sfx('wall-slide');
    App.requestRedraw();
  }
  function isHumanTurnOf(st) {
    var App = G.App;
    if (App.mode === 'local') return true;
    if (App.mode === 'quad') return !!App.seats[st.turn];
    return App.humanFirst ? st.turn === 'A' : st.turn === 'B';
  }

  /* —— 认输 —— */
  function doResign() {
    var App = G.App;
    var st = App.state;
    App.pushUndo();
    var r = C.applyResign(st, st.turn);
    if (r && r.state) App.state = r.state;
    else if (r) App.state = r;
    resignAsk = false;
    if (App.state.winner) onGameOver();
    else { refreshLegal(); maybeAiMove(); }
    App.requestRedraw();
  }

  /* —— 超时检测 —— */
  function checkTimeout() {
    var App = G.App;
    var st = App.state;
    if (!st || st.winner) return;
    var tc = App.timeControl();
    var mover = st.turn;
    if (tc.totalSec <= 0 && tc.perMoveSec <= 0) return;
    var elapsed = totals[mover] + (Date.now() - turnStart);
    var perOk = tc.perMoveSec > 0 && (Date.now() - turnStart) > tc.perMoveSec * 1000;
    var totalOk = tc.totalSec > 0 && elapsed > tc.totalSec * 1000;
    if (perOk || totalOk) {
      App.pushUndo();
      var r = C.applyTimeout(st, mover);
      if (r && r.state) App.state = r.state;
      if (App.state.winner) onGameOver();
      else { refreshLegal(); maybeAiMove(); }
      App.requestRedraw();
    }
  }

  /* —— 收笔 —— */
  function onGameOver() {
    var App = G.App;
    resultShown = true;
    App.sfx('stamp');
    App.finishGame();
    var st = App.state;
    /* 预生成档案记录 */
    App._pendingRecord = {
      n: Date.now(),
      date: new Date().toLocaleDateString('zh-CN'),
      mode: App.mode,
      size: st.size,
      walls: st.wallsStart,
      winner: st.winner,
      winReason: st.winReason || 'goal',
      moves: st.history.length,
      humanWon: App.mode === 'ai' && st.winner === humanSeat(),
      notations: (st.history || []).slice(-80).map(function (m) { return m.notation || ''; }),
      archived: false,
      aiLevel: App.aiLevel,
      humanSeat: humanSeat(),
      aiName: App.aiLevel ? G.Core.AI_PROFILES[App.aiLevel].name : null,
    };
    /* 快手分享：胜利后注册战绩文案 */
    if (window.KwaiRepost && window.KwaiRepost.registerSystemShare) {
      var winTxt = App.mode === 'ai' && st.winner === humanSeat();
      window.KwaiRepost.registerSystemShare({
        title: winTxt
          ? '【步步为营】我用 ' + st.history.length + ' 手赢了' + G.Core.AI_PROFILES[App.aiLevel].name + '！快手搜「步步为营」来挑战我'
          : '我在快手《步步为营》被堵到怀疑人生！来帮我报仇，一局挡板棋见真章',
      });
    }
  }

  /* —— 绘制 —— */
  function draw(ctx) {
    var lo = layout();
    var L = G.Layout;
    var App = G.App;
    var st = App.state;
    var s = lo.S;
    if (!st) return;

    U.statusBar(ctx, lo.W, lo.statusY);

    ctx.save();
    ctx.translate(0, -pg.scroll);

    /* 章头（Web：对 局 + 模式 + 规格徽标（宽足才画）；右 第 N 手；border-b-2） */
    U.text(ctx, '对 局', lo.pad, lo.headY + 28 * s, 24 * s, T.ink, 'serifX');
    var hx = lo.pad + 68 * s;
    var mlab = modeLabel();
    var mW = U.trackedWidth(ctx, mlab, 10 * s, 'mono', false, 1 * s);
    U.tracked(ctx, mlab, hx, lo.headY + 28 * s, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 1 * s);
    /* 规格徽标（border ink/45 小框；右侧空间不足则省略） */
    var cfg = configLabel(st);
    var bw2 = U.trackedWidth(ctx, cfg, 10 * s, 'mono', false, 0.5 * s) + 16 * s;
    var bx2 = hx + mW + 12 * s;
    var handW = U.trackedWidth(ctx, '第 99 手', 10 * s, 'mono', false, 1 * s) + 20 * s;
    if (bx2 + bw2 <= lo.W - lo.pad - handW) {
      ctx.strokeStyle = 'rgba(26,26,26,0.45)'; ctx.lineWidth = 1;
      ctx.strokeRect(bx2, lo.headY + 16 * s, bw2, 18 * s);
      U.tracked(ctx, cfg, bx2 + 8 * s, lo.headY + 28.5 * s, 10 * s, 'rgba(26,26,26,0.6)', 'mono', false, 0.5 * s);
    }
    U.tracked(ctx, '第 ' + Math.max(1, st.history.length + (st.winner ? 0 : 1)) + ' 手', lo.W - lo.pad, lo.headY + 28 * s, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 1 * s, 'right');
    U.hline(ctx, lo.pad, lo.headY + 44 * s, lo.cw, T.ink, 2);

    /* 棋盘 */
    var lastMove = lastMoveOf(st);
    B.drawBoard(ctx, lo.board, st, {
      legal: legal,
      trace: B.traceOf(st),
      lastMove: lastMove,
      ghost: wallPreview || (touchWall ? { x: touchWall.x, y: touchWall.y, o: touchWall.o } : null),
      ghostOk: wallPreview ? wallPreview.ok : true,
      ghostReason: wallPreview ? wallPreview.reason : null,
    });
    /* 驳回划线 */
    if (strike) {
      var g = B.wallGeom(lo.board, strike.x, strike.y, strike.o);
      var pad2 = 6 * s;
      ctx.strokeStyle = T.risoRed;
      ctx.lineWidth = 3.5 * s;
      ctx.lineCap = 'round';
      var age = Date.now() - strike.k;
      var frac = Math.min(age / 500, 1);
      ctx.beginPath();
      if (strike.o === 'h') {
        ctx.moveTo(g.x - pad2, g.y + g.h / 2);
        ctx.lineTo(g.x - pad2 + (g.w + pad2 * 2) * frac, g.y + g.h / 2);
      } else {
        ctx.moveTo(g.x + g.w / 2, g.y - pad2);
        ctx.lineTo(g.x + g.w / 2, g.y - pad2 + (g.h + pad2 * 2) * frac);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    /* 棋盘提示（Web touch-only 提示行） */
    var hint = isHumanTurn() && !touchWall && !st.winner ? '点击格线附近选板位 · 点击棋格行棋' : '';
    if (st.winner) hint = '';
    if (hint) U.text(ctx, hint, lo.W / 2, lo.hintY, 10 * s, 'rgba(26,26,26,0.45)', 'mono', false, 'center');

    /* 对局状态卡（Web Sidebar section 1:1） */
    ctx.strokeStyle = 'rgba(26,26,26,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(lo.status.x, lo.status.y, lo.status.w, lo.status.h);
    U.tracked(ctx, '对局状态 STATUS', lo.status.x + 16 * s, lo.status.y + 20 * s, 10 * s, 'rgba(26,26,26,0.55)', 'mono', false, 3 * s);
    var headRight = st.size + '×' + st.size + ' · ' + st.wallsStart + '板' + (st.playerCount === 4 ? ' · 四人围坐' : '');
    var tc2 = App.timeControl();
    if (tc2.totalSec > 0 || tc2.perMoveSec > 0) headRight += ' · ' + clkText(tc2);
    headRight += ' · 第 ' + Math.max(1, st.history.length + (st.winner ? 0 : 1)) + ' 手';
    U.text(ctx, headRight, lo.status.x + lo.status.w - 16 * s, lo.status.y + 20 * s, 10 * s, 'rgba(26,26,26,0.4)', 'mono', false, 'right');
    U.hline(ctx, lo.status.x, lo.status.y + 30 * s, lo.status.w, 'rgba(26,26,26,0.25)', 1);
    for (var ri = 0; ri < lo.playerRows.length; ri++) {
      drawPlayerRow(ctx, lo.playerRows[ri], s);
    }
    /* 本手用时（dashed 顶线 + 大号时钟 + 右侧状态列） */
    U.hline(ctx, lo.status.x + 16 * s, lo.moveLblY - 16 * s, lo.status.w - 32 * s, 'rgba(26,26,26,0.3)', 1, [4 * s, 3 * s]);
    U.tracked(ctx, '本手用时 MOVE' + (tc2.perMoveSec > 0 ? ' ⏱' : ''), lo.status.x + 16 * s, lo.moveLblY, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 2.5 * s);
    var moveMs = st.winner ? 0 : (Date.now() - turnStart);
    var clockColor = T.ink;
    if (tc2.perMoveSec > 0 && !st.winner) {
      var leftSec = Math.max(0, Math.ceil((tc2.perMoveSec * 1000 - moveMs) / 1000));
      moveMs = leftSec * 1000;
      if (leftSec <= 10) clockColor = T.risoRed;
    }
    U.text(ctx, fmtClock(moveMs), lo.status.x + 16 * s, lo.moveTimeY, 30 * s, st.winner ? 'rgba(26,26,26,0.35)' : clockColor, 'mono', true);
    var turnTxt = '';
    var turnCol = 'rgba(26,26,26,0.6)';
    if (aiThinking) { turnTxt = C.AI_PROFILES[aiLevelFor()].thinking; turnCol = T.qa; }
    else if (st.winner) turnTxt = winLine();
    else turnTxt = '轮到' + T.playerName(st.turn) + (isHumanTurn() ? '落子' : '落子');
    U.text(ctx, turnTxt, lo.status.x + lo.status.w - 16 * s, lo.moveTimeY, 11 * s, turnCol, 'mono', false, 'right');

    /* 着法记录（Web Sidebar record 1:1：[NN 甲 记谱 用时] 行） */
    ctx.strokeStyle = 'rgba(26,26,26,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(lo.record.x, lo.record.y, lo.record.w, lo.record.h);
    U.tracked(ctx, '着法记录 RECORD', lo.record.x + 16 * s, lo.record.y + 20 * s, 10 * s, 'rgba(26,26,26,0.55)', 'mono', false, 3 * s);
    U.text(ctx, st.history.length + ' 着', lo.record.x + lo.record.w - 16 * s, lo.record.y + 20 * s, 10 * s, 'rgba(26,26,26,0.4)', 'mono', false, 'right');
    U.hline(ctx, lo.record.x, lo.record.y + 30 * s, lo.record.w, 'rgba(26,26,26,0.25)', 1);
    var hist = st.history || [];
    if (!hist.length) {
      U.text(ctx, '—— 白纸一张，落第一着 ——', lo.record.x + lo.record.w / 2, lo.record.y + lo.record.h / 2 + 10 * s, 11 * s, 'rgba(26,26,26,0.4)', 'mono', false, 'center');
    } else {
      var maxRows = Math.floor((lo.record.h - 44 * s) / 20 * s);
      var showN = Math.min(hist.length, Math.floor((lo.record.h - 44 * s) / (20 * s)));
      var start = hist.length - showN;
      if (start > 0 && showN > 0) start += 0;
      var ry2 = lo.record.y + 48 * s;
      for (var hi = start; hi < hist.length; hi++) {
        var mv = hist[hi];
        var rowY = ry2 + (hi - start) * 20 * s;
        if (rowY > lo.record.y + lo.record.h - 10 * s) break;
        var plCol = T.playerColor(mv.player);
        U.text(ctx, String(mv.n).length < 2 ? '0' + mv.n : '' + mv.n, lo.record.x + 18 * s, rowY, 11 * s, 'rgba(26,26,26,0.5)', 'mono');
        U.text(ctx, T.playerName(mv.player), lo.record.x + 48 * s, rowY, 11 * s, plCol, 'mono', true);
        U.text(ctx, mv.notation || '', lo.record.x + 70 * s, rowY, 12 * s, plCol, 'mono');
        U.text(ctx, fmtShort(mv.elapsedMs || 0), lo.record.x + lo.record.w - 16 * s, rowY, 10 * s, 'rgba(26,26,26,0.4)', 'mono', false, 'right');
      }
      if (start > 0) {
        U.text(ctx, '…… 前 ' + start + ' 着见档案馆', lo.record.x + 18 * s, lo.record.y + lo.record.h - 12 * s, 9 * s, 'rgba(26,26,26,0.45)', 'mono');
      }
    }

    /* 按钮行（Web：outline 三枚带图标 + ghost ← 目录；图标左、文字右起） */
    for (var bi = 0; bi < lo.btns.length; bi++) {
      var bt = lo.btns[bi];
      bt.disabled = bt.key === 'undo' && (App.undosLeft <= 0 || !App.undoStack.length) || (bt.key === 'resign' && !!st.winner);
      if (bt.ghost) U.ghostButton(ctx, bt, pressed['btn' + bt.key]);
      else {
        bt.labelX = bt.x + 24 * s;
        U.button(ctx, bt, pressed['btn' + bt.key]);
        drawBtnIcon(ctx, bt, s);
      }
    }

    /* 底部：色版胶片条 / 四人局注（Web border-t dashed pt-4） */
    if (st.playerCount === 4) {
      U.hline(ctx, lo.pad, lo.palY, lo.cw, 'rgba(26,26,26,0.35)', 1, [5 * s, 4 * s]);
      var qnote = '四人围坐 · 四色套印已钉死（红/蓝/苔绿/墨黑）· 顺时针行棋 甲→丙→乙→丁 · 出局制：认输/超时/离席踰时即出局，仅存一席时末位胜';
      var ql = U.wrap(ctx, qnote, lo.cw, 9 * s, 'mono');
      for (var qi = 0; qi < ql.length && qi < 3; qi++) {
        U.text(ctx, ql[qi], lo.pad, lo.palY + 18 * s + qi * 14 * s, 9 * s, 'rgba(26,26,26,0.4)', 'mono');
      }
    } else {
      U.filmStrip(ctx, lo.filmX, lo.palY, s);
    }

    ctx.restore();
    Page.indicator(ctx, pg);

    /* 固定浮层：放板浮条 / 认输弹层 / 结算 / 提示条 */
    if (touchWall && !resultShown) drawWallBar(ctx, lo);
    if (resignAsk && !resultShown) drawResignAsk(ctx, lo);
    if (resultShown) drawResult(ctx, lo);
    if (toast && Date.now() < toast.until) {
      var alpha = Math.min(1, (toast.until - Date.now()) / 400);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = T.ink;
      var tw = U.trackedWidth(ctx, toast.text, 11 * s, 'serif', false, 1) + 28 * s;
      var tx0 = (lo.W - tw) / 2;
      ctx.fillRect(tx0, L.safeTop + 52 * s, tw, 30 * s);
      U.text(ctx, toast.text, lo.W / 2, L.safeTop + 52 * s + 19 * s, 11 * s, T.paper, 'serif', false, 'center');
      ctx.globalAlpha = 1;
    } else toast = null;
  }

  /* 按钮小图标（Web Undo2 / Flag / Volume2 线稿） */
  function drawBtnIcon(ctx, bt, s) {
    var fg = bt.disabled ? 'rgba(26,26,26,0.35)' : T.ink;
    var ix = bt.x + 12 * s, iy = bt.y + bt.h / 2;
    ctx.strokeStyle = fg; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (bt.key === 'undo') {
      ctx.arc(ix + 4 * s, iy, 5 * s, Math.PI * 0.5, Math.PI * 1.85);
      ctx.moveTo(ix + 4 * s + 5 * s, iy - 4.5 * s);
      ctx.lineTo(ix + 4 * s + 5.8 * s, iy - 0.6 * s);
      ctx.lineTo(ix + 4 * s + 2.2 * s, iy - 0.2 * s);
    } else if (bt.key === 'resign') {
      ctx.moveTo(ix, iy - 6 * s);
      ctx.lineTo(ix, iy + 6 * s);
      ctx.moveTo(ix, iy - 6 * s);
      ctx.lineTo(ix + 8 * s, iy - 4 * s);
      ctx.lineTo(ix, iy - 2 * s);
    } else if (bt.key === 'sound') {
      ctx.moveTo(ix, iy - 3 * s); ctx.lineTo(ix + 3 * s, iy - 3 * s);
      ctx.lineTo(ix + 6 * s, iy - 6 * s); ctx.lineTo(ix + 6 * s, iy + 6 * s);
      ctx.lineTo(ix + 3 * s, iy + 3 * s); ctx.lineTo(ix, iy + 3 * s);
      ctx.closePath();
      if (G.App.soundOn) {
        ctx.moveTo(ix + 9 * s, iy - 2.5 * s);
        ctx.arc(ix + 8.5 * s, iy, 2.5 * s, -Math.PI / 2.6, Math.PI / 2.6);
      }
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /* 玩家行（Web Sidebar playerBlock 1:1） */
  function drawPlayerRow(ctx, row, s) {
    var App = G.App;
    var st = App.state;
    var p = row.p;
    var four = st.playerCount === 4;
    var col = T.playerColor(p);
    var isTurn = !st.winner && st.turn === p;
    var elim = four && C.isEliminated(st, p);

    /* 行框：border ink/30；行棋中：border-ink + bg ink/4 + 左 4px 色条 */
    ctx.save();
    if (elim) ctx.globalAlpha = 0.55;
    ctx.fillStyle = isTurn ? 'rgba(26,26,26,0.04)' : T.paper;
    ctx.fillRect(row.x, row.y, row.w, row.h);
    if (isTurn) {
      ctx.fillStyle = col;
      ctx.fillRect(row.x, row.y, 4 * s, row.h);
    }
    ctx.strokeStyle = isTurn ? T.ink : 'rgba(26,26,26,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(row.x, row.y, row.w, row.h);

    /* 名字行：色点 + 名 + 行棋中/出局 + 右坐标 */
    var name = seatName(p);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(row.x + 20 * s, row.y + 18 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
    U.text(ctx, name, row.x + 34 * s, row.y + 24 * s, 16 * s, T.ink, 'serifB');
    var tagTxt = elim ? '✕ 出局' : (isTurn ? '● 行棋中' : '');
    if (tagTxt) U.tracked(ctx, tagTxt, row.x + 34 * s + ctx.measureText(name).width + 10 * s, row.y + 24 * s, 9 * s, elim ? 'rgba(26,26,26,0.45)' : col, 'mono', false, 2 * s);
    var pos = C.pawnOf(st, p);
    if (pos) U.text(ctx, B.cellName(pos.x, pos.y, st.size), row.x + row.w - 16 * s, row.y + 24 * s, 12 * s, 'rgba(26,26,26,0.6)', 'mono', false, 'right');

    /* 挡板铅条 + ×N */
    var left = C.wallsLeftOf(st, p);
    var pipY = row.y + 40 * s;
    var pipW = U.wallPips(ctx, row.x + 20 * s, pipY, Math.min(st.wallsStart, 10), left, col, 14 * s, 7 * s, 3 * s);
    U.text(ctx, '×' + left, row.x + row.w - 16 * s, pipY + 7 * s, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 'right');

    /* 底行：累计/剩余 + 归途峰值 */
    var tc = App.timeControl();
    var used = totals[p] + (isTurn ? Date.now() - turnStart : 0);
    var clockTxt, clockCol = 'rgba(26,26,26,0.45)';
    if (tc.totalSec > 0) {
      var remain = Math.max(0, Math.ceil((tc.totalSec * 1000 - used) / 1000));
      clockTxt = '剩 ' + fmtClock(remain * 1000);
      if (remain <= 30) { clockCol = T.risoRed; }
    } else {
      clockTxt = '累计 ' + fmtClock(used);
    }
    U.text(ctx, clockTxt, row.x + 20 * s, row.y + row.h - 14 * s, 10 * s, clockCol, 'mono');
    U.text(ctx, '归途 ' + (maxPath[p] || 0) + ' 步峰值', row.x + row.w - 16 * s, row.y + row.h - 14 * s, 10 * s, 'rgba(26,26,26,0.45)', 'mono', false, 'right');
    ctx.restore();
  }

  function seatName(p) {
    var App = G.App;
    var st = App.state;
    var cn = T.playerName(p);
    if (App.mode === 'local') return st.playerCount === 4 ? (App.seats[p] ? '真人 · ' + cn : 'AI · ' + cn) : cn;
    if (App.mode === 'quad') return (App.seats[p] ? '真人 · ' : 'AI · ') + cn;
    var human = humanSeat();
    if (p === human) return App.humanFirst ? '你 · 甲（红）' : '你 · 乙（蓝）';
    return G.Core.AI_PROFILES[App.aiLevel].name + ' · ' + cn;
  }

  function modeLabel() {
    var App = G.App;
    if (App.mode === 'ai') return '单人对弈 · ' + G.Core.AI_PROFILES[App.aiLevel].name;
    if (App.mode === 'local') return App.state && App.state.playerCount === 4 ? '四人围坐' : '双人同屏';
    return '四人围坐';
  }
  function configLabel(st) {
    var seat = st.playerCount === 4 ? '四人' : '二人';
    return st.size + '×' + st.size + ' · 每方 ' + st.wallsStart + ' 板 · ' + seat + '局';
  }
  function clkText(tc) {
    if (!tc || (tc.totalSec <= 0 && tc.perMoveSec <= 0)) return '不限时';
    var parts = [];
    if (tc.totalSec > 0) parts.push(tc.totalSec >= 60 ? '总 ' + Math.round(tc.totalSec / 60) + ' 分' : '总 ' + tc.totalSec + ' 秒');
    if (tc.perMoveSec > 0) parts.push('每步 ' + tc.perMoveSec + ' 秒');
    return parts.join(' · ');
  }
  function winLine() {
    var st = G.App.state;
    if (st.winReason === 'timeout') {
      return st.playerCount === 4 ? '众席超时出局 · 棋局继续' : (st.winner === 'A' ? '乙方超时 · 判负' : '甲方超时 · 判负');
    }
    if (st.winReason === 'last') return '末位存席 · 收笔';
    return T.playerName(st.winner) + '胜 · 收笔';
  }
  function fmtShort(ms) {
    var sec = ms / 1000;
    return sec < 60 ? sec.toFixed(1) + 's' : fmtClock(ms);
  }
  function lastMoveOf(st) {
    var h = st.history || [];
    if (!h.length) return null;
    var mv = h[h.length - 1];
    var pl = mv.payload;
    if (pl.type === 'pawn') return { kind: 'pawn', player: mv.player, from: pl.from, to: pl.to };
    if (pl.type === 'wall') return { kind: 'wall', player: mv.player, wall: { x: pl.wall.x, y: pl.wall.y, o: pl.wall.o } };
    return null;
  }
  function fmtClock(ms) {
    var sec = Math.floor(ms / 1000);
    var m = Math.floor(sec / 60);
    var s2 = sec % 60;
    return m + ':' + (s2 < 10 ? '0' : '') + s2;
  }

  /* 放板浮条（固定底部） —— 确定性几何 */
  function wallBarY() { return G.Layout.h - 66 * S(); }
  function drawWallBar(ctx, lo) {
    var s = lo.S;
    var st = G.App.state;
    var name = B.cellName(touchWall.x + 1, touchWall.y, st.size);
    var y = wallBarY();
    B.wallActionBar(ctx, lo.W, y, name, touchWall.o, pressed.wallBtn);
  }

  /* 认输确认 —— 确定性几何 */
  function resignAskLayout(lo) {
    var L = G.Layout;
    var s = lo.S;
    var w = 300 * s, h = 170 * s;
    var x = (lo.W - w) / 2, y = L.h / 2 - h / 2;
    var bw = (w - 40 * s - 12 * s) / 2;
    return {
      x: x, y: y, w: w, h: h,
      no: { x: x + 20 * s, y: y + h - 58 * s, w: bw, h: 38 * s, label: '再想想', fontSize: 12 * s, track: true },
      yes: { x: x + 20 * s + bw + 12 * s, y: y + h - 58 * s, w: bw, h: 38 * s, label: '落笔认输', fontSize: 12 * s, solidColor: T.risoRed, track: true },
    };
  }
  function drawResignAsk(ctx, lo) {
    var s = lo.S;
    var g = resignAskLayout(lo);
    U.dim(ctx, 0.55);
    U.card(ctx, { x: g.x, y: g.y, w: g.w, h: g.h }, { shadow: true, shadowColor: 'rgba(26,26,26,0.3)' });
    U.text(ctx, '确认认输？', g.x + g.w / 2, g.y + 44 * s, 18 * s, T.ink, 'serifX', false, 'center');
    var dl = U.wrap(ctx, '这一页将以认输收束。对方执笔写完最后一行。此操作不可撤销。', g.w - 48 * s, 12 * s, 'serif');
    for (var di = 0; di < dl.length && di < 2; di++) {
      U.text(ctx, dl[di], g.x + g.w / 2, g.y + 74 * s + di * 18 * s, 12 * s, 'rgba(26,26,26,0.7)', 'serif', false, 'center');
    }
    U.button(ctx, g.no, pressed.resignNo);
    U.button(ctx, g.yes, pressed.resignYes);
  }

  /* 结算浮层（Web VictoryOverlay 1:1：整页墨底纸白、巨型印章字 胜/败 + 印框） */
  function resultLayout(lo) {
    var L = G.Layout;
    var s = lo.S;
    var App = G.App;
    var W = lo.W, H = L.h;
    var bw = Math.min(W - 48 * s, 300 * s);
    return {
      W: W, H: H,
      save: { x: (W - bw) / 2, y: H - 150 * s, w: bw, h: 40 * s, track: true, fontSize: 12 * s },
      again: { x: (W - bw) / 2, y: H - 102 * s, w: bw, h: 40 * s, track: true, fontSize: 12 * s },
      toc: { x: (W - bw) / 2, y: H - 54 * s, w: bw, h: 40 * s, track: true, fontSize: 12 * s },
    };
  }
  function drawResult(ctx, lo) {
    var L = G.Layout;
    var s = lo.S;
    var App = G.App;
    var st = App.state;
    var g = resultLayout(lo);

    /* 整页墨黑底（Web fixed inset-0 bg-ink text-paper） */
    ctx.fillStyle = T.ink;
    ctx.fillRect(0, 0, g.W, g.H);

    var four = st.playerCount === 4;
    /* 观屏者视角胜败章（Web iWon 逻辑 1:1） */
    var iWon;
    if (App.mode === 'ai') iWon = humanSeat() === st.winner;
    else if (App.mode === 'quad') iWon = !!App.seats[st.winner];
    else iWon = true;
    var winHex = four ? T.playerColor(st.winner) : (st.winner === 'A' ? T.qa : T.qb);

    /* 章头：FINAL PROOF / 第 N 手收笔 */
    U.tracked(ctx, 'THE GAME IS SET — FINAL PROOF', 24 * s, Math.max(L.safeTop, 14) + 26 * s, 10 * s, 'rgba(245,242,234,0.6)', 'mono', false, 2 * s);
    U.tracked(ctx, '第 ' + st.history.length + ' 手收笔', g.W - 24 * s, Math.max(L.safeTop, 14) + 26 * s, 10 * s, 'rgba(245,242,234,0.6)', 'mono', false, 1.5 * s, 'right');
    U.hline(ctx, 24 * s, Math.max(L.safeTop, 14) + 38 * s, g.W - 48 * s, 'rgba(245,242,234,0.4)', 1);

    /* 巨型印章字：胜 / 败（纸白字 + 胜方色套印阴影 6px） */
    var stampY = g.H * 0.36;
    var stampSize = 128 * s;
    ctx.textAlign = 'center';
    ctx.font = U.font(stampSize, 'serifX');
    ctx.fillStyle = winHex;
    ctx.fillText(iWon ? '胜' : '败', g.W / 2 + 6 * s, stampY + 6 * s);
    ctx.fillStyle = T.paper;
    ctx.fillText(iWon ? '胜' : '败', g.W / 2, stampY);
    ctx.textAlign = 'left';
    /* 印章框（旋转 -4°，胜方色） */
    var fz = 170 * s;
    ctx.save();
    ctx.translate(g.W / 2, stampY - stampSize * 0.36);
    ctx.rotate(-4 * Math.PI / 180);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = winHex; ctx.lineWidth = 5 * s;
    ctx.strokeRect(-fz / 2, -fz / 2, fz, fz);
    ctx.restore();

    /* 胜者行（Web：{winner} 执笔写完了最后一行 (reason)） */
    var wn = four ? seatName(st.winner) : (st.winner === 'A'
      ? (App.mode === 'ai' ? '你（甲）' : '甲')
      : (App.mode === 'ai' ? G.Core.AI_PROFILES[App.aiLevel].name + '（乙）' : '乙'));
    U.text(ctx, wn + ' 执笔写完了最后一行', g.W / 2, stampY + 60 * s, 20 * s, T.paper, 'serifB', false, 'center');
    U.text(ctx, '（' + reasonText() + '）', g.W / 2, stampY + 84 * s, 12 * s, 'rgba(245,242,234,0.6)', 'mono', false, 'center');

    /* 战绩 2×2（Web statItems：总手数 / 全局用时 / 挡板用量 / 最远归途） */
    var sy = stampY + 120 * s;
    var colW = (g.W - 48 * s) / 2;
    var stats = resultStats();
    for (var i = 0; i < stats.length && i < 4; i++) {
      var cx2 = 24 * s + (i % 2) * colW + colW / 2;
      var ry3 = sy + Math.floor(i / 2) * 64 * s;
      U.tracked(ctx, stats[i][0], cx2, ry3, 10 * s, 'rgba(245,242,234,0.5)', 'mono', false, 3 * s, 'center');
      U.text(ctx, stats[i][1], cx2, ry3 + 24 * s, 18 * s, T.paper, 'mono', true, 'center');
    }

    /* 操作（Web：保存此局入档 / 再来一局 / 返回目录） */
    var rec = App._pendingRecord;
    g.save.label = (rec && rec.archived) ? '已收入档案馆' : '保存此局入档';
    g.save.disabled = rec && rec.archived;
    g.save.solidColor = null;
    U.button(ctx, g.save, pressed.saveRec);
    g.again.label = '再来一局';
    g.again.solidColor = null;
    U.button(ctx, g.again, pressed.again);
    g.toc.label = '返回目录';
    g.toc.solidColor = null;
    U.button(ctx, g.toc, pressed.toToc);

    /* 版画注脚 */
    U.text(ctx, '这盘棋留在纸面上的每一道墨迹，此刻正是一张可读的棋谱版画。',
      g.W / 2, g.H - 26 * s, 10 * s, 'rgba(245,242,234,0.4)', 'mono', false, 'center');
  }
  function reasonText() {
    var st = G.App.state;
    if (st.winReason === 'resign') return st.playerCount === 4 ? '众席认输 · 末位收笔' : '认输收束';
    if (st.winReason === 'timeout') return st.playerCount === 4 ? '众席超时出局 · 末位收笔' : '超时判负';
    if (st.playerCount === 4) return '众席出局 · 末位收笔';
    return '抵达底线';
  }
  function resultStats() {
    var App = G.App;
    var st = App.state;
    var totalMs = totals.A + totals.B + totals.C + totals.D;
    var wallsUsed = st.walls ? st.walls.length : 0;
    var maxDist = 0;
    var order = st.playerCount === 4 ? ['A', 'C', 'B', 'D'] : ['A', 'B'];
    for (var i = 0; i < order.length; i++) {
      var d = maxPath[order[i]] || 0;
      if (d > maxDist) maxDist = d;
    }
    return [
      ['总手数', st.history.length + ' 手'],
      ['全局用时', Math.round(totalMs / 1000) + ' 秒'],
      ['挡板用量', wallsUsed + ' / ' + (st.wallsStart * st.playerCount) + ' 根'],
      ['最远归途', maxDist + ' 步'],
    ];
  }

  /* —— 输入 —— */
  function press(x, y) {
    pressed = {};
    pg.press(x, y);
    var lo = layout();
    var L = G.Layout;
    var s = lo.S;
    if (resultShown) {
      var rg = resultLayout(lo);
      if (U.inRect(rg.save, x, y)) pressed.saveRec = true;
      else if (U.inRect(rg.again, x, y)) pressed.again = true;
      else if (U.inRect(rg.toc, x, y)) pressed.toToc = true;
      return;
    }
    if (resignAsk) {
      var dg = resignAskLayout(lo);
      if (U.inRect(dg.no, x, y)) pressed.resignNo = true;
      else if (U.inRect(dg.yes, x, y)) pressed.resignYes = true;
      return;
    }
    /* 放板浮条（固定层，优先；确定性几何） */
    if (touchWall) {
      var wb = B.wallBarRects(lo.W, wallBarY());
      for (var wk in wb.rects) {
        if (U.inRect(wb.rects[wk], x, y)) pressed.wallBtn = wk;
      }
      if (pressed.wallBtn) return;
    }
    var cy = pg.cy(y);
    for (var bi = 0; bi < lo.btns.length; bi++) {
      if (U.inRect(lo.btns[bi], x, cy)) pressed['btn' + lo.btns[bi].key] = true;
    }
    if (G.App.state && G.App.state.playerCount !== 4) {
      var fs = U.filmStripHit(x, cy, lo.filmX, lo.palY, s);
      if (fs >= 0) pressed['skin' + fs] = true;
    }
  }

  function drag(x, y) { if (!resultShown && !resignAsk) pg.drag(x, y); }

  function release(x, y) {
    var lo = layout();
    var App = G.App;
    var L = G.Layout;
    var st = App.state;
    var s = lo.S;

    if (resultShown) {
      pg.release(x, y);
      var rg = resultLayout(lo);
      if (U.inRect(rg.save, x, y) && pressed.saveRec) {
        var rec = App._pendingRecord;
        if (rec && !rec.archived) {
          rec.archived = true;
          App.archiveAdd(rec);
        }
        App.sfx('stamp');
      } else if (U.inRect(rg.again, x, y) && pressed.again) {
        App.sfx('pawn-click');
        App.startGame(false);
      } else if (U.inRect(rg.toc, x, y) && pressed.toToc) {
        App.sfx('pawn-click');
        App.gotoScene('toc');
      }
      pressed = {};
      return;
    }
    if (resignAsk) {
      var dg = resignAskLayout(lo);
      if (pressed.resignNo && U.inRect(dg.no, x, y)) resignAsk = false;
      else if (pressed.resignYes && U.inRect(dg.yes, x, y)) doResign();
      pressed = {};
      App.requestRedraw();
      return;
    }

    /* 放板浮条按钮 */
    if (touchWall && pressed.wallBtn) {
      var wb2 = B.wallBarRects(lo.W, wallBarY());
      if (U.inRect(wb2.rects[pressed.wallBtn], x, y)) {
        if (pressed.wallBtn === 'h') { touchWall.o = 'h'; wallPreview = null; }
        else if (pressed.wallBtn === 'v') { touchWall.o = 'v'; wallPreview = null; }
        else if (pressed.wallBtn === 'ok') tryWallPlace(touchWall.x, touchWall.y, touchWall.o);
        else if (pressed.wallBtn === 'cancel') { touchWall = null; wallPreview = null; }
        pressed = {};
        App.requestRedraw();
        return;
      }
    }

    var kind = pg.release(x, y);
    if (kind !== 'tap') { pressed = {}; return; }
    var cy = pg.cy(y);

    /* 棋盘命中 */
    var inBoard = x >= lo.board.x0 && x <= lo.board.x0 + lo.board.w && y >= lo.board.y0 - pg.scroll + 0 && y <= lo.board.y0 + lo.board.h;
    var byContent = cy;
    if (x >= lo.board.x0 && x <= lo.board.x0 + lo.board.w && byContent >= lo.board.y0 && byContent <= lo.board.y0 + lo.board.h) {
      if (isHumanTurn()) {
        var zone = B.hit(lo.board, x, byContent);
        if (zone) {
          if (zone.kind === 'cell') {
            touchWall = null; wallPreview = null;
            tryPawnMove(zone);
          } else {
            touchWall = { x: zone.x, y: zone.y, o: zone.o };
            wallPreview = null;
          }
        }
      }
      pressed = {};
      App.requestRedraw();
      return;
    }

    /* 按钮行 */
    if (pressed.btnundo && U.inRect(lo.btns[0], x, cy)) { doUndo(); pressed = {}; return; }
    if (pressed.btnresign && U.inRect(lo.btns[1], x, cy)) { resignAsk = true; pressed = {}; App.requestRedraw(); return; }
    if (pressed.btnsound && U.inRect(lo.btns[2], x, cy)) {
      App.soundOn = !App.soundOn;
      App.savePrefs();
      App.sfx('pawn-click');
      pressed = {}; App.requestRedraw(); return;
    }
    if (pressed.btntoc && U.inRect(lo.btns[3], x, cy)) {
      App.sfx('pawn-click');
      App.saveGame();
      App.gotoScene('toc');
      pressed = {}; return;
    }
    /* 色版 */
    if (st && st.playerCount !== 4) {
      var fs2 = U.filmStripHit(x, cy, lo.filmX, lo.palY, s);
      if (fs2 >= 0 && pressed['skin' + fs2]) {
        App.skin = fs2;
        T.applySkin(fs2);
        App.savePrefs();
        App.sfx('pawn-click');
        pressed = {}; App.requestRedraw(); return;
      }
    }
    pressed = {};
  }

  /* 动画活跃：对局中棋钟/思考态需脉动 */
  function animActive() {
    var st = G.App.state;
    if (!st) return false;
    if (st.winner && !resultShown) return true;
    if (!st.winner) return true;
    return false;
  }

  /* 每帧检查超时（由 main 脉冲驱动 draw 时调用） */
  var lastTimeoutCheck = 0;
  var _draw = draw;
  draw = function (ctx) {
    var now = Date.now();
    if (now - lastTimeoutCheck > 500) {
      lastTimeoutCheck = now;
      checkTimeout();
    }
    _draw(ctx);
  };

  G.Scenes = G.Scenes || {};
  G.Scenes.game = {
    enter: enter, draw: draw, press: press, drag: drag, release: release,
    animActive: animActive, totalsMs: totalsMs,
  };
})();

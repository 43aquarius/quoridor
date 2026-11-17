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

    /* 标题区 */
    lo.headY = y;
    y += 84 * s;

    /* 棋盘 */
    var boardW = Math.min(cw + 8 * s, 420 * s);
    lo.board = B.metrics(App.state ? App.state.size : 9, boardW, (W - boardW) / 2, y);
    y += boardW + 14 * s;
    lo.hintY = y;
    y += 20 * s;

    /* 对局状态卡 */
    lo.status = { x: pad, y: y, w: cw, h: 0 };
    var four = App.state && App.state.playerCount === 4;
    var rows = four ? 4 : 2;
    lo.playerRows = [];
    var order = four ? ['A', 'C', 'B', 'D'] : ['A', 'B'];
    for (var i = 0; i < rows; i++) {
      lo.playerRows.push({ x: pad + 10 * s, y: y + 36 * s + i * (86 * s + 8 * s), w: cw - 20 * s, h: 86 * s, p: order[i] });
    }
    y += 36 * s + rows * (86 * s + 8 * s) + 8 * s;
    lo.status.h = y - lo.status.y;
    y += 22 * s;

    /* 本手用时 */
    lo.moveLblY = y;
    lo.moveTimeY = y + 44 * s;
    y += 64 * s;

    /* 着法记录 */
    lo.record = { x: pad, y: y, w: cw, h: 168 * s };
    y += lo.record.h + 24 * s;

    /* 按钮行 */
    var bw = (cw - 3 * 8 * s) / 4;
    lo.btns = [
      { x: pad, y: y, w: bw, h: 40 * s, label: '悔棋 UNDO', track: true, fontSize: 9.5 * s, key: 'undo' },
      { x: pad + (bw + 8 * s), y: y, w: bw, h: 40 * s, label: '认输 RESIGN', track: true, fontSize: 9.5 * s, key: 'resign' },
      { x: pad + (bw + 8 * s) * 2, y: y, w: bw, h: 40 * s, label: App.soundOn ? '音效 ON' : '音效 OFF', track: true, fontSize: 9.5 * s, key: 'sound', selected: App.soundOn },
      { x: pad + (bw + 8 * s) * 3, y: y, w: bw, h: 40 * s, label: '← 目录', track: true, fontSize: 9.5 * s, key: 'toc' },
    ];
    y += 40 * s + 24 * s;

    /* 色版条 */
    lo.palY = y;
    var swatchW = 56 * s, swatchH = 40 * s;
    lo._swatches = [];
    for (var si = 0; si < T.skins.length; si++) {
      var sx = pad + si * (swatchW + 10 * s);
      lo._swatches.push({ x: sx, y: lo.palY + 18 * s, w: swatchW, h: swatchH + 16 * s, i: si });
    }
    y = lo.palY + 18 * s + swatchH + 30 * s;

    lo.contentH = y + 14 * s;
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

    U.statusBar(ctx, lo.W, lo.statusY, modeLabel());

    ctx.save();
    ctx.translate(0, -pg.scroll);

    /* 标题区 */
    U.text(ctx, '对', lo.pad, lo.headY + 24 * s, 26 * s, T.ink, 'serifX', true);
    U.text(ctx, '局', lo.pad, lo.headY + 52 * s, 26 * s, T.ink, 'serifX', true);
    var meta1 = metaLine1();
    var m1lines = U.wrap(ctx, meta1, lo.W - lo.pad * 2 - 130 * s, 11 * s, 'mono');
    for (var ml = 0; ml < m1lines.length && ml < 2; ml++) {
      U.text(ctx, m1lines[ml], lo.pad + 44 * s, lo.headY + 18 * s + ml * 16 * s, 11 * s, 'rgba(26,26,26,0.6)', 'mono');
    }
    /* 信息胶囊 */
    var capW = 120 * s;
    var cap = { x: lo.W - lo.pad - capW, y: lo.headY + 4 * s, w: capW, h: 40 * s };
    ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5;
    ctx.strokeRect(cap.x, cap.y, cap.w, cap.h);
    var capTxt = st.size + '×' + st.size + ' · ' + st.wallsStart + '板';
    U.text(ctx, capTxt, cap.x + cap.w / 2, cap.y + 15 * s, 9.5 * s, T.ink, 'mono', false, 'center');
    U.text(ctx, st.playerCount === 4 ? '四人局' : '二人局', cap.x + cap.w / 2, cap.y + 30 * s, 9.5 * s, T.ink, 'mono', false, 'center');
    U.tracked(ctx, '第 ' + (st.history.length + 1) + ' 手', lo.pad, lo.headY + 72 * s, 10 * s, 'rgba(26,26,26,0.55)', 'mono', false, 1.5 * s);
    U.hline(ctx, lo.pad, lo.headY + 80 * s, lo.cw, 'rgba(26,26,26,0.25)', 1);

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
    /* 棋盘提示 */
    var hint = isHumanTurn() && !touchWall ? '点击格线附近选板位 · 点击棋格行棋' : '';
    if (aiThinking) hint = C.AI_PROFILES[aiLevelFor()].thinking;
    if (st.winner) hint = '对局已收笔';
    U.text(ctx, hint, lo.W / 2, lo.hintY, 10 * s, 'rgba(26,26,26,0.45)', 'mono', false, 'center');

    /* 对局状态卡 */
    U.card(ctx, lo.status, { shadow: false });
    U.tracked(ctx, '对局状态 STATUS', lo.status.x + 12 * s, lo.status.y + 20 * s, 9.5 * s, 'rgba(26,26,26,0.55)', 'mono', false, 1.2 * s);
    U.text(ctx, st.size + '×' + st.size + ' · ' + st.wallsStart + '板 · 第 ' + (st.history.length + 1) + ' 手',
      lo.status.x + lo.status.w - 12 * s, lo.status.y + 20 * s, 9 * s, 'rgba(26,26,26,0.5)', 'mono', false, 'right');
    for (var ri = 0; ri < lo.playerRows.length; ri++) {
      drawPlayerRow(ctx, lo.playerRows[ri], s);
    }

    /* 本手用时 */
    U.tracked(ctx, '本手用时 MOVE', lo.pad, lo.moveLblY, 9.5 * s, T.light, 'mono', false, 1.5 * s);
    var moveMs = st.winner ? 0 : (Date.now() - turnStart);
    U.text(ctx, fmtClock(moveMs), lo.pad, lo.moveTimeY, 36 * s, T.ink, 'mono', true);
    var turnTxt = '';
    if (st.winner) turnTxt = '已收笔';
    else if (aiThinking) turnTxt = '思考中……';
    else turnTxt = '轮到' + T.playerName(st.turn) + (isHumanTurn() ? ' 落子' : '（AI）');
    U.text(ctx, turnTxt, lo.W - lo.pad, lo.moveTimeY, 11 * s, 'rgba(26,26,26,0.55)', 'serif', false, 'right');

    /* 着法记录 */
    U.card(ctx, lo.record, { shadow: false });
    U.tracked(ctx, '着法记录 RECORD', lo.record.x + 12 * s, lo.record.y + 20 * s, 9.5 * s, 'rgba(26,26,26,0.55)', 'mono', false, 1.2 * s);
    U.text(ctx, st.history.length + ' 着', lo.record.x + lo.record.w - 12 * s, lo.record.y + 20 * s, 9.5 * s, 'rgba(26,26,26,0.5)', 'mono', false, 'right');
    var hist = st.history || [];
    if (!hist.length) {
      U.text(ctx, '—— 白纸一张，落第一着 ——', lo.record.x + lo.record.w / 2, lo.record.y + lo.record.h / 2 + 12 * s, 12 * s, 'rgba(26,26,26,0.5)', 'serif', false, 'center');
    } else {
      /* 最近 6 手，两列 */
      var recent = hist.slice(-6);
      var colW = (lo.record.w - 24 * s) / 2;
      for (var hi = 0; hi < recent.length; hi++) {
        var mv = recent[hi];
        var col = hi % 2, rowI = Math.floor(hi / 2);
        var rx = lo.record.x + 12 * s + col * colW;
        var ry = lo.record.y + 40 * s + rowI * 20 * s;
        var label = mv.notation || '';
        U.text(ctx, label, rx, ry, 10.5 * s, T.ink, 'mono');
      }
      if (hist.length > 6) {
        U.text(ctx, '…… 前 ' + (hist.length - 6) + ' 着见档案馆', lo.record.x + 12 * s, lo.record.y + lo.record.h - 12 * s, 9 * s, 'rgba(26,26,26,0.45)', 'mono');
      }
    }

    /* 按钮行 */
    for (var bi = 0; bi < lo.btns.length; bi++) {
      var bt = lo.btns[bi];
      bt.disabled = bt.key === 'undo' && (App.undosLeft <= 0 || !App.undoStack.length);
      if (bt.key === 'sound') { bt.label = App.soundOn ? '音效 ON' : '音效 OFF'; bt.selected = false; }
      U.button(ctx, bt, pressed['btn' + bt.key]);
    }

    /* 色版条 */
    U.tracked(ctx, '套印色版 RISO PALETTE', lo.pad, lo.palY + 10 * s, 9.5 * s, T.light, 'mono', false, 1.5 * s);
    if (st.playerCount === 4) {
      U.text(ctx, '四人局四色套印已钉死', lo.W - lo.pad, lo.palY + 10 * s, 9.5 * s, 'rgba(26,26,26,0.5)', 'serif', false, 'right');
    } else {
      for (var si = 0; si < lo._swatches.length; si++) {
        var sw = lo._swatches[si];
        var sk = T.skins[sw.i];
        var selp = App.skin === sw.i;
        ctx.fillStyle = sk.qa;
        ctx.fillRect(sw.x, sw.y, sw.w / 2, sw.h - 16 * s);
        ctx.fillStyle = sk.qb;
        ctx.fillRect(sw.x + sw.w / 2, sw.y, sw.w / 2, sw.h - 16 * s);
        ctx.fillStyle = T.ink;
        for (var th = 0; th < 4; th++) ctx.fillRect(sw.x + th * (sw.w / 4) + 1, sw.y - 3 * s, sw.w / 4 - 3, 2.5);
        ctx.strokeStyle = selp ? T.ink : 'rgba(26,26,26,0.4)';
        ctx.lineWidth = selp ? 2.5 : 1.2;
        ctx.strokeRect(sw.x, sw.y, sw.w, sw.h - 16 * s);
        U.text(ctx, sk.label, sw.x + sw.w / 2, sw.y + sw.h - 4 * s, 9 * s, selp ? T.ink : 'rgba(26,26,26,0.55)', 'serifB', selp, 'center');
      }
    }

    U.nBadge(ctx, 14 * s + 14 * s, G.Layout.h - 14 * s - 14 * s, 14 * s);
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

  function drawPlayerRow(ctx, row, s) {
    var App = G.App;
    var st = App.state;
    var p = row.p;
    var four = st.playerCount === 4;
    var col = T.playerColor(p);
    var isTurn = !st.winner && st.turn === p;
    var elim = four && C.isEliminated(st, p);

    if (isTurn) {
      ctx.fillStyle = 'rgba(26,26,26,0.045)';
      ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.fillStyle = col;
      ctx.fillRect(row.x, row.y, 4, row.h);
    }
    /* 名字行 */
    var name = seatName(p);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(row.x + 14 * s, row.y + 16 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
    U.text(ctx, name, row.x + 26 * s, row.y + 21 * s, 14 * s, T.ink, 'serifB', true);
    var status = elim ? '已出局' : isTurn ? (aiThinking && !isHumanTurnOf(st) ? '思考中' : '行棋中') : '候手';
    U.text(ctx, '● ' + status, row.x + 26 * s, row.y + 38 * s, 9.5 * s, elim ? 'rgba(26,26,26,0.4)' : col, 'serif');
    /* 坐标 */
    var pos = C.pawnOf(st, p);
    if (pos) U.text(ctx, B.cellName(pos.x, pos.y, st.size), row.x + row.w - 12 * s, row.y + 21 * s, 12 * s, T.ink, 'mono', false, 'right');
    /* 挡板胶囊 */
    var left = C.wallsLeftOf(st, p);
    var pipY = row.y + 48 * s;
    var pipW = U.wallPips(ctx, row.x + 14 * s, pipY, Math.min(st.wallsStart, 12), left, col, 14 * s, 7 * s, 4 * s);
    U.text(ctx, '×' + left, row.x + 14 * s + pipW + 8 * s, pipY + 7 * s, 10 * s, 'rgba(26,26,26,0.55)', 'mono');
    /* 底行：累计 + 归途 */
    var totalTxt = '累计 ' + fmtClock(totals[p] + (isTurn ? Date.now() - turnStart : 0));
    var dist = C.shortestPathLength(st, p);
    U.text(ctx, totalTxt, row.x + 14 * s, row.y + row.h - 8 * s, 9 * s, 'rgba(26,26,26,0.5)', 'mono');
    U.text(ctx, '归途 ' + (dist == null ? '—' : dist + ' 步峰值'), row.x + row.w - 12 * s, row.y + row.h - 8 * s, 9 * s, 'rgba(26,26,26,0.5)', 'mono', false, 'right');
  }

  function seatName(p) {
    var App = G.App;
    var st = App.state;
    var cn = T.playerName(p);
    if (App.mode === 'local') return '玩家 · ' + cn;
    if (App.mode === 'quad') return (App.seats[p] ? '真人 · ' : 'AI · ') + cn;
    var human = humanSeat();
    if (p === human) return '你 · ' + cn;
    return G.Core.AI_PROFILES[App.aiLevel].name + ' · ' + cn;
  }

  function modeLabel() {
    var App = G.App;
    if (App.mode === 'ai') return '单人对弈 · ' + G.Core.AI_PROFILES[App.aiLevel].name;
    if (App.mode === 'local') return '双人同屏';
    return '四人围坐';
  }
  function metaLine1() {
    var App = G.App;
    if (App.mode === 'ai') {
      return App.humanFirst ? '单人对弈 · 你执红先行' : '单人对弈 · 你执蓝后行';
    }
    if (App.mode === 'local') return '双人同屏 · 轮流执子';
    return '四人围坐 · 顺时针行棋 · 出局制';
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
    U.text(ctx, '确认认输？', g.x + g.w / 2, g.y + 44 * s, 18 * s, T.ink, 'serifX', true, 'center');
    U.text(ctx, '落笔后此局即告收束，不可反悔。', g.x + g.w / 2, g.y + 74 * s, 12 * s, 'rgba(26,26,26,0.6)', 'serif', false, 'center');
    U.button(ctx, g.no, pressed.resignNo);
    U.button(ctx, g.yes, pressed.resignYes);
  }

  /* 结算浮层 —— 确定性几何 */
  function resultLayout(lo) {
    var L = G.Layout;
    var s = lo.S;
    var App = G.App;
    var w = Math.min(lo.W - 40 * s, 350 * s);
    var h = 430 * s;
    var x = (lo.W - w) / 2, y = Math.max(L.safeTop + 30 * s, L.h / 2 - h / 2);
    var bw = w - 48 * s;
    return {
      x: x, y: y, w: w, h: h,
      save: { x: x + 24 * s, y: y + 252 * s, w: bw, h: 40 * s, track: true, fontSize: 12 * s },
      again: { x: x + 24 * s, y: y + 298 * s, w: bw, h: 40 * s, track: true, fontSize: 12 * s },
      toc: { x: x + 24 * s, y: y + 344 * s, w: bw, h: 40 * s, track: true, fontSize: 12 * s },
    };
  }
  function drawResult(ctx, lo) {
    var L = G.Layout;
    var s = lo.S;
    var App = G.App;
    var st = App.state;
    var g = resultLayout(lo);
    U.dim(ctx, 0.55);
    U.card(ctx, { x: g.x, y: g.y, w: g.w, h: g.h }, { shadow: true, shadowColor: 'rgba(26,26,26,0.3)' });

    U.tracked(ctx, '对局结果 THE GAME IS SET', g.x + g.w / 2, g.y + 26 * s, 9 * s, 'rgba(26,26,26,0.5)', 'mono', false, 2 * s, 'center');
    /* 胜者 */
    var winCol = T.playerColor(st.winner);
    var winName = seatName(st.winner);
    U.text(ctx, winName, g.x + g.w / 2, g.y + 64 * s, 24 * s, winCol, 'serifX', true, 'center');
    U.text(ctx, '胜 · ' + reasonText(), g.x + g.w / 2, g.y + 90 * s, 13 * s, T.ink, 'serifB', true, 'center');
    U.hline(ctx, g.x + 24 * s, g.y + 108 * s, g.w - 48 * s, 'rgba(26,26,26,0.25)', 1);

    /* 数据行 */
    var stats = resultStats();
    var sy = g.y + 134 * s;
    for (var i = 0; i < stats.length; i++) {
      U.text(ctx, stats[i][0], g.x + 28 * s, sy, 11.5 * s, 'rgba(26,26,26,0.6)', 'serif');
      U.text(ctx, stats[i][1], g.x + g.w - 28 * s, sy, 12 * s, T.ink, 'mono', true, 'right');
      sy += 26 * s;
    }

    U.text(ctx, '这盘棋留在纸面上的每一道墨迹，', g.x + g.w / 2, g.y + 216 * s, 10.5 * s, 'rgba(26,26,26,0.55)', 'serif', false, 'center');
    U.text(ctx, '此刻正是一张可读的棋谱版画。', g.x + g.w / 2, g.y + 232 * s, 10.5 * s, 'rgba(26,26,26,0.55)', 'serif', false, 'center');

    /* 操作按钮 */
    var rec = App._pendingRecord;
    g.save.label = (rec && rec.archived) ? '✓ 已收入档案馆' : '保存此局入档';
    g.save.disabled = rec && rec.archived;
    U.button(ctx, g.save, pressed.saveRec);
    g.again.label = '再来一局';
    U.button(ctx, g.again, pressed.again);
    g.toc.label = '返回目录';
    U.button(ctx, g.toc, pressed.toToc);
    /* 底注 */
    U.text(ctx, '悔棋可退回终局前继续推演', g.x + g.w / 2, g.y + g.h - 22 * s, 9 * s, 'rgba(26,26,26,0.45)', 'mono', false, 'center');
  }
  function reasonText() {
    var st = G.App.state;
    if (st.winReason === 'resign') return '认输收束';
    if (st.winReason === 'timeout') return '超时判负';
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
      var d = C.shortestPathLength(st, order[i]);
      if (d != null && d > maxDist) maxDist = d;
    }
    return [
      ['全局用时', fmtClock(totalMs)],
      ['挡板用量', wallsUsed + ' / ' + (st.wallsStart * st.playerCount) + ' 根'],
      ['最远归途', maxDist + ' 步'],
      ['总手数', st.history.length + ' 手'],
    ];
  }

  /* —— 输入 —— */
  function press(x, y) {
    pressed = {};
    pg.press(x, y);
    var lo = layout();
    var L = G.Layout;
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
    if (G.App.state && G.App.state.playerCount !== 4 && lo._swatches) {
      for (var si = 0; si < lo._swatches.length; si++) {
        if (U.inRect(lo._swatches[si], x, cy)) pressed['skin' + si] = true;
      }
    }
  }

  function drag(x, y) { if (!resultShown && !resignAsk) pg.drag(x, y); }

  function release(x, y) {
    var lo = layout();
    var App = G.App;
    var L = G.Layout;
    var st = App.state;

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
    if (lo._swatches && st && st.playerCount !== 4) {
      for (var si = 0; si < lo._swatches.length; si++) {
        if (pressed['skin' + si] && U.inRect(lo._swatches[si], x, cy)) {
          App.skin = si;
          T.applySkin(si);
          App.savePrefs();
          App.sfx('pawn-click');
          pressed = {}; App.requestRedraw(); return;
        }
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

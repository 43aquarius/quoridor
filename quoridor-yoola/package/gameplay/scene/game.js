/* 步步为营 — 对局场景：走子/放板交互、AI 调度、悔棋、认输、结算与广告分享
 * 人机模式：玩家执甲（红，先手），AI 执乙；双人模式：同屏轮流。
 * 竖屏布局：顶部状态条 → 棋盘 → 底部操作区（避开底部安全区 68px）。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var B = G.Board;
  var E = G.Engine;

  var BOTTOM_SAFE = 68;
  var TOP_BAR_H = 54;

  var wallMode = false;
  var wallO = 'h';
  var ghost = null;      /* {x,y,o} 放板预览锚点 */
  var ghostOk = false;
  var hint = '';         /* 底部临时提示（非法原因等） */
  var hintUntil = 0;
  var thinking = false;
  var moveAnim = null;   /* {p, from, to, t0} 落子跳跃动画 */
  var overlay = null;    /* null | 'result' | 'resign' | 'adundo' */
  var doubled = false;   /* 本局战绩是否已翻倍 */
  var pressed = {};
  var aiToken = 0;       /* AI 异步令牌：场景切换后作废 */

  function layout() {
    var L = G.Layout;
    var App = G.App;
    var W = L.w;
    var top = Math.max(L.safeTop, 16);
    var lo = { W: W, top: top };

    lo.topBar = { y: top + 6, h: TOP_BAR_H };
    lo.bannerY = top + 6 + TOP_BAR_H + 20;

    lo.row2Y = L.h - BOTTOM_SAFE - 46;
    lo.row1Y = lo.row2Y - 12 - 46;
    lo.boardTop = lo.bannerY + 12;
    lo.boardBottom = lo.row1Y - 10;

    var availW = W - 26;
    var availH = lo.boardBottom - lo.boardTop;
    lo.m = B.metrics(App.state.size, availW, availH, W / 2, (lo.boardTop + lo.boardBottom) / 2);

    var pad = 14;
    var rotateW = 70;
    lo.modeSeg = { x: pad, y: lo.row1Y, w: W - pad * 2 - rotateW - 10, h: 46, items: ['走 子', '放 板'], fontSize: 16 };
    lo.rotateBtn = { x: W - pad - rotateW, y: lo.row1Y, w: rotateW, h: 46, label: wallO === 'h' ? '↔ 横' : '↕ 竖', fontSize: 15 };

    var bw = (W - pad * 2 - 10 * 2) / 3;
    lo.undoBtn = { x: pad, y: lo.row2Y, w: bw, h: 44, label: '', fontSize: 15 };
    lo.resignBtn = { x: pad + bw + 10, y: lo.row2Y, w: bw, h: 44, label: '认 输', fontSize: 15 };
    lo.homeBtn = { x: pad + (bw + 10) * 2, y: lo.row2Y, w: bw, h: 44, label: '首 页', fontSize: 15 };

    /* 结算 / 弹层几何 */
    var pw = Math.min(W - 56, 336);
    lo.resPanel = { w: pw, x: (W - pw) / 2, h: 300, y: 0 };
    lo.resPanel.y = Math.max(L.safeTop + 60, (L.h - 300) / 2 - 10);
    lo.resAgain = { x: lo.resPanel.x + 26, y: lo.resPanel.y + 172, w: pw - 52, h: 48, label: '再来一局', solid: true, color: T.red, fontSize: 18 };
    lo.resShare = { x: lo.resPanel.x + 26, y: lo.resPanel.y + 230, w: (pw - 62) / 2, h: 42, label: '分享战绩', fontSize: 15 };
    lo.resHome = { x: lo.resPanel.x + pw - 26 - (pw - 62) / 2, y: lo.resPanel.y + 230, w: (pw - 62) / 2, h: 42, label: '回首页', fontSize: 15 };
    lo.resDouble = { x: lo.resPanel.x + 26, y: lo.resPanel.y + 280, w: pw - 52, h: 36, label: '看视频 · 本局战绩翻倍', fontSize: 13 };

    lo.confirmPanel = { w: 300, x: (W - 300) / 2, h: 200, y: 0 };
    lo.confirmPanel.y = Math.max(L.safeTop + 90, (L.h - 200) / 2);
    lo.confirmYes = { x: (W - 300) / 2 + 24, y: lo.confirmPanel.y + 126, w: 120, h: 44, label: '认 输', solid: true, color: T.ink, fontSize: 15 };
    lo.confirmNo = { x: (W - 300) / 2 + 300 - 144, y: lo.confirmPanel.y + 126, w: 120, h: 44, label: '再想想', fontSize: 15 };

    lo.adPanel = { w: 300, x: (W - 300) / 2, h: 210, y: 0 };
    lo.adPanel.y = Math.max(L.safeTop + 90, (L.h - 210) / 2);
    lo.adYes = { x: (W - 300) / 2 + 24, y: lo.adPanel.y + 136, w: 120, h: 44, label: '看视频', solid: true, color: T.green, fontSize: 15 };
    lo.adNo = { x: (W - 300) / 2 + 300 - 144, y: lo.adPanel.y + 136, w: 120, h: 44, label: '不用了', fontSize: 15 };
    return lo;
  }

  function enter() {
    wallMode = false;
    ghost = null;
    hint = '';
    thinking = false;
    moveAnim = null;
    overlay = null;
    doubled = false;
    pressed = {};
    aiToken++;
  }

  function humanCanAct() {
    var App = G.App;
    if (App.state.winner || thinking || overlay) return false;
    if (App.mode === 'ai') return App.state.turn === 'A';
    return true;
  }

  function isAiTurn() {
    var App = G.App;
    return App.mode === 'ai' && !App.state.winner && App.state.turn === 'B';
  }

  function setHint(msg) {
    hint = msg;
    hintUntil = G._now() + 2200;
  }

  /* —— 落子 —— */
  function applyMove(payload) {
    var App = G.App;
    var mover = App.state.turn;
    /* 人类看子的悔棋快照：双人局每手都存；人机局只存甲（玩家）的手 */
    if (App.mode === 'local' || mover === 'A') {
      App.pushUndoSnapshot();
    }
    var r = E.applyPayload(App.state, App.state.turn, payload, 0);
    if (!r.ok) {
      if (App.mode === 'local' || mover === 'A') App.undoStack.pop();
      setHint(reasonText(r.reason));
      return false;
    }
    App.state = r.state;
    G.App.requestRedraw();
    /* 落子动画 */
    if (payload.type === 'pawn') {
      moveAnim = { p: r.state.history[r.state.history.length - 1].player, from: payload.from, to: payload.to, t0: G._now() };
    } else {
      moveAnim = null;
    }
    ghost = null;
    if (App.state.winner) {
      finishGame();
    } else {
      /* 落子后回到走子模式；若新行棋方无板也强制回走子 */
      wallMode = false;
      if (E.wallsLeftOf(App.state, App.state.turn) <= 0) wallMode = false;
      App.saveGame();
      if (isAiTurn()) scheduleAI();
    }
    return true;
  }

  function reasonText(reason) {
    if (reason === 'overlap') return '挡板不可重叠';
    if (reason === 'cross') return '挡板不可十字交叉';
    if (reason === 'no-path') return '放完后必须双方都有通路';
    if (reason === 'no-walls') return '挡板已经用完了';
    if (reason === 'illegal-pawn') return '这一步走不到';
    return '此处不能落子';
  }

  /* —— AI —— */
  function scheduleAI() {
    thinking = true;
    G.App.requestRedraw();
    var token = ++aiToken;
    var App = G.App;
    var level = App.aiLevel;
    setTimeout(function () {
      if (token !== aiToken || G.App.scene !== 'game') { thinking = false; return; }
      var d = G.AI.computeAiMove(G.App.state, 'B', level);
      thinking = false;
      if (!d) return;
      applyMove(d.payload);
      G.App.requestRedraw();
    }, 420);
  }

  /* —— 结算 —— */
  function finishGame() {
    var App = G.App;
    overlay = 'result';
    App.finishGame();
    G.App.requestRedraw();
  }

  function shareText() {
    var App = G.App;
    var s = App.state;
    var n = s.history.length;
    var who = s.winner === 'A' ? '甲' : '乙';
    var tail = '快手互动玩法《步步为营》，一局挡板棋见真章！';
    if (App.mode === 'ai') {
      var lv = ['学徒', '排字师', '总编'][App.aiLevel - 1] || '棋手';
      if (s.winner === 'A') return '【步步为营】我只用 ' + n + ' 手就赢了' + lv + '！敢来挑战吗？' + tail;
      return '【步步为营】一着不慎，被' + lv + '抢先把路走完了……不服来战！' + tail;
    }
    return '【步步为营】双人对弈 ' + n + ' 手，' + who + '方技高一筹先抵终点！' + tail;
  }

  /* —— 绘制 —— */
  function draw(ctx) {
    var lo = layout();
    var App = G.App;
    var s = App.state;

    drawTopBar(ctx, lo, s);

    /* 棋盘 */
    var opts = { clock: App.clock, turn: s.turn };
    if (!s.winner && !thinking && humanCanAct()) {
      if (!wallMode) {
        opts.legalMoves = E.legalPawnMoves(s, s.turn);
        opts.turn = s.turn;
      }
      if (wallMode && ghost) {
        opts.ghost = ghost;
        opts.ghostOk = ghostOk;
        opts.turn = s.turn;
      }
    }
    if (moveAnim) {
      var t = (G._now() - moveAnim.t0) / 260;
      if (t >= 1) {
        moveAnim = null;
      } else {
        var m = lo.m;
        var fr = B.cellRect(m, moveAnim.from.x, moveAnim.from.y);
        var tr2 = B.cellRect(m, moveAnim.to.x, moveAnim.to.y);
        var ease = 1 - (1 - t) * (1 - t);
        var cx = fr.x + (tr2.x - fr.x) * ease + fr.w / 2;
        var cy = fr.y + (tr2.y - fr.y) * ease - Math.sin(Math.PI * t) * fr.w * 0.5;
        var anim = { x: cx, y: cy, scale: 1 + 0.12 * Math.sin(Math.PI * t) };
        if (moveAnim.p === 'A') opts.animA = anim;
        else opts.animB = anim;
      }
    }
    B.drawBoard(ctx, lo.m, s, opts);

    /* 横幅提示 */
    var banner = '';
    var bcol = T.ink;
    if (s.winner) {
      banner = '对局结束';
    } else if (thinking) {
      var prof = G.AI.PROFILES[App.aiLevel];
      banner = (prof ? prof.thinking : '思考中') ;
      bcol = T.blue;
    } else if (wallMode) {
      var cur = s.turn;
      banner = ghost ? (ghostOk ? '再点一次确认放板' : '此处不能放：' + (hint && G._now() < hintUntil ? hint : '换个位置试试')) : '点击格线放置挡板，可先「旋转」';
      bcol = B.playerColor(cur);
    } else {
      if (App.mode === 'ai') banner = '你的回合 · 执甲（红）';
      else banner = (s.turn === 'A' ? '甲（红）' : '乙（蓝）') + '的回合 · 点高亮格走子';
      bcol = B.playerColor(s.turn);
    }
    if (hint && G._now() < hintUntil && !wallMode) {
      banner = hint;
      bcol = T.red;
    }
    U.text(ctx, banner, lo.W / 2, lo.bannerY + 4, 13.5, bcol, 700, 'center');

    drawBottomBar(ctx, lo, s);

    if (overlay === 'result') drawResult(ctx, lo);
    else if (overlay === 'resign') drawResign(ctx, lo);
    else if (overlay === 'adundo') drawAdUndo(ctx, lo);
  }

  function drawTopBar(ctx, lo, s) {
    var App = G.App;
    var y = lo.topBar.y;
    /* 甲（左） */
    drawPlayerChip(ctx, 14, y, '甲', T.red, s.wallsA, s.turn === 'A' && !s.winner);
    /* 乙（右） */
    var bw = 92;
    drawPlayerChip(ctx, lo.W - 14 - bw, y, '乙', T.blue, s.wallsB, s.turn === 'B' && !s.winner);
    /* 中间信息 */
    var n = s.history.length;
    U.text(ctx, '第 ' + (n + (s.winner ? 0 : 1)) + ' 手', lo.W / 2, y + 18, 15, T.ink, 800, 'center');
    if (App.mode === 'ai') {
      var lv = ['学徒', '排字师', '总编'][App.aiLevel - 1] || '';
      U.text(ctx, '人机 · ' + lv, lo.W / 2, y + 38, 11.5, T.inkSoft, 400, 'center');
    } else {
      U.text(ctx, '双人同屏', lo.W / 2, y + 38, 11.5, T.inkSoft, 400, 'center');
    }
  }

  function drawPlayerChip(ctx, x, y, name, color, walls, active) {
    U.fillRR(ctx, x, y, 92, 50, 12, active ? color : '#FBF7EC');
    U.strokeRR(ctx, x, y, 92, 50, 12, T.ink, 2.5);
    ctx.fillStyle = active ? '#FBF7EC' : color;
    ctx.beginPath();
    ctx.arc(x + 20, y + 25, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = T.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = active ? color : '#FBF7EC';
    ctx.font = U.font(12, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + 20, y + 26);
    ctx.fillStyle = active ? '#FBF7EC' : T.ink;
    ctx.font = U.font(13, 800);
    ctx.fillText('板×' + walls, x + 58, y + 26);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawBottomBar(ctx, lo, s) {
    var App = G.App;
    var canAct = humanCanAct() && !thinking;
    lo.modeSeg.value = wallMode ? 1 : 0;
    if (canAct) {
      U.segRow(ctx, lo.modeSeg, pressed.modeSeg);
      var rotBtn = lo.rotateBtn;
      rotBtn.label = wallO === 'h' ? '↔ 横板' : '↕ 竖板';
      rotBtn.disabled = !wallMode;
      U.button(ctx, rotBtn, pressed.rotate && wallMode);

      lo.undoBtn.label = '悔棋×' + App.undosLeft;
      lo.undoBtn.disabled = App.undosLeft <= 0 || App.undoStack.length === 0 || thinking || !!s.winner;
      U.button(ctx, lo.undoBtn, pressed.undo);
      U.button(ctx, lo.resignBtn, pressed.resign);
      U.button(ctx, lo.homeBtn, pressed.home);
    } else {
      /* AI 思考或已终局：禁用操作区 */
      lo.modeSeg.value = wallMode ? 1 : 0;
      U.segRow(ctx, lo.modeSeg, -1);
      var rotBtn2 = lo.rotateBtn;
      rotBtn2.label = wallO === 'h' ? '↔ 横板' : '↕ 竖板';
      rotBtn2.disabled = true;
      U.button(ctx, rotBtn2, false);
      lo.undoBtn.label = '悔棋×' + App.undosLeft;
      lo.undoBtn.disabled = true;
      U.button(ctx, lo.undoBtn, false);
      lo.resignBtn.disabled = true;
      U.button(ctx, lo.resignBtn, false);
      lo.homeBtn.disabled = false;
      U.button(ctx, lo.homeBtn, pressed.home);
      lo.resignBtn.disabled = false;
    }
  }

  function drawResult(ctx, lo) {
    var App = G.App;
    var s = App.state;
    U.dim(ctx, 0.62);
    var p = lo.resPanel;
    U.panel(ctx, p.x, p.y, p.w, p.h, '对局终了', T.ink);

    var winA = s.winner === 'A';
    var col = winA ? T.red : T.blue;
    ctx.font = U.font(38, 800);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(26,26,26,0.2)';
    ctx.fillText((winA ? '甲 胜' : '乙 胜'), lo.W / 2 + 2, p.y + 76 + 2);
    ctx.fillStyle = col;
    ctx.fillText((winA ? '甲 胜' : '乙 胜'), lo.W / 2, p.y + 76);
    ctx.textAlign = 'left';

    var reason = s.winReason === 'resign' ? '对方认输' : s.winReason === 'timeout' ? '超时判负' : '率先抵达目标线';
    if (App.mode === 'ai') reason = winA ? '你把对手堵到了无路可走' : '对手抢先抵达终点';
    U.text(ctx, reason, lo.W / 2, p.y + 106, 13, T.inkSoft, 400, 'center');
    U.text(ctx, '全局共 ' + s.history.length + ' 手', lo.W / 2, p.y + 130, 13, T.inkSoft, 400, 'center');
    if (App.mode === 'ai' && !winA) {
      U.text(ctx, '换个档位或版式，再战一局？', lo.W / 2, p.y + 150, 12, T.inkSoft, 400, 'center');
    }

    U.button(ctx, lo.resAgain, pressed.again);
    U.button(ctx, lo.resShare, pressed.share);
    U.button(ctx, lo.resHome, pressed.resHome);
    if (App.mode === 'ai' && winA && !doubled) {
      U.button(ctx, lo.resDouble, pressed.double);
    }
  }

  function drawResign(ctx, lo) {
    U.dim(ctx, 0.5);
    var p = lo.confirmPanel;
    U.panel(ctx, p.x, p.y, p.w, p.h, '认输确认', T.red);
    U.text(ctx, '确定要投子认输吗？', lo.W / 2, p.y + 86, 15, T.ink, 700, 'center');
    U.text(ctx, '当前局势将被判负', lo.W / 2, p.y + 110, 12, T.inkSoft, 400, 'center');
    U.button(ctx, lo.confirmYes, pressed.confirmYes);
    U.button(ctx, lo.confirmNo, pressed.confirmNo);
  }

  function drawAdUndo(ctx, lo) {
    U.dim(ctx, 0.5);
    var p = lo.adPanel;
    U.panel(ctx, p.x, p.y, p.w, p.h, '悔棋次数用完了', T.green);
    U.text(ctx, '看一段视频，立即获得 3 次悔棋', lo.W / 2, p.y + 84, 14, T.ink, 700, 'center');
    U.text(ctx, '支持开发者，感谢你的陪伴', lo.W / 2, p.y + 108, 12, T.inkSoft, 400, 'center');
    U.button(ctx, lo.adYes, pressed.adYes);
    U.button(ctx, lo.adNo, pressed.adNo);
  }

  /* —— 输入 —— */
  function press(x, y) {
    var lo = layout();
    var App = G.App;
    var s = App.state;
    pressed = {};
    if (overlay === 'result') {
      if (U.inRect(lo.resAgain, x, y)) pressed.again = true;
      else if (U.inRect(lo.resShare, x, y)) pressed.share = true;
      else if (U.inRect(lo.resHome, x, y)) pressed.resHome = true;
      else if (App.mode === 'ai' && s.winner === 'A' && !doubled && U.inRect(lo.resDouble, x, y)) pressed.double = true;
      return;
    }
    if (overlay === 'resign') {
      if (U.inRect(lo.confirmYes, x, y)) pressed.confirmYes = true;
      else if (U.inRect(lo.confirmNo, x, y)) pressed.confirmNo = true;
      return;
    }
    if (overlay === 'adundo') {
      if (U.inRect(lo.adYes, x, y)) pressed.adYes = true;
      else if (U.inRect(lo.adNo, x, y)) pressed.adNo = true;
      return;
    }
    var canAct = humanCanAct() && !thinking;
    var i = U.segHit(lo.modeSeg, x, y);
    if (canAct && i >= 0) { pressed.modeSeg = i; return; }
    if (canAct && wallMode && U.inRect(lo.rotateBtn, x, y)) { pressed.rotate = true; return; }
    if (U.inRect(lo.homeBtn, x, y)) { pressed.home = true; return; }
    if (canAct && U.inRect(lo.undoBtn, x, y)) { pressed.undo = true; return; }
    if (canAct && !s.winner && U.inRect(lo.resignBtn, x, y)) { pressed.resign = true; return; }
  }

  function tap(x, y) {
    var lo = layout();
    var App = G.App;
    var s = App.state;

    if (overlay === 'result') {
      if (pressed.again && U.inRect(lo.resAgain, x, y)) { App.startGame(false); return; }
      if (pressed.share && U.inRect(lo.resShare, x, y)) {
        if (window.KwaiRepost) {
          window.KwaiRepost.shareAppMessage({ title: shareText(), onSuccess: function () {}, onFail: function () {} });
        }
        pressed = {};
        return;
      }
      if (pressed.resHome && U.inRect(lo.resHome, x, y)) { App.gotoHome(); return; }
      if (pressed.double && U.inRect(lo.resDouble, x, y)) {
        showRewarded(function () {
          doubled = true;
          App.doubleWin();
          setHint('战绩已翻倍');
        });
        pressed = {};
        return;
      }
      pressed = {};
      return;
    }
    if (overlay === 'resign') {
      if (pressed.confirmYes && U.inRect(lo.confirmYes, x, y)) {
        overlay = null;
        App.state = E.applyResign(App.state, App.mode === 'ai' ? 'A' : s.turn);
        finishGame();
        return;
      }
      if (pressed.confirmNo && U.inRect(lo.confirmNo, x, y)) overlay = null;
      pressed = {};
      return;
    }
    if (overlay === 'adundo') {
      if (pressed.adYes && U.inRect(lo.adYes, x, y)) {
        showRewarded(function () {
          App.undosLeft += 3;
          overlay = null;
          setHint('悔棋 +3');
          G.App.requestRedraw();
        });
        return;
      }
      if (pressed.adNo && U.inRect(lo.adNo, x, y)) overlay = null;
      pressed = {};
      return;
    }

    var canAct = humanCanAct() && !thinking;
    if (!canAct) {
      if (pressed.home && U.inRect(lo.homeBtn, x, y)) App.gotoHome();
      pressed = {};
      return;
    }

    /* 模式切换 */
    var i = U.segHit(lo.modeSeg, x, y);
    if (i >= 0) {
      if (i === 1 && E.wallsLeftOf(s, s.turn) <= 0) {
        setHint('挡板已经用完了，只能走子');
      } else {
        wallMode = i === 1;
        ghost = null;
      }
      pressed = {};
      return;
    }
    if (wallMode && pressed.rotate && U.inRect(lo.rotateBtn, x, y)) {
      wallO = wallO === 'h' ? 'v' : 'h';
      if (ghost) {
        ghost.o = wallO;
        refreshGhostLegality();
      }
      pressed = {};
      return;
    }
    if (pressed.home && U.inRect(lo.homeBtn, x, y)) { App.gotoHome(); return; }
    if (pressed.undo && U.inRect(lo.undoBtn, x, y)) {
      doUndo();
      pressed = {};
      return;
    }
    if (pressed.resign && U.inRect(lo.resignBtn, x, y)) {
      overlay = 'resign';
      pressed = {};
      return;
    }
    pressed = {};

    /* 棋盘交互 */
    var m = lo.m;
    if (x < m.x - 14 || x > m.x + m.w + 14 || y < m.y - 14 || y > m.y + m.w + 14) return;

    if (!wallMode) {
      var cell = B.hitCell(m, x, y);
      if (!cell) return;
      var legal = E.legalPawnMoves(s, s.turn);
      for (var k = 0; k < legal.length; k++) {
        if (legal[k].x === cell.x && legal[k].y === cell.y) {
          var me = E.pawnOf(s, s.turn);
          applyMove({ type: 'pawn', from: { x: me.x, y: me.y }, to: cell });
          return;
        }
      }
      setHint('走不到那里：点虚线高亮格落子');
      return;
    }

    /* 放板 */
    if (E.wallsLeftOf(s, s.turn) <= 0) {
      setHint('挡板已经用完了');
      return;
    }
    var hit = B.hitWall(m, x, y, wallO);
    if (!hit) {
      setHint('请点在两格之间的格线上');
      return;
    }
    if (ghost && ghost.x === hit.x && ghost.y === hit.y && ghost.o === hit.o) {
      if (ghostOk) {
        applyMove({ type: 'wall', wall: { x: hit.x, y: hit.y, o: hit.o } });
      } else {
        setHint('此处不能放板');
      }
      return;
    }
    ghost = { x: hit.x, y: hit.y, o: hit.o };
    refreshGhostLegality();
    if (!ghostOk) {
      var chk = E.checkWall(s, ghost.x, ghost.y, ghost.o, s.turn);
      setHint(reasonText(chk.reason));
    }
  }

  function refreshGhostLegality() {
    var s = G.App.state;
    var chk = E.checkWall(s, ghost.x, ghost.y, ghost.o, s.turn);
    ghostOk = !!chk.ok;
  }

  function doUndo() {
    var App = G.App;
    if (App.undosLeft <= 0) {
      overlay = 'adundo';
      return;
    }
    if (!App.undoStack.length) {
      setHint('没有可以撤销的着法');
      return;
    }
    if (thinking) return;
    App.state = App.undoStack.pop();
    App.undosLeft--;
    ghost = null;
    moveAnim = null;
    App.saveGame();
    setHint('已悔一手');
    G.App.requestRedraw();
  }

  function showRewarded(onReward) {
    if (window.KwaiAd) {
      window.KwaiAd.showRewarded(function () {
        onReward();
        G.App.requestRedraw();
      }, function () {
        setHint('看完视频才能领取哦');
      });
    } else {
      onReward();
    }
    pressed = {};
  }

  G.Scenes = G.Scenes || {};
  G.Scenes.game = {
    enter: enter,
    draw: draw,
    press: press,
    tap: tap,
  };
})();

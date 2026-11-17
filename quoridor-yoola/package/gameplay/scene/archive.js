/* 步步为营 — 棋谱档案馆场景（Web 版 ArchiveView 1:1，CH.06）
 * 章头 + 引导段 / 空态（虚线框 + 档案盒图标）/ 卷宗 spread 卡：
 * №+日期头行 / RESULT·收笔 / MARGINALIA 数据小注 / 可展开着法 / 销毁。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var Page = G.Page;

  var pg = null;
  var pressed = {};
  var backBtn = null;
  var openMoves = -1; /* 展开着法的卷宗索引 */

  var MODE_STR = { ai: '单人对弈', local: '双人同屏', quad: '四人围坐' };
  var REASON_STR = { goal: '抵达底线', resign: '认输收束', timeout: '超时判负', last: '末位收笔' };

  function modeStr(rec) {
    var base = MODE_STR[rec.mode] || '对局';
    if (rec.mode === 'ai' && rec.aiLevel) base = '单人对弈 · ' + (G.Core.AI_PROFILES[rec.aiLevel] ? G.Core.AI_PROFILES[rec.aiLevel].name : '编辑部');
    return base;
  }
  function reasonOf(rec) {
    if (rec.winReason === 'resign') return '认输收束';
    if (rec.winReason === 'timeout') return '超时判负';
    if (rec.winReason === 'last') return '众席出局 · 末位收笔';
    return '抵达底线';
  }
  function winnerLabel(rec) {
    var cn = T.playerName(rec.winner);
    if (rec.mode === 'ai') return rec.winner === (rec.humanSeat || 'A') ? '你（' + cn + '）' : ((rec.aiName || '编辑部') + '（' + cn + '）');
    return cn;
  }
  function wallCount(rec) {
    var n = 0;
    var ns = rec.notations || [];
    for (var i = 0; i < ns.length; i++) if (ns[i].indexOf('WALL') === 0) n++;
    return n;
  }

  function layout() {
    var L = G.Layout;
    var W = L.w;
    var s = Math.min(W / 414, 1.25);
    var pad = 20 * s;
    var cw = W - pad * 2;
    var App = G.App;
    var lo = { W: W, S: s, pad: pad, cw: cw };

    lo.statusY = Math.max(L.safeTop, 14) + 16 * s;
    var y = lo.statusY + 30 * s;
    lo.headY = y;
    y += 84 * s;

    /* 引导段 */
    var lead = '每一局收笔的棋谱都装订成卷宗，垂直铺开成跨页。卷内记着双方、步数、胜负，页边写满数据小注；点开「卷宗着法」可通读全谱。';
    lo.leadLines = U.wrap(wrapCtx(), lead, cw, 13 * s, 'serif');
    y += lo.leadLines.length * 20 * s + 24 * s;

    lo.items = [];
    if (App.archive.length) {
      for (var i = 0; i < App.archive.length; i++) {
        var rec = App.archive[i];
        var nots = rec.notations || [];
        var expanded = openMoves === i;
        var movesRows = expanded ? Math.min(nots.length, 8) : 0;
        var h = 150 * s + 24 * s + 54 * s + movesRows * 18 * s + 20 * s;
        lo.items.push({ x: pad, y: y, w: cw, h: h, i: i, rec: rec, expanded: expanded });
        y += h + 24 * s;
      }
    } else {
      lo.empty = { x: pad, y: y, w: cw, h: 230 * s };
      y += 230 * s + 20 * s;
      lo.goBtn = { x: lo.empty.x + lo.empty.w / 2 - 60 * s, y: lo.empty.y + lo.empty.h - 56 * s, w: 120 * s, h: 38 * s, label: '去开一局', track: true, fontSize: 12 * s };
      y += 20 * s;
    }
    /* 页脚（Web: border-t-2 + 返回目录） */
    lo.footY = y;
    backBtn = { x: pad, y: y + 22 * s, w: 110 * s, h: 32 * s, label: '← 返回目录', fontSize: 12 * s };
    lo.contentH = y + 66 * s;
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
  function enter() { pg = Page.create(contentH); pressed = {}; openMoves = -1; }

  function draw(ctx) {
    var lo = layout();
    var L = G.Layout;
    var App = G.App;
    var s = lo.S;

    U.statusBar(ctx, lo.W, lo.statusY);

    ctx.save();
    ctx.translate(0, -pg.scroll);

    /* 章头（Web：棋谱档案馆 + 斜体 the archive + CH.06 + border-b-2） */
    U.text(ctx, '棋谱档案馆', lo.pad, lo.headY + 36 * s, 30 * s, T.ink, 'serifX');
    U.text(ctx, 'the archive', lo.pad + 168 * s, lo.headY + 36 * s, 14 * s, 'rgba(26,26,26,0.55)', 'westI');
    U.tracked(ctx, 'CH.06', lo.W - lo.pad, lo.headY + 18 * s, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 4 * s, 'right');
    U.hline(ctx, lo.pad, lo.headY + 50 * s, lo.W - lo.pad * 2, T.ink, 2);

    /* 引导段 */
    for (var li = 0; li < lo.leadLines.length; li++) {
      U.text(ctx, lo.leadLines[li], lo.pad, lo.headY + 72 * s + li * 20 * s, 13 * s, 'rgba(26,26,26,0.7)', 'serif');
    }

    if (!App.archive.length) {
      drawEmpty(ctx, lo, s);
    } else {
      for (var i = 0; i < lo.items.length; i++) {
        drawSpread(ctx, lo.items[i], s);
      }
    }

    /* 页脚 */
    U.hline(ctx, lo.pad, lo.footY, lo.W - lo.pad * 2, T.ink, 2);
    U.ghostButton(ctx, backBtn, pressed.back);

    ctx.restore();
    Page.indicator(ctx, pg);
    U.folio(ctx, '6');
  }

  /* 空态（Web: border-2 dashed ink/40 + ArchiveX 图标 + 标题 + 文案 + 去开一局） */
  function drawEmpty(ctx, lo, s) {
    var e = lo.empty;
    ctx.strokeStyle = 'rgba(26,26,26,0.4)'; ctx.lineWidth = 2;
    ctx.setLineDash([8 * s, 6 * s]);
    ctx.strokeRect(e.x, e.y, e.w, e.h);
    ctx.setLineDash([]);
    var cx = e.x + e.w / 2;
    /* 档案盒线稿（ArchiveX） */
    var iy = e.y + 44 * s;
    ctx.strokeStyle = 'rgba(26,26,26,0.3)'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 20 * s, iy - 8 * s); ctx.lineTo(cx - 11 * s, iy - 16 * s);
    ctx.lineTo(cx + 11 * s, iy - 16 * s); ctx.lineTo(cx + 20 * s, iy - 8 * s);
    ctx.lineTo(cx + 20 * s, iy + 14 * s); ctx.lineTo(cx - 20 * s, iy + 14 * s);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 20 * s, iy - 8 * s); ctx.lineTo(cx + 20 * s, iy - 8 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 6 * s, iy + 1 * s); ctx.lineTo(cx + 6 * s, iy + 1 * s);
    ctx.stroke();
    U.text(ctx, '档案馆尚无卷宗', cx, e.y + 100 * s, 18 * s, 'rgba(26,26,26,0.6)', 'serifB', false, 'center');
    var l1 = '空的书脊立在这里等棋谱。去下一局棋，收笔时按「保存此局入档」，';
    var l2 = '这一格就会立起第一册卷宗。';
    U.text(ctx, l1, cx, e.y + 132 * s, 12 * s, 'rgba(26,26,26,0.55)', 'serif', false, 'center');
    U.text(ctx, l2, cx, e.y + 152 * s, 12 * s, 'rgba(26,26,26,0.55)', 'serif', false, 'center');
    U.button(ctx, lo.goBtn, pressed.go);
  }

  /* 卷宗行命中区（确定性几何，draw 与 press 共用，不依赖一次性 layout 对象） */
  function itemRowRects(it, s) {
    var movY = it.y + 214 * s;
    return {
      moves: { x: it.x, y: movY, w: it.w, h: 32 * s },
      del: { x: it.x + it.w - 78 * s, y: movY + 8 * s, w: 60 * s, h: 22 * s },
    };
  }

  /* 卷宗 spread（Web Spread 1:1：border-2 + 7px 硬阴影 + №头行 + RESULT + MARGINALIA + 着法折叠 + 销毁） */
  function drawSpread(ctx, it, s) {
    var rec = it.rec;
    var four = rec.mode === 'quad';
    /* 卡：7px 墨色硬阴影 */
    ctx.fillStyle = T.ink;
    ctx.fillRect(it.x + 7, it.y + 7, it.w, it.h);
    ctx.fillStyle = T.paper;
    ctx.fillRect(it.x, it.y, it.w, it.h);
    ctx.strokeStyle = T.ink; ctx.lineWidth = 2;
    ctx.strokeRect(it.x, it.y, it.w, it.h);
    var pad20 = 20 * s;

    /* 头行：№N（红蓝交替）+ 日期 + 模式（border-b-2） */
    ctx.fillStyle = it.i % 2 === 0 ? T.qa : T.qb;
    ctx.font = U.font(22 * s, 'westX');
    ctx.fillText('№' + (it.i + 1), it.x + pad20, it.y + 30 * s);
    var dateStr = rec.date || '';
    U.text(ctx, dateStr + ' · ' + modeStr(rec), it.x + it.w - pad20, it.y + 26 * s, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 'right');
    U.hline(ctx, it.x, it.y + 44 * s, it.w, T.ink, 2);

    /* 胜负主版：RESULT · 收笔 / 胜者大字 / 收笔原因 */
    var winCol = four ? T.playerColor(rec.winner) : (rec.winner === 'A' ? T.qa : T.qb);
    U.tracked(ctx, 'RESULT · 收笔', it.x + pad20, it.y + 72 * s, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 3 * s);
    U.text(ctx, winnerLabel(rec) + ' 胜', it.x + pad20, it.y + 108 * s, 30 * s, winCol, 'serifX');
    U.text(ctx, reasonOf(rec) + ' · ' + rec.moves + ' 手' + (four ? ' · 四人围坐' : ''),
      it.x + pad20, it.y + 132 * s, 11 * s, 'rgba(26,26,26,0.55)', 'mono');

    /* MARGINALIA 数据小注（红蓝圆点引导） */
    var my = it.y + 150 * s;
    var notes = [
      '开本 ' + rec.size + '×' + rec.size + ' · 每方 ' + rec.walls + ' 板 · ' + modeStr(rec),
      '全局 ' + rec.moves + ' 手 · 双方共落板 ' + wallCount(rec) + ' 根',
      reasonOf(rec) + ' · ' + (rec.date || '') + ' 入档',
    ];
    for (var n = 0; n < notes.length; n++) {
      ctx.fillStyle = n % 2 === 0 ? T.qa : T.qb;
      ctx.beginPath(); ctx.arc(it.x + pad20 + 3 * s, my + 4 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
      U.text(ctx, notes[n], it.x + pad20 + 14 * s, my + 8 * s, 12 * s, 'rgba(26,26,26,0.8)', 'serif');
      my += 20 * s;
    }

    /* 着法卷宗（折叠行，Web border-t） */
    var movY = my + 4 * s;
    U.hline(ctx, it.x, movY, it.w, 'rgba(26,26,26,0.3)', 1);
    var nots = rec.notations || [];
    U.text(ctx, '卷宗着法 · ' + nots.length + ' 着', it.x + pad20, movY + 22 * s, 11 * s, 'rgba(26,26,26,0.6)', 'mono');
    /* 折叠箭头 */
    ctx.strokeStyle = 'rgba(26,26,26,0.6)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    var ax = it.x + it.w - 70 * s, ay = movY + 18 * s;
    ctx.beginPath();
    if (it.expanded) { ctx.moveTo(ax - 4 * s, ay - 2 * s); ctx.lineTo(ax, ay + 2 * s); ctx.lineTo(ax + 4 * s, ay - 2 * s); }
    else { ctx.moveTo(ax - 4 * s, ay + 2 * s); ctx.lineTo(ax, ay - 2 * s); ctx.lineTo(ax + 4 * s, ay + 2 * s); }
    ctx.stroke(); ctx.lineCap = 'butt';
    /* 销毁（ghost 文字钮，右下角与着法行对齐） */
    U.text(ctx, '销毁', it.x + it.w - pad20, movY + 22 * s, 11 * s, pressed['del' + it.i] ? T.ink : 'rgba(26,26,26,0.45)', 'mono', false, 'right');

    /* 展开的着法列表（Web ol：NN 甲 记谱） */
    if (it.expanded && nots.length) {
      var ly = movY + 40 * s;
      var shown = nots.slice(0, 8);
      for (var m = 0; m < shown.length; m++) {
        U.text(ctx, (m + 1 < 10 ? '0' : '') + (m + 1), it.x + pad20, ly + m * 18 * s, 11 * s, 'rgba(26,26,26,0.45)', 'mono');
        U.text(ctx, shown[m], it.x + pad20 + 30 * s, ly + m * 18 * s, 12 * s, winCol, 'mono');
      }
      if (nots.length > 8) {
        U.text(ctx, '…… 共 ' + nots.length + ' 着', it.x + pad20, ly + 8 * 18 * s, 10 * s, 'rgba(26,26,26,0.45)', 'mono');
      }
    }
  }

  function press(x, y) {
    pressed = {};
    pg.press(x, y);
    var lo = layout();
    var s = lo.S;
    var cy = pg.cy(y);
    for (var i = 0; i < lo.items.length; i++) {
      var rects = itemRowRects(lo.items[i], s);
      if (U.inRect(rects.del, x, cy)) pressed['del' + i] = true;
      else if (U.inRect(rects.moves, x, cy)) pressed['mov' + i] = true;
    }
    if (lo.goBtn && U.inRect(lo.goBtn, x, cy)) pressed.go = true;
    if (U.inRect(backBtn, x, cy)) pressed.back = true;
  }
  function drag(x, y) { pg.drag(x, y); }
  function release(x, y) {
    var kind = pg.release(x, y);
    if (kind !== 'tap') { pressed = {}; return; }
    var lo = layout();
    var App = G.App;
    var s = lo.S;
    var cy = pg.cy(y);
    for (var i = 0; i < lo.items.length; i++) {
      var rects2 = itemRowRects(lo.items[i], s);
      if (pressed['del' + i] && U.inRect(rects2.del, x, cy)) {
        App.archiveRemove(lo.items[i].i);
        App.sfx('reject');
        if (openMoves === i) openMoves = -1;
        pressed = {};
        App.requestRedraw();
        return;
      }
      if (pressed['mov' + i] && U.inRect(rects2.moves, x, cy)) {
        openMoves = openMoves === i ? -1 : i;
        App.sfx('pawn-click');
        pressed = {};
        App.requestRedraw();
        return;
      }
    }
    if (pressed.go && lo.goBtn && U.inRect(lo.goBtn, x, cy)) {
      App.sfx('pawn-click');
      App.gotoScene('toc');
      pressed = {}; return;
    }
    if (pressed.back && U.inRect(backBtn, x, cy)) {
      App.sfx('pawn-click');
      App.gotoScene('toc');
    }
    pressed = {};
  }

  G.Scenes = G.Scenes || {};
  G.Scenes.archive = { enter: enter, draw: draw, press: press, drag: drag, release: release };
})();

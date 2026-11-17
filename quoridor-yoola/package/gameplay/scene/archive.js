/* 步步为营 — 棋谱档案馆场景（Web 版 ArchiveView 竖屏版，CH.06）
 * 卷宗列表：模式/日期/结果/手数 + 记谱缩略 + 销毁卷宗；空态引导开局。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var Page = G.Page;

  var pg = null;
  var pressed = {};

  var MODE_LABEL = { ai: '单人对弈', local: '双人同屏', quad: '四人围坐' };
  var REASON_LABEL = { goal: '抵达底线', resign: '认输收束', timeout: '超时判负', last: '末位收笔' };

  function layout() {
    var L = G.Layout;
    var W = L.w;
    var s = Math.min(W / 414, 1.25);
    var pad = 20 * s;
    var cw = W - pad * 2;
    var App = G.App;
    var lo = { W: W, S: s, pad: pad };

    lo.statusY = Math.max(L.safeTop, 14) + 16 * s;
    var y = lo.statusY + 30 * s;
    lo.headY = y;
    y += 78 * s;

    lo.statsY = y;
    y += 26 * s;

    lo.items = [];
    if (App.archive.length) {
      for (var i = 0; i < App.archive.length; i++) {
        var rec = App.archive[i];
        var noteLines = Math.min(Math.ceil((rec.notations || []).length / 3), 3);
        var h = 118 * s + noteLines * 16 * s;
        lo.items.push({ x: pad, y: y, w: cw, h: h, i: i, rec: rec });
        y += h + 14 * s;
      }
    } else {
      lo.empty = { x: pad, y: y + 20 * s, w: cw };
      y += 250 * s;
    }
    lo.goBtn = { x: pad, y: y, w: 150 * s, h: 40 * s, label: '去开一局', solidColor: T.ink, fontSize: 12.5 * s, track: true };
    y += 40 * s + 16 * s;
    backBtn = { x: pad, y: y, w: 110 * s, h: 34 * s, label: '← 返回目录', fontSize: 11.5 * s, track: true };
    lo.contentH = y + 34 * s + 30 * s;
    return lo;
  }
  var backBtn = null;

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
    var App = G.App;
    var s = lo.S;

    U.statusBar(ctx, lo.W, lo.statusY);

    ctx.save();
    ctx.translate(0, -pg.scroll);

    U.text(ctx, '棋谱档案馆', lo.pad, lo.headY + 34 * s, 28 * s, T.ink, 'serifX', true);
    U.text(ctx, 'the archive of games', lo.W - lo.pad - 46 * s, lo.headY + 30 * s, 13 * s, 'rgba(26,26,26,0.55)', 'westI', false, 'right');
    U.tracked(ctx, 'CH.06', lo.W - lo.pad, lo.headY + 12 * s, 10 * s, 'rgba(26,26,26,0.5)', 'mono', false, 2 * s, 'right');
    U.hline(ctx, lo.pad, lo.headY + 48 * s, lo.W - lo.pad * 2, 'rgba(26,26,26,0.25)', 1);

    /* 数据小注 */
    U.text(ctx, 'MARGINALIA · 累计 ' + App.stats.played + ' 局 · 执甲胜 ' + App.stats.won + ' 局' + (App.archive.length ? ' · 现存 ' + App.archive.length + ' 册卷宗' : ''),
      lo.pad, lo.statsY, 10 * s, 'rgba(26,26,26,0.5)', 'mono');

    if (!App.archive.length) {
      /* 空态 */
      var e = lo.empty;
      U.text(ctx, '档案馆尚无卷宗', lo.W / 2, e.y + 30 * s, 16 * s, T.ink, 'serifB', true, 'center');
      var l1 = '空的书脊立在这里等棋谱。去下一局棋，收笔时按「保存此局入档」，';
      var l2 = '这一格就会立起第一册卷宗。';
      U.text(ctx, l1, lo.W / 2, e.y + 62 * s, 11.5 * s, 'rgba(26,26,26,0.6)', 'serif', false, 'center');
      U.text(ctx, l2, lo.W / 2, e.y + 80 * s, 11.5 * s, 'rgba(26,26,26,0.6)', 'serif', false, 'center');
    } else {
      for (var i = 0; i < lo.items.length; i++) {
        drawItem(ctx, lo.items[i], s);
      }
    }

    U.button(ctx, lo.goBtn, pressed.go);
    U.button(ctx, backBtn, pressed.back);
    U.nBadge(ctx, 14 * s + 20 * s, pg.cy(L.h) - 34 * s, 20 * s);

    ctx.restore();
    Page.indicator(ctx, pg);
  }

  function drawItem(ctx, it, s) {
    var rec = it.rec;
    U.card(ctx, it, { shadow: false });
    var four = rec.mode === 'quad';
    var winCol = T.playerColor(rec.winner);
    /* 头行：模式 + 日期 + 结果 */
    U.tracked(ctx, MODE_LABEL[rec.mode] || '对局', it.x + 12 * s, it.y + 20 * s, 9 * s, 'rgba(26,26,26,0.55)', 'mono', false, 1.2 * s);
    U.text(ctx, rec.date || '', it.x + it.w - 76 * s, it.y + 20 * s, 9 * s, 'rgba(26,26,26,0.5)', 'mono', false, 'right');
    var resultTxt = 'RESULT · ' + (REASON_LABEL[rec.winReason] || '收笔');
    ctx.fillStyle = winCol;
    ctx.fillRect(it.x + it.w - 76 * s + 6 * s, it.y + 12 * s, 70 * s, 14 * s);
    U.text(ctx, resultTxt, it.x + it.w - 6 * s, it.y + 22 * s, 8 * s, T.paper, 'mono', false, 'right');
    /* 胜者 */
    U.text(ctx, T.playerName(rec.winner) + ' 胜 · ' + rec.moves + ' 手', it.x + 12 * s, it.y + 42 * s, 14 * s, winCol, 'serifB', true);
    U.text(ctx, rec.size + '×' + rec.size + ' · 每方 ' + rec.walls + ' 板' + (four ? ' · 四人围坐' : ''),
      it.x + it.w - 12 * s, it.y + 42 * s, 9.5 * s, 'rgba(26,26,26,0.5)', 'mono', false, 'right');
    U.hline(ctx, it.x + 12 * s, it.y + 54 * s, it.w - 24 * s, 'rgba(26,26,26,0.15)', 1);
    /* 记谱（每行 3 着） */
    var notes = rec.notations || [];
    var shown = notes.slice(-9);
    for (var n = 0; n < shown.length; n++) {
      var col = n % 3, row = Math.floor(n / 3);
      U.text(ctx, shown[n], it.x + 12 * s + col * ((it.w - 24 * s) / 3), it.y + 72 * s + row * 16 * s, 9.5 * s, T.ink, 'mono');
    }
    if (notes.length > 9) {
      U.text(ctx, '…… 共 ' + notes.length + ' 着', it.x + 12 * s, it.y + 72 * s + Math.ceil(Math.min(notes.length, 9) / 3) * 16 * s + 4 * s, 9 * s, 'rgba(26,26,26,0.45)', 'mono');
    }
    /* 销毁按钮 */
    var dw = 92 * s;
    var db = { x: it.x + it.w - dw - 12 * s, y: it.y + it.h - 32 * s, w: dw, h: 24 * s, label: '销毁此卷宗', fontSize: 9 * s, track: true };
    U.button(ctx, db, pressed['del' + it.i]);
    it._del = db;
  }

  function press(x, y) {
    pressed = {};
    pg.press(x, y);
    var lo = layout();
    var cy = pg.cy(y);
    for (var i = 0; i < lo.items.length; i++) {
      if (lo.items[i]._del && U.inRect(lo.items[i]._del, x, cy)) pressed['del' + i] = true;
    }
    if (U.inRect(lo.goBtn, x, cy)) pressed.go = true;
    if (U.inRect(backBtn, x, cy)) pressed.back = true;
  }
  function drag(x, y) { pg.drag(x, y); }
  function release(x, y) {
    var kind = pg.release(x, y);
    if (kind !== 'tap') { pressed = {}; return; }
    var lo = layout();
    var App = G.App;
    var cy = pg.cy(y);
    for (var i = 0; i < lo.items.length; i++) {
      if (pressed['del' + i] && lo.items[i]._del && U.inRect(lo.items[i]._del, x, cy)) {
        App.archiveRemove(lo.items[i].i);
        App.sfx('reject');
        pressed = {};
        App.requestRedraw();
        return;
      }
    }
    if (pressed.go && U.inRect(lo.goBtn, x, cy)) {
      App.sfx('pawn-click');
      App.mode = 'ai';
      App.gotoScene('setup');
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

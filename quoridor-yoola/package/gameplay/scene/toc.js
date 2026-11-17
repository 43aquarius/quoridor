/* 步步为营 — 目录场景（Web 版 ContentsView 1:1，竖屏可滚动）
 * TABLE OF CONTENTS 眉标 / 目 录 / 2px 粗横线 / 章节条目（红蓝序号交替、
 * 点线引导、罗马页码）/ 续读书签条 / 色版条 / 音效开关
 * 快手离线环境无在线对战：该章显示「本平台暂不支持」态。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var Page = G.Page;

  var pg = null;
  var pressed = {};   /* 'ch2' / 'resume' / 'discard' / 'sound' / 'skin1'... */

  var CHAPTERS = [
    { idx: '01', title: '单人对弈', en: 'SOLO — AGAINST THE DESK', desc: '与编辑部过招：学徒 · 排字师 · 总编 · 社长，四档职位任选。', page: 'Ⅰ', scene: 'setup', mode: 'ai' },
    { idx: '02', title: '双人同屏', en: 'TWO READERS, ONE BOARD', desc: '一册棋盘，两副活字。先择开本再开局；回合切换时，纸面轻轻换页。', page: 'Ⅱ', scene: 'setup', mode: 'local' },
    { idx: '03', title: '四人围坐', en: 'FOUR SEATS, ONE TABLE', desc: '四副活字围一册棋盘，顺时针行棋、出局制；空座可交编辑部 AI 代打。', page: 'Ⅲ', scene: 'setup', mode: 'quad' },
    { idx: '04', title: '在线对战', en: 'PLAY ACROSS THE MARGIN', desc: '四位房间码开房对坐，实时同步；断线五分钟内可回座。支持双人与四人围桌。', page: 'Ⅳ', scene: null, mode: 'online' },
    { idx: '05', title: '规则', en: 'EDITOR’S NOTE ON THE RULES', desc: '编者按：关于行棋、挡板与跳子的全部排版纪律。', page: 'Ⅴ', scene: 'rules', mode: null },
    { idx: '06', title: '棋谱档案馆', en: 'THE ARCHIVE OF GAMES', desc: '历史对局的全宗卷宗，每一局是一页可翻的 spread。', page: 'Ⅵ', scene: 'archive', mode: null },
  ];

  function layout() {
    var L = G.Layout;
    var W = L.w;
    var S = Math.min(W / 414, 1.25);
    var pad = 20 * S;
    var lo = { W: W, S: S, pad: pad };

    lo.statusY = Math.max(L.safeTop, 14) + 16 * S;
    lo.mastY = lo.statusY + 42 * S;
    lo.titleY = lo.mastY + 44 * S;
    lo.ruleY = lo.titleY + 18 * S;

    var y = lo.ruleY + 26 * S;
    /* 续读条 */
    if (G.App.saveExists) {
      lo.resume = { x: pad, y: y, w: W - pad * 2, h: 52 * S };
      var btnW2 = 96 * S;
      lo.resumeBtn = { x: lo.resume.x + lo.resume.w - btnW2 - 12 * S, y: lo.resume.y + 8 * S, w: btnW2, h: 26 * S, label: '续读 RESUME', track: true, fontSize: 9.5 * S };
      lo.discardBtn = { x: lo.resume.x + lo.resume.w - btnW2 * 2 - 20 * S, y: lo.resume.y + 8 * S, w: btnW2, h: 26 * S, label: '抽掉书签', track: true, fontSize: 9.5 * S };
      y += 52 * S + 22 * S;
    }
    /* 章节条目 */
    lo.items = [];
    for (var i = 0; i < CHAPTERS.length; i++) {
      var ch = CHAPTERS[i];
      var itemH = 96 * S;
      lo.items.push({ x: pad, y: y, w: W - pad * 2, h: itemH, ch: ch });
      y += itemH;
    }
    y += 10 * S;
    /* 页脚 */
    lo.footY = y + 8 * S;
    /* 色版条（确定性几何） */
    var swatchW = 64 * S, swatchH = 44 * S;
    lo.swatches = [];
    for (var si = 0; si < T.skins.length; si++) {
      var sx = pad + si * (swatchW + 10 * S);
      lo.swatches.push({ x: sx, y: lo.footY + 18 * S, w: swatchW, h: swatchH + 18 * S, i: si });
    }
    lo.skins = { y: lo.footY, h: 84 * S };
    lo.soundBtn = { x: pad, y: lo.footY + lo.skins.h + 14 * S, w: 150 * S, h: 34 * S, track: true, fontSize: 10 * S };
    lo.statsY = lo.soundBtn.y + lo.soundBtn.h + 26 * S;
    lo.contentH = lo.statsY + 10 * S;
    return lo;
  }

  function contentH() { return layout().contentH; }

  function enter() {
    pg = Page.create(contentH);
    pressed = {};
  }

  function draw(ctx) {
    var lo = layout();
    var L = G.Layout;
    var App = G.App;
    var S = lo.S;

    U.statusBar(ctx, lo.W, lo.statusY, App.soundOn ? '红·蓝 套印' : '红·蓝 套印 · 静音');

    ctx.save();
    ctx.translate(0, -pg.scroll);

    /* 章头 */
    U.tracked(ctx, 'TABLE OF CONTENTS', lo.pad, lo.mastY, 10 * S, T.light, 'mono', false, 4 * S);
    U.text(ctx, '目 录', lo.pad, lo.titleY + 30 * S, 44 * S, T.ink, 'serifX', true);
    U.hline(ctx, lo.pad, lo.ruleY, lo.W - lo.pad * 2, T.ink, 2);
    U.text(ctx, 'six chapters, one game', lo.W - lo.pad, lo.titleY + 18 * S, 13 * S, 'rgba(26,26,26,0.55)', 'westI', false, 'right');

    /* 续读书签 */
    if (lo.resume) {
      var r = lo.resume;
      ctx.fillStyle = 'rgba(26,26,26,0.04)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = T.qa;
      ctx.fillRect(r.x, r.y, 4 * S, r.h);
      U.text(ctx, '书签还夹在上一局：纸面存有未完的棋局，可续读。', r.x + 14 * S, r.y + 24 * S, 12.5 * S, T.ink, 'serif');
      U.button(ctx, lo.resumeBtn, pressed.resume);
      U.button(ctx, lo.discardBtn, pressed.discard);
    }

    /* 章节条目 */
    for (var i = 0; i < lo.items.length; i++) {
      var it = lo.items[i];
      var ch = it.ch;
      var y = it.y;
      var isOnline = ch.scene === null;
      U.hline(ctx, it.x, y + it.h, it.w, 'rgba(26,26,26,0.25)', 1);
      /* 序号（红蓝交替） */
      ctx.font = U.font(30 * S, 'westX', true);
      ctx.fillStyle = i % 2 === 0 ? T.qa : T.qb;
      ctx.textAlign = 'left';
      ctx.fillText(ch.idx, it.x, y + 34 * S);
      /* 标题 */
      var tx = it.x + 52 * S;
      U.text(ctx, ch.title, tx, y + 24 * S, 19 * S, isOnline ? 'rgba(26,26,26,0.4)' : T.ink, 'serifB', true);
      /* 描述（原文案） */
      var lines = U.wrap(ctx, ch.desc, it.w - 52 * S - 30 * S, 12 * S, 'serif');
      for (var dli = 0; dli < lines.length && dli < 2; dli++) {
        U.text(ctx, lines[dli], tx, y + 44 * S + dli * 17 * S, 12 * S, isOnline ? 'rgba(26,26,26,0.45)' : 'rgba(26,26,26,0.62)', 'serif');
      }
      if (isOnline) {
        U.text(ctx, '快手离线环境暂不支持 · 可先玩前五章', tx, y + 44 * S + lines.length * 17 * S + 2 * S, 10 * S, T.risoRed, 'mono');
      }
      if (ch.scene === 'archive' && App.archive.length > 0) {
        U.tracked(ctx, '现存 ' + App.archive.length + ' 局卷宗', tx, y + 44 * S + lines.length * 17 * S + (isOnline ? 16 * S : 4 * S), 9 * S, 'rgba(26,26,26,0.4)', 'mono', false, 1);
      }
      /* 点线 + 罗马页码 */
      U.dotLeader(ctx, tx + 60 * S, y + it.h - 14 * S, it.w - 60 * S - 44 * S - 52 * S, 'rgba(26,26,26,0.45)');
      U.text(ctx, ch.page, it.x + it.w - 8 * S, y + it.h - 8 * S, 16 * S, 'rgba(26,26,26,0.5)', 'westI', false, 'right');
      if (isOnline) {
        /* 置灰标识：标题旁小红签改为序号后置灰点 */
        ctx.fillStyle = 'rgba(26,26,26,0.3)';
        ctx.fillRect(tx + 96 * S, y + 12 * S, 44 * S, 12 * S);
      }
    }

    /* 页脚：色版条（给制） */
    var fy = lo.footY;
    U.tracked(ctx, '套印色版 RISO PALETTE', lo.pad, fy + 12 * S, 9.5 * S, T.light, 'mono', false, 1.5 * S);
    U.text(ctx, '拖动选择套印配色', lo.W - lo.pad, fy + 12 * S, 10 * S, 'rgba(26,26,26,0.5)', 'serif', false, 'right');
    var swW = 64 * S, swH = 44 * S;
    for (var si = 0; si < lo.swatches.length; si++) {
      var sw = lo.swatches[si];
      var sk = T.skins[si];
      var selected = App.skin === si;
      ctx.fillStyle = sk.qa;
      ctx.fillRect(sw.x, sw.y, swW / 2, swH);
      ctx.fillStyle = sk.qb;
      ctx.fillRect(sw.x + swW / 2, sw.y, swW / 2, swH);
      /* 梳齿 */
      ctx.fillStyle = T.ink;
      for (var th = 0; th < 4; th++) ctx.fillRect(sw.x + th * (swW / 4) + 2, sw.y - 4 * S, swW / 4 - 4, 3);
      ctx.strokeStyle = selected ? T.ink : 'rgba(26,26,26,0.4)';
      ctx.lineWidth = selected ? 2.5 : 1.2;
      ctx.strokeRect(sw.x, sw.y, swW, swH);
      U.text(ctx, sk.label, sw.x + swW / 2, sw.y + swH + 14 * S, 9.5 * S, selected ? T.ink : 'rgba(26,26,26,0.55)', 'serifB', selected, 'center');
    }

    /* 音效开关 */
    lo.soundBtn.label = App.soundOn ? '活版音效 ON' : '活版音效 OFF';
    lo.soundBtn.selected = false;
    U.button(ctx, lo.soundBtn, pressed.sound);

    /* 战绩 */
    U.text(ctx, '累计对局 ' + App.stats.played + ' · 执甲胜 ' + App.stats.won, lo.W / 2, lo.statsY, 10 * S, 'rgba(26,26,26,0.5)', 'mono', false, 'center');

    U.nBadge(ctx, 14 * S + 20 * S, pg.cy(L.h) - 34 * S, 20 * S);

    ctx.restore();
    Page.indicator(ctx, pg);
  }

  function press(x, y) {
    pressed = {};
    pg.press(x, y);
    var lo = layout();
    var cy = pg.cy(y);
    if (lo.resumeBtn && U.inRect(lo.resumeBtn, x, cy)) pressed.resume = true;
    else if (lo.discardBtn && U.inRect(lo.discardBtn, x, cy)) pressed.discard = true;
    else if (U.inRect(lo.soundBtn, x, cy)) pressed.sound = true;
    else {
      for (var i = 0; i < lo.items.length; i++) if (U.inRect(lo.items[i], x, cy)) pressed['ch' + i] = true;
      for (var si = 0; si < lo.swatches.length; si++) {
        if (U.inRect(lo.swatches[si], x, cy)) pressed['skin' + si] = true;
      }
    }
  }

  function drag(x, y) { pg.drag(x, y); }

  function release(x, y) {
    var kind = pg.release(x, y);
    if (kind !== 'tap') { pressed = {}; return; }
    var lo = layout();
    var App = G.App;
    var cy = pg.cy(y);
    if (pressed.resume && lo.resumeBtn && U.inRect(lo.resumeBtn, x, cy)) {
      App.startGame(true);
      pressed = {};
      return;
    }
    if (pressed.discard && lo.discardBtn && U.inRect(lo.discardBtn, x, cy)) {
      App.discardSave();
      pressed = {};
      return;
    }
    if (pressed.sound && U.inRect(lo.soundBtn, x, cy)) {
      App.soundOn = !App.soundOn;
      G.App.savePrefs();
      App.sfx('pawn-click');
      pressed = {};
      return;
    }
    for (var si = 0; si < lo.swatches.length; si++) {
      {
        if (pressed['skin' + si] && U.inRect(lo.swatches[si], x, cy)) {
          App.skin = si;
          T.applySkin(si);
          G.App.savePrefs();
          App.sfx('pawn-click');
          pressed = {};
          return;
        }
      }
    }
    for (var i = 0; i < lo.items.length; i++) {
      if (pressed['ch' + i] && U.inRect(lo.items[i], x, cy)) {
        var ch = lo.items[i].ch;
        if (ch.scene) {
          if (ch.mode) App.mode = ch.mode;
          App.sfx('pawn-click');
          App.gotoScene(ch.scene);
        }
        pressed = {};
        return;
      }
    }
    pressed = {};
  }

  G.Scenes = G.Scenes || {};
  G.Scenes.toc = { enter: enter, draw: draw, press: press, drag: drag, release: release };
})();

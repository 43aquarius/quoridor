/* 步步为营 — 目录场景（Web 版 ContentsView 1:1，竖屏可滚动）
 * TABLE OF CONTENTS 眉标 / 目 录 / 2px 粗横线 / 章节条目（红蓝序号、
 * 罗马页码右下）/ 续读书签条 / 色版胶片条 / 音效与开源按钮。
 * 快手离线环境无在线对战：该章显示「本平台暂不支持」小注。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var Page = G.Page;

  var pg = null;
  var pressed = {};   /* 'ch2' / 'resume' / 'discard' / 'sound' / 'github' / 'skin1'... */

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
    lo.mastY = lo.statusY + 46 * S;
    lo.titleY = lo.mastY + 48 * S;
    lo.ruleY = lo.titleY + 20 * S;

    var y = lo.ruleY + 26 * S;
    /* 续读条（两行：文字 + 按钮行） */
    if (G.App.saveExists) {
      lo.resume = { x: pad, y: y, w: W - pad * 2, h: 74 * S };
      var btnW2 = 92 * S;
      lo.resumeBtn = { x: lo.resume.x + lo.resume.w - btnW2 - 14 * S, y: lo.resume.y + 38 * S, w: btnW2, h: 28 * S, label: '续读 RESUME', track: true, fontSize: 10 * S };
      lo.discardBtn = { x: lo.resume.x + lo.resume.w - btnW2 * 2 - 24 * S, y: lo.resume.y + 38 * S, w: btnW2, h: 28 * S, label: '抽掉书签', track: true, fontSize: 10 * S, ghost: true };
      y += 74 * S + 26 * S;
    }
    /* 章节条目 */
    lo.items = [];
    for (var i = 0; i < CHAPTERS.length; i++) {
      var ch = CHAPTERS[i];
      var itemH = 96 * S + (ch.scene === null ? 12 * S : 0);
      lo.items.push({ x: pad, y: y, w: W - pad * 2, h: itemH, ch: ch });
      y += itemH;
    }
    y += 24 * S;
    /* 页脚：胶片条 + 按钮行 */
    lo.footY = y;
    lo.filmX = pad;
    y += 108 * S;
    lo.soundBtn = { x: pad, y: y, w: 138 * S, h: 34 * S, label: '', track: true, fontSize: 11 * S };
    lo.githubBtn = { x: pad + 150 * S, y: y, w: 128 * S, h: 34 * S, label: '开源 GITHUB', track: true, fontSize: 11 * S };
    y += 34 * S + 46 * S;
    lo.contentH = y;
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

    U.statusBar(ctx, lo.W, lo.statusY);

    ctx.save();
    ctx.translate(0, -pg.scroll);

    /* 章头（Web: 眉标 + 目 录 + border-b-2；six chapters… 移动端隐藏） */
    U.tracked(ctx, 'TABLE OF CONTENTS', lo.pad, lo.mastY, 10 * S, 'rgba(26,26,26,0.55)', 'mono', false, 5 * S);
    U.text(ctx, '目 录', lo.pad, lo.titleY + 30 * S, 46 * S, T.ink, 'serifX');
    U.hline(ctx, lo.pad, lo.ruleY, lo.W - lo.pad * 2, T.ink, 2);

    /* 续读书签（Web: border-l-4 qa + bg ink/4 + 图标 + 两按钮） */
    if (lo.resume) {
      var r = lo.resume;
      ctx.fillStyle = 'rgba(26,26,26,0.04)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = T.qa;
      ctx.fillRect(r.x, r.y, 4 * S, r.h);
      /* 书本小图标（Web BookOpen） */
      ctx.strokeStyle = T.qa; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
      var bx = r.x + 16 * S, by = r.y + 15 * S, bw2 = 15 * S;
      ctx.beginPath();
      ctx.moveTo(bx, by + 2 * S);
      ctx.quadraticCurveTo(bx + bw2 / 2, by - 2 * S, bx + bw2 / 2, by + 2 * S);
      ctx.moveTo(bx + bw2 / 2, by + 2 * S);
      ctx.quadraticCurveTo(bx + bw2, by - 2 * S, bx + bw2, by + 2 * S);
      ctx.lineTo(bx + bw2, by + 13 * S);
      ctx.quadraticCurveTo(bx + bw2 / 2, by + 10 * S, bx + bw2 / 2, by + 13 * S);
      ctx.quadraticCurveTo(bx, by + 10 * S, bx, by + 13 * S);
      ctx.closePath();
      ctx.stroke();
      U.text(ctx, '书签还夹在上一局：纸面存有未完的棋局，可续读。',
        r.x + 40 * S, r.y + 24 * S, 12.5 * S, T.ink, 'serif');
      U.button(ctx, lo.resumeBtn, pressed.resume);
      if (lo.discardBtn.ghost) U.ghostButton(ctx, lo.discardBtn, pressed.discard);
      else U.button(ctx, lo.discardBtn, pressed.discard);
    }

    /* 章节条目（Web 移动版：无点线、无英文小注；罗马页码右下） */
    for (var i = 0; i < lo.items.length; i++) {
      var it = lo.items[i];
      var ch = it.ch;
      var y = it.y;
      var isOnline = ch.scene === null;
      U.hline(ctx, it.x, y + it.h, it.w, 'rgba(26,26,26,0.25)', 1);
      /* 序号（红蓝交替，与标题基线对齐：Web items-baseline） */
      ctx.font = U.font(30 * S, 'westX');
      ctx.fillStyle = i % 2 === 0 ? T.qa : T.qb;
      ctx.textAlign = 'left';
      ctx.fillText(ch.idx, it.x, y + 30 * S);
      /* 标题（基线与序号一致） */
      var tx = it.x + 52 * S;
      U.text(ctx, ch.title, tx, y + 30 * S, 20 * S, isOnline ? 'rgba(26,26,26,0.45)' : T.ink, 'serifB');
      /* 描述 */
      var lines = U.wrap(ctx, ch.desc, it.w - 52 * S - 16 * S, 13 * S, 'serif');
      for (var dli = 0; dli < lines.length && dli < 2; dli++) {
        U.text(ctx, lines[dli], tx, y + 52 * S + dli * 19 * S, 13 * S,
          isOnline ? 'rgba(26,26,26,0.5)' : 'rgba(26,26,26,0.65)', 'serif');
      }
      if (isOnline) {
        U.text(ctx, '本平台离线运行 · 暂不支持在线对战',
          tx, y + 96 * S, 9.5 * S, 'rgba(26,26,26,0.45)', 'mono');
      }
      if (ch.scene === 'archive' && App.archive.length > 0) {
        U.text(ctx, '现存 ' + App.archive.length + ' 局卷宗',
          tx, y + 52 * S + Math.min(lines.length, 2) * 19 * S + 4 * S, 10 * S,
          'rgba(26,26,26,0.4)', 'mono');
      }
      /* 罗马页码（右下角，Web self-end text-lg italic） */
      U.text(ctx, ch.page, it.x + it.w - 4 * S, y + it.h - 12 * S, 18 * S,
        'rgba(26,26,26,0.55)', 'westI', false, 'right');
    }

    /* 页脚：套印色版胶片条 + 音效/开源按钮行（Web footer 1:1） */
    U.filmStrip(ctx, lo.filmX, lo.footY, S);
    lo.soundBtn.label = App.soundOn ? '活版音效 ON' : '活版音效 OFF';
    U.button(ctx, lo.soundBtn, pressed.sound);
    U.button(ctx, lo.githubBtn, pressed.github);

    ctx.restore();
    Page.indicator(ctx, pg);
    /* 页码（Web: fixed bottom — i —） */
    U.folio(ctx, 'i');
  }

  function press(x, y) {
    pressed = {};
    pg.press(x, y);
    var lo = layout();
    var cy = pg.cy(y);
    if (lo.resumeBtn && U.inRect(lo.resumeBtn, x, cy)) pressed.resume = true;
    else if (lo.discardBtn && U.inRect(lo.discardBtn, x, cy)) pressed.discard = true;
    else if (U.inRect(lo.soundBtn, x, cy)) pressed.sound = true;
    else if (U.inRect(lo.githubBtn, x, cy)) pressed.github = true;
    else {
      for (var i = 0; i < lo.items.length; i++) if (U.inRect(lo.items[i], x, cy)) pressed['ch' + i] = true;
      var si = U.filmStripHit(x, cy, lo.filmX, lo.footY, lo.S);
      if (si >= 0) pressed['skin' + si] = true;
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
      App.savePrefs();
      App.sfx('pawn-click');
      pressed = {};
      return;
    }
    if (pressed.github && U.inRect(lo.githubBtn, x, cy)) {
      App.showToast('快手离线环境 · 暂不支持外链，可到 GitHub 搜索 43aquaris/quoridor');
      pressed = {};
      return;
    }
    var si = U.filmStripHit(x, cy, lo.filmX, lo.footY, lo.S);
    if (pressed['skin' + si] !== undefined && pressed['skin' + si]) {
      App.skin = si;
      T.applySkin(si);
      App.savePrefs();
      App.sfx('pawn-click');
      pressed = {};
      return;
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

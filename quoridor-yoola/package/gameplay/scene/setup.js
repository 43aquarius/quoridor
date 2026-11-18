/* 步步为营 — 章节设置场景（与 Web 版 1:1）
 * 单人 CH.01（SetupView）：版式/棋钟规格卡 + 执子先后手 + 对手职位四卡（点卡即开局）
 * 双人 CH.02（LocalSetupView）：版式/棋钟 + 按此开本开局
 * 四人 CH.03（QuadSetupView）：席位配置 + AI 档位 + 开局
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;
  var Page = G.Page;

  var pg = null;
  var pressed = {};
  var dragSlider = null; /* 'walls' */

  var SIZES = [5, 7, 9, 11, 13];
  var TOTALS = [0, 60, 180, 300, 600, 1200, 1800];
  var TOTAL_LABELS = ['不限', '1 分', '3 分', '5 分', '10 分', '20 分', '30 分'];
  var PERMOVES = [0, 10, 15, 20, 30, 60, 120];
  var PERMOVE_LABELS = ['不限', '10 秒', '15 秒', '20 秒', '30 秒', '1 分', '2 分'];

  var CH_META = {
    ai: { title: '单人对弈', en: 'against the desk', ch: 'CH.01', folio: '1',
      lead: '编辑部开放四个职位与你对坐。先择一版开本与棋钟、选定执子先后手，再选一位对手，翻开对局页。' },
    local: { title: '双人同屏', en: 'two readers, one board', ch: 'CH.02', folio: '2',
      lead: '一册棋盘，两副活字。回合切换时，纸面会轻轻换页——为甲执红时棋盘自左侧翻入，为乙执蓝时自右侧翻入。先选一版开本与棋钟：小盘短打见分晓，大盘绕路藏机锋；挂了钟，超时即判负。' },
    quad: { title: '四人围坐', en: 'four seats, one table', ch: 'CH.03', folio: '3',
      lead: '四副活字围一册棋盘，顺时针行棋、出局制；空座可交编辑部 AI 代打，AI 代打不耗时。' },
  };

  function layout() {
    var L = G.Layout;
    var W = L.w;
    var S = Math.min(W / 414, 1.25);
    var pad = 20 * S;
    var cw = W - pad * 2;
    var App = G.App;
    var C = G.Core;
    var lo = { W: W, S: S, pad: pad, cw: cw };

    lo.statusY = Math.max(L.safeTop, 14) + 16 * S;
    var y = lo.statusY + 30 * S;

    /* 章头 */
    lo.head = { y: y };
    y += 84 * S;

    /* 版式规格面板（border-2 + 6px 硬阴影 + 头行 + 2×2 小卡 + 自定义区） */
    lo.fmt = { x: pad, y: y, w: cw };
    y += 42 * S;                 /* 面板头行 */
    var gap = 10 * S;
    var cardW = (cw - 32 * S - gap) / 2;
    var cardH = 104 * S;
    lo.fmtCards = [];
    var presets = App.mode === 'quad' ? C.FORMAT_PRESETS_4P : C.FORMAT_PRESETS;
    for (var i = 0; i < 4; i++) {
      var col = i % 2, row = Math.floor(i / 2);
      lo.fmtCards.push({
        x: lo.fmt.x + 16 * S + col * (cardW + gap),
        y: lo.fmt.y + 50 * S + row * (cardH + gap),
        w: cardW, h: cardH, i: i, preset: presets[i],
      });
    }
    y = lo.fmt.y + 50 * S + cardH * 2 + gap + 16 * S;
    /* 自定义区（dashed 顶线 + 标签行 + 尺寸行 + 滑杆行 + 注行） */
    lo.fmtCustomY = y;
    y += 18 * S;                 /* 标签行 */
    lo.sizeSeg = { x: lo.fmt.x + 16 * S, y: y + 14 * S, w: cw - 32 * S, h: 30 * S,
      items: SIZES.map(function (n) { return n + '路'; }), fontSize: 11.5 * S };
    lo.wallsLabelY = lo.sizeSeg.y + lo.sizeSeg.h + 20 * S;
    lo.wallsSlider = { x: lo.fmt.x + 16 * S + 70 * S, y: lo.wallsLabelY - 6 * S, w: cw - 32 * S - 70 * S - 70 * S, h: 26 * S };
    lo.wallsValX = lo.fmt.x + cw - 16 * S;
    y = lo.wallsLabelY + 22 * S;
    lo.fmtRecBtn = { x: lo.fmt.x + cw - 16 * S - 88 * S, y: y + 4 * S, w: 88 * S, h: 26 * S, label: '↺ 恢复推荐', fontSize: 10 * S, track: true };
    lo.fmtNoteY = y + 20 * S;
    y = lo.fmtNoteY + 18 * S;
    lo.fmt.h = y - lo.fmt.y;
    y += 30 * S;

    /* 棋钟规格面板 */
    lo.clk = { x: pad, y: y, w: cw };
    y += 42 * S;
    lo.clkCards = [];
    for (var k = 0; k < 4; k++) {
      var col2 = k % 2, row2 = Math.floor(k / 2);
      lo.clkCards.push({
        x: lo.clk.x + 16 * S + col2 * (cardW + gap),
        y: lo.clk.y + 50 * S + row2 * (cardH + gap),
        w: cardW, h: cardH, i: k, preset: C.TIME_PRESETS[k],
      });
    }
    y = lo.clk.y + 50 * S + cardH * 2 + gap + 16 * S;
    lo.clkCustomY = y;
    y += 18 * S;
    lo.totalSeg = { x: lo.clk.x + 16 * S, y: y + 14 * S, w: cw - 32 * S, h: 30 * S, items: TOTAL_LABELS, fontSize: 11 * S };
    lo.perSegLabelY = lo.totalSeg.y + lo.totalSeg.h + 20 * S;
    lo.perSeg = { x: lo.clk.x + 16 * S, y: lo.perSegLabelY + 14 * S, w: cw - 32 * S, h: 30 * S, items: PERMOVE_LABELS, fontSize: 11 * S };
    y = lo.perSeg.y + lo.perSeg.h + 14 * S;
    lo.clkNoteY = y;
    y += 18 * S;
    lo.clk.h = y - lo.clk.y;
    y += 30 * S;

    if (App.mode === 'ai') {
      /* 执子先后手 */
      lo.inkLabelY = y;
      lo.inkCards = [];
      lo.inkCards.push({ x: pad, y: y + 14 * S, w: cw, h: 80 * S, first: true });
      lo.inkCards.push({ x: pad, y: y + 14 * S + 80 * S + 14 * S, w: cw, h: 80 * S, first: false });
      y = lo.inkCards[1].y + 80 * S + 30 * S;

      /* 对手职位 */
      lo.oppsLabelY = y;
      lo.opps = [];
      var aiProfiles = C.AI_PROFILES;
      var powerTxt = ['', '棋力 · 入门', '棋力 · 进阶', '棋力 · 高段', '棋力 · 终审'];
      for (var lv = 1; lv <= 4; lv++) {
        var prof = aiProfiles[lv];
        lo.opps.push({ x: pad, y: y + 30 * S + (lv - 1) * (240 * S + 18 * S), w: cw, h: 240 * S,
          lv: lv, name: prof.name, title: prof.title, brief: prof.brief, power: lv, powerTxt: powerTxt[lv] });
      }
      y = lo.opps[3].y + 240 * S + 30 * S;
    } else if (App.mode === 'quad') {
      /* 席位配置（面板化，与 QuadSetupView 一致） */
      lo.seats = { x: pad, y: y, w: cw };
      y += 42 * S;
      lo.seatCards = [];
      var order = ['A', 'C', 'B', 'D'];
      var seatName = { A: '甲 · 南席', C: '丙 · 西席', B: '乙 · 北席', D: '丁 · 东席' };
      for (var si = 0; si < 4; si++) {
        var pl = order[si];
        lo.seatCards.push({ x: lo.seats.x + 16 * S, y: lo.seats.y + 50 * S + si * (58 * S + 10 * S), w: cw - 32 * S, h: 58 * S, p: pl, name: seatName[pl] });
      }
      y = lo.seatCards[3].y + 58 * S + 20 * S;
      lo.quadLvLabelY = y;
      lo.quadLvSeg = { x: lo.seats.x + 16 * S, y: y + 16 * S, w: cw - 32 * S, h: 32 * S, items: ['学徒', '排字师', '总编', '社长'], fontSize: 12 * S };
      y = lo.quadLvSeg.y + 32 * S + 14 * S;
      lo.seats.h = y - lo.seats.y;
      y += 30 * S;
    }

    /* 页脚：返回（ghost 左） + 开局（solid，仅 local/quad） + 注行 */
    lo.backBtn = { x: pad, y: y, w: 110 * S, h: 32 * S, label: '← 返回目录', fontSize: 12 * S };
    lo._backRect = { x: pad, y: y, w: 110 * S, h: 32 * S };
    if (App.mode !== 'ai') {
      lo.startBtn = { x: pad + 130 * S, y: y - 4 * S, w: cw - 130 * S, h: 40 * S, label: startLabel(), solidColor: T.ink, fontSize: 12 * S, track: true };
      y += 44 * S;
    } else {
      y += 36 * S;
    }
    lo.noteY = y;
    lo.noteLines = U.wrap(wrapCtx(), noteText(), cw, 10 * S, 'mono');
    y += lo.noteLines.length * 15 * S + 40 * S;

    lo.contentH = y;
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

  function startLabel() {
    var App = G.App;
    var fmt = App.format();
    return '按此开本开局 · ' + fmt.size + '×' + fmt.size + ' · 每方 ' + fmt.wallsPerPlayer + ' 板 · ' + clkSummary();
  }
  function noteText() {
    var App = G.App;
    if (App.mode === 'ai') return '学徒走最短路 · 排字师算路径差 · 总编做深度搜索 · 社长预算全开 · 开本与棋钟随规格生效';
    if (App.mode === 'local') return '悔棋在双人局撤回一手 · 认输随时可落笔 · 挂钟则超时判负 · 收笔后自动入档';
    return '出局制 · 四向归途 · 挡板人均减半 · AI 代打不耗时 · 四色套印固定 · 收笔后自动入档';
  }

  function contentH() { return layout().contentH; }

  function enter() {
    pg = Page.create(contentH);
    pressed = {};
  }

  /* 预设选中判定 */
  function fmtSelected(i) {
    var App = G.App;
    if (App.fmtIdx === 4) return false;
    var p = (App.mode === 'quad' ? G.Core.FORMAT_PRESETS_4P : G.Core.FORMAT_PRESETS)[i];
    var f = App.format();
    return p.size === f.size && p.wallsPerPlayer === f.wallsPerPlayer;
  }
  function clkSelected(i) {
    var App = G.App;
    if (App.clkIdx === 4) return false;
    var p = G.Core.TIME_PRESETS[i];
    var tc = App.timeControl();
    return p.totalSec === tc.totalSec && p.perMoveSec === tc.perMoveSec;
  }
  function customActive(kind) {
    return kind === 'fmt' ? !fmtSelected(0) && !fmtSelected(1) && !fmtSelected(2) && !fmtSelected(3) : !clkSelected(0) && !clkSelected(1) && !clkSelected(2) && !clkSelected(3);
  }
  function activeFmtPreset() {
    var App = G.App;
    var f = App.format();
    var list = App.mode === 'quad' ? G.Core.FORMAT_PRESETS_4P : G.Core.FORMAT_PRESETS;
    for (var i = 0; i < list.length; i++) if (list[i].size === f.size && list[i].wallsPerPlayer === f.wallsPerPlayer) return list[i];
    return null;
  }

  /* —— 面板骨架（border-2 + 6px 硬阴影 + 头行，Web section 1:1） —— */
  function panel(ctx, b, title, right) {
    ctx.fillStyle = T.ink;
    ctx.fillRect(b.x + 6, b.y + 6, b.w, b.h);
    ctx.fillStyle = T.paper;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = T.ink; ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    U.tracked(ctx, title, b.x + 16, b.y + 20, 10, 'rgba(26,26,26,0.55)', 'mono', false, 3);
    U.text(ctx, right, b.x + b.w - 16, b.y + 20, 11, T.ink, 'mono', true, 'right');
    U.hline(ctx, b.x, b.y + 30, b.w, 'rgba(26,26,26,0.3)', 1);
  }

  /* 预设小卡（Web motion.button 1:1：选中黑底反白，未选 ink/45 边；推荐角标红字纸底） */
  function presetCard(ctx, c, o, S2) {
    var sel = o.selected;
    ctx.fillStyle = sel ? T.ink : T.paper;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = sel ? T.ink : 'rgba(26,26,26,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x, c.y, c.w, c.h);
    var pad12 = 12 * S2;
    var inkOn = sel ? T.paper : T.ink;
    var subOn = sel ? 'rgba(245,242,234,0.75)' : 'rgba(26,26,26,0.6)';
    var lightOn = sel ? 'rgba(245,242,234,0.7)' : 'rgba(26,26,26,0.45)';
    /* 标签行：中文名 + 英文右上 */
    U.text(ctx, o.label, c.x + pad12, c.y + 26 * S2, 17 * S2, inkOn, 'serifX');
    if (o.en) U.tracked(ctx, o.en, c.x + c.w - pad12, c.y + 20 * S2, 8.5 * S2, lightOn, 'mono', false, 1.2 * S2, 'right');
    /* 规格行（accent 色 / 选中反白） */
    U.text(ctx, o.spec, c.x + pad12, c.y + 46 * S2, 13 * S2, sel ? T.paper : o.accent, 'mono', true);
    /* 描述（最多 2 行） */
    var lines = U.wrap(ctx, o.sub, c.w - pad12 * 2, 11 * S2, 'serif');
    for (var di = 0; di < lines.length && di < 2; di++) {
      U.text(ctx, lines[di], c.x + pad12, c.y + 66 * S2 + di * 16 * S2, 11 * S2, subOn, 'serif');
    }
    /* 推荐角标（跨上边线：纸底红框红星） */
    if (o.badge) {
      var bw = U.trackedWidth(ctx, '★ ' + o.badge, 8, 'mono', false, 0.5) + 10;
      ctx.fillStyle = T.paper;
      ctx.fillRect(c.x + c.w - bw - 10, c.y - 7, bw, 14);
      ctx.strokeStyle = T.risoRed; ctx.lineWidth = 1;
      ctx.strokeRect(c.x + c.w - bw - 10, c.y - 7, bw, 14);
      U.tracked(ctx, '★ ' + o.badge, c.x + c.w - bw - 10 + 5, c.y + 3.5, 8, T.risoRed, 'mono', false, 0.5);
    }
  }

  /* 自定义区头（dashed 顶线 + 标签/状态行，文案与 Web 完全一致） */
  function customHead(ctx, x, y, w, label, active, S2) {
    U.hline(ctx, x, y, w, 'rgba(26,26,26,0.35)', 1, [5 * S2, 4 * S2]);
    U.tracked(ctx, label, x, y + 20, 10, 'rgba(26,26,26,0.55)', 'mono', false, 2.5);
    U.text(ctx, active ? activeRedText(label) : activeTextFor(label), x + w, y + 20, 9,
      active ? T.risoRed : 'rgba(26,26,26,0.4)', 'mono', false, 'right');
  }
  function activeRedText(label) {
    return label.indexOf('开卷') >= 0 ? '手排规格生效中' : '手调钟点生效中';
  }
  function activeTextFor(label) {
    if (label.indexOf('开卷') >= 0) {
      var p = activeFmtPreset();
      return '正在使用预设「' + (p ? p.label : '经典') + '」，可随时改为手排';
    }
    var App = G.App;
    for (var i = 0; i < 4; i++) {
      if (clkSelected(i)) return '正在使用预设「' + G.Core.TIME_PRESETS[i].label + '」，可改为手调';
    }
    return '正在使用预设，可改为手调';
  }

  function draw(ctx) {
    G.App._ctx = ctx;
    var lo = layout();
    var L = G.Layout;
    var App = G.App;
    var C = G.Core;
    var S = lo.S;
    var meta = CH_META[App.mode] || CH_META.ai;

    U.statusBar(ctx, lo.W, lo.statusY);

    ctx.save();
    ctx.translate(0, -pg.scroll);

    /* 章头（Web header：标题 + 斜体英文同行 + CH 右 + border-b-2 + 引导段） */
    U.text(ctx, meta.title, lo.pad, lo.head.y + 36 * S, 32 * S, T.ink, 'serifX');
    var tW = ctx.measureText(meta.title).width;
    U.text(ctx, meta.en, lo.pad + tW + 16 * S, lo.head.y + 36 * S, 14 * S, 'rgba(26,26,26,0.55)', 'westI');
    U.tracked(ctx, meta.ch, lo.W - lo.pad, lo.head.y + 18 * S, 10 * S, 'rgba(26,26,26,0.5)', 'mono', false, 4 * S, 'right');
    U.hline(ctx, lo.pad, lo.head.y + 50 * S, lo.W - lo.pad * 2, T.ink, 2);
    var leadLines = U.wrap(ctx, meta.lead, lo.cw, 13 * S, 'serif');
    for (var li = 0; li < leadLines.length; li++) {
      U.text(ctx, leadLines[li], lo.pad, lo.head.y + 72 * S + li * 20 * S, 13 * S, 'rgba(26,26,26,0.7)', 'serif');
    }

    /* —— 版式规格面板 —— */
    panel(ctx, lo.fmt, '版式规格 FORMAT SPEC', fmtSummary());
    for (var i = 0; i < lo.fmtCards.length; i++) {
      var fc = lo.fmtCards[i];
      var p = fc.preset;
      var sel = fmtSelected(i);
      presetCard(ctx, fc, {
        label: p.label, en: p.en,
        spec: p.size + '×' + p.size + ' · ' + p.wallsPerPlayer + ' 板',
        accent: i % 2 === 0 ? T.qa : T.qb,
        sub: p.sub, selected: sel,
        badge: p.recommended ? '推荐' : null,
      }, S);
    }
    /* 自定义区 */
    customHead(ctx, lo.fmt.x + 16 * S, lo.fmtCustomY, lo.cw - 32 * S, '自定义开卷 CUSTOM', customActive('fmt'), S);
    U.text(ctx, '棋盘尺寸', lo.fmt.x + 16 * S, lo.sizeSeg.y + 20 * S, 10 * S, 'rgba(26,26,26,0.55)', 'mono');
    lo.sizeSeg.value = SIZES.indexOf(App.customSize) < 0 ? 2 : SIZES.indexOf(App.customSize);
    U.pillRow(ctx, lo.sizeSeg, pressed.sizeSeg);
    U.text(ctx, '挡板数', lo.fmt.x + 16 * S, lo.wallsLabelY, 10 * S, 'rgba(26,26,26,0.55)', 'mono');
    U.slider(ctx, lo.wallsSlider, App.customWalls, 0, 20, dragSlider === 'walls');
    U.text(ctx, App.customWalls + ' 根', lo.wallsValX, lo.wallsLabelY + 12 * S, 14 * S, T.ink, 'mono', true, 'right');
    var recW = C.recommendedWalls(App.customSize, App.mode === 'quad' ? 4 : 2);
    var noteFmt = '尺寸 5..13 路（奇数）' + (App.mode === 'quad' ? ' · 四人围坐推荐值减半' : '') + ' · 改尺寸自动套用推荐值 · 该尺寸推荐 ' + recW + ' 根' + (App.customWalls === 0 ? ' · 零板纯走子局' : '');
    var noteFmtLines = U.wrap(ctx, noteFmt, lo.cw - 32 * S - (App.customWalls !== recW ? 96 * S : 0), 9 * S, 'mono');
    for (var nf = 0; nf < noteFmtLines.length && nf < 2; nf++) {
      U.text(ctx, noteFmtLines[nf], lo.fmt.x + 16 * S, lo.fmtNoteY + 10 * S + nf * 14 * S, 9 * S, 'rgba(26,26,26,0.45)', 'mono');
    }
    if (App.customWalls !== recW) U.button(ctx, lo.fmtRecBtn, pressed.fmtRec);

    /* —— 棋钟规格面板 —— */
    panel(ctx, lo.clk, '棋钟规格 CLOCK SPEC', clkSummary());
    for (var k2 = 0; k2 < lo.clkCards.length; k2++) {
      var cc = lo.clkCards[k2];
      var tp = cc.preset;
      var csel = clkSelected(k2);
      presetCard(ctx, cc, {
        label: tp.label, en: tp.en,
        spec: tp.totalSec === 0 ? '不限时' : ('总 ' + (tp.totalSec / 60) + ' 分' + (tp.perMoveSec > 0 ? ' · 步 ' + (tp.perMoveSec < 60 ? tp.perMoveSec + ' 秒' : (tp.perMoveSec / 60) + ' 分') : '')),
        accent: k2 % 2 === 0 ? T.qa : T.qb,
        sub: tp.sub, selected: csel,
        badge: tp.recommended ? '默认' : null,
      }, S);
    }
    customHead(ctx, lo.clk.x + 16 * S, lo.clkCustomY, lo.cw - 32 * S, '自定钟点 CUSTOM', customActive('clk'), S);
    U.text(ctx, '总时长', lo.clk.x + 16 * S, lo.totalSeg.y + 20 * S, 10 * S, 'rgba(26,26,26,0.55)', 'mono');
    lo.totalSeg.value = nearestIdx(TOTALS, App.customTotal);
    U.pillRow(ctx, lo.totalSeg, pressed.totalSeg);
    U.text(ctx, '单步时限', lo.clk.x + 16 * S, lo.perSegLabelY, 10 * S, 'rgba(26,26,26,0.55)', 'mono');
    lo.perSeg.value = nearestIdx(PERMOVES, App.customPerMove);
    U.pillRow(ctx, lo.perSeg, pressed.perSeg);
    var noteClk = '总时长耗尽或单步超时即判负 · 不限时则沿用本手用时记录';
    U.text(ctx, noteClk, lo.clk.x + 16 * S, lo.clkNoteY + 10 * S, 9 * S, 'rgba(26,26,26,0.45)', 'mono');

    /* —— 单人：先后手 + 对手 —— */
    if (App.mode === 'ai') {
      U.tracked(ctx, '执子先后手 CHOOSE YOUR INK', lo.pad, lo.inkLabelY, 10 * S, 'rgba(26,26,26,0.5)', 'mono', false, 3 * S);
      for (var ic = 0; ic < lo.inkCards.length; ic++) {
        var ik = lo.inkCards[ic];
        var first = ik.first;
        var selInk = App.humanFirst === first;
        var color = first ? T.qa : T.qb;
        /* 选中：border-ink + 4px 主色硬阴影；未选 border-ink/30 */
        if (selInk) {
          ctx.fillStyle = color;
          ctx.fillRect(ik.x + 4, ik.y + 4, ik.w, ik.h);
        }
        ctx.fillStyle = T.paper;
        ctx.fillRect(ik.x, ik.y, ik.w, ik.h);
        ctx.strokeStyle = selInk ? T.ink : 'rgba(26,26,26,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(ik.x, ik.y, ik.w, ik.h);
        /* 勾选方块 32px（选中填色 + 纸色内点，Web checkbox 1:1） */
        var bx = ik.x + 20 * S, by = ik.y + 24 * S, bs = 32 * S;
        if (selInk) {
          ctx.fillStyle = color;
          ctx.fillRect(bx, by, bs, bs);
          ctx.fillStyle = T.paper;
          ctx.fillRect(bx + bs / 2 - 5 * S, by + bs / 2 - 5 * S, 10 * S, 10 * S);
        } else {
          ctx.strokeStyle = color; ctx.lineWidth = 2;
          ctx.strokeRect(bx, by, bs, bs);
        }
        U.text(ctx, first ? '先手 · 执甲' : '后手 · 执乙', ik.x + 66 * S, ik.y + 34 * S, 18 * S, T.ink, 'serifX');
        U.tracked(ctx, first ? 'RED · FIRST' : 'BLUE · SECOND', ik.x + ik.w - 20 * S, ik.y + 32 * S, 9 * S, 'rgba(26,26,26,0.45)', 'mono', false, 2.2 * S, 'right');
        U.text(ctx, first ? '荧光红铅字，自底边出发，先落第一子。' : '钴蓝铅字，自顶边俯冲，后发制人。',
          ik.x + 66 * S, ik.y + 56 * S, 12 * S, 'rgba(26,26,26,0.65)', 'serif');
      }

      /* 对手职位（Web：点卡即开局；标签行 + 当前开本行，不溢出） */
      U.tracked(ctx, '对手职位 DESK POSITIONS', lo.pad, lo.oppsLabelY, 10 * S, 'rgba(26,26,26,0.5)', 'mono', false, 3 * S);
      U.text(ctx, '当前开本 ' + configSummary(), lo.pad, lo.oppsLabelY + 15 * S, 9 * S, 'rgba(26,26,26,0.4)', 'mono');
      for (var oi = 0; oi < lo.opps.length; oi++) {
        var op = lo.opps[oi];
        var accent = oi === 0 ? T.qa : (oi === 1 ? T.qb : T.ink);
        /* border-2 + 6px 墨色硬阴影 */
        ctx.fillStyle = T.ink;
        ctx.fillRect(op.x + 6, op.y + 6, op.w, op.h);
        ctx.fillStyle = T.paper;
        ctx.fillRect(op.x, op.y, op.w, op.h);
        ctx.strokeStyle = T.ink; ctx.lineWidth = 2;
        ctx.strokeRect(op.x, op.y, op.w, op.h);
        var pad24 = 24 * S;
        /* 图标方块（左上 44px，accent 色线稿） */
        var ibx = op.x + pad24, iby = op.y + pad24, ibs = 44 * S;
        ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5;
        ctx.strokeRect(ibx, iby, ibs, ibs);
        drawOppIcon(ctx, ibx + ibs / 2, iby + ibs / 2, 22 * S, op.lv, accent);
        /* 职位英文（右上） */
        U.tracked(ctx, op.title, op.x + op.w - pad24, op.y + pad24 + 14 * S, 9 * S, 'rgba(26,26,26,0.45)', 'mono', false, 2.7 * S, 'right');
        /* 名字 */
        U.text(ctx, op.name, op.x + pad24, op.y + pad24 + 44 * S + 34 * S, 28 * S, T.ink, 'serifX');
        /* 简介 */
        var briefLines = U.wrap(ctx, op.brief, op.w - pad24 * 2, 13.5 * S, 'serif');
        for (var bl = 0; bl < briefLines.length && bl < 4; bl++) {
          U.text(ctx, briefLines[bl], op.x + pad24, op.y + pad24 + 44 * S + 58 * S + bl * 20 * S, 13.5 * S, 'rgba(26,26,26,0.7)', 'serif');
        }
        /* 底行：棋力竖条 + 注 + 对弈 →（border-t） */
        var powY = op.y + op.h - 24 * S - 14 * S;
        U.hline(ctx, op.x + pad24, powY - 14 * S, op.w - pad24 * 2, 'rgba(26,26,26,0.25)', 1);
        var pw2 = U.powerGrid(ctx, op.x + pad24, powY, op.power, 4, accent, S);
        U.text(ctx, op.powerTxt, op.x + pad24 + pw2 + 10 * S, powY + 11 * S, 9 * S, 'rgba(26,26,26,0.5)', 'mono');
        U.text(ctx, '对弈 →', op.x + op.w - pad24, powY + 11 * S, 10 * S, 'rgba(26,26,26,0.45)', 'mono', false, 'right');
      }
    }

    /* —— 四人：席位配置面板 —— */
    if (App.mode === 'quad') {
      panel(ctx, lo.seats, '席位配置 SEATS · 顺时针', '甲→丙→乙→丁');
      for (var sc2 = 0; sc2 < lo.seatCards.length; sc2++) {
        var st = lo.seatCards[sc2];
        var human = App.seats[st.p];
        ctx.fillStyle = T.paper;
        ctx.fillRect(st.x, st.y, st.w, st.h);
        ctx.strokeStyle = 'rgba(26,26,26,0.35)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(st.x, st.y, st.w, st.h);
        ctx.fillStyle = T.playerColor(st.p);
        ctx.fillRect(st.x, st.y, 4 * S, st.h);
        U.text(ctx, st.name, st.x + 16 * S, st.y + 26 * S, 14 * S, T.ink, 'serifB');
        U.text(ctx, '归途 · ' + goalText(st.p), st.x + 16 * S, st.y + 44 * S, 9.5 * S, 'rgba(26,26,26,0.5)', 'mono');
        var tag = human ? '真人执子' : '编辑部 AI';
        var tagW = 84 * S;
        var tb = seatBtnRect(st, S);
        tb.label = tag; tb.track = true; tb.fontSize = 10 * S; tb.selected = !human;
        U.button(ctx, tb, pressed['seat' + st.p]);
      }
      U.text(ctx, 'AI 档位', lo.seats.x + 16 * S, lo.quadLvLabelY, 10 * S, 'rgba(26,26,26,0.55)', 'mono');
      lo.quadLvSeg.value = App.quadAiLevel - 1;
      U.pillRow(ctx, lo.quadLvSeg, pressed.quadLv);
    }

    /* —— 页脚 —— */
    U.ghostButton(ctx, lo.backBtn, pressed.back);
    if (lo.startBtn) {
      lo.startBtn.label = startLabel();
      U.button(ctx, lo.startBtn, pressed.start);
    }
    for (var nl = 0; nl < lo.noteLines.length; nl++) {
      U.text(ctx, lo.noteLines[nl], lo.pad, lo.noteY + 14 * S + nl * 15 * S, 10 * S, 'rgba(26,26,26,0.4)', 'mono');
    }

    ctx.restore();
    Page.indicator(ctx, pg);
    U.folio(ctx, meta.folio);
  }

  /* 席位切换钮命中区（确定性几何，draw 与 press 共用） */
  function seatBtnRect(st, s) {
    var tagW = 84 * s;
    return { x: st.x + st.w - tagW - 12 * s, y: st.y + 14 * s, w: tagW, h: 30 * s };
  }

  function goalText(p) {
    return { A: '顶行', B: '底行', C: '右列', D: '左列' }[p] || '';
  }
  function configSummary() {
    var App = G.App;
    var fmt = App.format();
    var seat = App.mode === 'quad' ? '四人' : '二人';
    return fmt.size + '×' + fmt.size + ' · 每方 ' + fmt.wallsPerPlayer + ' 板 · ' + seat + '局 · ' + clkSummary();
  }
  function fmtSummary() {
    var App = G.App;
    var fmt = App.format();
    var seat = App.mode === 'quad' ? '四人' : '二人';
    return fmt.size + '×' + fmt.size + ' · 每方 ' + fmt.wallsPerPlayer + ' 板 · ' + seat + '局';
  }
  function clkSummary() {
    var tc = G.App.timeControl();
    if (tc.totalSec <= 0 && tc.perMoveSec <= 0) return '不限时';
    var s = '';
    if (tc.totalSec) s += '总 ' + (tc.totalSec >= 60 ? Math.round(tc.totalSec / 60) + ' 分' : tc.totalSec + ' 秒');
    if (tc.perMoveSec) s += (s ? ' · ' : '') + '每步 ' + (tc.perMoveSec >= 60 ? Math.round(tc.perMoveSec / 60) + ' 秒' : tc.perMoveSec + ' 秒');
    return s;
  }
  function nearestIdx(arr, v) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < arr.length; i++) {
      var d = Math.abs(arr[i] - v);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* 四职位线稿图标（笔 / 剪刀 / 王冠 / 柱式，accent 描线） */
  function drawOppIcon(ctx, cx, cy, r, lv, accent) {
    ctx.strokeStyle = accent; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var k = r / 22;
    ctx.beginPath();
    if (lv === 1) { /* 笔：斜杆 + 笔尖 */
      ctx.moveTo(cx - 9 * k, cy + 9 * k);
      ctx.lineTo(cx + 6 * k, cy - 6 * k);
      ctx.moveTo(cx + 6 * k, cy - 6 * k);
      ctx.lineTo(cx + 10 * k, cy - 10 * k);
      ctx.moveTo(cx - 9 * k, cy + 9 * k);
      ctx.lineTo(cx - 5 * k, cy + 5 * k);
      ctx.moveTo(cx - 11 * k, cy + 3 * k);
      ctx.lineTo(cx - 3 * k, cy + 11 * k);
    } else if (lv === 2) { /* 剪刀：双环 + 交叉 */
      ctx.moveTo(cx - 8 * k, cy - 8 * k); ctx.lineTo(cx + 8 * k, cy + 8 * k);
      ctx.moveTo(cx + 8 * k, cy - 8 * k); ctx.lineTo(cx - 8 * k, cy + 8 * k);
      ctx.moveTo(cx - 8 * k, cy + 11 * k);
      ctx.arc(cx - 8 * k, cy + 8 * k, 3 * k, 0, Math.PI * 2);
      ctx.moveTo(cx + 11 * k, cy + 11 * k);
      ctx.arc(cx + 8 * k, cy + 8 * k, 3 * k, 0, Math.PI * 2);
    } else if (lv === 3) { /* 王冠 */
      ctx.moveTo(cx - 10 * k, cy + 8 * k); ctx.lineTo(cx - 10 * k, cy - 5 * k); ctx.lineTo(cx - 4 * k, cy + 1 * k);
      ctx.lineTo(cx, cy - 9 * k); ctx.lineTo(cx + 4 * k, cy + 1 * k);
      ctx.lineTo(cx + 10 * k, cy - 5 * k); ctx.lineTo(cx + 10 * k, cy + 8 * k);
      ctx.closePath();
    } else { /* 柱式 */
      ctx.moveTo(cx - 10 * k, cy - 9 * k); ctx.lineTo(cx + 10 * k, cy - 9 * k);
      ctx.moveTo(cx - 7 * k, cy - 5 * k); ctx.lineTo(cx + 7 * k, cy - 5 * k);
      ctx.moveTo(cx - 7 * k, cy + 5 * k); ctx.lineTo(cx + 7 * k, cy + 5 * k);
      ctx.moveTo(cx - 10 * k, cy + 9 * k); ctx.lineTo(cx + 10 * k, cy + 9 * k);
      ctx.moveTo(cx - 5 * k, cy - 5 * k); ctx.lineTo(cx - 5 * k, cy + 5 * k);
      ctx.moveTo(cx, cy - 5 * k); ctx.lineTo(cx, cy + 5 * k);
      ctx.moveTo(cx + 5 * k, cy - 5 * k); ctx.lineTo(cx + 5 * k, cy + 5 * k);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function press(x, y) {
    pressed = {};
    pg.press(x, y);
    var lo = layout();
    var cy = pg.cy(y);
    var i;
    for (i = 0; i < lo.fmtCards.length; i++) if (U.inRect(lo.fmtCards[i], x, cy)) pressed.fmtCard = i;
    for (i = 0; i < lo.clkCards.length; i++) if (U.inRect(lo.clkCards[i], x, cy)) pressed.clkCard = i;
    i = U.pillHit(lo.sizeSeg, x, cy); if (i >= 0) pressed.sizeSeg = i;
    i = U.pillHit(lo.totalSeg, x, cy); if (i >= 0) pressed.totalSeg = i;
    i = U.pillHit(lo.perSeg, x, cy); if (i >= 0) pressed.perSeg = i;
    if (U.inRect(lo.wallsSlider, x, cy)) dragSlider = 'walls';
    if (G.App.customWalls !== G.Core.recommendedWalls(G.App.customSize, G.App.mode === 'quad' ? 4 : 2)) {
      if (U.inRect(lo.fmtRecBtn, x, cy)) pressed.fmtRec = true;
    }
    if (G.App.mode === 'ai') {
      for (i = 0; i < lo.inkCards.length; i++) if (U.inRect(lo.inkCards[i], x, cy)) pressed['ink' + i] = true;
      for (i = 0; i < lo.opps.length; i++) if (U.inRect(lo.opps[i], x, cy)) pressed['opp' + i] = true;
    }
    if (G.App.mode === 'quad') {
      var sQ = lo.S;
      for (i = 0; i < lo.seatCards.length; i++) {
        var st2 = lo.seatCards[i];
        var sb = seatBtnRect(st2, sQ);
        if (U.inRect(sb, x, cy)) pressed['seat' + st2.p] = true;
      }
      i = U.pillHit(lo.quadLvSeg, x, cy); if (i >= 0) pressed.quadLv = i;
    }
    if (lo.startBtn && U.inRect(lo.startBtn, x, cy)) pressed.start = true;
    if (U.inRect(lo._backRect, x, cy)) pressed.back = true;
  }

  function drag(x, y) {
    pg.drag(x, y);
    if (dragSlider === 'walls') {
      var lo = layout();
      var v = Math.round(U.sliderValue(lo.wallsSlider, x, 0, 20));
      G.App.customWalls = v;
      G.App.requestRedraw();
    }
  }

  function release(x, y) {
    var kind = pg.release(x, y);
    dragSlider = null;
    if (kind !== 'tap') { pressed = {}; return; }
    var lo = layout();
    var App = G.App;
    var C = G.Core;
    var cy = pg.cy(y);
    var i;

    if (pressed.fmtCard != null && U.inRect(lo.fmtCards[pressed.fmtCard], x, cy)) {
      App.fmtIdx = pressed.fmtCard;
      var p = (App.mode === 'quad' ? C.FORMAT_PRESETS_4P : C.FORMAT_PRESETS)[App.fmtIdx];
      App.customSize = p.size; App.customWalls = p.wallsPerPlayer;
      App.savePrefs();
      App.sfx('pawn-click'); pressed = {}; return;
    }
    if (pressed.clkCard != null && U.inRect(lo.clkCards[pressed.clkCard], x, cy)) {
      App.clkIdx = pressed.clkCard;
      App.savePrefs();
      App.sfx('pawn-click'); pressed = {}; return;
    }
    i = U.pillHit(lo.sizeSeg, x, cy);
    if (pressed.sizeSeg != null && i >= 0) {
      App.fmtIdx = 4;
      App.customSize = SIZES[i];
      App.customWalls = C.recommendedWalls(App.customSize, App.mode === 'quad' ? 4 : 2);
      App.sfx('pawn-click'); pressed = {}; return;
    }
    i = U.pillHit(lo.totalSeg, x, cy);
    if (pressed.totalSeg != null && i >= 0) {
      App.clkIdx = 4; App.customTotal = TOTALS[i];
      App.sfx('pawn-click'); pressed = {}; return;
    }
    i = U.pillHit(lo.perSeg, x, cy);
    if (pressed.perSeg != null && i >= 0) {
      App.clkIdx = 4; App.customPerMove = PERMOVES[i];
      App.sfx('pawn-click'); pressed = {}; return;
    }
    if (pressed.fmtRec && U.inRect(lo.fmtRecBtn, x, cy)) {
      App.customWalls = C.recommendedWalls(App.customSize, App.mode === 'quad' ? 4 : 2);
      App.sfx('pawn-click'); pressed = {}; return;
    }
    if (App.mode === 'ai') {
      if (pressed.ink0 && U.inRect(lo.inkCards[0], x, cy)) { App.humanFirst = true; App.sfx('pawn-click'); pressed = {}; return; }
      if (pressed.ink1 && U.inRect(lo.inkCards[1], x, cy)) { App.humanFirst = false; App.sfx('pawn-click'); pressed = {}; return; }
      for (i = 0; i < lo.opps.length; i++) {
        if (pressed['opp' + i] && U.inRect(lo.opps[i], x, cy)) {
          App.aiLevel = lo.opps[i].lv;
          App.savePrefs();
          App.sfx('pawn-click');
          App.startGame(false);
          pressed = {}; return;
        }
      }
    }
    if (App.mode === 'quad') {
      var sQ2 = lo.S;
      for (i = 0; i < lo.seatCards.length; i++) {
        var st3 = lo.seatCards[i];
        var sb2 = seatBtnRect(st3, sQ2);
        if (pressed['seat' + st3.p] && U.inRect(sb2, x, cy)) {
          App.seats[st3.p] = !App.seats[st3.p];
          App.sfx('pawn-click'); pressed = {}; return;
        }
      }
      i = U.pillHit(lo.quadLvSeg, x, cy);
      if (pressed.quadLv != null && i >= 0) { App.quadAiLevel = i + 1; App.sfx('pawn-click'); pressed = {}; return; }
    }
    if (pressed.start && lo.startBtn && U.inRect(lo.startBtn, x, cy)) {
      App.sfx('pawn-click');
      App.startGame(false);
      pressed = {}; return;
    }
    if (pressed.back && U.inRect(lo._backRect, x, cy)) {
      App.sfx('pawn-click');
      App.gotoScene('toc');
      pressed = {}; return;
    }
    pressed = {};
  }

  G.Scenes = G.Scenes || {};
  G.Scenes.setup = { enter: enter, draw: draw, press: press, drag: drag, release: release };
})();

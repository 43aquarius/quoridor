/* 步步为营 — 章节设置场景（单人 CH.01 / 双人 CH.02 / 四人 CH.03）
 * 版式规格卡（预设 2×2 + 自定义）/ 棋钟规格卡 / 执子先后手（单人）/
 * 席位配置（四人）/ 对手职位（单人）/ 开局按钮。竖屏滚动页。
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
    ai: { title: '单人对弈', en: 'against the desk', ch: 'CH.01',
      lead: '编辑部开放四个职位与你对坐。先择一版开本与棋钟、选定执子先后手，再选一位对手，翻开对局页。' },
    local: { title: '双人同屏', en: 'two readers, one board', ch: 'CH.02',
      lead: '一册棋盘，两副活字。先择开本与棋钟，再翻开局；悔棋在双人局撤回一手，收笔后自动入档。' },
    quad: { title: '四人围坐', en: 'four seats, one table', ch: 'CH.03',
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
    y += 78 * S;

    /* 版式规格卡 */
    lo.fmt = { x: pad, y: y, w: cw, h: 0 };
    y += 14 * S;
    /* 2×2 小卡 */
    var gap = 10 * S;
    var cardW = (cw - 24 * S - gap) / 2;
    var cardH = 106 * S;
    lo.fmtCards = [];
    var presets = App.mode === 'quad' ? C.FORMAT_PRESETS_4P : C.FORMAT_PRESETS;
    for (var i = 0; i < 4; i++) {
      var col = i % 2, row = Math.floor(i / 2);
      lo.fmtCards.push({
        x: lo.fmt.x + 12 * S + col * (cardW + gap),
        y: lo.fmt.y + 42 * S + row * (cardH + gap),
        w: cardW, h: cardH, i: i, preset: presets[i],
      });
    }
    y = lo.fmt.y + 42 * S + cardH * 2 + gap + 12 * S;
    /* 自定义区 */
    lo.fmtCustomY = y;
    lo.sizeSeg = { x: lo.fmt.x + 12 * S, y: y + 22 * S, w: cw - 24 * S, h: 30 * S,
      items: SIZES.map(function (n) { return n + ' 路'; }), fontSize: 11.5 * S };
    lo.wallsLabelY = lo.sizeSeg.y + lo.sizeSeg.h + 22 * S;
    lo.wallsSlider = { x: lo.fmt.x + 12 * S, y: lo.wallsLabelY + 6 * S, w: cw - 24 * S - 64 * S, h: 26 * S };
    y = lo.wallsSlider.y + 34 * S;
    lo.fmt.h = y - lo.fmt.y + 14 * S;
    y = lo.fmt.y + lo.fmt.h + 26 * S;

    /* 棋钟规格卡 */
    lo.clk = { x: pad, y: y, w: cw, h: 0 };
    y += 14 * S;
    lo.clkCards = [];
    for (var k = 0; k < 4; k++) {
      var col2 = k % 2, row2 = Math.floor(k / 2);
      lo.clkCards.push({
        x: lo.clk.x + 12 * S + col2 * (cardW + gap),
        y: lo.clk.y + 42 * S + row2 * (cardH + gap),
        w: cardW, h: cardH, i: k, preset: C.TIME_PRESETS[k],
      });
    }
    y = lo.clk.y + 42 * S + cardH * 2 + gap + 12 * S;
    lo.clkCustomY = y;
    lo.totalSeg = { x: lo.clk.x + 12 * S, y: y + 22 * S, w: cw - 24 * S, h: 30 * S, items: TOTAL_LABELS, fontSize: 10.5 * S };
    lo.perSeg = { x: lo.clk.x + 12 * S, y: lo.totalSeg.y + lo.totalSeg.h + 12 * S, w: cw - 24 * S, h: 30 * S, items: PERMOVE_LABELS, fontSize: 10.5 * S };
    y = lo.perSeg.y + lo.perSeg.h + 10 * S;
    lo.clk.h = y - lo.clk.y + 14 * S;
    y = lo.clk.y + lo.clk.h + 26 * S;

    if (App.mode === 'ai') {
      /* 执子先后手 */
      lo.inkLabelY = y;
      lo.inkCards = [];
      lo.inkCards.push({ x: pad, y: y + 10 * S, w: cw, h: 64 * S, first: true });
      lo.inkCards.push({ x: pad, y: y + 10 * S + 64 * S + 12 * S, w: cw, h: 64 * S, first: false });
      y = lo.inkCards[1].y + 64 * S + 30 * S;

      /* 对手职位 */
      lo.oppsLabelY = y;
      lo.opps = [];
      var aiProfiles = C.AI_PROFILES;
      var powerTxt = ['', '棋力 · 入门', '棋力 · 进阶', '棋力 · 高段', '棋力 · 终审'];
      for (var lv = 1; lv <= 4; lv++) {
        var prof = aiProfiles[lv];
        lo.opps.push({ x: pad, y: y + 10 * S + (lv - 1) * (150 * S + 14 * S), w: cw, h: 150 * S,
          lv: lv, name: prof.name, title: prof.title, brief: prof.brief, power: lv, powerTxt: powerTxt[lv] });
      }
      y = lo.opps[3].y + 150 * S + 26 * S;
    } else if (App.mode === 'quad') {
      /* 席位配置 */
      lo.seatsLabelY = y;
      lo.seatCards = [];
      var order = ['A', 'C', 'B', 'D'];
      var seatName = { A: '甲 · 南席', C: '丙 · 西席', B: '乙 · 北席', D: '丁 · 东席' };
      for (var si = 0; si < 4; si++) {
        var pl = order[si];
        lo.seatCards.push({ x: pad, y: y + 10 * S + si * (58 * S + 10 * S), w: cw, h: 58 * S, p: pl, name: seatName[pl] });
      }
      y = lo.seatCards[3].y + 58 * S + 16 * S;
      /* 四人 AI 档位 */
      lo.quadLvSeg = { x: pad, y: y, w: cw, h: 34 * S, items: ['学徒', '排字师', '总编', '社长'], fontSize: 12 * S };
      y += 34 * S + 18 * S;
    }

    /* 开局按钮 */
    lo.startBtn = { x: pad, y: y, w: cw, h: 48 * S, label: '开 局', solidColor: T.ink, fontSize: 15 * S, track: true };
    y += 48 * S + 18 * S;

    lo.noteY = y;
    lo.noteLines = U.wrap(wrapCtx(), noteText(), cw - 8 * S, 10 * S, 'mono');
    y += lo.noteLines.length * 15 * S + 14 * S;

    lo.backBtn = { x: pad, y: y, w: 110 * S, h: 34 * S, label: '← 返回目录', fontSize: 11.5 * S, track: true };
    y += 34 * S + 30 * S;

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
    return App.fmtIdx === i;
  }
  function clkSelected(i) {
    var App = G.App;
    if (App.clkIdx === 4) return false;
    return App.clkIdx === i;
  }
  function customActive(kind) {
    return kind === 'fmt' ? G.App.fmtIdx === 4 : G.App.clkIdx === 4;
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

    /* 章头 */
    U.text(ctx, meta.title, lo.pad, lo.head.y + 34 * S, 32 * S, T.ink, 'serifX', true);
    U.text(ctx, meta.en, lo.W - lo.pad - 44 * S, lo.head.y + 30 * S, 14 * S, 'rgba(26,26,26,0.55)', 'westI', false, 'right');
    U.tracked(ctx, meta.ch, lo.W - lo.pad, lo.head.y + 12 * S, 10 * S, 'rgba(26,26,26,0.5)', 'mono', false, 2 * S, 'right');
    U.hline(ctx, lo.pad, lo.head.y + 48 * S, lo.W - lo.pad * 2, 'rgba(26,26,26,0.25)', 1);
    var leadLines = U.wrap(ctx, meta.lead, lo.cw, 13 * S, 'serif');
    for (var li = 0; li < leadLines.length; li++) {
      U.text(ctx, leadLines[li], lo.pad, lo.head.y + 68 * S + li * 19 * S, 13 * S, 'rgba(26,26,26,0.65)', 'serif');
    }

    /* —— 版式规格卡 —— */
    drawSpecCard(ctx, lo.fmt, '版式规格 FORMAT SPEC', fmtSummary(), pressed.fmtCard);

    /* 小卡 */
    for (var i = 0; i < lo.fmtCards.length; i++) {
      var fc = lo.fmtCards[i];
      var p = fc.preset;
      var sel = fmtSelected(i);
      var specColor = sel ? T.qa : (i % 2 === 1 ? T.qb : T.qa);
      U.specCard(ctx, fc, {
        label: p.label, en: p.en,
        spec: p.size + '×' + p.size + ' · ' + p.wallsPerPlayer + ' 板',
        specColor: sel ? T.risoRed : specColor,
        desc: U.wrap(ctx, p.sub, fc.w - 24 * S, 10.5 * S, 'serif').slice(0, 3),
        selected: sel, badge: sel ? '✓ 推荐' : (p.recommended ? '✓ 推荐' : null),
      });
    }
    /* 自定义区 */
    drawCustomHead(ctx, lo.fmt.x + 12 * S, lo.fmtCustomY, lo.cw - 24 * S,
      '自定义开卷 CUSTOM', customActive('fmt') ? '手排规格生效中' : '预设规格生效中');
    U.text(ctx, '棋盘尺寸（路数）', lo.fmt.x + 12 * S, lo.fmtCustomY + 14 * S, 10.5 * S, 'rgba(26,26,26,0.6)', 'serif');
    lo.sizeSeg.value = SIZES.indexOf(App.customSize) < 0 ? 2 : SIZES.indexOf(App.customSize);
    if (customActive('fmt')) lo.sizeSeg.value = SIZES.indexOf(App.customSize);
    U.pillRow(ctx, lo.sizeSeg, pressed.sizeSeg);
    U.text(ctx, '每方挡板数', lo.fmt.x + 12 * S, lo.wallsLabelY, 10.5 * S, 'rgba(26,26,26,0.6)', 'serif');
    U.text(ctx, App.customWalls + ' 根', lo.fmt.x + lo.cw - 12 * S, lo.wallsLabelY + 12 * S, 15 * S, T.ink, 'serifB', true, 'right');
    U.slider(ctx, lo.wallsSlider, App.customWalls, 0, 20, dragSlider === 'walls');
    U.hline(ctx, lo.fmt.x + 12 * S, lo.fmt.y + lo.fmt.h - 22 * S, lo.cw - 24 * S, 'rgba(26,26,26,0.2)', 1, [4, 4]);
    U.text(ctx, '尺寸 5..13 路（奇数）· 改尺寸自动套用推荐值 · 该尺寸推荐 ' + C.recommendedWalls(App.customSize, App.mode === 'quad' ? 4 : 2) + ' 根',
      lo.fmt.x + 12 * S, lo.fmt.y + lo.fmt.h - 8 * S, 9.5 * S, 'rgba(26,26,26,0.5)', 'mono');

    /* —— 棋钟规格卡 —— */
    drawSpecCard(ctx, lo.clk, '棋钟规格 CLOCK SPEC', clkSummary(), pressed.clkCard);
    for (var k = 0; k < lo.clkCards.length; k++) {
      var cc = lo.clkCards[k];
      var tp = cc.preset;
      var csel = clkSelected(k);
      U.specCard(ctx, cc, {
        label: tp.label, en: tp.en,
        spec: tp.totalSec === 0 ? '不限时' : '总 ' + (tp.totalSec / 60) + ' 分 · 步 ' + (tp.perMoveSec < 60 ? tp.perMoveSec + ' 秒' : (tp.perMoveSec / 60) + ' 分'),
        specColor: csel ? T.risoRed : (k % 2 === 1 ? T.qb : T.qa),
        desc: U.wrap(ctx, tp.sub, cc.w - 24 * S, 10.5 * S, 'serif').slice(0, 3),
        selected: csel, badge: csel ? '✓ 默认' : (tp.recommended ? '✓ 默认' : null),
      });
    }
    drawCustomHead(ctx, lo.clk.x + 12 * S, lo.clkCustomY, lo.cw - 24 * S,
      '自定钟点 CUSTOM', customActive('clk') ? '手调钟点生效中' : '预设钟点生效中');
    U.text(ctx, '总时长（每方）', lo.clk.x + 12 * S, lo.clkCustomY + 14 * S, 10.5 * S, 'rgba(26,26,26,0.6)', 'serif');
    lo.totalSeg.value = nearestIdx(TOTALS, App.customTotal);
    U.pillRow(ctx, lo.totalSeg, pressed.totalSeg);
    U.text(ctx, '单步时限', lo.clk.x + 12 * S, lo.totalSeg.y + lo.totalSeg.h + 12 * S, 10.5 * S, 'rgba(26,26,26,0.6)', 'serif');
    lo.perSeg.value = nearestIdx(PERMOVES, App.customPerMove);
    U.pillRow(ctx, lo.perSeg, pressed.perSeg);
    U.hline(ctx, lo.clk.x + 12 * S, lo.clk.y + lo.clk.h - 22 * S, lo.cw - 24 * S, 'rgba(26,26,26,0.2)', 1, [4, 4]);
    U.text(ctx, '总时长耗尽或单步超时即判负 · 不限时则沿用本手用时记录',
      lo.clk.x + 12 * S, lo.clk.y + lo.clk.h - 8 * S, 9.5 * S, 'rgba(26,26,26,0.5)', 'mono');

    /* —— 单人：先后手 + 对手 —— */
    if (App.mode === 'ai') {
      U.tracked(ctx, '执子先后手 CHOOSE YOUR INK', lo.pad, lo.inkLabelY, 10 * S, T.light, 'mono', false, 1.5 * S);
      for (var ic = 0; ic < lo.inkCards.length; ic++) {
        var ik = lo.inkCards[ic];
        var first = ik.first;
        var selInk = App.humanFirst === first;
        U.card(ctx, ik, { selected: selInk, accent: first ? T.qa : T.qb, shadow: false, lw: 1.5 });
        /* 印章方块 */
        var bx = ik.x + 14 * S, by = ik.y + 14 * S, bs = 34 * S;
        if (first) {
          ctx.fillStyle = T.qa; ctx.fillRect(bx, by, bs, bs);
          ctx.fillStyle = T.paper; ctx.fillRect(bx + bs / 2 - 3, by + bs / 2 - 3, 6, 6);
        } else {
          ctx.strokeStyle = T.qb; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bs, bs);
        }
        U.text(ctx, first ? '先手 · 执甲' : '后手 · 执乙', ik.x + 60 * S, ik.y + 26 * S, 16 * S, T.ink, 'serifB', true);
        U.tracked(ctx, first ? 'RED · FIRST' : 'BLUE · SECOND', ik.x + ik.w - 12 * S, ik.y + 24 * S, 8.5 * S, T.light, 'mono', false, 1.2 * S, 'right');
        U.text(ctx, first ? '荧光红铅字，自底边出发，先落第一子。' : '钴蓝铅字，自顶边俯冲，后发制人。',
          ik.x + 60 * S, ik.y + 46 * S, 11.5 * S, 'rgba(26,26,26,0.6)', 'serif');
      }

      /* 对手职位 */
      var fmtNow = App.format();
      U.tracked(ctx, '对手职位 DESK POSITIONS', lo.pad, lo.oppsLabelY, 10 * S, T.light, 'mono', false, 1.5 * S);
      U.text(ctx, '当前开本 ' + fmtNow.size + '×' + fmtNow.size + ' · 每方 ' + fmtNow.wallsPerPlayer + ' 板',
        lo.W - lo.pad, lo.oppsLabelY, 9.5 * S, 'rgba(26,26,26,0.5)', 'mono', false, 'right');
      for (var oi = 0; oi < lo.opps.length; oi++) {
        var op = lo.opps[oi];
        var osel = App.aiLevel === op.lv;
        U.card(ctx, op, { shadow: osel, bg: osel ? T.paperDeep : T.paper });
        var inOn = T.ink;
        U.tracked(ctx, op.title, op.x + op.w - 14 * S, op.y + 22 * S, 8.5 * S, T.light, 'mono', false, 1.8 * S, 'right');
        U.text(ctx, op.name, op.x + 14 * S, op.y + 34 * S, 24 * S, inOn, 'serifX', true);
        /* 图标方块 */
        var ibx = op.x + op.w - 58 * S, iby = op.y + 14 * S;
        ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5;
        ctx.strokeRect(ibx, iby, 36 * S, 36 * S);
        drawOppIcon(ctx, ibx, iby, 36 * S, op.lv);
        var briefLines = U.wrap(ctx, op.brief, op.w - 28 * S, 12.5 * S, 'serif');
        for (var bl = 0; bl < briefLines.length && bl < 3; bl++) {
          U.text(ctx, briefLines[bl], op.x + 14 * S, op.y + 58 * S + bl * 18 * S, 12.5 * S, 'rgba(26,26,26,0.65)', 'serif');
        }
        var powerY = op.y + op.h - 20 * S;
        U.powerGrid(ctx, op.x + 14 * S, powerY, op.power, 4, op.lv <= 1 ? T.qa : op.lv === 2 ? T.qb : T.ink, 9 * S);
        U.text(ctx, op.powerTxt, op.x + 14 * S + 52 * S, powerY + 8 * S, 10.5 * S, 'rgba(26,26,26,0.55)', 'serif');
        U.text(ctx, '对弈 →', op.x + op.w - 14 * S, powerY + 8 * S, 11 * S, 'rgba(26,26,26,0.5)', 'serif', false, 'right');
      }
    }

    /* —— 四人：席位配置 —— */
    if (App.mode === 'quad') {
      U.tracked(ctx, '席位配置 SEATS · 顺时针', lo.pad, lo.seatsLabelY, 10 * S, T.light, 'mono', false, 1.5 * S);
      for (var sc2 = 0; sc2 < lo.seatCards.length; sc2++) {
        var st = lo.seatCards[sc2];
        var human = App.seats[st.p];
        U.card(ctx, st, { shadow: false, lw: 1.5 });
        ctx.fillStyle = T.playerColor(st.p);
        ctx.fillRect(st.x + 14 * S, st.y + 12 * S, 4 * S, st.h - 24 * S);
        U.text(ctx, st.name, st.x + 28 * S, st.y + 26 * S, 14 * S, T.ink, 'serifB', true);
        U.text(ctx, st.human2 ? '' : '', st.x, st.y, 10 * S, T.ink);
        var tag = human ? '真人执子' : '编辑部 AI';
        var tagW = 84 * S;
        var tb = { x: st.x + st.w - tagW - 14 * S, y: st.y + 14 * S, w: tagW, h: 30 * S,
          label: tag, track: true, fontSize: 10 * S, selected: !human };
        U.button(ctx, tb, pressed['seat' + st.p]);
        st._btn = tb;
      }
      U.text(ctx, 'AI 档位', lo.pad, lo.quadLvSeg.y - 10 * S, 10.5 * S, 'rgba(26,26,26,0.6)', 'serif');
      lo.quadLvSeg.value = App.quadAiLevel - 1;
      U.pillRow(ctx, lo.quadLvSeg, pressed.quadLv);
    }

    /* 开局按钮 */
    U.button(ctx, lo.startBtn, pressed.start);

    /* 页脚注 */
    for (var nl = 0; nl < lo.noteLines.length; nl++) {
      U.text(ctx, lo.noteLines[nl], lo.pad, lo.noteY + nl * 15 * S, 9.5 * S, 'rgba(26,26,26,0.5)', 'mono');
    }

    /* 返回目录 */
    U.button(ctx, lo.backBtn, pressed.back);

    U.nBadge(ctx, 14 * S + 20 * S, pg.cy(L.h) - 34 * S, 20 * S);

    ctx.restore();
    Page.indicator(ctx, pg);
  }

  function drawSpecCard(ctx, b, title, right, pressedIdx) {
    U.card(ctx, b, { shadow: false });
    U.hline(ctx, b.x + 12, b.y + 30, b.w - 24, 'rgba(26,26,26,0.2)', 1);
    U.tracked(ctx, title, b.x + 12, b.y + 20, 10, 'rgba(26,26,26,0.55)', 'mono', false, 1.2);
    U.text(ctx, right, b.x + b.w - 12, b.y + 20, 10, 'rgba(26,26,26,0.55)', 'mono', false, 'right');
  }
  function drawCustomHead(ctx, x, y, w, label, state) {
    U.tracked(ctx, label, x, y, 9.5, 'rgba(26,26,26,0.5)', 'mono', false, 1.2);
    U.text(ctx, state, x + w, y, 9.5, 'rgba(26,26,26,0.45)', 'serif', false, 'right');
    U.hline(ctx, x, y + 6, w, 'rgba(26,26,26,0.2)', 1, [4, 4]);
  }
  function fmtSummary() {
    var App = G.App;
    if (App.fmtIdx === 4) return App.customSize + '×' + App.customSize + ' · 每方 ' + App.customWalls + ' 板';
    var p = (App.mode === 'quad' ? G.Core.FORMAT_PRESETS_4P : G.Core.FORMAT_PRESETS)[App.fmtIdx];
    return p.size + '×' + p.size + ' · 每方 ' + p.wallsPerPlayer + ' 板';
  }
  function clkSummary() {
    var tc = G.App.timeControl();
    if (tc.totalSec === 0 && tc.perMoveSec === 0) return '不限时';
    var s = '';
    if (tc.totalSec) s += '总 ' + (tc.totalSec / 60) + ' 分';
    if (tc.perMoveSec) s += (s ? ' · ' : '') + '步 ' + tc.perMoveSec + ' 秒';
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
  function drawOppIcon(ctx, x, y, s, lv) {
    /* 四职位线稿图标：笔 / 剪刀 / 王冠 / 柱式 */
    ctx.strokeStyle = T.ink; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    var cx = x + s / 2, cy = y + s / 2;
    ctx.beginPath();
    if (lv === 1) { /* 笔 */
      ctx.moveTo(cx - 7, cy + 8); ctx.lineTo(cx - 5, cy + 2); ctx.lineTo(cx + 6, cy - 9);
      ctx.moveTo(cx + 3, cy - 6); ctx.lineTo(cx + 7, cy - 2); ctx.lineTo(cx + 6, cy - 9); ctx.lineTo(cx - 5 + 8, cy - 6 + 8 - 8); ctx.lineTo(cx + 3, cy - 6);
    } else if (lv === 2) { /* 剪刀 × */
      ctx.moveTo(cx - 7, cy - 7); ctx.lineTo(cx + 7, cy + 7);
      ctx.moveTo(cx + 7, cy - 7); ctx.lineTo(cx - 7, cy + 7);
      ctx.moveTo(cx - 7, cy + 10); ctx.arc(cx - 7, cy + 8, 2.4, 0, Math.PI * 2);
      ctx.moveTo(cx + 9.4, cy + 10); ctx.arc(cx + 7, cy + 8, 2.4, 0, Math.PI * 2);
    } else if (lv === 3) { /* 王冠 */
      ctx.moveTo(cx - 9, cy + 7); ctx.lineTo(cx - 9, cy - 4); ctx.lineTo(cx - 4, cy + 1);
      ctx.lineTo(cx, cy - 8); ctx.lineTo(cx + 4, cy + 1); ctx.lineTo(cx + 9, cy - 4); ctx.lineTo(cx + 9, cy + 7);
      ctx.closePath();
    } else { /* 柱式 */
      ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy - 8);
      ctx.moveTo(cx - 6, cy - 4); ctx.lineTo(cx + 6, cy - 4);
      ctx.moveTo(cx - 6, cy + 4); ctx.lineTo(cx + 6, cy + 4);
      ctx.moveTo(cx - 8, cy + 8); ctx.lineTo(cx + 8, cy + 8);
      ctx.moveTo(cx - 5, cy - 4); ctx.lineTo(cx - 5, cy + 4);
      ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
      ctx.moveTo(cx + 5, cy - 4); ctx.lineTo(cx + 5, cy + 4);
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
    if (G.App.mode === 'ai') {
      for (i = 0; i < lo.inkCards.length; i++) if (U.inRect(lo.inkCards[i], x, cy)) pressed['ink' + i] = true;
      for (i = 0; i < lo.opps.length; i++) if (U.inRect(lo.opps[i], x, cy)) pressed['opp' + i] = true;
    }
    if (G.App.mode === 'quad') {
      for (i = 0; i < lo.seatCards.length; i++) {
        var st = lo.seatCards[i];
        if (st._btn && U.inRect(st._btn, x, cy)) pressed['seat' + st.p] = true;
      }
      i = U.pillHit(lo.quadLvSeg, x, cy); if (i >= 0) pressed.quadLv = i;
    }
    if (U.inRect(lo.startBtn, x, cy)) pressed.start = true;
    if (U.inRect(lo.backBtn, x, cy)) pressed.back = true;
  }

  function drag(x, y) {
    pg.drag(x, y);
    if (dragSlider === 'walls') {
      var lo = layout();
      var v = Math.round(U.sliderValue(lo.wallsSlider, x, 0, 20));
      if (G.App.fmtIdx !== 4) { G.App.fmtIdx = 4; }
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
      App.sfx('pawn-click'); pressed = {}; return;
    }
    if (pressed.clkCard != null && U.inRect(lo.clkCards[pressed.clkCard], x, cy)) {
      App.clkIdx = pressed.clkCard;
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
    if (App.mode === 'ai') {
      if (pressed.ink0 && U.inRect(lo.inkCards[0], x, cy)) { App.humanFirst = true; App.sfx('pawn-click'); pressed = {}; return; }
      if (pressed.ink1 && U.inRect(lo.inkCards[1], x, cy)) { App.humanFirst = false; App.sfx('pawn-click'); pressed = {}; return; }
      for (i = 0; i < lo.opps.length; i++) {
        if (pressed['opp' + i] && U.inRect(lo.opps[i], x, cy)) {
          App.aiLevel = lo.opps[i].lv;
          App.sfx('pawn-click');
          App.startGame(false);
          pressed = {}; return;
        }
      }
    }
    if (App.mode === 'quad') {
      for (i = 0; i < lo.seatCards.length; i++) {
        var st = lo.seatCards[i];
        if (pressed['seat' + st.p] && st._btn && U.inRect(st._btn, x, cy)) {
          App.seats[st.p] = !App.seats[st.p];
          App.sfx('pawn-click'); pressed = {}; return;
        }
      }
      i = U.pillHit(lo.quadLvSeg, x, cy);
      if (pressed.quadLv != null && i >= 0) { App.quadAiLevel = i + 1; App.sfx('pawn-click'); pressed = {}; return; }
    }
    if (pressed.start && U.inRect(lo.startBtn, x, cy)) {
      App.sfx('pawn-click');
      App.startGame(false);
      pressed = {}; return;
    }
    if (pressed.back && U.inRect(lo.backBtn, x, cy)) {
      App.sfx('pawn-click');
      App.gotoScene('toc');
      pressed = {}; return;
    }
    pressed = {};
  }

  G.Scenes = G.Scenes || {};
  G.Scenes.setup = { enter: enter, draw: draw, press: press, drag: drag, release: release };
})();

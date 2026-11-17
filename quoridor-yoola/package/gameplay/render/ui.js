/* 步步为营 — UI 组件库（印刷风：直角 / 墨线 / 硬阴影 / 等宽字距）
 * 全部 Canvas 2D 程序化绘制，无 DOM。字号以 414 宽设计稿为基准，外部按 S 缩放。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var T = G.Theme;
  var F = G.Fonts;

  /* 字体串：serif/mono/west × 字重。
   * 字重专用子集已各自注册（qserif-b/qserif-x/qmono-b/qwest-x），
   * bold 一律映射到对应字重字体，绝不叠加 CSS 合成加粗（否则笔画发糊）。 */
  function font(size, family, bold) {
    if (bold) {
      if (family === 'serif') family = 'serifB';
      else if (family === 'mono') family = 'monoB';
      else if (family === 'west') family = 'westX';
    }
    var f = family === 'mono' ? F.mono
      : family === 'monoI' ? F.monoI
      : family === 'west' ? F.west
      : family === 'westX' ? F.westX
      : family === 'westI' ? F.westI
      : family === 'serifX' ? F.serifX
      : family === 'serifB' ? F.serifB
      : F.serif;
    return Math.round(size) + 'px ' + f;
  }

  /* 带字距文本（canvas 无 letter-spacing，逐字绘制） */
  function tracked(ctx, str, x, y, size, color, family, bold, spacing, align) {
    ctx.font = font(size, family, bold);
    ctx.fillStyle = color || T.ink;
    var gap = spacing == null ? size * 0.22 : spacing;
    var total = 0;
    var i;
    for (i = 0; i < str.length; i++) total += ctx.measureText(str[i]).width + (i ? gap : 0);
    var cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    for (i = 0; i < str.length; i++) {
      ctx.fillText(str[i], cx, y);
      cx += ctx.measureText(str[i]).width + gap;
    }
    return total;
  }
  function trackedWidth(ctx, str, size, family, bold, spacing) {
    ctx.font = font(size, family, bold);
    var gap = spacing == null ? size * 0.22 : spacing;
    var total = 0;
    for (var i = 0; i < str.length; i++) total += ctx.measureText(str[i]).width + (i ? gap : 0);
    return total;
  }

  function text(ctx, str, x, y, size, color, family, bold, align, baseline) {
    ctx.font = font(size, family, bold);
    ctx.fillStyle = color || T.ink;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'alphabetic';
    ctx.fillText(str, x, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /* 自动折行（按宽度断行，尊重 CJK/空格），返回行数组 */
  function wrap(ctx, str, maxW, size, family, bold) {
    ctx.font = font(size, family, bold);
    var lines = [];
    var cur = '';
    for (var i = 0; i < str.length; i++) {
      var test = cur + str[i];
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = str[i];
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function inRect(b, x, y, slop) {
    var s = slop || 0;
    return x >= b.x - s && x <= b.x + b.w + s && y >= b.y - s && y <= b.y + b.h + s;
  }

  /* 直角卡片：墨边 + 4px 硬偏移阴影（选中/强调时） */
  function card(ctx, b, opt) {
    opt = opt || {};
    if (opt.shadow !== false) {
      ctx.fillStyle = opt.shadowColor || 'rgba(26,26,26,0.16)';
      ctx.fillRect(b.x + 4, b.y + 4, b.w, b.h);
    }
    ctx.fillStyle = opt.bg || T.paper;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = opt.border || T.ink;
    ctx.lineWidth = opt.lw || 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (opt.selected) { /* 左侧 4px 主色竖条 */
      ctx.fillStyle = opt.accent || T.qa;
      ctx.fillRect(b.x, b.y, 4, b.h);
    }
  }

  /* 方角按钮（白底墨边 / 选中黑底反白 / 红色实心） */
  function button(ctx, b, pressed) {
    var x = b.x, y = b.y, w = b.w, h = b.h;
    var solid = b.solidColor || (b.selected ? T.ink : null);
    if (b.disabled) {
      ctx.fillStyle = 'rgba(26,26,26,0.05)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(26,26,26,0.25)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    } else if (pressed) {
      ctx.fillStyle = T.ink; ctx.fillRect(x + 2, y + 2, w, h);
    } else if (solid) {
      ctx.fillStyle = solid; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = solid === T.ink ? T.ink : T.ink; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    } else {
      ctx.fillStyle = b.bg || T.paper; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    }
    var fg = b.disabled ? 'rgba(26,26,26,0.35)' : (pressed ? T.paper : (solid ? T.paper : (b.color || T.ink)));
    if (b.label) {
      if (b.labelX != null) {
        /* 图标钮：文字在图标右侧定高起始，避免叠压 */
        if (b.track) tracked(ctx, b.label, b.labelX, y + h / 2 + 1, b.fontSize || 13, fg, b.family || 'mono', b.bold !== false, b.spacing);
        else text(ctx, b.label, b.labelX, y + h / 2 + 1, b.fontSize || 14, fg, b.family || 'mono', b.bold !== false, undefined, 'middle');
      } else if (b.track) tracked(ctx, b.label, x + w / 2, y + h / 2 + 1, b.fontSize || 13, fg, b.family || 'mono', b.bold !== false, b.spacing, 'center');
      else text(ctx, b.label, x + w / 2, y + h / 2 + 1, b.fontSize || 14, fg, b.family || 'mono', b.bold !== false, 'center', 'middle');
    }
  }

  /* 档位胶囊行（矩形，选中黑底反白） */
  function pillRow(ctx, seg, pressedIdx) {
    var gap = 6;
    var each = (seg.w - gap * (seg.items.length - 1)) / seg.items.length;
    for (var i = 0; i < seg.items.length; i++) {
      var b = {
        x: seg.x + i * (each + gap), y: seg.y, w: each, h: seg.h,
        label: seg.items[i], selected: i === seg.value, track: true,
        fontSize: seg.fontSize || 13, family: seg.family || 'mono',
      };
      button(ctx, b, pressedIdx === i);
    }
  }
  function pillHit(seg, x, y) {
    var gap = 6;
    var each = (seg.w - gap * (seg.items.length - 1)) / seg.items.length;
    for (var i = 0; i < seg.items.length; i++) {
      if (inRect({ x: seg.x + i * (each + gap), y: seg.y, w: each, h: seg.h }, x, y, 4)) return i;
    }
    return -1;
  }

  /* 幽灵按钮（Web Button ghost：无边框，仅文字 ink/60） */
  function ghostButton(ctx, b, pressed) {
    if (b.label) {
      text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, b.fontSize || 12,
        pressed ? T.ink : 'rgba(26,26,26,0.6)', 'mono', false, 'center', 'middle');
    }
  }

  /* 挡板存量胶囊：n 枚圆角小条，剩余=实心，已用=空心 */
  function wallPips(ctx, x, y, total, left, color, pw, ph, gap) {
    pw = pw || 16; ph = ph || 8; gap = gap == null ? 5 : gap;
    for (var i = 0; i < total; i++) {
      var px = x + i * (pw + gap);
      if (i < left) {
        ctx.fillStyle = color;
        roundRect(ctx, px, y, pw, ph, ph / 2); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(26,26,26,0.35)'; ctx.lineWidth = 1.2;
        roundRect(ctx, px, y, pw, ph, ph / 2); ctx.stroke();
      }
    }
    return total * (pw + gap) - gap;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 棋力格：竖条（与 Web 版 h-3.5 w-2.5 竖条一致），filled 实心 + 空框 */
  function powerGrid(ctx, x, y, filled, total, color, s, gap) {
    s = s || 1;
    var bw = 10 * s, bh = 14 * s;
    gap = gap == null ? 6 * s : gap;
    for (var i = 0; i < total; i++) {
      var px2 = x + i * (bw + gap);
      if (i < filled) { ctx.fillStyle = color; ctx.fillRect(px2, y, bw, bh); }
      else {
        ctx.strokeStyle = 'rgba(26,26,26,0.4)'; ctx.lineWidth = 1.2;
        ctx.strokeRect(px2, y, bw, bh);
      }
    }
    return total * (bw + gap) - gap;
  }

  /* 分割线：实线 / 虚线 */
  function hline(ctx, x, y, w, color, lw, dash) {
    ctx.strokeStyle = color || T.line;
    ctx.lineWidth = lw || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    ctx.setLineDash([]);
  }
  /* 点线引导（目录用）：.... 形式 */
  function dotLeader(ctx, x, y, w, color) {
    ctx.fillStyle = color || 'rgba(26,26,26,0.45)';
    for (var dx = x; dx < x + w - 2; dx += 7) {
      ctx.fillRect(dx, y - 1.5, 2, 2);
    }
  }

  /* 顶部刊头 running head（与 Web 版 QuoridorApp header 1:1：
   * 左侧整串刊号文字，右侧皮肤套印说明；无横线、无色块页签） */
  function statusBar(ctx, W, y, rightExtra) {
    tracked(ctx, '步步为营 · QUORIDOR — 限量印刷棋谱专著', 16, y, 9, 'rgba(26,26,26,0.5)', 'mono', false, 1.4);
    var right = rightExtra || ((G.App && G.App.skin != null && G.Theme.skins[G.App.skin] ? G.Theme.skins[G.App.skin].label : '红·蓝') + ' 套印');
    tracked(ctx, right, W - 16, y, 9, 'rgba(26,26,26,0.5)', 'mono', false, 1.4, 'right');
  }

  /* 页脚页码 folio —— — n —— （与 Web 版 fixed bottom-3 1:1，留出安全间距） */
  function folio(ctx, n) {
    var L = G.Layout;
    tracked(ctx, '— ' + n + ' —', L.w / 2, L.h - 22, 10, 'rgba(26,26,26,0.45)', 'mono', false, 1.6, 'center');
  }

  /* 套印色版胶片条（与 Web 版 SkinFilmStrip 1:1）：
   * 齿孔带 6px×6 歇 / 四联 58×40 色卡 / 下方标签 / 刮选说明行 */
  function filmStrip(ctx, x, y, s, selected) {
    s = s || 1;
    var T2 = G.Theme;
    var App = G.App;
    var FRAME_W = 58 * s, FRAME_H = 40 * s;
    tracked(ctx, '套印色版 RISO PALETTE', x, y + 8 * s, 10 * s, 'rgba(26,26,26,0.6)', 'mono', false, 1.8 * s);
    var fy = y + 14 * s;
    /* 上齿孔 */
    sprocket(ctx, x, fy, FRAME_W * 4, 6 * s);
    fy += 6 * s;
    for (var i = 0; i < 4; i++) {
      var fx = x + i * FRAME_W;
      var sk = T2.skins[i];
      var sel = App && App.skin === i;
      if (sel) { /* 选中外框 outline 2px offset 2 */
        ctx.strokeStyle = T2.ink; ctx.lineWidth = 2 * s;
        ctx.strokeRect(fx - 2 * s, fy - 2 * s, FRAME_W + 4 * s, FRAME_H + 4 * s);
      }
      ctx.fillStyle = sk.qa; ctx.fillRect(fx, fy, FRAME_W / 2, FRAME_H);
      ctx.fillStyle = sk.qb; ctx.fillRect(fx + FRAME_W / 2, fy, FRAME_W / 2, FRAME_H);
      ctx.strokeStyle = 'rgba(26,26,26,0.8)'; ctx.lineWidth = 1;
      ctx.strokeRect(fx, fy, FRAME_W, FRAME_H);
      if (sel) {
        ctx.fillStyle = '#F5F2EA';
        ctx.beginPath(); ctx.arc(fx + FRAME_W - 6 * s, fy + FRAME_H - 5 * s, 2.4 * s, 0, Math.PI * 2); ctx.fill();
      }
    }
    fy += FRAME_H;
    /* 下齿孔 */
    sprocket(ctx, x, fy, FRAME_W * 4, 6 * s);
    fy += 6 * s + 15 * s;
    /* 标签行（与齿孔拉开间距） */
    for (var li = 0; li < 4; li++) {
      var sk2 = T2.skins[li];
      var on = App && App.skin === li;
      text(ctx, sk2.label, x + li * FRAME_W + FRAME_W / 2, fy, 9 * s,
        on ? T2.ink : 'rgba(26,26,26,0.45)', 'mono', !!on, 'center');
    }
    fy += 16 * s;
    /* 刮选说明 */
    var cur = T2.skins[App ? App.skin : 0];
    text(ctx, '横向拖拽刮选 · ' + (cur ? cur.desc : ''), x, fy, 10 * s, 'rgba(26,26,26,0.5)', 'mono');
    return fy + 4 * s - y; /* 总高 */
  }
  function sprocket(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(26,26,26,0.8)';
    for (var dx = 0; dx + 6 <= w + 1; dx += 14) {
      ctx.fillRect(x + dx, y, 6, h);
    }
  }
  /* 胶片条命中：返回选中索引或 -1 */
  function filmStripHit(x, y, fx, fy, s) {
    s = s || 1;
    var FRAME_W = 58 * s, FRAME_H = 40 * s;
    var top = fy + 14 * s + 6 * s;
    if (y < top || y > top + FRAME_H) return -1;
    if (x < fx || x > fx + FRAME_W * 4) return -1;
    return Math.min(3, Math.max(0, Math.floor((x - fx) / FRAME_W)));
  }

  /* 遮罩层（弹层背景压暗） */
  function dim(ctx, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, G.Layout.w + 4, G.Layout.h + 4);
    ctx.restore();
  }

  /* 左下角 N 圆徽章 */
  function nBadge(ctx, x, y, r) {
    r = r || 20;
    ctx.fillStyle = T.ink;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    text(ctx, 'N', x, y + 1, Math.round(r * 0.9), T.paper, 'west', true, 'center', 'middle');
  }

  /* 页脚页码 — n — */
  function pageMark(ctx, cx, y, n) {
    tracked(ctx, '— ' + n + ' —', cx, y, 10, 'rgba(26,26,26,0.5)', 'mono', false, 1, 'center');
  }

  /* 版式/棋钟规格小卡（2×2 网格内一张） */
  function specCard(ctx, b, o) {
    /* o: {label, en, spec, specColor, desc[lines], selected, badge} */
    card(ctx, b, { bg: o.selected ? T.ink : T.paper, shadow: !!o.selected, lw: 1.5, shadowColor: 'rgba(26,26,26,0.2)' });
    var pad = 12;
    var inkOn = o.selected ? T.paper : T.ink;
    var softOn = o.selected ? 'rgba(245,242,234,0.7)' : T.soft;
    var lightOn = o.selected ? 'rgba(245,242,234,0.55)' : T.light;
    text(ctx, o.label, b.x + pad, b.y + 22, 17, inkOn, 'serifB', true);
    if (o.en) tracked(ctx, o.en, b.x + b.w - pad, b.y + 20, 8.5, lightOn, 'mono', false, 1.2, 'right');
    if (o.badge) { /* 右上角骑缝红底白字小签 */
      var bw = trackedWidth(ctx, o.badge, 9, 'mono', false, 1.5) + 12;
      ctx.fillStyle = T.risoRed;
      ctx.fillRect(b.x + b.w - bw - 1, b.y - 1, bw, 16);
      tracked(ctx, o.badge, b.x + b.w - bw - 1 + 6, b.y + 10, 9, T.paper, 'mono', false, 1.5);
    }
    text(ctx, o.spec, b.x + pad, b.y + 44, 13, o.specColor, 'mono', true);
    var dy = b.y + 64;
    for (var i = 0; i < o.desc.length; i++) {
      text(ctx, o.desc[i], b.x + pad, dy, 10.5, softOn, 'serif');
      dy += 15;
    }
  }

  /* 滑杆（细轨 + 黑钮） */
  function slider(ctx, b, value, min, max, pressed) {
    var cy = b.y + b.h / 2;
    ctx.strokeStyle = 'rgba(26,26,26,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x, cy); ctx.lineTo(b.x + b.w, cy); ctx.stroke();
    var fx = b.x + ((value - min) / (max - min)) * b.w;
    ctx.strokeStyle = T.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x, cy); ctx.lineTo(fx, cy); ctx.stroke();
    ctx.fillStyle = T.paper;
    ctx.beginPath(); ctx.arc(fx, cy, pressed ? 11 : 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = T.ink; ctx.lineWidth = 2; ctx.stroke();
    return fx;
  }
  function sliderValue(b, x, min, max) {
    var v = min + Math.max(0, Math.min(1, (x - b.x) / b.w)) * (max - min);
    return v;
  }

  G.UI = {
    font: font,
    text: text,
    tracked: tracked,
    trackedWidth: trackedWidth,
    wrap: wrap,
    inRect: inRect,
    card: card,
    button: button,
    ghostButton: ghostButton,
    pillRow: pillRow,
    pillHit: pillHit,
    wallPips: wallPips,
    powerGrid: powerGrid,
    roundRect: roundRect,
    hline: hline,
    dotLeader: dotLeader,
    statusBar: statusBar,
    folio: folio,
    dim: dim,
    filmStrip: filmStrip,
    filmStripHit: filmStripHit,
    nBadge: nBadge,
    pageMark: pageMark,
    specCard: specCard,
    slider: slider,
    sliderValue: sliderValue,
  };
})();

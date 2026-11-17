/* 步步为营 — 渲染主题与 UI 组件库（Risograph 印刷风：荧光红 / 钴蓝 / 纸米白 / 墨黑）
 * 全部为离屏 Canvas 2D 程序化绘制；不使用 DOM / CSS / 外部字体 / 图片资源。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};

  var T = {
    paper: '#F2ECDD',      /* 纸米白 */
    paperDeep: '#E7DEC8',  /* 纸阴影 */
    ink: '#1A1A1A',        /* 墨黑 */
    inkSoft: 'rgba(26,26,26,0.55)',
    red: '#FF4D2E',        /* 甲 · 荧光红 */
    redDeep: '#D93A20',
    blue: '#2440B3',       /* 乙 · 钴蓝 */
    blueDeep: '#1C3390',
    green: '#2F6B4F',      /* 强调 · 苔绿 */
    gold: '#E8A33D',
  };

  var FONT = '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';

  function font(size, weight) {
    /* 部分小程序 canvas 仅支持 bold/normal 关键字，数字字重统一映射 */
    var w = weight || 400;
    var kw = w >= 600 ? 'bold' : 'normal';
    return kw + ' ' + size + 'px ' + FONT;
  }

  /* —— 基础绘制 —— */
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fillRR(ctx, x, y, w, h, r, color) {
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function strokeRR(ctx, x, y, w, h, r, color, lw) {
    rr(ctx, x, y, w, h, r);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 2;
    ctx.stroke();
  }

  /* 印刷风按钮：墨线描边 + 纸底，按下 = 实心墨底反白 */
  function button(ctx, b, pressed) {
    var x = b.x, y = b.y, w = b.w, h = b.h;
    if (b.disabled) {
      fillRR(ctx, x, y, w, h, h / 2, T.paperDeep);
      strokeRR(ctx, x, y, w, h, h / 2, 'rgba(26,26,26,0.25)', 2);
      ctx.fillStyle = 'rgba(26,26,26,0.35)';
    } else if (pressed) {
      fillRR(ctx, x, y, w, h, h / 2, b.solid ? b.color : T.ink);
      ctx.fillStyle = T.paper;
    } else {
      if (b.solid) {
        fillRR(ctx, x, y, w, h, h / 2, b.color);
        strokeRR(ctx, x, y, w, h, h / 2, T.ink, 2.5);
      } else {
        fillRR(ctx, x, y, w, h, h / 2, b.bg || T.paper);
        strokeRR(ctx, x, y, w, h, h / 2, b.accent || T.ink, 2.5);
      }
      ctx.fillStyle = b.solid ? T.paper : (b.accent || T.ink);
    }
    ctx.font = font(b.fontSize || 17, b.weight || 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function inRect(b, x, y, slop) {
    var s = slop || 0;
    return x >= b.x - s && x <= b.x + b.w + s && y >= b.y - s && y <= b.y + b.h + s;
  }

  function text(ctx, str, x, y, size, color, weight, align, baseline) {
    ctx.font = font(size, weight || 400);
    ctx.fillStyle = color || T.ink;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'alphabetic';
    ctx.fillText(str, x, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /* 分段选择器（水平排布的选项卡），返回选中项索引 */
  function segRow(ctx, seg, pressedIdx) {
    var x = seg.x, y = seg.y, h = seg.h;
    var gap = 8;
    var each = (seg.w - gap * (seg.items.length - 1)) / seg.items.length;
    for (var i = 0; i < seg.items.length; i++) {
      var b = {
        x: x + i * (each + gap), y: y, w: each, h: h,
        label: seg.items[i],
        solid: i === seg.value,
        color: seg.accent || T.ink,
        fontSize: seg.fontSize || 15,
      };
      if (!seg.silentOthers || i === seg.value) {
        button(ctx, b, pressedIdx === i);
      } else {
        fillRR(ctx, b.x, b.y, b.w, b.h, b.h / 2, T.paperDeep);
        strokeRR(ctx, b.x, b.y, b.w, b.h, b.h / 2, 'rgba(26,26,26,0.2)', 2);
        text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, seg.fontSize || 15, 'rgba(26,26,26,0.5)', 700, 'center', 'middle');
      }
    }
  }

  function segHit(seg, x, y) {
    var gap = 8;
    var each = (seg.w - gap * (seg.items.length - 1)) / seg.items.length;
    for (var i = 0; i < seg.items.length; i++) {
      var b = { x: seg.x + i * (each + gap), y: seg.y, w: each, h: seg.h };
      if (inRect(b, x, y, 4)) return i;
    }
    return -1;
  }

  function segItemAt(seg, i) {
    var gap = 8;
    var each = (seg.w - gap * (seg.items.length - 1)) / seg.items.length;
    return { x: seg.x + i * (each + gap), y: seg.y, w: each, h: seg.h };
  }

  /* 面板：纸片 + 墨框 + 左上角标签 */
  function panel(ctx, x, y, w, h, title, accent) {
    fillRR(ctx, x + 4, y + 5, w, h, 14, 'rgba(26,26,26,0.18)');
    fillRR(ctx, x, y, w, h, 14, '#FBF7EC');
    strokeRR(ctx, x, y, w, h, 14, T.ink, 2.5);
    if (title) {
      ctx.font = font(14, 800);
      var tw2 = ctx.measureText(title).width;
      fillRR(ctx, x + 14, y - 12, tw2 + 22, 26, 13, accent || T.ink);
      text(ctx, title, x + 14 + 11, y + 1, 14, '#FBF7EC', 800);
    }
  }

  /* 半透明遮罩 */
  function dim(ctx, alpha) {
    ctx.fillStyle = 'rgba(26,26,26,' + (alpha || 0.55) + ')';
    ctx.fillRect(0, 0, 4000, 4000);
  }

  G.Theme = T;
  G.UI = {
    font: font,
    rr: rr,
    fillRR: fillRR,
    strokeRR: strokeRR,
    button: button,
    inRect: inRect,
    text: text,
    segRow: segRow,
    segHit: segHit,
    segItemAt: segItemAt,
    panel: panel,
    dim: dim,
  };
})();

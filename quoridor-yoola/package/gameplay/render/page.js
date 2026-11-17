/* 步步为营 — 滚动页面框架（触摸拖拽滚动 + 内容坐标换算）
 * 用法：场景内 var pg = Page.create(getContentH);
 *   pg.scroll / pg.max(L.h) / pg.press(x,y) / pg.drag(x,y) / pg.release(x,y)（返回 'tap'|'drag'|null）
 *   绘制时 ctx.save(); ctx.translate(0, -pg.scroll); ...内容...; ctx.restore();
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};

  function create(contentHFn) {
    var pg = {
      scroll: 0,
      dragging: false,
      pressY: 0,
      pressX: 0,
      scrollAtPress: 0,
      moved: false,
      velocity: 0,
      lastY: 0,
      lastT: 0,
      momentumT: null,
    };

    pg.max = function () {
      var L = G.Layout;
      var ch = contentHFn();
      return Math.max(0, ch - L.h + 24);
    };
    pg.clamp = function () {
      if (pg.scroll < 0) pg.scroll = 0;
      var m = pg.max();
      if (pg.scroll > m) pg.scroll = m;
    };

    pg.press = function (x, y) {
      pg.pressX = x; pg.pressY = y;
      pg.scrollAtPress = pg.scroll;
      pg.moved = false;
      pg.dragging = true;
      pg.lastY = y; pg.lastT = Date.now();
      pg.velocity = 0;
      if (pg.momentumT) { clearTimeout(pg.momentumT); pg.momentumT = null; }
    };

    pg.drag = function (x, y) {
      if (!pg.dragging) return;
      var dy = y - pg.pressY;
      if (Math.abs(dy) > 7 || Math.abs(x - pg.pressX) > 12) pg.moved = true;
      pg.scroll = pg.scrollAtPress - dy;
      /* 顶/底橡皮筋阻力 */
      var m = pg.max();
      if (pg.scroll < 0) pg.scroll = pg.scroll * 0.35;
      if (pg.scroll > m) pg.scroll = m + (pg.scroll - m) * 0.35;
      var now = Date.now();
      var dt = now - pg.lastT;
      if (dt > 0 && dt < 80) {
        pg.velocity = (y - pg.lastY) / dt;
      }
      pg.lastY = y; pg.lastT = now;
    };

    pg.release = function (x, y) {
      pg.dragging = false;
      if (!pg.moved) { pg.clamp(); return 'tap'; }
      /* 惯性 */
      var v = -pg.velocity * 16;
      if (Math.abs(v) > 3) {
        var step = function () {
          pg.scroll += v;
          v *= 0.92;
          pg.clamp();
          if (Math.abs(v) > 0.6 && pg.scroll > 0 && pg.scroll < pg.max()) {
            pg.momentumT = setTimeout(step, 16);
          } else {
            pg.clamp();
            if (G.App && G.App.requestRedraw) G.App.requestRedraw();
          }
          if (G.App && G.App.requestRedraw) G.App.requestRedraw();
        };
        pg.momentumT = setTimeout(step, 16);
      } else pg.clamp();
      return 'drag';
    };

    /* 屏幕坐标 → 内容坐标 */
    pg.cy = function (sy) { return sy + pg.scroll; };
    return pg;
  }

  /* 滚动指示条（右侧细条） */
  function indicator(ctx, pg) {
    var L = G.Layout;
    var m = pg.max();
    if (m <= 0) return;
    var trackH = L.h - 120;
    var barH = Math.max(36, (L.h / (m + L.h)) * trackH);
    var y0 = 60 + (pg.scroll / m) * (trackH - barH);
    ctx.fillStyle = 'rgba(26,26,26,0.22)';
    ctx.fillRect(L.w - 5, y0, 2.5, barH);
  }

  G.Page = { create: create, indicator: indicator };
})();

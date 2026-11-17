/* 步步为营 — 封面场景（Web 版 HeroView 1:1）
 * 双细线书框 / 眉线小签 / 巨型宋体主标题（红套印错位）/ QUORIDOR /
 * 发行信息 / 翻开本书 OPEN / 版权块 / N 徽章
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};
  var U = G.UI;
  var T = G.Theme;

  var pressed = false;

  function layout() {
    var L = G.Layout;
    var W = L.w;
    var S = Math.min(W / 414, 1.25);
    var lo = { W: W, S: S, H: L.h };

    lo.frame = { m: 12 * S };
    /* 纵向节奏对齐 Web 版：眉线 31%、主标题 44%、副题/发行随后、按钮 62%、版权 80% */
    lo.mastY = L.h * 0.31;
    lo.titleY = lo.mastY + 118 * S;
    lo.westY = lo.titleY + 46 * S;
    lo.estY = lo.westY + 34 * S;
    lo.openBtn = {
      x: W / 2 - 105 * S, y: L.h * 0.62, w: 210 * S, h: 42 * S,
      label: '翻开本书 OPEN', track: true, fontSize: 13 * S,
    };
    /* 自底向上 */
    lo.copyrightY = L.h * 0.80;
    lo.nBadge = { x: 14 * S + 20 * S, y: L.h - 14 * S - 20 * S };
    return lo;
  }

  function enter() { pressed = false; }

  function draw(ctx) {
    var lo = layout();
    var L = G.Layout;
    var S = lo.S;

    /* 双细线书框 */
    ctx.strokeStyle = T.ink; ctx.lineWidth = 1;
    ctx.strokeRect(lo.frame.m, lo.frame.m, lo.W - lo.frame.m * 2, L.h - lo.frame.m * 2);
    ctx.strokeRect(lo.frame.m + 4, lo.frame.m + 4, lo.W - (lo.frame.m + 4) * 2, L.h - (lo.frame.m + 4) * 2);

    /* 眉线小签（两行） */
    var mast1 = '限量印刷棋谱专著';
    var mast2 = 'A MONOGRAPH THAT PLAYS BACK';
    U.tracked(ctx, mast1, lo.W / 2, lo.mastY, 12 * S, 'rgba(85,85,79,1)', 'mono', false, 3.5 * S, 'center');
    U.tracked(ctx, mast2, lo.W / 2, lo.mastY + 20 * S, 11 * S, 'rgba(85,85,79,1)', 'mono', false, 2.5 * S, 'center');

    /* 主标题（红色套印错位） */
    var titleSize = 84 * S;
    ctx.textAlign = 'center';
    ctx.font = U.font(titleSize, 'serifX', true);
    ctx.fillStyle = T.qa;
    ctx.fillText('步步为营', lo.W / 2 + 3 * S, lo.titleY + 3 * S);
    ctx.fillStyle = T.ink;
    ctx.fillText('步步为营', lo.W / 2, lo.titleY);
    ctx.textAlign = 'left';

    /* QUORIDOR */
    U.tracked(ctx, 'QUORIDOR', lo.W / 2, lo.westY, 24 * S, T.ink, 'west', true, 8 * S, 'center');

    /* 发行信息 */
    U.tracked(ctx, 'EST. 1997 · GIGAMIC PARIS', lo.W / 2, lo.estY, 11 * S, 'rgba(85,85,79,1)', 'mono', false, 2 * S, 'center');
    U.tracked(ctx, 'SET IN TYPE MMXXVI', lo.W / 2, lo.estY + 17 * S, 11 * S, 'rgba(85,85,79,1)', 'mono', false, 2 * S, 'center');

    /* 翻开本书 */
    U.button(ctx, lo.openBtn, pressed);
    if (!pressed) {
      /* 呼吸：按钮下划线微动 */
      var ph = (G.App.clock % 2000) / 2000;
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(ph * Math.PI * 2);
      ctx.fillStyle = T.qa;
      ctx.fillRect(lo.openBtn.x + lo.openBtn.w * 0.28, lo.openBtn.y + lo.openBtn.h + 5,
        lo.openBtn.w * 0.44, 2);
      ctx.globalAlpha = 1;
    }

    /* 版权块 */
    var cy = lo.copyrightY;
    var cx = lo.W / 2;
    U.text(ctx, '第壹卷第壹版 · MMXXVI 限量玖拾玖部', cx, cy, 11.5 * S, 'rgba(85,85,79,1)', 'serif', false, 'center');
    cy += 18 * S;
    U.text(ctx, '字体 思源宋体 Noto Serif SC / IBM Plex Mono /', cx, cy, 10.5 * S, 'rgba(85,85,79,1)', 'mono', false, 'center');
    cy += 15 * S;
    U.text(ctx, 'Playfair Display · 纸色 草浆纸白 №F5F2EA', cx, cy, 10.5 * S, 'rgba(85,85,79,1)', 'mono', false, 'center');
    cy += 15 * S;
    /* 双色行 */
    var seg1 = '双色 RISOGRAPH 套印 ';
    var seg2 = '■ 荧光红';
    var seg3 = ' × ';
    var seg4 = '■ 钴蓝';
    var seg5 = '';
    var seg6 = '步步为营编辑部 出品';
    ctx.font = U.font(10.5 * S, 'mono');
    var w1 = ctx.measureText(seg1).width;
    var w2 = ctx.measureText(seg2).width;
    var w3 = ctx.measureText(seg3).width;
    var w4 = ctx.measureText(seg4).width;
    var w6 = ctx.measureText(seg6).width;
    var x0 = cx - (w1 + w2 + w3 + w4 + w6) / 2;
    U.text(ctx, seg1, x0, cy, 10.5 * S, 'rgba(85,85,79,1)', 'mono');
    U.text(ctx, seg2, x0 + w1, cy, 10.5 * S, T.risoRed, 'mono');
    U.text(ctx, seg3, x0 + w1 + w2, cy, 10.5 * S, 'rgba(85,85,79,1)', 'mono');
    U.text(ctx, seg4, x0 + w1 + w2 + w3, cy, 10.5 * S, T.cobalt, 'mono');
    U.text(ctx, seg6, x0 + w1 + w2 + w3 + w4 + 8 * S, cy, 10.5 * S, 'rgba(85,85,79,1)', 'mono');
    cy += 20 * S;
    U.hline(ctx, cx - 110 * S, cy, 220 * S, 'rgba(26,26,26,0.35)', 1);
    cy += 16 * S;
    U.text(ctx, '开源仓库 OPEN SOURCE · github.com/43aquaris/quoridor', cx, cy, 9.5 * S, 'rgba(85,85,79,0.9)', 'mono', false, 'center');
    cy += 15 * S;
    U.text(ctx, '快手互动玩法 · 离线单机版', cx, cy, 9.5 * S, 'rgba(85,85,79,1)', 'mono', false, 'center');

    /* N 徽章 */
    U.nBadge(ctx, lo.nBadge.x, lo.nBadge.y, 20 * S);
  }

  function press(x, y) {
    var lo = layout();
    pressed = U.inRect(lo.openBtn, x, y);
  }
  function release(x, y) {
    var lo = layout();
    if (pressed && U.inRect(lo.openBtn, x, y)) {
      G.App.sfx('pawn-click');
      G.App.gotoScene('toc');
    }
    pressed = false;
  }

  G.Scenes = G.Scenes || {};
  G.Scenes.cover = { enter: enter, draw: draw, press: press, release: release };
})();

/* 步步为营 — 封面场景（Web 版 HeroView 1:1）
 * 双细线书框 / 眉线小签 / 巨型宋体主标题（红套印错位）/ QUORIDOR /
 * 发行信息 / 翻开本书 OPEN（呼吸闪烁）/ 刊号式页脚
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

    /* 版心框（Web inset-4 / inset-22px） */
    lo.frameA = { m: 16 * S };          /* border-ink/70 */
    lo.frameB = { m: 22 * S };          /* border-ink/40 */

    /* 纵向节奏：内容组垂直居中（Web justify-center + footer 绝对定位 bottom-8） */
    lo.mastY = L.h * 0.285;
    lo.titleY = lo.mastY + 118 * S;
    lo.westY = lo.titleY + 46 * S;
    lo.estY = lo.westY + 34 * S;
    lo.openBtn = {
      x: W / 2 - 105 * S, y: lo.estY + 52 * S, w: 210 * S, h: 42 * S,
      label: '翻开本书 OPEN', track: true, fontSize: 13 * S, spacing: 5.2 * S,
    };
    /* 刊号式页脚（Web footer bottom-8：border-t + pt-4 + 行组） */
    lo.footTop = L.h - 32 * S - 78 * S;
    return lo;
  }

  function enter() { pressed = false; }

  function draw(ctx) {
    var lo = layout();
    var L = G.Layout;
    var S = lo.S;

    /* 双细线书框（外 70% 墨，内 40% 墨） */
    ctx.strokeStyle = T.ink;
    ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
    ctx.strokeRect(lo.frameA.m, lo.frameA.m, lo.W - lo.frameA.m * 2, L.h - lo.frameA.m * 2);
    ctx.globalAlpha = 0.4;
    ctx.strokeRect(lo.frameB.m, lo.frameB.m, lo.W - lo.frameB.m * 2, L.h - lo.frameB.m * 2);
    ctx.globalAlpha = 1;

    /* 眉线小签（一行；窄屏时折两行居中，同 Web 自然折行） */
    var mast = '限量印刷棋谱专著 · A MONOGRAPH THAT PLAYS BACK';
    var mastW = U.trackedWidth(ctx, mast, 10 * S, 'mono', false, 3 * S);
    if (mastW <= lo.W - 40 * S) {
      U.tracked(ctx, mast, lo.W / 2, lo.mastY, 10 * S, 'rgba(26,26,26,0.6)', 'mono', false, 3 * S, 'center');
    } else {
      U.tracked(ctx, '限量印刷棋谱专著', lo.W / 2, lo.mastY, 10 * S, 'rgba(26,26,26,0.6)', 'mono', false, 3 * S, 'center');
      U.tracked(ctx, 'A MONOGRAPH THAT PLAYS BACK', lo.W / 2, lo.mastY + 18 * S, 10 * S, 'rgba(26,26,26,0.6)', 'mono', false, 3 * S, 'center');
      lo.titleY += 10 * S; lo.westY += 10 * S; lo.estY += 10 * S; lo.openBtn.y += 10 * S;
    }

    /* 主标题（红色套印错位：左上墨字压红影，multiply 近似） */
    var titleSize = 84 * S;
    ctx.textAlign = 'center';
    ctx.font = U.font(titleSize, 'serifX');
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = T.qa;
    ctx.fillText('步步为营', lo.W / 2 + 3 * S, lo.titleY + 3 * S);
    ctx.restore();
    ctx.fillStyle = T.ink;
    ctx.fillText('步步为营', lo.W / 2, lo.titleY);
    ctx.textAlign = 'left';

    /* QUORIDOR */
    U.tracked(ctx, 'QUORIDOR', lo.W / 2, lo.westY, 24 * S, T.ink, 'west', true, 10 * S, 'center');

    /* 发行信息（一行，与 Web 相同的整串文案） */
    U.tracked(ctx, 'EST. 1997 · GIGAMIC PARIS — SET IN TYPE MMXXVI', lo.W / 2, lo.estY,
      10 * S, 'rgba(26,26,26,0.55)', 'mono', false, 1.6 * S, 'center');

    /* 翻开本书（整钮呼吸闪烁，Web opacity 0.35→1→0.35） */
    var ph = (G.App.clock % 2400) / 2400;
    var breath = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2));
    ctx.save();
    ctx.globalAlpha = pressed ? 1 : Math.max(0.35, breath);
    U.button(ctx, lo.openBtn, pressed);
    ctx.restore();

    /* —— 刊号式页脚（Web footer：border-t ink/50 + pt-4 + 4 行 mono 9-10px） —— */
    var pad8 = 32 * S;
    var cx = lo.W / 2;
    var fy = lo.footTop;
    U.hline(ctx, pad8, fy, lo.W - pad8 * 2, 'rgba(26,26,26,0.5)', 1);
    fy += 20 * S;
    U.text(ctx, '第壹卷第壹版 · MMXXVI 限量玖拾玖部', cx, fy, 10 * S, 'rgba(26,26,26,0.6)', 'mono', false, 'center');
    fy += 17 * S;
    /* 字体行（与 Web 同一文案；窄屏在 · 处断行，不断英文单词） */
    var fline = '字体 思源宋体 Noto Serif SC / IBM Plex Mono / Playfair Display';
    var fline2 = '纸色 草浆纸白 №F5F2EA';
    U.text(ctx, fline, cx, fy, 10 * S, 'rgba(26,26,26,0.6)', 'mono', false, 'center');
    fy += 15 * S;
    U.text(ctx, fline2, cx, fy, 10 * S, 'rgba(26,26,26,0.6)', 'mono', false, 'center');
    fy += 2 * S;
    /* 双色套印行 */
    var seg1 = '双色 RISOGRAPH 套印 ';
    var seg2 = '■ 荧光红';
    var seg3 = ' × ';
    var seg4 = '■ 钴蓝';
    var seg5 = ' · 步步为营编辑部 出品';
    ctx.font = U.font(10 * S, 'mono');
    var w1 = ctx.measureText(seg1).width;
    var w2 = ctx.measureText(seg2).width;
    var w3 = ctx.measureText(seg3).width;
    var w4 = ctx.measureText(seg4).width;
    var w5 = ctx.measureText(seg5).width;
    var x0 = cx - (w1 + w2 + w3 + w4 + w5) / 2;
    U.text(ctx, seg1, x0, fy, 10 * S, 'rgba(26,26,26,0.6)', 'mono');
    U.text(ctx, seg2, x0 + w1, fy, 10 * S, T.qa, 'mono');
    U.text(ctx, seg3, x0 + w1 + w2, fy, 10 * S, 'rgba(26,26,26,0.6)', 'mono');
    U.text(ctx, seg4, x0 + w1 + w2 + w3, fy, 10 * S, T.cobalt, 'mono');
    U.text(ctx, seg5, x0 + w1 + w2 + w3 + w4, fy, 10 * S, 'rgba(26,26,26,0.6)', 'mono');
    fy += 17 * S;
    /* 开源仓库行（Web 带下划线链接文字） */
    var repo = '开源仓库 OPEN SOURCE · github.com/43aquarius/quoridor';
    var rw = U.trackedWidth(ctx, repo, 9 * S, 'mono', false, 1 * S);
    var rx = cx - rw / 2;
    U.tracked(ctx, repo, rx, fy, 9 * S, 'rgba(26,26,26,0.6)', 'mono', false, 1 * S);
    U.hline(ctx, rx + 26 * S, fy + 3 * S, rw - 26 * S, 'rgba(26,26,26,0.3)', 1);
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

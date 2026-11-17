/* 步步为营 — 设计主题（与 Web 版 1:1：Risograph 印刷棋谱专著风）
 * 色值取自 src/app/globals.css 的 CSS 变量；字体为包内子集字体（见 fonts/）。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};

  var T = {
    /* 基础纸墨（globals.css :root） */
    paper: '#f5f2ea',
    ink: '#1a1a1a',
    risoRed: '#ff4d2e',
    cobalt: '#2440b3',
    green4p: '#00a95c',
    greenSkin: '#2f6b4f',

    /* 派生（color-mix 对应值） */
    paperDeep: '#ece8dc',      /* ink 6% 混纸 */
    faint: 'rgba(26,26,26,0.62)',  /* muted-foreground */
    soft: 'rgba(26,26,26,0.65)',
    light: 'rgba(26,26,26,0.45)',
    lighter: 'rgba(26,26,26,0.40)',
    line: 'rgba(26,26,26,0.22)',
    lineSoft: 'rgba(26,26,26,0.25)',
    wash: 'rgba(26,26,26,0.035)',

    /* 皮肤（套印双色），运行时由 App.skin 切换 qa/qb */
    skins: [
      { id: 'rb', label: '红·蓝', desc: '初版 · 双荧光套印', qa: '#ff4d2e', qb: '#2440b3' },
      { id: 'ri', label: '红·黑', desc: 'Risograph 荧光红', qa: '#ff4d2e', qb: '#1a1a1a' },
      { id: 'bi', label: '蓝·黑', desc: '钴蓝一色活版', qa: '#2440b3', qb: '#1a1a1a' },
      { id: 'gi', label: '墨绿·黑', desc: '深绿打样稿', qa: '#2f6b4f', qb: '#1a1a1a' },
    ],
    qa: '#ff4d2e',
    qb: '#2440b3',
  };

  /* 四人局钉死四色 */
  T.playerColor = function (p) {
    if (G.App && G.App.state && G.App.state.playerCount === 4) {
      return p === 'A' ? '#ff4d2e' : p === 'B' ? '#2440b3' : p === 'C' ? '#00a95c' : '#1a1a1a';
    }
    if (p === 'A') return T.qa;
    if (p === 'B') return T.qb;
    return p === 'C' ? '#00a95c' : '#1a1a1a';
  };
  T.playerName = function (p) {
    return { A: '甲', B: '乙', C: '丙', D: '丁' }[p] || p;
  };
  T.applySkin = function (idx) {
    var sk = T.skins[idx] || T.skins[0];
    T.qa = sk.qa;
    T.qb = sk.qb;
  };

  /* —— 字体族（子集字体经 KwaiRender.loadFont 注册；未就绪时回退系统） —— */
  var F = {
    serif: '"qserif","Noto Serif SC","Songti SC","Noto Serif CJK SC",serif',
    serifB: '"qserif-b","Noto Serif SC","Songti SC",serif',
    serifX: '"qserif-x","Noto Serif SC","Songti SC",serif',
    mono: '"qmono","IBM Plex Mono","Sarasa Mono SC",monospace',
    monoB: '"qmono-b","IBM Plex Mono",monospace',
    monoI: '"qmono-i","IBM Plex Mono",monospace',
    west: '"qwest","Playfair Display","Noto Serif SC",serif',
    westX: '"qwest-x","Playfair Display",serif',
    westI: '"qwest-i","Playfair Display",serif',
  };

  /* 尝试用已注册的 family 替换别名（快手同步返回 family；Web 为 FontFace family） */
  F.resolve = function () {
    var KR = window.KwaiRender;
    if (!KR || !KR.getFont) return;
    var map = {
      'qserif': 'serif', 'qserif-b': 'serifB', 'qserif-x': 'serifX',
      'qmono': 'mono', 'qmono-b': 'monoB', 'qmono-i': 'monoI',
      'qwest': 'west', 'qwest-x': 'westX', 'qwest-i': 'westI',
    };
    for (var alias in map) {
      var fam = KR.getFont(alias);
      if (fam && fam !== alias) {
        F[map[alias]] = '"' + fam + '","Noto Serif SC",serif';
      }
    }
  };

  G.Theme = T;
  G.Fonts = F;
})();

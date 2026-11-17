/* 探针：录制 ctx 调用，检查 drawBoard 是否产出绘制指令 */
global.window = global;
global.KwaiRender = {
  createOffscreenCanvas: function (w, h) {
    return { width: w, height: h, getContext: () => recCtx };
  },
};
require("/home/z/my-project/quoridor-yoola/package/gameplay/play/core.js");
require("/home/z/my-project/quoridor-yoola/package/gameplay/render/theme.js");

var calls = [];
var recCtx = new Proxy({}, {
  get: function (t, prop) {
    if (prop === "measureText") return function (s) { return { width: s.length * 10 }; };
    if (prop === "createPattern") return function () { return {}; };
    return function () {
      var args = Array.prototype.slice.call(arguments).map(function (a) {
        return typeof a === "number" ? Math.round(a * 10) / 10 : (typeof a === "string" ? a.slice(0, 20) : typeof a);
      });
      calls.push(prop + "(" + args.join(",") + ")");
    };
  },
  set: function () { return true; },
});

var G = window.AIGCUtils;
G.Layout = { w: 414, h: 896, safeTop: 0 };
G.App = { state: null, clock: 1000 };
G.UI = { font: function (s) { return s + "px"; }, text: function () {}, roundRect: function () {}, hline: function () {} };

require("/home/z/my-project/quoridor-yoola/package/gameplay/render/board.js");
var B = G.Board;

var st = G.Core.initialGame({ size: 9, wallsPerPlayer: 10 });
var m = B.metrics(9, 382, 16, 100);
console.log("metrics:", JSON.stringify(m));
calls = [];
try {
  B.drawBoard(recCtx, m, st, { legal: G.Core.legalPawnMoves(st, "A") });
} catch (e) {
  console.log("异常:", e.message, e.stack.split("\n")[1]);
}
console.log("drawBoard 调用数:", calls.length);
console.log(calls.slice(0, 12).join("\n"));
/* 检查是否有NaN */
var nan = calls.filter(function (c) { return c.indexOf("NaN") >= 0; });
console.log("NaN调用数:", nan.length, nan.slice(0, 3));

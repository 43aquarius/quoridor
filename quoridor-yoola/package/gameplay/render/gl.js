/* 步步为营 — 渲染桥 + WebGL 纹理 blit（零侵入模板方案）
 *
 * 原理：不改任何脚手架锁定文件。在 kwaiStandard/main.js 取 WebGL 上下文
 * 之前，对主画布的 getContext 做一层包装——模板 main.js 拿到的是「禁用
 * clear 的代理上下文」，其占位绘制（clearColor/clear）变为 no-op；业务侧
 * 直接持有真实上下文，用自己的 requestAnimationFrame 循环绘制，最终
 * 画面由业务帧决定。代理对象对其余全部 WebGL 方法与常量原样转发。
 *
 * 兼容性兜底：若拦截安装失败（极端运行时），退化为 rAF + setTimeout(0)
 * 双重绘制——即使模板 clear 在 rAF 阶段执行，任务阶段的补画仍会在合成
 * 前恢复画面（延迟至多一帧）。
 */
(function () {
  var G = window.AIGCUtils = window.AIGCUtils || {};

  var _raw = null;      /* 真实 WebGL 上下文（业务专用） */
  var _proxy = null;    /* 提供给模板 main.js 的受限代理 */
  var _hooked = false;
  var _patchFailed = false;

  /* —— 受限上下文代理：clearColor / clear 变 no-op，其余原样转发 —— */
  function makeProxy(real) {
    var proxy = {};
    var seen = {};
    var chain = [];
    var obj = real;
    while (obj) {
      chain.push(obj);
      obj = Object.getPrototypeOf(obj);
    }
    for (var ci = 0; ci < chain.length; ci++) {
      var names;
      try { names = Object.getOwnPropertyNames(chain[ci]); } catch (e) { continue; }
      for (var ni = 0; ni < names.length; ni++) seen[names[ni]] = true;
    }
    for (var key in seen) {
      (function (k) {
        var v;
        try { v = real[k]; } catch (e) { return; }
        if (typeof v === 'function') {
          proxy[k] = function () {
            var fn = real[k];
            return fn.apply(real, arguments);
          };
        } else {
          try {
            Object.defineProperty(proxy, k, {
              get: function () { return real[k]; },
              set: function (val) { real[k] = val; },
              enumerable: true,
              configurable: true,
            });
          } catch (e) {}
        }
      })(key);
    }
    proxy.clearColor = function () {};
    proxy.clear = function () {};
    return proxy;
  }

  function install(cv) {
    if (_hooked || !cv) return;
    _hooked = true;
    var realGetContext;
    try {
      realGetContext = cv.getContext.bind(cv);
    } catch (e) {
      _hooked = false;
      _patchFailed = true;
      return;
    }
    try {
      _raw = realGetContext('webgl') || realGetContext('experimental-webgl');
    } catch (e) {
      _raw = null;
    }
    try {
      cv.getContext = function (type, attrs) {
        if (type === 'webgl' || type === 'experimental-webgl') {
          if (!_proxy) _proxy = makeProxy(_raw || realGetContext(type, attrs) || {});
          return _proxy;
        }
        return realGetContext(type, attrs);
      };
    } catch (e) {
      _patchFailed = true;
    }
  }

  /* —— 安装时机：canvas 可能已就绪（H5），也可能由 game.js 稍后赋值（KS） —— */
  (function waitCanvas() {
    var cv = window.canvas;
    if (cv) {
      install(cv);
      return;
    }
    try {
      var box = { v: null };
      Object.defineProperty(window, 'canvas', {
        configurable: true,
        enumerable: true,
        get: function () { return box.v; },
        set: function (val) {
          box.v = val;
          install(val);
        },
      });
    } catch (e) {
      /* 无法拦截属性赋值：留给帧循环里的惰性安装兜底 */
      _patchFailed = true;
    }
  })();

  /* —— WebGL blit：离屏 2D 画面整幅贴到主画布 —— */
  var _gl = null;
  var _tex = null;
  var _prog = null;
  var _quad = null;
  var _dirty = true;
  var _lastW = 0;
  var _lastH = 0;

  var VSH = [
    'attribute vec2 aPos;',
    'attribute vec2 aUv;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = aUv;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}',
  ].join('\n');

  var FSH = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'void main() {',
    '  gl_FragColor = texture2D(uTex, vUv);',
    '}',
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('[GL] shader compile failed', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  function initGL(gl) {
    if (_gl === gl) return true;
    _gl = gl;
    if (!gl) return false;
    var vs = compile(gl, gl.VERTEX_SHADER, VSH);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FSH);
    if (!vs || !fs) return false;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[GL] program link failed', gl.getProgramInfoLog(prog));
      return false;
    }
    _prog = prog;
    /* 全屏四边形：位置 + UV（UV 纵向翻转，适配纹理行序） */
    var data = new Float32Array([
      -1, -1, 0, 1,
      1, -1, 1, 1,
      1, 1, 1, 0,
      -1, -1, 0, 1,
      1, 1, 1, 0,
      -1, 1, 0, 0,
    ]);
    _quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, _quad);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    _tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    _dirty = true;
    return true;
  }

  function markDirty() {
    _dirty = true;
  }

  /* srcCanvas：离屏 2D 画布（物理像素尺寸与主画布按 dpr 对齐） */
  function blit(gl, srcCanvas) {
    if (!initGL(gl)) return;
    if (_dirty || srcCanvas.width !== _lastW || srcCanvas.height !== _lastH) {
      gl.bindTexture(gl.TEXTURE_2D, _tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      _lastW = srcCanvas.width;
      _lastH = srcCanvas.height;
      _dirty = false;
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.095, 0.093, 0.086, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(_prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, _quad);
    var aPos = gl.getAttribLocation(_prog, 'aPos');
    var aUv = gl.getAttribLocation(_prog, 'aUv');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, _tex);
    var uTex = gl.getUniformLocation(_prog, 'uTex');
    gl.uniform1i(uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  G.GLBridge = {
    raw: function () { return _raw; },
    patchFailed: function () { return _patchFailed; },
    lazyInstall: function () {
      if (!_hooked && window.canvas) install(window.canvas);
    },
  };
  G.GLBlt = {
    init: initGL,
    blit: blit,
    markDirty: markDirty,
  };
})();

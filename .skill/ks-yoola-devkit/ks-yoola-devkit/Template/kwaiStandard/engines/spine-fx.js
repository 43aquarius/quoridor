/**
 * spine-fx.js — Spine 特效渲染器（共享主画布 WebGL 上下文，多实例）
 *
 * 用法：
 *   AIGCUtils.SpineFX.playOnce('sandaiyi');   // 一次性特效：加载 → 播一次 → complete 自动销毁
 *   AIGCUtils.SpineFX.mount(id, name, opts);  // 常驻循环动画（如 spine 按钮）：
 *                                      //   幂等——每帧调用刷新存活；0.75s 无刷新自动卸载
 *                                      //   （离开该场景后没人调用即自动销毁）
 *   AIGCUtils.SpineFX.unmount(id);            // 立即卸载常驻实例
 *   AIGCUtils.SpineFX.draw(nowMs);            // render.js 帧尾调用（flush 之后），绘制在所有内容之上
 *
 * 实例两类：persistent（mount，循环+ttl 存活，同 id 幂等更新）；
 *           oneshot（playOnce，播完销毁，重入忽略，不挡常驻实例）。
 * GL 资源（program/vbo/ibo/投影）全局共享一套；每实例只持有
 * skeleton/state/纹理/顶点暂存，销毁时逐实例释放。
 *
 * 渲染：复用 AIH5Game spine-player 的渲染内核（RegionAttachment / MeshAttachment /
 *       ClippingAttachment CPU 裁剪 + 按 slot blendMode 切换混合），但共享 AIGCUtils.gl，
 *       不自建 canvas / 上下文 / 渲染循环，由主循环驱动。
 * 素材：res/spine/<name>/<name>.json|.atlas|.png
 *       PMA 自动判定：web 端像素检测（全透明像素 RGB=0 → 预乘）；
 *       快手端读不了像素，默认按预乘。非预乘素材传 { pma: false }。
 * 销毁：complete（或时长兜底）后 dispose——GL 纹理删除、AM 释放引用；
 *       共享 GL 资源常驻（重放免重建）。
 */
(function () {
  'use strict';
  var AIGCUtils = window.AIGCUtils = window.AIGCUtils || {};
  var IS_KWAI = typeof ks !== 'undefined' && ks && typeof ks.createImage === 'function';

  // ── Shader（与 spine-player 相同：PMA 可切换）──────────────────
  var VERT = [
    'attribute vec2 a_pos;',
    'attribute vec2 a_uv;',
    'attribute vec4 a_col;',
    'uniform mat4 u_proj;',
    'varying vec2 v_uv;',
    'varying vec4 v_col;',
    'void main(){',
    '  v_uv=a_uv;v_col=a_col;',
    '  gl_Position=u_proj*vec4(a_pos,0.,1.);',
    '}'
  ].join('\n');
  var FRAG = [
    'precision mediump float;',
    'varying vec2 v_uv;',
    'varying vec4 v_col;',
    'uniform sampler2D u_tex;',
    'uniform float u_pma;',
    'void main(){',
    '  vec4 t=texture2D(u_tex,v_uv);',
    '  if(u_pma>0.5){',
    '    gl_FragColor=vec4(t.rgb*v_col.rgb*v_col.a,t.a*v_col.a);',
    '  }else{',
    '    gl_FragColor=t*v_col;',
    '  }',
    '}'
  ].join('\n');
  var QUAD_IDX = new Uint16Array([0, 1, 3, 1, 2, 3]);
  var STRIDE = 8; // 每顶点 8 floats

  function compileShader (gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var msg = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('[SpineFX] shader error: ' + msg);
    }
    return s;
  }

  // ── 资源 fetch（双端）────────────────────────────────────────
  function _fetch (path, type) {
    if (IS_KWAI) {
      var data = ks.getFileSystemManager().readFileSync(path, 'utf-8');
      return Promise.resolve(type === 'json' ? JSON.parse(data) : data);
    }
    return fetch(path).then(function (r) { return type === 'json' ? r.json() : r.text(); });
  }

  // ── PMA（预乘 alpha）像素检测（仅 web 端）──────────────────────
  // 预乘纹理特征：全透明像素（alpha=0）的 RGB 也为 0（导出时已乘入）。
  // 斗地主 UI 导出的 spine 纹理全部是预乘；直通渲染会导致 RGB 被二次乘 alpha，
  // 整体偏暗、additive/screen 光效衰减（cocos 按预乘渲染所以正常）。
  // 快手端无 2d canvas 读不了像素 → 返回 null（调用方按素材默认预乘处理）。
  function _detectPma (img) {
    try {
      if (IS_KWAI || typeof document === 'undefined') return null;
      var el = img && (img.image || img);
      if (!el || !el.width || !el.height || !el.src) return null;
      var c = document.createElement('canvas');
      c.width = el.width; c.height = el.height;
      var ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(el, 0, 0);
      var data = ctx.getImageData(0, 0, c.width, c.height).data;
      var zero = 0, dark = 0;
      for (var i = 3; i < data.length; i += 4) {
        if (data[i] === 0) {
          zero++;
          if (data[i - 3] === 0 && data[i - 2] === 0 && data[i - 1] === 0) dark++;
        }
      }
      if (zero < 50) return null;
      return dark / zero > 0.9;
    } catch (e) { return null; }
  }

  // ── 实例与共享 GL 资源 ────────────────────────────────────────
  var _list = [];     // 实例数组：{ id, persistent, name, spine, skeleton, state, texInfo, ... }
  var _loading = {}; // 常驻实例加载中标记（防 mount 重入重复加载）
  // 共享 GL 资源（program/buffer/投影），全部实例复用；Layout 变化时投影原位重建
  var _shared = { gl: null, prog: null, vbo: null, ibo: null, W: 0, H: 0, projMat: new Float32Array(16) };
  // 合批缓冲（模块级共享，顺序渲染安全）：同 blend/纹理的 slot 顶点连续追加，
  // 一次 bufferData + drawElements 提交一段——快手端 GL 桥调用开销大，
  // per-slot 提交（每 slot 2×bufferData+drawElements）每帧数百次桥调用导致掉帧
  var _batchV = new Float32Array(8192 * STRIDE);
  var _batchI = new Uint16Array(16384);

  function _ensureShared (gl) {
    if (_shared.gl === gl && _shared.prog) return _shared;
    _deleteShared();
    _shared.gl = gl;
    var prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('[SpineFX] link error: ' + gl.getProgramInfoLog(prog));
    }
    _shared.prog = prog;
    _shared.vbo = gl.createBuffer();
    _shared.ibo = gl.createBuffer();
    _shared.aPos = gl.getAttribLocation(prog, 'a_pos');
    _shared.aUV = gl.getAttribLocation(prog, 'a_uv');
    _shared.aCol = gl.getAttribLocation(prog, 'a_col');
    _shared.uProj = gl.getUniformLocation(prog, 'u_proj');
    _shared.uTex = gl.getUniformLocation(prog, 'u_tex');
    _shared.uPma = gl.getUniformLocation(prog, 'u_pma');
    return _shared;
  }

 function _ensureProj (gl) {
    var W = AIGCUtils.Layout.w, H = AIGCUtils.Layout.h;
    if (_shared.W === W && _shared.H === H) return;
    _shared.W = W; _shared.H = H;
    var m = _shared.projMat;
    m[0] = 2 / W; m[5] = -2 / H; m[10] = 1;
    m[12] = -1; m[13] = 1; m[15] = 1;
    // 其余分量已为 0（初始化后未写非零值）
  }

  function _deleteShared () {
    var gl = _shared.gl;
    if (gl && _shared.prog) {
      try {
        gl.deleteProgram(_shared.prog);
        gl.deleteBuffer(_shared.vbo);
        gl.deleteBuffer(_shared.ibo);
      } catch (e) {}
    }
    _shared.gl = null; _shared.prog = null; _shared.vbo = null; _shared.ibo = null;
    _shared.W = 0; _shared.H = 0;
  }

  // 销毁单个实例：删纹理 + AM 释放 + 移出列表（共享 GL 资源不动）
  function _kill (fx) {
    if (fx.disposed) return;
    fx.disposed = true;
    var idx = _list.indexOf(fx);
    if (idx >= 0) _list.splice(idx, 1);
    var onDone = fx.onDone; fx.onDone = null;
    try {
      var gl = fx.gl;
      if (gl) {
        for (var k in fx.texInfo) {
          if (fx.texInfo.hasOwnProperty(k) && fx.texInfo[k] && fx.texInfo[k].tex) gl.deleteTexture(fx.texInfo[k].tex);
        }
       gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        if (AIGCUtils.Render && AIGCUtils.Render.resetGlState) AIGCUtils.Render.resetGlState();
     }
   } catch (e) { console.warn('[SpineFX] kill err', e); }
    var AM = AIGCUtils.ResourceLoader;
    if (AM && AM.release) AM.release(fx.amKey);
    if (onDone) { try { onDone(); } catch (e2) {} }
  }

  // 全清（销毁所有实例 + 共享 GL 资源）
  function _dispose () {
    while (_list.length) _kill(_list[0]);
   _deleteShared();
    var gl = AIGCUtils.gl;
    if (gl && AIGCUtils.Render && AIGCUtils.Render.resetGlState) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      AIGCUtils.Render.resetGlState();
    }
  }

  function _setBlend (gl, blendMode, pma) {
    switch (blendMode) {
      case 1: gl.blendFunc(pma ? gl.ONE : gl.SRC_ALPHA, gl.ONE); break;          // Additive
      case 2: gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); break;          // Multiply
      case 3: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;                // Screen
      default: gl.blendFunc(pma ? gl.ONE : gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // Normal
    }
  }

  // ── 每帧绘制（render.js 帧尾 flush 后调用）────────────────────
 function draw (nowMs) {
   if (!_list.length) return;
    var gl = AIGCUtils.gl;
    if (!gl) { _dispose(); return; }
    _ensureShared(gl);
    _ensureProj(gl);
    var t = (nowMs != null ? nowMs : Date.now()) / 1000;
    // 常驻实例存活检测：超过 ttl 无 mount 刷新（离开场景）→ 自动卸载
    for (var k = _list.length - 1; k >= 0; k--) {
      var f0 = _list[k];
      if (f0.persistent && f0.ttl > 0 && t - f0.lastAliveAt > f0.ttl) _kill(f0);
    }
    for (var i = 0; i < _list.length; i++) {
      var fx = _list[i];
      if (fx.disposed || !fx.skeleton) continue;
      // 场景层实例（layer:'scene'）由所属场景在自身 draw 流程中调 drawInstance
      // 绘制（与该场景内容同层级，弹窗可自然遮挡），帧尾跳过
      if (fx.layer === 'scene') continue;
      if (fx.finished) { _kill(fx); continue; }   // 上一帧 complete：帧末销毁
      _drawOne(fx, gl, t);
      // complete 只打标记（state.update 内部回调，不能中段销毁 GL 对象）→ 帧末 kill
      if (fx.finished || (!fx.persistent && t * 1000 >= fx.doneT)) _kill(fx);
    }
  }

  function _drawOne (fx, gl, t) {
    fx.gl = gl;

    // 动画推进：按真实帧间隔推进——低帧率（如快手端 GPU 填充率不足掉到 10fps 以下）
    // 时动画保持真实速度；仅超大跳变（切后台回来 >0.5s）重置为单帧，避免动画瞬跳到末尾。
    // （旧版把 >0.1s 的帧统一钳到 16ms，低帧率时动画被慢放成几分之一速）
    var dt = fx.lastT ? (t - fx.lastT) : 0.016;
    fx.lastT = t;
    if (dt <= 0 || dt > 0.5) dt = 0.016;
    fx.state.update(dt);
    fx.state.apply(fx.skeleton);

    // 布局：骨骼边界视觉中心 → 目标点（默认屏幕中心；scaleY 负值 = Spine Y 轴翻转，
    // 与 SpinePlayer 同语义）。fromX/fromY + moveDur 支持动画期间线性移动
    // （如炸弹从屏幕中心飞到某玩家头像位置）。
    // 缩放来源：fitW（把骨骼宽适配到指定像素宽，常驻按钮用）优先于 scale；
   // press 为按压缩放系数（如 0.94），叠加乘入。
    var W = AIGCUtils.Layout.w, H = AIGCUtils.Layout.h;
    var bcx = fx.boundsCenterX, bcy = fx.boundsCenterY;
    var tx = (fx.x != null) ? fx.x : W / 2;
    var ty = (fx.y != null) ? fx.y : H / 2;
    if (fx.moveDur > 0) {
      var p = Math.min(1, (t - fx.startT) / fx.moveDur);
      var fX = (fx.fromX != null) ? fx.fromX : W / 2;
      var fY = (fx.fromY != null) ? fx.fromY : H / 2;
      tx = fX + (tx - fX) * p;
      ty = fY + (ty - fY) * p;
    }
    var scl = (fx.fitW != null && fx.skelW) ? (fx.fitW / fx.skelW) : fx.scale;
    if (fx.press && fx.press !== 1) scl *= fx.press;
    // 缩放锚点（opts.anchorSlot，如 spine 按钮的 txt 主体）：
    // 默认缩放以骨骼 bounds 中心为锚，主体偏离中心时按压会导致按钮平移；
    // 补偿后 (x,y) 恒对齐主体中心，scale 任意变化（按压缩放）主体位置都不动。
    if (fx.anchorX != null) {
      // 顶点屏幕坐标：x = tx + (x_p - bcx)·scl，y = ty + (bcy - y_p)·scl（Y 翻转）
      // 主体（anchor）恒等于 (tx,ty) → x 用 bcx-anchorX 加、y 用 bcy-anchorY 减
      tx += (bcx - fx.anchorX) * scl;
      ty -= (bcy - fx.anchorY) * scl;
    }
    fx.skeleton.x = tx - bcx * scl;
    fx.skeleton.y = ty - bcy * (-scl);
    fx.skeleton.scaleX = scl;
    fx.skeleton.scaleY = -scl;
    fx.skeleton.updateWorldTransform();

    // ── GL 提交（共享 program/buffer + 合批：同 blend/纹理段一次提交，
    // 快手端桥调用从 slot 数量级降到 blend 段数量级）──
    gl.useProgram(fx.prog);
    gl.uniformMatrix4fv(fx.uProj, false, fx.projMat);
    gl.uniform1f(fx.uPma, fx.pma ? 1 : 0);
    gl.uniform1i(fx.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);

    gl.bindBuffer(gl.ARRAY_BUFFER, fx.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, fx.ibo);
    var strideB = STRIDE * 4;
    gl.vertexAttribPointer(fx.aPos, 2, gl.FLOAT, false, strideB, 0);
    gl.vertexAttribPointer(fx.aUV, 2, gl.FLOAT, false, strideB, 2 * 4);
    gl.vertexAttribPointer(fx.aCol, 4, gl.FLOAT, false, strideB, 4 * 4);
    gl.enableVertexAttribArray(fx.aPos);
    gl.enableVertexAttribArray(fx.aUV);
    gl.enableVertexAttribArray(fx.aCol);

    var spine = fx.spine;
    var drawOrder = fx.skeleton.drawOrder;
    var clipper = fx.clipper;
    var HAS_CLIP = clipper && typeof spine.ClippingAttachment === 'function';
    var lastBM = -1, lastTex = null;
    var vLen = 0, iLen = 0;   // 当前段已追加的顶点数 / 索引数

    function _segCap (vc, ic) {
      if (vLen + vc > 65535 || iLen + ic > _batchI.length) _segFlush();
      if (vLen + vc > 65535) return false;              // 单 attachment 超限（不可能出现）
      if (vLen * STRIDE + vc * STRIDE > _batchV.length) {
        _batchV = new Float32Array(Math.max(_batchV.length * 2, (vLen + vc) * STRIDE));
      }
      if (iLen + ic > _batchI.length) {
        _batchI = new Uint16Array(Math.max(_batchI.length * 2, iLen + ic));
      }
      return true;
    }
    function _segFlush () {
      if (iLen <= 0) return;
      gl.bufferData(gl.ARRAY_BUFFER, _batchV.subarray(0, vLen * STRIDE), gl.DYNAMIC_DRAW);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, _batchI.subarray(0, iLen), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, iLen, gl.UNSIGNED_SHORT, 0);
      vLen = 0; iLen = 0;
    }
    // region quad：4 顶点 + 2 三角形追加进段
    function _appendQuad (wv, uvs, cr, cg, cb, ca) {
      if (!_segCap(4, 6)) return;
      var o0 = vLen * STRIDE;
      for (var v = 0; v < 4; v++) {
        var o = o0 + v * STRIDE;
        _batchV[o] = wv[v * 2]; _batchV[o + 1] = wv[v * 2 + 1];
        _batchV[o + 2] = uvs[v * 2]; _batchV[o + 3] = uvs[v * 2 + 1];
        _batchV[o + 4] = cr; _batchV[o + 5] = cg; _batchV[o + 6] = cb; _batchV[o + 7] = ca;
      }
      var b = vLen;
      _batchI[iLen] = b; _batchI[iLen + 1] = b + 1; _batchI[iLen + 2] = b + 3;
      _batchI[iLen + 3] = b + 1; _batchI[iLen + 4] = b + 2; _batchI[iLen + 5] = b + 3;
      vLen += 4; iLen += 6;
    }
    // mesh：N 顶点 + 索引（相对本段顶点偏移）追加
    function _appendMesh (wv, wvLen, tris, mUvs, cr, cg, cb, ca) {
      var vc = wvLen / 2;
      if (!_segCap(vc, tris.length)) return;
      var o0 = vLen * STRIDE;
      for (var v2 = 0; v2 < vc; v2++) {
        var o = o0 + v2 * STRIDE;
        _batchV[o] = wv[v2 * 2]; _batchV[o + 1] = wv[v2 * 2 + 1];
        _batchV[o + 2] = mUvs[v2 * 2]; _batchV[o + 3] = mUvs[v2 * 2 + 1];
        _batchV[o + 4] = cr; _batchV[o + 5] = cg; _batchV[o + 6] = cb; _batchV[o + 7] = ca;
      }
      for (var t2 = 0; t2 < tris.length; t2++) _batchI[iLen + t2] = tris[t2] + vLen;
      vLen += vc; iLen += tris.length;
    }
    // 裁剪结果：clippedVertices 每顶点 [x,y,r,g,b,a,u,v] → 转 [x,y,u,v,r,g,b,a]
    function _appendClipped (cl) {
      var cv = cl.clippedVertices, ct = cl.clippedTriangles;
      var vc = cv.length / 8;
      if (vc <= 0 || !ct || ct.length < 3) return;
      if (!_segCap(vc, ct.length)) return;
      var o0 = vLen * STRIDE;
      for (var i2 = 0; i2 < vc; i2++) {
        var o = o0 + i2 * STRIDE, s = i2 * 8;
        _batchV[o] = cv[s]; _batchV[o + 1] = cv[s + 1];
        _batchV[o + 2] = cv[s + 6]; _batchV[o + 3] = cv[s + 7];
        _batchV[o + 4] = cv[s + 2]; _batchV[o + 5] = cv[s + 3];
        _batchV[o + 6] = cv[s + 4]; _batchV[o + 7] = cv[s + 5];
      }
      for (var t3 = 0; t3 < ct.length; t3++) _batchI[iLen + t3] = ct[t3] + vLen;
      vLen += vc; iLen += ct.length;
    }

    for (var i = 0; i < drawOrder.length; i++) {
      var slot = drawOrder[i];
      if (!slot) continue;
      var att = slot.getAttachment();

      if (HAS_CLIP && att instanceof spine.ClippingAttachment) {
        clipper.clipStart(slot, att);
        continue;
      }
      if (!att || !att.region || !att.region.page) {
        if (HAS_CLIP) clipper.clipEndWithSlot(slot);
        continue;
      }

      var ti = fx.texInfo[att.region.page.name];
      if (!ti) {
        if (HAS_CLIP) clipper.clipEndWithSlot(slot);
        continue;
      }
      var bm = (slot.data && slot.data.blendMode) || 0;
      // blend 或纹理切换 → 提交当前段再开新段（合批边界）
      if (bm !== lastBM || ti !== lastTex) {
        _segFlush();
        if (bm !== lastBM) { _setBlend(gl, bm, fx.pma); lastBM = bm; }
        gl.bindTexture(gl.TEXTURE_2D, ti.tex);
        lastTex = ti;
      }

      var sc = slot.color;
      var cr = sc.r, cg = sc.g, cb = sc.b, ca = sc.a;
      if (ca <= 0.01) {                          // 完全透明：跳过（含光效淡出帧）
        if (HAS_CLIP) clipper.clipEndWithSlot(slot);
        continue;
      }

      if (att instanceof spine.RegionAttachment) {
        var uvs = att.uvs;
        if (uvs && uvs.length >= 8) {
          var wv = fx.wv8;
          att.computeWorldVertices(slot.bone, wv, 0, 2);
          if (HAS_CLIP && clipper.isClipping()) {
            clipper.clipTriangles(wv, 8, QUAD_IDX, 6, uvs, sc, null, false, 2);
            _appendClipped(clipper);
          } else {
            _appendQuad(wv, uvs, cr, cg, cb, ca);
          }
        }
      } else if (att instanceof spine.MeshAttachment) {
        var wvLen = att.worldVerticesLength;
        var wvMesh = fx.wvMesh;
        if (wvMesh.length < wvLen) fx.wvMesh = wvMesh = new Float32Array(wvLen);
        att.computeWorldVertices(slot, 0, wvLen, wvMesh, 0, 2);
        var mUvs = att.uvs;
        var tris = att.triangles;
        if (!(mUvs && tris && mUvs.length >= 2 && tris.length >= 3)) {
          if (HAS_CLIP) clipper.clipEndWithSlot(slot);
          continue;
        }
        if (HAS_CLIP && clipper.isClipping()) {
          clipper.clipTriangles(wvMesh, wvLen, tris, tris.length, mUvs, sc, null, false, 2);
          _appendClipped(clipper);
        } else {
          _appendMesh(wvMesh, wvLen, tris, mUvs, cr, cg, cb, ca);
        }
      }
      if (HAS_CLIP) clipper.clipEndWithSlot(slot);
    }
    if (HAS_CLIP) clipper.clipEnd();
    _segFlush();   // 尾段提交

   // 恢复主渲染器 GL 状态（它用影子缓存，须显式作废）
   gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (AIGCUtils.Render && AIGCUtils.Render.resetGlState) AIGCUtils.Render.resetGlState();
 }


 // ── 实例创建与播放 ────────────────────────────────────────────
  // 一次性特效：同时只允许一个 oneshot（重入忽略），常驻实例不挡
  function playOnce (name, opts) {
    opts = opts || {};
    for (var i = 0; i < _list.length; i++) {
      if (!_list[i].persistent) return;   // 正在播 oneshot：忽略
    }
    _create(name, opts, { persistent: false });
  }

  // 常驻循环实例（如 spine 按钮）：同 id 幂等更新 opts，每帧调用刷新存活。
  // 离开场景后 0.75s 无人调用 → draw 时自动卸载（无需手动 unmount）。
  function mount (id, name, opts) {
    opts = opts || {};
    var t = Date.now() / 1000;
    for (var i = 0; i < _list.length; i++) {
      var f = _list[i];
      if (f.persistent && f.id === id) {
        _applyOpts(f, opts);
        f.lastAliveAt = t;
        return;
      }
    }
    if (_loading[id]) return;   // 同 id 加载中：防重复发起
    if (!window.spine || !AIGCUtils.gl) return;
    _loading[id] = true;
    _create(name, opts, {
      id: id,
      persistent: true,
      loop: opts.loop !== false,   // 常驻默认循环播放
      ttl: 0.75,
    });
  }

  function unmount (id) {
    for (var i = _list.length - 1; i >= 0; i--) {
      var f = _list[i];
      if (f.persistent && f.id === id) _kill(f);
    }
    delete _loading[id];
  }

  function isReady (id) {
    for (var i = 0; i < _list.length; i++) {
      var f = _list[i];
      if (f.persistent && f.id === id && !f.disposed && f.skeleton) return true;
    }
    return false;
  }

  // 场景层绘制（mount 传 layer:'scene' 的实例，如主页 spine 按钮）：
  // 由所属场景在自己的 draw 流程中调用（旧静态图 drawContain 的位置），
  // 绘制层级与场景内容一致——之后画的弹窗自然遮挡。帧尾 draw 跳过此类实例。
  // overlay（按钮上的文字）随本调用绘制（走 2D batch，层级同场景）。
 function drawInstance (id, nowMs) {
    var gl = AIGCUtils.gl;
    if (!gl) return;
    // 先提交已累积的 2D batch（如弹窗遮罩）：batch 若不 flush 会拖到之后提交，
    // 反过来盖住本 spine —— GL 直绘要保持「画在已绘制内容之上」须先 flush
    if (AIGCUtils.Render && AIGCUtils.Render.flushBatch) AIGCUtils.Render.flushBatch();
    for (var i = 0; i < _list.length; i++) {
      var fx = _list[i];
      if (fx.disposed || !fx.skeleton || fx.layer !== 'scene' || fx.id !== id) continue;
      if (fx.finished) { _kill(fx); return; }
      _ensureShared(gl);
      _ensureProj(gl);
      _drawOne(fx, gl, (nowMs != null ? nowMs : Date.now()) / 1000);
      if (typeof fx.overlay === 'function') {
        try { fx.overlay(fx); } catch (e) { console.warn('[SpineFX] overlay err', e); }
      }
      if (fx.finished) _kill(fx);
      return;
    }
  }

  // 点击命中（spine 按钮用）：取实例当前姿态的可见内容 AABB，屏幕点直接比较——
  // getBounds 输出的顶点已含 skeleton 根变换（x/y/scale 已应用到根骨骼），
  // 即屏幕逻辑坐标（与渲染时喂给投影矩阵的 a_pos 同源），无需再做坐标变换
  function hitTest (id, px, py) {
    for (var i = 0; i < _list.length; i++) {
      var f = _list[i];
      if (f.persistent && f.id === id && !f.disposed && f.skeleton) {
        var sk = f.skeleton, sp = f.spine;
        // 优先：缩放锚点 slot（如按钮的 txt 主体）的实时 region 顶点矩形——
        // 点击区域 = 按钮图片本体（随按压缩放），点在图上才算命中
        if (f.anchorSlot && sk.findSlot) {
          try {
            var aSlot = sk.findSlot(f.anchorSlot);
            var aAtt = aSlot ? aSlot.getAttachment() : null;
            if (aAtt && aAtt instanceof sp.RegionAttachment) {
              var wv = [0, 0, 0, 0, 0, 0, 0, 0];
              aAtt.computeWorldVertices(aSlot.bone, wv, 0, 2);
              var mnX = Math.min(wv[0], wv[2], wv[4], wv[6]);
              var mxX = Math.max(wv[0], wv[2], wv[4], wv[6]);
              var mnY = Math.min(wv[1], wv[3], wv[5], wv[7]);
              var mxY = Math.max(wv[1], wv[3], wv[5], wv[7]);
              return px >= mnX && px <= mxX && py >= mnY && py <= mxY;
            }
          } catch (e) { }
        }
        // 回退：整骨架当前姿态 bounds（含光效范围）
        var off = { x: 0, y: 0, set: function (a, b) { this.x = a; this.y = b; } };
        var siz = { w: 0, h: 0, set: function (a, b) { this.w = a; this.h = b; } };
        try { sk.getBounds(off, siz); } catch (e) { return false; }
        return px >= off.x && px <= off.x + siz.w && py >= off.y && py <= off.y + siz.h;
      }
    }
    return false;
  }

  // ── overlay：绘制在 spine 之上的内容（如按钮上的文字）──────────
  // 注册幂等（直接覆盖）；实例销毁时随之消失；id 尚未创建时暂存，创建后接管
  var _overlayPending = {};

  function overlay (id, fn) {
    if (typeof fn !== 'function') return;
    for (var i = 0; i < _list.length; i++) {
      var f = _list[i];
      if (f.persistent && f.id === id) { f.overlay = fn; return; }
    }
    _overlayPending[id] = fn;
  }

  // SpineFX.draw 之后由 render.js 调用（画完 overlay 后 render 再 flush 一次）
  function drawOverlays () {
    var drew = false;
    for (var i = 0; i < _list.length; i++) {
      var f = _list[i];
      if (f.persistent && !f.disposed && f.layer !== 'scene' && typeof f.overlay === 'function') {
        try { f.overlay(f); drew = true; } catch (e) { console.warn('[SpineFX] overlay err', e); }
      }
    }
    return drew;
  }

  // 更新已建实例参数（mount 每帧刷新）
  function _applyOpts (fx, opts) {
    if (opts.x != null) fx.x = Number(opts.x);
    if (opts.y != null) fx.y = Number(opts.y);
    if (opts.fitW != null) { fx.fitW = Number(opts.fitW); }
    else if (opts.scale != null) { fx.fitW = null; fx.scale = Number(opts.scale); }
    if (opts.press != null) fx.press = Number(opts.press) || 1;
    if (opts.ttl != null) fx.ttl = Number(opts.ttl);
  }

  function _create (name, opts, meta) {
    opts = opts || {};
    meta = meta || {};
    var spine = window.spine;
    if (!spine || !AIGCUtils.gl) { console.warn('[SpineFX] spine runtime / GL 不可用'); return; }

    var base = 'res/spine/' + name + '/';
    // 文件名默认与目录同名（sandaiyi/*），可用 opts.files 覆盖
    // （如 AIH5Game 直接拷来的 skeleton.json/skeleton.atlas/skeleton.png）
    var files = opts.files || {};
    var jsonFile = files.json || (name + '.json');
    var atlasFile = files.atlas || (name + '.atlas');
    var textureFile = files.png || (name + '.png');
   var amKey = 'spinefx-' + name;
    var AM = AIGCUtils.ResourceLoader;

   // 1) 图片走 AM（双端适配），json/atlas 直接 fetch
    AM.acquire('image', amKey, base + textureFile, 'spine-fx');
    AM.ready(amKey).then(function (img) {
      if (!img) throw new Error('texture load failed: ' + base + textureFile);
      return Promise.all([img, _fetch(base + jsonFile, 'json'), _fetch(base + atlasFile, 'text')]);
    }).then(function (res) {
     var img = res[0], json = res[1], atlasText = res[2];

      var gl = AIGCUtils.gl;

     // PMA 判定优先级：opts.pma 显式指定 > web 像素检测 >
      // 素材默认预乘（本项目斗地主 UI 导出纹理全部预乘；快手端无法读像素）。
      // 非预乘素材播放时传 { pma: false } 覆盖。
      var pma;
      if (opts.pma != null) {
        pma = !!opts.pma;
      } else {
        var det = _detectPma(img);
        pma = (det == null) ? true : det;
      }

      // GL 资源（全实例共享一套 program/buffer；Layout 变化时投影原位重建）
      var sh = _ensureShared(gl);
      _ensureProj(gl);
      var prog = sh.prog, vbo = sh.vbo, ibo = sh.ibo;
      var projMat = sh.projMat;

      // 贴图 GL 上传
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // spine 对象
      if (json.skeleton) json.skeleton.images = '';
      var skel = json.skeleton || {};
      var bcx = skel.x + (skel.width || 0) / 2;
      var bcy = skel.y + (skel.height || 0) / 2;

      // TextureAtlas 的纹理解析：外壳需提供 spine runtime 期望的接口
      // （setFilters/setWraps 由 atlas filter 行触发；getImage 渲染时取原始 image）
      var texShell = {
        image: img, width: img.width, height: img.height,
        getImage: function () { return img; },
        setFilters: function () {}, setWraps: function () {}, dispose: function () {},
      };
      var atlas = new spine.TextureAtlas(atlasText, function () { return texShell; });
      var page0 = atlas.pages[0];
      page0.rendererObject = texShell;
      page0.texture = texShell;
      if (page0.regions) {
        for (var j = 0; j < page0.regions.length; j++) {
          page0.regions[j].texture = texShell;
          page0.regions[j].renderObject = texShell;
        }
      }

      var skeletonData = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
      var skeleton = new spine.Skeleton(skeletonData);
      var state = new spine.AnimationState(new spine.AnimationStateData(skeletonData));

     // 缩放：scale 直接指定（优先），否则按骨骼宽 → 屏宽占比（默认 0.55）
      var W = AIGCUtils.Layout.w;
      var skelW = (skel.width || 500);
      var scale;
      if (opts.scale != null) {
        scale = Number(opts.scale);
      } else {
        var targetW = Math.round(W * (opts.widthRatio != null ? opts.widthRatio : 0.55));
        scale = targetW / skelW;
      }

      // 皮肤：默认第一个
      if (opts.skin) {
        var skin0 = skeletonData.findSkin(opts.skin);
        if (skin0) { skeleton.setSkin(skin0); skeleton.setSlotsToSetupPose(); }
        else console.warn('[SpineFX] skin 不存在:', opts.skin);
      }

      // 动画：默认第一个；常驻实例默认循环，一次性默认单次
      var animName = opts.anim || (skeletonData.animations[0] && skeletonData.animations[0].name) || 'animation';
      var animEntry = skeletonData.findAnimation(animName);
      var animLen = animEntry ? (animEntry.duration || 1) : 1;
      var loop = meta.persistent ? (opts.loop !== false) : (opts.loop === true);

      var fx = {
        id: meta.id || '', persistent: !!meta.persistent,
        layer: opts.layer || '',   // 'scene' = 场景层绘制（drawInstance），默认帧尾
        name: name, spine: spine, gl: gl,
        prog: prog, vbo: vbo, ibo: ibo,
        aPos: sh.aPos, aUV: sh.aUV, aCol: sh.aCol,
        uProj: sh.uProj, uTex: sh.uTex, uPma: sh.uPma,
        projMat: projMat,
        texInfo: {}, texShell: texShell,
        skeleton: skeleton, state: state, skeletonData: skeletonData,
        atlas: atlas, amKey: amKey, pma: pma,
        boundsCenterX: bcx, boundsCenterY: bcy,
        scale: scale,
        // fitW：骨骼宽适配到指定像素宽（优先于 scale，常驻按钮用）；
        // press：按压缩放系数（0.94 等）叠加乘入
        fitW: (opts.fitW != null) ? Number(opts.fitW) : null,
        press: (opts.press != null) ? (Number(opts.press) || 1) : 1,
        // 缩放锚点（骨骼坐标，setup 姿态下 anchorSlot 的 region 中心；null = bounds 中心）
        anchorSlot: opts.anchorSlot || '',
        anchorX: null, anchorY: null,
        skelW: skelW,
        // 目标位置（屏幕逻辑坐标，骨骼视觉中心对齐该点；null = 屏幕中心）
        x: (opts.x != null) ? Number(opts.x) : null,
        y: (opts.y != null) ? Number(opts.y) : null,
        // 位移：fromX/fromY → x/y 线性插值，moveDur 秒走完（如炸弹飞到某玩家头像）
        fromX: (opts.fromX != null) ? Number(opts.fromX) : null,
        fromY: (opts.fromY != null) ? Number(opts.fromY) : null,
        moveDur: Number(opts.moveDur) || 0,
        onDone: (typeof opts.onDone === 'function') ? opts.onDone : null,
        startT: Date.now() / 1000,
        clipper: (typeof spine.SkeletonClipping === 'function') ? new spine.SkeletonClipping() : null,
        // 顶点暂存（合批后 verts/idxs 由模块级 _batchV/_batchI 承担，不再每实例分配）
        wv8: new Float32Array(8), wvMesh: new Float32Array(4096),
        lastT: 0, startedAt: Date.now(), doneT: 0, disposed: false,
        // 常驻存活：ttl 秒内无 mount 刷新则自动卸载
        ttl: (meta.ttl != null) ? meta.ttl : 0.75,
        lastAliveAt: Date.now() / 1000,
      };
      fx.texInfo[page0.name] = { tex: tex };
      // 时长兜底：complete 回调异常时按动画长度强制销毁（loop 时按 3 倍时长；常驻实例不兜底）
      fx.doneT = fx.startedAt + animLen * 1000 * (loop ? 3 : 1.25) + 400;

      // 缩放锚点：opts.anchorSlot（如 'txt'）——setup 姿态（根变换未应用，
      // skeleton 默认 x/y=0、scale=1）下取该 slot region 顶点中心的骨骼坐标
      if (opts.anchorSlot && skeleton.findSlot) {
        try {
          skeleton.updateWorldTransform();
          var aSlot = skeleton.findSlot(opts.anchorSlot);
          var aAtt = aSlot ? aSlot.getAttachment() : null;
          if (aAtt && aAtt instanceof spine.RegionAttachment) {
            var awv = [0, 0, 0, 0, 0, 0, 0, 0];
            aAtt.computeWorldVertices(aSlot.bone, awv, 0, 2);
            fx.anchorX = (awv[0] + awv[4]) / 2;
            fx.anchorY = (awv[1] + awv[5]) / 2;
          } else {
            console.warn('[SpineFX] anchorSlot 无 region attachment:', opts.anchorSlot);
          }
        } catch (e) { console.warn('[SpineFX] anchor calc err', e); }
      }

      _list.push(fx);
      if (meta.id) {
        delete _loading[meta.id];
        if (_overlayPending[meta.id]) { fx.overlay = _overlayPending[meta.id]; delete _overlayPending[meta.id]; }
      }
      if (meta.persistent && opts) _applyOpts(fx, opts);

      // 播放：oneshot 的 complete 只打标记（state.update 内部回调，不能中段销毁
      // GL 资源），帧末 kill；persistent（如弹窗）单次动画播完停末帧、不销毁——
      // 生命周期由 ttl（draw 停止刷新 0.75s）或 unmount 管理
      fx.state.setAnimation(0, animName, loop);
      if (!loop && !meta.persistent && fx.state.addListener) {
        fx.state.addListener({
          complete: function () { fx.finished = true; },
        });
      }
      console.log('[SpineFX] play', name,
        (fx.persistent ? '(mounted:' + fx.id + ')' : ''),
        'anim=' + animName + (loop ? '(loop)' : ''),
        'skin=' + (opts.skin || '(first)'),
        'dur=' + animLen.toFixed(2) + 's',
        'pma=' + pma,
        'scale=' + scale.toFixed(3) + (fx.fitW != null ? '(fitW:' + fx.fitW + ')' : ''),
        'pos=' + (fx.x != null ? fx.x + ',' + fx.y : 'center') +
        (fx.moveDur > 0 ? ' from=' + fx.fromX + ',' + fx.fromY + ' move=' + fx.moveDur + 's' : ''));
    }).catch(function (err) {
      console.warn('[SpineFX] 播放失败:', err && err.message || err);
     if (meta.id) delete _loading[meta.id];
     var AM = AIGCUtils.ResourceLoader;
     if (AM && AM.release) AM.release(amKey);   // 回滚 acquire 引用
   });
 }

  AIGCUtils.SpineFX = {
    playOnce: playOnce,
    mount: mount,
    unmount: unmount,
    isReady: isReady,
    drawInstance: drawInstance,
    hitTest: hitTest,
    overlay: overlay,
    drawOverlays: drawOverlays,
    draw: draw,
    isPlaying: function () {
      for (var i = 0; i < _list.length; i++) { if (!_list[i].persistent) return true; }
      return false;
    },
    // 手动销毁（异常兜底，全清）
    dispose: _dispose,
  };

  // devtools 调试入口：控制台执行 playSpine() 触发一次性特效，参数全透传
  // 用法：playSpine() / playSpine('sandaiyi') / playSpine('zhadan', {x:100,y:80,scale:.5})
  window.playSpine = function (name, opts) {
    playOnce(typeof name === 'string' ? name : 'sandaiyi',
             typeof name === 'string' ? opts : name);
  };
  window.playSpine.isPlaying = function () { return AIGCUtils.SpineFX.isPlaying(); };
  // devtools 调试：挂常驻实例（如主页 spine 按钮）
  // 用法：mountSpine('test', 'quickstart', {x:300, y:400, fitW:200})
  window.mountSpine = function (id, name, opts) {
    mount(id || 'dev', name || 'quickstart', opts);
  };
  window.mountSpine.unmount = function (id) { unmount(id || 'dev'); };
})();

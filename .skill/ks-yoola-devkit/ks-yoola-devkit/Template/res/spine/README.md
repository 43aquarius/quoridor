# res/spine/ Spine 动画素材目录

Spine 特效素材统一放在此目录，每个动画一个子目录：

```
res/spine/
  <name>/
    <name>.json    # 骨骼数据
    <name>.atlas   # 图集描述
    <name>.png     # 贴图
```

也可使用 `skeleton.json` / `skeleton.atlas` / `skeleton.png` 命名，播放时传 `{ files: { json:'skeleton.json', atlas:'skeleton.atlas', png:'skeleton.png' } }`。

## 使用方式

```javascript
// 一次性特效（播完自动销毁）
AIGCUtils.SpineFX.playOnce('bomb', { x: 200, y: 300, scale: 0.5 });

// 常驻循环动画（如 spine 按钮，0.75s 无刷新自动卸载）
AIGCUtils.SpineFX.mount('btn-start', 'btn-start', { fitW: 120, loop: true });

// 卸载常驻实例
AIGCUtils.SpineFX.unmount('btn-start');
```

## PMA（预乘 Alpha）

素材默认按预乘处理。非预乘素材播放时传 `{ pma: false }`。
Web 端会自动像素检测；快手端无法读像素，默认预乘。

## 资源存放规则

遵循 `res/README.md` 的通用规则：
- 仅特定场景使用的 spine 动画 → 移入分包 `subpackages/<name>/res/spine/`
- 资源体积由平台在上传阶段统一处理 CDN 化，无需手动上传

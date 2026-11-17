# 图片资源管理模块

## 封装层

文件：`kwaiOpenApi/kwai-media.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-media.js');
```

```js
// 加载单张图片
KwaiMedia.Image.load('res/Image/hero.png').then(function (img) {
  uploadTexture(gl, img);
});

// 批量加载
KwaiMedia.Image.loadAll([
  'res/Image/bg.png',
  'res/Image/hero.png',
]).then(function (imgMap) {
  // imgMap[src] -> Image 对象
  startGame();
});
```

---

## 底层 API 参考

## 概述

创建并加载图片对象。快手环境用 `ks.createImage()`，Web 环境用 `new Image()`，`KwaiMedia.Image` 已做双端适配并封装为 Promise 风格，设置 `src` 触发异步加载，加载完成后上传为 WebGL 纹理。

---

## KwaiMedia.Image API

### 加载单张图片

```js
KwaiMedia.Image.load('res/Image/hero.png').then(function (img) {
  // img: Image 对象，width/height 仅在加载完成后有效
  uploadTexture(gl, img);
}, function (err) {
  console.warn('[Image] 加载失败', err);
});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `src` | `string` | 图片路径（包内相对路径 / 本地路径），CDN 解析对调用方透明 |

### 批量加载

```js
KwaiMedia.Image.loadAll([
  'res/Image/bg_home.png',
  'res/Image/btn_start.png',
  'res/Image/title.png',
]).then(function (imgMap) {
  // imgMap['res/Image/bg_home.png'] -> Image 对象
  draw();
});
```

---

## 常见误用 & 注意事项

- ⚠️ **禁止裸 `ks.createImage()` / `new Image()`**：统一走 `KwaiMedia.Image`，确保双端适配一致
- ⚠️ **`width` / `height` 在加载完成前为 0**：不要在 `then` 之前读取做布局计算
- ⚠️ **重复 `load()` 同一图片会创建多个 Image 实例**：业务侧按需自行缓存已加载的图片对象，避免重复加载
- 💡 **性能建议**：不再使用的图片对象及时置空引用（如切场景时清空缓存变量），帮助引擎 GC 尽早回收内存，避免长时间持有大图导致内存增长

---

## Agent 调用指引

Agent 应在以下场景自动插入 `KwaiMedia.Image`：

- **精灵图加载**：角色/道具/背景 → `KwaiMedia.Image.load(src)`
- **批量预加载**：启动 / 切场景时 → `KwaiMedia.Image.loadAll([...])`
- **切场景释放**：玩法代码自行清空持有的图片对象引用，不再使用的资源及时销毁以避免内存持续增长

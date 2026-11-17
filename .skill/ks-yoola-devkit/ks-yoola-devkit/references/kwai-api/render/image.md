# 图片预加载模块

## 封装层

文件：`kwaiOpenApi/kwai-render.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-render.js');
```

```js
KwaiRender.loadImage({
  src:       'res/Image/hero.png',
  onSuccess: function (img) { /* upload WebGL texture */ },
  onFail:    function (err) {},
});
```


## 底层 API 参考

## 概述

创建并加载图片对象。`ks.createImage()` 创建一个 `Image` 实例，通过设置 `image.src` 触发异步加载，监听 `onload` / `onerror` 回调处理加载结果。加载完成后上传为 WebGL 纹理并绘制。

> 💡 与 Web 端的差异：Web 端用 `new Image()` 创建图片对象，快手运行环境**没有 `Image` 构造函数**，必须用 `ks.createImage()`。

---

## ks.createImage — 创建图片对象

### 参数

无参数。

### 返回值

| 类型 | 说明 |
|------|------|
| `Image` | 图片对象实例（未加载，需设置 `src` 触发加载）|

### 标准调用示例

```ts
// 1) 创建图片对象并加载
const img = ks.createImage();
img.onload = function() {
  console.log('[Image] loaded', img.width, 'x', img.height);
  // 加载完成后上传为 WebGL 纹理
  uploadTexture(gl, img);
};
img.onerror = function() {
  console.error('[Image] load failed');
  // 兜底：用占位图或忽略
};
img.src = 'https://your-cdn.com/hero.png';
```

### Image 对象（图片对象）

`ks.createImage()` 返回的 `Image` 对象是图片载体，通过设置 `src` 触发加载，加载完成后可上传为 WebGL 纹理。

| 属性 | 类型 | 说明 |
|------|------|------|
| src | `string` | 图片的 URL（支持代码包路径、本地路径、网络 URL）|
| width | `number` | 图片的真实宽度（**仅在 `onload` 后才有效**，加载前为 0）|
| height | `number` | 图片的真实高度（**仅在 `onload` 后才有效**，加载前为 0）|
| onload | `function` | 图片加载完成后触发的回调函数（无参数）|
| onerror | `function` | 图片加载发生错误后触发的回调函数（无参数）|

> ⚠️ `Image` 对象**没有 `onload` 之外的 Promise 接口**，需手动包一层 Promise 才能 `await`（见下方封装）。

---

## 图片加载封装示例

### Promise 化封装

```ts
// Promise 化：便于 async/await 使用
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = ks.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`load image failed: ${src}`));
    img.src = src;
  });
}

// 使用
async function preloadHeroImages() {
  const images = {};
  const list = [
    { name: 'hero1', src: 'res/Image/hero1.png' },
    { name: 'hero2', src: 'res/Image/hero2.png' },
    { name: 'bg', src: 'res/Image/background.png' },
  ];
  const results = await Promise.allSettled(
    list.map((item) => loadImage(item.src).then((img) => ({ ...item, img })))
  );
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      images[r.value.name] = r.value.img;
    } else {
      console.warn(`[Image] ${list[i].name} load failed`, r.reason);
      // 兜底：可以用占位图或留空
    }
  });
  return images;
}
```

### 图片缓存管理器

```ts
// 全局图片缓存：避免重复加载同一图片
const ImageManager = {
  _cache: new Map(),  // src -> Image

  // 同步获取已缓存的图片（未加载返回 null）
  get(src) {
    return this._cache.get(src) || null;
  },

  // 异步加载并缓存
  async load(src) {
    if (this._cache.has(src)) {
      return this._cache.get(src);
    }
    const img = await loadImage(src);
    this._cache.set(src, img);
    return img;
  },

  // 批量预加载，返回成功失败的统计
  async preload(sources) {
    const results = { loaded: 0, failed: 0, total: sources.length };
    await Promise.allSettled(
      sources.map((src) =>
        this.load(src).then(
          () => { results.loaded++; },
          () => { results.failed++; }
        )
      )
    );
    console.log(`[Image] preload done: ${results.loaded}/${results.total}`);
    return results;
  },

  // 清理缓存（场景切换时释放内存）
  clear() {
    this._cache.clear();
  },
};

// 在 Loading 场景使用
async function enterLoadingScene() {
  const assets = [
    'res/Image/hero1.png',
    'res/Image/hero2.png',
    'res/Image/background.png',
    'res/Image/ui/button.png',
  ];
  await ImageManager.preload(assets);
  // 全部加载完成，进入主场景
  enterMainMenu();
}

// 主场景中绘制
function drawHero(gl, hero, x, y) {
  const img = ImageManager.get(hero.src);
  if (img) {
    const texture = uploadTexture(gl, img);
    drawTexture(gl, texture, x, y);
  } else {
    // 兜底：使用占位纹理或临时加载
    drawPlaceholderTexture(gl, x, y, 64, 64);
  }
}
```

### src 支持的路径类型

| 路径类型 | 示例 | 说明 |
|---------|------|------|
| 网络路径 | `'https://your-cdn.com/hero.png'` | 必须是 HTTPS，且域名需在快手平台后台配置为 request/downloadFile 合法域名 |
| 代码包路径 | `'res/Image/hero.png'` | 随应用代码包提供的图片，加载快、可离线 |
| 本地临时路径 | `ks.env.USER_DATA_PATH + '/hero.png'` | 通过 `ks.downloadFile` / `ks.saveFile` 下载到本地的图片 |
| base64 | `'data:image/png;base64,....'` | 部分版本支持，不推荐用于大图（占内存）|

---

## 常见误用 & 注意事项

- ⚠️ **必须**用 `ks.createImage()` 而非 `new Image()`，运行环境无 DOM 和 `Image` 构造函数
- ⚠️ `width` / `height` 在 `onload` 触发前是 0，**绝不能在 onload 之前读取**做布局计算
- ⚠️ `onload` / `onerror` 是属性赋值（不是方法调用），**不要** `img.onload = someFunc()`（误加括号会立即执行并把返回值赋给 onload）
- ⚠️ 重复 `ks.createImage()` 加同一图片会创建多个 Image 对象（每次都是新实例），建议封装缓存管理器避免重复加载和内存浪费
- ⚠️ 网络图片必须使用 **HTTPS**，且域名必须在快手平台后台的「request 合法域名」/「downloadFile 合法域名」中配置，否则加载失败
- ⚠️ 大图加载会阻塞主线程（解码耗时），建议在 Loading 场景预加载关键图并上传为 WebGL 纹理
- ⚠️ 不再使用的 Image 对象**没有 destroy 方法**，但引擎会自动回收；长时间不用的图建议从缓存 Map 中移除让 GC 回收
- ⚠️ 多张图加载完成顺序不固定，**不能依赖 onload 触发顺序**；若需顺序加载用 `Promise` 串行 `await`
- 💡 **性能建议**：不使用的图片资源应及时销毁/释放引用，避免长时间持有导致内存持续增长

### 错误处理

| 失败现象 | 可能原因 | 处理建议 |
|---------|---------|---------|
| `onerror` 触发 | 网络错误 / 域名未配置 / 404 | 检查 src 是否正确、域名是否已加入平台白名单 |
| `onerror` 触发 | 路径拼写错误 | 检查代码包路径大小写、后缀名 |
| `onload` 触发但 `width=0` | 极少数格式异常 | 改用通用 PNG/JPG 格式 |
| 加载缓慢 | 大图未压缩 | 服务器开启 gzip / 用 WebP / 切片加载 |

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **资源预加载**：应用启动时预加载关键图片（角色、背景、UI 图标）→ 批量 `ks.createImage` + Promise.allSettled
- **角色/精灵绘制**：角色、对象、道具等图片通过 `Image` 加载后上传为 WebGL 纹理
- **背景图**：静态背景图加载后上传为 WebGL 纹理，必要时缓存到离屏纹理
- **动态加载**：根据关卡进度按需加载图，避免一次性加载全部图导致内存暴涨
- **用户头像/分享封面**：网络 URL 加载用户头像、分享卡片封面等

推荐：封装 `ImageManager`（见上方示例），在 Loading 场景集中预加载，业务模块通过 `ImageManager.get(src)` 同步取已加载的 Image；场景切换时调用 `ImageManager.clear()` 释放上一场景的图集内存。

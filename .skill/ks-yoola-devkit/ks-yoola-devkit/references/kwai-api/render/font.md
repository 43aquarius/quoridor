# 字体加载模块

## 封装层

文件：`kwaiOpenApi/kwai-render.js`（脚手架阶段已复制，无需手动操作）

```js
require('./kwaiOpenApi/kwai-render.js');
```

字体通过 `ks.loadFont` 加载，`KwaiRender` 内部已封装兼容处理。详见底层 API 参考。

---

## 底层 API 参考

## 概述

加载自定义字体文件（`.ttf` / `.woff` 等字体格式），供应用界面使用自定义文字样式。返回字体 family 值，供 WebGL 文本渲染模块生成文字纹理。

---

## ks.loadFont — 加载自定义字体文件

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | `string` | 是 | 字体文件路径。支持本地路径、代码包路径 |

### 路径类型说明

| 路径类型 | 示例 | 说明 |
|---------|------|------|
| 代码包路径 | `'fonts/my-font.ttf'` | 随应用代码包提供的字体文件，**最常用**，加载快、可离线 |
| 本地临时路径 | `ks.env.USER_DATA_PATH + '/my-font.ttf'` | 下载到本地的字体文件路径，适合运行时按需下载 |
| 网络 URL | ❌ 不支持 | 不能直接用 `https://...` 网络地址作为 path |

### 返回值

| 类型 | 说明 |
|------|------|
| `string \| null` | 加载成功返回字体 family 值（用于生成 WebGL 文字纹理），失败返回 `null` |

### 标准调用示例

```ts
// 1) 加载代码包内的字体文件
const family = ks.loadFont('fonts/game-title.ttf');
if (family) {
  console.log('[Font] loaded, family:', family);
} else {
  console.warn('[Font] load failed');
}

// 2) 交给 WebGL 文本渲染模块生成文字纹理
const canvas = ks.createCanvas();
const gl = canvas.getContext('webgl');
if (family) {
  createTextTexture(gl, family, '欢迎');
} else {
  // 兜底：用系统默认字体
  createTextTexture(gl, 'sans-serif', '欢迎');
}
```

### 多字体加载与缓存

```ts
// 字体加载管理器：避免重复加载、提供异步接口
const FontManager = {
  _cache: new Map(),  // path -> family

  load(path, alias) {
    if (this._cache.has(path)) {
      return this._cache.get(path);
    }
    const family = ks.loadFont(path);
    if (family) {
      this._cache.set(path, family);
      if (alias) this._cache.set(alias, family);
    }
    return family;
  },

  // 批量预加载，全部完成后回调
  preload(list) {
    const results = {};
    list.forEach(({ alias, path }) => {
      results[alias] = this.load(path, alias);
    });
    return results;
  },

  get(alias) {
    return this._cache.get(alias);
  },
};

// 启动时预加载所有字体
const fonts = FontManager.preload([
  { alias: 'title', path: 'fonts/title.ttf' },
  { alias: 'body', path: 'fonts/body.ttf' },
  { alias: 'number', path: 'fonts/number.ttf' },
]);

// 使用
createTextTexture(gl, fonts.title || 'sans-serif', '开始');
```

### 常见用法

```ts
// 分数显示用数字字体（等宽、易读）
function drawScore(gl, score, x, y) {
  const family = FontManager.get('number') || 'sans-serif';
  const texture = createTextTexture(gl, family, String(score));
  drawTexture(gl, texture, x, y);
}

// 标题用艺术字体
function drawTitle(gl, text, x, y) {
  const family = FontManager.get('title') || 'sans-serif';
  const texture = createTextTexture(gl, family, text);
  drawTexture(gl, texture, x, y);
}
```

### 常见误用 & 注意事项

- ⚠️ `path` **不支持网络 URL**，必须先把字体下载到本地或打包到代码包；如需用网络字体，应先 `ks.downloadFile` 到本地再 `loadFont(本地路径)`
- ⚠️ 返回的 family 值**不是路径**，是字体在系统内注册的 family 名称，需交给 WebGL 文本渲染模块使用
- ⚠️ 加载失败返回 `null`，**必须做兜底**（如 fallback 到 `sans-serif`）
- ⚠️ 字体文件体积通常较大（1-5MB），**打包到代码包会显著增加包体**；建议只打包标题/数字等关键字体，正文用系统字体
- ⚠️ 多次调用同一 `path` 会重复加载（理论上返回的 family 相同），仍建议自行缓存避免重复 I/O
- ⚠️ `loadFont` 是**同步阻塞**的，加载大字体会卡首帧；建议在 Loading 场景预加载，再切到主场景
- ⚠️ iOS 系统对字体格式兼容较好（`.ttf` / `.otf`），安卓部分机型对 `.otf` 支持不佳，**推荐统一用 `.ttf`**

### 错误处理

| 失败现象 | 可能原因 | 处理建议 |
|---------|---------|---------|
| 返回 `null` | 文件路径错误 / 文件不存在 | 检查路径是否正确、文件是否已打包到代码包 |
| 返回 `null` | 字体格式不支持 | 改用 `.ttf` 格式 |
| 返回 family 但显示为系统字体 | 文本纹理生成时未使用 family | 检查文本渲染模块入参 |
| 显示为方框 | 字体文件不含该字符 | 检查字体文件字符集，必要时换字体或用兜底字体 |

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **需要自定义界面字体**：标题、分数、特殊 UI 文字使用非系统字体 → 加载 `.ttf` 字体文件
- **数字显示**：分数、计时器、计数器等需要等宽数字字体 → 加载等宽数字字体
- **多语言字体支持**：界面需要显示特殊语言（如泰语、阿拉伯语）而系统字体不全 → 加载对应语言字体
- **品牌一致性**：项目有专属字体 → 加载品牌字体

推荐：在 Loading 场景集中预加载所有字体，封装为 `FontManager`（见上方示例），业务模块通过 `FontManager.get(alias)` 取 family，避免散落调用 `ks.loadFont` 和处理失败兜底逻辑。

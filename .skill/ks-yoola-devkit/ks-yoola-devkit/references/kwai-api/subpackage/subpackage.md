# 分包加载模块

## 文件

`kwaiOpenApi/kwai-subpackage.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-subpackage.js');
```

## 调用方式

```js
KwaiSubpackage.load({
  name:       'level2',
  onProgress: function (res) {
    console.log(res.progress + '%');
  },
  onSuccess:  function (res) {
    console.log('分包路径', res.path);
    enterLevel2();
  },
  onFail:     function (err) {
    console.warn(err.code, err.errorMsg);
  },
});
```

## 注意事项

- `name` 为 `game.json` 中 `subpackages` 配置的分包名称

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.loadSubpackage` → `LoadSubpackageTask.onProgressUpdate` → [subpackage.md](subpackage.md)

---

## 底层 API 参考

## 概述

通过 `ks.loadSubpackage` 异步加载子包，可按需加载资源、关卡和场景，减小主包体积、加快首屏启动。`LoadSubpackageTask` 提供加载进度监听。**加载成功后子包目录下的 `game.js` 会被自动执行**，适合在其中注册场景入口、初始化资源。

> ⚠️ **子包配置**：需在项目 `game.json` 中配置 `subPackages` 字段声明子包名称和路径，未配置的子包无法加载。

> ⚠️ **game.js 自动执行**：`loadSubpackage` 调用成功后，子包目录下的 `game.js` 会被**自动执行一次**，适合做场景注册、资源预加载；**不要**在子包 `game.js` 里做需要立即触发的业务逻辑，应等待主包通知。

> ⚠️ **无 abort**：`LoadSubpackageTask` **没有 `abort` 方法**，加载开始后无法取消，请确保用户确实需要该子包再触发加载。

---

## ks.loadSubpackage — 加载子包

### 概述

加载子包。加载成功后，子包目录下的 `game.js` 文件会被**自动执行**。返回 `LoadSubpackageTask` 任务实例，可用于监听加载进度。

### 参数 Schema

**Object object**

| 属性 | 类型 | 说明 | 必填 |
|------|------|------|------|
| name | `string` | 子包名称（需在 `game.json` 的 `subPackages` 中配置）| 是 |
| success | `function` | 成功回调 | 否 |
| fail | `function` | 失败回调 | 否 |

**success 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| name | `string` | 子包名称 |
| path | `string` | 子包相对路径 |

**fail 回调参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| code | `number` | 错误代码 |
| errorMsg | `string` | 错误信息 |

### 返回值

| 类型 | 说明 |
|------|------|
| `LoadSubpackageTask` | 加载分包任务实例，可用于监听加载进度 |

### 标准调用示例

```ts
// 1) 基础用法：加载场景子包
const launchScene = 'scene2';  // 您的子包名称
const loadTask = ks.loadSubpackage({
  name: launchScene,
  success(res) {
    console.log('子包加载成功:', res.name, 'path:', res.path);
    // 子包的 game.js 已自动执行，场景入口已注册
    // 通知应用切换到 scene2
    enterScene('scene2');
  },
  fail(err) {
    console.error('子包加载失败:', err.code, err.message);
    KwaiUI.toastError('场景加载失败');
  },
});

// 监听加载进度
loadTask.onProgressUpdate((res) => {
  console.log('加载进度:', res.progress + '%');
  updateLoadingBar(res.progress / 100);
});
```

```ts
// 2) Promise 化封装（注意：onProgressUpdate 需单独订阅）
function loadSubpackage(name, onProgress) {
  return new Promise((resolve, reject) => {
    const task = ks.loadSubpackage({
      name: name,
      success: resolve,
      fail: reject,
    });
    if (onProgress) {
      task.onProgressUpdate(onProgress);
    }
  });
}

// 使用
async function enterLevel(levelId) {
  try {
    const subpackage = `level-${levelId}`;
    await KwaiUI.withLoading('加载关卡中', () =>
      loadSubpackage(subpackage, (res) => {
        // 更新进度条
        KwaiUI.updateLoadingProgress(res.progress / 100);
      })
    );
    console.log('关卡子包已就绪');
    startLevel(levelId);
  } catch (err) {
    console.error('加载失败:', err.code, err.errorMsg);
    KwaiUI.toastError('关卡加载失败');
  }
}
```

```ts
// 3) 多子包按需加载
async function ensureSubpackageLoaded(name) {
  // 缓存已加载的子包，避免重复加载
  if (window._loadedSubpackages && window._loadedSubpackages.has(name)) {
    return;
  }
  if (!window._loadedSubpackages) {
    window._loadedSubpackages = new Set();
  }
  await loadSubpackage(name);
  window._loadedSubpackages.add(name);
  console.log('[Subpackage] loaded:', name);
}

// 进入商店场景时加载 shop 子包
async function onEnterShop() {
  await ensureSubpackageLoaded('shop');
  openShop();
}

// 进入排行榜时加载 rank 子包
async function onEnterRank() {
  await ensureSubpackageLoaded('rank');
  openRank();
}
```

```ts
// 4) 预加载：在主菜单空闲时预加载下一关子包
function preloadNextLevel(currentLevel) {
  const nextLevel = currentLevel + 1;
  const subpackage = `level-${nextLevel}`;
  ks.loadSubpackage({
    name: subpackage,
    success() {
      console.log('[Subpackage] preloaded:', subpackage);
      window._loadedSubpackages = window._loadedSubpackages || new Set();
      window._loadedSubpackages.add(subpackage);
    },
    fail(err) {
      console.warn('[Subpackage] preload failed:', subpackage, err.errorMsg);
      // 预加载失败不影响主流程，玩家进入时再加载
    },
  });
}

// 关卡开始时预加载下一关
function onLevelStart(levelId) {
  setTimeout(() => preloadNextLevel(levelId), 2000);  // 2s 后预加载
}
```

### 常见误用 & 注意事项

- ⚠️ **必须先在 `game.json` 配置子包**：未配置的子包无法加载，`fail` 回调会触发
- ⚠️ **`game.js` 自动执行**：子包目录下的 `game.js` 会在 `success` 前自动执行一次，适合做场景注册、资源预加载；**不要**在里面做需要立即触发的业务逻辑
- ⚠️ **无 abort**：`LoadSubpackageTask` 没有 `abort` 方法，加载开始后无法取消，请确保用户确实需要再触发
- ⚠️ **重复加载**：同一子包重复 `loadSubpackage` 一般不会重复下载（容器有缓存），但仍建议业务层缓存已加载子包，避免无谓调用
- ⚠️ **name 必须匹配**：`name` 必须与 `game.json` 中 `subPackages` 配置的 `name` 完全一致，大小写敏感
- ⚠️ **弱网下载**：弱网下下载子包可能耗时较长，务必显示进度条 + 允许用户取消（通过 UI 层面跳过，而非 `abort`）
- ⚠️ **主包依赖**：子包内代码可以引用主包资源，但主包不能引用子包资源（子包未加载时主包访问不到）；注意依赖方向

---

## LoadSubpackageTask 对象

`ks.loadSubpackage` 返回的加载任务实例，用于监听分包加载进度。

### 方法

| 方法 | 说明 |
|------|------|
| `onProgressUpdate(callback)` | 监听分包加载进度变化事件 |

> ⚠️ 与 `DownloadTask` / `UploadTask` 不同，`LoadSubpackageTask` **没有 `abort` 方法**，加载开始后无法取消。

---

## LoadSubpackageTask.onProgressUpdate — 监听加载进度

### 概述

监听分包加载进度变化事件，用于更新进度条。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | `function` | 是 | 进度变化回调函数 |

**callback 接收参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| name | `string` | 子包名称 |
| progress | `number` | 进度（0-100）|
| downloadedSize | `number` | 已下载的文件大小（字节）|
| totalSize | `number` | 总文件大小（字节）|

### 标准调用示例

```ts
const loadTask = ks.loadSubpackage({
  name: 'scene2',
  success(res) {
    console.log('加载完成:', res.name, 'path:', res.path);
  },
  fail(err) {
    console.error('加载失败:', err);
  },
});

loadTask.onProgressUpdate((res) => {
  console.log(`[Subpackage] ${res.name}: ${res.progress}%`);
  console.log(`已下载: ${res.downloadedSize} / ${res.totalSize} 字节`);
  // 更新 UI 进度条
  updateProgressBar(res.progress / 100);
  updateSizeText(res.downloadedSize, res.totalSize);
});

// 友好显示文件大小
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function updateSizeText(downloaded, total) {
  const text = `${formatSize(downloaded)} / ${formatSize(total)}`;
  document.getElementById('sizeText').innerText = text;
}
```

### 常见误用 & 注意事项

- ⚠️ **回调频率**：`onProgressUpdate` 触发频率较高（每秒数次），回调里**禁止做重计算**，只更新 UI
- ⚠️ **`progress` 是整数**：0-100 整数，不是小数，转 0-1 浮点用 `progress / 100`
- ⚠️ **`downloadedSize` / `totalSize` 单位字节**：显示给用户时需转换为 KB / MB
- ⚠️ **必须 `loadSubpackage` 后立即调用**：`onProgressUpdate` 需在 `loadSubpackage` 返回 `LoadSubpackageTask` 后立即订阅，否则可能错过早期进度
- ⚠️ **加载完成后不再触发**：`progress: 100` 后回调不再触发，无需手动 `offProgressUpdate`

---

## 完整使用模式

### 子包配置（game.json）

```json
{
  "subPackages": [
    {
      "name": "shop",
      "root": "subpackages/shop/"
    },
    {
      "name": "rank",
      "root": "subpackages/rank/"
    },
    {
      "name": "level-1",
      "root": "subpackages/level-1/"
    }
  ]
}
```

### 子包 game.js（自动执行，注册场景入口）

```js
// subpackages/shop/game.js
(function() {
  // 子包加载成功后自动执行
  // 注册场景入口，等待主包通知
  window._sceneEntries = window._sceneEntries || {};
  window._sceneEntries['shop'] = function() {
    // 加载商店场景资源
    const shopScene = createShopScene();
    return shopScene;
  };
  console.log('[Shop subpackage] game.js executed, scene registered');
})();
```

### 主包按需加载子包

```ts
// 主包内
async function enterScene(sceneName) {
  // 1) 加载子包
  await KwaiUI.withLoading('加载中', (updateProgress) =>
    KwaiSubpackage.load(sceneName, (res) => {
      updateProgress(res.progress / 100);
    })
  );
  // 2) 子包 game.js 已自动执行，调用场景入口
  if (window._sceneEntries && window._sceneEntries[sceneName]) {
    const scene = window._sceneEntries[sceneName]();
    scene.start();
  } else {
    console.error('场景入口未注册:', sceneName);
  }
}

// 进入商店
async function onShopClick() {
  await enterScene('shop');
}

// 进入排行榜
async function onRankClick() {
  await enterScene('rank');
}
```

### 预加载下一关

```ts
function onLevelComplete(levelId) {
  // 启动下一关时预加载下下一关
  const nextSubpackage = `level-${levelId + 2}`;
  setTimeout(() => {
    ks.loadSubpackage({
      name: nextSubpackage,
      success() {
        console.log('[Subpackage] preloaded:', nextSubpackage);
      },
      fail() {
        // 预加载失败静默忽略
      },
    });
  }, 2000);
}
```

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **按需加载场景**：主菜单进入商店/排行榜/关卡时加载对应子包 → `ks.loadSubpackage` + `onProgressUpdate` 显示进度
- **大关卡分包**：每个关卡一个子包，减少主包体积 → 进入关卡时加载，完成后启动
- **预加载下一关**：当前关卡完成后预加载下一关子包，提升体验
- **资源密集功能**：截图编辑、视频编辑、自定义关卡编辑器等大资源功能拆到子包 → 用到时才加载

推荐：在 `gameplay/kwai-subpackage.js` 中封装：
- `loadSubpackage(name, onProgress)` Promise 化
- `ensureSubpackageLoaded(name)` 缓存已加载子包，避免重复调用
- `preloadSubpackage(name)` 后台静默预加载，失败不报错
- 配合 `KwaiUI.withLoading` 显示进度条
- 子包 `game.js` 注册场景入口到 `window._sceneEntries[name]`，主包加载完成后调用对应入口

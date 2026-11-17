# 快手互动作品分包规则

## 体积限制

| 项目 | 限制 |
|---|---|
| 主包 | <= 6 MiB |
| 单个子包 | <= 6 MiB |
| 全部包体总和 | <= 30 MiB |

分包触发条件见下方"分包决策建议"；视频文件不打入包体，不计入体积统计（CDN 处理规则见 [resource-spec.md](resource-spec.md#视频资源规则强制)）。

## game.json 配置规范

```json
{
  "subpackages": [
    { "name": "level-2", "root": "subpackages/level-2/" },
    { "name": "level-3", "root": "subpackages/level-3/" }
  ],
  "parallelPreloadSubpackages": ["level-2"]
}
```

- `name` 仅允许字母、数字、`-`、`_`，与加载代码中的 `name` 完全一致
- `root` 必须以 `/` 结尾，不得与主包或其他子包路径重叠
- 子包入口固定为 `<root>/game.js`
- `parallelPreloadSubpackages` 列出需要预加载的分包名称（可选）

## 分包加载

通过 `AIGCUtils.SubpackageLoader`（`kwaiStandard/loaders/subpackage-loader.js` 封装），不直接调用裸 `KwaiSubpackage`：

```js
// game.js 中按需引入
require('./kwaiOpenApi/kwai-subpackage.js'); // 底层 API（SubpackageLoader 依赖）

// 玩法代码中加载分包
AIGCUtils.SubpackageLoader.load('level-2', {
  onSuccess: function () {
    enterLevel2(); // 分包加载完成后进入
  },
  onProgress: function (res) {
    updateLoadingBar(res.progress);
  },
  onFail: function (err) {
    console.warn('SubPkg.Load', '分包加载失败', err);
  },
});
```

## 分包资源规范

分包内资源路径以分包 root 为根：

```
subpackages/level-2/
  game.js          # 分包入口
  res/
    Image/         # 分包专属图片
    Audio/         # 分包专属音频
```

分包内加载图片：

```js
// 分包加载完成后，路径以 subpackages/<name>/ 开头
KwaiRender.loadImage({ src: 'subpackages/level-2/res/Image/level2-bg.png', success: function (res) {} });
```

## 分包校验

```bash
node scripts/validate-package.mjs --dir <GAME_DIR>
```

校验内容：`game.json` 配置合法性、各包体积是否超限、`parallelPreloadSubpackages` 中的分包名是否存在（与包体合规校验合并执行）。

## 分包决策建议

| 场景 | 建议 |
|---|---|
| 关卡 > 5 个或主包预计 > 4 MiB | 按关卡分包 |
| 特效/剧情资源集中 | 单独一个分包 |
| 首屏必需资源 | 始终在主包，不分包 |
| 视频资源 | 不分包，由平台上传阶段统一 CDN 化 |

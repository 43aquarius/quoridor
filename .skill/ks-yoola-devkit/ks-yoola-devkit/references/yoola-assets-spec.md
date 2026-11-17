# Yoola 互动作品素材规范

## 用途

`package/yoola-assets/` 专用于 Yoola 平台创建互动作品时上传的平台素材，不参与作品内渲染，也不是快手互动作品包内资源。禁止在玩法代码中引用该目录。

## 配置

配置文件为 `package/yoola-assets/yoola-assets.json`，字段必须全部存在：

```json
{
  "icon": "icon.png",
  "shareImage": "share-image.png",
  "loadingImage": "loading-image.png"
}
```

字段值为素材文件相对 `package/yoola-assets/` 的路径，只能使用小写字母、数字、`-`、`.`、`_`，禁止中文、空格与特殊字符。

## 素材规格

| 字段 | 用途 | 规格 |
|---|---|---|
| `icon` | 项目图标 | 220 × 220，PNG |
| `shareImage` | 分享图 | 510 × 350，PNG，≤ 10 MiB |
| `loadingImage` | 加载背景图 | PNG，≤ 1 MiB；竖屏 640 × 1400，横屏 1400 × 640 |

`loadingImage` 必须与 `package/game.json` 的 `deviceOrientation` 一致：`portrait` 使用 640 × 1400，`landscape` 使用 1400 × 640。

Logo 上传后由平台侧生成 148 × 148 版本，开发者只提供 220 × 220 原图。

素材必须满足尺寸、格式与体积限制；生成后运行 `validate-package.mjs` 自检。

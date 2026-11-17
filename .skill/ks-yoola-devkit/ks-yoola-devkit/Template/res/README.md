# res/ 玩法素材资源目录规范
> 详细规范见 `docs/scaffold.md` §9 素材资源规范。
> 项目素材统一放在 `res/` 目录，引擎文件不放入素材目录。

## 目录说明
```
res/              # 玩法素材根目录（主包）
  home-asset/  # 首页渲染图（🔒 必须主包，禁止 CDN，禁止分包）
  Image/       # 图片（PNG / JPG / WebP / SVG）
  Audio/       # 音频（MP3 / OGG / M4A）
  Video/       # 视频（MP4，本地调试用，生产必须换 CDN URL）
  Icon/        # 应用图标（icon-128.png / icon-512.png）
```

## 分包素材目录
分包素材放在 `subpackages/<name>/res/`（结构同主包，按需建 Audio / Image / Video）。

### `home-asset/` 特殊规则

- **用途**：存放用户第一帧看到的首页渲染图（首屏背景、加载页背景等）
- **必须**：放在主包，随包下载，确保首帧加载速度最优
- **禁止**：上传 CDN（无论文件大小）
- **禁止**：移入分包
- **命名**：`home-[描述].[ext]`，如 `home-bg.png`、`home-loading.png`

## 命名规则（强制）
| 类型 | 格式 | 示例 |
|------|------|------|
| 图片 | `[场景]-[描述]-[状态].[ext]` | `menu-bg-full.png`、`game-btn-play.png` |
| 音效 | `sfx-[描述].mp3` | `sfx-coin-collect.mp3`、`sfx-hit.mp3` |
| 背景音乐 | `bgm-[描述].mp3` | `bgm-main.mp3`、`bgm-boss.mp3` |
| 视频 | `[场景]-[描述].mp4` | `intro-cutscene.mp4` |
| 图标 | `icon-[尺寸].png` | `icon-128.png`、`icon-512.png` |

- 全小写，单词间用 `-` 连接
- 禁止空格、中文、特殊字符
- 文件名 ≤ 60 字符

## 资源存放规则

资源体积不需要开发者控制：所有资源由平台在上传阶段统一上传至平台 CDN 并替换引用地址，无需按体积判断是否上 CDN，也禁止在代码中拼接外部 CDN 地址。开发者只需决定资源放主包还是分包：

| 资源 | 规则 |
|------|------|
| 首页渲染图 / 首屏必需资源 | 主包（`home-asset/` 强制主包）|
| 非首屏资源 | 移入分包 `subpackages/<name>/res/` |
| 视频 | 本地放 `res/Video/` 调试，平台上传阶段统一 CDN 化；互动视频类（underView）需联系平台加白 |

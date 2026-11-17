---
name: ks-yoola-devkit
description: 引导用户初始化、开发、校验或打包快手 Yoola 互动作品，提供从脚手架初始化、规范约束、编码实现到本地校验与打包的完整工作流；当用户提出这些需求时触发，不触发与 Yoola 互动作品开发无关的通用咨询。
---

# ks-yoola-devkit — 快手 Yoola 互动内容开发 Skill

为 AI 编码工具（Cursor / Claude Code 等）提供快手 Yoola 项目开发规范。读取本文件后即可按流程完成初始化、编码、校验与打包。

## 环境要求

- 本地安装 Node.js **14.0 及以上** 版本；所有 `.mjs` 脚本直接用 `node <script>.mjs` 执行，无平台专属脚本。
- 打包脚本使用 Node 内置 `fs` / `zlib` 生成 zip，**不依赖系统 `zip` 命令**，macOS / Windows / Linux 均可直接运行。

## 核心约束（强制，贯穿全流程）

- **运行形态**：所有逻辑在本地独立运行，不发起网络请求；禁止使用 `fetch`、`XMLHttpRequest`、`axios`、`WebSocket` 等联网能力
- **CDN 资源**：禁止在代码中拼接外部 CDN 地址拉取资源。CDN 化由平台在上传阶段统一处理，参考 [resource-spec.md](references/resource-spec.md)
- **渲染**：禁止使用浏览器 DOM / CSS / HTML，所有画面只能通过 canvas 绘制；Canvas 2D / WebGL / WebGL 2 均可使用，遇到运行或兼容问题优先联系 Yoola 平台侧排查
- **入口文件**：`game.js` 是快手端运行入口；`index.html` 只用于本地 H5 浏览器预览，快手运行环境不会加载 HTML。入口文件只负责模块装配，所有交互逻辑写在 `package/gameplay/`
- **模块系统**：快手侧 `require` 只能写在 `package/game.js`，其他文件禁止 `require`；H5 预览由 `index.html` 以 `<script>` 引入相同文件集合
- **平台能力**：必须通过 `package/kwaiOpenApi/kwai-*.js` 封装模块调用，禁止直接调用裸 `ks.*` API；裸调用可能导致浏览器预览异常
- **图片**：禁止直接 `new Image()`，必须通过 `KwaiRender.loadImage` / `KwaiMedia.Image` 管理
- **AI 生图素材**：生成、筛选或导入 AI 图片素材前，必须先阅读 [AI 生图素材规范](references/image-spec.md)，根据素材用途选择尺寸、方向、分辨率、色彩模式和文件格式；不得直接使用超过需求的超大图片
- **资源体积**：开发者无需按体积控制资源，平台在上传阶段统一做 CDN 化；互动视频类玩法（underView）需单独联系平台加白
- **包体**：主包 ≤ 6 MiB，单子包 ≤ 6 MiB，总包 ≤ 30 MiB
- **上传**：手动登录 [Yoola 平台](https://open.kuaishou.com/platform/minigame/yoola)，不通过脚本直接上传

以上约束违反会导致审核拒绝或运行异常，详见对应参考文档；生成代码前必须按需读取相关文档，不得凭经验臆断平台限制。

## 项目制作流程

### Step 1 — 确认项目内容与交互方式

先向用户确认以下信息，未明确前不得直接初始化或生成代码：

- **作品项目名**：仅当用户尚未提供时询问，用于命名本次新建的 Yoola 作品；它不是作品所关联的其他产品名称。
- **内容类型**：消除、跑酷、塔防、答题、休闲合成等
- **核心玩法**：目标规则、操作方式、胜负条件、关卡或循环机制
- **内容边界**：是否包含多关卡、教程引导、结算奖励等玩法模块

同时确认项目目录：

- 优先使用用户指定的 `<GAME_DIR>`
- 用户未指定时，先询问项目目录，禁止默认写入 Skill 所在目录
- 用户明确要求默认新建时，才在桌面新建项目目录

将确认结果写入 `PROJECT.md`，作为后续技术方案与代码生成的玩法依据。

**作品项目名的字段映射与提问边界**：用户确认的作品项目名通过脚手架参数 `--name` 传入，并写入 `<GAME_DIR>/aigc-context.json` 的 `gameName` 字段，即「用户提供的作品项目名 → `--name` → `aigc-context.json.gameName`」。`--name` 是命令行参数，`gameName` 是 JSON 字段；两者都表示本次新建作品的名称，不表示它关联或从属于某个既有产品。`appid` 是独立字段，初始化时保留 `<APPID>` 占位符，不向用户索要。除非用户明确要求关联既有产品，或当前平台步骤明确要求关联，否则不要询问作品归属；不得根据作品题材、平台或常见产品猜测关联对象，也不得自行列出具体产品名称作为选项。缺少项目名时，用开放式问题询问「这份 Yoola 互动作品的项目名是什么？」；不得把项目名问题改写成关联关系问题。

### Step 2 — 初始化脚手架

```bash
node scripts/scaffold-init.mjs --name <GAME_NAME> --dir <GAME_DIR>
```

- 将 `Template/` 复制到 `<GAME_DIR>/package/`
- 从 Skill 配置 `config/aigc-context.template.json` 生成 `<GAME_DIR>/aigc-context.json`，并用本次作品项目名填充 `gameName`；`appid` 保留 `<APPID>` 占位符，无需在初始化阶段向用户询问或填写，由 yoola 平台在上传阶段统一替换
- 若 `<GAME_DIR>/PROJECT.md` 已存在则保留；仅在缺失时生成项目上下文锚点

完成后读取 `references/kwai-minigame-spec.md` 了解运行时环境约束（无 DOM / 无 CSS / 全局对象使用 `window`）。

### Step 3 — 确认技术方案

根据 Step 1 确认的内容与交互方式，先产出技术方案文档，并分轮向用户确认。用户未明确确认前，不要生成玩法代码。

- 确认横竖屏形态，并修改 `package/game.json` 的 `deviceOrientation`（竖屏 `portrait`，横屏 `landscape`）
- 需要接入的开放能力模块（广告 / 登录 / 分享 / 存储等），参考 [kwai-open-api.md](references/kwai-open-api.md) 选型
- 是否需要分包，参考 [subpackage-rules.md](references/subpackage-rules.md) 规范
- 是否需要 CDN 资源，参考 [resource-spec.md](references/resource-spec.md) 规范
- 结合玩法循环、关卡/场景结构、渲染架构、输入处理、资源组织和平台规范，形成完整技术方案

每轮确认后补充遗漏项，直至用户确认完整方案；再将已确认能力写入 `aigc-context.json` 的 `features` 字段，并把技术方案摘要写入 `PROJECT.md`。

### Step 4 — 生成 Yoola 平台素材

生成 Yoola 平台所需素材：**图标、分享图、加载图**，并按 [yoola-assets-spec.md](references/yoola-assets-spec.md) 的尺寸、格式与体积要求存放到 `package/yoola-assets/`，同时更新 `package/yoola-assets/yoola-assets.json` 中三个字段对应的路径。加载背景图必须与 `package/game.json` 的横竖屏配置一致。该目录仅用于平台上传，运行代码禁止引用。

使用 AI 生成角色、道具、背景等项目内图片素材前，必须先读取 [AI 生图素材规范](references/image-spec.md)，确认素材用途、画面方向和目标分辨率，再选择合适的图片尺寸、格式和色彩模式。

### Step 5 — 编写玩法代码并接入开放能力

**所有代码只能写在 `package/gameplay/` 下**（`play/` / `render/` / `scene/` 等目标目录均可按需创建）。

先在 `package/game.js` 的 `require` 块中按需追加 Step 3 确定的模块：

```js

require('./kwaiOpenApi/kwai-ad.js');         // 必接：广告
require('./kwaiOpenApi/kwai-repost.js');     // 必接：转发分享
// 按需追加其他模块，见 references/kwai-api/KwaiAPI-index.md
```

再编写业务逻辑。调用平台能力时，按「核心约束」优先使用对应的 `package/kwaiOpenApi/kwai-*.js` 封装模块（不直接调用裸 `ks.*` API）。每个模块的详细调用方式见 `references/kwai-api/<module>/<file>.md`；渲染与运行时细节详见 `references/kwai-minigame-spec.md` 和 `references/render-api.md`。

### Step 6 — 配置分包（如需）

在 `package/game.json` 的 `subpackages` 中声明分包，然后校验：

```bash
node scripts/validate-package.mjs --dir <GAME_DIR>
```

体积约束见「核心约束」，详细规则参考 `references/subpackage-rules.md`。

### Step 7 — 本地预览与自测（如需）

```bash
# H5 浏览器预览（快速验证逻辑）
node scripts/scaffold-preview.mjs --dir <GAME_DIR>
```

H5 预览依次验证：画面渲染、触摸交互、广告回调、分包加载。如需真机验证，在 yoola 平台上传生成测试版本后进行。

### Step 8 — 包体预检与打包

```bash
# 本地预检（非上传门禁，提前发现问题）
node scripts/validate-package.mjs --dir <GAME_DIR>

# 打包成交付 zip
node scripts/build-zip.mjs --dir <GAME_DIR>
```

预检通过后登录 [Yoola 平台](https://open.kuaishou.com/platform/minigame/yoola) 手动上传，平台侧会读取 `package/yoola-assets/` 中的平台素材用于创建项目，随后完成 CDN 化与门禁校验。

## 项目上下文与会话规则

Skill 本身不保存项目状态，所有上下文落在各项目目录内。为避免串项目：

- 每个 `<GAME_DIR>` 根目录维护一份独立的 `aigc-context.json`（项目名称、已接入能力模块 `features`、分包配置、当前所处 Step），作为该项目的状态单一来源；由 Step 2 从 Skill 配置生成，不属于交付包内容
- 每个 `<GAME_DIR>` 根目录维护一份 `PROJECT.md`，记录该项目特有的约定（如自定义资源目录、特殊玩法约束），供 AI 工具开发前手动加入上下文
- **一个 AI 对话只能处理一个项目**。需要开发另一个项目时，结束当前对话并新开对话，不得在同一对话中切换上下文
- 多个项目需要并行开发时，使用多个独立 AI 会话；每个会话开始前先读取该项目自己的 `aigc-context.json` 和 `PROJECT.md`
- 恢复或继续开发某个项目时，也必须先读取该项目的 `aigc-context.json` 和 `PROJECT.md`，不得复用其他项目的 features、分包结构或默认值

## 版本兼容与迁移

- `scaffold-init.mjs` 检测到 `<GAME_DIR>/package/` 已存在时会拒绝执行；已初始化的旧项目不得重新初始化脚手架，也不得整体覆盖 `package/`
- 旧项目继续在当前 Skill 下开发玩法代码，`package/project.config.json` 的 `aigc_skill_version` 保留项目初始化时写入的版本号
- Skill 通过 `template-manifest-history.json` 维护各版本的模板文件哈希。本地校验按项目 `aigc_skill_version` 选择对应版本清单；清单缺失或文件被修改时，该文件不做豁免，转为全量静态扫描
- `aigc-context.json` 的 schema 后续新增字段时，只按版本说明补齐新增字段，不覆盖已有 `gameName`、`features`、`subpackages`、`currentStep` 和项目自定义内容

---

## 参考文档索引

| 文档 | 职责 |
|------|------|
| [kwai-minigame-spec.md](references/kwai-minigame-spec.md) | 平台规范总览：运行时环境、入口约定、禁用 API 清单 |
| [kwai-api/KwaiAPI-index.md](references/kwai-api/KwaiAPI-index.md) | 开放能力 API 索引（按需导航到各模块文档）|
| [render-api.md](references/render-api.md) | WebGL 渲染规范、离屏画布、帧循环 |
| [js-runtime.md](references/js-runtime.md) | JS 运行时约束、全局对象、require 规则 |
| [subpackage-rules.md](references/subpackage-rules.md) | 分包体积上限、game.json 配置、校验清单 |
| [resource-spec.md](references/resource-spec.md) | 资源目录结构、命名规则、CDN 决策表 |
| [image-spec.md](references/image-spec.md) | AI 生图素材的用途、尺寸、分辨率、色彩模式和文件格式规范 |
| [yoola-assets-spec.md](references/yoola-assets-spec.md) | Yoola 平台素材目录、配置与上传链路 |
| [performance-budget.md](references/performance-budget.md) | 帧率目标、内存上限、纹理规格 |
| [troubleshooting.md](references/troubleshooting.md) | 常见问题与排障指南 |

---

## 开发工具脚本清单

| 脚本 | 触发示例 | 说明 | 用法 |
|---|---|---|---|
| `scaffold-init.mjs` | "初始化 Yoola 项目，名称是 XXX" | 复制脚手架到 `<GAME_DIR>/package/`，生成 `aigc-context.json` 和 `PROJECT.md` | `node scripts/scaffold-init.mjs --name <GAME_NAME> --dir <GAME_DIR>` |
| `scaffold-preview.mjs` | "启动本地 H5 预览" | 启动本地静态服务并自动打开浏览器，快速验证渲染与交互 | `node scripts/scaffold-preview.mjs --dir <GAME_DIR> [--port 8080]` |
| `validate-package.mjs` | "检查交付包是否合规" | 校验包体大小（6/6/30 MiB）、分包配置、网络行为静态扫描（含全局引用与字符串拼接外部 URL）、资源命名规范，输出 ERROR/WARN | `node scripts/validate-package.mjs --dir <GAME_DIR>` |
| `build-zip.mjs` | "打包项目 zip" | 将 `package/` 打包为交付 zip（按扩展名白名单过滤，保留 `yoola-assets/` 供平台上传） | `node scripts/build-zip.mjs --dir <GAME_DIR> [--out <输出路径>]` |

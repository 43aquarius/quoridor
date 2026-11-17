#!/usr/bin/env node
/**
 * scaffold-init.mjs — 初始化快手端项目脚手架
 *
 * 用法：node scaffold-init.mjs --name <GAME_NAME> --dir <GAME_DIR>
 *
 * 职责：
 *   1. 复制 Template/ → <GAME_DIR>/package/
 *   2. 从 Skill config/aigc-context.template.json 生成 <GAME_DIR>/aigc-context.json，填充 gameName
 *      （appid 保留占位符 <APPID>，由 yoola 平台在上传阶段统一替换，开发阶段无需填写）
 *   3. 在 <GAME_DIR>/PROJECT.md 已存在时保留；仅在缺失时生成 AI 上下文锚点
 *
 * 输出：stdout JSON { success, packageDir, contextFile, projectFile }
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEVKIT_DIR = path.resolve(__dirname, '..')
const TEMPLATE_DIR = path.join(DEVKIT_DIR, 'Template')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      args[key] = argv[i + 1]
      i += 1
    }
  }
  return args
}

function fail(message) {
  console.log(JSON.stringify({ success: false, error: message }))
  process.exit(1)
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

const { name: gameName, dir: gameDir } = parseArgs(process.argv.slice(2))

if (!gameName || !gameDir) {
  fail('用法：node scaffold-init.mjs --name <GAME_NAME> --dir <GAME_DIR>')
}

if (!fs.existsSync(TEMPLATE_DIR)) {
  fail(`脚手架模版不存在：${TEMPLATE_DIR}`)
}

const absGameDir = path.resolve(gameDir)
const packageDir = path.join(absGameDir, 'package')

if (fs.existsSync(packageDir)) {
  fail(`目标目录已存在，拒绝覆盖：${packageDir}`)
}

// 1. 复制 Template/ → <GAME_DIR>/package/
copyDir(TEMPLATE_DIR, packageDir)


// 2. 生成 aigc-context.json（appid 保留占位符，由平台上传阶段统一替换）
const contextTemplate = JSON.parse(
  fs.readFileSync(path.join(DEVKIT_DIR, 'config', 'aigc-context.template.json'), 'utf8')
)
contextTemplate.gameName = gameName
const contextFile = path.join(absGameDir, 'aigc-context.json')
fs.writeFileSync(contextFile, JSON.stringify(contextTemplate, null, 2) + '\n')

// 3. 若 PROJECT.md 已存在则保留，避免覆盖已确认需求；仅在缺失时生成模板
const projectFile = path.join(absGameDir, 'PROJECT.md')
if (!fs.existsSync(projectFile)) {
  const claudeLines = [
    `# ${gameName} — 项目上下文`,
    '',
    '> 本文件记录该项目特有的约定（自定义资源目录、特殊交互规则等）。',
    '> 一个 AI 对话只处理一个项目；多个项目并行时使用独立会话。',
    '> 使用 AI 工具开发本项目前，手动将本文件加入 AI 工具上下文（如 `/add PROJECT.md`）。',
    '',
    '## 当前状态',
    '',
    '见 `aigc-context.json`：`gameName` / `features`（已接入能力模块）/ `subpackages`（分包配置）/ `currentStep`（当前所处开发阶段）。',
    '',
    '## 项目特有约定',
    '',
    '（按需补充：自定义资源目录、特殊玩法限制等）',
    ''
  ]
  fs.writeFileSync(projectFile, claudeLines.join('\n'))
}

console.log(JSON.stringify({ success: true, packageDir, contextFile, projectFile }))

#!/usr/bin/env node
/**
 * validate-package.mjs — 项目包本地预检
 *
 * 用法：node validate-package.mjs --dir <GAME_DIR>
 * 输出：stdout JSON { passed, errors[], warnings[] }
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEVKIT_DIR = path.resolve(__dirname, '..')
const MiB = 1024 * 1024
const MAIN_PKG_LIMIT = 6 * MiB
const SUB_PKG_LIMIT = 6 * MiB
const TOTAL_LIMIT = 30 * MiB

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return args
}

function walkFiles(dir, excludeDirs = []) {
  const result = []
  if (!fs.existsSync(dir)) return result
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && excludeDirs.includes(entry.name)) continue
    if (entry.isFile() && entry.name === '.DS_Store') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...walkFiles(full, excludeDirs))
    else result.push(full)
  }
  return result
}

function dirSize(dir, excludeDirs = []) {
  return walkFiles(dir, excludeDirs).reduce((sum, file) => sum + fs.statSync(file).size, 0)
}

function toMiB(bytes) {
  return Math.round((bytes / MiB) * 100) / 100
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function stripJsComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/(^|\n)[ \t]*\*[^\n]*/g, '$1')
}

function readPngSize(file) {
  const buffer = fs.readFileSync(file)
  if (buffer.length < 24 || buffer.readUInt32BE(12) !== 0x49484452) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function normalizeSuspiciousSource(content) {
  let normalized = content
    .replace(/\?\.\s*\[\s*(['"])([A-Za-z_$][\w$]*)\1\s*\]/g, '.$2')
    .replace(/\[\s*(['"])([A-Za-z_$][\w$]*)\1\s*\]/g, '.$2')
  let previous = ''
  while (previous !== normalized) {
    previous = normalized
    normalized = normalized.replace(
      /(['"])((?:\\.|(?!\1).)*)\1\s*\+\s*(['"])((?:\\.|(?!\3).)*)\3/g,
      '$1$2$4$1'
    )
  }
  return normalized
}

function readManifest() {
  const historyPath = path.join(DEVKIT_DIR, 'template-manifest-history.json')
  if (fs.existsSync(historyPath)) {
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'))
    const selected = manifestVersion ? history[manifestVersion] : null
    if (selected) return selected
    if (manifestVersion) throw new Error(`当前 Skill 不包含模板版本 ${manifestVersion} 的哈希清单`)
  }

  const manifestPath = path.join(DEVKIT_DIR, 'template-manifest.json')
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!data || data.version !== manifestVersion) {
    throw new Error(`template-manifest.json 版本不匹配：${data?.version} != ${manifestVersion}`)
  }
  return data
}

const { dir: gameDir } = parseArgs(process.argv.slice(2))
const errors = []
const warnings = []

if (!gameDir) {
  console.log(JSON.stringify({ passed: false, errors: [{ rule: 'ARGS', message: '用法：node validate-package.mjs --dir <GAME_DIR>' }], warnings: [] }))
  process.exit(1)
}

const packageDir = path.join(path.resolve(gameDir), 'package')
const projectConfigPath = path.join(packageDir, 'project.config.json')
let manifestVersion = null
if (fs.existsSync(projectConfigPath)) {
  try {
    manifestVersion = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8')).aigc_skill_version || null
  } catch {}
}

// ── 结构与体积 ──────────────────────────────────────────────────────────────
const REQUIRED_FILES = ['game.js', 'game.json', 'project.config.json', 'kwaiadapter.js']
for (const file of REQUIRED_FILES) {
  if (!fs.existsSync(path.join(packageDir, file))) {
    errors.push({ rule: 'STRUCTURE_REQUIRED_FILES', message: `缺少必备文件：${file}` })
  }
}

const forbiddenNames = new Set(['node_modules', '.git', 'tmp'])
for (const file of walkFiles(packageDir)) {
  const rel = path.relative(packageDir, file)
  const parts = rel.split(path.sep)
  if (parts.some((part) => forbiddenNames.has(part) || part.startsWith('.'))) {
    errors.push({ rule: 'STRUCTURE_FORBIDDEN_ENTRY', message: `包内不应包含：${rel}` })
  }
  if (file.endsWith('.map')) {
    errors.push({ rule: 'STRUCTURE_FORBIDDEN_ENTRY', message: `包内不应包含 sourcemap 文件：${rel}` })
  }
}

let subpackages = []
const gameJsonPath = path.join(packageDir, 'game.json')
if (fs.existsSync(gameJsonPath)) {
  try {
    const gameJson = JSON.parse(fs.readFileSync(gameJsonPath, 'utf8'))
    subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : []
    const names = new Set()
    const roots = []
    for (const sub of subpackages) {
      if (!sub.name || !sub.root) {
        errors.push({ rule: 'SUBPACKAGE_CONFIG', message: `分包缺少 name/root：${JSON.stringify(sub)}` })
        continue
      }
      if (!/^[a-z0-9_-]+$/i.test(sub.name)) errors.push({ rule: 'SUBPACKAGE_CONFIG', message: `分包 name 非法：${sub.name}` })
      if (names.has(sub.name)) errors.push({ rule: 'SUBPACKAGE_CONFIG', message: `分包 name 重复：${sub.name}` })
      names.add(sub.name)
      if (!sub.root.endsWith('/')) errors.push({ rule: 'SUBPACKAGE_CONFIG', message: `分包 root 必须以 / 结尾：${sub.root}` })
      if (roots.some((root) => sub.root.startsWith(root) || root.startsWith(sub.root))) {
        errors.push({ rule: 'SUBPACKAGE_CONFIG', message: `分包 root 重叠：${sub.root}` })
      }
      roots.push(sub.root)
      if (!fs.existsSync(path.join(packageDir, sub.root, 'game.js'))) {
        errors.push({ rule: 'SUBPACKAGE_CONFIG', message: `分包入口不存在：${sub.root}game.js` })
      }
    }
  } catch (e) {
    errors.push({ rule: 'SUBPACKAGE_CONFIG', message: `game.json 解析失败：${e.message}` })
  }
} else {
  errors.push({ rule: 'SUBPACKAGE_CONFIG', message: 'game.json 不存在或不可读' })
}

const totalSize = dirSize(packageDir)
const yoolaAssetsSize = dirSize(path.join(packageDir, 'yoola-assets'))
const subpackagesSize = dirSize(path.join(packageDir, 'subpackages'))
const mainSize = totalSize - subpackagesSize - yoolaAssetsSize
const openPlatformSize = totalSize - yoolaAssetsSize
if (mainSize > MAIN_PKG_LIMIT) errors.push({ rule: 'SIZE_MAIN_PACKAGE', message: `主包体积超限：${toMiB(mainSize)} MiB` })
for (const sub of subpackages) {
  const size = dirSize(path.join(packageDir, sub.root))
  if (size > SUB_PKG_LIMIT) errors.push({ rule: 'SIZE_SUB_PACKAGE', message: `分包 ${sub.name} 体积超限：${toMiB(size)} MiB` })
}
if (openPlatformSize > TOTAL_LIMIT) errors.push({ rule: 'SIZE_TOTAL_PACKAGE', message: `总包体积超限：${toMiB(openPlatformSize)} MiB` })

// ── yoola 平台素材 ─────────────────────────────────────────────────────────
const yoolaAssetFields = ['icon', 'shareImage', 'loadingImage']
const yoolaAssetsDir = path.join(packageDir, 'yoola-assets')
const yoolaAssetsConfigPath = path.join(yoolaAssetsDir, 'yoola-assets.json')
let yoolaAssets = null
if (fs.existsSync(yoolaAssetsConfigPath)) {
  try {
    yoolaAssets = JSON.parse(fs.readFileSync(yoolaAssetsConfigPath, 'utf8'))
  } catch (e) {
    errors.push({ rule: 'YOOLA_ASSETS', message: `yoola-assets.json 解析失败：${e.message}` })
  }
} else {
  errors.push({ rule: 'YOOLA_ASSETS', message: '缺少 package/yoola-assets/yoola-assets.json' })
}
if (yoolaAssets) {
  const gameJson = fs.existsSync(gameJsonPath)
    ? JSON.parse(fs.readFileSync(gameJsonPath, 'utf8'))
    : {}
  const expectedLoadingSize = gameJson.deviceOrientation === 'landscape'
    ? { width: 1400, height: 640 }
    : { width: 640, height: 1400 }
  for (const field of yoolaAssetFields) {
    const value = yoolaAssets[field]
    if (typeof value !== 'string' || !value.trim()) {
      errors.push({ rule: 'YOOLA_ASSETS', message: `yoola-assets.json 缺少字段：${field}` })
      continue
    }
    if (path.isAbsolute(value) || value.includes('..') || !/^[a-z0-9][a-z0-9._-]*$/i.test(value)) {
      errors.push({ rule: 'YOOLA_ASSETS', message: `${field} 必须是 yoola-assets/ 内的安全相对文件名：${value}` })
      continue
    }
    if (!fs.existsSync(path.join(yoolaAssetsDir, value))) {
      errors.push({ rule: 'YOOLA_ASSETS', message: `${field} 对应素材不存在：yoola-assets/${value}` })
      continue
    }
    const file = path.join(yoolaAssetsDir, value)
    if (path.extname(value).toLowerCase() !== '.png') {
      errors.push({ rule: 'YOOLA_ASSETS', message: `${field} 必须为 PNG 格式：${value}` })
      continue
    }
    const size = readPngSize(file)
    const bytes = fs.statSync(file).size
    if (!size) {
      errors.push({ rule: 'YOOLA_ASSETS', message: `${field} 不是有效 PNG 文件：${value}` })
      continue
    }
    const expected = field === 'icon'
      ? { width: 220, height: 220 }
      : field === 'shareImage'
        ? { width: 510, height: 350 }
        : expectedLoadingSize
    if (size.width !== expected.width || size.height !== expected.height) {
      errors.push({ rule: 'YOOLA_ASSETS', message: `${field} 尺寸必须为 ${expected.width} × ${expected.height}，实际 ${size.width} × ${size.height}` })
    }
    const sizeLimit = field === 'shareImage' ? 10 * MiB : field === 'loadingImage' ? MiB : Infinity
    if (bytes > sizeLimit) {
      errors.push({ rule: 'YOOLA_ASSETS', message: `${field} 体积超过 ${toMiB(sizeLimit)} MiB：${toMiB(bytes)} MiB` })
    }
  }
}

// ── 脚手架哈希校验与全量扫描范围 ───────────────────────────────────────────
let exemptFiles = new Set()
try {
  const manifest = readManifest()
  for (const [rel, expectedHash] of Object.entries(manifest.files || {})) {
    const file = path.join(packageDir, rel)
    if (!fs.existsSync(file) || sha256(file) !== expectedHash) {
      warnings.push({ rule: 'TEMPLATE_MODIFIED', message: `脚手架锁定文件被修改或缺失，将按业务代码扫描：${rel}` })
    } else {
      exemptFiles.add(rel)
    }
  }
} catch (e) {
  warnings.push({ rule: 'TEMPLATE_MANIFEST', message: `无法读取模板哈希清单，按全量扫描处理：${e.message}` })
}

const contentFiles = walkFiles(packageDir).filter((file) => {
  const rel = path.relative(packageDir, file)
  if (!/\.(js|html)$/i.test(file)) return false
  return rel === 'index.html' || !exemptFiles.has(rel)
})

// 仅允许脚手架 H5 预览入口 index.html；禁止新增 HTML 与 CSS 文件。
for (const file of walkFiles(packageDir)) {
  const rel = path.relative(packageDir, file)
  if ((file.endsWith('.html') && rel !== 'index.html') || file.endsWith('.css')) {
    errors.push({ rule: 'HTML_CSS_FORBIDDEN', message: `禁止新增 HTML/CSS 文件：${rel}` })
  }
}

// ── 网络请求（ERROR）──────────────────────────────────────────────────────
const networkPatterns = [
  [/\bfetch\s*\(/, 'fetch'],
  [/\b(?:window|globalThis|self)\s*\.\s*fetch\b/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\baxios\b/, 'axios'],
  [/\bnew\s+WebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\s*\(/, 'sendBeacon'],
  [/\bks\.(request|connectSocket|uploadFile|downloadFile)\s*\(/, 'ks network API'],
  [/\bwx\.(request|connectSocket|uploadFile|downloadFile)\s*\(/, 'wx network API'],
  [/\b(?:window|globalThis|self)\s*\.\s*(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/, 'global network API'],
  [/\b(?:globalThis|window|self)\s*\.\s*wx\b/, 'wx network API'],
  [/\b(?:globalThis|window|self)\s*\.[\w$]+\s*\.\s*(?:request|uploadFile|downloadFile|connectSocket)\b/, 'global network API']
]

// ── 外部资源（ERROR）──────────────────────────────────────────────────────
const absoluteUrlPattern = /https?:\/\/|wss?:\/\/|ftp:\/\/|^\s*\/\//i
const obfuscatedUrlPatterns = [
  [/\b(?:https?|wss?|ftp)\b\s*\+\s*['"]\s*(?::\/\/|\/\/)/i, '分片协议'],
  [/\b(?:https?|wss?|ftp)\b\s*\+/, '外部地址协议拼接'],
  [/['"]\s*(?::\/\/|\/\/)/i, '主机 + 路径拼接'],
  [/['"]\s*\/\/\s*['"]\s*\+/, '协议无关外部地址拼接']
]

// ── DOM / CSS / HTML（ERROR）──────────────────────────────────────────────
const domPatterns = [
  [/\bdocument\.(createElement|querySelector|querySelectorAll)\s*\(/, 'document DOM API'],
  [/\b(innerHTML|outerHTML|insertAdjacentHTML)\b/, 'HTML API'],
  [/\b(appendChild|removeChild|classList)\b/, 'DOM API'],
  [/\bstyle\.(display|width|height|background)\b/, 'CSS API'],
  [/<(div|button|span|style)\b/i, 'HTML 标签']
]

// ── 平台运行时约束（ERROR）────────────────────────────────────────────────
const directImagePattern = /\bnew\s+Image\s*\(/i
const barePlatformCallPattern = /\bks\s*\.\s*[A-Za-z_$][\w$]*\s*\(/i
const requireCallPattern = /\brequire\s*\(\s*['"`]/i

for (const file of contentFiles) {
  const rel = path.relative(packageDir, file)
  const content = fs.readFileSync(file, 'utf8')
  const codeContent = stripJsComments(content)
  const normalizedContent = normalizeSuspiciousSource(content)
  for (const [pattern, name] of networkPatterns) {
    if (pattern.test(normalizedContent)) errors.push({ rule: 'NETWORK', message: `${rel} 检测到网络请求：${name}` })
  }
  if (absoluteUrlPattern.test(normalizedContent)) errors.push({ rule: 'RESOURCE_NO_ABSOLUTE_URL', message: `${rel} 检测到绝对 URL，资源必须使用包内相对路径` })
  for (const [pattern, name] of obfuscatedUrlPatterns) {
    if (pattern.test(normalizedContent)) errors.push({ rule: 'EXTERNAL_URL_CONCATENATION', message: `${rel} 检测到外部资源地址拼接：${name}` })
  }
  if (rel !== 'index.html') {
    for (const [pattern, name] of domPatterns) {
      if (pattern.test(content)) errors.push({ rule: 'DOM_CSS_HTML', message: `${rel} 检测到禁止的 ${name}` })
    }
  }
  const isBusinessJsFile = file.endsWith('.js') && !exemptFiles.has(rel)
  if (isBusinessJsFile) {
    if (directImagePattern.test(codeContent)) {
      errors.push({ rule: 'DIRECT_IMAGE_FORBIDDEN', message: `${rel} 检测到禁止的 new Image，必须使用 KwaiRender.loadImage / KwaiMedia.Image` })
    }
    if (barePlatformCallPattern.test(codeContent)) {
      errors.push({ rule: 'PLATFORM_API_NOT_ENCAPSULATED', message: `${rel} 检测到裸 ks.* API，必须通过 kwaiOpenApi/kwai-*.js 封装层调用` })
    }
    if (rel !== 'game.js' && requireCallPattern.test(codeContent)) {
      errors.push({ rule: 'REQUIRE_USAGE_POSITION', message: `${rel} 检测到 require，快手侧 require 只能写在 game.js` })
    }
  }
}

// resource-manifest 必须保持空对象；真实映射由平台上传阶段注入。
const resourceManifestPath = path.join(packageDir, 'kwaiStandard', 'loaders', 'resource-manifest.js')
if (fs.existsSync(resourceManifestPath)) {
  const content = fs.readFileSync(resourceManifestPath, 'utf8')
  if (!/window\.AIGCResourceManifest\s*=\s*\{\s*\}/.test(content)) {
    errors.push({ rule: 'RESOURCE_MANIFEST_UNTOUCHED', message: 'resource-manifest.js 必须保持空对象，映射由平台上传阶段注入' })
  }
}

// ── 配置与广告位占位符（WARN）────────────────────────────────────────────
if (fs.existsSync(projectConfigPath)) {
  const content = fs.readFileSync(projectConfigPath, 'utf8')
  if (content.includes('<APPID>') || content.includes('kwai_game_test_appid')) {
    warnings.push({ rule: 'CONFIG', message: 'project.config.json 中 appid 为占位符/测试值，上传前需平台替换' })
  }
}
const adConfigPath = path.join(packageDir, 'kwaiStandard', 'core', 'kwai-ad-config.js')
if (fs.existsSync(adConfigPath) && /__\w+_AD_UNIT_ID__/.test(fs.readFileSync(adConfigPath, 'utf8'))) {
  warnings.push({ rule: 'AD_PLACEHOLDER_LEFTOVER', message: '广告位 ID 为占位符，上传阶段自动替换' })
}

// ── 资源规范（WARN）──────────────────────────────────────────────────────
const resourceRoots = [path.join(packageDir, 'res'), path.join(packageDir, 'subpackages')]
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$/
for (const root of resourceRoots) {
  for (const file of walkFiles(root)) {
    const rel = path.relative(packageDir, file)
    if (file.endsWith('.js')) continue
    const name = path.basename(file)
    const ext = path.extname(file).slice(1).toLowerCase()
    const type = {
      png: 'Image', jpg: 'Image', jpeg: 'Image', webp: 'Image', gif: 'Image',
      mp3: 'Audio', wav: 'Audio', ogg: 'Audio',
      mp4: 'Video', webm: 'Video'
    }[ext]
    if (!namePattern.test(name)) warnings.push({ rule: 'RESOURCE_NAMING', message: `${rel} 命名不符合小写-连字符规范` })
    if (name.length > 60) warnings.push({ rule: 'RESOURCE_NAMING', message: `${rel} 文件名超过 60 字符` })
    if (type && !rel.split(path.sep).includes(type)) {
      warnings.push({ rule: 'RESOURCE_PATH_TYPE', message: `${rel} 应放入 ${type}/ 目录` })
    }
    const expectedDir = type || (rel.startsWith(`res${path.sep}spine${path.sep}`) ? 'spine' : null)
    if (expectedDir && !rel.split(path.sep).includes(expectedDir)) {
      warnings.push({ rule: 'RESOURCE_PATH_MAIN', message: `${rel} 未放入规范资源目录` })
    }
  }
}

const passed = errors.length === 0
console.log(JSON.stringify({ passed, errors, warnings }, null, 2))
process.exit(passed ? 0 : 1)

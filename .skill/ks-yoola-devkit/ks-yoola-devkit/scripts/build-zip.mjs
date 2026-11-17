#!/usr/bin/env node
/**
 * build-zip.mjs — 本地交付 zip 打包
 *
 * 用法：node build-zip.mjs --dir <GAME_DIR> [--out <输出路径>]
 * 输出：stdout JSON { success, output, fileCount, sizeMiB }
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const VALID_FILE_EXTENSION_SUFFIX_LIST = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'js', 'json', 'cer', 'obj',
  'dae', 'fbx', 'mtl', 'stl', '3ds', 'mp3', 'pvr', 'wav', 'plist', 'ttf',
  'fnt', 'gz', 'ccz', 'm4a', 'mp4', 'bmp', 'atlas', 'swf', 'ani', 'part',
  'proto', 'bin', 'sk', 'mipmaps', 'txt', 'zip', 'tt', 'map', 'ogg', 'silk',
  'dbbin', 'dbmv', 'etc', 'lmat', 'lm', 'ls', 'lh', 'lani', 'lav', 'lsani',
  'ltc', 'aac', 'astc', 'br', 'csv', 'cur', 'dat', 'dds', 'glb', 'gltf',
  'ico', 'ktx', 'lmani', 'lml', 'pkm', 'prefab', 'scene', 'skel', 'wasm',
  'xml', 'ltcb', 'data', 'tmx'
]

const EXCLUDE_PATTERNS = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)tmp\//,
  /(^|\/)\.[^/]+\//,
  /(^|\/)\.[^/]+$/,
  /\.map$/i,
  /\.md$/i,
  /\.(zip|tar|gz|tgz|log)$/i,
  /(^|\/)(build|test|tests)(\/|$)/i
]

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

function fail(message) {
  console.log(JSON.stringify({ success: false, error: message }))
  process.exit(1)
}

function walkFiles(dir) {
  const result = []
  if (!fs.existsSync(dir)) return result
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...walkFiles(full))
    else if (entry.isFile()) result.push(full)
  }
  return result
}

function toZipPath(filePath) {
  return filePath.split(path.sep).join('/').replace(/^\.\//, '')
}

function isAllowed(relPath) {
  const normalized = toZipPath(relPath)
  const ext = path.posix.extname(normalized).slice(1).toLowerCase()
  if (normalized === 'index.html') return true
  if (ext === 'html' || ext === 'css') return false
  return VALID_FILE_EXTENSION_SUFFIX_LIST.includes(ext)
}

function isExcluded(relPath) {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(toZipPath(relPath)))
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980)
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

function createZip(entries) {
  const localHeaders = []
  const centralHeaders = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = fs.readFileSync(entry.file)
    const compressed = zlib.deflateRawSync(data)
    const crc = crc32(data)
    const dos = dosDateTime(fs.statSync(entry.file).mtime)
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(dos.time, 10)
    local.writeUInt16LE(dos.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    name.copy(local, 30)
    localHeaders.push(local, compressed)

    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(dos.time, 12)
    central.writeUInt16LE(dos.date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)
    centralHeaders.push(central)
    offset += local.length + compressed.length
  }

  const centralDirectory = Buffer.concat(centralHeaders)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localHeaders, centralDirectory, end])
}

const { dir: gameDir, out: outArg } = parseArgs(process.argv.slice(2))
if (!gameDir) fail('用法：node build-zip.mjs --dir <GAME_DIR> [--out <输出路径>]')

const resolvedGameDir = path.resolve(gameDir)
const packageDir = path.join(resolvedGameDir, 'package')
if (!fs.existsSync(packageDir)) fail(`未找到项目包目录：${packageDir}`)

const contextFile = path.join(resolvedGameDir, 'aigc-context.json')
let gameName = path.basename(resolvedGameDir)
if (fs.existsSync(contextFile)) {
  try {
    gameName = JSON.parse(fs.readFileSync(contextFile, 'utf8')).gameName || gameName
  } catch {}
}

const outputPath = outArg ? path.resolve(outArg) : path.join(resolvedGameDir, `${gameName}.zip`)
if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)

const allFiles = walkFiles(packageDir)
const allowedFiles = allFiles.filter((file) => isAllowed(path.relative(packageDir, file)))
const selectedFiles = allowedFiles.filter((file) => !isExcluded(path.relative(packageDir, file)))
if (allowedFiles.length === 0) fail('允许清单未命中任何文件，打包已终止')
if (selectedFiles.length === 0) fail('排除清单命中了全部允许文件，打包已终止')

const entries = selectedFiles
  .map((file) => ({ file, name: toZipPath(path.relative(packageDir, file)) }))
  .sort((a, b) => a.name.localeCompare(b.name))
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, createZip(entries))

console.log(JSON.stringify({
  success: true,
  output: outputPath,
  fileCount: selectedFiles.length,
  sizeMiB: Math.round((fs.statSync(outputPath).size / (1024 * 1024)) * 100) / 100
}))

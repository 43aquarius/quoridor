#!/usr/bin/env node
/**
 * scaffold-preview.mjs — 本地 H5 预览（浏览器，ks API mock）
 *
 * 用法：node scaffold-preview.mjs --dir <GAME_DIR> [--port 8080]
 *
 * 职责：
 *   以 <GAME_DIR>/package/ 为根启动一个本地静态文件服务器，
 *   自动打开浏览器访问 index.html，用于快速验证渲染与交互逻辑
 *   （不校验包大小）。
 *
 * 输出：stdout JSON { success, url, port }，Ctrl+C 结束
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { exec } from 'node:child_process'

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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg'
}

const { dir: gameDir, port: portArg } = parseArgs(process.argv.slice(2))

if (!gameDir) {
  fail('用法：node scaffold-preview.mjs --dir <GAME_DIR> [--port 8080]')
}

const rootDir = path.join(path.resolve(gameDir), 'package')

if (!fs.existsSync(path.join(rootDir, 'index.html'))) {
  fail(`未找到 index.html，确认已执行 scaffold-init：${rootDir}`)
}

const port = Number(portArg) || 8080

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0])
  if (reqPath === '/') reqPath = '/index.html'
  const filePath = path.join(rootDir, reqPath)

  if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  })
})

server.listen(port, () => {
  const url = `http://localhost:${port}/index.html`
  console.log(JSON.stringify({ success: true, url, port }))
  if (process.env.NO_OPEN !== '1') {
    const openCommand = process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `cmd /c start "" "${url}"`
        : `xdg-open "${url}"`
    exec(openCommand, () => {})
  }
})

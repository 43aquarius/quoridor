# 文件系统模块

## 文件

`kwaiOpenApi/kwai-file.js`（脚手架阶段已复制，无需手动操作）

## require 路径

```js
require('./kwaiOpenApi/kwai-file.js');
```

## 调用方式

```js
// 用户数据根目录
var root = KwaiFile.userDataPath; // ks.env.USER_DATA_PATH

// 读文件（同步）
var content = KwaiFile.readSync(root + '/save.json', 'utf8');

// 写文件（同步）
KwaiFile.writeSync(root + '/save.json', JSON.stringify(data), 'utf8');

// 追加内容（同步）
KwaiFile.appendSync(root + '/log.txt', '\nnew line', 'utf8');

// 判断文件是否存在
var exists = KwaiFile.existsSync(root + '/save.json');

// 创建目录
KwaiFile.mkdirSync(root + '/saves', true);

// 读取目录列表
var files = KwaiFile.readdirSync(root + '/saves');

// 删除文件
KwaiFile.removeSync(root + '/old.json');

// 保存临时文件到用户目录（异步）
KwaiFile.saveFile({
  tempPath:  res.tempFilePath,
  onSuccess: function (savedPath) { console.log('已保存', savedPath); },
  onFail:    function (err) { console.warn(err); },
});
```

## 注意事项

- 所有持久化文件须存放在 `ks.env.USER_DATA_PATH` 目录下
- 单 key 数据上限 1MB，总存储上限 10MB
- 无 DOM 文件 API（`FileReader` / `Blob`），必须用 `ks.getFileSystemManager`

## 快手 API 参考

> 优先参考已生成的 JS 文件调用方式（见上方「调用方式」）。如需查阅底层 API 详细参数，按需路由到以下文档：

- `ks.getFileSystemManager` → `FileSystemManager`（`readFileSync` / `writeFileSync` / `appendFileSync` / `unlinkSync` / `accessSync` / `mkdirSync` / `readdirSync` / `saveFile`）→ [file.md](file.md)

---

## 底层 API 参考

## 概述

通过 `ks.getFileSystemManager` 获取全局唯一的文件管理器 `FileSystemManager`，用于读写本地文件、创建/删除目录、复制/移动/重命名文件、解压 zip 包等操作。`Stats` 对象描述文件状态（大小、修改时间、是否目录/文件）。

> ⚠️ **存储路径**：用户数据目录为 `ks.env.USER_DATA_PATH`，所有持久化文件应存放在此目录下。临时文件（如 `ks.downloadFile` / `ks.chooseImage` 返回的 `tempFilePath`）需通过 `saveFile` 保存到用户目录后才能持久化。

> ⚠️ **存储限制**：本地文件存储上限 **10MB**，超出会触发 `fail the maximum size of the file storage limit is exceeded`。

> ⚠️ **无 DOM 文件 API**：运行环境不提供 `FileReader` / `FileWriter` / `Blob` 等 Web API，必须用 `FileSystemManager` 系列 API。

> ⚠️ **异步 vs 同步**：每个操作均有异步回调版本（`success` / `fail` / `complete`）和同步版本（`Sync` 后缀，直接返回结果或抛异常）。同步版本会阻塞 JS 线程，大文件操作建议用异步。

---

## ks.getFileSystemManager — 获取文件管理器

### 概述

获取全局唯一的文件管理器 `FileSystemManager` 实例。

### 参数

无参数。

### 返回值

| 类型 | 说明 |
|------|------|
| `FileSystemManager` | 文件管理器实例 |

### 标准调用示例

```ts
const fs = ks.getFileSystemManager();
// 后续所有文件操作都通过 fs 调用
```

---

## FileSystemManager 对象

`ks.getFileSystemManager` 返回的全局唯一实例，包含文件/目录操作的全部方法。

### 方法清单

| 方法 | 说明 |
|------|------|
| `access(opts)` / `accessSync(path)` | 判断文件/目录是否存在 |
| `appendFile(opts)` / `appendFileSync(filePath, data, encoding?)` | 在文件结尾追加内容 |
| `copyFile(opts)` / `copyFileSync(srcPath, destPath)` | 复制文件 |
| `getFileInfo(opts)` | 获取本地文件信息（返回 size）|
| `mkdir(opts)` / `mkdirSync(dirPath, recursive?)` | 创建目录 |
| `readdir(opts)` / `readdirSync(dirPath)` | 读取目录内文件列表 |
| `readFile(opts)` / `readFileSync(filePath, encoding?, position?, length?)` | 读取本地文件内容 |
| `rename(opts)` / `renameSync(oldPath, newPath)` | 重命名/移动文件 |
| `rmdir(opts)` / `rmdirSync(dirPath, recursive?)` | 删除目录 |
| `saveFile(opts)` / `saveFileSync(tempFilePath, filePath?)` | 保存临时文件到本地 |
| `stat(opts)` / `statSync(path, recursive?)` | 获取文件 Stats 对象 |
| `unlink(opts)` / `unlinkSync(filePath)` | 删除文件 |
| `unzip(opts)` | 解压 zip 文件 |
| `writeFile(opts)` / `writeFileSync(filePath, data, encoding?)` | 写文件 |

### encoding 合法值（多个 API 共用）

| 值 | 说明 |
|----|------|
| `base64` | base64 编码 |
| `binary` | 二进制 |
| `utf-8` / `utf8` | UTF-8 编码 |

> 💡 `readFile` 不传 `encoding` 时返回 `ArrayBuffer`（二进制）；传 `utf8` 返回字符串。

---

## 文件判断

### FileSystemManager.access — 判断文件/目录是否存在

```ts
fs.access({
  path: `${ks.env.USER_DATA_PATH}/save/data.json`,
  success() {
    console.log('文件存在');
  },
  fail(err) {
    console.log('文件不存在:', err.errMsg);
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| path | `string` | - | 是 | 要判断是否存在的文件/目录路径 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**fail 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| errMsg | `string` | 错误信息，如 `fail no such file or directory ${path}` |

### FileSystemManager.accessSync — 同步判断文件/目录是否存在

```ts
try {
  fs.accessSync(`${ks.env.USER_DATA_PATH}/save/data.json`);
  console.log('文件存在');
} catch (e) {
  console.log('文件不存在:', e.errMsg);
}
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | `string` | 是 | 要判断是否存在的文件/目录路径 |

> ⚠️ 同步版本：存在则正常返回，不存在则抛异常。**必须 `try/catch`**。

---

## 文件读取

### FileSystemManager.readFile — 读取本地文件内容

```ts
fs.readFile({
  filePath: `${ks.env.USER_DATA_PATH}/save/data.json`,
  encoding: 'utf8',
  success(res) {
    console.log('文件内容:', res.data);
  },
  fail(err) {
    console.error('读取失败:', err.errMsg);
  },
});

// 读取二进制（不传 encoding）
fs.readFile({
  filePath: `${ks.env.USER_DATA_PATH}/assets/texture.bin`,
  success(res) {
    const buffer = res.data;  // ArrayBuffer
    console.log('字节数:', buffer.byteLength);
  },
});

// 读取部分内容（position + length）
fs.readFile({
  filePath: `${ks.env.USER_DATA_PATH}/bigfile.dat`,
  position: 1024,  // 从 1KB 处开始读
  length: 512,     // 读 512 字节
  success(res) {
    console.log('partial data:', res.data);
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| filePath | `string` | - | 是 | 要读取的文件路径 |
| encoding | `string` | - | 否 | 指定读取文件的字符编码，不传则以 `ArrayBuffer` 格式读取二进制 |
| position | `number` | - | 否 | 从文件指定位置开始读，范围 `[0, fileLength-1]`，单位 byte |
| length | `number` | - | 否 | 读取的长度，范围 `[1, fileLength]`，不传则读到文件末尾 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**success 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| data | `string` / `ArrayBuffer` | 文件内容。传 `encoding` 时为字符串，不传时为 `ArrayBuffer` |

> ⚠️ 官方文档将此字段标为 `stats`（疑似文档错误），实际返回的是 `data` 字段。请以实际返回为准。

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail no such file or directory, open ${filePath}` | 指定文件所在目录不存在 |
| `fail permission denied, open ${dirPath}` | 没有读权限 |

### FileSystemManager.readFileSync — 同步读取文件

```ts
try {
  // 读字符串
  const text = fs.readFileSync(`${ks.env.USER_DATA_PATH}/save/data.json`, 'utf8');
  console.log('内容:', text);

  // 读二进制（不传 encoding）
  const buffer = fs.readFileSync(`${ks.env.USER_DATA_PATH}/assets/texture.bin`);
  console.log('字节数:', buffer.byteLength);

  // 读部分内容
  const partial = fs.readFileSync(
    `${ks.env.USER_DATA_PATH}/bigfile.dat`,
    undefined,
    1024,  // position
    512    // length
  );
} catch (e) {
  console.error('读取失败:', e.errMsg);
}
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filePath | `string` | 是 | 要读取的文件路径 |
| encoding | `string` | 否 | 字符编码，不传返回 `ArrayBuffer` |
| position | `number` | 否 | 开始读取位置 |
| length | `number` | 否 | 读取长度 |

### 返回值

| 类型 | 说明 |
|------|------|
| `string` / `ArrayBuffer` | 文件内容 |

> ⚠️ **必须 `try/catch`**，失败时抛异常。

---

## 文件写入

### FileSystemManager.writeFile — 写文件

> ⚠️ **覆盖写**：会清空原文件内容后写入，不保留原内容。要追加用 `appendFile`。

```ts
fs.writeFile({
  filePath: `${ks.env.USER_DATA_PATH}/save/data.json`,
  data: JSON.stringify({ level: 5, score: 1200 }),
  encoding: 'utf8',
  success() {
    console.log('写入成功');
  },
  fail(err) {
    console.error('写入失败:', err.errMsg);
  },
});

// 写二进制
const buffer = new ArrayBuffer(8);
const view = new DataView(buffer);
view.setFloat32(0, 1.5);
view.setFloat32(4, 2.5);
fs.writeFile({
  filePath: `${ks.env.USER_DATA_PATH}/data.bin`,
  data: buffer,
  success() {
    console.log('二进制写入成功');
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| filePath | `string` | - | 是 | 要写入的文件路径 |
| data | `string` / `ArrayBuffer` | - | 是 | 要写入的文本或二进制数据 |
| encoding | `string` | `utf8` | 否 | 指定写入文件的字符编码 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数（成功/失败均执行）|

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail no such file or directory, open ${filePath}` | 文件所在目录不存在 |
| `fail permission denied, open ${dirPath}` | 没有写权限 |
| `fail the maximum size of the file storage limit is exceeded` | 存储空间不足 |

### FileSystemManager.writeFileSync — 同步写文件

```ts
try {
  fs.writeFileSync(
    `${ks.env.USER_DATA_PATH}/save/data.json`,
    JSON.stringify({ level: 5, score: 1200 }),
    'utf8'
  );
  console.log('写入成功');
} catch (e) {
  console.error('写入失败:', e.errMsg);
}
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filePath | `string` | 是 | 要写入的文件路径 |
| data | `string` / `ArrayBuffer` | 是 | 要写入的数据 |
| encoding | `string` | 否 | 字符编码，默认 `utf8` |

> ⚠️ **必须 `try/catch`**。同步版本会阻塞 JS 线程，大文件写入建议用异步。

### FileSystemManager.appendFile — 追加文件内容

> ⚠️ 文件不存在时会**报错**（不会自动创建），需先用 `writeFile` 创建。

```ts
fs.appendFile({
  filePath: `${ks.env.USER_DATA_PATH}/logs/game.log`,
  data: `[${new Date().toISOString()}] player died\n`,
  encoding: 'utf8',
  success() {
    console.log('追加成功');
  },
  fail(err) {
    console.error('追加失败:', err.errMsg);
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| filePath | `string` | - | 是 | 要追加内容的文件路径 |
| data | `string` / `ArrayBuffer` | - | 是 | 要追加的文本或二进制数据 |
| encoding | `string` | `utf8` | 否 | 字符编码 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail no such file or directory, open ${filePath}` | 文件不存在 |
| `fail illegal operation on a directory, open "${filePath}"` | filePath 是目录 |
| `fail permission denied, open ${dirPath}` | 没有写权限 |

### FileSystemManager.appendFileSync — 同步追加

```ts
try {
  fs.appendFileSync(
    `${ks.env.USER_DATA_PATH}/logs/game.log`,
    `[${new Date().toISOString()}] player died\n`,
    'utf8'
  );
} catch (e) {
  console.error('追加失败:', e.errMsg);
}
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filePath | `string` | 是 | 要追加内容的文件路径 |
| data | `string` / `ArrayBuffer` | 是 | 要追加的数据 |
| encoding | `string` | 否 | 字符编码，默认 `utf8` |

---

## 文件保存（临时 → 永久）

### FileSystemManager.saveFile — 保存临时文件到本地

> ⚠️ **移动语义**：此接口会**移动**临时文件，调用成功后 `tempFilePath` 将**不可用**。

```ts
// 下载文件到临时路径后保存到永久路径
const tempPath = await KwaiNetwork.downloadFile({ url: 'https://example.com/level.zip' });
fs.saveFile({
  tempFilePath: tempPath,
  filePath: `${ks.env.USER_DATA_PATH}/levels/level1.zip`,
  success(res) {
    console.log('已保存到:', res.savedFilePath);
  },
  fail(err) {
    console.error('保存失败:', err.errMsg);
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| tempFilePath | `string` | - | 是 | 临时存储文件路径（如 `downloadFile` / `chooseImage` 返回的）|
| filePath | `string` | - | 否 | 要存储的文件路径，不传则自动生成 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**success 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| savedFilePath | `string` | 存储后的文件路径 |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail tempFilePath file not exist` | 临时文件不存在 |
| `fail permission denied, open "${filePath}"` | 没有写权限 |
| `fail no such file or directory "${dirPath}"` | 上级目录不存在 |
| `fail the maximum size of the file storage limit is exceeded` | 存储空间不足 |

### FileSystemManager.saveFileSync — 同步保存

```ts
try {
  const savedPath = fs.saveFileSync(tempPath, `${ks.env.USER_DATA_PATH}/levels/level1.zip`);
  console.log('已保存到:', savedPath);
} catch (e) {
  console.error('保存失败:', e.errMsg);
}
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tempFilePath | `string` | 是 | 临时文件路径 |
| filePath | `string` | 否 | 要存储的文件路径 |

### 返回值

| 类型 | 说明 |
|------|------|
| `string` | 存储后的文件路径 |

---

## 文件复制 / 移动 / 删除

### FileSystemManager.copyFile — 复制文件

```ts
fs.copyFile({
  srcPath: `${ks.env.USER_DATA_PATH}/save/backup.json`,
  destPath: `${ks.env.USER_DATA_PATH}/save/backup_${Date.now()}.json`,
  success() {
    console.log('复制成功');
  },
  fail(err) {
    console.error('复制失败:', err.errMsg);
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| srcPath | `string` | - | 是 | 源文件路径 |
| destPath | `string` | - | 是 | 目标文件路径 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail permission denied, copyFile ${srcPath} > ${destPath}` | 没有写权限 |
| `fail no such file or directory, copyFile ${srcPath} > ${destPath}` | 源文件不存在或目标上层目录不存在 |
| `fail the maximum size of the file storage limit is exceeded` | 存储空间不足 |

### FileSystemManager.copyFileSync — 同步复制

```ts
try {
  fs.copyFileSync(srcPath, destPath);
} catch (e) {
  console.error('复制失败:', e.errMsg);
}
```

### FileSystemManager.rename — 重命名 / 移动文件

> 💡 `rename` 可以把文件从 `oldPath` **移动**到 `newPath`（跨目录移动）。

```ts
fs.rename({
  oldPath: `${ks.env.USER_DATA_PATH}/temp/level.zip`,
  newPath: `${ks.env.USER_DATA_PATH}/levels/level1.zip`,
  success() {
    console.log('移动成功');
  },
  fail(err) {
    console.error('移动失败:', err.errMsg);
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| oldPath | `string` | - | 是 | 源文件路径 |
| newPath | `string` | - | 是 | 新文件路径 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail permission denied, rename ${oldPath} > ${newPath}` | 没有写权限 |
| `fail no such file or directory, rename ${oldPath} > ${newPath}` | 源文件不存在或目标上层目录不存在 |

### FileSystemManager.renameSync — 同步重命名

```ts
try {
  fs.renameSync(oldPath, newPath);
} catch (e) {
  console.error('重命名失败:', e.errMsg);
}
```

### FileSystemManager.unlink — 删除文件

```ts
fs.unlink({
  filePath: `${ks.env.USER_DATA_PATH}/temp/old.zip`,
  success() {
    console.log('删除成功');
  },
  fail(err) {
    console.error('删除失败:', err.errMsg);
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| filePath | `string` | - | 是 | 要删除的文件路径 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail no such file or directory, open ${filePath}` | 文件所在目录不存在 |
| `fail operation not permitted, unlink ${filePath}` | filePath 是目录（用 `rmdir`）|
| `fail permission denied, open ${dirPath}` | 没有读权限 |

### FileSystemManager.unlinkSync — 同步删除

```ts
try {
  fs.unlinkSync(filePath);
} catch (e) {
  console.error('删除失败:', e.errMsg);
}
```

---

## 目录操作

### FileSystemManager.mkdir — 创建目录

```ts
// 创建单层目录（上级目录必须存在）
fs.mkdir({
  dirPath: `${ks.env.USER_DATA_PATH}/save`,
  success() {
    console.log('目录创建成功');
  },
  fail(err) {
    console.error('创建失败:', err.errMsg);
  },
});

// 递归创建多层目录
fs.mkdir({
  dirPath: `${ks.env.USER_DATA_PATH}/save/level1/sub`,
  recursive: true,
  success() {
    console.log('递归创建成功');
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| dirPath | `string` | - | 是 | 创建的目录路径 |
| recursive | `boolean` | `false` | 否 | 是否递归创建上级目录，如 `a/b/c/d` 会依次创建 `a` → `a/b` → `a/b/c` → `a/b/c/d` |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail no such file or directory ${dirPath}` | 上级目录不存在（用 `recursive: true`）|
| `fail permission denied, open ${dirPath}` | 没有写权限 |
| `fail file already exists ${dirPath}` | 有同名文件或目录 |

### FileSystemManager.mkdirSync — 同步创建目录

```ts
try {
  fs.mkdirSync(`${ks.env.USER_DATA_PATH}/save`, true);  // recursive
} catch (e) {
  console.error('创建失败:', e.errMsg);
}
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| dirPath | `string` | 是 | 创建的目录路径 |
| recursive | `boolean` | 否 | 是否递归创建，默认 `false` |

### FileSystemManager.readdir — 读取目录内文件列表

```ts
fs.readdir({
  dirPath: `${ks.env.USER_DATA_PATH}/save`,
  success(res) {
    console.log('文件列表:', res.files);  // ['data.json', 'backup.json']
  },
  fail(err) {
    console.error('读取失败:', err.errMsg);
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| dirPath | `string` | - | 是 | 要读取的目录路径 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**success 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| files | `Array<string>` | 指定目录下的文件名数组 |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail no such file or directory ${dirPath}` | 目录不存在 |
| `fail not a directory ${dirPath}` | dirPath 不是目录 |
| `fail permission denied, open ${dirPath}` | 没有读权限 |

### FileSystemManager.readdirSync — 同步读取目录

```ts
try {
  const files = fs.readdirSync(`${ks.env.USER_DATA_PATH}/save`);
  console.log('文件列表:', files);
} catch (e) {
  console.error('读取失败:', e.errMsg);
}
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| dirPath | `string` | 是 | 要读取的目录路径 |

### 返回值

| 类型 | 说明 |
|------|------|
| `Array<string>` | 目录下的文件名数组 |

### FileSystemManager.rmdir — 删除目录

```ts
// 删除空目录
fs.rmdir({
  dirPath: `${ks.env.USER_DATA_PATH}/temp`,
  success() {
    console.log('删除成功');
  },
  fail(err) {
    if (err.errMsg.indexOf('not empty') !== -1) {
      // 目录不为空，用 recursive
      fs.rmdir({
        dirPath: `${ks.env.USER_DATA_PATH}/temp`,
        recursive: true,
        success() { console.log('递归删除成功'); },
      });
    }
  },
});

// 递归删除（目录 + 所有子目录和文件）
fs.rmdir({
  dirPath: `${ks.env.USER_DATA_PATH}/old_save`,
  recursive: true,
  success() {
    console.log('递归删除成功');
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| dirPath | `string` | - | 是 | 要删除的目录路径 |
| recursive | `boolean` | `false` | 否 | 是否递归删除，`true` 时删除目录及其下所有子目录和文件 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail no such file or directory ${dirPath}` | 目录不存在 |
| `fail directory not empty` | 目录不为空（用 `recursive: true`）|
| `fail permission denied, open ${dirPath}` | 没有写权限 |

> ⚠️ `recursive: true` 会**不可恢复**地删除目录下所有内容，慎用。

### FileSystemManager.rmdirSync — 同步删除目录

```ts
try {
  fs.rmdirSync(`${ks.env.USER_DATA_PATH}/temp`, true);  // recursive
} catch (e) {
  console.error('删除失败:', e.errMsg);
}
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| dirPath | `string` | 是 | 要删除的目录路径 |
| recursive | `boolean` | 否 | 是否递归删除，默认 `false` |

---

## 文件信息

### FileSystemManager.getFileInfo — 获取本地文件信息

```ts
fs.getFileInfo({
  filePath: `${ks.env.USER_DATA_PATH}/save/data.json`,
  success(res) {
    console.log('文件大小:', res.size, '字节');
  },
  fail(err) {
    console.error('获取失败:', err.errMsg);
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| filePath | `string` | - | 是 | 要读取的文件路径 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**success 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| size | `number` | 文件大小，单位字节 |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail file not exist` | 指定的 filePath 找不到文件 |

### FileSystemManager.stat — 获取文件 Stats 对象

```ts
// 单文件/目录的 Stats
fs.stat({
  path: `${ks.env.USER_DATA_PATH}/testDir`,
  success(res) {
    console.log('是否目录:', res.stats.isDirectory());
    console.log('大小:', res.stats.size);
    console.log('最后修改时间:', new Date(res.stats.lastModifiedTime * 1000));
  },
});

// 递归获取目录下所有文件的 Stats
fs.stat({
  path: `${ks.env.USER_DATA_PATH}/testDir`,
  recursive: true,
  success(res) {
    Object.keys(res.stats).forEach((subPath) => {
      const stats = res.stats[subPath];
      console.log(subPath, 'isDir:', stats.isDirectory(), 'size:', stats.size);
    });
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| path | `string` | - | 是 | 文件/目录路径 |
| recursive | `boolean` | `false` | 否 | 是否递归获取目录下每个文件的 Stats |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**success 回调参数 Object res：**

| 属性 | 类型 | 说明 |
|------|------|------|
| stats | `Stats` / `Object` | `recursive: false` 时为 `Stats` 对象；`recursive: true` 且 path 是目录时为 `Object`，key 是相对路径，value 是对应 `Stats` |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail permission denied, open ${path}` | 没有读权限 |
| `fail no such file or directory ${path}` | 文件不存在 |

### FileSystemManager.statSync — 同步获取 Stats

```ts
try {
  const stats = fs.statSync(`${ks.env.USER_DATA_PATH}/save/data.json`);
  console.log('大小:', stats.size);
  console.log('是否文件:', stats.isFile());
} catch (e) {
  console.error('获取失败:', e.errMsg);
}

// 递归
try {
  const statsObj = fs.statSync(`${ks.env.USER_DATA_PATH}/testDir`, true);
  Object.keys(statsObj).forEach((p) => {
    console.log(p, statsObj[p].isDirectory());
  });
} catch (e) {
  console.error('获取失败:', e.errMsg);
}
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | `string` | 是 | 文件/目录路径 |
| recursive | `boolean` | 否 | 是否递归获取，默认 `false` |

### 返回值

| 类型 | 说明 |
|------|------|
| `Stats` / `Object` | `recursive: false` 时返回 `Stats`；`recursive: true` 且 path 是目录时返回 `Object` |

---

## 解压文件

### FileSystemManager.unzip — 解压 zip 文件

```ts
fs.unzip({
  zipFilePath: `${ks.env.USER_DATA_PATH}/levels/level1.zip`,
  targetPath: `${ks.env.USER_DATA_PATH}/levels/level1/`,
  success() {
    console.log('解压成功');
    // 读取解压后的文件
    fs.readdir({
      dirPath: `${ks.env.USER_DATA_PATH}/levels/level1/`,
      success(res) {
        console.log('解压后文件:', res.files);
      },
    });
  },
  fail(err) {
    console.error('解压失败:', err.errMsg);
  },
});
```

### 参数 Schema

**Object object**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| zipFilePath | `string` | - | 是 | 源文件路径，**只可以是 zip 压缩文件** |
| targetPath | `string` | - | 是 | 目标目录路径 |
| success | `function` | - | 否 | 接口调用成功的回调函数 |
| fail | `function` | - | 否 | 接口调用失败的回调函数 |
| complete | `function` | - | 否 | 接口调用结束的回调函数 |

**fail 回调常见 errMsg：**

| errMsg | 说明 |
|--------|------|
| `fail permission denied, unzip ${zipFilePath} > ${destPath}` | 没有写权限 |
| `fail no such file or directory, unzip ${zipFilePath} > "${destPath}` | 源文件不存在或目标上层目录不存在 |

> ⚠️ 只支持 **zip 格式**，不支持 `rar` / `7z` / `tar.gz` 等。

---

## Stats 对象

描述文件状态的对象，由 `stat` / `statSync` 返回。

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| mode | `string` | 文件的类型和存取权限，对应 POSIX `stat.st_mode` |
| size | `number` | 文件大小，单位 B，对应 POSIX `stat.st_size` |
| lastAccessedTime | `number` | 最近一次被存取的时间，UNIX 时间戳（秒），对应 POSIX `stat.st_atime` |
| lastModifiedTime | `number` | 最后一次被修改的时间，UNIX 时间戳（秒），对应 POSIX `stat.st_mtime` |

### 方法

#### Stats.isDirectory — 判断是否目录

```ts
const stats = fs.statSync(path);
if (stats.isDirectory()) {
  console.log('是目录');
}
```

#### Stats.isFile — 判断是否普通文件

```ts
const stats = fs.statSync(path);
if (stats.isFile()) {
  console.log('是文件');
}
```

---

## 完整使用模式

### 启动时加载存档目录

```ts
const fs = ks.getFileSystemManager();
const SAVE_DIR = `${ks.env.USER_DATA_PATH}/save`;

function ensureSaveDir() {
  try {
    fs.accessSync(SAVE_DIR);
  } catch (e) {
    // 目录不存在，创建
    try {
      fs.mkdirSync(SAVE_DIR, true);  // recursive
      console.log('[File] save dir created');
    } catch (e2) {
      console.error('[File] mkdir failed:', e2.errMsg);
    }
  }
}
```

### 保存存档（JSON）

```ts
function saveArchive(name, data) {
  const filePath = `${SAVE_DIR}/${name}.json`;
  try {
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    console.log('[File] saved:', filePath);
    return true;
  } catch (e) {
    console.error('[File] save failed:', e.errMsg);
    return false;
  }
}
```

### 读取存档（JSON）

```ts
function loadArchive(name) {
  const filePath = `${SAVE_DIR}/${name}.json`;
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch (e) {
    // 文件不存在或解析失败
    console.warn('[File] load failed:', e.errMsg);
    return null;
  }
}
```

### 下载并解压关卡包

```ts
async function downloadAndUnzipLevel(url, levelName) {
  // 1) 下载 zip 到临时路径
  const tempPath = await KwaiNetwork.downloadFile({ url });

  // 2) 保存到永久路径
  const zipPath = `${ks.env.USER_DATA_PATH}/levels/${levelName}.zip`;
  await new Promise((resolve, reject) => {
    fs.saveFile({
      tempFilePath: tempPath,
      filePath: zipPath,
      success: resolve,
      fail: reject,
    });
  });

  // 3) 解压
  const targetDir = `${ks.env.USER_DATA_PATH}/levels/${levelName}/`;
  await new Promise((resolve, reject) => {
    fs.unzip({
      zipFilePath: zipPath,
      targetPath: targetDir,
      success: resolve,
      fail: reject,
    });
  });

  // 4) 删除 zip（节省空间）
  await new Promise((resolve) => {
    fs.unlink({ filePath: zipPath, success: resolve, fail: resolve });
  });

  console.log('[File] level unzipped to:', targetDir);
  return targetDir;
}
```

### 日志追加

```ts
function logToFile(message) {
  const logPath = `${ks.env.USER_DATA_PATH}/logs/game.log`;
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, line, 'utf8');
  } catch (e) {
    // 文件不存在时先创建
    if (e.errMsg.indexOf('no such file') !== -1) {
      try {
        fs.writeFileSync(logPath, line, 'utf8');
      } catch (e2) {
        console.error('[File] log create failed:', e2.errMsg);
      }
    }
  }
}
```

---

## 常见误用 & 注意事项

- ⚠️ **必须用 `FileSystemManager`** 而非 `FileReader` / `FileWriter` / `Blob`，运行环境无 DOM
- ⚠️ 所有持久化文件应存放在 `ks.env.USER_DATA_PATH` 下，**不要写到代码包路径**（只读）
- ⚠️ 本地文件存储上限 **10MB**，超出会 `fail the maximum size of the file storage limit is exceeded`
- ⚠️ `writeFile` 是**覆盖写**，要追加用 `appendFile`；`appendFile` 文件不存在时**报错**，需先 `writeFile` 创建
- ⚠️ `saveFile` 是**移动语义**，调用后 `tempFilePath` **不可用**
- ⚠️ 同步版本（`*Sync`）**必须 `try/catch`**，否则异常会向上抛出导致崩溃
- ⚠️ 同步版本会**阻塞 JS 线程**，大文件操作用异步，小文件（配置、存档）可用同步
- ⚠️ `rmdir` 默认要求目录为空，目录非空时用 `recursive: true`（**不可恢复**，慎用）
- ⚠️ `unlink` 只删文件，删目录用 `rmdir`；传错会报 `operation not permitted`
- ⚠️ `unzip` 只支持 **zip 格式**，不支持 `rar` / `7z` / `tar.gz`
- ⚠️ `readFile` 不传 `encoding` 返回 `ArrayBuffer`，传 `utf8` 返回字符串
- ⚠️ `rename` 可跨目录移动文件，但目标上层目录必须存在
- ⚠️ 路径分隔符统一用 `/`，不要用 `\`

---

## Agent 调用指引

Agent 应在以下场景自动插入此 API：

- **数据本地持久化**：数据需保存到本地文件（超出 `ks.setStorage` 1MB 限制时）→ `writeFileSync` + `readFileSync`（JSON）
- **下载资源并解压**：关卡包/资源包下载 → `downloadFile` + `saveFile` + `unzip`
- **日志写入**：运行日志、错误日志 → `appendFile`（先 `writeFile` 创建）
- **缓存文件管理**：缓存的图片/音频文件 → `readdir` 列出 + `unlink` 清理旧文件
- **用户自定义内容**：用户截图、自定义关卡 → `writeFile` + `getFileInfo` 查大小
- **文件备份/恢复**：存档备份 → `copyFile`，迁移 → `rename`

推荐：在 `gameplay/kwai-file.js` 中封装统一的文件管理器：
- Promise 化所有异步操作（`access` / `readFile` / `writeFile` / `mkdir` / `readdir` / `stat` 等）
- 同步操作的 `try/catch` 包装统一处理
- 启动时 `ensureDir` 确保存档/日志/缓存目录存在
- 文件操作前自动 `access` 判断存在性
- 大文件用异步，小文件（配置、存档）用同步
- 配合 `KwaiStorage` 缓存文件路径索引（key → filePath 映射）

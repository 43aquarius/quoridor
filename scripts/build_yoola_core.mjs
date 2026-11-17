/* 从 Web 版 TypeScript 源码打包快手 Yoola 用的引擎/AI 模块（IIFE + window.AIGCUtils）
 * 用法: node scripts/build_yoola_core.mjs
 * 产物:
 *   quoridor-yoola/package/gameplay/play/core.js  (types + engine)
 *   quoridor-yoola/package/gameplay/play/ai.js    (ai.ts 二人局 AI)
 *   quoridor-yoola/package/gameplay/play/ai4.js   (ai4.ts 四人局 AI)
 */
import { build } from "esbuild";
import { writeFileSync, readFileSync } from "fs";

const ROOT = "/home/z/my-project";
const OUT = ROOT + "/quoridor-yoola/package/gameplay/play";
const SRC = ROOT + "/src/lib/game";

const banner = "/* 《步步为营》核心模块 —— 由 Web 版 src/lib/game 原样移植（esbuild 打包）\n * 运行时仅依赖 Date/Math/JSON 等标准全局，无 DOM / 网络 / Worker。\n */\n";

async function bundle(name, entryCode, globalName, attachAs) {
  const entryFile = `/tmp/yoola-entry-${name}.ts`;
  writeFileSync(entryFile, entryCode);
  const outfile = `/tmp/yoola-out-${name}.js`;
  await build({
    entryPoints: [entryFile],
    bundle: true,
    format: "iife",
    globalName,
    target: "es2020",
    outfile,
    minify: true,
    charset: "utf8",
    lineLimit: 400,
    legalComments: "none",
    logLevel: "warning",
  });
  let code = readFileSync(outfile, "utf8");
  code = code.replace(
    new RegExp(`^var ${globalName} = `),
    `var ${globalName} = `
  );
  /* IIFE 产物形如: var NAME = (function(){ ... return exports;})(); 附加挂载行 */
  code += `\n(function(){ var G = window.AIGCUtils = window.AIGCUtils || {}; G.${attachAs} = ${globalName}; })();\n`;
  writeFileSync(`${OUT}/${name}.js`, banner + code);
  console.log(`built ${name}.js (${(code.length / 1024).toFixed(0)} KB)`);
}

/* —— core: types + engine —— */
await bundle(
  "core",
  `export * from "${SRC}/types";
export * from "${SRC}/engine";`,
  "QCore",
  "Core"
);

/* —— ai: 二人局 AI（computeAiMove）—— */
await bundle(
  "ai",
  `export { computeAiMove, lastSearchStats } from "${SRC}/ai";`,
  "QAi",
  "AiMod"
);

/* —— ai4: 四人局 AI —— */
await bundle(
  "ai4",
  `export { computeAiMove4, lastSearchStats4 } from "${SRC}/ai4";`,
  "QAi4",
  "Ai4Mod"
);

console.log("done");

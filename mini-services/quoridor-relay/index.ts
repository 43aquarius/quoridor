/* 步步为营 —— 在线对战 relay（独立部署入口）
 * 直接复用主项目 src/lib/online/relay-server.ts 的实现，保证两处协议永远一致：
 * 版式规格存转 / 断线 5 分钟保留 / 逾时判负广播 / 心跳保活。
 * 端口 3004；若嵌入式 relay（Next.js instrumentation）已占用则自动让位。
 */

import { startRelay } from "../../src/lib/online/relay-server";

startRelay()
  .then(({ port }) => {
    console.log(`[quoridor-relay:standalone] relay ready on :${port}`);
  })
  .catch((err) => {
    console.error("[quoridor-relay:standalone] failed:", err);
    process.exit(1);
  });

// 常驻
setInterval(() => {}, 1 << 30);

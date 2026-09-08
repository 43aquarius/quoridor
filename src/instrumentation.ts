/* Next.js instrumentation：服务启动时拉起在线对战 relay（端口 3004）。
 * dev server 由平台守护，relay 随之常驻；独立部署可用 mini-services/quoridor-relay。
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRelay } = await import("./lib/online/relay-server");
    await startRelay();
  }
}

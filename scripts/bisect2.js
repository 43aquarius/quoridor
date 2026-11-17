/* 用 nss_tester.js 二分 core.js 毒串 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const content = fs.readFileSync('/home/z/my-project/quoridor-yoola/package/gameplay/play/core.js', 'utf8');

function hangs(seg) {
  fs.writeFileSync('/tmp/seg.js', seg);
  try {
    execFileSync('node', ['/home/z/my-project/scripts/nss_tester.js', '/tmp/seg.js'], { timeout: 2500, stdio: 'pipe' });
    return false;
  } catch (e) {
    return true;
  }
}

let lo = 0, hi = content.length;
if (!hangs(content)) { console.log('全文件不卡'); process.exit(0); }
while (hi - lo > 40) {
  const mid = Math.floor((lo + hi) / 2);
  if (hangs(content.slice(lo, mid))) hi = mid;
  else lo = mid;
}
console.log('毒串长度', hi - lo, ':');
console.log(JSON.stringify(content.slice(lo, hi)));
console.log('--- 前文200 ---');
console.log(JSON.stringify(content.slice(Math.max(0, lo - 200), lo)));

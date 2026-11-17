/* 二分定位：core.js 中让 normalizeSuspiciousSource 卡死的片段 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const content = fs.readFileSync('/home/z/my-project/quoridor-yoola/package/gameplay/play/core.js', 'utf8');

const TESTER = `
const c = fs.readFileSync(process.argv[1], 'utf8');
let normalized = c
  .replace(/\\?\\.\\s*\\[\\s*(['"])([A-Za-z_$][\\w$]*)\\1\\s*\\]/g, '.$2')
  .replace(/\\[\\s*(['"])([A-Za-z_$][\\w$]*)\\1\\s*\\]/g, '.$2');
let prev = '';
while (prev !== normalized) {
  prev = normalized;
  normalized = normalized.replace(/(['"])((?:\\\\.|(?!\\1).)*)\\1\\s*\\+\\s*(['"])((?:\\\\.|(?!\\3).)*)\\3/g, '$1$2$4$1');
}
console.log('ok');
`;
fs.writeFileSync('/tmp/tester.js', `const fs=require('fs');` + TESTER);

function hangs(seg) {
  fs.writeFileSync('/tmp/seg.js', seg);
  try {
    execFileSync('node', ['/tmp/tester.js', '/tmp/seg.js'], { timeout: 3000, stdio: 'pipe' });
    return false;
  } catch (e) {
    return true;
  }
}

let lo = 0, hi = content.length;
if (!hangs(content)) { console.log('全文件不卡?'); process.exit(0); }
console.log('全文件卡死，二分中…');
while (hi - lo > 50) {
  const mid = Math.floor((lo + hi) / 2);
  if (hangs(content.slice(lo, mid))) {
    hi = mid;
  } else {
    lo = mid;
  }
  process.stdout.write(`  区间 [${lo}, ${hi})\r`);
}
console.log('\n毒串区间:', content.slice(lo, hi));
console.log('---上下文---');
console.log(content.slice(Math.max(0, lo - 200), Math.min(content.length, hi + 100)));

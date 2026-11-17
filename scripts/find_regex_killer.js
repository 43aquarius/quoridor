/* 定位 core.js 中触发 normalizeSuspiciousSource 灾难回溯的片段 */
const fs = require('fs');
const content = fs.readFileSync('/home/z/my-project/quoridor-yoola/package/gameplay/play/core.js', 'utf8');

function normalizeSuspiciousSource(content) {
  let normalized = content
    .replace(/\?\.\s*\[\s*(['"])([A-Za-z_$][\w$]*)\1\s*\]/g, '.$2')
    .replace(/\[\s*(['"])([A-Za-z_$][\w$]*)\1\s*\]/g, '.$2');
  let previous = '';
  let i = 0;
  while (previous !== normalized) {
    i++;
    previous = normalized;
    normalized = normalized.replace(
      /(['"])((?:\\.|(?!\1).)*)\1\s*\+\s*(['"])((?:\\.|(?!\3).)*)\3/g,
      '$1$2$4$1'
    );
    if (i > 200) { console.log('循环过多!'); break; }
  }
  return { passes: i, len: normalized.length };
}

console.log('总长:', content.length);
const t0 = Date.now();
const r = normalizeSuspiciousSource(content);
console.log('passes:', r.passes, '耗时:', Date.now() - t0, 'ms');

// 二分：前后半各测
function timed(seg, label) {
  const t = Date.now();
  const rr = normalizeSuspiciousSource(seg);
  console.log(label, 'len', seg.length, 'passes', rr.passes, '耗时', Date.now() - t, 'ms');
}
const half = Math.floor(content.length / 2);
timed(content.slice(0, half), '前半');
timed(content.slice(half), '后半');

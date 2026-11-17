/* normalizeSuspiciousSource 复现器（与 validate-package.mjs 逐字一致） */
const fs = require('fs');
const c = fs.readFileSync(process.argv[2], 'utf8');
let normalized = c
  .replace(/\?\.\s*\[\s*(['"])([A-Za-z_$][\w$]*)\1\s*\]/g, '.$2')
  .replace(/\[\s*(['"])([A-Za-z_$][\w$]*)\1\s*\]/g, '.$2');
let prev = '';
let passes = 0;
while (prev !== normalized) {
  passes++;
  prev = normalized;
  normalized = normalized.replace(
    /(['"])((?:\\.|(?!\1).)*)\1\s*\+\s*(['"])((?:\\.|(?!\3).)*)\3/g,
    '$1$2$4$1'
  );
  if (passes > 10000) { console.log('LOOP_OVERFLOW'); process.exit(2); }
}
console.log('ok passes=' + passes);

/* 棋谱长卷排版几何回归测试：
 * 验证 poemLayout 在 0..1200 手下全部不变量成立，杜绝「每步详情挤压到一起」的回归。
 * 运行：bun scripts/poster-layout-test.ts
 */
import { poemLayout } from "../src/lib/game/poster";

const POEM_TOP = 1640;
const cases = [
  0, 1, 2, 3, 4, 5, 8, 10, 20, 26, 30, 40, 60, 80, 100, 150, 200, 250, 300,
  348, 349, 350, 400, 500, 532, 600, 700, 800, 821, 822, 823, 900, 1000, 1200,
];

let fails = 0;
const check = (cond: boolean, msg: string) => {
  if (!cond) {
    fails++;
    console.error(`    ✗ ${msg}`);
  }
};

console.log("手数   画布高   行距    字号  末行基线  版记线   容量");
for (const mc of cases) {
  const L = poemLayout(mc);
  const dividerY = L.footerY - 56; // 版记分隔线

  // 1. 画布高度上下限 + 移动端 canvas 面积红线（16.7M px）
  check(L.height >= 2040, `mc=${mc}: height>=2040 (got ${L.height})`);
  check(L.height <= 11000, `mc=${mc}: height<=11000 (got ${L.height})`);
  check(1440 * L.height <= 16_777_216, `mc=${mc}: canvas area ${1440 * L.height} > 16.7M px`);

  // 2. 末行基线：不压版记分隔线（≥30px 余量）、不出画布
  check(L.lastBaseline <= dividerY - 30, `mc=${mc}: lastBaseline ${L.lastBaseline} invades divider ${dividerY}`);
  check(L.lastBaseline < L.height, `mc=${mc}: lastBaseline ${L.lastBaseline} >= height ${L.height}`);

  // 3. 版记文字（footerY+22）完整位于底框（height-84）之上
  check(L.footerY + 22 < L.height - 84, `mc=${mc}: footer text ${L.footerY + 22} below bottom frame ${L.height - 84}`);

  // 4. 行距不低于可读下限
  check(L.rowH >= 22, `mc=${mc}: rowH>=22 (got ${L.rowH})`);

  // 5. 常规对局（≤348 手）一律舒适行距 + 原字号：挤压 bug 不复存在
  if (mc <= 348) {
    check(L.rowH === 52, `mc=${mc}: rowH should be 52 (got ${L.rowH})`);
    check(L.fontSize === 26, `mc=${mc}: fontSize should be 26 (got ${L.fontSize})`);
    check(L.maxEntries >= mc, `mc=${mc}: capacity ${L.maxEntries} < moves ${mc}`);
  }

  // 6. 容量一致性：实际排布的行数与 lastBaseline 吻合（无隐藏溢出）
  const drawn = Math.min(mc, L.maxEntries);
  const rows = Math.max(1, Math.ceil(drawn / 2));
  check(
    Math.abs(POEM_TOP + 40 + (rows - 1) * L.rowH - L.lastBaseline) < 0.51,
    `mc=${mc}: lastBaseline ${L.lastBaseline} != recomputed ${POEM_TOP + 40 + (rows - 1) * L.rowH}`,
  );

  console.log(
    `${String(mc).padStart(4)}  ${String(L.height).padStart(6)}  ${L.rowH.toFixed(1).padStart(5)}px  ${String(L.fontSize).padStart(4)}  ${String(Math.round(L.lastBaseline)).padStart(7)}  ${String(dividerY).padStart(7)}  ${L.maxEntries}${mc > L.maxEntries ? "  [截录+从略注记]" : ""}`,
  );
}

// 7. 用户报告场景专项复验（修复前：100 手 → 行距 15.2px、字号 22px、末行基线 2425 溢出画布）
const b100 = poemLayout(100);
check(b100.rowH === 52 && b100.fontSize === 26, "100手: 应为舒适行距 52px / 字号 26");
const b200 = poemLayout(200);
check(b200.rowH === 52 && b200.fontSize === 26 && b200.height === 7120, `200手: 应为 52px 行距、长卷高 7120 (got ${b200.height})`);
// 8. 短局版式不回归：≤4 手保持原 2040 开本
check(poemLayout(4).height === 2040, "4手: 应保持原 2040 开本");

console.log(fails === 0 ? "\n全部不变量成立，棋谱长卷排版无挤压、无溢出 ✓" : `\n${fails} 项不变量被破坏 ✗`);
process.exit(fails === 0 ? 0 : 1);

/* v11-G 四人局路径咽喉项消融：ai4（choke 开） vs ai4-nochoke（关），
 * 两席对两席、双排列轮转、开局 8 手随机抖动（同 ai4-duel-v9 口径）。
 * 用法：bun scripts/ab-choke4.ts budget=900 perPattern=2 levels=3,4 */
import { initialGame, SEAT_ORDER_4, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload, isEliminated, legalPawnMoves } from "../src/lib/game/engine";
import { computeAiMove4 as moveOn } from "../src/lib/game/ai4";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* 自动生成关项副本 */
const OFF_PATH = join(process.cwd(), "src/lib/game/ai4-nochoke.ts");
if (!existsSync(OFF_PATH)) {
  const src = readFileSync(join(process.cwd(), "src/lib/game/ai4.ts"), "utf8");
  const patched = src.replace(
    /const OFF4_CHOKE = !ON4_CHOKE;.*/,
    "const OFF4_CHOKE = true; /* ab-choke4 生成的关项副本 */",
  );
  if (patched === src) {
    console.error("!! 生成 ai4-nochoke.ts 失败：OFF4_CHOKE 行未匹配");
    process.exit(1);
  }
  writeFileSync(OFF_PATH, patched);
}
const offMod: { computeAiMove4: typeof moveOn } = await import(OFF_PATH);
const moveOff = offMod.computeAiMove4;

type Engine = typeof moveOn;

function seatEngine(pattern: number, seatIdx: number): Engine {
  return (seatIdx + pattern) % 2 === 0 ? moveOn : moveOff;
}

function playGame(pattern: number, level: number, cap: number | undefined): Player | null {
  let s: GameState = initialGame({ playerCount: 4, size: 9, wallsPerPlayer: 5 });
  let guard = 0;
  while (!s.winner && guard < 320) {
    guard++;
    const p = s.turn as Player;
    if (isEliminated(s, p)) continue;
    const eng = seatEngine(pattern, SEAT_ORDER_4.indexOf(p));
    let d: ReturnType<Engine> = null;
    if (s.history.length < 8) {
      const legal = legalPawnMoves(s, p);
      if (legal.length > 0) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        const from = { ...(p === "A" ? s.posA : p === "B" ? s.posB : p === "C" ? s.posC! : s.posD!) };
        d = { payload: { type: "pawn", from, to: pick }, label: "开局随机" };
      }
    }
    if (!d) d = eng(s, level as 1 | 2 | 3 | 4, cap != null ? { budgetMs: cap } : undefined);
    if (!d) break;
    const r = applyPayload(s, p, d.payload);
    if (!r.ok || !r.state) {
      console.error(`  [异常] ${p} 着法被拒：`, JSON.stringify(d.payload), r.reason);
      break;
    }
    s = r.state;
  }
  return s.winner;
}

const args = process.argv.slice(2);
const a = (k: string, d: number) => {
  const f = args.find((x) => x.startsWith(k + "="));
  return f ? Number(f.split("=")[1]) : d;
};
const CAP = a("budget", 900);
const PER = a("perPattern", 2);
const LEVELS = (args.find((x) => x.startsWith("levels="))?.split("=")[1] ?? "3").split(",").map(Number);

for (const level of LEVELS) {
  let onWins = 0;
  let offWins = 0;
  let other = 0;
  const t0 = Date.now();
  for (let pattern = 0; pattern < 2; pattern++) {
    for (let g = 0; g < PER; g++) {
      const w = playGame(pattern, level, CAP);
      const isOn = (SEAT_ORDER_4.indexOf(w) + pattern) % 2 === 0;
      if (w == null) other++;
      else if (isOn) onWins++;
      else offWins++;
      console.log(`  [L${level} P${pattern} 第${g + 1}局] 胜者=${w}（${isOn ? "choke开" : "choke关"}）· 累计 开 ${onWins} : ${offWins} 关 · ${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }
  console.log(`===== L${level} @ ${CAP}ms：choke开 ${onWins} : ${offWins} choke关（另 ${other} 无胜）=====`);
}

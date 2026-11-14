/* 振荡检测：自博弈 + 互博弈，统计
 * 1) 「回步」：某席连续两次行棋着法为 pawn 且 to == 上上步的 from（原路折返）
 * 2) 局面重复：同一全局面（棋子+墙+轮转）出现 ≥2 次
 * 3) 马拉松局（>140 手）
 * 输出每局的振荡事件明细（手数、着法），便于定位病灶。 */
import { initialGame, type GameState, type Player } from "../src/lib/game/types";
import { applyPayload } from "../src/lib/game/engine";
import { computeAiMove } from "../src/lib/game/ai";

const args = process.argv.slice(2);
const budgetArg = args.find((a) => a.startsWith("budget="));
const gamesArg = args.find((a) => a.startsWith("games="));
const levelArg = args.find((a) => a.startsWith("levels="));
const sizeArg = args.find((a) => a.startsWith("size="));
const playersArg = args.find((a) => a.startsWith("players="));

const BUDGET = budgetArg ? Number(budgetArg.split("=")[1]) : 600;
const GAMES = gamesArg ? Number(gamesArg.split("=")[1]) : 4;
const LEVELS: Array<1 | 2 | 3 | 4> = levelArg
  ? (levelArg.split("=")[1].split(",").map(Number) as Array<1 | 2 | 3 | 4>)
  : [2, 3, 4];
const SIZE = sizeArg ? Number(sizeArg.split("=")[1]) : 9;
const PLAYERS = playersArg ? (Number(playersArg.split("=")[1]) as 2 | 4) : 2;

interface Ev {
  n: number;
  player: Player;
  desc: string;
}

function posKey(s: GameState): string {
  if (s.playerCount === 4) {
    return `${s.posA.x},${s.posA.y}|${s.posB.x},${s.posB.y}|${s.posC?.x},${s.posC?.y}|${s.posD?.x},${s.posD?.y}|${s.walls.map((w) => `${w.x}${w.y}${w.o}`).join(".")}|${s.turn}|${(s.eliminated ?? []).join("")}`;
  }
  return `${s.posA.x},${s.posA.y}|${s.posB.x},${s.posB.y}|${s.walls.map((w) => `${w.x}${w.y}${w.o}`).join(".")}|${s.turn}`;
}

let totalGames = 0;
let oscillationGames = 0;
const allEvents: string[] = [];

for (const lv of LEVELS) {
  for (let g = 0; g < GAMES; g++) {
    /* 主客互换：A 席先手 */
    let s = initialGame({ size: SIZE, playerCount: PLAYERS, wallsPerPlayer: PLAYERS === 4 ? 5 : 10 });
    const events: Ev[] = [];
    const lastOwnPawnFrom = new Map<Player, { x: number; y: number }>();
    const seen = new Map<string, number>();
    seen.set(posKey(s), 1);
    let moves = 0;
    const t0 = Date.now();
    while (!s.winner && moves < 260) {
      const player = s.turn;
      const d = computeAiMove(s, lv, { budgetMs: BUDGET });
      if (!d || (d.payload.type !== "pawn" && d.payload.type !== "wall")) break;
      const r = applyPayload(s, player, d.payload);
      if (!r.ok || !r.state) {
        console.log(`!! L${lv} G${g} 第${moves + 1}手 非法着法 ${JSON.stringify(d.payload)}`);
        break;
      }
      moves++;
      const from = d.payload.type === "pawn" ? d.payload.from : null;
      const to = d.payload.type === "pawn" ? d.payload.to : null;
      /* 回步检测：上一手自己 pawn from==当前位置附近 */
      if (from && to) {
        const prev = lastOwnPawnFrom.get(player);
        if (prev && prev.x === to.x && prev.y === to.y && !(from.x === prev.x && from.y === prev.y)) {
          events.push({
            n: moves,
            player,
            desc: `回步折返 →(${to.x},${to.y})（上一手刚离开）`,
          });
        }
        lastOwnPawnFrom.set(player, { x: from.x, y: from.y });
      } else {
        lastOwnPawnFrom.delete(player);
      }
      s = r.state;
      const k = posKey(s);
      const c = (seen.get(k) ?? 0) + 1;
      seen.set(k, c);
      if (c === 2) {
        events.push({ n: moves, player, desc: `局面第2次重复` });
      } else if (c === 3) {
        events.push({ n: moves, player, desc: `局面第3次重复(!)` });
      }
    }
    const ms = Date.now() - t0;
    totalGames++;
    if (events.length > 0 || moves >= 260) {
      oscillationGames++;
      allEvents.push(
        `L${lv} G${g}: ${moves}手 ${ms}ms winner=${s.winner ?? "无(达上限)"} 事件=${events.length}`,
      );
      for (const e of events.slice(0, 14)) {
        allEvents.push(`   #${e.n} ${e.player} ${e.desc}`);
      }
      if (events.length > 14) allEvents.push(`   …共${events.length}件`);
    } else {
      console.log(`L${lv} G${g}: 干净对局 ${moves}手 ${ms}ms winner=${s.winner}`);
    }
  }
}

console.log("\n========== 汇总 ==========");
console.log(`对局总数 ${totalGames}，异常局 ${oscillationGames}`);
for (const line of allEvents) console.log(line);

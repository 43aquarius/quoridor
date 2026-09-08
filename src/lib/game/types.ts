/* 步步为营（Quoridor）—— 完全可序列化的核心类型与记谱法
 * 坐标系：x = 列 0..8（a..i，自左向右）；y = 行 0..8（自上向下）。
 * 代数坐标：列字母 + 行号（行号 = 9 - y，即顶行为 9，底行为 1）。
 * 甲（A）执荧光红，起于 e1（底边中列），目标是抵达顶行（第 9 行，任意列）。
 * 乙（B）执钴蓝，起于 e9（顶边中列），目标是抵达底行（第 1 行，任意列）。
 * 挡板锚点 (x, y) ∈ 0..7 × 0..7：
 *   H 挡板：横置于第 y 行与第 y+1 行之间的格线上，覆盖第 x、x+1 两列；
 *   V 挡板：竖置于第 x 列与第 x+1 列之间的格线上，覆盖第 y、y+1 两行。
 */

export type Player = "A" | "B";
export type Orientation = "h" | "v";

export interface Vec {
  x: number;
  y: number;
}

export interface Wall {
  x: number;
  y: number;
  o: Orientation;
  by: Player;
}

export interface PawnPayload {
  type: "pawn";
  from: Vec;
  to: Vec;
}

export interface WallPayload {
  type: "wall";
  wall: Wall;
}

export type MovePayload = PawnPayload | WallPayload;

export interface Move {
  n: number; // 第几手（1 起）
  player: Player;
  notation: string; // e2→e3 / WALL h4-H
  elapsedMs: number; // 该手用时
  t: number; // 时间戳
  payload: MovePayload;
}

export interface GameState {
  posA: Vec;
  posB: Vec;
  wallsA: number; // 甲剩余挡板
  wallsB: number; // 乙剩余挡板
  walls: Wall[];
  turn: Player;
  history: Move[];
  winner: Player | null;
  winReason: "goal" | "resign" | null;
}

export type GameMode = "ai" | "local" | "online";
export type AiLevel = 1 | 2 | 3;

export const AI_PROFILES: Record<
  AiLevel,
  { name: string; title: string; thinking: string; brief: string }
> = {
  1: {
    name: "学徒",
    title: "APPRENTICE",
    thinking: "学徒正在捡字……",
    brief: "走最短路径，偶尔随手放板。懂得直奔终点，尚不懂得设局。",
  },
  2: {
    name: "排字师",
    title: "TYPESETTER",
    thinking: "排字师正在排版……",
    brief: "实时比较双方最短路径差，落后时用挡板延长你的归途。",
  },
  3: {
    name: "总编",
    title: "EDITOR-IN-CHIEF",
    thinking: "总编正在审校……",
    brief: "Minimax 深度搜索加 α-β 剪枝。评估路径差、挡板存量与机动空间，几乎不犯错误。",
  },
};

export const BOARD = 9;
export const WALLS_PER_PLAYER = 10;

export function initialGame(): GameState {
  return {
    posA: { x: 4, y: 8 },
    posB: { x: 4, y: 0 },
    wallsA: WALLS_PER_PLAYER,
    wallsB: WALLS_PER_PLAYER,
    walls: [],
    turn: "A",
    history: [],
    winner: null,
    winReason: null,
  };
}

export function goalRow(p: Player): number {
  return p === "A" ? 0 : 8;
}

export function opponent(p: Player): Player {
  return p === "A" ? "B" : "A";
}

/* —— 代数记谱 —— */

const COL_LETTERS = "abcdefghi";
const WALL_LETTERS = "abcdefgh";

export function cellName(v: Vec): string {
  return COL_LETTERS[v.x] + String(9 - v.y);
}

export function wallName(x: number, y: number, o: Orientation): string {
  return WALL_LETTERS[x] + String(8 - y) + "-" + (o === "h" ? "H" : "V");
}

export function pawnNotation(from: Vec, to: Vec): string {
  return `${cellName(from)}→${cellName(to)}`;
}

export function wallNotation(w: Wall): string {
  return `WALL ${wallName(w.x, w.y, w.o)}`;
}

export function resignNotation(p: Player): string {
  return p === "A" ? "甲认输" : "乙认输";
}

export function describeMove(m: Move): string {
  const who = m.player === "A" ? "甲" : "乙";
  return `${String(m.n).padStart(2, "0")} ${who} ${m.notation}`;
}

/* —— 皮肤 —— */

export type SkinId = "rb" | "ri" | "bi" | "gi";

export interface Skin {
  id: SkinId;
  label: string;
  sub: string;
  a: string;
  b: string;
}

export const SKINS: Skin[] = [
  { id: "rb", label: "红·蓝", sub: "初版 · 双荧光套印", a: "#FF4D2E", b: "#2440B3" },
  { id: "ri", label: "红·黑", sub: "Risograph 荧光红", a: "#FF4D2E", b: "#1A1A1A" },
  { id: "bi", label: "蓝·黑", sub: "钴蓝一色活版", a: "#2440B3", b: "#1A1A1A" },
  { id: "gi", label: "墨绿·黑", sub: "深绿打样稿", a: "#2F6B4F", b: "#1A1A1A" },
];

export function skinById(id: SkinId): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

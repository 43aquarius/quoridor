/* 步步为营（Quoridor）—— 完全可序列化的核心类型与记谱法
 * 坐标系：x = 列 0..N-1（a..，自左向右）；y = 行 0..N-1（自上向下）。
 * 代数坐标：列字母 + 行号（行号 = N - y，即顶行为 N，底行为 1）。
 * 二人局：甲（A）执荧光红，起于底边中列，目标是抵达顶行；乙（B）执钴蓝，起于顶边中列，目标底行。
 * 四人局：丙（C）执苔绿，起于左边中行，目标右列；丁（D）执墨黑，起于右边中行，目标左列。
 *   顺时针行棋次序：甲（南）→ 丙（西）→ 乙（北）→ 丁（东）；认输/超时出局而非判负终局。
 * 挡板锚点 (x, y) ∈ 0..N-2 × 0..N-2：
 *   H 挡板：横置于第 y 行与第 y+1 行之间的格线上，覆盖第 x、x+1 两列；
 *   V 挡板：竖置于第 x 列与第 x+1 列之间的格线上，覆盖第 y、y+1 两行。
 * 棋盘规格可自定义：N ∈ 奇数 5..13，每方挡板 0..20 根（经典赛制为 9×9、10 根；四人 9×9×5）。
 */

export type Player = "A" | "B" | "C" | "D";
export type Orientation = "h" | "v";

/* 甲乙丙丁 —— 汉字席位名 */
export const PLAYER_CN: Record<Player, string> = {
  A: "甲",
  B: "乙",
  C: "丙",
  D: "丁",
};

/* 四人局顺时针行棋次序：南（甲）→ 西（丙）→ 北（乙）→ 东（丁） */
export const SEAT_ORDER_4: Player[] = ["A", "C", "B", "D"];

/* 四色套印（四人局固定色：荧光红 / 钴蓝 / 苔绿 / 墨黑） */
export const PLAYER4_COLORS: Record<Player, string> = {
  A: "#FF4D2E",
  B: "#2440B3",
  C: "#00A95C",
  D: "#1A1A1A",
};

/* 席位颜色 CSS 变量名（四人局由 .fourp 钉死为四色套印） */
export function playerColorVar(p: Player): string {
  return p === "A" ? "var(--qa)" : p === "B" ? "var(--qb)" : p === "C" ? "var(--qc)" : "var(--qd)";
}

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

/* 认输 / 超时：非着法型收束着（入历史以保回放与同步重建） */
export interface ResignPayload {
  type: "resign";
}

export interface TimeoutPayload {
  type: "timeout";
}

export type MovePayload = PawnPayload | WallPayload | ResignPayload | TimeoutPayload;

/* AI 决策（二人 / 四人通用） */
export interface AiDecision {
  payload: MovePayload;
  label: string;
  /** 搜索分（根分裂并行时跨 worker 聚合比较用；启发式档位可能缺省） */
  score?: number;
}

export interface Move {
  n: number; // 第几手（1 起）
  player: Player;
  notation: string; // e2→e3 / WALL h4-H
  elapsedMs: number; // 该手用时
  t: number; // 时间戳
  payload: MovePayload;
}

export interface GameState {
  size: number; // 棋盘边长 N（奇数 5..13；旧存档缺省时回填 9）
  wallsStart: number; // 每方开局挡板数（旧存档缺省时回填 10）
  playerCount: 2 | 4; // 座位数（旧存档缺省时回填 2）
  posA: Vec;
  posB: Vec;
  posC?: Vec; // 四人局：丙（西）
  posD?: Vec; // 四人局：丁（东）
  wallsA: number; // 甲剩余挡板
  wallsB: number; // 乙剩余挡板
  wallsC?: number; // 四人局：丙剩余挡板
  wallsD?: number; // 四人局：丁剩余挡板
  walls: Wall[];
  turn: Player;
  history: Move[];
  winner: Player | null;
  winReason: "goal" | "resign" | "timeout" | "last" | null; // last = 四人局众席出局后的末位胜
  eliminated?: Player[]; // 四人局：已出局席位（铅字留在盘上作障碍，不再行棋）
}

export type GameMode = "ai" | "local" | "online";
export type AiLevel = 1 | 2 | 3 | 4;

export const AI_PROFILES: Record<
  AiLevel,
  { name: string; title: string; thinking: string; brief: string }
> = {
  1: {
    name: "学徒",
    title: "APPRENTICE",
    thinking: "学徒正在捡字……",
    brief: "循最短路直奔终点，还会把铅条拦在你的必经之路上；只是尚不懂得长线设局。",
  },
  2: {
    name: "排字师",
    title: "TYPESETTER",
    thinking: "排字师正在排版……",
    brief: "五层搜索的聪明贪心：算得比你远一步，落后时果断放板延长你的归途。",
  },
  3: {
    name: "总编",
    title: "EDITOR-IN-CHIEF",
    thinking: "总编正在审校……",
    brief: "十数层前瞻的深度搜索，α-β 剪枝、置换表与历史启发齐备。评估路径差、挡板存量与路径分岔，几乎不犯错误。",
  },
  4: {
    name: "社长",
    title: "PUBLISHER",
    thinking: "社长正在终审……",
    brief: "全预算终审机器：最深的前瞻、终局竞速精确判胜；领先时寸板不费，绝不为炫技烧节奏——从不心慈手软，也从不画蛇添足。",
  },
};

/* ============ 版式规格（棋盘尺寸 / 挡板数） ============ */

export interface TimeControl {
  totalSec: number; // 每方总时长（秒），0 = 不限
  perMoveSec: number; // 单步时限（秒），0 = 不限；任一超时即判负
}

export const DEFAULT_TIME: TimeControl = { totalSec: 0, perMoveSec: 0 };

export interface GameConfig {
  size: number;
  wallsPerPlayer: number;
  playerCount: 2 | 4;
  timeControl: TimeControl;
}

export const BOARD = 9;
export const WALLS_PER_PLAYER = 10;

export const DEFAULT_CONFIG: GameConfig = { size: 9, wallsPerPlayer: 10, playerCount: 2, timeControl: DEFAULT_TIME };

/* 可选棋盘边长（须为奇数，保证中列存在） */
export const BOARD_SIZES: number[] = [5, 7, 9, 11, 13];
export const MIN_WALLS = 0;
export const MAX_WALLS = 20;

/* 编辑部推荐挡板数（按尺寸缩放） */
export const RECOMMENDED_WALLS: Record<number, number> = {
  5: 5,
  7: 8,
  9: 10,
  11: 12,
  13: 14,
};

/* 四人局推荐挡板数：总板量与二人局持平（每人减半，官方 9×9 四人 = 5） */
export const RECOMMENDED_WALLS_4P: Record<number, number> = {
  5: 3,
  7: 4,
  9: 5,
  11: 6,
  13: 7,
};

export function recommendedWalls(size: number, playerCount: 2 | 4 = 2): number {
  if (playerCount === 4) {
    return RECOMMENDED_WALLS_4P[size] ?? Math.max(2, Math.round(((size - 1) * 1.25) / 2));
  }
  return RECOMMENDED_WALLS[size] ?? Math.round((size - 1) * 1.25);
}

export interface FormatPreset {
  id: string;
  label: string;
  en: string;
  sub: string;
  size: number;
  wallsPerPlayer: number;
  recommended?: boolean;
}

export const FORMAT_PRESETS: FormatPreset[] = [
  {
    id: "mini",
    label: "袖珍",
    en: "MINI",
    sub: "五路五板 · 速弈短打，十分钟见分晓",
    size: 5,
    wallsPerPlayer: 5,
  },
  {
    id: "salon",
    label: "沙龙",
    en: "SALON",
    sub: "七路八板 · 轻量对坐，攻守两三回合定调",
    size: 7,
    wallsPerPlayer: 8,
  },
  {
    id: "classic",
    label: "经典",
    en: "CLASSIC",
    sub: "九路十板 · 标准赛制，规则书的原排版",
    size: 9,
    wallsPerPlayer: 10,
    recommended: true,
  },
  {
    id: "master",
    label: "大师",
    en: "MASTER",
    sub: "十一路十二板 · 长卷博弈，绕路更长心机更深",
    size: 11,
    wallsPerPlayer: 12,
  },
];

/* 四人围坐版式预设（总板量与二人局对齐，人均减半） */
export const FORMAT_PRESETS_4P: FormatPreset[] = [
  {
    id: "mini4",
    label: "袖珍围坐",
    en: "MINI TABLE",
    sub: "五路三板 · 四人速弈，一盏茶见分晓",
    size: 5,
    wallsPerPlayer: 3,
  },
  {
    id: "salon4",
    label: "沙龙围坐",
    en: "SALON TABLE",
    sub: "七路四板 · 轻量四人局，挡板金贵",
    size: 7,
    wallsPerPlayer: 4,
  },
  {
    id: "classic4",
    label: "经典围坐",
    en: "CLASSIC TABLE",
    sub: "九路五板 · 官方四人赛制，规则书的围桌排版",
    size: 9,
    wallsPerPlayer: 5,
    recommended: true,
  },
  {
    id: "master4",
    label: "大师围坐",
    en: "MASTER TABLE",
    sub: "十一路六板 · 长桌博弈，三方博弈更长心机",
    size: 11,
    wallsPerPlayer: 6,
  },
];

/* 规格清洗：奇数化 + 夹取范围；挡板数缺省时取该尺寸推荐值（随席位数） */
/* 入参放宽到 Partial（timeControl 可为部分对象），便于直接清洗 relay 房间设置 */
export function normalizeConfig(
  c: (Partial<Omit<GameConfig, "timeControl" | "playerCount">> & { timeControl?: Partial<TimeControl>; playerCount?: number }) | null | undefined,
): GameConfig {
  let size = Math.round(Number(c?.size));
  if (!Number.isFinite(size) || size <= 0) size = 9;
  if (size % 2 === 0) size += 1;
  size = Math.min(13, Math.max(5, size));
  const playerCount: 2 | 4 = Number(c?.playerCount) === 4 ? 4 : 2;
  let walls = Math.round(Number(c?.wallsPerPlayer));
  if (!Number.isFinite(walls)) walls = recommendedWalls(size, playerCount);
  walls = Math.min(MAX_WALLS, Math.max(MIN_WALLS, walls));
  return { size, wallsPerPlayer: walls, playerCount, timeControl: normalizeTimeControl(c?.timeControl) };
}

/* 版式同一性：仅比较棋盘尺寸与挡板数（棋钟独立比较） */
export function sameConfig(
  a: { size: number; wallsPerPlayer: number },
  b: { size: number; wallsPerPlayer: number },
): boolean {
  return a.size === b.size && a.wallsPerPlayer === b.wallsPerPlayer;
}

export function sameTimeControl(a: TimeControl, b: TimeControl): boolean {
  return a.totalSec === b.totalSec && a.perMoveSec === b.perMoveSec;
}

/* 旧存档 / 旧卷宗兼容：补齐 size、wallsStart、playerCount、四人缺省字段 */
export function normalizeState(s: GameState): GameState {
  const size = Number.isFinite(s?.size) ? s.size : 9;
  const wallsStart = Number.isFinite(s?.wallsStart) ? s.wallsStart : 10;
  const playerCount: 2 | 4 = s?.playerCount === 4 ? 4 : 2;
  if (playerCount === 2) return { ...s, size, wallsStart, playerCount };
  const mid = (size - 1) / 2;
  return {
    ...s,
    size,
    wallsStart,
    playerCount,
    posC: s.posC ?? { x: 0, y: mid },
    posD: s.posD ?? { x: size - 1, y: mid },
    wallsC: Number.isFinite(s.wallsC) ? s.wallsC : wallsStart,
    wallsD: Number.isFinite(s.wallsD) ? s.wallsD : wallsStart,
    eliminated: s.eliminated ?? [],
  };
}

export function initialGame(config?: Partial<GameConfig>): GameState {
  const { size, wallsPerPlayer, playerCount } = normalizeConfig(config);
  const mid = (size - 1) / 2;
  const base: GameState = {
    size,
    wallsStart: wallsPerPlayer,
    playerCount,
    posA: { x: mid, y: size - 1 },
    posB: { x: mid, y: 0 },
    wallsA: wallsPerPlayer,
    wallsB: wallsPerPlayer,
    walls: [],
    turn: "A",
    history: [],
    winner: null,
    winReason: null,
  };
  if (playerCount === 4) {
    return {
      ...base,
      posC: { x: 0, y: mid },
      posD: { x: size - 1, y: mid },
      wallsC: wallsPerPlayer,
      wallsD: wallsPerPlayer,
      eliminated: [],
    };
  }
  return base;
}

export function goalRow(p: Player, size = 9): number {
  return p === "A" ? 0 : size - 1;
}

/* 泛化胜利判定：甲到顶行 / 乙到底行 / 丙到右列 / 丁到左列 */
export function hasWonCell(p: Player, x: number, y: number, size = 9): boolean {
  if (p === "A") return y === 0;
  if (p === "B") return y === size - 1;
  if (p === "C") return x === size - 1;
  if (p === "D") return x === 0;
  return false;
}

export function opponent(p: Player): Player {
  return p === "A" ? "B" : "A";
}

/* —— 代数记谱 —— */

const COL_LETTERS = "abcdefghijklm"; // 至多 13 列

export function colLetter(x: number, size = 9): string {
  return COL_LETTERS[Math.min(x, size - 1, COL_LETTERS.length - 1)] ?? "?";
}

export function cellName(v: Vec, size = 9): string {
  return colLetter(v.x, size) + String(size - v.y);
}

export function wallName(x: number, y: number, o: Orientation, size = 9): string {
  return colLetter(x, size - 1) + String(size - 1 - y) + "-" + (o === "h" ? "H" : "V");
}

export function pawnNotation(from: Vec, to: Vec, size = 9): string {
  return `${cellName(from, size)}→${cellName(to, size)}`;
}

export function wallNotation(w: Wall, size = 9): string {
  return `WALL ${wallName(w.x, w.y, w.o, size)}`;
}

export function resignNotation(p: Player): string {
  return `${PLAYER_CN[p]}认输`;
}

export function timeoutNotation(p: Player): string {
  return `${PLAYER_CN[p]}超时`;
}

export function describeMove(m: Move): string {
  const who = PLAYER_CN[m.player] ?? "甲";
  return `${String(m.n).padStart(2, "0")} ${who} ${m.notation}`;
}

/* 版式规格的刊印式描述（对局页 / 卷宗共用） */
export function configLabel(c: { size: number; wallsPerPlayer: number; playerCount?: number }): string {
  const seat = c.playerCount === 4 ? "四人" : "二人";
  return `${c.size}×${c.size} · 每方 ${c.wallsPerPlayer} 板 · ${seat}局`;
}

/* ============ 棋钟档位 / 预设 / 清洗 ============ */

/* 自定义档位（秒） */
export const TIME_TOTAL_STEPS: number[] = [0, 60, 180, 300, 600, 1200, 1800];
export const TIME_MOVE_STEPS: number[] = [0, 10, 15, 20, 30, 60, 120];

export interface TimePreset {
  id: string;
  label: string;
  en: string;
  sub: string;
  totalSec: number;
  perMoveSec: number;
  recommended?: boolean;
}

export const TIME_PRESETS: TimePreset[] = [
  {
    id: "unlimited",
    label: "悠然",
    en: "UNLIMITED",
    sub: "不限时 · 读本默许慢慢下",
    totalSec: 0,
    perMoveSec: 0,
    recommended: true,
  },
  {
    id: "blitz",
    label: "快棋",
    en: "BLITZ",
    sub: "总 3 分钟 · 每步 15 秒 · 电光石火",
    totalSec: 180,
    perMoveSec: 15,
  },
  {
    id: "standard",
    label: "标准",
    en: "STANDARD",
    sub: "总 5 分钟 · 每步 30 秒 · 赛钟常规",
    totalSec: 300,
    perMoveSec: 30,
  },
  {
    id: "deluxe",
    label: "长卷",
    en: "DELUXE",
    sub: "总 10 分钟 · 每步 60 秒 · 慢工细活",
    totalSec: 600,
    perMoveSec: 60,
  },
];

/* 棋钟清洗：负值/非数归零，上限总 2 小时 / 单步 1 小时 */
export function normalizeTimeControl(t: Partial<TimeControl> | null | undefined): TimeControl {
  const clamp = (v: unknown, max: number): number => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(max, n);
  };
  return { totalSec: clamp(t?.totalSec, 7200), perMoveSec: clamp(t?.perMoveSec, 3600) };
}

export function isTimed(t: TimeControl): boolean {
  return t.totalSec > 0 || t.perMoveSec > 0;
}

/* 棋钟的刊印式描述 */
export function timeLabel(t: TimeControl): string {
  if (!isTimed(t)) return "不限时";
  const parts: string[] = [];
  if (t.totalSec > 0) {
    parts.push(t.totalSec >= 60 ? `总 ${Math.round(t.totalSec / 60)} 分` : `总 ${t.totalSec} 秒`);
  }
  if (t.perMoveSec > 0) parts.push(`每步 ${t.perMoveSec} 秒`);
  return parts.join(" · ");
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

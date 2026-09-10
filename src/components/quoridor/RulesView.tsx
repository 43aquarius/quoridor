"use client";

/* 04 规则 —— 「编者按」式排版：编辑部的规矩说明，双色印刷图示。 */

import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useQuoridor } from "@/store/game-store";
import { Button } from "@/components/ui/button";

const RED = "var(--qa)";
const BLUE = "var(--qb)";
const INK = "var(--ink)";

/* —— 小图示：格 —— */
function DiaBase({
  caption,
  children,
  label,
}: {
  caption: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="border border-ink/40 p-4" aria-label={label}>
      <svg viewBox="0 0 300 240" className="block h-auto w-full" role="img" aria-label={label}>
        {children}
      </svg>
      <figcaption className="mt-2 border-t border-dashed border-ink/30 pt-2 font-mono text-[10px] leading-relaxed text-ink/60">
        {caption}
      </figcaption>
    </figure>
  );
}

function Grid3({ ox = 0, oy = 0 }: { ox?: number; oy?: number }) {
  return (
    <g>
      {Array.from({ length: 4 }, (_, i) => (
        <g key={i}>
          <line x1={ox + i * 70} y1={oy} x2={ox + i * 70} y2={oy + 210} stroke={INK} strokeWidth={1.1} />
          <line x1={ox} y1={oy + i * 70} x2={ox + 210} y2={oy + i * 70} stroke={INK} strokeWidth={1.1} />
        </g>
      ))}
    </g>
  );
}

function Piece({ x, y, player, ch = true }: { x: number; y: number; player: "A" | "B"; ch?: boolean }) {
  const cx = x * 70 + 35 + 45;
  const cy = y * 70 + 35 - 5;
  const color = player === "A" ? RED : BLUE;
  return (
    <g>
      <circle cx={cx + 3} cy={cy + 3} r={22} fill={color} opacity={0.4} style={{ mixBlendMode: "multiply" }} />
      <circle cx={cx} cy={cy} r={22} fill={color} />
      {ch && (
        <>
          <text x={cx + 1.2} y={cy + 1.2} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={900} fill={INK} opacity={0.5}>
            {player === "A" ? "甲" : "乙"}
          </text>
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={900} fill="var(--paper)">
            {player === "A" ? "甲" : "乙"}
          </text>
        </>
      )}
    </g>
  );
}

function Lead({ x, y, o, player }: { x: number; y: number; o: "h" | "v"; player: "A" | "B" }) {
  const color = player === "A" ? RED : BLUE;
  const geom =
    o === "h"
      ? { rx: x * 70 + 5 + 45, ry: (y + 1) * 70 - 6 - 5, w: 140 - 10, h: 12 }
      : { rx: (x + 1) * 70 - 6 + 45, ry: y * 70 + 5 - 5, w: 12, h: 140 - 10 };
  return (
    <g>
      <rect x={geom.rx + 2.5} y={geom.ry + 2.5} width={geom.w} height={geom.h} rx={6} fill={color} opacity={0.4} style={{ mixBlendMode: "multiply" }} />
      <rect x={geom.rx} y={geom.ry} width={geom.w} height={geom.h} rx={6} fill={color} />
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const size = 9;
  const bx = x2 - Math.cos(ang) * 16;
  const by = y2 - Math.sin(ang) * 16;
  return (
    <g stroke={color} strokeWidth={3} fill="none" strokeLinecap="round">
      <line x1={x1} y1={y1} x2={bx} y2={by} strokeDasharray="7 5" />
      <polygon
        points={`${x2},${y2} ${bx + Math.cos(ang + 2.5) * size},${by + Math.sin(ang + 2.5) * size} ${bx + Math.cos(ang - 2.5) * size},${by + Math.sin(ang - 2.5) * size}`}
        fill={color}
        stroke="none"
      />
    </g>
  );
}

export function RulesView() {
  const setView = useQuoridor((s) => s.setView);

  return (
    <section aria-label="规则" className="mx-auto w-full max-w-5xl px-6 py-16 sm:px-10 sm:py-20">
      <header className="mb-12">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-4">
          <h2 className="font-display text-4xl font-black text-ink sm:text-5xl">
            规则
            <span className="ml-4 font-west text-base font-normal italic text-ink/55">editor’s note</span>
          </h2>
          <span className="font-mono text-[10px] tracking-[0.4em] text-ink/50">CH.05</span>
        </div>
      </header>

      {/* 编者按 */}
      <motion.article
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
      >
        <div className="space-y-6 text-[15px] leading-[1.9] text-ink/85">
          <p>
            <span className="float-left mr-3 mt-1 font-display text-6xl font-black leading-[0.8]" style={{ color: RED }}>
              编
            </span>
            辑部把这套规矩交到读者手上之前，先在打样机上印了不下百局。结论只有一条：
            「步步为营」的全部趣味，恰在于它的名字——每一着棋都在往前走，
            但真正的胜负手往往是一道横在你归途上的铅条。攻与守共用同一张纸，
            快与慢共用同一根笔。以下按行棋顺序，把规矩一条条排开。
          </p>
          <p>
            经典开本为九路九行，共八十一格，每人执十根挡板；开卷时也可改排袖珍五路、沙龙七路或
            大师十一路的自定义开本，挡板零至二十根随排（见各章「版式规格」面板）。默认仍以
            经典九路为准。甲乙两枚圆形活字铅块分踞底边与顶边的中列——
            甲在 <span className="tabular font-bold">e1</span>，乙在{" "}
            <span className="tabular font-bold">e9</span>；甲的终点在顶线，乙的终点在底线，
            彼此的家门就是对方的终点。挡板是排版用的粗铅条，
            每根长两格，专司设障。
          </p>
        </div>
        <DiaBase label="棋盘与开局示意图" caption="图一 · 开局：甲居 e1（下），乙居 e9（上），各执十根铅条。虚线为双方要抵达的底线。">
          <Grid3 />
          <g stroke={INK} strokeWidth={1.6} strokeDasharray="2 6" opacity={0.55}>
            <line x1={45} y1={205} x2={255} y2={205} />
            <line x1={45} y1={-5} x2={255} y2={-5} />
          </g>
          <Piece x={1} y={2} player="A" />
          <Piece x={1} y={0} player="B" />
        </DiaBase>
      </motion.article>

      {/* 一、行棋 */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="mt-14 grid gap-10 border-t border-ink/30 pt-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
      >
        <div>
          <h3 className="mb-4 flex items-baseline gap-3">
            <span className="font-west text-3xl font-black" style={{ color: RED }}>Ⅰ</span>
            <span className="font-display text-2xl font-black">行棋</span>
          </h3>
          <p className="text-[15px] leading-[1.9] text-ink/85">
            每回合一着，二选其一：<b>移子</b>，或<b>放板</b>。移子只能走到上下左右相邻的一格，
            不可斜行，更不可穿墙——挡板立在格线之间，铅条挡道处便是绝路。
            棋盘上永远只有两枚棋子，格中有子亦不可落入。先手由甲执，
            之后轮流落子，直到有一方把铅块压上对方的底线。
          </p>
        </div>
        <DiaBase label="行棋示意" caption="图二 · 甲可走上、下、左、右相邻四格；虚线箭头示可去方向。">
          <Grid3 />
          <Piece x={1} y={1} player="A" />
          <Arrow x1={180} y1={100} x2={180} y2={40} color={RED} />
          <Arrow x1={180} y1={100} x2={180} y2={165} color={RED} />
          <Arrow x1={170} y1={95} x2={105} y2={95} color={RED} />
          <Arrow x1={190} y1={95} x2={255} y2={95} color={RED} />
        </DiaBase>
      </motion.section>

      {/* 二、跳子 */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="mt-14 grid gap-10 border-t border-ink/30 pt-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
      >
        <div>
          <h3 className="mb-4 flex items-baseline gap-3">
            <span className="font-west text-3xl font-black" style={{ color: BLUE }}>Ⅱ</span>
            <span className="font-display text-2xl font-black">跳子</span>
          </h3>
          <p className="text-[15px] leading-[1.9] text-ink/85">
            两枚铅块正面相邻时，不可走入对方的格子。若对方身后一格空且无板，
            可<b>直跳</b>越过其头顶。若直跳位被挡板或棋盘边缘堵死，而左右两侧可通行，
            则可<b>斜跳</b>至对方斜后方两格之一——这是全书唯一允许斜行的场合，
            也常常是绕过封锁的活眼。跳子不是可选项之外的恩赐：正面相邻时，
            该方向上你只剩跳或绕两种走法。
          </p>
        </div>
        <div className="grid gap-6">
          <DiaBase label="直跳示意" caption="图三 · 直跳：甲与乙正面相邻，乙身后无阻，甲跃至其头顶（e5）。">
            <Grid3 />
            <Piece x={1} y={2} player="A" />
            <Piece x={1} y={1} player="B" />
            <Arrow x1={180} y1={170} x2={180} y2={40} color={RED} />
          </DiaBase>
          <DiaBase label="斜跳示意" caption="图四 · 斜跳：乙身后被铅条封死，甲可斜落其斜后方两格之一（虚线箭头）。">
            <Grid3 />
            <Lead x={1} y={0} o="h" player="B" />
            <Piece x={1} y={2} player="A" />
            <Piece x={1} y={1} player="B" />
            <Arrow x1={172} y1={165} x2={112} y2={102} color={RED} />
            <Arrow x1={188} y1={165} x2={248} y2={102} color={RED} />
          </DiaBase>
        </div>
      </motion.section>

      {/* 三、挡板 */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24 }}
        className="mt-14 grid gap-10 border-t border-ink/30 pt-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
      >
        <div>
          <h3 className="mb-4 flex items-baseline gap-3">
            <span className="font-west text-3xl font-black" style={{ color: RED }}>Ⅲ</span>
            <span className="font-display text-2xl font-black">挡板</span>
          </h3>
          <p className="text-[15px] leading-[1.9] text-ink/85">
            放板即落一根铅条于格线之间，横竖随你，但有三条排版纪律不得逾越：
            <b>不可重叠</b>——两根板不可占用同一段格线凹槽；<b>不可十字交叉</b>——
            端点相抵成丁字、成直角是允许的，但中心相交绝无可能。
            最要紧的是第三条：<b>落板之后，双方必须仍各有一条通往底线的活路</b>。
            编辑部的校对工序会当场验算（BFS），一旦这根板把任何一方彻底封死，
            落点即被驳回——纸面上会有一道红色细线划过，如退稿的校对痕。
            挡板用尽后，余下的回合只能行棋；开局自定零板，则全书只分行棋一门。
          </p>
        </div>
        <div className="grid gap-6">
          <DiaBase label="合法挡板示意" caption="图五 · 合法：两板端点相接、并行不犯，丁字与直角皆可。">
            <Grid3 />
            <Lead x={0} y={1} o="h" player="A" />
            <Lead x={2} y={1} o="h" player="B" />
            <Lead x={1} y={2} o="v" player="A" />
          </DiaBase>
          <DiaBase label="非法挡板示意" caption="图六 · 非法：中为十字交叉；下为同槽重叠。红线即校对退回痕。">
            <Grid3 />
            <Lead x={0} y={0} o="h" player="A" />
            <Lead x={0} y={0} o="v" player="B" />
            <line x1={60} y1={140} x2={235} y2={140} stroke="var(--riso-red)" strokeWidth={3.5} strokeLinecap="round" />
            <text x={150} y={125} textAnchor="middle" fontSize={12} fill="var(--riso-red)" fontWeight={700}>
              OVERLAP ✕
            </text>
          </DiaBase>
        </div>
      </motion.section>

      {/* 四、胜负 */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-14 border-t border-ink/30 pt-10"
      >
        <h3 className="mb-4 flex items-baseline gap-3">
          <span className="font-west text-3xl font-black" style={{ color: BLUE }}>Ⅳ</span>
          <span className="font-display text-2xl font-black">胜负、认输与悔棋</span>
        </h3>
        <p className="max-w-3xl text-[15px] leading-[1.9] text-ink/85">
          率先把铅块压上对方底线（任意一列）者胜，全卷至此收笔；每一步都有计时，
          棋谱页边会以等宽数字记下你沉思的久暂。单人及同屏对局可悔棋——
          单人模式一次撤回你的一手连同对手的应手；亦可认输，把最后一行留给对方写。
          在线对局讲究落子无悔，悔棋按钮在此模式下封存。
        </p>
      </motion.section>

      {/* 五、记谱 */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36 }}
        className="mt-14 border-t border-ink/30 pt-10"
      >
        <h3 className="mb-4 flex items-baseline gap-3">
          <span className="font-west text-3xl font-black" style={{ color: RED }}>Ⅴ</span>
          <span className="font-display text-2xl font-black">记谱法</span>
        </h3>
        <p className="max-w-3xl text-[15px] leading-[1.9] text-ink/85">
          全书以代数记谱：列以 <span className="tabular font-bold">a–i</span> 自左向右，
          行以 <span className="tabular font-bold">1–9</span> 自下而上。
          移子记作起讫两点，如 <span className="tabular font-bold">e2→e3</span>；
          放板记作锚点坐标加方向，如 <span className="tabular font-bold">WALL h4-H</span>
          （h4 为板头锚点，H 横 V 竖）。着法依序编号，连同用时一并录入右侧棋谱栏；
          局终时，这串编号连同路径与挡板，将排成一张可下载收藏的棋谱海报。
        </p>
      </motion.section>

      {/* 六、棋钟与超时 */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42 }}
        className="mt-14 border-t border-ink/30 pt-10"
      >
        <h3 className="mb-4 flex items-baseline gap-3">
          <span className="font-west text-3xl font-black" style={{ color: BLUE }}>Ⅵ</span>
          <span className="font-display text-2xl font-black">棋钟与超时</span>
        </h3>
        <p className="max-w-3xl text-[15px] leading-[1.9] text-ink/85">
          开局前可为双方挂一口双轨棋钟：<b>总时长</b>如国际象棋的赛钟，只在你行棋时消耗，
          耗尽即判负；<b>单步时限</b>是每一手的截稿时刻，超时同样收束全卷。
          两条轨相互独立，任一触发即判负（编辑部预设：快棋 总 3 分·每步 15 秒，
          标准 总 5 分·每步 30 秒，长卷 总 10 分·每步 60 秒；亦可手调档位，直至不限时）。
          边栏读秒以荧光红警示临界的最后三十秒（单步为最后十秒）。
          在线对局中棋钟以服务器为终审——掉线不停钟，回座后局面与读秒一并恢复；
          断线逾五分钟未归，按编辑部规矩判离席方负。人机对局里 AI 思考照走棋钟，
          但它的算路快得很，鲜有超时之忧。
        </p>
      </motion.section>

      {/* 七、四人围坐 */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.48 }}
        className="mt-14 border-t border-ink/30 pt-10"
      >
        <h3 className="mb-4 flex items-baseline gap-3">
          <span className="font-west text-3xl font-black" style={{ color: RED }}>Ⅶ</span>
          <span className="font-display text-2xl font-black">四人围坐（围桌赛制）</span>
        </h3>
        <p className="max-w-3xl text-[15px] leading-[1.9] text-ink/85">
          四副活字围一册棋盘：<b>甲执荧光红居南</b>（底边中列，归途为顶行）、
          <b>丙执苔绿居西</b>（左边中行，归途为右列）、<b>乙执钴蓝居北</b>（顶边中列，归途为底行）、
          <b>丁执墨黑居东</b>（右边中行，归途为左列）。行棋顺时针轮转：
          <span className="tabular font-bold">甲→丙→乙→丁</span>，先抵归途者即刻收笔。
          每人挡板减半（九路经典围坐每人五根），放板须同时保住四位在场席位的通路。
          跳子规矩同前，但盘上最多四枚铅字：三子一线时直跳落位被占，可斜跳至被跳子两侧空位。
        </p>
        <p className="mt-4 max-w-3xl text-[15px] leading-[1.9] text-ink/85">
          围桌采用<b>出局制</b>：认输、超时或离席逾五分钟不再是终局，而是该席出局——
          其铅字留在盘上充作障碍（可被跳越），剩余席位继续行棋；仅存一席时，
          该席以「末位收笔」胜出。本地围坐可任意搭配真人与编辑部 AI；
          在线四人房由房主开局，等不齐的空座可交给编辑部代打，断线者出局不散桌。
        </p>
        {/* 围桌方位图 */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <DiaBase
            label="四人围坐方位与顺时针行棋次序"
            caption="四席各据一边中点，箭头为顺时针轮转：甲（南）→ 丙（西）→ 乙（北）→ 丁（东）；色标即各自的归途线。"
          >
            <g>
              {/* 棋盘格 */}
              {Array.from({ length: 5 }, (_, i) => (
                <g key={i}>
                  <line x1={50 + i * 50} y1={30} x2={50 + i * 50} y2={230} stroke={INK} strokeWidth={1.1} />
                  <line x1={50} y1={30 + i * 50} x2={250} y2={30 + i * 50} stroke={INK} strokeWidth={1.1} />
                </g>
              ))}
              {/* 归途线色标（四边中点） */}
              <rect x={130} y={24} width={40} height={6} rx={3} fill={RED} />
              <rect x={130} y={210} width={40} height={6} rx={3} fill={BLUE} />
              <rect x={244} y={130} width={6} height={40} rx={3} fill="var(--qc)" />
              <rect x={20} y={130} width={6} height={40} rx={3} fill="var(--qd)" />
              {/* 四席铅字 */}
              <g>
                <circle cx={150} cy={215} r={16} fill={RED} />
                <text x={150} y={215} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={900} fill="var(--paper)">甲</text>
              </g>
              <g>
                <circle cx={150} cy={45} r={16} fill={BLUE} />
                <text x={150} y={45} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={900} fill="var(--paper)">乙</text>
              </g>
              <g>
                <circle cx={55} cy={130} r={16} fill="var(--qc)" />
                <text x={55} y={130} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={900} fill="var(--paper)">丙</text>
              </g>
              <g>
                <circle cx={245} cy={130} r={16} fill="var(--qd)" />
                <text x={245} y={130} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={900} fill="var(--paper)">丁</text>
              </g>
              {/* 顺时针箭头 */}
              <Arrow x1={178} y1={200} x2={212} y2={168} color={INK} />
              <Arrow x1={212} y1={92} x2={178} y2={60} color={INK} />
              <Arrow x1={88} y1={60} x2={60} y2={92} color={INK} />
              <Arrow x1={60} y1={168} x2={88} y2={200} color={INK} />
            </g>
          </DiaBase>
          <DiaBase
            label="四人局出局制"
            caption="认输/超时/离席逾时者出局：铅字留盘作障碍（加叉线），仅存一席时末位收笔；先抵归途仍即刻收笔。"
          >
            <g>
              {Array.from({ length: 5 }, (_, i) => (
                <g key={`g${i}`}>
                  <line x1={50 + i * 50} y1={30} x2={50 + i * 50} y2={230} stroke={INK} strokeWidth={1.1} />
                  <line x1={50} y1={30 + i * 50} x2={250} y2={30 + i * 50} stroke={INK} strokeWidth={1.1} />
                </g>
              ))}
              {/* 出局的丙（左中，叉线） */}
              <g opacity={0.5}>
                <circle cx={55} cy={130} r={16} fill="var(--qc)" />
                <text x={55} y={130} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={900} fill="var(--paper)">丙</text>
                <g stroke={INK} strokeWidth={2.6} strokeLinecap="round">
                  <line x1={43} y1={118} x2={67} y2={142} />
                  <line x1={67} y1={118} x2={43} y2={142} />
                </g>
              </g>
              {/* 甲冲线 */}
              <circle cx={150} cy={95} r={16} fill={RED} />
              <text x={150} y={95} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={900} fill="var(--paper)">甲</text>
              <Arrow x1={150} y1={118} x2={150} y2={70} color={RED} />
              <text x={150} y={52} textAnchor="middle" fontSize={12} className="tabular" fill={INK} opacity={0.6} style={{ fontFamily: "var(--font-mono)" }}>甲抵顶行 · 收笔</text>
              <text x={55} y={165} textAnchor="middle" fontSize={11} fill={INK} opacity={0.6} style={{ fontFamily: "var(--font-mono)" }}>丙已出局</text>
            </g>
          </DiaBase>
        </div>
      </motion.section>

      <div className="mt-14 border-t-2 border-ink pt-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 font-mono text-xs text-ink/60 hover:text-ink"
          onClick={() => setView("contents")}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          返回目录
        </Button>
        <p className="mt-3 font-mono text-[10px] tracking-[0.25em] text-ink/40">
          规则依据经典桌游 QUORIDOR（Gigamic, 1997）· 编辑部校订版
        </p>
      </div>
    </section>
  );
}

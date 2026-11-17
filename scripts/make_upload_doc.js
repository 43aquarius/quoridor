/* 《步步为营》快手 Yoola 平台上传材料 — 文案交付单 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, AlignmentType, HeadingLevel, WidthType,
  BorderStyle, ShadingType,
} = require("docx");
const fs = require("fs");

const YAHEI = { ascii: "Calibri", eastAsia: "Microsoft YaHei" };
const INK = "1A1A1A";
const RED = "D93A20";
const SOFT = "5A5A5A";

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 30, font: YAHEI, color: INK })],
  });
}

function body(text, opts) {
  opts = opts || {};
  return new Paragraph({
    spacing: { before: 60, after: 120, line: 312 },
    indent: opts.noIndent ? undefined : { firstLine: 420 },
    children: [new TextRun({ text, size: 22, font: YAHEI, color: INK, bold: !!opts.bold })],
  });
}

function label(text) {
  return new Paragraph({
    spacing: { before: 140, after: 60, line: 312 },
    children: [new TextRun({ text, bold: true, size: 22, font: YAHEI, color: RED })],
  });
}

function note(text) {
  return new Paragraph({
    spacing: { before: 40, after: 100, line: 312 },
    children: [new TextRun({ text, size: 18, font: YAHEi_SAFE(), color: SOFT })],
  });
}
function YAHEi_SAFE() { return YAHEI; }

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: YAHEI, size: 22, color: INK } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1200, bottom: 1200, left: 1500, right: 1500 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "《步步为营》Yoola 平台上传材料", size: 16, font: YAHEI, color: SOFT })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, font: YAHEI, color: SOFT })],
        })],
      }),
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 60, line: 340 },
        children: [new TextRun({ text: "《步步为营》快手 Yoola 平台上传材料", bold: true, size: 40, font: YAHEI, color: INK })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: "互动玩法名称 · 介绍 · 素材清单 · 私信分享文案", size: 20, font: YAHEI, color: SOFT })],
      }),

      h1("一、互动玩法名称"),
      body("主推：步步为营", { bold: true, noIndent: true }),
      body("备选：步步为营·挡板对决", { noIndent: true }),
      note("说明：与包内 project.config.json 的 projectname、游戏内标题一致；如平台要求带品类词可用备选。"),

      h1("二、互动玩法介绍"),
      label("标准版（约 100 字）"),
      body("经典桌游「挡板棋 Quoridor」的指尖对弈版。九路棋盘，红蓝对垒：每回合走子或放板二选一，挡板不可重叠、必须给对手留路；率先把棋子走到对面底线即胜。内置学徒、排字师、总编三档 AI 棋手，支持双人同屏，一局 3-5 分钟，围堵与反杀层出不穷。"),
      label("精简版（约 50 字）"),
      body("经典挡板棋 Quoridor：走子或放板二选一，围堵对手、抢占通路，先抵达底线者胜。三档 AI + 双人同屏，3 分钟一局。"),

      h1("三、上传素材清单"),
      new Paragraph({
        keepNext: true,
        spacing: { before: 120, after: 80 },
        children: [new TextRun({ text: "表 1 平台素材规格与对应文件", bold: true, size: 20, font: YAHEI, color: INK })],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: INK },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: INK },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "C8C2B0" },
          insideVertical: { style: BorderStyle.NONE },
        },
        rows: [
          new TableRow({
            tableHeader: true, cantSplit: true,
            children: ["素材", "规格", "格式与体积", "对应文件"].map(t => new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 20, font: YAHEI, color: INK })] })],
              shading: { type: ShadingType.CLEAR, fill: "F2ECDD" },
              margins: { top: 70, bottom: 70, left: 110, right: 110 },
              width: { size: 25, type: WidthType.PERCENTAGE },
            })),
          }),
        ].concat([
            ["玩法 logo", "220 × 220", "PNG / 5 KB", "素材/玩法logo-220x220.png"],
            ["封面及分享图", "510 × 350", "PNG / 29 KB（限 10M 内）", "素材/封面及分享图-510x350.png"],
            ["加载图（竖屏）", "640 × 1400", "PNG / 52 KB（限 1M 内）", "素材/加载图-640x1400.png"],
          ].map(cols => new TableRow({
            cantSplit: true,
            children: cols.map(t => new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: t, size: 20, font: YAHEI, color: INK })] })],
              margins: { top: 70, bottom: 70, left: 110, right: 110 },
              width: { size: 25, type: WidthType.PERCENTAGE },
            })),
          }))),
      }),
      note("三张素材同时已按平台规范内置于交付包 package/yoola-assets/ 目录，平台创建作品时会自动读取；此处单独提供便于手动上传。"),

      h1("四、私信分享文案"),
      label("主推"),
      body("我在快手《步步为营》被堵到怀疑人生！来帮我报仇，一局挡板棋见真章", { noIndent: true }),
      label("备选一（挑战向）"),
      body("走一步还是堵一路？快手《步步为营》见智商，敢来和我下一局吗？", { noIndent: true }),
      label("备选二（战绩向，胜利后分享）"),
      body("【步步为营】我只用十几手就赢了排字师！快手搜「步步为营」来挑战我", { noIndent: true }),
      label("备选三（趣味向）"),
      body("3 分钟一局的挡板棋，我和 AI 总编大战三百回合，输得心服口服……不信你也试试？", { noIndent: true }),
      note("游戏内已内置胜利页分享按钮，会根据对局结果自动生成战绩文案（与备选二同风格）；系统右上角转发使用主推文案。"),

      h1("五、上传流程提示"),
      body("1. 登录 Yoola 平台（open.kuaishou.com/platform/minigame/yoola），创建互动玩法，填写上方名称与介绍；", { noIndent: true }),
      body("2. 在素材页上传三张图片（对应表 1）；", { noIndent: true }),
      body("3. 上传交付包 zip（步步为营-yoola-交付包.zip），平台将自动替换 appid 与广告位 ID 并完成 CDN 化；", { noIndent: true }),
      body("4. 生成测试版本后真机验证：画面渲染、触摸走子与放板、激励视频回调、分享与存档恢复；", { noIndent: true }),
      body("5. 验证通过后提交审核。", { noIndent: true }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("/home/z/my-project/download/步步为营-Yoola上传材料.docx", buf);
  console.log("docx written:", buf.length, "bytes");
});

import ZAI, { VisionMessage } from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

async function check(imgPath: string, prompt: string) {
  const zai = await ZAI.create();
  const b64 = fs.readFileSync(imgPath).toString('base64');
  const messages: VisionMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
      ],
    },
  ];
  const response = await zai.chat.completions.createVision({
    model: 'glm-4.6v',
    messages,
    thinking: { type: 'disabled' },
  });
  console.log(`=== ${imgPath} ===`);
  console.log(response.choices?.[0]?.message?.content ?? 'NO REPLY');
}

async function main() {
  await check('/tmp/render/pg/page-1.jpg', '这是一页中文文档。请检查：1)标题与各级小标题是否清晰无重叠；2)表格是否列对齐、无空列；3)是否有乱码、占位符（XXX/TODO/【】）；4)排版是否有明显异常。简要回答，如无问题请以"正常"开头。');
  await check('/tmp/render/pg/page-2.jpg', '这是一页中文文档。请检查：1)标题与文案列表是否清晰；2)是否有乱码或占位符；3)页面是否近空白或排版异常。简要回答，如无问题请以"正常"开头。');
}

main();

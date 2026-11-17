#!/bin/bash
# Yoola 修复后验证截图（v3：修正全部点击坐标）
set -x
cd /home/z/my-project/quoridor-yoola/package
(python3 -m http.server 8901 >/tmp/serve.log 2>&1 &)
sleep 1.2

agent-browser set viewport 414 896
agent-browser open "http://127.0.0.1:8901/index.html"
agent-browser wait 3000
agent-browser eval "try{localStorage.clear()}catch(e){}; 'cleared'"
agent-browser reload
agent-browser wait 3500
agent-browser screenshot /tmp/v3-01-cover.png

# 封面 → 目录（按钮在 y≈526）
agent-browser mouse move 207 530 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v3-02-toc.png
agent-browser mouse move 300 780 && agent-browser mouse down left
agent-browser mouse move 300 720 && agent-browser mouse up left
agent-browser wait 700
agent-browser screenshot /tmp/v3-02-toc-bottom.png

# 回顶 → 规则（第5章 y 554-650）
agent-browser mouse move 300 720 && agent-browser mouse down left
agent-browser mouse move 300 820 && agent-browser mouse up left
agent-browser wait 400
agent-browser mouse move 207 602 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v3-03-rules-1.png
for i in 2 3 4 5 6 7; do
  agent-browser mouse move 300 800 && agent-browser mouse down left
  agent-browser mouse move 300 100 && agent-browser mouse up left
  agent-browser wait 450
  agent-browser screenshot /tmp/v3-03-rules-$i.png
done

# 重开 → 档案馆（第6章 y 650-746）
agent-browser reload
agent-browser wait 3000
agent-browser mouse move 207 530 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 800
agent-browser mouse move 207 698 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v3-04-archive.png

# 重开 → 章节01 设置页
agent-browser reload
agent-browser wait 3000
agent-browser mouse move 207 530 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 700
agent-browser mouse move 207 218 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v3-05-setup-1.png
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 500
agent-browser screenshot /tmp/v3-05-setup-2.png
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 500
agent-browser screenshot /tmp/v3-05-setup-3.png

# 滚到 1200 时学徒卡在屏上（content 1296-1536 → 屏 96-336），点其中心开局
agent-browser mouse move 207 216 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 1500
agent-browser screenshot /tmp/v3-06-game.png

# 走一步：点甲上方格 (4,7) → 屏 y≈449
agent-browser mouse move 207 449 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 2600
agent-browser screenshot /tmp/v3-06-game-moved.png

# 下滚看状态卡/记录/按钮/色版条
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 400 && agent-browser mouse up left
agent-browser wait 500
agent-browser screenshot /tmp/v3-06-game-panel.png

# 认输弹层（认输按钮屏 y 800-836）
agent-browser mouse move 160 818 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 600
agent-browser screenshot /tmp/v3-07-resign.png

# 落笔认输（弹层按钮 y 448-486）
agent-browser mouse move 275 467 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v3-08-result.png

# 结算页 → 返回目录
agent-browser mouse move 207 842 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v3-09-toc2.png

pkill -f "http.server 8901"
echo DONE-V3

#!/bin/bash
# Yoola 版全页面截图脚本（414x896 视口，鼠标点击/拖拽模拟触屏）
set -x
cd /home/z/my-project/quoridor-yoola/package
(python3 -m http.server 8901 >/tmp/serve.log 2>&1 &)
sleep 1.2

agent-browser set viewport 414 896
agent-browser open "http://127.0.0.1:8901/index.html"
agent-browser wait 3500
agent-browser screenshot /tmp/y-01-cover.png

# 封面 → 目录
agent-browser mouse move 207 570 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 800
agent-browser screenshot /tmp/y-02-toc.png

# 目录下半（色版条/音效/战绩）
agent-browser mouse move 300 750 && agent-browser mouse down left
agent-browser mouse move 300 300 && agent-browser mouse up left
agent-browser wait 800
agent-browser screenshot /tmp/y-02-toc-bottom.png

# 目录回顶 → 章节01 单人对弈
agent-browser mouse move 300 300 && agent-browser mouse down left
agent-browser mouse move 300 850 && agent-browser mouse up left
agent-browser wait 500
agent-browser mouse move 207 208 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 800
agent-browser screenshot /tmp/y-03-setup-top.png

# 设置页中段（棋钟卡）
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 600
agent-browser screenshot /tmp/y-03-setup-mid.png

# 设置页下段（执子/对手职位）
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 600
agent-browser screenshot /tmp/y-03-setup-opps.png

# 滚到底，点开局（黑实心按钮）
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 600
agent-browser screenshot /tmp/y-03-setup-bottom.png
agent-browser mouse move 207 707 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 1500
agent-browser screenshot /tmp/y-04-game.png

# 走一步：点 (4,7) 格（甲上方）
agent-browser mouse move 207 449 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 2500
agent-browser screenshot /tmp/y-04-game-moved.png

# 下滚看状态卡与着法记录
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 300 && agent-browser mouse up left
agent-browser wait 600
agent-browser screenshot /tmp/y-04-game-panel.png

pkill -f "http.server 8901"
echo DONE-BATCH-1

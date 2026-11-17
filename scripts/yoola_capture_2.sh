#!/bin/bash
# Yoola 版规则页 + 档案馆截图
set -x
cd /home/z/my-project/quoridor-yoola/package
(python3 -m http.server 8901 >/tmp/serve.log 2>&1 &)
sleep 1.2

agent-browser set viewport 414 896
agent-browser open "http://127.0.0.1:8901/index.html"
agent-browser wait 3500
agent-browser mouse move 207 570 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 800

# 章节05 规则
agent-browser mouse move 207 592 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 800
agent-browser screenshot /tmp/y-05-rules-1.png
for i in 2 3 4 5 6; do
  agent-browser mouse move 300 800 && agent-browser mouse down left
  agent-browser mouse move 300 200 && agent-browser mouse up left
  agent-browser wait 500
  agent-browser screenshot /tmp/y-05-rules-$i.png
done

# 回目录 → 章节06 档案馆
agent-browser mouse move 300 300 && agent-browser mouse down left
agent-browser mouse move 300 850 && agent-browser mouse up left
agent-browser wait 500
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 850 && agent-browser mouse up left
agent-browser wait 500
agent-browser mouse move 207 688 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 800
agent-browser screenshot /tmp/y-06-archive.png
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 500
agent-browser screenshot /tmp/y-06-archive-2.png

pkill -f "http.server 8901"
echo DONE-BATCH-2

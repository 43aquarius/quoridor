#!/bin/bash
# 最终版全套截图（所有修复生效）
set -x
cd /home/z/my-project/quoridor-yoola/package
(python3 -m http.server 8901 >/tmp/serve.log 2>&1 &)
sleep 1.2

agent-browser set viewport 414 896
agent-browser open "http://127.0.0.1:8901/index.html"
agent-browser wait 3200
agent-browser eval "try{localStorage.clear()}catch(e){}"
agent-browser reload
agent-browser wait 3500
agent-browser screenshot /tmp/f-01-cover.png

agent-browser mouse move 207 530 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/f-02-toc.png
agent-browser mouse move 300 780 && agent-browser mouse down left
agent-browser mouse move 300 720 && agent-browser mouse up left
agent-browser wait 700
agent-browser screenshot /tmp/f-02-toc-bottom.png

# 规则页（含图示）
agent-browser mouse move 300 720 && agent-browser mouse down left
agent-browser mouse move 300 820 && agent-browser mouse up left
agent-browser wait 400
agent-browser mouse move 207 602 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/f-03-rules-1.png
for i in 2 3 4 5; do
  agent-browser mouse move 300 800 && agent-browser mouse down left
  agent-browser mouse move 300 100 && agent-browser mouse up left
  agent-browser wait 450
  agent-browser screenshot /tmp/f-03-rules-$i.png
done

# 设置页
agent-browser reload
agent-browser wait 3200
agent-browser mouse move 207 530 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 700
agent-browser mouse move 207 218 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/f-04-setup-1.png
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 450
agent-browser screenshot /tmp/f-04-setup-2.png
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 450
agent-browser screenshot /tmp/f-04-setup-3.png

# 学徒开局
agent-browser mouse move 207 216 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 1600
agent-browser screenshot /tmp/f-05-game.png
agent-browser mouse move 207 449 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 2500
agent-browser screenshot /tmp/f-05-game-moved.png
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 430 && agent-browser mouse up left
agent-browser wait 600
agent-browser screenshot /tmp/f-05-game-panel.png

# 认输 → 结算
agent-browser mouse move 159 722 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 700
agent-browser screenshot /tmp/f-06-resign.png
agent-browser mouse move 275 494 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 1000
agent-browser screenshot /tmp/f-07-result.png

# 保存入档 → 目录 → 档案馆
agent-browser mouse move 207 766 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 600
agent-browser mouse move 207 862 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 800
agent-browser screenshot /tmp/f-08-toc-resume.png
agent-browser eval "AIGCUtils.App.discardSave(); 'discarded'"
agent-browser wait 400
agent-browser mouse move 207 698 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/f-09-archive.png
agent-browser mouse move 207 455 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 600
agent-browser screenshot /tmp/f-10-archive-open.png

pkill -f "http.server 8901"
echo DONE-FINAL

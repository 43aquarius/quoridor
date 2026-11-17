#!/bin/bash
# Yoola 修复后全页面验证截图（v2）
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
agent-browser screenshot /tmp/v2-01-cover.png

# 封面 → 目录
agent-browser mouse move 207 570 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v2-02-toc.png

# 目录底部（胶片条 + 按钮）
agent-browser mouse move 300 780 && agent-browser mouse down left
agent-browser mouse move 300 700 && agent-browser mouse up left
agent-browser wait 700
agent-browser screenshot /tmp/v2-02-toc-bottom.png

# 目录回顶 → 章节05 规则
agent-browser mouse move 300 700 && agent-browser mouse down left
agent-browser mouse move 300 820 && agent-browser mouse up left
agent-browser wait 400
agent-browser mouse move 207 592 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v2-03-rules-1.png
for i in 2 3 4 5 6 7; do
  agent-browser mouse move 300 800 && agent-browser mouse down left
  agent-browser mouse move 300 150 && agent-browser mouse up left
  agent-browser wait 450
  agent-browser screenshot /tmp/v2-03-rules-$i.png
done

# 重开 → 档案馆（空态）
agent-browser reload
agent-browser wait 3000
agent-browser mouse move 207 570 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 800
agent-browser mouse move 207 688 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v2-04-archive.png

# 重开 → 章节01 设置页三段
agent-browser reload
agent-browser wait 3000
agent-browser mouse move 207 570 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 700
agent-browser mouse move 207 208 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v2-05-setup-1.png
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 500
agent-browser screenshot /tmp/v2-05-setup-2.png
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 500
agent-browser screenshot /tmp/v2-05-setup-3.png
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 500
agent-browser screenshot /tmp/v2-05-setup-4.png

# 点学徒卡开局（学徒卡在滚到底后位于屏上方）
agent-browser mouse move 207 135 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 1500
agent-browser screenshot /tmp/v2-06-game.png

# 走一步：点甲上方格 (4,7)
agent-browser mouse move 207 449 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 2600
agent-browser screenshot /tmp/v2-06-game-moved.png

# 下滚看状态卡/记录/按钮/色版条
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 400 && agent-browser mouse up left
agent-browser wait 500
agent-browser screenshot /tmp/v2-06-game-panel.png

# 认输弹层
agent-browser mouse move 160 818 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 600
agent-browser screenshot /tmp/v2-07-resign.png

# 落笔认输 → 结算页
agent-browser mouse move 262 560 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v2-08-result.png

# 返回目录 → 档案馆（此时已有一局 + 收笔清了存档）
agent-browser mouse move 207 842 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v2-09-toc2.png

pkill -f "http.server 8901"
echo DONE-V2

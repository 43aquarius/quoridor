#!/bin/bash
# Yoola v4：对局流程尾段（认输→结算→入档→档案馆）
set -x
cd /home/z/my-project/quoridor-yoola/package
(python3 -m http.server 8901 >/tmp/serve.log 2>&1 &)
sleep 1.2

agent-browser set viewport 414 896
agent-browser open "http://127.0.0.1:8901/index.html"
agent-browser wait 3000
agent-browser eval "try{localStorage.clear()}catch(e){}"
agent-browser reload
agent-browser wait 3200
agent-browser mouse move 207 530 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 700
agent-browser mouse move 207 218 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 700
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 300
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 200 && agent-browser mouse up left
agent-browser wait 300
agent-browser mouse move 207 216 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 1500
agent-browser screenshot /tmp/v4-01-game.png

# 走一步
agent-browser mouse move 207 449 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 2400
agent-browser screenshot /tmp/v4-02-moved.png

# 滚动看面板
agent-browser mouse move 300 800 && agent-browser mouse down left
agent-browser mouse move 300 430 && agent-browser mouse up left
agent-browser wait 500
agent-browser screenshot /tmp/v4-03-panel.png

# 认输按钮（屏 y 704-740，x 115-203）
agent-browser mouse move 159 722 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 600
agent-browser screenshot /tmp/v4-04-resign.png

# 落笔认输（弹层 yes 中心 275,494）
agent-browser mouse move 275 494 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 1000
agent-browser screenshot /tmp/v4-05-result.png

# 保存此局入档（y 746-786）
agent-browser mouse move 207 766 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 700
agent-browser screenshot /tmp/v4-06-result-saved.png

# 返回目录（toc 按钮 y 842-882）
agent-browser mouse move 207 862 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 800
agent-browser screenshot /tmp/v4-07-toc.png

# 档案馆（有卷宗）：目录第6章 y 650-746
agent-browser mouse move 207 698 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 900
agent-browser screenshot /tmp/v4-08-archive.png

# 展开着法
agent-browser mouse move 207 700 && agent-browser mouse down left && agent-browser mouse up left
agent-browser wait 600
agent-browser screenshot /tmp/v4-09-archive-open.png

pkill -f "http.server 8901"
echo DONE-V4

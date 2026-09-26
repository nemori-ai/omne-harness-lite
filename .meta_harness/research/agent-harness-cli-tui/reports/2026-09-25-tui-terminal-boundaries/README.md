# 治理TUI终端边界取证（候选）

2026-09-25，消费者为CLI节点tui.md/CLI-TUI§14；尚未采用完整TUI或Mac终端支持。保持已有0.86.1基线，未在产品依赖中加入或修改包。

1. 公共Input.render与宽字符工具：frame-probe-r3，在headless5.5.0的80x24、60x16、120x30完整保留三行32字符身份，约5000中英字符水平输入、光标定位，输出不含private-mode控制。只是公共组件/仿真；r1 CommonJS命名导入错误、r2比较未剥离SGR及截短身份测试问题均保留，不能从r3推导真实IME/TTY通过。
2. XTerm379、Xvfb、显式allowPasteControls=false、Node24.21：实际2004查询得到reset，enable后set，恢复原状态且termios一致。普通PRIMARY粘贴中的ESC假尾标记/假DECRQM在正文里变为空格，真实begin/end仍存在，见xterm-paste-r3.json。r1同步等待xclip持有管道造成探针停滞，测试容器已显式结束；r2错用剪贴板选择/焦点未收到输入，超时后恢复；r3明确PRIMARY、焦点与前台xclip拥有者后通过。修的是测试工具，没有放宽期望。
3. XTerm精确源码与独立审查：SelectionReceived在同一同步回调内依次将begin、过滤正文、end交入tty_vwrite；Linux的v_write先追加共同队列再部分write，剩余字节保留。模式回复unparse_end→writePtyData也进该队列。所核普通路径无重入事件循环，因此正常按键/答复不会在尚未排完的该粘贴中插入；部分PTY写不等于事件插入。前提为正常分配/传输、直接PTY、普通非base64/非内部选择路径，不外推其他终端。原始源码带版权/许可保留在本目录，来源见下。
4. 输入历史：原UndoStack无上限，Input.setValue不清历史；KillRing也无上限。候选单点补丁只让UndoStack保留最近256快照；原公共Input负控1000次undo回到0，补丁后停在744，普通Unicode删除/undo保持。只证明隔离delta；产品字段64KiB上界、单实例、禁用kill/yank及补丁锁/发行路径尚待采用/实现验证，不能仅靠当前值长度声称内存有界。
5. Mac安装iTerm3.7.1beta1，但AppleScript创建测试窗在本环境AppleEvent超时(-1712)，未取得window id或探针结果；未碰用户剪贴板、未关闭其他窗口。Mac真实模拟器/IME仍未验，不能以Linux与headless补齐。

来源：[XTerm379 button.c](https://raw.githubusercontent.com/ThomasDickey/xterm-snapshots/xterm-379/button.c)、[charproc.c](https://raw.githubusercontent.com/ThomasDickey/xterm-snapshots/xterm-379/charproc.c)、[ptydata.c](https://raw.githubusercontent.com/ThomasDickey/xterm-snapshots/xterm-379/ptydata.c)；[官方粘贴问题](https://invisible-island.net/xterm/xterm-paste64.html)提供反例类别，不直接证明379有这些问题；[allowPasteControls](https://invisible-island.net/xterm/manpage/xterm.html)须与精确版本/配置同行。

源码SHA256：button.c 148439666a81d46b5798993c0f0eaf86d0f120ed6673014d59a25ce48c154411；charproc.c 1b997da268171711a0be5c085058a3c8e3f8513fbf2ae64bd80ce12f9b607bfb；ptydata.c d9eef23649ce8a90bf615f43c975fa26ad1ac21bf5747f3ec7fddbb807cf7c29。其余文件见SHA256SUMS。

Linux容器基线node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6，apt实际依赖版本留日志。测试命令为xvfb-run -a xterm -xrm "XTerm*allowPasteControls: false" -e node <probe> <result.json>。这不是产品终端启动器或员工安装要求的接受。

# tests/fixtures

本目录承载测试使用的固定输入。

## 允许的内容

测试数据文件与说明。

## 边界

固定输入不能代替规格。数据的来源与生成方式写在本 README。

## 维护

输入格式或来源变化时，同步引用它的测试。

## 本包事实

宿主文件测试不使用固定输入：它们在系统临时目录下现场建文件、目录与符号链接，结束后删除。这样每次运行都在真实文件系统上得到新的设备号与 inode。

[fake-supervisor.mjs](fake-supervisor.mjs) 是一次性命令归属用例的假监督工具。第一个参数选它充当 `systemd-run` 还是 `systemctl`。充当 `systemd-run` 时它扮演门进程：答就绪、起来与带进程数的退出帧，记下 `retain`，然后留到被杀。充当 `systemctl` 时它记下每次调用，`kill` 杀掉对应的进程，`show` 按单元旁的保持文件答停止中或已停。用例在临时目录写包装脚本调用它，不依赖提交的可执行位。没有 `FAKE_DIR/gate.json` 时门的行为如上；有它时，按其中的键（`onRequest`、`onGo`、`afterStarted`、`exit`、`exitAfterMs`、`onTerm`）改写门对各控制命令的回应，门收到的每条控制命令记进 `control.log`。

[scripted-systemctl.mjs](scripted-systemctl.mjs) 是成员读数与保留进程恢复用例的假监督工具，只充当 `systemctl`。它按单元旁的答复文件回答 `show`、`kill`、`stop` 与 `--help`，答复写成真实工具的「键=值」行，并记下每次调用的参数，所以用例能核对精确参数与「没有问过监督工具」。它不起任何 scope。用例在临时目录写包装脚本调用它，不依赖提交的可执行位；需要让提供者找到它时，把包装脚本所在目录放到 `PATH` 里，旁边不放 `systemd-run`，平台探测就停在第一项，不会起探测 scope。

[fake-terminal-gate.mjs](fake-terminal-gate.mjs) 是终端控制帧用例的假门进程，充当 `systemd-run`。它读描述符 3 的控制通道，在请求行、go 与每条 execute 到达时，回 `FAKE_DIR` 里 `gate-script.json` 写好的帧。每帧带请求行的 generation，字节在 `b` 里用 base64，`leg` 默认取 execute 消息的 id。帧带 `joined: true` 时与前一帧在同一次写入里发出，宿主在同一次读取里读到它们。它与 `fake-supervisor.mjs` 的区别：帧的内容由用例决定，本文件只守线上形状，不截断、不做哨兵归属。截断与归属是真门进程的行为，由慢层证明。它把自己的进程号写在单元旁，供 `fake-supervisor.mjs` 充当的 `systemctl` 杀掉。

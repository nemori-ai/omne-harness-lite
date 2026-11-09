# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，重导出五个函数与类型，以及命令一侧的两个类型
- [host-files.ts](host-files.ts)：宿主文件设施、对象身份读取与共用文件引擎
- [root-segments.ts](root-segments.ts)：宿主路径在宿主文件根下的位置，不跟随链接，Windows 文件后端与路径守卫共用
- [host-paths.ts](host-paths.ts)：路径检查、逐段走、目录描述符路径、平台前提 P2 的探测与宿主文件根的绑定
- [host-file-tree.ts](host-file-tree.ts)：列表、搜索、建目录、删除、移动、复制
- [host-file-batch.ts](host-file-batch.ts)：提交批次与恢复批次
- [host-domain.ts](host-domain.ts)：宿主文件责任域：获取记录、门面、配额与排空
- [host-provider.ts](host-provider.ts)：宿主提供者：`files` 与 `command`、资源恢复
- [host-command.ts](host-command.ts)：宿主命令设施：前置检查、启动、帧读取、有界缓冲、进程句柄与停止
- [host-scope.ts](host-scope.ts)：systemd 用户 scope：起单元、强制停止与确认、按描述列举、引用的读写、读单元成员
- [host-retained-processes.ts](host-retained-processes.ts)：保留进程索引：按保留范围计容量、标记文件、变空检测与自行结清、范围封闭、重启后从标记恢复
- [retained-tail.ts](retained-tail.ts)：保留进程移交之后的输出尾部：每条流保留最新的字节，有容量上界，只在内存里
- [host-probe.ts](host-probe.ts)：`command` 的平台前提探测（P1、P3～P6）
- [command-gate.ts](command-gate.ts)：命令的门进程脚本，在命令的单元里运行，不被导入；退出帧带单元成员数，之后留在单元里读管道
- [command-gate-core.ts](command-gate-core.ts)：命令门进程不碰 I/O 的判断：请求解析、控制行的动作、数据帧的切分、退出之后的静默判定
- [scope-probe.ts](scope-probe.ts)：P5 与 P6 的探测程序脚本，在探测单元里运行，不被导入
- [scope-cgroup.ts](scope-cgroup.ts)：进程在 cgroup v2 统一层级里的位置与单元成员，取自进程从内核读到的报告
- [macos-execution/](macos-execution/)：macOS 的命令与终端后端，机制见 [macOS 说明](../docs/macos-execution.md)
  - [native-source.ts](macos-execution/native-source.ts)：会话读取程序的 C 源码，子命令 `members`、`identity`、`children`、`stop`
  - [compile.ts](macos-execution/compile.ts)：共用编译器，先核对 `xcode-select -p`，再用 `/usr/bin/cc` 编译；会话读取程序缓存于 `$TMPDIR/omne-macos-execution/<sha256>/`，文件辅助程序使用独立的 `omne-macos-files` 缓存
  - [session.ts](macos-execution/session.ts)：调用会话读取程序并解析答复，启动身份 `kern.bootsessionuuid`，会话首进程的身份核对，停止记下的执行域
  - [domain-index.ts](macos-execution/domain-index.ts)：冷索引：`<stateDirectory>/macos-domains/` 下的标记，资源引用的读写
  - [residue.ts](macos-execution/residue.ts)：处置的判定，`none` 或 `stopping` 与它的原因
  - [commands.ts](macos-execution/commands.ts)：每份获取的命令门面：前置检查、启动、身份核对、标记、许可、帧读取、停止与处置
  - [command-gate.ts](macos-execution/command-gate.ts)：命令的门进程脚本，领自己的会话，不被导入；复用 `../command-gate-core.ts`
  - [terminal-gate.ts](macos-execution/terminal-gate.ts)：终端的门进程脚本，领自己的会话，不被导入；复用 `../terminal-gate-core.ts`
  - [terminals.ts](macos-execution/terminals.ts)：终端的 `TerminalPlatform`：准入、gate 与 shell 两个会话的记录、停止与 FIFO 目录的清理
  - [recovery.ts](macos-execution/recovery.ts)：冷索引的列举与按标记恢复
- [windows-native/compile.ts](windows-native/compile.ts)：Windows 原生程序共用的编译入口：用系统自带的 .NET Framework `csc.exe` 编译 C# 源码，按内容摘要缓存于 `%TEMP%\<缓存名>\<sha256>\`，每个进程编译一次，失败不留
- [windows-files/helper.ts](windows-files/helper.ts)：Windows 文件辅助进程：每个 harness 进程一个常驻的 `files.exe`；请求编号、排队与在途、化身、每请求超时与重启，失败的答复按 FilesHelper 模型
- [windows-files/protocol.ts](windows-files/protocol.ts)：文件辅助进程的帧：请求与答复各是一行 JSON；辅助进程的输出只在这里解析成类型
- [windows-files/native-host.ts](windows-files/native-host.ts)：文件辅助进程的 C# 帧循环：逐行读请求，在线程池上执行，持锁写答复帧
- [cordis.ts](cordis.ts)：`./cordis` 入口：Service 子类、两个声明插件、宿主文件插件与两份配置 Schema

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与依据。宿主文件读[架构的宿主文件使用](../docs/architecture.md#宿主文件使用)，再读 `host-files.ts`。宿主命令读[架构的宿主命令机制](../docs/architecture.md#宿主命令机制)，再读 `host-command.ts`、`host-scope.ts` 与 `command-gate.ts`；留下的进程再读 `host-retained-processes.ts`。macOS 读 [macOS 说明](../docs/macos-execution.md)，再读 `macos-execution/commands.ts` 与 `macos-execution/session.ts`。装配读 [Cordis 说明](../docs/cordis.md)，再读 `cordis.ts`。

- [host-terminal.ts](host-terminal.ts)：终端准入、状态、分段与停止
- [terminal-control.ts](terminal-control.ts)：有界控制帧与代际核验
- [terminal-output.ts](terminal-output.ts)：单读者原始字节缓冲
- [terminal-gate.ts](terminal-gate.ts)：scope 内的持久 Bash 与 PTY 驱动，gate 进程的 I/O 外壳
- [terminal-gate-core.ts](terminal-gate-core.ts)：gate 不碰 I/O 的判断：消息解析、控制行的分行与上界、驱动与分段源码的文本、段归属的状态机
- [terminal-sentinels.ts](terminal-sentinels.ts)：PTY 字节流里的段首、段尾哨兵，以及段内字节与段间字节的归属

- [macos-files/](macos-files/)：macOS 文件操作、根身份、P2 探测、辅助进程协议与批次清单握手，见 [macOS 文件说明](../docs/macos-files.md)。

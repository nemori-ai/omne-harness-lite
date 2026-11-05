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
- [host-probe.ts](host-probe.ts)：`command` 的平台前提探测（P1、P3～P6）
- [command-gate.ts](command-gate.ts)：命令的门进程脚本，在命令的单元里运行，不被导入；退出帧带单元成员数，之后留在单元里读管道
- [scope-probe.ts](scope-probe.ts)：P5 与 P6 的探测程序脚本，在探测单元里运行，不被导入
- [scope-cgroup.ts](scope-cgroup.ts)：进程在 cgroup v2 统一层级里的位置与单元成员，取自进程从内核读到的报告
- [cordis.ts](cordis.ts)：`./cordis` 入口：Service 子类、两个声明插件、宿主文件插件与两份配置 Schema

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与依据。宿主文件读[架构的宿主文件使用](../docs/architecture.md#宿主文件使用)，再读 `host-files.ts`。宿主命令读[架构的宿主命令机制](../docs/architecture.md#宿主命令机制)，再读 `host-command.ts`、`host-scope.ts` 与 `command-gate.ts`；留下的进程再读 `host-retained-processes.ts`。装配读 [Cordis 说明](../docs/cordis.md)，再读 `cordis.ts`。

- [host-terminal.ts](host-terminal.ts)：终端准入、状态、分段与停止
- [terminal-control.ts](terminal-control.ts)：有界控制帧与代际核验
- [terminal-output.ts](terminal-output.ts)：单读者原始字节缓冲
- [terminal-gate.ts](terminal-gate.ts)：scope 内的持久 Bash 与 PTY 驱动
- [terminal-sentinels.ts](terminal-sentinels.ts)：PTY 字节流里的段首、段尾哨兵，以及段内字节与段间字节的归属

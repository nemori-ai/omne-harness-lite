# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身、运行记录与当前缺口
- [host-file-results.spec.ts](host-file-results.spec.ts)：宿主文件使用的结果
- [host-files.spec.ts](host-files.spec.ts)：读取范围、查看、新建与预期版本
- [host-files-unsupported.spec.ts](host-files-unsupported.spec.ts)：非 Linux 宿主与有根而前提不满足时答 `unavailable`
- [host-file-tree.spec.ts](host-file-tree.spec.ts)：列表、搜索、建目录、删除、移动、复制
- [host-file-root.spec.ts](host-file-root.spec.ts)：宿主文件根的四类逃逸、竞态与根的身份，只在 Linux
- [host-file-batch.spec.ts](host-file-batch.spec.ts)：提交批次与恢复批次
- [host-file-edges.spec.ts](host-file-edges.spec.ts)：宿主文件设施的边界结果与版本一致
- [host-provider.spec.ts](host-provider.spec.ts)：宿主提供者的事实、经登记表门的账本关闭、退役与退役通知、命令启动前不起进程的拒绝与命令选项的界值、保留进程索引的装配、恢复列举与恢复
- [host-command.spec.ts](host-command.spec.ts)：真实 systemd 用户 scope 里的命令：流式输出、显式环境、有界缓冲、门一侧的暂停、停止两态、单调用中断、释放与退役、资源恢复；只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行，归慢层
- [host-command-residue.spec.ts](host-command-residue.spec.ts)：真实 systemd 用户 scope 里一次性命令留下的进程：移交与活过释放（C1）、移交之后句柄的停止答 `unconfirmed` 且服务仍可达、列表与封闭即停（C2）、满额不驱逐（C3）、封闭后拒绝（C4）、新实例从标记找回（C6）、列表隔离（C14）、自行结清与各停止原因；只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行，归慢层
- [host-command-release-scope.spec.ts](host-command-release-scope.spec.ts)：真实登记表与宿主提供者、真实 systemd 用户 scope：一次性命令留下的进程移交保留范围之后，登记表的 `releaseScope` 停止它，答 `recovered` 且无待处置项，返回时单元已不在，保留进程账本恰一条 `stopped`（`confirmed`），标记文件已删；只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行，归慢层
- [host-retained-processes.spec.ts](host-retained-processes.spec.ts)：保留进程索引（替身监督者、真实临时状态目录）：容量、标记读写、每种无效标记被丢弃、写不成的标记由维护重写（N3）、写标记不留描述符、按范围与租户列表、变空结清、重启后加载与读不到时保持未读、轮询的启停与间隔、范围封闭、停止记录与账本归属、被打断的移交作为停止中的项进入索引并并入已发出的停止（N2）；处置的复核交错（C5）、提交未知与再问、停止原因顺序
- [host-containment.spec.ts](host-containment.spec.ts)：真实 systemd 用户 scope 里的封闭收纳：命令或终端里经 `setsid` 与双重 fork 脱离会话与父进程的进程仍在执行域里，被计数、被保留，并在保留范围封闭、没有保留绑定（`unbound`）与终端关闭时随执行域停止；只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1`（终端部分另要 `OMNE_HOST_TERMINAL_LINUX=1`）时运行，归慢层
- [command-retention-conformance.spec.ts](command-retention-conformance.spec.ts)：契约套件 `commandRetentionConformance` 在真实宿主提供者上的六条 `V-EE28.` 用例：处置形状、`list` 隔离、移交之后句柄的停止、范围封闭后单元已停、没有账本视图时的停止原因。慢层，只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行。
- [host-command-custody.spec.ts](host-command-custody.spec.ts)：一次性命令留下的执行域的归属，用假 `systemd-run`（充当门）与假 `systemctl` 驱动真实的 `createHostCommands` 与保留进程索引：移交确认后第 k 个微任务到来的释放（B1）、未读移交的再问只有一个（B2）、移交之后句柄的停止不作用于执行域（N1）、确认而被打断的移交归保留范围并作为停止中的项占名额（N2）、索引加载不结束时处置仍在期限内结束（N4）、`HostTerminalOptions` 不带留下的进程的选项；快层，只在 Linux
- [host-command-frames.spec.ts](host-command-frames.spec.ts)：门的帧读取与退出帧解码、输出缓冲与单一读者、停止确认的判断、恢复引用的读取、监督工具的运行；不起 scope，两个平台都运行
- [host-command-options.spec.ts](host-command-options.spec.ts)：命令配置的校验：每个字段的接受与拒绝边界、逐字报错文本、多项非法时的检查次序、默认值参与的块与缓冲比较，`commandSettings` 的初值与 RangeError；不起进程
- [host-command-disposition.spec.ts](host-command-disposition.spec.ts)：一次性命令的启动拒绝、门没有退出帧就结束、处置的停止原因及次序、移交与未知提交的再问、句柄的两种停止、释放与保留进程的列出；真实命令设施与保留进程索引运行在假监督工具上，每次等待都有上界；快层，只在 Linux
- [host-probe.spec.ts](host-probe.spec.ts)：`command` 的平台前提探测：改变真实环境后答 `unavailable` 与诊断，前提恢复后再启动；探测程序的退出与停止结果对应的前提项
- [scope-cgroup.spec.ts](scope-cgroup.spec.ts)：统一、混合与 v1 布局下单元目录的解析，进程是否在自己的单元里，以及探测程序不在自己单元里时不以 0 退出
- [host-scope.spec.ts](host-scope.spec.ts)：单元成员读数的每个结果（已知目录直读、监督工具读失败为不可读、单元已停为 `gone`、没有控制组为不可读、映射到可读目录为成员），用假 `systemctl` 驱动；快层，只在 Linux
- [command-gate-core.spec.ts](command-gate-core.spec.ts)：命令门进程的纯判断：请求解析的拒绝理由、控制行的六种动作与 cgroup 读取的短路、数据帧的切分与键序、退出之后的静默判定；不起进程
- [terminal-gate-core.spec.ts](terminal-gate-core.spec.ts)：终端门进程的纯判断与段归属状态机：消息解析、控制行的分行与上界、驱动与分段源码逐字节不变、哨兵次序的非法情形、段间缓冲的上界、观察记录的校验与段完成；不起进程
- [host-provider-drain.spec.ts](host-provider-drain.spec.ts)：退役等在途文件操作、超界待处置与诊断
- [host-domain.spec.ts](host-domain.spec.ts)：责任域的真实文件与描述符证据：每份获取的排空、关闭失败的归属与维护重试、跨代共用配额与原记录、重建登记表后的结清、冷恢复的保守答复；排空只停止这份获取的命令进程
- [contract-conformance.spec.ts](contract-conformance.spec.ts)：登记表与宿主提供者经契约套件，以及套件拒绝的故障
- [ports.ts](ports.ts)：测试辅助：两个端口服务的替身
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：服务、端口服务、两个声明插件与宿主文件插件的装载、卸载与恢复，以及插件配置
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合与 Cordis 边界
- [fixtures/](fixtures/index.md)：测试固定输入：假监督工具与假终端门进程脚本
- [macos-execution/](macos-execution/)：macOS 的命令与终端后端，清单与运行方式见 [README.md](README.md#macos-验证)
  - [session.spec.ts](macos-execution/session.spec.ts)：会话读取程序的答复，读取失败按未知处理；快层
  - [domain-index.spec.ts](macos-execution/domain-index.spec.ts)：冷索引的标记，列举要么完整要么答 `unavailable`；快层
  - [decisions.spec.ts](macos-execution/decisions.spec.ts)：`residue` 的原因、启动请求的检查、前提项名与门的环境；快层
  - [primitives.spec.ts](macos-execution/primitives.spec.ts)：Π2、fork 下的 Π3、执行域身份、Πt；慢层，只在 macOS
  - [commands.spec.ts](macos-execution/commands.spec.ts)：真实会话里的一次性命令；慢层，只在 macOS
  - [terminals.spec.ts](macos-execution/terminals.spec.ts)：真实 PTY 与 Bash 3.2 上的终端；慢层，只在 macOS
  - [terminal-conformance.spec.ts](macos-execution/terminal-conformance.spec.ts)：契约的终端套件，7 条用例；慢层，只在 macOS
  - [fixture.ts](macos-execution/fixture.ts)：测试辅助：慢层共用的提供者、账本替身、获取与按进程号的核对

- [host-terminal.spec.ts](host-terminal.spec.ts)：原始字节、控制协议与 Cordis 增量
- [host-terminal-recovery.spec.ts](host-terminal-recovery.spec.ts)：真实 Linux PTY、分段与新进程资源恢复
- [host-terminal-segments.spec.ts](host-terminal-segments.spec.ts)：真实 Linux PTY 上段的完成与字节归属：后台进程、前台字节、段间字节、关闭终端与哨兵；归慢层
- [terminal-sentinels.spec.ts](terminal-sentinels.spec.ts)：哨兵的识别与跨块拼接，读缓冲复用时保留的半个哨兵不被覆盖，不起进程
- [terminal-control.spec.ts](terminal-control.spec.ts)：终端门控制帧读取器的状态转移与帧解码，不起进程
- [host-terminal-frames.spec.ts](host-terminal-frames.spec.ts)：门进程回的段间字节与 `begun` 帧在宿主一侧的处理，用假终端门进程；快层，只在 Linux

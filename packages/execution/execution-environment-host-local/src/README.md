# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 与 `cordis.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口对应 `index.ts`，`./cordis` 对应 `cordis.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。`index.ts` 与根入口可达的全部模块（`host-files.ts`、`host-paths.ts`、`host-file-tree.ts`、`host-file-batch.ts`、`host-command.ts`、`command-gate.ts`、`command-gate-core.ts`、`host-scope.ts`、`host-probe.ts`、`scope-cgroup.ts`、`retained-tail.ts`、`host-retained-processes.ts`、`host-domain.ts`、`host-provider.ts`、`root-segments.ts`、`macos-execution/` 下的模块），以及按文件路径起的探测程序脚本 `scope-probe.ts`，不导入 `@deepseek-ai/cordis`，也不导入 `./cordis`（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。Cordis 绑定只从 `cordis.ts` 导出。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与入口测试。根入口新增模块时，同步 [public-entry.spec.ts](../tests/public-entry.spec.ts) 的文件清单。改宿主文件使用的已接受行为，先经原接受入口。

## 本包事实

- `host-files.ts`：宿主文件设施 `createHostFiles` 与 `hostObjectToken`；共用文件引擎 `createHostFilesEngine`（选项 `root`、`stateDirectory`、`diagnose`，第二个参数是列表与搜索的上界），它给每个句柄与关闭失败的描述符记所有者，句柄代际在引擎内唯一，`seal(所有者)` 封闭一个所有者；另有一个标为 `@internal` 的测试辅助函数。根入口不导出引擎与测试辅助函数。
- `root-segments.ts`：宿主路径在宿主文件根下的位置 `hostSegmentsBelowRoot`（R2-D376）；不跟随链接，只判断位置。Windows 文件后端与应用的路径守卫共用它，根入口导出它。
- `host-paths.ts`、`host-file-tree.ts`、`host-file-batch.ts`：路径检查与宿主文件根的绑定、前提 P2 的探测；列表、搜索、建目录、删除、移动与复制；提交批次与恢复批次。它们只经 `host-files.ts` 使用，根入口不导出。
- `host-command.ts`、`command-gate.ts`、`host-scope.ts`、`host-probe.ts`：Linux 上的命令设施与它的输出缓冲、门进程脚本、systemd scope 的启动、停止与列举、前提 P1、P3～P6 的探测。
- `retained-tail.ts`：保留进程移交之后的输出尾部。每条流一块容量大小的环形缓冲，保留最新的字节，只在提供者进程的内存里；帧通道结束后关闭，索引对关闭的尾部答不可用。`host-command.ts` 创建它，保留进程索引读它。
- `macos-execution/`：macOS 的命令与终端后端。`native-source.ts` 是会话读取程序的 C 源码，`compile.ts` 在运行时编译它，`session.ts` 调用它并核对执行域的身份，`domain-index.ts` 是状态目录里的冷索引，`residue.ts` 判定处置，`commands.ts` 是命令门面，`command-gate.ts` 与 `terminal-gate.ts` 是门进程脚本，`terminals.ts` 是终端的 `TerminalPlatform`，`recovery.ts` 承担冷索引的列举与恢复。机制见 [macOS 说明](../docs/macos-execution.md)。
- `command-gate-core.ts`：命令门进程不碰 I/O 的判断（请求解析、控制行的动作、数据帧的切分、输出块的去向、退出之后的静默判定）。被 `command-gate.ts` 与 `macos-execution/command-gate.ts` 导入，门进程脚本持有状态并做 I/O。
- `scope-probe.ts`、`scope-cgroup.ts`：探测单元里运行的 P5 与 P6 程序脚本；从 `/proc/self/cgroup` 与 `/proc/self/mountinfo` 判断进程在 cgroup v2 统一层级里的位置与单元成员，平台前提探测、探测程序与终端 gate 共用，不假定挂载点。
- `host-domain.ts`：宿主文件责任域 `createHostFilesDomain`：获取记录、按文件配置共用的文件引擎、每份获取的门面（准入与在途操作，封闭时同一步封住引擎里的所有者）、配额核对与排空；它的内部面只供本包的提供者使用。
- `host-provider.ts`：宿主文件提供者 `createHostFilesProvider`、它的选项与诊断类型，以及配额、原获取查询、获取枚举、结清、前提的合并与 scope 单元的资源恢复。
- `cordis.ts`：`ExecutionEnvironmentRegistry`、`filesFacilityPlugin`、`commandFacilityPlugin`、`createHostFilesPlugin`、空配置 Schema 与宿主文件插件的配置 Schema。
- `index.ts`：重导出根入口的五个函数（`createHostFiles`、`hostObjectToken`、`hostSegmentsBelowRoot`、`createHostFilesDomain`、`createHostFilesProvider`）与类型。

`index.ts` 与 `cordis.ts` 带 `PACKAGE_TEMPLATE_DRAFT` 注释，写明还没有接受的部分：终端真实后端的独立接受、Runtime Context 生产者插件、调用方类核对。具名维护者由负责人指定。

终端实现由 `host-terminal.ts`、`terminal-control.ts`、`terminal-output.ts`、`terminal-gate.ts` 与 `terminal-gate-core.ts` 承担（`terminal-gate-core.ts` 是 gate 不碰 I/O 的判断与段归属的状态机，被 `terminal-gate.ts` 与 `macos-execution/terminal-gate.ts` 导入），接线与边界见[持久终端机制](../docs/architecture.md#持久终端机制)。

- `macos-files/`：macOS 文件后端。`facility.ts` 映射设施结果，`paths.ts` 绑定根身份，`transport.ts` 调用原生进程，`batch.ts` 与 `batch-transport.ts` 管理清单握手。`native-*.ts` 拥有 C 源码，`protocol.ts` 校验回复。机制见 [macOS 文件说明](../docs/macos-files.md)。

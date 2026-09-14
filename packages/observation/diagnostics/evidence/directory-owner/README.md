# Directory owner：已接受实现与验证范围

主调度在本地实施授权范围内接受 D1 的目录 owner 实现，作为 JSONL 与共同准入
提供者的共享诊断依赖。被验收源码为 `7e758f21f8f92c1d46fab194fdaf120239b8e11c`，
包含产品修复 `b493b2937dff3db3f872677d38a532450f505714` 与作者证据
`2f0159f2b16babf3d93f4bcac4b64f87f3caef50`。当前接口与责任归
[成员设计](../../design.md)，采用依据为
[D-010](../../../../../docs/decisions/D-010-shared-diagnostics.md) 和
[D-011](../../../../../docs/decisions/D-011-diagnostics-directory-ownership.md)。

本记录用于解释该共享依赖实际满足了哪些前提；JSONL/admission 的 O09/O10、
业务运行组合及完整观测能力仍须各自验证。它不接受整个 P1 或最小 Agent 运行闭环。

## 结果与必要证据

- 主调度在上述集成源码运行 `pnpm run check`，退出 0；格式、构建、类型及测试通过，
  包含诊断的 52 项测试、检查器的 15 项测试，以及 17 个独立制品和真实组合消费。
  [原始输出](check.log)与[命令及环境记录](checks.json)保留本次覆盖范围。
- 独立只读复核确认 `a6ee977` 至 `b493b29` 修复了写错后已真实关闭、目录却仍失败
  的来源隔离问题；真实 close 结果未知仍保留责任，不重试可能复用的数字 fd。
  原始反例与对应 GREEN 仍归[实现证据](../../../../../docs/proposals/core-capabilities/implementation/evidence/p1-diagnostics/directory-owner/README.md)。
- 仓库外的全新消费者仅直接依赖 diagnostics，records/work-data 通过三个实际
  tarball 的声明闭包提供。离线禁脚本安装后，选择性构建 fs-ext；新 Node 进程
  从已安装包的真实路径加载 addon，关闭全局模块搜索，没有祖先模块可借用。
- 严格 TypeScript 消费默认入口后，真实执行产生 start/log/span/close 四条记录，
  同目录竞争返回 `DIRECTORY_BUSY`，来源与目录资源均释放；关闭后没有输出文件的
  活文件描述符。目录权限 0700，来源和稳定零字节锁文件权限 0600；重新打开 owner
  扫描到原来源，锁 inode 保持不变。该消费者验证的是 owner 重开，未运行业务宿主。
- 主调度另核验三个 tarball 的 12 个 dist 文件与 HUB 构建结果逐字相同，实际文件
  与所记录 JSONL 相同，log/span 的租户、trace/span 关联一致，实际 addon 哈希一致。
  结果归[端点核验](endpoint-verification.json)。

[清单](manifest.json)逐件绑定原输入、输出及
[消费者证据包](consumer-artifacts.tar.gz)，归档成员均经字节/哈希核对。
它保留实际消费源码、三个 tarball、原生加载、严格编译、文件与资源结果；一般施工
进度和提示词不属于这份实现证据。

## 恢复与限制

解开证据包后先按清单核对内容。包内 `results.json` 给出最终退出码和 tarball
哈希；`consumer.ts`、`native-probe.mjs`、`tsconfig.json` 为实际输入。
原 `consumer-package.json`、lock、命令和输出中的绝对路径仅标识历史运行，复验
不要求旧目录存在：将 diagnostics 直接依赖与 records/work-data overrides 改为
已恢复 tarball 的新路径，再生成消费者锁文件。不要从当前源码重新打包后冒充原
tarball；验证新版本时另行固定源码和产物。

在仓库外的新目录运行，清除 `NODE_PATH` 并设置
`NODE_OPTIONS=--no-global-search-paths`。使用具有所需包的明确 pnpm store，
保留 `--offline --ignore-scripts --ignore-workspace` 安装；只允许 fs-ext 构建，
固定 fs-ext 2.1.1、nan 2.28.0，并显式提供 `CC`、`CXX`、`GCC_EXEC_PREFIX`。
原生构建后再执行 `native-probe.mjs`、严格编译与生成的 consumer。原始命令均在
证据包中，路径按恢复环境绑定。

实际环境为 Linux 5.15 本地 ext-family 文件系统、Node 24.18.0、pnpm 10.28.1、
TypeScript 6.0.3 与 GCC 10.5。最初默认 store 缺离线依赖而安装失败，显式选择
已有完整 store 后成功；该准备观察不能视为产品失败。编译、原生加载与真实效果
均有最终成功结果，有限场景不构成任意文件系统、崩溃交错或外部环境的证明。

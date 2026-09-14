# D1 原生独立消费者检查

工具已通过[HUB 独立整合验收](hub/README.md)；下文保留作者固定版本、原始
反例和有限消费范围，工具接受不表示 diagnostics 或 P1 产品已经接受。

## 范围与输入

本记录验证 `tools/package-checks` 对当前真实产品闭包的原生构建与加载判据。源码
基线是 `ce738731d55966a7c001bcee67a11055ea8adedb`，工具实现提交是
`804074af83d9dd6b7927ae621a31d95a9a313fb6`，共享缓存修复提交是
`fb62ba480fc47cc6ea97c3b1c4e3ff86186d0720`。真实产品输入包含 17 个 workspace
成员；`@omne-harness-lite/diagnostics@0.0.0` 精确声明 `fs-ext@2.1.1`，根锁把其
`nan` 闭包固定为 `2.28.0`，根 `pnpm.onlyBuiltDependencies` 只列 `fs-ext`。

环境为 Linux `5.15.0-1084-aws` x86-64、Node.js `v24.18.0`、pnpm `10.28.1`，
使用 P0 已核对的本地 GCC/G++ `10.5.0`。仅通过绝对 `CC`、`CXX` 和
`GCC_EXEC_PREFIX` 引用该编译器；没有安装系统工具，也没有引用其它工作树的
`node_modules` 或 addon。自己的 workspace 先执行冻结锁、禁脚本安装；消费者
安装始终为 offline、ignore-scripts、ignore-workspace，使用当前 pnpm store。
完整环境和命令见 [environment.txt](environment.txt)。

## 判据与结果

| 验收判据 | 可观察结果 |
|---|---|
| 仓库外、无祖先模块与 Node 解析隔离 | 原有 OS tmp/realpath/祖先 `node_modules`、`NODE_PATH`、`NODE_OPTIONS` 负例回归通过；保留失败消费者位于 `/tmp/omne-package-artifacts-IKcSqD`，其 `/tmp` 与 `/` 祖先均无 `node_modules` |
| 只允许固定原生闭包 | 工具拒绝其它 native 名称、缺根 allowlist、非 `2.1.1` 的产品边和非 `nan@2.28.0` 的锁映射；只有选中 diagnostics 的消费者得到 `onlyBuiltDependencies: ["fs-ext"]` 与 `nan: 2.28.0` override |
| rebuild exit 0 不能假成功 | fault injection 仅把 `pnpm rebuild fs-ext` 变为 no-op exit 0；旧工具整体成功，目标测试 RED；修复后同一控制因 `MODULE_NOT_FOUND` 被检查器拒绝，测试 GREEN |
| 实际 addon 加载 | diagnostics 独立消费者和 17 包组合消费者分别从安装包 realpath 加载 `build/Release/fs_ext.node`，`flock` 为函数，`fs-ext=2.1.1`、`nan=2.28.0`；两次二进制 SHA-256 均为 `5a480ff04f21754f6c3a8d5efd91b05d9df0ae82a72d71092a215ee2b0ae9a0d` |
| 多声明者共享 require cache | 两个独立产品 tarball 均直接声明固定原生闭包；旧 probe 在第二个声明者上因缓存差集为空而 RED。修复后从两个产品安装 realpath 分别解析 `fs-ext`，两条证据指向同一实际 addon realpath 与 SHA-256，且仍逐个核对版本和 `flock` |
| 间接原生 owner 遍历 | fixture 应用只声明 diagnostics；其独立消费者仍构建并加载 diagnostics 的 `fs-ext`，报告 `2 declared product artifact(s)` 与 `declaredBy=diagnostics` |
| 无原生边的消费者不构建 | 完整输出只有 diagnostics 独立消费者和 composition 两个 rebuild/info + load/PASS；其余 16 个逐包消费者没有 native allowlist、rebuild 或 probe |
| 缺环境失败 | 移除 `GCC_EXEC_PREFIX` 后检查在打包前以 `native artifact checks require explicit CC, CXX and GCC_EXEC_PREFIX` 非零退出 |
| 现有检查回归 | 显式编译器环境下 `package-checks` 15/15 通过且无跳过；其中包括声明/运行隔离、独立 tarball、来源、依赖、闭包、原生负控和共享缓存组合 |

固定基线还包含纯设计的 package/application 目录。首次真实运行在成员发现阶段
失败；`workspace.md` 明确设计文件不自动成为成员。最小修复按 `package.json`
发现实际成员，同时保留 fail-closed：目录已有 `src`、`tests` 或 `dist` 而缺 manifest
仍失败。这个修复只用于让固定 17 成员端点按现行 workspace 归属实际运行。

RED 原始结果及保留失败消费者检查见 [red.txt](red.txt)，最终测试输出见
[green-tests.txt](green-tests.txt)，17 个逐包消费者和完整组合的原始结果见
[green-consumers.txt](green-consumers.txt)。共享缓存反例和修复后的真实构建输出分别见
[shared-cache-red.txt](shared-cache-red.txt) 与
[shared-cache-green.txt](shared-cache-green.txt)。成功消费者按检查器既定行为在通过后
删除；输出中的 addon realpath 是加载时观测值，二进制摘要作为持久证据保留。

## 证据边界

fault-injection 用例使用真实 `fs-ext@2.1.1`/`nan@2.28.0` store 内容和最小产品
tarball fixture；shim 只让精确 rebuild 命令返回 0，并同时核对消费者 allowlist、
Node 环境隔离和三个编译器变量仍在。它证明测量器能拒绝未生成 addon 的假成功，
不证明真实 diagnostics 业务行为。后一项由固定 17 包真实 tarball 运行补足构建和
加载边界。

共享缓存 fixture 使用三个最小 project-owned 成员，但检查器实际分别打包、离线安装、
构建并加载它们的 tarball；diagnostics 与 jsonl 都直接声明已经批准的相同
`fs-ext@2.1.1`，应用仅经 diagnostics 间接到达它。这个场景覆盖即将出现的组合拓扑，
并不声称固定产品基线中的 jsonl 已经采用原生依赖。修复没有增加原生依赖选择：cache
命中只有在每个声明产品 resolver 所得 `fs-ext` realpath 下的 `fs_ext.node` 已实际加载
时才接受，缺 addon 的 no-op rebuild 负控仍非零失败。

本记录不是形式模型或无条件证明，没有运行模型、完整 HD、D1 R1 资源账目、双 factory
排他、恢复或业务验收；也不接受 D1、M1/M2 或完整批次。GCC 工具链仍是当前主机上的
临时本地资产，结果只覆盖所列 Linux/Node/pnpm/编译器和当前 pnpm store 输入。

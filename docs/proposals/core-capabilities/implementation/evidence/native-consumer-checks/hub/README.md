# 原生消费者检查的 HUB 验收

主调度接受工具实现 `fb62ba480fc47cc6ea97c3b1c4e3ff86186d0720` 及作者证据
`be9db75efa77ba1fcad5dcb6da7179cd8833b00c`，经 `6f54c75` 整合后在实际 HUB
执行 `pnpm run check`，退出 0。命令及显式编译器环境见[checks.json](checks.json)，
原始完整输出见[check.log](check.log)，文件身份与范围见[manifest.json](manifest.json)。

该运行通过格式/格式工具检查、全包构建、类型与测试，以及 17 个逐包 tarball
和完整组合消费者。检查器自身 15 项测试、零跳过，覆盖缺 addon 的空成功负控、
两个直接原生依赖 owner 共用已加载 addon、应用间接消费及原有解析隔离边界。
实际 diagnostics 和组合消费者均在仓库外构建并加载 `fs-ext@2.1.1`，使用锁定的
`nan@2.28.0`；两个 addon 摘要均为
`5a480ff04f21754f6c3a8d5efd91b05d9df0ae82a72d71092a215ee2b0ae9a0d`。
合入后的 `make docs-check BASELINE=ee73785` 另通过 458 份文档检查。

接受范围是测量工具和所列实际包消费。此次产品 diagnostics 固定在 `3ca93e0`，
其余已知 R1/R2 反例仍在修复，本记录不接受 D1 或开放 P1。双 owner 是真实
pack/install/build/load 的测试夹具，不表示 JSONL 目标 writer 已实现。D1 后续
产品修改仍须在最终整合状态重新执行受影响的包与产物验收。

作者停止且源码/证据均合入后，核对其工作树干净、无独有 ignored 临时资产、无
进程以该树为 cwd，再正常移除 `dsh-native-consumer-checks` 及已合入分支。
原失败消费者 `/tmp/omne-package-artifacts-IKcSqD` 和
`/tmp/omne-package-artifacts-JZgfCE` 位于该树外，已确认仍保留；其固定记录归
[作者证据](../README.md)，不把工作树退役等同于删除这些失败原件。

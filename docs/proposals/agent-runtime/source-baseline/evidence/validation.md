# 基线验证记录

日期：2026-09-13。对象是 `live-agent` 待验收候选，非正式版本、非已 fork 实现。
上游 commit、包版本、源文件与测试摘要见[源码清单](../upstream-baseline.json)。
受检候选的文件 SHA-256 见 [candidate-files.json](candidate-files.json)。

## 实际执行

| 检查 | 结果和范围 |
|---|---|
| 上游原语行为测试 | Node 24.18.0、pnpm 11.7.0、Vitest 4.1.8；5 文件、46 测试通过。只验证固定上游实现，未导入 OMNE 产品包。 |
| 测试副本来源 | 对比 10,308 个归档普通文件，缺失 0、不同 0；附加依赖和构建产物不在该对比内。见[对比记录](upstream-testbed-comparison.json)。 |
| 注册表 TLA+ | 2 个 ID、3 个不可复用的注册 token；34,879 生成状态，8,881 不同状态；所列安全性质通过。 |
| 发起者 TLA+ | 3 个边界，父引用只指向先前边界；2,742 生成状态，1,226 不同状态；安全性质和带公平前提的排空活性通过。 |
| 反例敏感性 | 三个故意错误配置分别要求提前删除、旧句柄按 ID 删除、提前失效触发指定不变量；完整结果见[变异记录](mutations.json)。 |
| 文档结构 | `make docs-check` 通过 232 份 Markdown 的链接、身份、来源、镜像及冻结检查；见[完整输出](docs-check.txt)，不代表设计获准。 |

模型由仓库 [formal-tasks.json](../../../../../spec/formal-tasks.json) 实际调用 TLC，而非只检查
文件存在。[完整 spec-check 输出](spec-check.txt) 记录解析、遍历、性质与退出码。
工具为 TLC 发行 v1.8.0（实际输出 `TLC2 Version 2026.09.12.025210`）、Temurin
21.0.12.1；下载 URL 与 SHA-256 见[工具清单](toolchain.json)。初次编写时发起者模型的
动作时序公式缺少方括号，解析失败；修正公式后才产生本页的通过结果。

从当前检出根运行（路径指向本机已安装的对应版本；不依赖全局 Java）：

```sh
JAVA_BIN="$PWD/tmp/formal-toolchain/jdk-21.0.12.1+1-jre/bin/java" \
TLA2TOOLS_JAR="$PWD/tmp/formal-toolchain/tla2tools.jar" make spec-check
make docs-check BASELINE=2d6eff6f7a0e7db73fb35f3ab5011fcd0a55662d
```

其他检出可以将 JAVA_BIN 与 TLA2TOOLS_JAR 设为兼容工具的实际绝对路径；缺失会失败，
不会降级为“只解析”。三份反例配置位于本目录；[命令与退出码](mutations.json)以及
[提前撤销](UnsafeEarlyDetach.txt)、[旧句柄](UnsafeStaleDetach.txt)、
[提前失效](UnsafeEarlyDispose.txt)保留完整轨迹。反例任务不登记为预期成功的正式任务。
TLC 命令关闭自动生成 trace exploration 模块，避免将运行工件写入候选规范目录；
反例轨迹仍完整输出并保留在本目录的文本记录中。

上游源测试在单独的临时测试副本根执行：

```sh
pnpm exec vitest run \
  packages/core/agent/tests/agent.spec.ts \
  packages/core/agent/tests/agent-initiator.spec.ts \
  packages/core/agent/tests/model-selection.spec.ts \
  packages/core/agent/tests/consumed-work.spec.ts \
  packages/core/agent/tests/invariant.spec.ts
```

该副本使用上游 lockfile、Vitest 配置与源码映射，依赖已安装；它不是 npm 发布包或
未来 fork 的构建验收。[原始运行输出](upstream-tests.txt)与文件对比一起界定证据范围。
规范场景逐项对应见[场景表](../design/scenarios.md)。

## 模型抽象及未覆盖范围

注册表模型将实例身份和 ID 分开，公告拆成开始/结束两个观察点，允许其间重入撤销。
监听器数量、过滤、错误报告和对象字段可变性没有建模；模型的可见性窗口是同步分发的
抽象，不承诺分发可跨线程并行。输入先满足身份相等与字段稳定前提；factory、owner 图、
tenant 和 Session 原子性也不在状态空间。未公告/已公告失败可由外部调用者撤销，
模型不假定直接 announce 失败必定自动回滚，也不证明调用者最终一定撤销。

发起者模型检查该能力的接纳、跟踪集合和释放条件，不模拟 JavaScript AsyncLocalStorage，
也不把 disposed 解释为所有注册表方法都不可调用。
Start 的父引用可以指向已结束边界，表达被异步延续保留的归因；BeginDrain 可选发起链，
表达运行环境传入的实际自卸载链，不授权排除任意无关链。安全状态转换不要求公平性；
配置中的 ConditionalDrain 额外假设所有尚可完成的边界最终释放且 Dispose 得到调度。
若某个相关 Promise 永不完成，这个活性前提不成立，上游也不保证卸载终止。

状态空间只有 3 次实例/边界创建，能够覆盖同 ID 再注册、父链及独立链交错，不能证明
任意规模或宿主实现的精化正确性。变异反例说明这些指定错误可被检测，不表示所有错误可测。
异常 Promise、序列化、授权、进程崩溃、Loop 排空和外部效果均没有得到形式化保证。

本轮未运行 Alloy，未新增 JSON Schema，也未执行要求同时安装 TLC/Alloy 的
`make spec-tools`。这是本能力当前没有独立 wire 数据和额外结构模型的范围选择；
不以既有 9 份 Schema 的结构检查结果声称新增数据契约已完成。

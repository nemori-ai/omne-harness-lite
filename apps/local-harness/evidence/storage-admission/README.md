# P1 storage/admission 实际组合证据

本目录记录 A05–A08、A30/A31 相应切片和 O09/O10 的 verification-developer
结果。它消费真实 `RecordWriter`、JSONL 文件与原生 flock、`AdmissionCoordinator`
及 D1 diagnostics；不实现 Agent、Session、治理 owner、模型或工具效果，也不构成
P1 最终接受。

## 固定输入与环境

- JSONL 最终输入：`7152a7192c84fa49c27255bfdb4f9b0e86ad8eb5`。
- admission 最终输入：`025793abbb7298b1eb86a4ca403e581a0e7a5d7b`。
- diagnostics 已接受输入：`7e758f21f8f92c1d46fab194fdaf120239b8e11c`。
- 组合测试提交：`f0a5face58613fdcbfea6285c319f3887fc1054b` 与
  `e6370bb77ec901ead01e68dc4b5ec0f452834b77`，以及本目录同批的严格回调场景。
- Linux 5.15、Node 24.18.0、pnpm 10.28.1、TypeScript 6.0.3、Vitest
  4.1.8；`fs-ext` 2.1.1 用固定 GCC 10.5 显式构建，Node ABI 137。

## 实际判据

| 条款    | 实际场景与观察                                                                                                                                                                                                                                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A05     | 同 operation 同输入认回原票据/结果，异输入具名冲突；双 stream 一项 revision 错时不发布任何 owner、不推进任一业务 stream，耐久冲突重启后原样认回；漏、重、多 publication、foreign frame/use/prepared commit 与 claimed use 被异 operation 复用均在真实 journal 改变前拒绝。                                                                      |
| A06     | 两个 Node 进程竞争同一稳定 lock inode；SIGSTOP 不允许接管，SIGKILL 后新 writer 的 epoch 单调增加；关闭后的旧 writer 和旧 frame 无新权。                                                                                                                                                                                                         |
| A07     | 未完成 LF 尾部先保存原件再修复；完整坏行保持原字节并拒绝恢复；已完整写入但 fsync 失败而对 admission 返回 unknown 的记录，重开后重新同步并认回原 committed result。JSONL 自有 27 项测试另覆盖写前、短写、部分写、目录同步、回执边界和 cleanup retained 的节点故障；`7152a719` 还验证 lock close 返回 unknown 后 retryRelease 不得伪报 released。 |
| A08     | `submit` 同步栈先发布 logical；真实 journal fsync 阻塞期间没有 durable 发布、coordinator completion 或效果门开放。A 发布失败且 B 的 fsync 已在途时调用 close，B 仍返回 `committed/publication=blocked`，B durable callback 不运行，close 不跨发布缺口。                                                                                         |
| O09     | 同时注入 journal fsync EIO 与 diagnostics `fs.write` EIO；原 operation 保持 unknown、coordinator quarantined、效果计数为零，diagnostics 自身记录 `write_unavailable` gap，关闭后资源为 released。                                                                                                                                               |
| O10     | durable publication 抛错并同时让 diagnostics 输出失败；原结果仍是 `committed/publication=blocked`，原 ExactUse 保持 retained 且未调用 release。logical/retain thenable 被同步拒绝，晚拒绝由 D1 合法 component/code 关联原 tenant、principal、operation 与 Position；门内没有启动日志 I/O。                                                      |
| A30/A31 | 五个公开包的实际 tarball 在仓库外禁用全局模块搜索与安装脚本后安装；只显式 rebuild `fs-ext`。严格消费者由默认入口完成真实提交、关闭、重开与诊断检查；安装包 manifest 无 `workspace:`，运行不借 workspace 源码。                                                                                                                                  |

A08 中授权、预算、撤权的业务含义只由精确 owner callback fixture 表达同步/耐久
发布前提；真实治理 owner 的 n/n+1 决策仍归 P2，不能由这些测试推导已经实现。

## RED → GREEN

实际组合先后检出了下列跨边界问题，最终测试保留对应反例：

1. admission `5034e6f3` 在 A publication 失败后由 close 覆盖 quarantine，导致在途
   B 越过缺口返回 ready；`4434eb15` 后 B 返回 blocked。
2. admission 原先用 system/null identity 投影带用户 operation 的诊断；`4434eb15`
   保留 prepared identity 后 correlation 通过。
3. JSONL `5b139834` 使用大写诊断 code，真实 D1 只写出
   `invalid_projection` gap；`039b1589` 后成功路径小写 code 通过。
4. admission owner 后缀曾生成带冒号的非法 component；`025793ab` 改为合法
   `admission`。JSONL failQueue 曾直接投影 `EIO`/大写 fallback；`a8a37c8f`
   固定为 `journal_durability_unknown`。修复后 late rejection 与 storage failure
   均不再产生 `invalid_projection` gap。

这些 RED 是真实 D1/JSONL/admission 组合结果；受控 `fs` 边界只决定 I/O 发生在哪个
节点，没有在 fixture 中实现提交、恢复、准入或诊断政策。

## 独立 packed consumer

[`consumer-artifacts.tar.gz`](consumer-artifacts.tar.gz) 的 SHA-256 为
`cd818c219bef9335f185408e3dd75910ba729ec38f3d01f720c64ad5ef6fcd99`。
归档包含消费者源码、严格配置、锁文件、五个实际 tarball、安装/原生构建/编译/
运行原始输出、环境与源码提交。五个 tarball SHA-256：

- admission：`7b0d8d2f4918429593c8d507514f9dc2899222a71a80a842b42ebd709f0e73e5`
- diagnostics：`3cf5776d3a81169a3e2737ab4dd417fc5bec12e4ba8ba8053d4641ffa9edf15b`
- jsonl：`56e88c8d709830e83e14d5c5049259ae2167592cf1e9d438a50f8906807fda46`
- records：`f39142544115905f9190bf5ab6544300a2c5f91030d4541e5a9b44455720d286`
- work-data：`e95428d21066117289e206a0715725421e9fd52609f0ad3329ead9e41a8acfbb`

实际运行输出为：

```json
{
  "status": "PASS",
  "firstEpoch": "1",
  "reopenedEpoch": "2",
  "committedSeq": "2",
  "publicationOrder": ["logical:2", "durable:2"],
  "diagnosticCodes": [
    "diagnostic.source_started",
    "writer_acquired",
    "commit_durable",
    "writer_acquired",
    "diagnostic.source_closed"
  ]
}
```

归档中的绝对路径只标识本次执行位置。复验时将 package manifest 的五个 `file:`
路径指向解开的 tarball，重新生成 lock，继续使用 `--offline --ignore-scripts
--ignore-workspace`，显式 rebuild `fs-ext` 后再运行 strict tsc 和生成的消费者。

## 根入口状态与限制

从仓库根运行 `pnpm -r build` 已通过 20 个可构建成员。随后 package checker 已发现
`apps/local-harness`，但当前因应用没有 `provenance.json` 以 ENOENT 失败；该文件不在
本任务写范围，原始结果分别保存在
[`package-check-red-unbuilt.log`](package-check-red-unbuilt.log)、
[`root-recursive-build.log`](root-recursive-build.log) 和
[`package-check.log`](package-check.log)。root 需要补齐应用来源记录或调整其拥有的
检查入口后再运行最终 21-member packed 检查；五包自定义真实消费者不受此缺口影响。

`pnpm -r test` 在本 spoke 缺少 checker fixture 修复 `034c760` 时，还在原生负控处
先停止：旧 fixture 没有自己的 `nan@2.28.0` override，所以先得到 lock 断言，没到达
它预期的 `MODULE_NOT_FOUND`。当前 HUB 已在两份 fixture 显式提供该 override，root
定点复验为 2/2；本 spoke 的原始旧输入输出仍归
[`root-recursive-test.log`](root-recursive-test.log)。这不抵消同一源码上 admission
34/34、JSONL 27/27 和 local-harness 20/20 的定点 GREEN；root 仍须在其拥有的
app checker 修复合入后用递归命令证明实际发现本 carrier。

本次没有模拟断电设备缓存、任意文件系统或完整治理语义；真实 SIGKILL、flock、
FileHandle I/O 与重开覆盖只支持已列交错。形式模型、独立架构评审和 root 最终接受
分别保留原责任。

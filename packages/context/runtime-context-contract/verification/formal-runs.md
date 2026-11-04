# 提交顺序与读取隔离模型的运行记录

本页记录 [RcCommit.tla](models/RcCommit.tla) 与 [RcRead.tla](models/RcRead.tla) 的 TLC 运行、守卫的变异负控与发现的缺陷。性质与映射见 [formal-mapping.md](formal-mapping.md)。

结论只在所列常量范围内成立。它不是证明，也不表示源码符合模型。原始日志不进本包，保存在任务过程目录。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | WSL 2 `Ubuntu-24.04`。先把本目录的模型、配置和 [run-tlc.sh](models/run-tlc.sh) 复制到 WSL 自己的文件系统，再在登录 shell 里运行 |
| JDK | Temurin `21.0.12.1+1` |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 参数 | 广度优先；`-workers 4`；`-Xmx4g`；`-XX:+UseParallelGC`；`-deadlock`（`MaxOps`、`Ids` 用尽是合法终止） |
| 预算 | 每个配置 600 秒。全部在预算内结束，没有缩小范围 |
| 判读 | 看日志的结论行，不看退出码本身 |
| 运行时间 | 2026-11-04（北京时间） |

输入摘要：`RcCommit.tla` SHA-256 `8556595c021a24606071f3a6c65b2ae3a8dbec2a2a93b643e02f6d44c831a958`，`RcRead.tla` SHA-256 `4aa7b97ca0c0a876f6fc7b9f5728678eb668acc4f64c2510ea2dd4caa7abaecf`。

常量：RcCommit `Ids = {i1, i2, i3}`、`Payloads = {p1, p2}`、`MaxCrashes = 1`、`DedupeCap = 3`（探针为 2）。RcRead `Vals = {1}`、`CacheCap = 1`、`MaxOps = 8`、`MaxCrashes = 1`。

## 结果

| 配置 | 期望 | TLC 结论 | 退出码 | 生成 / 不同状态 | 深度 | 用时（秒） | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rc-commit` | 无反例 | No error has been found | 0 | 204,633 / 25,992 | 15 | 1 | 正控：`TypeOK`、P1 两条、P2 两条 |
| `rc-read` | 无反例 | No error has been found | 0 | 3,068,497 / 810,669 | 9 | 8 | 正控：`TypeOK`、P4 四条、P5 两条、`P6_OwnerMemoSound` |
| `bad-apply-before-commit` | `P1_CommittedPrefix` | 同名违反 | 12 | 138 / 116 | 4 | 1 | 命中：失败的提交被送达并应用 |
| `bad-apply-before-commit-seen` | `P2_SeenIsApplied` | 同名违反 | 12 | 83 / 70 | 5 | 0 | 命中 |
| `bad-ignore-basis` | `P1_CommittedPrefix` | 同名违反 | 12 | 597 / 326 | 5 | 0 | 命中：后一笔先应用，投影不是日志前缀 |
| `bad-id-only-dedupe` | `P2_AckMeansCommitted` | 同名违反 | 12 | 4,919 / 1,870 | 7 | 1 | 命中：改写的输入被答已应用 |
| `bad-skip-parent-tenant` | `P4_TenantIsolation` | 同名违反 | 12 | 1,303 / 743 | 5 | 0 | 命中：B 的读者经父 a1 读到 A 的值 |
| `bad-cache-skips-checks` | `P4_RevokedNotServed` | 同名违反 | 12 | 28,314 / 10,789 | 6 | 1 | 命中：撤销后缓存命中仍披露 |
| `bad-memo-ended` | `P4_EndedNotServed` | 同名违反 | 12 | 550,507 / 168,287 | 9 | 2 | 命中：记住 `ended` 后，归档的作用域在崩溃后被当作开放恢复 |
| `bad-replace-no-touch` | `P5_CacheCoherent` | 同名违反 | 12 | 34,691 / 12,500 | 7 | 1 | 命中：换代清值后缓存仍给出旧值 |
| `bad-cache-unbounded` | `P5_CacheBounded` | 同名违反 | 12 | 27,412 / 10,505 | 6 | 1 | 命中 |
| `bad-rebind` | `P6_OwnerMemoSound` | 同名违反 | 12 | 1,011 / 617 | 5 | 1 | 命中：记住归属的正确性依赖引用不重绑 |
| `probe-parent-fence` | 探针 | `P4_NoDisclosureWhileReplaying` 违反 | 12 | 3,811 / 1,788 | 5 | 1 | 按实现建模（父级一跳不看围栏）命中，见缺陷 D2 |
| `probe-seen-unbounded` | 探针 | `P3_SeenBounded` 违反 | 12 | 43,763 / 9,765 | 10 | 1 | 设计本身命中，见缺陷 D1 |

负控的状态数和深度是找到第一个反例时的读数。多个 worker 时，两次运行之间可能不同。

## 守卫的变异负控

每个变异改一处 runtime-context 源码，重新构建，运行对应守卫，再还原并重新构建。还原后整套测试通过。

| 变异 | 改了什么 | 守卫 | 结果 |
| --- | --- | --- | --- |
| M1 | `holder.ts` 不比 `basedOn` 与当前修订 | `commit-order.spec.ts` | 变红：随机调度与乱序用例 |
| M2 | `holder.ts` 成功表只比提交身份 | `commit-order.spec.ts` | 变红：随机调度与改写重试用例 |
| M3 | `holder.ts` 记住乱序的失败 | `commit-order.spec.ts` | 变红：随机调度与乱序用例 |
| M4 | `producer.ts` 的 `replaceInScopes` 不推进投影版本 | `read-differential.spec.ts` | 变红：缓存实例读到换代前的值（P5） |
| M5 | `reader.ts` 的 `inheritedValue` 不核父级的租户与绑定 | `read-differential.spec.ts` | 变红：B 的读者经父 a1 读到 A 的值（P4） |

## 发现的缺陷

- **D1 已应用提交表无界增长。** `runtime-context/src/world.ts` 的 `commits` 映射每次成功的 `applyCommit` 都写入完整输入（`holder.ts` 的 `remember`），只在 `close()` 时清空。长寿进程内存随步提交数线性增长。`replay.ts` 的 `appliedCommits` 每次恢复都遍历全部作用域的全部条目。模型反例：`probe-seen-unbounded`。RC-02 只说「这份记录只在进程内保存」，没有上界或释放规则。建议拥有者：本契约先定释放规则（例如被持有者检查点覆盖的条目可以释放），再由 runtime-context 实现；`appliedCommits` 改按作用域索引。
- **D2 父级一跳不看恢复围栏。** `reader.ts` 的 `inheritedValue` 只核父级的租户与可信绑定，不核父级的 `fence` 与 `ended`。复现：父作用域发布 7，子作用域的读者读到 7；父作用域 `beginReplay` 之后，子读者的快照仍答成功并带值 7。这违背 RC-09「围栏关闭时不披露投影」。RC-01 说本阶段只有单层作用域，所以当前装配走不到；但机制接受带父引用的 `ScopeRef`。父级围栏关闭时应答拒绝、缺项还是跳过，SPEC 没有写。建议拥有者：本契约定读法，runtime-context 与 `./testing` 替身同步实现。模型反例：`probe-parent-fence`。
- **D3 `check:aa-rows` 的 E1、E2 没有覆盖全部读口（源码审读，没有反例测试）。** `apps/harness-server/scripts/aa-source.mjs`：E1 只扫 `src/entry` 与 `src/rows`；把键赋给局部变量后再 `.get`、命名空间导入的键、`inject` 的对象键写法和非首位数组元素都不报；E2 只认方法名后紧跟括号的调用，`.call(…)`、先取函数再调用、下标调用都不报。运行时 Cordis 的隔离仍使根上的按名读取得到 `undefined`，所以这些缺口不直接造成越权，但「受信名只经入口对象读取」这条机读声明不成立。建议拥有者：harness-server。

## 未执行

- P6 已有守卫的源码负控：要临时改 session-adapters 的 `context-holder.ts`，使它记住 `ended`，确认 `context-holder.spec.ts` 的对应用例变红。该目录在本次的禁区里，没有执行。
- P7 的扫描器覆盖用例没有写。

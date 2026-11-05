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
| 运行时间 | 2026-11-04（北京时间）。R2-D319 改动模型之后全部配置重跑一次，本页读数来自这次运行 |

输入摘要：`RcCommit.tla` SHA-256 `e40e76c3506c2450c6244add31789a77beb575ed999e83d06f7c0e3a63652952`，`RcRead.tla` SHA-256 `4aa7b97ca0c0a876f6fc7b9f5728678eb668acc4f64c2510ea2dd4caa7abaecf`。

常量：RcCommit `Ids = {i1, i2, i3}`、`Payloads = {p1, p2}`、`MaxCrashes = 1`、`DedupeCap = 1`、`None = none`。决定有注册决定与步提交两种。RcRead `Vals = {1}`、`CacheCap = 1`、`MaxOps = 8`、`MaxCrashes = 1`。

## 结果

| 配置 | 期望 | TLC 结论 | 退出码 | 生成 / 不同状态 | 深度 | 用时（秒） | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rc-commit` | 无反例 | No error has been found | 0 | 17,478,513 / 1,784,136 | 16 | 35 | 正控：`TypeOK`、P1 三条、P2 两条、P3 两条 |
| `rc-commit-after-only` | 无反例 | No error has been found | 0 | 17,478,513 / 1,784,136 | 16 | 27 | 正控：去掉注册修订比较（`IgnoreBasis`），同一组不变式仍成立，可达状态图与 `rc-commit` 相同。顺序只由 `after` 决定 |
| `rc-read` | 无反例 | No error has been found | 0 | 3,068,497 / 810,669 | 9 | 12 | 正控：`TypeOK`、P4 四条、P5 两条、`P6_OwnerMemoSound` |
| `bad-apply-before-commit` | `P1_CommittedPrefix` | 同名违反 | 12 | 226 / 210 | 4 | 1 | 命中：失败的提交被送达并应用 |
| `bad-apply-before-commit-seen` | `P2_SeenIsApplied` | 同名违反 | 12 | 133 / 124 | 5 | 1 | 命中 |
| `bad-id-only-dedupe` | `P2_AckMeansCommitted` | 同名违反 | 12 | 14,026 / 6,387 | 7 | 1 | 命中：改写的输入被答已应用 |
| `bad-no-after` | `P1_AppliedOnce` | 同名违反 | 12 | 7,129 / 3,399 | 7 | 1 | 命中：不比较 `after` 时，恢复之后一笔已安装的步提交被再次应用并答「已应用」 |
| `bad-no-after-stale` | `P3_StaleRetryRefused` | 同名违反 | 12 | 8,454 / 4,011 | 6 | 1 | 命中：不比较 `after` 时，已释放的提交不再答「顺序不符」 |
| `bad-no-release` | `P3_SeenBounded` | 同名违反 | 12 | 29,233 / 12,489 | 7 | 2 | 命中：不释放时成功去重表超过一项 |
| `bad-skip-parent-tenant` | `P4_TenantIsolation` | 同名违反 | 12 | 1,182 / 707 | 5 | 1 | 命中：B 的读者经父 a1 读到 A 的值 |
| `bad-cache-skips-checks` | `P4_RevokedNotServed` | 同名违反 | 12 | 27,555 / 10,497 | 6 | 0 | 命中：撤销后缓存命中仍披露 |
| `bad-memo-ended` | `P4_EndedNotServed` | 同名违反 | 12 | 496,843 / 149,233 | 8 | 2 | 命中：记住 `ended` 后，归档的作用域在崩溃后被当作开放恢复 |
| `bad-replace-no-touch` | `P5_CacheCoherent` | 同名违反 | 12 | 30,081 / 11,000 | 7 | 2 | 命中：换代清值后缓存仍给出旧值 |
| `bad-cache-unbounded` | `P5_CacheBounded` | 同名违反 | 12 | 30,296 / 11,671 | 7 | 1 | 命中 |
| `bad-rebind` | `P6_OwnerMemoSound` | 同名违反 | 12 | 1,010 / 615 | 5 | 0 | 命中：记住归属的正确性依赖引用不重绑 |
| `probe-parent-fence` | 探针 | `P4_NoDisclosureWhileReplaying` 违反 | 12 | 4,956 / 2,245 | 6 | 0 | 按实现建模（父级一跳不看围栏）命中，见缺陷 D2 |

负控的状态数和深度是找到第一个反例时的读数。多个 worker 时，两次运行之间可能不同。

可达性检查：`P3_StaleRetryRefused` 不是空真。在 `rc-commit` 的设计下，另加一条临时不变式，断言没有崩溃且成功去重表不空时，不出现已释放提交的送达。注册决定与步提交各查一次，TLC 都在第 8 个状态找到反例：一笔提交先被应用，下一笔应用后它被释放，它再次送达时答「顺序不符」。临时不变式不进本包。

## 守卫的变异负控

每个变异改一处 runtime-context 源码，重新构建，运行对应守卫，再还原并重新构建。还原后整套测试通过。M1 至 M3、M6、M7 在 R2-D319 的实现上重跑。

| 变异 | 改了什么 | 守卫 | 结果 |
| --- | --- | --- | --- |
| M1 | `holder.ts` 不比 `basedOn` 与当前修订 | `commit-order.spec.ts` | R2-D319 之后不变红。顺序由 `after` 决定，与 `rc-commit-after-only` 一致。注册修订比较保留为一致性核对，理由见 [RC-02](../SPEC.md#注册修订与提交顺序) |
| M2 | `holder.ts` 成功表只比提交身份 | `commit-order.spec.ts` | 变红：随机调度与改写重试用例 |
| M3 | `holder.ts` 记住乱序的失败 | `commit-order.spec.ts` | 变红：随机调度 |
| M4 | `producer.ts` 的 `replaceInScopes` 不推进投影版本 | `read-differential.spec.ts` | 变红：缓存实例读到换代前的值（P5） |
| M5 | `reader.ts` 的 `inheritedValue` 不核父级的租户与绑定 | `read-differential.spec.ts` | 变红：B 的读者经父 a1 读到 A 的值（P4） |
| M6 | `holder.ts` 的 `remember` 不释放前一笔（删去 `successes.clear()`） | `commit-order.spec.ts` | 变红：随机调度、已释放步提交用例、有界性用例 |
| M7 | `holder.ts` 不比较 `after` 与链头 | `commit-order.spec.ts` | 变红：随机调度、乱序用例、已释放步提交用例 |

## 发现的缺陷

- **D2 父级一跳不看恢复围栏。** `reader.ts` 的 `inheritedValue` 只核父级的租户与可信绑定，不核父级的 `fence` 与 `ended`。复现：父作用域发布 7，子作用域的读者读到 7；父作用域 `beginReplay` 之后，子读者的快照仍答成功并带值 7。这违背 RC-09「围栏关闭时不披露投影」。RC-01 说本阶段只有单层作用域，所以当前装配走不到；但机制接受带父引用的 `ScopeRef`。父级围栏关闭时应答拒绝、缺项还是跳过，SPEC 没有写。建议拥有者：本契约定读法，runtime-context 与 `./testing` 替身同步实现。模型反例：`probe-parent-fence`。
- **D3 `check:aa-rows` 的 E1、E2 没有覆盖全部读口（源码审读，没有反例测试）。** `apps/harness-server/scripts/aa-source.mjs`：E1 只扫 `src/entry` 与 `src/rows`；把键赋给局部变量后再 `.get`、命名空间导入的键、`inject` 的对象键写法和非首位数组元素都不报；E2 只认方法名后紧跟括号的调用，`.call(…)`、先取函数再调用、下标调用都不报。运行时 Cordis 的隔离仍使根上的按名读取得到 `undefined`，所以这些缺口不直接造成越权，但「受信名只经入口对象读取」这条机读声明不成立。建议拥有者：harness-server。

## 已解决

- **已应用提交表无界增长（R2-D319 已解决）。** 原实现按作用域加提交身份保存每一笔成功的普通提交，只在关闭时清空，内存随提交数线性增长；恢复时还遍历全部作用域的全部条目。现在普通提交带 `after`，本成员按作用域保存链头，成功去重表每个作用域只保留链头那一笔，应用下一笔或恢复安装时释放其余。已释放提交的重试答「顺序不符」，不重复应用。`appliedCommits` 按作用域读取。规则见 [RC-02](../SPEC.md#注册修订与提交顺序)；模型正控 `rc-commit`，负控 `bad-no-release`、`bad-no-after`、`bad-no-after-stale`；守卫变异 M6、M7。

## 未执行

- P6 已有守卫的源码负控：要临时改 session-adapters 的 `context-holder.ts`，使它记住 `ended`，确认 `context-holder.spec.ts` 的对应用例变红。该目录在本次的禁区里，没有执行。
- P7 的扫描器覆盖用例没有写。

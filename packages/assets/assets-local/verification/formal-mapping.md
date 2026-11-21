# 目录型发布的次序

规则归包组规格的[已发布的包](../../SPEC.md#已发布的包)与[发布到租户这一层](../../SPEC.md#发布到租户这一层)。模型在 `models/DirectoryPublish.tla`，四份配置的预期（正控 `complete`，负控命中哪一条性质）登记在 [models.json](models.json)，由 [check.py](check.py) 判读，命令是成员目录下的 `pnpm run verify:formal`（要 `TLA2TOOLS_JAR`）。

有限检查是模型检查，不是归纳证明，也不是源码符合性。模型是一份资产的两次发布、两份内容、一次崩溃与启动恢复、提交回执可能丢失并按操作标识重发。暂存、改名换入与一次提交各是一个原子动作，最终目录按名字与清单摘要寻址。它不证活性，不看文件内容。

前提：恢复时没有在途的发布。每个域只开一份本机资产、它打开时恢复一次，这个前提才成立；服务端由租户资产行保证（[装配](../../../../docs/architecture/runtime/application-assembly.md#tenant-assets)）。两份本机资产各自恢复，就是负控 `negative-sweep` 的情形。

| 性质 | 规格规则 | 实现 | 用例 |
| --- | --- | --- | --- |
| HeldInPlace | 读者沿持有读到的版本，它的目录一定在 | `packages.ts` 的 `swapIn` 在 `records.publishAndHold` 之前 | `packages` 的「崩在暂存之后」「崩在换入之后」「提交的回执丢了」 |
| RecordedInPlace | 记下的版本，它的目录一定在 | 同上；`mutations.ts` 的 `publishAndHold` 一次写版本与持有 | `packages` 的「已移除：同成同败」 |
| AtMostOnce | 同一操作标识至多提交一次 | `provider.ts` 的 `publishAndHold` 先按操作标识认回 | `packages` 的「提交的回执丢了」「同一个操作标识再发一次」 |
| NoLostFiles | 发布不会停在错误里丢下记下的内容 | 换入时版本目录已在就当作完成 | `package-failures` 的「takes a version directory that another publish put in place first」 |

| 配置 | 次序 | 预期 |
| --- | --- | --- |
| `positive` | 暂存、换入、一次提交 | 通过 |
| `positive-sweep-on-recover` | 同上，启动恢复删没有记录的版本目录 | 通过 |
| `negative-record-first` | 暂存、一次提交、换入 | `HeldInPlace` 违反：提交之后、换入之前持有指向还没就位的内容 |
| `negative-sweep` | 换入在前，另有一个不经恢复的清扫 | `HeldInPlace` 违反：换入、被扫掉、提交 |

`negative-sweep` 由一条源码检查守着：删版本目录只在 `packageRecovery` 里（`package-sweep` 的「a version directory is deleted only in the recovery scan」）。

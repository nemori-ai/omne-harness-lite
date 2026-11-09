# StartConsume：调用域受理与租户级 guard 域的读集断言

本目录是 W3 r6 设计包 4.3 的目标模型。r6 把 permit 与 acceptance 移进每个调用自己的域，guard 与 invalidation 留在租户级 `start-guards` 域。两个域没有共同的修订顺序，受理只能靠账本在提交时断言 guard 域版本未变。本模型检查这条断言是否足以让受理与失效线性化。实现尚未开始，第 6 节的代码名称是计划名。

现有 [StartFence.tla](../StartFence.tla) 检查的是单域 `start-coordinator` 的围栏。它随 4.3 的迁移退出，本模型接替它守 P2（失效先成立则不发起）在双域下的形态。模型只证明列出的有限状态，不证明实现。

## 1. 变量

| 变量 | 含义 |
| --- | --- |
| `step` | 历史变量：两个域所有提交的线性化计数。没有参与者读它 |
| `guardRev` | guard 域的当前版本 |
| `invApplied[i]`、`invRev[i]`、`invReturned[i]` | 失效 i 的提交步、它产生的 guard 版本、所有者收到答复的步。0 表示尚未发生 |
| `prepares[c]`、`permit[c]` | 调用 c 已签发的 permit 数；当前 permit 记录的 guard 版本，`NoRev` 表示没有 |
| `observed[c]` | 执行者为本次 consume 读到的 guard 版本，`NoRev` 表示尚未读 |
| `consumes[c]` | 调用 c 的 consume 次数 |
| `accepted[c]` | `{}` 或一条受理记录 `[rev, guard, at]`：permit 版本、提交时的 guard 版本、提交步 |

## 2. 动作

| 动作 | 含义 |
| --- | --- |
| `Prepare(c)` | 读 guard 域，把当前版本写进调用域的 permit。新 permit 替换旧的 |
| `InvalidateCommit(i)` | guard 域提交：版本加一 |
| `InvalidateReturn(i)` | 所有者在提交之后才收到答复 |
| `ConsumeRead(c)` | consume 的前半步：执行者读 guard 域 |
| `ConsumeCommit(c)` | consume 的后半步：向调用域提交受理。正控下账本在提交时断言 `guardRev = permit[c]`；断言不成立则不写（永久拒绝记录不影响本性质，未展开）。`DropAssertion = TRUE` 时执行者只比较自己早先读到的 `observed[c]`，然后无条件提交 |

读与提交分开，是本模型要暴露的交错：失效可以在两步之间提交。

## 3. 假设与有限边界

- `Calls = {c1, c2}`，`MaxPrepares = 2`，`MaxInvalidations = 2`，`MaxConsumes = 2`。
- 没有公平性，不检查进展。`CHECK_DEADLOCK FALSE`。
- 租户隔离、permit 的身份校验、inspect 与 exclude 不在本模型里。它们由 StartFence 的 P3、P4 和宿主测试守住，迁移后另行对应。

## 4. 性质

| 名称 | 含义 |
| --- | --- |
| `AcceptedAtCurrentGuard` | 每条受理记录的 permit 版本等于它提交那一刻的 guard 版本。受理与失效在 `step` 顺序上线性化 |
| `FenceAfterReturn` | 失效的答复返回所有者之后，再提交的受理不基于比该失效更旧的版本 |
| `OneAcceptancePerCall` | 每个调用至多一条受理 |

## 5. 负控

| 配置 | 去掉的规则 | 必须命中 |
| --- | --- | --- |
| `drop-assertion` | consume 不在提交时断言 guard 域版本 | `AcceptedAtCurrentGuard` |

反例：`Prepare(c1)` 记录版本 0；`ConsumeRead(c1)` 读到 0；`InvalidateCommit` 把 guard 升到 1；`ConsumeCommit(c1)` 凭早先读到的 0 提交受理，记录 `[rev 0, guard 1]`。

## 6. 代码对应

实现尚未开始。下表是计划中的对应位置，全部标为待实现。

| 模型 | 计划中的代码位置 | 状态 |
| --- | --- | --- |
| `guardRev`、`InvalidateCommit`、`InvalidateReturn` | `tool-host-local` 租户级 `start-guards` 域的 guard 与 InvalidationRecord | 待实现 |
| `permit`、`accepted`、`Prepare`、`ConsumeCommit` | `tool-host-local` 调用域的 permit 与 acceptance 记录 | 待实现 |
| `ConsumeCommit` 的断言 | `tool-contract` 账本端口「同一租户内带读集断言的条件提交」（由 `commitGuardedHost` 推广） | 待实现 |
| `step` | 无代码对应；证明用的线性化顺序 | — |

## 7. 运行与判读

使用 OpenJDK 21 与 TLC 1.7.4。通过 `--jar` 或 `TLA2TOOLS_JAR` 指定 JAR，摘要固定为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`，不匹配时拒绝运行。

```sh
export TLA2TOOLS_JAR=/path/to/tla2tools-1.7.4.jar
python3 packages/tool/tool-host-local/verification/models/start-consume/check.py --out tmp/<task>/start-consume
```

可用 `--case positive` 选一个配置。脚本用一个 worker，每配置上限 120 秒，日志与汇总写到 `--out`。正控要求退出 0 且 TLC 明确完成检查；负控要求退出 12 且唯一违反的不变量等于指定名称。

## 8. 本次运行结果

2026-11-09，macOS，OpenJDK 21.0.13，TLC 2.19（tla2tools-1.7.4），1 个 worker。

| 配置 | 结果 | 命中 | 生成状态 | 不同状态 | 时间 |
| --- | --- | --- | --- | --- | --- |
| `positive` | 通过 | — | 690,481 | 299,701 | 7 s |
| `drop-assertion` | 命中 | `AcceptedAtCurrentGuard` | 139 | 126 | 6 s |

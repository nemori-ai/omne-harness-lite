# PublishedCount：已发布计数由本进程保管

本目录的模型检查 [RT-06](../../../SPEC.md#rt-06) 的规则。模型只证明列出的有限状态，不证明实现。

## 1. 建模的对象

一个会话的 Agent 记录发布计数。存储只在一次发布所带的计数等于当前计数时接受它，接受后计数加一。保管者记着本进程知道的计数：上一次读根的答复，或本进程上一次提交成功的发布带回的值。别的写者是别的进程的发布。

| 变量 | 含义 |
| --- | --- |
| `store` | 存储里的计数 |
| `known` | 保管者知道的计数，或不知道 |
| `pending` | 本进程在途的一次发布所带的计数 |
| `age` | 已知计数距离上次被存储确认过了多少拍 |
| `taken` | 最近一次调用取到的计数，以及取用时它的年龄 |
| `applied` | 本进程最近一次提交成功的发布所带的计数，以及当时存储的计数 |

## 2. 动作

| 动作 | 含义 |
| --- | --- |
| `Tick` | 时间过一拍 |
| `OtherPublish` | 别的进程发布 |
| `ReadRoot` | 读根：不知道计数，或已知计数超过 `MaxAge` |
| `Take` | 调用不读存储，取已知计数 |
| `Send` | 按已知计数发出一次发布 |
| `Committed` | 存储接受：已知计数前进，并被确认 |
| `Refused` | 存储拒绝：已知计数作废 |
| `Unknown` | 答复丢失，发布可能生效也可能没有：已知计数作废 |

## 3. 性质

| 名称 | 含义 |
| --- | --- |
| `KnownIsPast` | 已知计数不超过存储的计数。所以按它决定的发布要么在这个计数上被接受，要么被拒 |
| `TakenIsBoundedStale` | 调用取到的计数，距离被存储确认不超过 `MaxAge` 拍 |
| `PublishedOnCurrent` | 本进程提交成功的发布，所带的计数就是当时存储的计数 |

## 4. 配置

| 配置 | 去掉的规则 | 必须命中 |
| --- | --- | --- |
| `positive` | 无 | 三条不变式都成立 |
| `assume-applied` | 答复未知时把计数当作已前进 | `KnownIsPast` |
| `never-read` | 不论已知计数多旧都不再读根 | `TakenIsBoundedStale` |

发布被拒后让已知计数作废，是为了下一次调用读到新计数后能前进。它关乎进展，不关乎上面三条安全性质，由用例守：`session-adapters/tests/journal-adopted-request.spec.ts`。

## 5. 运行

```
TLA2TOOLS_JAR=<TLC 1.7.4 的 jar> python3 check.py --out <输出目录>
```

## 6. 模型到代码

| 模型 | 源码 |
| --- | --- |
| `Take`、`ReadRoot` 的选择 | `src/published-count.ts` 的 `planPublishedCount`（全函数）：答 `known` 或 `read` |
| `ReadRoot`、`Committed` 之后的确认 | `PublishedCounts.confirm` |
| `Refused`、`Unknown` 之后的作废 | `PublishedCounts.doubt` |
| `Send` 与三种结局 | `session-adapters/src/cordis/agent-journal.ts` 的 `sync`、`settle`、`settleCommitted` |

判据用例：`tests/published-count.spec.ts`、`session-adapters/tests/journal-root-reads.spec.ts`。

## 7. 模型不覆盖的

- 一次读根的答复晚于一次发布到达。实现让计数只增不减：低于已知值的答复不改已知值。由 `tests/published-count.spec.ts` 守。
- 调用方有结局未知的写时每次都读根。它是为了尽早知道那次写的结局，由 `session-adapters` 的用例守。
- 视图怎样由批折叠而来。归 `session-adapters` 的 Journal 核心。

# Handoff：交接释放

本目录的模型检查交接释放：消费方耐久承接后，Tool 才释放普通副本；同一采用身份只追加一次。性质的含义归领域文档的[性质与守护点](../../../../../../docs/domains/tool-execution/architecture.md#性质与守护点)，Tool 与 Session 的协议归[跨域交接](../../../../../../docs/domains/tool-execution/architecture.md#跨域交接)。模型守的是性质，与正文保管机制无关。实现对应见第 6 节。

模型只证明列出的有限状态和假设，不证明实现。它检查安全性，不承诺消费者会回执、会完成处理或会恢复：消费者无限故障时，生产者保留责任正是正确行为。取消、容量背压和失败终结不由此模型推导。

## 1. 变量

模型有两个结果、两个租户、两个处理者。处理者可以交错请求同一结果，也可以处理不同结果。每个请求显式携带 result、tenant、version；版本 1 合法，版本 2 为不匹配候选。两个租户都可以出现在请求中。

| 变量 | 含义 |
| --- | --- |
| `tool` | 生产者仍保管的结果集合 |
| `claim` | 受信消费者已提交可靠承接的结果集合 |
| `processed` | 消费者已可靠记录处理完成的结果集合。它不代表 guest 内存或 Promise resolve |
| `known` | 生产者已收到或查询到的承接证据；它与实际承接事实分离 |
| `appended[r]`、`binding[r]` | 消费位置的耐久记录次数，以及结果、租户、版本绑定 |
| `request[p]` | 处理者 p 尚未完成的请求 |

## 2. 动作

| 动作 | 含义 |
| --- | --- |
| `Start(p, r, t, v)` | 处理者发出请求，只记录请求 |
| `Commit(p)` | 核对请求的结果、租户、版本，在消费者自己的提交边界写入 claim、绑定和逻辑记录；不同时释放 Tool。回执可以在它之后全部丢失。`Bug = "duplicate"` 时每次提交都追加一条 |
| `Reject(p)` | 身份不匹配的请求被拒绝 |
| `Query(r)` | 生产者按原结果认回耐久 claim |
| `LoseAck(r)`、`Crash` | 丢失回执知识，保留已经提交的事实 |
| `Process(r)` | Tool 仍持有时，消费者已可靠完成处理：另一条合法的释放依据 |
| `Release(r)` | 生产者凭 `known` 或 `processed` 解除保管。`Bug = "early"` 时无依据也释放 |

`Commit` 的抽象前提是消费者把耐久材料或足够的恢复依据与 claim 置于同一可靠提交边界。一个裸引用或非耐久 ACK 不满足它。

## 3. 假设与有限边界

- 两个结果、两个租户、两个处理者；版本固定为 1，版本 2 只作为不匹配请求。没有对称性约简。
- 没有公平性，不检查进展。`CHECK_DEADLOCK FALSE`。
- 一个结果只取一个消费位置；完整 tenant/call/result/delivery 复合键由结果索引抽象。程序消费者的独立交付不在模型里：每个交付各自满足本模型。
- 不覆盖同一文本身份在不同租户下的复用、Session 提交未知、同身份异值冲突、伪造回执。

## 4. 性质

| 名称 | 含义 |
| --- | --- |
| `NoResponsibilityGap` | 不在 `tool` 里的结果，都已被 claim 或已处理完成 |
| `AtMostOneAppend` | 每个结果的消费位置至多追加一条 |
| `ClaimHasDurableRecord` | 已 claim 的结果恰有一条耐久记录 |
| `ClaimBinding` | 已 claim 的结果，其绑定的结果、租户、版本都与原结果一致 |

归纳论证（`Bug = "none"`）：取加强不变量 `known ⊆ claim`、`R \ tool ⊆ claim ∪ processed`，以及 claim、processed 只增不减。初态三者为空，`tool = R`。只有 `Query` 增加 `known`，它要求结果已在 `claim`；`LoseAck`、`Crash` 只减小 `known`。`Commit` 增加 `claim`，`Process` 增加 `processed`，都不删 `tool`。唯一减少 `tool` 的 `Release` 要求结果属于 `known` 或 `processed`；前者由加强不变量推出属于 `claim`。只有 `Commit` 写 `appended`，正常模式把它设为 1；`Valid` 守卫保证写入 `binding` 的请求与原结果一致。

## 5. 负控

| 配置 | 去掉的规则 | 必须命中 |
| --- | --- | --- |
| `early` | 无 claim、无处理完成也允许释放生产者 | `NoResponsibilityGap` |
| `duplicate` | 同一结果每次重传都追加一条 | `AtMostOneAppend` |

负控配置只列目标性质，保证反例确实走到它。

## 6. 代码对应

下表是对应位置：`Query`、`Release` 已实现，其余仍待实现。

| 模型 | 计划中的代码位置 | 状态 |
| --- | --- | --- |
| `Commit`、`appended`、`binding` | Session 消费方对 ResultRecord（tenant/call/resultVersion）的耐久承接提交，沿用 retained/processed 协议 | 待实现 |
| `Query`、`Release` | `tool` 包 `ledger-decider.ts` 的 `decideRelease`：`releaseTarget` 核对 retained/processed 回执属于原消费方（`Query`/`Process` 的依据），同一提交写入 `released` 交付、操作回执并把记录值换成 `releasedResultValue`（`ledger-result-material.ts`）：content 换成卸载原文的 summary（内联结果为空）、attachments 为空、data 与正文描述符不变；按操作认回与已释放状态回复使再次释放不再写入。测试：`tool/tests/managed-delivery.spec.ts`（C6 内联）、`tool-storage-sql/tests/release-live.spec.ts`（真实 SQLite，卸载） | 已实现 |
| `Process` | 消费方在 Tool 仍保管时耐久记录处理完成 | 待实现 |
| `LoseAck`、`Crash` | 回执丢失与重启后的按原身份认回 | 待实现 |
| 程序消费者的独立交付 | 结果提交时依据固定请求中的发起方建立的程序交付；模型交付释放不影响 `data` | 待实现 |

## 7. 运行与判读

使用 OpenJDK 21 与 TLC 1.7.4。通过 `--jar` 或 `TLA2TOOLS_JAR` 指定 JAR，摘要固定为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`，不匹配时拒绝运行。

```sh
export TLA2TOOLS_JAR=/path/to/tla2tools-1.7.4.jar
python3 packages/tool/tool-contract/verification/models/handoff/check.py --out tmp/<task>/handoff
```

可用 `--case positive` 选一个配置。脚本用一个 worker，每配置上限 120 秒，日志与汇总写到 `--out`，不写进本目录。本目录不保存执行结果。正控要求退出 0 且 TLC 明确完成检查；负控要求退出 12 且唯一违反的不变量等于指定名称。超时、解析错误和其他非零退出均失败。

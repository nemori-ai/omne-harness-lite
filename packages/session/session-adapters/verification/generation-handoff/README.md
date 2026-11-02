# 进程代次与准入记录模型

本资源检查进程代次退役、准入记录的完整保存、重试认回与执行路由唯一性。行为模型是 [Generation.tla](Generation.tla) 和 [Handoff.tla](Handoff.tla)。运行器不会调用产品代码。

## 采用范围

模型版本为 1。输入基线为 `2e6fa47b1e95b8f0108fbe2032d9f9457f4b54a8`，采用 #502 r3 的 R2-D15 与线包 5.0。模型没有改变产品契约。

| 拥有者                                                                                    | 采用条款                                                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [session-adapters SPEC](../../SPEC.md#j06-会话路径的两个-agent-提供者)                    | J06 的 Ki/H 原身份、完整 request、origin、原主体与 outcome，固定后才返回       |
| [Agent SPEC](../../../../agent/agent-contract/SPEC.md#消息准入)                           | prepare 的步骤 2、4、6，原结果先认回，异输入冲突，首次来源不被新主体或路由覆盖 |
| [Agent 恢复切点](../../../../agent/agent-contract/SPEC.md#准入的恢复切点)                 | 准入已经固定后崩溃，沿原 Ki/H 查询，不重复准入                                 |
| [Runtime Context SPEC](../../../../context/runtime-context-contract/SPEC.md#当前授权前提) | 捕获的 current 在失效后不能恢复，异步等待后须重核                              |
| [session-storage-sql SPEC](../../../session-storage-sql/SPEC.md#执行索引)                 | `(tenant, execution)` 到 Session 的唯一映射，同名 execution 可分别属于不同租户 |

进程代次只保护当前进程内读取方的生命周期。模型不证明 #677 的跨进程同步撤权，也不把原授权答复替换为过程内缓存。模型把原授权的 current 固定为真，单独检查进程桥能否拒绝已经退役的引用。

## 状态与动作

### Generation

| 变量         | 含义                                         |
| ------------ | -------------------------------------------- |
| `active`     | 每个读取方当前分配的代次                     |
| `live`       | 每个读取方当前代次是否仍可使用               |
| `retired`    | 已经退役的读取方与代次对，作为性质的历史观察 |
| `captured`   | 首次 await 之前捕获的引用                    |
| `delivered`  | 异步授权答复已经返回的引用，允许答复晚于退役 |
| `lateAnswer` | 答复确实在原引用退役之后返回的可达性标记     |

`Capture` 固定读取方与代次。`Deliver` 结束异步等待，不重新捕获代次。`Retire` 使当前代次失效。`Assemble` 分配新代次，新引用可用，旧引用仍失效。另一个读取方可以在这些动作之间继续工作。

模型用 `live` 与代次相等表达一个引用的当前性。基线应用实际以不可复用的 `Generation` 对象和单向 `retired` 位实现相同的单读取方生命周期。模型不要求产品改为数字计数器。

### Handoff

| 变量                           | 含义                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| `routes`                       | 耐久的 `(tenant, execution, session)` 关系                        |
| `intents`                      | 耐久保存的完整原请求记录，包含 origin、原主体、资格依据与实现采用 |
| `indexes`                      | 耐久的 Ki 到 H 索引                                               |
| `outcomes`                     | 耐久固定的 prepared 或 rejected，引用完整原记录                   |
| `phase`、`original`、`pending` | 两个调用方的易失执行位置、认回的原记录与尚未固定的候选结果        |
| `running`、`mayCrash`          | 进程是否存活，以及有限模型的一次崩溃是否尚可发生                  |
| `starts`                       | 每个调用方在有限模型中已经开始的尝试数                            |
| `replies`                      | 调用方已经观察到的结果集合，崩溃不能撤销这些观察                  |
| `publications`                 | 每个 H 实际固定新结果的次数，只作验证计数                         |
| `recovered`                    | 重启后 lookup 已经读到原结果的可达性标记                          |
| `beforeCrash`                  | 崩溃时已经固定的结果，只用于证明恢复见证读到的是崩溃前的结果      |

| 动作               | 抽象的公开边界                                                                       |
| ------------------ | ------------------------------------------------------------------------------------ |
| `BindExecution`    | Session 创建执行时的耐久路由写入，已有同租户同 execution 的不同 Session 时拒绝       |
| `Start`            | 一个准入调用开始，可与另一个调用交错                                                 |
| `SaveIntent`       | 在同一耐久顺序检查 Ki/H 冲突并保存完整原记录与索引；同输入认回，不改原 origin 和主体 |
| `Compute`          | 产生候选 prepared 或 rejected，不固定结果，也不代表历史已经提交                      |
| `Commit`           | 事务内重读原结果；已有结果认回，否则固定候选结果。两个并发调用可以先各自产生不同候选 |
| `Reply`            | 把固定结果交给调用者，正常控制只允许在 `Commit` 后返回                               |
| `RetryOrLostReply` | 丢失答复或显式重试，丢弃调用栈，仍沿原身份再次调用                                   |
| `Crash`、`Restart` | 任意调用切点都可崩溃，清除全部易失位置与候选；保留耐久状态及调用者观察               |
| `Lookup`           | 按原租户、execution 与 Ki 只读结果，不创建意图，不重新计算 outcome                   |

准入分为完整意图与最终 outcome 两个耐久切点，对应 Agent prepare 的步骤 4 与 6。只有意图时，还没有 recorded outcome。最终 outcome 与完整原请求共同可读后才能返回。每个 `SaveIntent`、`Commit` 是事务发布边界，`partial-record` 负控把索引单独发布，检查这一抽象是否足以检出半保存。

`Ki` 和 `H` 都包含租户与 execution。`request` 是完整业务输入的等价类标记。`origin`、原主体、资格依据与实现采用保存在原记录中。合法重试可以来自另一主体或实例，但仍返回首次记录。当前资格检查被抽象为已完成的入口前提，不把原资格依据当作本次许可。

## 性质与负控

| 条款 | 不变量                                    | 正常预期                                                      | 移除的控制与具名配置                                                                            |
| ---- | ----------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| P1   | `RetiredNeverCurrent`                     | 所有已退役捕获引用的 current 为假，包括晚到答复和重装后的引用 | `bad-retirement` 不关闭 live；`bad-generation-check` 不比较引用代次                             |
| P1   | `LiveReaderUnaffected`                    | 未退役读取方的当前引用仍可使用                                | 与 P1 的退役负控共同检查，避免正常控制退化为恒假                                                |
| P2   | `AtomicRecord`                            | 索引与完整意图对应，outcome 有完整原记录                      | `bad-partial-record` 只发布索引                                                                 |
| P2   | `ReplyIsDurable`、`RestartRetainsReplies` | 已返回的结果在返回时与重启后都仍可读                          | `bad-early-reply` 在 Compute 后返回，随后崩溃丢失 outcome。该配置只检查重启性质，以保留重启反例 |
| P3   | `UniqueHandoff`                           | 同 Ki 或 H 只能认回同一完整原记录                             | `bad-ki-rebind` 与 `bad-h-rebind` 允许不同输入占据原索引                                        |
| P3   | `UniqueExecutionRoute`                    | 同租户同 execution 只对应一个 Session                         | `bad-execution-rebind` 允许写入第二个 Session                                                   |
| P4   | `OriginalResult`、`AtMostOneAdmission`    | 同 H 永远返回原 outcome，固定新结果至多一次                   | `bad-repeat-admission` 再次计入准入固定；`bad-original-result` 绕过原结果选择，暴露同 H 的不同结果 |

所有正常配置也检查 `TypeOK`。负控只删除表中指定控制，不改变输入范围。它们必须得到 TLC 退出码 12、指定不变量与完整反例。语法失败、超时、其他退出码或错误性质均不算命中。

两个 `witness-*` 配置使用正常控制，故意否定一个可达状态。`witness-late-answer` 必须到达“引用退役后答复仍返回”。`witness-recovery` 必须到达“崩溃重启后 lookup 返回原结果”。这些轨迹检查场景没有被排除，不是产品缺陷或安全性质的负控。

## 范围、公平性与假设

Generation 枚举两个读取方，每个最多三代。Handoff 枚举两个调用方，每个最多两次开始，允许一次崩溃与重启。每个配置有两个具体请求，可共用或冲突 Ki/H、内容或执行路由。prepared 与 rejected 都由 TLC 枚举。七个正常 Handoff 配置分别覆盖相同输入、内容冲突、Ki 冲突、H 冲突、Session 冲突、跨租户同名 execution，以及互不相同的 execution。

两模型不取笛卡尔积。current 不决定准入记录的身份或存活，准入状态也不决定读取方的代次。这里没有新增两者共同提交的保证。产品组合仍须验证真实依赖撤除如何到达桥，以及存储调用如何兑现事务边界。

本资源只检查安全性质，不加弱公平或强公平。不承诺任意调度下必然完成。`Spec` 允许停顿，`CHECK_DEADLOCK FALSE` 避免把有限尝试耗尽当成产品死锁。它不排除两次调用之间、存储前后或返回前后的崩溃交错。

以下假设和未覆盖范围不能由 TLC 通过消除。

- 耐久事务一旦发布，在模型内不会丢失。真实 flush、介质故障与事务隔离要由存储验证兑现。
- 请求形状、租户与当前访问资格已经核对。模型不证明解析器、授权或秘密处理正确。
- `Compute` 没有外部效果。转换效果、exclude、P/Ja/Rh 的责任闭包与消息历史应用不在本模型。
- 任意规模、更多崩溃、任意输入字节、无限重试与真实外部服务进展均未证明。
- 生产 prefixes、authority 主体类别和登记表缺席语义保持待裁。模型只比较不透明身份，不依赖这些选择。
- 无形式精化证明。源码映射不能替代产品故障注入、真实 SQLite 或跨服务组合验证。

## 源码映射与后续实现义务

| 模型位置                         | 基线源码与状态                                                                                                                                                                                                                           | 实现必须核对的切点                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Capture`、`Deliver`             | [runtime-context-trust.ts](../../src/runtime-context-trust.ts) 的 `capture`、`bridged` 与三种 authority 方法已存在                                                                                                                       | 首次 await 前捕获，原 current 与桥 current 合取，晚到答复保留原引用                   |
| `Retire`、`Assemble`             | [应用进程桥](../../../../../apps/harness-server/src/entry/runtime-context-trust.ts) 的 `Generation`、`bridgeOf`、`trustFor` 已存在                                                                                                       | 每个读取方的 effect 撤除使原对象永久退役。应用修改归 Reduce，不属于本资源             |
| `intents`、`outcomes`            | [Agent 公开类型](../../../../agent/agent-contract/src/passages.ts) 的 `InputHandoff`、`InputOrigin`、`HandoffOutcome`、`HandoffLookup` 已存在                                                                                            | 实际请求、完整原来源、主体稳定身份与结果同原 H 关联；原资格依据不替代当前许可         |
| `SaveIntent`、`Commit`、`Lookup` | [J06](../../SPEC.md#j06-会话路径的两个-agent-提供者) 的生产 handoff 提供者在输入基线上未交付                                                                                                                                             | 后续在独立表与迁移实现完整记录、唯一索引、事务内重查和按原身份恢复，不并入 `er_state` |
| `BindExecution`                  | [执行索引迁移](../../../session-storage-sql/src/worker/execution-index-migration.ts)、[路由读取](../../../session-storage-sql/src/worker/read-execution-session.ts) 与 [Journal 路由](../../src/cordis/agent-journal-provider.ts) 已存在 | 路由与原 SE13 同事务，冲突不覆盖；读取按 tenant 与 execution，不从调用连接猜归属      |

既有 Agent `model-reception`、Finishing 与 Session frontier 模型分别覆盖结果接收、终结与日志前沿。本资源不修改它们，也不将它们的通过结论用于 P1～P4。

## 运行

在 Windows 宿主的 Git Bash 中，从仓库根运行。先取得负责人分配的 TLC 窗口。运行器经 WSL `Ubuntu-24.04` 启动 Java，模型只在新建的 WSL `/tmp/omne-generation-*` 目录运行。Windows 代码树和依赖不会被 WSL 构建。

```bash
export PYTHONUTF8=1
unset UV_DEFAULT_INDEX
export OMNE_TEST_SLOT_DIR='C:/Users/ALIENW~1/AppData/Local/Temp/omne-test-slots-ALIENWARE'
python packages/session/session-adapters/verification/generation-handoff/run-models.py --help
python packages/session/session-adapters/verification/generation-handoff/run-models.py --self-test
node scripts/with-test-slot.mjs python packages/session/session-adapters/verification/generation-handoff/run-models.py \
  --output tmp/line-session-run/w2/M-GENERATION/tlc-run
```

`--output` 必须是新目录，避免覆盖证据。`--case` 可重复指定配置。`--syntax-only` 只跑 SANY，不枚举状态，不能作为安全性质通过。原生 Linux 验证可用 `--backend native`，仍须由宿主提供运行名额。默认每例 180 秒、1 worker、1024 MiB heap、seed 502、fingerprint 0。

运行器保存源码快照、各配置日志与 `results.json`。汇总包含输入 head、所有模型和配置哈希、Java/TLC 版本、jar 哈希、命令、退出码、状态数与深度。全部要求命中时运行器退出 0，判据不符退出 1，工具或传输失败退出 2。模型负控自己的 TLC 退出码仍保留为 12。运行器回传结果后清理 WSL 临时目录，不保存 TLC 状态缓存。

## 当前核验结果

2026-11-02 在 Windows Git Bash 经 WSL Ubuntu-24.04 运行完整配置集。首轮完整结果在 `tmp/line-session-run/w2/M-GENERATION/tlc-corrected`。独立评审后增加原结果认回负控，并在 `tmp/line-session-run/w2/M-GENERATION/parent-tlc` 重跑全部配置，运行器退出 0。8 个正控退出 0，9 个负控和 2 个可达性见证各自退出 12，均命中指定不变量。

工具为 TLC2 2.19，2024-08-08，revision `5a47802`。Java 为 Temurin `21.0.12.1+1-LTS`。jar 的 SHA-256 为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`。参数为 1 worker、1024 MiB heap、每例 180 秒，未发生超时。

| 配置                       | 生成状态 | 不同状态 | TLC 退出码 | 日志结论                   |
| -------------------------- | -------: | -------: | ---------: | -------------------------- |
| `generation`               |    43207 |    10943 |          0 | 遍历完成，队列为 0，无反例 |
| `handoff-same`             |    18433 |     4386 |          0 | 遍历完成，队列为 0，无反例 |
| `handoff-payload-conflict` |     7051 |     1922 |          0 | 遍历完成，队列为 0，无反例 |
| `handoff-ki-rebind`        |     7051 |     1922 |          0 | 遍历完成，队列为 0，无反例 |
| `handoff-h-rebind`         |     5575 |     1922 |          0 | 遍历完成，队列为 0，无反例 |
| `handoff-route-rebind`     |     5750 |     2016 |          0 | 遍历完成，队列为 0，无反例 |
| `handoff-cross-tenant`     |    47607 |    12445 |          0 | 遍历完成，队列为 0，无反例 |
| `handoff-independent`      |    47607 |    12445 |          0 | 遍历完成，队列为 0，无反例 |
| `bad-generation-check`     |       22 |       16 |         12 | RetiredNeverCurrent        |
| `bad-retirement`           |        7 |        6 |         12 | RetiredNeverCurrent        |
| `bad-early-reply`          |      452 |      245 |         12 | RestartRetainsReplies      |
| `bad-partial-record`       |       21 |       15 |         12 | AtomicRecord               |
| `bad-ki-rebind`            |      107 |       62 |         12 | UniqueHandoff              |
| `bad-h-rebind`             |      107 |       62 |         12 | UniqueHandoff              |
| `bad-execution-rebind`     |       10 |        8 |         12 | UniqueExecutionRoute       |
| `bad-repeat-admission`     |     1118 |      549 |         12 | AtMostOneAdmission         |
| `bad-original-result`      |     1124 |      550 |         12 | OriginalResult             |
| `witness-late-answer`      |       25 |       19 |         12 | NoLateAnswer               |
| `witness-recovery`         |      747 |      362 |         12 | NoRecoveredResult          |

已核对关键轨迹。提前返回负控经过 `Compute → Reply → Crash → Restart` 后失去原 outcome。重复准入负控出现两个并发 `Commit`。恢复见证经过 `Commit → Crash → Restart → Lookup` 读取崩溃前的结果。其他负控分别在旧代次重新装配、退役、部分索引发布、Ki/H 第二次绑定和执行第二次绑定时变红。

SANY 静态解析与运行器判据自测也通过。原始日志、源码快照和逐例命令在任务 tmp 的 `tlc-corrected/`。本表只记录上述有限配置的结果，不代表产品实现符合性或真实组合已经验证。

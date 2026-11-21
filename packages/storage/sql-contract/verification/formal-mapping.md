# 认回与准入等待：性质、模型与实现的对应

三个模型各检查[包组规格](../../SPEC.md)的一条规则：[RecallAtCommit.tla](models/recall-at-commit/RecallAtCommit.tla) 检查「认回在提交时做」（规格「身份与认回」），[RecallOwnRecord.tla](models/recall-own-record/RecallOwnRecord.tla) 检查 `recall: 'never'` 的身份由调用方自己的记录认回（同一节），[AdmissionWait.tla](models/admission-wait/AdmissionWait.tla) 检查准入点的有界等待（规格「准入等待」）。每个目录的 `check.py` 要求正控以 0 退出并完成搜索，每份负控以 12 退出并且只违反点名的那一条。模型只证明列出的有限状态，不证明实现。

## RecallAtCommit

一个操作有若干次调用（含另一个进程的重试）与若干代次。调用方只在代次 g 是早先调用的回滚回执时才换到 g + 1。存储执行之前先认同一身份的回执，认到就原样答它并标明认回；答复丢失的调用方再次发送之前先问存储。

| 性质         | 含义                                       | 规格不变式 |
| ------------ | ------------------------------------------ | ---------- |
| `AtMostOnce` | 所有代次、所有调用加起来，写至多生效一次   | ST-3       |
| `OwnIsOwn`   | 把已提交回执当成自己的那个调用确实执行了它 | ST-3       |
| `OneWriter`  | 至多一个调用执行了写                       | ST-3       |

| 配置                         | 去掉的规则                                 | 预期              |
| ---------------------------- | ------------------------------------------ | ----------------- |
| `RecallAtCommit-positive`    | 无                                         | 三条不变式都成立  |
| `RecallAtCommit-no-mark`     | 答复不标认回，调用方把每份回执都当成自己的 | 违反 `OwnIsOwn`   |
| `RecallAtCommit-blind-retry` | 答复丢失后不问存储，直接发下一代次         | 违反 `AtMostOnce` |

| 模型              | 代码                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Commit` 认到回执 | `sqlite-provider/src/worker/group.ts` 的 `admit` 答 `recalled: true`；同组同身份的等待者在 `settleReceipt` 里答 `recalled: true` |
| `Commit` 执行     | 同文件的 `settleReceipt`：本条目自己的调用答 `recalled: false`                                                                   |
| `Take`、`Query`   | 消费者的提交适配：Session 的 Journal 提交、`session-storage-sql`、`model-storage-sql` 的提交                                     |

不覆盖：同身份异输入（`identity_conflict`，它不执行，与认回同一条路）；`recall: 'never'` 的身份（见 RecallOwnRecord）；`releases` 放回执。模型里的回执不删除，三条性质只对还留着回执的身份成立；调用方只在身份不会再来之后放它的回执（规格「身份与认回」）。

## RecallOwnRecord

一个操作的身份声明 `recall: 'never'`，存储不留回执。参加者有自己的操作记录，与写在同一个事务里写下，靠它认出同一操作：记录在，就不再写。发出的提交可能在调用方的答复丢了之后才执行。答复丢了的调用方先问存储：存储只知道这个身份还有没有提交在途；不在途了，调用方再读自己的记录。

| 性质           | 含义                                                         | 规格不变式 |
| -------------- | ------------------------------------------------------------ | ---------- |
| `AtMostOnce`   | 所有调用与重送加起来，写至多生效一次                         | ST-3       |
| `OwnIsOwn`     | 把写当成自己做的那个调用确实做了它                           | ST-3       |
| `AbsentIsTrue` | 调用方得出「没提交」时，写确实没有生效                       | ST-6       |

| 配置                        | 去掉的规则                                         | 预期                |
| --------------------------- | -------------------------------------------------- | ------------------- |
| `RecallOwnRecord-positive`  | 无                                                 | 三条不变式都成立    |
| `RecallOwnRecord-own-first` | 调用方先读自己的记录，再等存储答不在途             | 违反 `AbsentIsTrue` |
| `RecallOwnRecord-no-dedupe` | 参加者不按自己的记录认出同一操作，再执行一次就再写 | 违反 `AtMostOnce`   |

正控对「全部调用都有了结局」写成显式的终止步，其余卡住的状态仍按死锁报告。

| 模型                     | 代码                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `Run` 认出自己的记录     | 各调用方参加者按自己的表认出原操作：Agent 日志 `er_operation`、预准入 `er_preadmission`、会话 `sl_operation`、Model `md_operation` |
| `Query` 的「不在途」     | `sqlite-provider/src/query.ts`：`never` 身份不在待决索引、五项证明齐全时答 `settled`          |
| `Query` 之后读自己的记录 | 调用方的未知路径：Agent 日志的 `settleHeld`，会话提交的 `resolve`，Model 提交的 `freeGeneration` |

不覆盖：回滚之后换下一次尝试的代次（同 RecallAtCommit 的代次规则）；多个身份；存储之外的读者。

## AdmissionWait

四个准入点用同一个结构，所以只建一个。一个请求要占本域一个位置、一个全局位置和若干字节；它空闲、按到达顺序等待、持有预留或已离开。每一步改变持有者或等待者之后，从队头扫一遍等待列表。

| 性质                      | 含义                                                       | 规格不变式 |
| ------------------------- | ---------------------------------------------------------- | ---------- |
| `Bounded`                 | 等待者数不超过上限                                         | ST-10      |
| `DeadlineKept`            | 没有等待者等过期限                                         | ST-10      |
| `WithinCapacity`          | 持有的预留不超过个数、字节与每域的上限                     | ST-10      |
| `NoOvertake`              | 被放行的请求前面，没有一个只因全局资源而没拿到的更早等待者 | ST-10      |
| `NoIdleFit`               | 每一步之后，等待列表里没有现在就放得下的请求               | ST-10      |
| `NothingSentWhileWaiting` | 等待者不持有预留，因此什么都没有发出                       | ST-10      |

四份配置用同一组取值：4 个请求、3 个域、每域 1 个位置、全局 2 个位置与 2 个字节、期限 2 拍；请求 `c` 占 2 个字节，会被全局字节挡住，而它后面的 `d` 放得下。

| 配置                      | 去掉的规则                         | 预期                  |
| ------------------------- | ---------------------------------- | --------------------- |
| `AdmissionWait-positive`  | 无                                 | 全部不变式成立        |
| `AdmissionWait-jump`      | 新来的请求放得下就直接拿，不先排队 | 违反 `NoOvertake`     |
| `AdmissionWait-no-rescan` | 到期与中止之后不重扫               | 违反 `NoIdleFit`      |
| `AdmissionWait-wake-all`  | 扫描时放行全部等待者               | 违反 `WithinCapacity` |

| 模型                     | 代码（`sqlite-provider/src/waiting.ts`）                        |
| ------------------------ | --------------------------------------------------------------- |
| `Arrive` 的立即拒绝      | 等待列表已满。永远放不下的请求由配置关系排除，模型里是 `ASSUME` |
| `Arrive` 入队再 `Settle` | `acquire`：先入队，再 `scan`                                    |
| `Release`                | 预留的 `release` 之后 `scan`                                    |
| `Leave`                  | 期限到或 `signal` 中止：移出等待列表，再 `scan`                 |
| `Scan`                   | `scan`：放得下给预留，被本域挡住跳过，被全局挡住停止            |

不覆盖：关闭时全部等待者答 `closing`；读的期限计入 `readQueueTimeoutMs` 的全程，模型只当成一个期限；更大的规模与真实时长。

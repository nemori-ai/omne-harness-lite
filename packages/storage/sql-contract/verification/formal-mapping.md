# 认回与准入等待：性质、模型与实现的对应

两个模型各检查[包组规格](../../SPEC.md)的一条规则：[RecallAtCommit.tla](models/recall-at-commit/RecallAtCommit.tla) 检查「认回在提交时做」（规格「身份与认回」），[AdmissionWait.tla](models/admission-wait/AdmissionWait.tla) 检查准入点的有界等待（规格「准入等待」）。每个目录的 `check.py` 要求正控以 0 退出并完成搜索，每份负控以 12 退出并且只违反点名的那一条。模型只证明列出的有限状态，不证明实现。

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

不覆盖：同身份异输入（`identity_conflict`，它不执行，与认回同一条路）；`recall: 'never'` 的身份。

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

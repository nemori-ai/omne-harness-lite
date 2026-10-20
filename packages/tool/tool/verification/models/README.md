# Tool 有限行为模型

## Invoke 原意图恢复模型

[InvokeRecovery.tla](InvokeRecovery.tla)检查来源拥有的普通调用关联，行为依据为[契约的普通操作](../../../tool-contract/SPEC.md#342-普通操作与实例目录)。它不模拟存储驱动或生产耐久。

## 有界范围与判据

模型有两个调用者、两个完整 tenant/consumer 键和两个固定请求值。初始状态枚举键与请求的所有分配，覆盖同键同请求、同键异请求及不同键。identity 由全局递增分配器生成，history 保存每键实际分配过的身份，不把唯一性当环境假设。安全配置最多分配两个身份，负控允许最多四个。

stage 的 0、1、2、3、4 分别为尚未关联、reserved、issued、admitted、settled。关联提交、来源返回、admission 提交和回执返回分别行动。丢答与提交是独立动作，UnknownIssuance 有原引用，LoseSource 可以没有引用。引用和回执是调用者可见事实，不能由服务端状态替代。

| 性质 | 模型判据 |
| --- | --- |
| 每键唯一身份、未知不换身份 | OneIdentityPerKey 与 ReturnedOriginal |
| 异输入不能覆盖 | ConflictPreserves，冲突保持原 history 和 fixed，pinned 检查原固定请求不被覆盖 |
| settled 不重启 | SettledDoesNotRestart，Launch 只在首次 admitted 且未启动时发生 |
| 依赖恢复后继续推进 | PendingProgress，每个 reserved 最终 admitted 或 settled |

进展以依赖最终恢复、调用者公平重入、来源签发与准入步骤公平执行为前提。healthy 只从 false 变成 true，恢复后不再丢答。Launch/Settle 不加公平假设，进展只要求 stage 达到 admitted，未来收场不是本卡恢复进展的前提。它不证明故障永不恢复时的进展。资格、凭据、scope 授予和真实 executor 的正确性由实现组合测试覆盖，未形式化。

## 源码映射与抽象

| 模型动作 | 实现位置与抽象 |
| --- | --- |
| Resolve | [testing-source.ts](../../src/testing-source.ts) 的 resolve，在当前资格核验后读取唯一键，在无 await 的写段分配保存 reservation。完整请求被抽象为两个不同值，完整键被抽象为两个键；回执内容和权限判定未形式化，由组合测试检查 |
| Issue、ReturnSource、LoseSource、UnknownIssuance | 同文件 reserved/issued 及 runtime 的来源结果映射。来源分配与签发没有异步事务等待；同步 beforeIssue 钩子直接保留 reserved 并返回原身份的 issuance-unknown，下一次同键续签。模型拆分签发与返回，测试还覆盖已签发来源的未知回包；两者均不证明生产签发事务 |
| Admit、ReturnReceipt、LoseAdmission | [runtime.ts](../../src/runtime.ts) 调用原 admissions.admit；[ledger.ts](../../src/ledger.ts) 按原 operation 和固定输入认回。模型将各域的既有内部提交对账抽象为一步 |
| Launch、Settle | driver 的原启动围栏与已接受启动唯一性。真实 ledger 当前只推进到 running，settled 代表已有最终收场事实的安全分支，完整执行终局仍未实现 |
| Repeat | 同键原意图再次 invoke，不以当前 lookup 的空读换身份。唤醒丢失及补 wake 由组合测试验证，模型通过公平 Resolve、ReturnSource、Admit 和 ReturnReceipt 表达同意图准入续做，不对 Launch/Settle 加公平前提 |

该模型不涵盖跨进程、断电、UUID 碰撞、生产来源存储排除、实际停止、调度扫描或外部效果 exactly-once。两个 runtime 共享内存来源的测试只证明该实例的并发唯一性。

## 运行

在仓库根运行，元数据与单次输出写获准的任务 tmp。TLC 需已安装，命令不下载依赖。

```sh
node scripts/with-test-slot.mjs tlc -workers 1 -noGenerateSpecTE -metadir tmp/issue-547/tlc-safe -config packages/tool/tool/verification/models/InvokeRecovery.cfg packages/tool/tool/verification/models/InvokeRecovery.tla
node scripts/with-test-slot.mjs tlc -workers 1 -noGenerateSpecTE -metadir tmp/issue-547/tlc-unsafe -config packages/tool/tool/verification/models/InvokeRecovery-unsafe.cfg packages/tool/tool/verification/models/InvokeRecovery.tla
```

安全配置须完整搜索后报告无错误并通过 PendingProgress。负控将未知恢复改成再次分配并覆盖原键，必须报告 `Invariant OneIdentityPerKey is violated`，不能以语法失败或工具未运行代替反例。工具版本、文件哈希、状态数、退出状态和原输出保留在任务 tmp，单次通过不成为永久无条件保证。

## 事实保管交接模型

[FactCustody.tla](FactCustody.tla) 检查 #431 的原事实责任交接。模型有一个固定 call/start/source、两个连续批次、原值与冲突值、已保存事件、原 receipt、pending、源 released、confirmed 和调用方可见 reply。每个批次抽象一个具有相同身份的事件。它不建模 cursor 字符串，只以 0、1、2 表示相邻边界。

| 判据 | 性质 |
| --- | --- |
| 源释放前已有完整保管 | SourceReleaseRequiresCustody |
| 保存后仍有 pending 或 confirmed 责任 | DutyRetained |
| 原 receipt 不丢失、不替换 | OriginalReceiptRetained |
| 同事件异值不保存 | ConflictingEventNotSaved |
| 重投不复活已确认责任 | ConfirmedIsNotPending |
| cursor 只越过已保管批次 | CursorHasCustody |

Receive 将完整事件、receipt、cursor 与 pending 抽象为一个 call 域原子 CAS 动作，对应 [ledger-facts.ts](../../src/ledger-facts.ts) 的 decideReceiveFacts/commitBatch 和 [ledger.ts](../../src/ledger.ts) 的 transact。已提交未知由 Receive(answer=unknown) 表示，未提交未知由 UnknownDropped 表示。Repeat 对应同批认回及同事件冲突拒绝，不把未知当成没有保存。

SourceAck 对应 [driver-facts.ts](../../src/driver-facts.ts) 经原 live/recover 发送 receipt。它只允许已保存原 receipt 的批次释放。源释放与 Confirm 分成两个动作，二者没有共同事务。Confirm 对应 [ledger-fact-ack.ts](../../src/ledger-fact-ack.ts) 的确认、操作回执与任务删除共同提交；ConfirmationDropped 保留源已释放但本域 pending 的切点。确认操作身份抽象为原批次身份，不枚举任意 operation 字符串。Repeat 不改变 confirmed 或 pending，覆盖后续批次后旧批重投。

模型假设 call 域提交原子、来源只凭有效原 receipt 释放、来源 ACK 对同 receipt 幂等、外部 guard 正确认证。实际权限、P01 排除围栏、值复制、多个 event、来源 evidence、opaque cursor、异步 reader 和原子 store 的实现由行为测试补充，没有精化证明。模型只检查有限安全性，不施加公平性，不证明进展、生产耐久、跨进程恢复或外部效果 exactly-once。

在仓库根使用已安装 TLC，单 worker，输出写任务 tmp。

```sh
node scripts/with-test-slot.mjs tlc -workers 1 -noGenerateSpecTE -metadir tmp/issue-431/unit-c/tlc-safe -config packages/tool/tool/verification/models/FactCustody.cfg packages/tool/tool/verification/models/FactCustody.tla
node scripts/with-test-slot.mjs tlc -workers 1 -noGenerateSpecTE -metadir tmp/issue-431/unit-c/tlc-unsafe -config packages/tool/tool/verification/models/FactCustody-unsafe.cfg packages/tool/tool/verification/models/FactCustody.tla
```

正控须搜索完成并无错误。负控允许未保管就源释放，须命中 Invariant SourceReleaseRequiresCustody is violated。解析失败或其他非零退出不构成预期反例。工具版本、JAR 和模型/config SHA-256、命令、状态数及原输出保留任务 tmp。

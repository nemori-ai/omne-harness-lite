# 节点失败收尾的有限模型

本模型检查已受理执行的原写认回、故障保持、取消、责任收场及原结果归属。承诺归 [Agent SPEC](../../SPEC.md)，实现守护见 [节点故障映射](../node-failure.md)。模型是有限抽象，不是源码精化证明。

## 状态与拥有者

phase 区分 business、original、F1、F2、F3、wait 和 ended。pending、original、request 表达同一原 Journal 写。fault、candidate 和 beforeTerminal 表达本地故障意图及完成判断。inputHeld、receivedA、toolHeld 表达原拥有者确认的责任事实。current 只区分原执行 A 与后继 B。

Agent 可以提出候选和等待。只有 Finish 在 Journal 的完整条件成立时写 ended。Session 的输入资格不在本模型中，也不由 Agent 改写。ReceiveOriginal 始终保存 A 的结果，后继 B 不改变原消费身份。

## 不变量及实现对应

| 不变量 | 初态与转移的归纳依据 | 实现接缝 |
| --- | --- | --- |
| UnknownOriginal | 初态没有 pending。ThrowAfterWrite 同时固定原身份，Recognize 只清 pending，不重编号 | coordinator 的原写保存、query/replay，original-writes 回归 |
| NoPrematureEnd | 初态未结束。唯一 Finish 要求原写已确定、输入有处置、调用 received 或真实 held、完成判断有效 | F1/F2/F3、Journal 责任清单与 tryFinish |
| NoBusinessAfterFault | NodeFailure 进入 F1，故障后的 F1/F2/F3/wait/Wake 没有 business 后继 | 私有故障意图、已保存 node-failed 的恢复路线 |
| OldExecutionIsolation | ReceiveOriginal 只写 receivedA，StartNext 只改 current | 原 ConsumerRef、producer reference 和 consumption |
| EffectiveCancelFirst | Cancel 不在 ended 后发生，Finish 要求有效取消对应 cancelled 候选 | 原写认回后的取消核验、F0 和条件终结 |

输入耐久保管只采用现行 node-failed 规则，精确输入处置证明归 agent-contract。此模型把输入处置抽象为一个布尔值，不能替代 taken、watermark、共同提交和参加者检查。故障对象的来源隔离及相同 complete 拒绝后的等待分别由 [来源模型](../failure-provenance/README.md) 和 [等待模型](../finish-refusal/README.md) 检查。

## 有限范围与活性前提

模型包含两个 execution 身份、一个原写、一个未取入输入、一个 Model 或 Tool 调用、一次取消，以及 F1/F3 各至多一次不可用。Model 模式必须收到原结果。Tool 模式的初态已经有真实受信保管，普通 associated 引用不能据此提前结束。

LiveSpec 对实际存在的认回、取得依据、固定候选、完成判断、输入处置、原结果接收、取消路由、唤醒及终结动作施加弱公平。FiniteHealthyEnds 只在这些前提和有限责任内成立。原接收动作还要求有效 receive-result 资格、生产者最终交付及可用持久提供者。

模型不展开全部 Journal 方法、SQL 事务、任意责任数量、失权、多进程、crash takeover、所有候选替换或完整回执。永久 unknown、无限 changed、未应用 Passage/card 和缺少真实执行器的路径没有活性保证。旧模型与新模型分别验证，不声称已经完成模型组合证明。

## 运行与负控

从仓库根运行，输出目录须尚不存在。工具版本、输入哈希、日志和状态数由共用执行器记录在任务 tmp。

```sh
scripts/with-test-slot.sh python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/agent/agent/verification/failure-closure tmp/formal-agent-failure-closure --jar "$TLA2TOOLS_JAR"
```

四个正向配置分别检查 Model/Tool 的安全性与有条件活性。四个负控分别重编号原写、跳过调用责任、唤醒后重开业务、把旧结果交给后继。每个负控必须退出 12，并违反 expect.txt 指定的不变量。解析或工具失败不算负控检出。

本模型与配置从本波已采用的设计模型原样保存。持续维护者改变上述承诺时，应同步模型、源码映射和行为守护。单次运行结果不写入本目录。

# 失败来源与实际经过的 Run 绑定

2026-09-29，revision 1，candidate；本增量未技术采用、未实施。节点仍为 `packages/agent-loop/loop-extension-runner`。新增签名均为候选，不改既有语言无关契约、公开服务操作或业务失败集合。

## 输入、反例与范围

沿已接受 [Runner5 S-5/S-21/S-26/S-53/S-54](../../../../spec/capabilities/loop-extension-runner/v5/contract.md)、[LC6](../../../../spec/data/loop-extension/v6/contract.md)、[RT10 S-76](../../../../spec/capabilities/model-request-runtime/v10/contract.md)；本节点 [v7](v7-model-service-design.md) 与 runtime [v17](../../model/model-request-runtime/v17-model-consumption-design.md) 的采用由 [D106 后继](../../../../record/decisions/runner-current-pure-provider-adoption/decision.md)给出。Runner5 SHA256 为 `e571e01d8e4d86fec3904d9decb37beb38615940125f320a72c250fd63ca4c43`，RT10 为 `add7ff23a73a6ad5a749f40f6707f408f60d33b6032080ad6ba4751f10d5695c`；v7 为 `caf86ef7b78dae0a106ced11d14951bdc667e6eed1a1a6950758c7e06fe754a3`，v17 为 `a4e73586c1614126874b641428914c767d0d8a2e514b93b615c7fc1f188f5b8e`。需求与 Cordis 4.0.4/配置错误政策继承这两个节点，不新增产品政策。

本次主线给出的真实 QA 反例：noRun 模型调用的合法 failureSubject/source，被调用者包装成另一 Run 的 `after_model_call{failure}` 经过。当前 `RunnerPorts.verifyFailure(subject,binding)` 及 `ModelFailureSource.verify(subject)` 未携实际经过 execution；完整主体相等、同会话/日志代际核对仍不能排除这次挪用。v17 已承诺 source 固定原请求 Run，本页补其接到真实经过的缺口，不改“经过可跨 attempt 存续”。源码读数基线 `7595c196`；已有 runPass、服务、登记与 v17 source，实现不等于本反例已修。

## 责任到实现差量

| 行／契约责任 | 本节点兑现点 | 符合性依据／缺口 |
|---|---|---|
| R8-P1；S-5/S-21/S-53 | 公开 runPass 将实际、校验并自有捕获的 RunnerPass.execution 交 verifyFailure 第三参 | runtime v18 同批 verify 上下文与 R8-V1～V4；不再从 subject 猜 Run |
| R8-P2；S-21/S-26，RT10 S-76 | 受信组合先核真实 binding/generation，再投影 execution 给同次 source.verify | invalidInput 与 unavailable 原集合，准备期失败零新外部取得/求值/写入；R8-V2/V5 |
| R8-P3；S-5/S-28/S-54 | Run 相同与 attempt 可跨重演分开；同经过已落结论复用，重复 retry 原序列保留 | 不要求本次 attempt 等原发出 attempt，不重新求已给件；R8-V3/V4 |
| R8-P4；S-34，SL3 原 owner 保证 | source、scope、贡献和物理日志原 owner 成对收口 | 不新建 writer/store/fiber；R8-V6 |

## 唯一接口账本与调用次序

runner 唯一拥有的候选差量：

```text
RunnerPorts.verifyFailure(subject: PositionedSubject,
                          binding: RunnerLogBinding,
                          execution: RunnerExecution)
  -> Promise<原 verified(subject,release) | invalidInput | unavailable>
```

第三参直接来自本次真实 `RunnerPass.execution`。公开 runPass 和 Cordis dispatch 均在首个异步边界前完成其形状校验与自有捕获，后续 verify、LC 输入、日志写入 fence 使用同一执行值；不得一处使用复制值、另一处再读可变调用者对象。service 的请求已作自有读取仍须在交 host 前固定执行上下文。此处不新增另一个 execution DTO，复用现有 RunnerExecution；本页不定义 runtime 的来源值类型。

同批 [runtime 节点](../../model/model-request-runtime/README.md)的 `v18-failure-execution-design.md`（SHA256 `2d5aeded046158adfe213cb279ee1f7cd9462d2651986c6326e4d28022a4e06e`）唯一拥有 `ModelFailureSource.verify(subject,execution:ModelFailureExecution)` 的技术签名与来源核验，execution 的内容为 `{run,attempt}`。组合 adapter 接到第三参后：

1. 核实际 manifest/session/tenant、runner logGeneration 与 runtime 同一个物理日志 owner 的代际对应；仍是装配取得的关系，不能信请求附带“匹配”的标志。
2. 只有实际 execution.kind=withRun 才构造 `{run,attempt}`；noRun 的 after_model_call 在原表示/位置检查已为 invalidInput，adapter 也不转换为假 Run。位置/维度和完整原主体照既有 core 判定。
3. source 从其创建时固定的原 owned prefix/原 dispatched 认所属 Run；本次 run 必须逐值相等且原调用确实有 Run。attempt 只校合法形状并忠实传本次经过值；其真实准入与提交仍由 runner 原尝试栅栏/宿主负责，**不要求等原 dispatched attempt**。source 的上下文形状不构成新的权限证明。
4. 返回仍映射为原 verified/invalidInput/unavailable。source 已 release、撤权或代际不可用先 unavailable；可用 source 下原调用 noRun、跨 Run、坏 execution 或改过的主体为 invalidInput。不得把这些错误交给 P5/onError 当作者错误，或先写一条不可用结论来遮蔽来源失败。

source 完整返回与失败优先级以 runtime 同批节点为唯一权威，runner 只消费上述投影，不依赖 runtime 私有文件；runtime 不反向 import runner 类型。主线须一起评审/采用两边精确签名。旧二参 verifier 不保留兼容重载，所有真实 host/demo/测试构造一并迁移。

准备阶段需要新 external 句柄的宿主，须先完成同一实际 execution 的 source.verify，再取得句柄；public runPass 在求值/读取经过结论之前仍执行自己的第三参核验。构造 source 所需已发生的授权读不算“零 IO”；拒绝时要求 **新 external acquire=0、贡献 invoke=0、结论 append=0、模型 send=0**。不能先 acquire 后把释放称为满足零取得，也不能用准备时另读尾返回裸 failureSubject 来凑这一步。普通追加不撤销已捕获原前缀；source 是否仍可使用按原代际/使用权核，非 tail 没变谓词。

成功后 verified.release 与调用者 finally 可以幂等重复执行；验证失败或准备半途退出时原 source 持有者负责 release。入口不开始 runner、取消、宿主关门也不能漏掉来源借用。已有完整有序 retryConclusions、两次同值保留两位置、P5 计数及 guard 后再发送的规则不变。

## 受信示例验收装配

`examples/model-invocation-minimal-demo` 可以在构造期显式接入受信、有限的 controlled fixture，以验证原 Run 的失败经过；CLI 仍无新增 Run 命令。其工程挂接名称为候选，不另设产品 app 或公开 beginRun。

fixture 先经示例实际 auth/current session tenancy，借用该 session **现存 sessionLogOwner** 的 scoped 窄写端、真实 binding 及现有 assetRegistry.refreshAvailability 原报告路径；用正式 MS6 `attempt_started` 值和 SL3 原 fence 写真实尝试事实，报告的 session/run/attempt 必须与本次调用一致。所借闭包由宿主限制到该次已授权会话和原日志，不向外暴露任意日志构造/close；不能由测试私开第二个 JSONL writer，不能伪造 report 来绕过原模型调用准入。

同一构造期可注入已有 RunHistoryReader；受控 fixture 的有限终结解释假设必须在测试报告明示，不能成为生产默认认法。G28/完整 Run 仍由外部 owner 承担；合法生产来源缺席时仍沿原 unavailable。失败来源必须来自实际 withRun 模型调用自己的 prefix，而非把 noRun 失败配给测试 Run。

fixture scope 经现有 owner 登记跟踪，正常/失败/取消 finally 撤借用，宿主停止时禁止新取得。shared owner 的关准入、物理日志实际停止、恢复认回、unknown drain 次序沿 v7；本增量没有独立日志 close 权。只读 replay 仍不 acquire failure 消费权、不新增 attempt 参数、不求值或补写。

## 生命周期、存储与取舍

没有新 Cordis 服务、fiber、持久对象或后台工作；仅现有调用的执行值与 source 借用。装卸依 [v7](v7-model-service-design.md)及其已核 basis，特别不依赖兄弟 effect 撤除顺序。配置错误仍在静态构造期失败，运行时来源失效仍具名返回；本页不新增上游 Cordis 行为主张。

共同持久对象仍为同一 SL3 会话日志的原 dedupe 位置/尝试栅栏。A 核 source 后 B 推进 attempt：A 已落结论照原值保留，尚未写入则由实际 fence 裁决，不能靠本次上下文声称锁住旧尝试；A 提交 unknown 后 fiber 撤除，原 shared task owner 继续持责，source.release 不解除 unknown。无需把来源核验与新独立表做“同事务”。

| 候选选择 | 落选方最强理由 | 本方弱点／置信度 |
|---|---|---|
| verifier 显式第三参复用 execution | 扩 binding 看起来少一参数 | binding 指物理日志而非一次经过，混入会扩大其身份责任；第三参需迁移所有端口，但可直接验证来源是实际pass。高 |
| runtime verify传run及attempt，Run相等而不钉死原attempt | 仅run更窄，避免误认为attempt获认证 | 带attempt必须明确真实性归runner/fence；它能保真交接实际执行并支持负控，不能据此新增授权。高 |
| fixture借现owner scoped端 | 私开临时writer准备数据更简单 | 借用需装配改动与清理测试；第二writer违背实际单writer条件且不能验证共享停机。高 |

未闭：runtime同批上下文候选的共同采用、两包与真实示例源接线及 [R8 验证](verification.md#v8-失败经过执行上下文)。本候选不自接受、不将QA反例或静态检查当作修复验收。

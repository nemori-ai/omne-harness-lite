# 失败来源的实际 Run 绑定与校准目标接线

2026-09-29，revision 1，**candidate，未技术采用，新增 bindings 0**。本页补 [v17](v17-model-consumption-design.md) 已要求而公开交接尚未表达的实际 Run 归属；不覆盖其冻结正文，不新增产品政策或规范版本。所有新增接口、成员与实现路径均为候选。

## 依据与窄差异

已接受 [RT10](../../../../spec/capabilities/model-request-runtime/v10/contract.md) S-28/S-34/S-76、[Runner5](../../../../spec/capabilities/loop-extension-runner/v5/contract.md) S-5/S-21/S-26/S-53/S-54，以及 [LC6](../../../../spec/data/loop-extension/v6/contract.md) 的位置/主体与调用关联，要求实际同会话、同一次模型调用及该 Run 的失败经过；noRun 不能成为 after_model_call。Runner5 S-5 同时允许一次经过跨尝试存续，不允许把原发出 attempt 等于当前经过 attempt 当新准入门。

RT10 SHA256 `add7ff23a73a6ad5a749f40f6707f408f60d33b6032080ad6ba4751f10d5695c`；Runner5 `e571e01d8e4d86fec3904d9decb37beb38615940125f320a72c250fd63ca4c43`；LC6 `d5cf4e24abc0a72ffe27072b8239489812382e3b94f2ee891ca9264338a1954a`。采用依据沿 D106 的 v17/runner 当前消费增补与 D107 的 [v16](v16-usage-calibration-design.md)。本页只补绑定，不重开 D106 公共 runPass 或 U3 计量设计。

当前实现的 `ModelFailureSource.verify(subject)` 只比较 LC6 主体值，缺实际消费 Run 输入；主体不包含来源条目壳的 Run，形状相等不足以拒绝将 noRun 或 Run A 失败转投 Run B。另两处 `authorizedCalibration` 调用只传 callId/dispatch，丢了当前实际 run/attempt。两个缺陷均是已定语义的实现投影遗漏，不授权改日志或造新 Run。

## 契约责任与施工

| ID／责任 | 兑现点 | 本候选实现路径 | 证据义务 |
|---|---|---|---|
| F18-P1：RT10 S-34/S-76；Runner5 S-21/S-53 | 原 source 创建 | 同一 owned prefix 的完整 CallHistory.dispatched 壳绑定来源 Run 与各原 attempt，不从 caller subject/anchor 推断 | F18-V1/V2 |
| F18-P2：Runner5 S-5/S-21/S-26 | `ModelFailureSource.verify` | 显式 actual execution 投影，拒 noRun 挪用/跨 Run，跨 attempt 不新增相等门 | F18-V2/V3 |
| F18-P3：Runner5 S-21/S-53；v17 生命周期 | runner 公共口及示例 adapter | 实际 pass.execution 逐值传递，prepare 前拒错误；release/unknown 原责任保持 | F18-V4/V5 |
| F18-P4：RT10 S-77/S-80；v16 | 当前 `authorizedCalibration` target | openCall 与 dispatch 分别给实际当前 run/attempt，保留真实选入祖先及原批 `current:null` 读取 | F18-V6 |

## 唯一失败消费接口

runtime 拥有候选 `ModelFailureExecution = {readonly run: RunId; readonly attempt: AttemptId}`（两者均必填，引用 core 原身份类型），以及 `ModelFailureSource.verify(subject, execution: ModelFailureExecution)`。结果仍为 `{authoritativeSubject}`、`{invalidInput:true}`、`{unavailable:true}` 原联合；不新增失败枚举、领域对象、来源 ID、Schema、持久字段或第十四个服务操作。删除只传 subject 的调用形式，所有实际消费者同步编译迁移，不保留可选 execution 或旧重载。

source 创建沿 v17 同一次授权 `SettlementPrefix`，重用同次 `interpretCallHistory` 的完整 `CallHistoryDispatch[]`，核 caller subject 与这一份历史逐值相等。私有来源快照捕获 prefix.binding 的 session/tenant/log/generation、callId、原 dispatched 壳共同的 Run 归属，以及每条发出的原 attempt。Run 缺席是明确 noRun；Run/attempt 半缺、各发出 Run 不一致、原 response 与锚壳不一致或历史不可解释时不建立 source，原操作沿已有 unavailable。不能从 subject 的裸 dispatched payload、最近任意响应、传入 execution 或不透明 anchor 补来源身份。原 attempt 是每条发出的事实，可随同一调用续接而不同，不能只取第一个 attempt 后假定整调用不变。

verify 次序保留现作用域规则：先确认 scope 未 release、使用权/owner/日志代际仍有效；失效即 unavailable。活 scope 内校 subject/execution 形状和精确值；execution.run 与捕获来源 Run 必须相等，捕获来源是 noRun 则任何 after_model_call 消费均 invalidInput。主体改值、错 call、缺项/重排/漏重复结论同样 invalidInput，不转入贡献者 onError。session/tenant/log generation 的实际对应仍由 v17 的受控 adapter 核对，不能因为 run 字符串相等跳过；调用经过持有的绑定来自实际宿主，不从 subject 自证。

execution.attempt 表示**当前经过执行所在尝试**，必须是合法 core AttemptId，并从实际 pass.execution 逐值传入；它不是原发出 attempt，也不是另一种来源凭证。runtime 在本口只校其形状，不推断当前 attempt 的授权、存在、是否被取代或是否与原 prefix 同时出现；这些由 runner 已有输入校验、宿主与真正 fenced 提交兑现。不得增加 `execution.attempt === originalDispatched.attempt`、不得为核当前 attempt 再读一尾、不得称此 verify 已认证当前尝试仍有效。保留这个成员用于完整、可校验的实际执行上下文交接；独立 runner/adapter 验收必须抓到伪造/丢失/替换它，而非只测合法数字。

同一 Run 原失败来自 attempt 1、当前经过在合法 attempt 2 继续时，source 的原失败事实保持不变，当前 attempt 2 交给 runner 按原重演/栅栏规则处理；这一步来源绑定应通过。相反，另一个 Run 即便 attempt 数值相同也拒绝；noRun 即便 caller 补合法 run/attempt 也拒绝。普通 noRun readAttempts/失败业务返回仍合法，仅不能据它取得一个 after_model_call 的合法执行许可；不为此禁止 noRun 模型调用或改写已记录响应。

## 消费者与生命周期

runner 节点拥有候选 `RunnerPorts.verifyFailure(subject,binding,execution:RunnerExecution)` 第三实参，公共 runPass 直接传该次自有 `pass.execution`；这是执行者持有的真实输入，不由 contributor、subject 或调用后另一次读取合成。runtime 不 import runner 包或复制 RunnerExecution。runner service 和 example 的 adapter 在核实际 binding/generation 后，要求 execution.kind=withRun，并把其 run/attempt 投影给上述 runtime 口。noRun execution 直接 invalidInput；有 Run execution 仍必须由 runtime source 核原来源归属，不能只在 adapter 校形状。

`examples/model-invocation-minimal-demo/src/runner-service-host.ts` 当前准备消费与实际 verify 两处同步迁移；准备时使用将交给同次 runPass 的实际 execution，在新增 external 句柄 acquire、贡献 invoke、结论追加或模型重发之前拒绝来源错配。不能只修 example 而留下公开 runPass 两参数核验旁路，也不能在准备时给一个 Run、真正执行时换另一个。来源建立已经发生的合法日志读取不在“拒绝后零新增外部效果”的计数中；scope 释放及错误诊断仍可发生。

source 仍是调用级非序列化资源：原消费 overload 的业务结果/技术外包分离不变；实际 runner 的 verified.release 与调用方 finally 幂等关闭同一 source。使用权撤销/实例停止之后不可继续核准；普通新追加不让已捕获原事实变假。scope 释放不释放原 unknown append、不说明网络/门/写者实际停止，也不改变 settlement/reconcile 或原批认回。没有新 plugin/fiber/service/store、配置政策或装卸贡献；P-2/P-5 与共享日志 owner 沿 v17 的原装卸配对。

## withRun 校准目标的机械接线

runtime 唯一候选目标类型在现 callId/dispatch 上复用既有全有/全无 Run 判别：noRun 不带 run/attempt；withRun 两者必有。`CurrentHistoryReaders.calibration`、`authorizedCalibration` 及调用者消费同一个目标类型，不在示例/各调用点另造不同形状。这里的 target 是当前请求事实，不是对祖先的授权证明。

- `service-calls.ts` 首次 openCall 规划，以已经通过原校验的 request.run/request.attempt 加 callId/dispatch=1 传入；noRun 保持两项缺席。
- `service-dispatch.ts` prepareSend 对 dispatch/dispatchAgain/续接，以容器固定 request.run 加**本次已校 dispatch 输入的 input.attempt** 传入；它也是本次新 dispatched 壳实际使用的 attempt。不得回退到旧 openCall 的 request.attempt，更不能填 1；需要将当前值显式穿过 prepareSend 的内部参数。原输入 attempt 与 noRun/withRun 的配对及错误优先级保持。
- 历史候选仍按 v16 的真实 selected ancestry 核 message/response/dispatched 关联。同一次调用的 retry 候选须属于目标的同一 Run/noRun，旧 dispatch attempt 可以不同；明确选入的较早回复是否为可用祖先，由原被选入关系与完整原批证明，不能简单以当前 attempt 相等或全会话最后一响应代替，也不为本增补发明全新的跨 Run 输入许可。
- `interpretSettlementPrefix(..., current:null)` 在读取**原已提交批**时保持原样；不能用 target 当前 Run/attempt 作为 current 去重写历史归账/late，不能为认回旧校准批再要求当前终结认法。当前目标与旧响应顶层 attemptId、旧条目归账壳分别保留；本页不改变 U3 的摘要、φ/δ、回退、计量或耐久字段。

共同存储对象与同提交要求没有新增：仍为原 JSONL entries/tail/稳定 keys/fence；本补丁只补读/调用边界身份，既不写第二份关联记录也不改变原 `[M,R]` 批。实际来源无法判明继续沿 v16/v17 unavailable/source_unavailable 的既有适用分支；不得将已确认非法跨 Run 消费降级为普通无来源计量来绕失败经过准入。

## 选择与边界

| 选择 | 落选方最强论证 | 本方弱点／置信度 |
|---|---|---|
| source 核原壳 Run，显式传实际 execution | 在 demo adapter 比較 run 最少改动 | 要同步公共 runner/所有 adapter，但关闭独立消费旁路；高 |
| 当前 attempt 明确传递但不等于原 attempt | 强制相等容易阻断错误归属 | 当前尝试有效性仍须真实 runner/fence 验；保留跨尝试经过性质，较高 |
| 当前 calibration target 补身份，旧批仍 current:null | 把当前 attempt 填入所有读接口看似一致 | 两个用途必须区分，需恢复反例防回写旧批；高 |

**F18-G1**：本候选技术采用待主线，不能以已发现缺陷自行接受。**F18-G2**：当前执行上下文的真实来源、日志 generation 配对与合法尝试提交仍由 runner/宿主承担；runtime 的 shape/Run 校验不替代它。**F18-G3**：生产 Run 终结 G28、真实卡片等待源仍外置，本补充不关闭它们、不创建正式 Run 记录。源码同步及 [F18 验证](verification.md#f18-失败来源的实际执行绑定) 尚未完成；无实际通过声明。

# 模型路径 runner 服务与贡献登记接线

2026-09-29，revision 1，candidate；本增量未接受、未实施、无新增 bindings。节点仍为 `packages/agent-loop/loop-extension-runner`。下列新增技术接口、服务键、插件名和内部字段均为候选；明确标注已有的函数按当前源码读取。

## 精确输入与范围

| 输入 | 当前接受与本页消费 |
|---|---|
| [Runner5](../../../../spec/capabilities/loop-extension-runner/v5/contract.md)、[LC6](../../../../spec/data/loop-extension/v6/contract.md) | 已接受；S-6 当前链、S-7 贡献在场、S-21 dispatch、S-22 replay、S-34 撤除、S-53/S-54 同调用来源。本页不改两操作语义 |
| [v3](v3-design.md)、[v5 revision3](v5-current-design.md)、[v6 revision1](v6-run-pass-design.md) | 既有服务责任沿 D-076；当前公共 runPass/codec/log adapter/task owner 沿 D106。D106 未采用完整服务接线，本页补这一个技术采用输入 |
| [MF4](../../../../spec/capabilities/assembly-manifest/v4/contract.md)、[AR4](../../../../spec/capabilities/asset-registry/v4/contract.md)、[AE4](../../../../spec/capabilities/asset-evaluation/v4/contract.md) | 均已接受且有源码。Runner5 冻结依赖仍为 MF3/AR3；本页只映射 MF4 保留的 readHead/readHistory/dependencyPresence 与 AR4 同 E/历史正文读取，不据“更新版本”自动升级规范依赖。该有限提供者接续须主线显式采用 |
| [SL3](../../../../spec/capabilities/session-log/v3/contract.md)、[RT10](../../../../spec/capabilities/model-request-runtime/v10/contract.md) | 均已接受；SL3 沿 D106 的当前日志绑定。RT10 S-50/S-67/S-76 由 runtime 当前提供者消费；新增调用级失败来源和 P5 政策适配归 [runtime 节点](../../model/model-request-runtime/README.md)，本页只接其受控端口 |
| 不可变历史正文与身份 | [EIS 历史读取投影](../../assets/evaluation-input-store/v4-history-source-interfaces.md)由 D080采用；STT2、IV1 沿原 runner 依赖。正文来源不是调用者提交的一份相似声明 |

需求 topic/rev 沿 Runner5 来源表，技术接续不新增产品政策。实际源码基线 `b8018e93` 已有公共 `runPass`、`createRunnerLogAdapter`、`createRunnerReminderLogAdapter`、`createRunnerTaskOwner`；尚无本页 Cordis 服务/登记接线。公共函数 427 项既有运行报告保留原范围，本页未复跑、不把它们计为服务证据。

交付只覆盖模型路径需要的 `before_model_call`、两维 `after_model_call`、模型消息的 `before_persist_message`/`after_persist_message` 及提醒的单层 before_persist_message。已知其他位置不得误报 positionUnknown；它们的完整工具批次/执行环境组合尚未供给时按原依赖缺席返回 unavailable，不发布成整个 Runner5 已交付。noRun after_model_call 与 producer=model/tool 的 before_persist_message 仍 invalidInput；有 Run 的条件消费不冒充生产 Run/等待来源。

## 契约责任到实现落点

| 行 | 契约责任 | 插件／服务／公共构件 | 实现路径与证据缺口 |
|---|---|---|---|
| R7-P1 | Runner5 S-5/S-6/S-21 | 候选 `loopExtensionRunner.dispatch`、`readRunnerChain` | 当前 manifest 类别记录→同 E/版本正文→已有 RunnerPiece/runPass；R7-V1/V2 |
| R7-P2 | S-7/S-10/S-12/S-34 | 候选 `loopExtensionImplementations.registerBuiltin` 与代际表 | 每件现查/捕获实现，直接 await，返回时核代际；R7-V3/V4 |
| R7-P3 | S-21/S-28，LC6 S-42/S-43 | 已有 runPass 和日志/提醒 adapter | 服务提供真实 RunnerPorts，不复制经过循环；RT10 调用级闭包核完整 failureSubject；R7-V5 |
| R7-P4 | S-22/S-53/S-54 | 候选公开纯 `readPassConclusions`，服务 `replay` | 从已有 runPass 的历史解释抽共同校验核；只消费调用者取得的 entries，不 IO/求值/补写；R7-V6 |
| R7-P5 | S-14/S-26，RT10 S-50/S-67/S-76 | runner 判定端口＋runtime P5 贡献插件 | 默认重试身份/政策唯一归 runtime；已落 retry 不是发送授权；R7-V7 |
| R7-P6 | S-9/S-19/S-31～34/S-50 | 调用级句柄、实例停止门、原 task owner | 真实宿主持有未停止/unknown 工作；不关闭借用日志；R7-V4/V8/V9 |

## 一个服务实例、两个公开面与无环依赖

候选 `loopExtensionRunnerPlugin` 一次应用一条 fiber，**只必需 inject `sessionLog`**，同实例 provide `loopExtensionRunner` 和受限 `loopExtensionImplementations`。没有每模型、每会话或每经过的新增 fiber。原日志操作面绑定方式、实际存储和物理日志 owner 由装配给出，不由 runner 寻找全局默认日志。

`assemblyManifest`、`sessionTenancy`、`assetRegistry` 及模型 guard 在需要时由本地 scope 的受控 resolver 获取，缺席影响本次调用，不使 runner 插件不可加载。历史正文 reader、物理日志 owner、时钟/发号、诊断与调用身份映射由显式装配端口借用；runner 不持它们的 close 权。`ctx.get`/isolate 只解决可见性，不能认证请求身份。外部调用边界仍由真实宿主核验调用者权限，再给匹配 scope 的服务引用。

P5 有自己的一条贡献 fiber，只必需 inject 登记面，配置和纯 `decideRetry`/`retryDelay` 在 runtime 所属节点；runner 不 inject P5 或主 `modelRuntime`，主模型服务不 inject runner。模型 guard/失败来源以调用级端口交给 runner，调用方向不成为反向启动依赖。服务间不走业务事件或 module augmentation。

源码包已有 runner→runtime codec 依赖，因此 P5 **不增加 runtime→runner 包依赖**。登记类型/行为唯一归本节点；runtime 工厂只依 core LC 类型产出结构兼容贡献函数，薄插件消费它完成登记所需的最窄结构端口。该端口是消费者要求，不复制登记表、状态、失败或代际语义；宿主把真实 runner 端口交给 P5。静态制品连接和 clean build 必须证明可组合；不以 type-only import 合理化包依赖环，不新开 core 包搬接口。

### 一次冻结的登记账本

候选唯一签名：

```text
RunnerBuiltinImplementation(input: ExtensionInput, signal: AbortSignal,
                            mode: RunnerInvocationMode)
  -> Promise<RunnerInvocationResult>
registerBuiltin(builtinName: string, implementation: RunnerBuiltinImplementation)
  -> () => void
```

ExtensionInput 来自 LC6；RunnerInvocationMode/Result 复用已公开 runPass 类型。P5 的不等待实现可以只使用输入/信号并返回普通 output/errored，不拥有等待控制。等人重演时真正的 replay 控制仍由外置等待/执行 owner 包住，不能相信贡献函数自报 replayInconsistent 就跳过其实际校验。

P5 内置键技术绑定为 `omne-official:default-retry`，与本件 LC6 `implementation.builtinName` 精确相同；能力 `{category:loop_extension,name:omne-official:default-retry}` 及 definition.name 分别核对 RT10 S-67。系统件身份仍只凭该能力标识，不从插件类名或 builtinName 推断；也不把同能力身份但显式选择另一实现的声明强行路由到本内置键。登记面仅对可信系统贡献装配可见，静态公开入口限制由既有源码边界检查维护；租户的声明式资产正文只能选既定实现，不能取得 JS 登记执行权。

登记同步校验非空合法名称和 callable；同名已在场即抛错，使**登记者**插件启动失败，既有贡献不变。不设覆盖、热改闭包或“同函数算成功”特例。每次合法登记创建不对外持久化的独立 generation；返回的注销闭包只删除自己捕获的条目，重复注销幂等，旧 disposer 绝不能删掉新代贡献。注销阻止后续求值捕获；已开始那次保持原函数和代际直到实际返回，若期间已注销，则交 `errored` 并按原 onError 处置，不能接受迟到 output 或归成未开始 unavailable。

贡献的实际 Promise/外部资源归贡献者拥有，runner 消费迟到拒绝并跟踪尚未结束的调用，不将 disposer 返回当作执行已停止。runner 自身停止优先于“某贡献撤下”分类：关闭本实例准入、触发停止信号、撤销句柄，runPass 在既有检查点 unavailable，不再开始 append。已进入日志提交的工作按该次 SL3 结果收场并由原 task owner 记责，不能撤销或虚报未写。

## 同 E 当前链的真实读取

候选 `readRunnerChain` 是可单独取用的来源适配闭包。输入为本次已授权 manifest 会话指认、真实身份/日志绑定及已捕获的 provider 读端口，返回 owned `RunnerPiece[]` 或原 RunnerFailure；纯链投影部分不 IO。服务入口的 manifest 使用现有 ManifestSessionRef 读面，不新建 ManifestId 或持久映射。

1. 宿主核调用 scope 与请求 manifest 会话的关联；同次 `sessionTenancy.holdingTenant(session)` 取得实际 tenant，与日志宿主交出的 `RunnerLogBinding.session/tenant/logGeneration` 精确一致。不存在的清单/不属所请求会话为 manifestMissing；来源不可用或身份无法可靠核定为 unavailable；调用参数坏形状为 invalidInput。跨租户不能降为可用空链。LogGeneration 由真实物理日志 owner 给，不能由调用者随机填一个字符串当权限。
2. 对捕获的 MF4 实例调用一次 `readHead(session)`，取 `latest.loop_extension` 的完整 record 与 `record.tables.loop_extension`。`head=0` 无清单为 manifestMissing；已有清单但缺该类别记录为 unavailable。若需要按时刻重读，只调同实例 `readHistory(session,'loop_extension',filledAt)`，核原 session、seq、evaluationRef、表时刻及完整值，不改读当前另一尾。
3. 复用 MF 已公开 `readEvaluationProjection(content)`：其 owned 返回核完整 E 的 core judge 和 compositionOrder 全排列，本节点不重写两种判断。runner 只补 S-6 消费必需的窄投影：content 恰含 `{evaluation,compositionOrder,filledBy}`、E.unresolved 为空、同 session 的 `1≤seq≤head`、合法且相符的 evaluationRef/given/reuse 引用、本类别表时刻及条目；`filledBy` 沿 AR4 S-6 闭合值，given 对 assembly、mint 对相应 reload、reuse 对原收窄来源，坏形状或 producer 不符均 unavailable。MF 公开记录含这些全部字段，不另开 registry API。当前 AR 私有 `readRegistryRecord` 还校验六类生产操作并限制 reuse 为 slash_command；**不导出或复制它作为 runner 校验器**，不能将该生产操作限制变成 Runner5 禁止合法 loop_extension reuse 的规则。字段形状、精确 JSON/标识与 E 关系各用既有 core 公开判定；纯本类别投影不验证别类表的整套 S-48 生产过程，也不自称证明实际 producer 授权。
4. `given/mint` 表构成必须等于同 E 的完整 loop_extension 筛选；`reuse` 只允许按 compositionOrder 同序删除。每条 capability/asset/version/from 对齐同 E 的 EffectiveAsset。别类更新 E2 不改变本表 E1；不调用 readEvaluation 把全局最新 E2 替进来，不重新 evaluate，不按名字排序。
5. 装配将既有 EIS `./registry-history` 的真实 read 闭包借给本节点，只授 read，不授 close。请求精确携 session、tenant、category=loop_extension、filledAt、capability、asset、version；该现有提供者自己核 MF 历史绑定和当前资格并读不可变版本。实际返回 `AssetVersion` 不含 asset id：原请求与受控 reader 保持资产关联，runner 核 `number` 等于所请版本、`content.category=loop_extension`，再用 LC6 judgeDefinition 解释 `content.extension` 并核 name/能力身份。不得伪造返回 id 检查，也不能拿当前 registry.lookup 结果或登记实现的自述替代历史正文。其 provider 若缺席/资格不可读则 unavailable，不启动新资产平台补源。
6. position/dimension/power 取同 E 的 EffectiveValue，onError/unavailability/needs/implementation 取该版本正文。power 保留 PermissionValue 读取，只对合法非空 allowed 集合取 observe<rewrite<veto 最强者且不超过正文声明；不得裁剪非法值后继续。结果 owned 固定至这次经过结束。筛位置/维度及规范系统件末位/缺席守卫复用现有 runPass 构件，不以硬编码单件 P5 chain 代替真实当前表。

`assetRegistry.lookup/list` 与现有 report 可用于它们原有查询/报告消费，**不是额外来源权威**：lookup 的 `within=session` 会读当前表，`within=run` 只有原真实 report 固定的 snapshots 才能锁历史；不得为读取 runner 链制造 report、调用 refreshAvailability 改写事实或把 capability 相同当版本相同。模型 retry 只用 runtime guard，不要求不存在的 before_action 报告；before_action 的原 report 三者核对仍归其已定控制路径。

经过中 MF 表可以更新，已读不可变版本仍由本次链持有；下一次 dispatch/replay 重新读当时当前表，按 Runner5 的 name/次序前缀规则检查，不能为了继续执行去强求旧链。带 needs 的件在轮到它时调所捕获 manifest provider 的 dependencyPresence；明确 absent 与 unavailable 不混同，没有 needs 不额外制造缺源失败。provider 被撤下后其返回不可用按原调用失败，不从新实例拼半份观察。

## dispatch、只读 replay 与模型端口

候选服务 `dispatch(request, signal)` 沿 Runner5 S-21：request 显式携 position/dimension/subject/anchor/manifest 及按主体要求的 run/attempt；服务包装不改变错误集合与顺序。授权来源与实际链就绪后构造已有 `RunnerPass`，借宿主的 task owner 建 `createRunnerLogAdapter`/`createRunnerReminderLogAdapter`，与真实实现登记、句柄、runtime 受控来源/guard 一起形成 RunnerPorts，调用同一公开 runPass。不会把 service 路径再写一遍求值循环。

模型失败入口由 runtime 拥有的同 prefix 调用级闭包提供 `verifyFailure`：runtime 操作取得同次 failure consumption 后，宿主先核实际 session/tenant/logGeneration/call 关联，再委托 source.verify 核原完整失败主体、同次 dispatches 与全部有序 retryConclusions；runPass finally 释放该消费权，准备阶段失败则宿主释放。不能先读 readAttempts 裸值，再读第二个尾补“证明”。普通新日志追加不自动使原真实前缀失效，来源关闭/关联不符按既有联合返回；精确 operation overload、consumption/source 接口由 runtime 对应增补唯一维护，本节点仅将它接成已有 RunnerPorts.verifyFailure，不另定义返回账本。

retry 的 judgeCapabilities 原样接 runtime `canDispatchAgain` 全联合；select_model 接 legalTargets。guard 来源在这次判断读取，不缓存为下次发出许可。allowed 后才可落 retry；refused/alreadyEnded/callNotFound/wrongPhase 按已采用 v5 原输出非法路径处置；unavailable/invalidInput 不冒作者 onError。P5 给出的 delay/计划由调用者消费，runner 不睡眠、不调用模型、不自动 dispatchAgain；真正发送仍另过 runtime 最新守卫。

候选服务 `replay(request)` 沿 S-22 **不带 attempt，不受尝试栅栏**，也不接受假 attempt=0。新增纯公开 `readPassConclusions({initial,anchor,run?,binding,chain,entries,tail})` 从当前 runPass 的 `historyFor` 抽出共同读取校验：核壳/键、tenant/session、原模型调用关联、ask/final 顺序和当前链前缀，返回全部已落 Conclusion[] 或现有失败。它不 IO，不拥有授权或读取事实；service 合法读取一次本经过条目后调用它，runPass 也复用同一核心。位置/run合法性与历史结论原 attempt 关系检查分开，不能为了复用 RunnerPass 类型造当前 attempt。

replay 不 invoke/presence、不开句柄、不 readAskState、不问 retry guard，不取 now/mint，不 append 或补提醒；缺 ask 答复不妨碍返回已落 ask。真实日志无条目返回空列表，unknown/不可读不能伪空。需要效果的调用者另用原 initial 和现有 composeEffect；不能以 dispatch 的恢复路径或一组假 record 端口实现 replay。

生产 waiting/card owner 继续外置。dispatch 遇已落 ask 必须走 v6 四世界 readAskState，缺真实 owner 为 unavailable，不伪 pending/ready，不新出卡；普通不等人的 P5 不因此被阻。短生命期 log/environment 句柄沿原 owner 表，在调用返回/取消/实例停止的 finally 失效；环境解析仍先实际 STT 再调用 executionEnvironments，缺失返回原不可用，不退到宿主机。等待控制锁存、未知追加和提醒语义继承已采用 v6，不在本稿重定义。

## 装卸、共享存储与并发

Cordis 采用 D025 4.0.4。只 inject 日志依据 [inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md)；提供者换代依 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)；禁止靠兄弟 effect 顺序等待依 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)；配置错误启动失败依 [plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)。控制直接 await，不用事件 bail；[async-control-not-bail](../../../../basis/cordis/async-control-not-bail.md) 保持。精确“离开 ACTIVE 与贡献注销先后”未有 basis 条目，本候选不据此建立保证，而用显式停止门、原公共 isActive 检查和实际 Cordis 交错验收。

| 取得项／对外可用 | owner 与部分失败 | 撤除、实际完成及保留 |
|---|---|---|
| 同实例两个服务面，必要日志就绪且配置通过后发布 | runner fiber；第二面发布失败使本实例首面也收回，不留半个服务 | 单个受管关闭链先关准入/触发停止/废句柄，再撤登记；未进入追加的调用 unavailable，不阻断已交日志的实际完成 |
| 内置贡献登记及 generation | 贡献 fiber；重复名使该登记者 FAILED，原登记不动 | disposer 精确代际注销；在途函数仍由其 owner 收口，注销不声称物理停止；runner 停止分类优先 |
| 一次 dispatch/replay 的链、借用源及句柄 | 调用 owner；任何准备失败释放已取得借用，零新结论 | finally 废访问权；贡献迟到拒绝有去向，已确认结论/提醒不删 |
| 日志 adapter 与 append/unknown task | **真实日志宿主**持 `RunnerTaskOwner`；runner 只借 start/record/read | runner fiber 消失不丢 unknown；宿主先关全部日志消费者准入，实际关闭旧日志/可信物理退出→恢复准入→reconcileStoppedLog→drain。禁止先 await unknown drain 再关日志 |

存储不新增。本节点要求仍落在 SL3 的同一 session-log：结论 wrapper 内 value/modelCallId/完整提醒副本同条目提交；同一日志的 dedupe/read keys 与 fenced append 共同排除两个 dispatcher 对同件的竞争。已落结论后实际提醒沿共享 mrr/3 键及原嵌套路径另写，不谎称两者同批。两个写者触碰的是**同一日志内 dedupeKey 的耐久唯一位置及同一尝试栅栏**，不是进程内锁、时钟或新的单调内存。

反例交错一：A 读旧历史、B 同件先 append，A 得 alreadyRecorded，读同键并采用合法竞争胜者；不要求它与 A 候选逐字相同。交错二：A 提交回执 unknown、runner fiber 重建 B，旧 host owner 仍阻同责任重求；只有旧物理日志停止并恢复认回原值/合法异值/可信 absent 后才解除。现成公共构件承担此算法，服务验收必须用真实 JSONL/故障而非数组演示。

MF 的读快照与不可变历史正文无需与 runner 追加做跨 owner 同提交：契约规定本次开始钉链，允许后续表变化；表的不可变记录与版本锁定提供依据。这里没有补一个“读取时至结论提交清单永不变化”的新承诺。若历史源无法证明精确版本或 current qualification 不成立，则停止对应调用，不以最高隔离级别/锁装饰补缺。

## 关键选择、采用需求与边界

| 选择 | 落选方案的最强理由 | 本方案弱点／置信度 |
|---|---|---|
| 一个 runner fiber、仅日志必需注入，模型依赖调用时接 | 全部 inject 容易在启动时发现缺源 | 全部 inject 形成可选能力缺席使整个 runner 不可用；本方案需要准确逐调用错误映射。高 |
| 真实当前表 E＋指定版本历史 read | registry.lookup 更简单、已有 current cache | lookup 未必是同 filledAt；本方案多一次受限来源接线但不添存储。高 |
| replay 抽公共读取核 | 带只读假端口调用 runPass 能少一个函数 | runPass 会接续/补提醒且要求 attempt；独立读取核需回归共同校验，零副作用可直接反控。高 |
| P5 独立薄插件、窄结构消费登记口 | 宿主直接 registerP5(factory) 代码更少 | 直接注册易漏 P5 依赖缺席/PENDING 和独立卸载；薄插件保留原职责，无包依赖环，但要真实类型/制品连接测试。高 |
| 旧宿主 task owner 保留 unknown | 每个 runner fiber 自建 owner 关闭简单 | 自建 owner 会随重载丢原批责任；本方案需装配显式持有并协调实际日志关闭。高 |

本候选须主线采用后才能实施：当前服务面、纯 replay 核、登记代际；MF4/AR4/EIS 的有限消费接续；受限历史 reader 的 runner 消费授权/静态边界。已有 MF 公开投影加本节点 S-6 映射足够，不要求 registry 增加接口或生产操作。它们不改已接受 Runner5/LC6，不要求先建设新的通用资产/Run 包。真实卡片/等待、生产 Run 终结认法、工具批次和命令执行器仍归外部 owner；本轮验证缺源失败及具备实际来源时的条件消费。具体缺口和可失败门见 [R7 验证](verification.md#v7-模型路径服务接线)。

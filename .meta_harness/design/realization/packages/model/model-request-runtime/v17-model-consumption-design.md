# Runtime 模型侧 Run／失败经过／默认重试消费接线

2026-09-29，revision 1，**candidate，未技术采用**。这是已存在节点的窄接线增量，新增 bindings 0；不修改契约或原接受映射。以下新增类型、端口、函数、模块与子入口均为候选名，不冒充已交付 API。

## 接受依据与本次差异

| 已接受输入 | 精确坐标／本次承接 | 本候选新增映射，不重做原责任 |
|---|---|---|
| D087 与 [v4 rev2](v4-design.md) | RT4 的 same-prefix、tailEquals、原批与 unknown 算法；现由 RT10 S-17/S-68～S-73 逐字承接 | 将当前多处 noRun-only 占位成组改为条件可执行，明确正向 Run 解释端口 |
| D100 与 [v7](v7-current-design.md) | 当前类型、十三操作、共享 codec；原放行 noRun 不等于 withRun 已交 | 只补模型消费成功面，生产 G28 仍为外部来源前提 |
| D106 与 [runner v5/v6](../../agent-loop/loop-extension-runner/v6-run-pass-design.md) | 已采用完整公共 runPass、同 prefix 核验、任务 owner、等待／重演控制 | 本节点落实失败主体的实际生产交接和 P-5，既有公共 runPass 不重写 |
| D107 与 [v16](v16-usage-calibration-design.md) | MR9/RT10、原 InputCalibration payload、原批恢复、计量与停止边界 | 本候选不变计量算法、校准来源或 reader 交接，withRun 全字段保留 |

当前规范：[RT10](../../../../spec/capabilities/model-request-runtime/v10/contract.md) SHA256 `add7ff23a73a6ad5a749f40f6707f408f60d33b6032080ad6ba4751f10d5695c`；[Runner5](../../../../spec/capabilities/loop-extension-runner/v5/contract.md) `e571e01d8e4d86fec3904d9decb37beb38615940125f320a72c250fd63ca4c43`；[SL3](../../../../spec/capabilities/session-log/v3/contract.md) `f327f1289e1d6c539dd959e8862b382869e3d303cf984b6a773fdd6a00e4bd26`；[LC6](../../../../spec/data/loop-extension/v6/contract.md) `d5cf4e24abc0a72ffe27072b8239489812382e3b94f2ee891ca9264338a1954a`。MR9/MS6 沿 D107/D100 精确采用，不新增 Schema。RT10 目录无服务操作 JSON Schema；十三操作的规范数据返回以契约九项为准，MS6/MR9/LC6 Schema 只承载各自值，不可塞入函数句柄。

Cordis 仍采用 D025 的 4.0.4；静态必需配置非法启动失败，贡献依赖未就绪不发布；运行期必要来源不可读按各原操作 unavailable。保持 P-2 `modelRuntime` 十三方法与 P-5 `model-default-retry` 独立贡献插件；不新增第十四个业务操作、领域 prefix ID、store、Run 终结载荷或完整 Loop。产品来源及未裁项沿规范，本页不补产品政策。

## 责任投影与实施边界

| ID／规范责任 | 公开构件／服务落点 | 候选施工 | 可失败验证／边界 |
|---|---|---|---|
| M17-P1：S-17/S-69 | `CurrentHistoryReaders.run`、结算解释器 | 受控 owner 只解释传入 owned prefix；结果与其原 run/attempt 封装在一次解释中，不另读 tail | M17-V1/V2；生产 G28 认法外置 |
| M17-P2：S-28～S-34/S-49/S-68～S-73 | P-2 所有 withRun 锚／结算／恢复路径及外部 persisted owner | 原发出身份与归账壳分开；普通 F+U、响应 unfenced+tailEquals；原值/unknown 收口保持 | M17-V3～V6；须成组迁移 |
| M17-P3：S-34/S-76；Runner5 S-26/S-53 | 原 readAttempts、dispatch／dispatchAgain 的实现层消费形态 | 生产主体同一次 read 建立短生命期 failureSource；runner 只核同次值 | M17-V7/V8；不写持久／跨语言 DTO |
| M17-P4：S-35/S-60/S-67 | `createDefaultRetryImplementation`、P-5 薄插件 | 固定 LC 身份，显式政策/采样/previousDelay，消费 runner 唯一登记语义 | M17-V9/V10；不计时、不发请求 |
| M17-P5：S-30/S-50/S-66；Runner5 S-14/S-26 | runner 能力端口→真实 P-2 guard→调用方等待／再发 | 原完整 guard 联合结果保真，结论已给未发仍留历史 | M17-V11；noRun after_model_call 仍拒绝 |
| M17-P6：S-36/S-61/S-63/S-70；Runner5 S-54 | 原宿主/日志 owner 与调度装配 | scope、贡献代际、未知任务分别收口；观测因果与两包中英例 | M17-V8/V12；生产 Run/卡片供给不伪造 |

## 同一次完整前缀的 Run 解释

保留当前 `SettlementPrefix` 的 owned 私有构造边界。只能由 `readSettlementPrefix` 的已授权全读产生；它拥有真实 session/tenant/log/generation、稠密 entries 与同一次 tail。一个外部数组或自行包装相同尾不能升级成 owned。`CurrentHistoryReaders.run` 由当前实际日志事实 owner 配置，保持同步纯解释，不再固定只能返回 unavailable。

候选端口输入仍为 `(prefix: SettlementPrefix, originalRun: RunId, originalAttempt: AttemptId)`；成功返回 `{known:{run,originalAttempt,latestAttempt,terminal:'open'|'ended'}}`，另为 `{unavailable:true}`。这不是两个服务 bool：原尝试必须在该 prefix 的该 Run 下实际存在，latestAttempt 是同一 prefix 中可证的有效尝试，terminal 只由该 prefix 内已被正式采用的 Run 终结认法解释。原身份必须精确回显，latestAttempt 不得小于原尝试；未知、缺原尝试、解释冲突或任一轴不可判都 unavailable，不能在 latestAttempt 更大时跳过终结轴。

调用该端口的 runtime 内部 `interpretRunAtPrefix` 持同一 owned 对象及原锚身份，校验代际、归属、原尝试/最新尝试关联后，将结果与**原 prefix 引用**封成私有解释结果；协调器不接收外部提供的 late/tail/known 标志。新旧 attempt 的识别可消费正式 MS6 attempt_started 与 SL3 壳；终结认法必须由 G28 owner 供给。端口允许合法正向值，不等于其实现已证明生产来源。生产缺正式解释器时返回 `run_history_unavailable` 内部原因，沿原业务 unavailable；不把未见 model_call_ended、LC TerminalFact、after_terminal 结论当 Run 仍 open／已 ended 的证据。

写方从这一私有结果计算 `late = latestAttempt > originalAttempt || terminal === 'ended'`；假时省略 late，不写 false。比较使用 AttemptId 的现有精确比较，不能经浮点数。提交条件的 tail 只从同一解释结果的 prefix 取得，不接受端口再交一个 tail。prefix 在外部解释前后均核真实代际/权限有效；没有锁住历史，新追加通过实际 `tailEquals` 冲突重读，不以本地锁冒充共同提交。

对已存在完整原批的认回优先于为未提交批解释当前 Run；原 late 原值保留。不得因当前终结源缺席拒绝合法完整原批的读回，也不得以此推论旧未知写任务已经停止。输入 malformed、身份、阶段、opened unknown、原批辨认、争用/资源门保持 v4 的顺序，不用新增 Run 判定抢先改错码。真正需要该判据而来源不够时才失败；noRun 不访问此端口。

具名受控验证只为**条件算法**供给完整纯解释器：它接收真正 owned prefix，并由测试输入固定其有限语义；Run 终结轴的假设须在报告列明，不伪造正式终结条目、不发布成生产默认实现。真实生产 Run 终结协议仍 G28／run-attempt-facts G3 外置，不能用两个来源不同 bool＋新读尾绕过。

## withRun 必须成组修改的消费面

以下路径使用同一原调用身份判别联合，不能仅删除入口 guard。普通公开 `invokeModel` 不因服务支持 Run 而增加隐藏 Run 依赖。

| 模块／当前缺口 | 本候选必须实施的绑定 |
|---|---|
| `service-types.ts`／`service-calls.ts` | 保持已有 `OpenCallRun` 的 run/attempt/report 全有或全无联合；原身份、report、授权/current-input 门先行。删除“只要 run 存在就 unavailable”，按原 S-28 已定身份/report/来源条件准入，不把结算所需 Run 终结解释另加为 openCall 的新业务前提；call 容器固定原 Run，续接的新操作 attempt 与原 dispatch attempt 分开持有，不把 report 形状有效当真实可用性来源 |
| `service-dispatch.ts`／`service-control.ts` | prepareSend、dispatch、dispatchAgain 接受已核 withRun，plan/lease/credential/U3 门不变。dispatched/opened、interrupt 意图、released/undispatched 等普通控制记录用该操作实际已授权 F+U；F 为 fenced{run,attempt}，U 为 unconditional。noRun 保持 unfenced+U；取消意图先确认后发信号 |
| `anchored-invocation-types.ts`／`anchored-invocation.ts` | 显式接收实际操作壳身份，beforeSend 与首内容门使用同原登记/真实 fence；不能从 recovery current attempt 猜原锚。锚点回执 unknown 时仍隔离，不交失败源/回复，不重发 |
| `response-construction.ts` | 从原 dispatched 壳携 Run 到 MR9 call.runId、原发出 attempt 到响应顶层 attemptId；Pending 不提前定 durable late/处分。最终响应内容、inputCalibration、usage/cost/headers/真实 timing 与原收场保留；结算只在未提交候选上计算 late 与允许的归账壳 |
| `settlement-types.ts`／`settlement-prefix.ts` | 解释器不再一见 run 就拒绝；原锚 run/attempt 与 target 逐值对应，受控 run reader 注入 coordinator 构造面，外部 persisted owner 同样明确取得。不能对每次调用接收任意临时 bool |
| `settlement-coordinator.ts` | 复用原完整批优先、opened 强门、预算、unknown 状态机。withRun 每次重构只基于新合法全前缀更新未提交批 late；append 为 unfenced+tailEquals(prefix.tail)。noRun 仍 unfenced+unconditional。不能恢复旧 fenced 响应方案或重跑 invoke |
| `log-codec-settlement.ts`／当前 codec | 现有 value 已可表达 Run 壳，移除 prepare 对 run 一律拒绝；准备/认回同时核原 dispatched run/attempt、响应 call 及全部 M/R 壳关联；恢复新归账 attempt 不覆盖响应顶层 attemptId 的原发出事实。持久已提交批不要求按今天 Run 状态重算 late；不改 mrr/3/key 或增加另一 codec |
| `service-reconcile.ts`／控制及组合 close | S-33 同两时机、同优先级；原旧写方实际静止、有效 attempt fence 与权威恢复读俱全才准入。原 response 批认回/重送不重算 U3 原事实；当前新 attempt 只用于契约允许的归账/控制壳。ordinary fence 不可取得则具名 unavailable，不制造替代 |
| 外部 persisted 回复消费者 | 从原 Pending 构造完整 M/R 候选，调用同一个 coordinator、同 run reader、同存储对象；不能直接 append M 后调用 settleReply(persisted)。同处分认回/不同处分 alreadyEnded 沿 S-49，尾冲突原 MessageId/ResponseId 不变 |

共同对象仍是同一 session 物理 JSONL `entries.jsonl`、全尾、稳定 read/write/dedupe keys 及实际尝试 fence；runtime 响应、外部 M/R、reconcile、attempt/未来终结写方与无关追加触碰同一域。现日志 provider 的 owner-lock/不可插入队列兑现 tail 比较＋键判重＋整批持久；本节点不加数据库或索引。存储要求仅为 SL3 已有全前缀快照、精确全尾条件、稳定键全批认回、原子持久、unknown 可辨、真实停止后权威恢复。不同文件/不同 log 实例名相同不能冒充共同对象。

交错 A：读取 t→新 attempt/无关追加先成功→旧响应 tailEquals(t) 零写→合法重读和策略允许才按原身份重构。交错 B：响应先成功→新 attempt/终结之后发生→原 late 不追改。交错 C：外部 M/R 与 runtime R 竞争→一份合法完整批胜出→败方认回原值、不得留孤 M；任何旧 append unknown 都不被后次 tailChanged/alreadyRecorded/attemptSuperseded 的 THIS 零写结论关闭。三个反例分别进入 M17-V3～V6。

## 失败主体到 runner 的调用资源

业务 `ReadAttemptsResult`、`DispatchResult` 与 `DispatchAgainResult` 的数据投影保持现有 RT10 S-29/S-30/S-34 返回联合；不向 MR9、LC6、日志或跨语言 payload 加函数。候选语言绑定在**同一个现有方法**提供显式技术消费形态：普通调用 `readAttempts(key)` 等只返回原业务值；显式 `readAttempts(key,{consumeFailure:true})`／dispatch 同形选项返回 `{result:原业务结果, consumption:...}` 外包，类型上不能把技术外包当业务结果。这是两种当前用途的单一实现重载，不是旧版本兼容，也不增加服务名或业务操作。普通调用绝不暗中持有 failure scope。三个方法分别以两个明确 overload 表达：`(input) → Promise<R>` 与 `(input,{consumeFailure:true}) → Promise<FailureConsumption<R>>`；R 各为原业务联合，技术外包类型不带兼容版本。`service-runtime.ts` 的 guarded 包装及插件提供对象必须保真转发该技术参数/返回；不能当前一参数 wrapper 静默丢掉申请。无选项只执行原业务路径；规范数据投影一律取 R，不序列化 consumption。

`consumption` 互斥为 `{kind:'failure',source:ModelFailureSource}` 或 `{kind:'notApplicable'}`。failure 只伴随同次已耐久 failed 主体（readAttempts awaiting_decision／dispatch 的 settled failed）；其他正常/错误结果为 notApplicable。业务操作尚未完成时，S-34/S-76 所需完整 failureSubject／有序历史或合法来源不可得，原结果仍是 unavailable，不能返回成功裸主体配空历史或假scope。完成后才发生撤权/代际撤除，则已返回业务数据保持原事实，source.verify 给 unavailable；不追改已完成操作，也不增独立“scope失败即业务失败”政策。选项非法在入参层 malformed，不改变既有其他优先级。

候选 `ModelFailureSource` 只含 readonly `subject:AfterModelCallFailureSubject`、`verify(subject) → {authoritativeSubject}|{invalidInput:true}|{unavailable:true}` 与幂等 `release()`；不是可序列化来源凭证。subject 和闭包捕获值是同一个自有深快照。`verify` 不发 IO、不追到最新尾；校验用原 `modelLogJsonEqual` 的精确数/完整成员/有序重复语义，不使用引用相等或 JSON.stringify 浮点投影。

创建时点：`service-reads.ts` 现 `withPrefix` 内对同一 owned prefix 同时执行 `interpretCallHistory`、真实 `CurrentHistoryReaders.failure` 和 `readFailureSubject`，在离开该读上下文前创建 source。`service-dispatch.ts` 的失败结算成功后，原服务为交完整 failureSubject 已有的那一次受控读取同样创建；绝不把 dispatch 裸主体返回后再另读尾补 source。受控 failure provider 将**传入那一份** prefix 交已接受 `readRunnerRetryConclusions`，构成完整、有序、保留同值重复的 retryConclusions；runtime 不依赖 runner 私有文件，宿主提供结构适配，不能继续使用 noRun demo 的恒空历史认法处理 runner 域。

闭包固定实际 binding.session/tenant/callId/generation、原请求 Run 归属、完整主体及其 prefix。第一次 verify 前与每次使用均检查未 release、service/host 使用权及日志代际仍有效。错 call、缺/改字段、重排/漏重复结论是 invalidInput；不可再合法使用/已撤销为 unavailable。普通追加不会让旧前缀变假；不新增 tail 没变才核准的规则。需要重新求经过时重新通过相应原服务读取取得 source，不缓存为全局 lastFailure。

runner 组合 owner 将 source 适配到**已实现的** `RunnerPorts.verifyFailure(subject,binding)`：先核本次 manifest→session/tenant/call 以及原宿主建立的 `RunnerLogBinding.logGeneration` 与 runtime 实际 log generation 对应；该对应在实际 log owner 创建两个绑定时捕获，不按字符串碰巧相等、不让不可信主体交 generation。再以 core 位置/维度合法值调用 source.verify；verified 返回权威 positioned subject 和同一个幂等 release。runtime 不 import runner 的 runPass/types 来制造反向运行依赖；组合适配只消费双方公开类型。

source 创建者是原服务调用 owner：readAttempts 由 RuntimeReads/实例宿主持有资源，dispatch 由调用宿主及实例共同约束；没有本地 call 容器的合法历史读取不能伪造 ModelCallHost。调用方在 `try { await runPass(...) } finally { source.release() }` 结束借用，runner 当前 verified.release 也可先执行，重复无害。构造中途失败、选项已请求但调用者未开始 runner、取消/宿主关门都使 source 失效并释放捕获 prefix。关闭借用不等于释放原日志任务：read registration 只在实际 stopped 后释放，原 unknown append 永远归既有 task owner。source 自身不持日志锁，不发送、不注册持久状态。宿主使用原显式关闭登记持有未交回的资源；不靠 GC 证明在途工作停止。

scope 的安全不需要生产 Run 终结协议即可对真实 owned-prefix 值核验；但 noRun after_model_call 仍因 LC6/Runner5 不合法，必须在贡献 invoke 前拒绝。合法受控 Run 输入可验证条件组合；没有真实 Run/等待 owner 时生产边界仍 unavailable，不用假 Run 换测试通过。

## P-5 最小公共贡献及唯一登记账本

runner 拥有 `loopExtensionImplementations` 登记与代际规则。本节点消费其候选唯一签名 `registerBuiltin(builtinName, implementation) → () => void`；`RunnerBuiltinImplementation` 的权威类型/完整结果仍归 runner 节点，本页只定义 P-5 的窄结构消费，不重定义 registry 表、完整 invocation mode 或 runner 服务。两节点共同方向：P-5 required inject 登记面；P-2 不 inject runner，runner 不 inject P-2/P-5；宿主显式接实际 guard/失败源。runtime 不 type-import runner 包、不增反向 workspace 依赖或 module augmentation；实际制品上将 factory 结果直接传真实登记方法验证结构兼容。

P-5 根独立函数候选 `createDefaultRetryImplementation({policy,sample})` 返回以 core LC `ExtensionInput`、AbortSignal 为显式输入的贡献函数。它只交 `{kind:'output',value:ExtensionOutput}`、`{kind:'notStartedUnavailable'}` 或 `{kind:'errored',error:安全文字}` 的窄结构结果，兼容 runner 当前完整执行结果；无需复制 replay/waiting 协议。纯 `decideRetry`/`retryDelay` 继续独立公开，不被 factory/plugin 吞没。factory 自有捕获完整 RetryBackoffPolicy，sample 是显式可替换同步采样来源，返回合法 JsonNumber 或明确不可用；不偷取 Math.random、全局配置、日志或当前模型。

固定绑定如下：CapabilityId `{category:'loop_extension',name:'omne-official:default-retry'}` 与 declaration.name 相等；position=after_model_call、dimension={ending:failure}；内置实现键候选明确采用同一字符串 `omne-official:default-retry`，对应 declaration.implementation 的 builtinName 必须逐值一致。这是已采用 v5 的具体内置键绑定，不能从类/插件名猜任何其他声明，也不能把同 capability 下的自定义 command 强制走本内置实现。出厂 power/rewrite、onError 缺席按实际求值取 record 沿已接受 runner v3/v5，不由名字授予权限。

贡献被调前由 runner/G3 核完整输入；P-5 自身仍判 LC input 与 after_model_call/failure，非法执行输入沿 runner 已开始错误通道，不当 observed。它把原完整失败主体、捕获 policy、显式 sample 与 decorrelated previousDelay 交 `decideRetry`。previousDelay 从**同一主体**已记录的本能力 retry 结论取最后一次实际 plan.after；没有本件 retry 时显式用 S-60 规定的首次 policy.base。全部原结论保留重复和顺序，自定义件不算本件次数，已给但尚未发送的本件 retry 仍算；不从 dispatch 数、earlier 本经过结论或另一尾猜 n。非法/缺必要来源不能补零/固定等待。

配置缺少合法 policy/sample 在 P-5 构造/启动时失败；动态 sample 不可取得且贡献尚未开始决策时 notStartedUnavailable，runner 按已定在场/系统 fallback 规则处理；开始后构件错误沿 errored/onError，不假 observed。取消/贡献代际撤除由 runner owner 核迟到结果，P-5 不吞取消伪造 retry。返回 observed 或 retry 后仍由 runner 核实际 power 与能力门，P-5 不计时、不发送、不直接写 Conclusion。

薄插件 `model-default-retry` 使用原 kernel-basis definePlugin 路径，required inject `loopExtensionImplementations`，通过 ctx.effect 登记并只持注销闭包。同名已在场登记失败使本贡献 fiber 启动失败，不覆盖旧登记；注销幂等且仅作用捕获代际。部分初始化失败撤回已取得本代际登记；依赖未就绪保持未发布，不能自行装 fallback 绕过 runner。撤除不撤销已持久结论，不释放 runner 在途任务；runner 在调用后核获租借代际，已撤除结果走原 errored／停止通道。插件本身不 provide 新服务。

## 真正的重试消费与生命周期

宿主通过 runner judgeCapabilities 调实际 `modelRuntime.canDispatchAgain`，完整返回 allowed/refused 及 why、alreadyEnded、callNotFound、wrongPhase、invalidInput、unavailable 按原 Runner5/LC6 分支映射；没有 why 不造 reason。没有 allowed 不提交新 retry 结论。守卫不是 P-5 自己的判断替身：用户件给 retry 也必须走同一能力门。

runner 确认结论及 effect 后，调用方用显式调度/取消政策等待 plan.after，再调真正 dispatchAgain；等待不塞进 P-5，不写隐藏 setTimeout 循环、不自动从失败再求 P-5。dispatchAgain 重新读当前状态、current-input、计量、凭据和 guard；这次限额/停机/缺凭据拒绝不删除已给的 retry。partial/interrupted_mid_reply 及 opened unknown 不能因贡献返回 retry 就第二次发送；恢复 resumable 是既有续接路径，不记成默认重试次数。

| 持有物／阶段 | 取得与归属 | 撤除／失败完成条件 |
|---|---|---|
| Run prefix 解释 | 原结算 owner 合法读出的 owned prefix、同一代际来源 | 同批原值确认或当前推进退出；unknown 原任务继续持有，不靠解释结束释放 |
| failureSource | 明确请求技术消费形态的原调用；宿主登记兜底 | runner/调用方 finally 幂等失效；原 read/append 任务各自实际停止后独立释放 |
| P-5 贡献登记 | 薄插件本代际 effect，runner 注册表唯一拥有解析/租借 | 只注销本代际；迟到结果由 runner 已定规则收口，不能重注册后把旧结果当新 |
| runner 重试经过/等待 | 现有 runner task owner 与调用宿主；真实 log 由共享宿主持有 | 关所有共享准入→日志实际停止/可信旧进程退出→恢复准入和 reconcileStoppedLog→drain；禁止先等 unknown drain 才关闭日志 |

依据沿现有 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、[inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md)，均已有 probe；不把 Cordis 自动撤服务当实际停止。新增工程诊断只用原 S-63 语义记录调用关联、原/当前 attempt、prefix 读取阶段、tail 冲突、scope 失效、贡献代际、guard 原结果；不记录完整敏感主体，不把工程 log 当会话事实来源。

runtime README/README_ZH 在实现时给普通 readAttempts 与显式 failure 消费的差别、try/finally 真实例、P-5 显式策略/登记/注销和条件 withRun 外部前提；两份实际独立制品编译执行，runner 普通 public 函数及 U3 文档保持。example 可承接共享真实 JSONL/宿主与有限合法条件输入验证，不建 acceptance app、不声称 noRun demo 已能生产 failure runner。

## 取舍与尚未覆盖

| 选择 | 落选方最强论证 | 本方弱点／置信度 |
|---|---|---|
| 现 owned prefix 内解释 Run，晚到只用其 tail | 独立 RAF bool 服务最省消费代码 | 正式终结认法仍外部依赖，但不会把条件消费缺实现隐藏在恒 unavailable；高 |
| 显式技术消费重载，业务结果独立投影 | 所有失败结果直接附 scope 最容易传递 | 语言绑定增加资源外包，要验普通调用不持资源及精确错误顺序；中，须独立表达/架构审查 |
| P-5 纯贡献＋薄登记插件，窄结构消费 | 宿主直接 register 可省插件 | 增一个确有独立更新/撤除责任的 fiber；免 runtime↔runner 包循环，实际制品要验证；较高 |
| 成组启用 withRun，保留原批算法 | 先删一个 guard 容易展示正向 | 改动跨多个现有模块，必须唯一实施 owner 和真实交错验收；高 |

- **M17-G1**：本候选尚未采用；语义已由上述决定接受不等于本技术资源形态已接受。
- **M17-G2／RT10 G28、RAF2 G3**：正式生产 Run 终结读取协议与实际写方外置；缺席仍具名 unavailable。只阻依赖它的生产成功链，不要求本程交完整 Run/Session/Loop。
- **M17-G3／Runner RUN5-G3**：真实受控历史 provider、调用级 source、同代际映射与 runner 服务接线待实施验；独立 scope/条件算法可先验，不用另一尾补认证。
- **M17-G4／Runner RUN5-G4/G5**：P-5 当前登记服务由 runner 节点共同起草；实际 Cordis/共享宿主/physical stop 验收待跑。未知任务及等待 owner 责任不缩小；正式卡片来源外置。
- **M17-G5**：生产 Run/真实 waiting 源之外，本节点承诺的模型侧正向条件消费、13 方法/实际 guard/unknown/隔离必须完成，不能把所有 success 都恒 unavailable 后宣称边界内已交。新增 bindings 0，具体反例见 [M17 验证](verification.md#m17-模型侧-run失败经过与默认重试接线)。

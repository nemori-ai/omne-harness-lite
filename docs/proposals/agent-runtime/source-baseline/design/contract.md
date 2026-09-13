# Live Agent 原语候选契约

候选身份：`live-agent`，修订以 [验证记录](../evidence/validation.md) 的文件摘要为准。
尚无正式版本；[来源映射](../source-map.md) 固定需求、上游和适用范围。

## 范围与统一语言

沿用[架构基础概念](../../../../architecture-guide/foundations/concepts.md)。
本能力维护一个运行时注册表、一个可替换的构造提供者，以及发起者归因边界。
它同时提供事件分发助手和两个小型计算助手，声明供驱动器实现的 Agent 端口。
注册表不是持久化存储；运行时引用不是数据契约。

| 名称 | 本基线中的精确含义 |
|---|---|
| Agent 引用 | 一个活体运行时对象的引用；端口具备控制能力，不是只读 DTO |
| Session ID | 上游 Session 提供的身份值；本包不重新定义其编码或全局唯一性 |
| 注册实例 | 一次成功进入注册表的实例，具有不可混淆的实例身份；模型用不透明 token 表达，不要求实现增加字段 |
| 运行时 owner | `enter` 捕获的父 Agent 引用；与 Session 持久父系、持有清理效果的调用作用域分别存在 |
| 注册撤销能力 | 仅撤销这次注册的单次有效能力；不等于停止并排空 Agent 的句柄 |
| AgentHandle | 构造提供者返回的 Agent 引用及异步释放能力；其完整生命期由提供者实现 |
| initiator | 当前因果调用链的 Agent 归因，可显式清空；不是调用者身份、租户授权或运行时 owner |
| 公告 | 同步开始向匹配监听器分发 created；不同于此前发生的注册可见性，也不是持久提交 |

建模观察边界是一个注册表和单进程作用域。只有可信的内部装配持有注册表、工厂和
清理能力；面向租户的入口必须另有已接受的身份与授权契约，不能直接暴露这些引用。

## 注册、可见性和撤销

以下 `LA-R*` 是拟保留的包级规则，由 [AgentRegistry.tla](AgentRegistry.tla) 中的
转换和性质表达其有限抽象；监听器异常分类等未建模部分按[场景](scenarios.md)验证。

| 规则 | 操作及可观察结果 |
|---|---|
| LA-R1 | `enter(agent, owner)` 要求 `agent.id = agent.session.id` 且当前无同 ID 实例；否则抛错且不改变注册表。成功后立即可被 get/list/roots 观察，此时尚无 created。 |
| LA-R2 | 同一注册实例最多开始一次公告。announce 必须指向当前 ID 对应的精确 Agent 引用；不存在、引用不符、已公告或正在公告均抛错。公告开始前先记为已公告，以阻止重入重复公告。 |
| LA-R3 | 公告同步栈尚未退出时，detach 只请求撤销；后续实际被调用的 created 监听器仍能看到同一实例。正常退出或同步异常退出均在 finally 完成所请求的撤销。 |
| LA-R4 | detach 是幂等且绑定精确注册实例的能力；旧能力不能删除后来同 ID 的实例。删除先于 disposed 分发；仅已开始公告的实例配对 disposed，未公告回滚没有 disposed。每个实例最多配对一次。 |
| LA-R5 | get 返回当前引用或缺失；list 返回按注册顺序排列的新数组；roots 只选 owner 缺失者。isOwnedBy 比较当前条目捕获的 owner 引用，不检查 owner 仍然存活，不推导租户和持久父系。 |

原始 enter 不校验 owner 图是否无环、owner 是否登记、租户是否一致，也不级联撤销子项。
这些不是上游已有保证；需要这类约束的装配必须在更高边界兑现。Agent 身份属性在一次
注册期间保持稳定是调用前提；本包没有冻结调用方对象。

created 的**同步**监听器错误向调用方传播并中止后续监听器；此前观察无法抹去。
直接调用 announce 时，它本身不会因此自动删除条目，只有已有 detach 请求会在 finally
生效；组合调用者必须显式回滚。`register` 用作用域效果组合 enter/announce，失败由
该效果撤销。created 返回的异步拒绝仅报告，不构成同步否决，不触发自动回滚。
disposed 逐个隔离同步错误和异步拒绝，报告后继续分发；通知不提供恰好一次的跨进程交付。

`register` 将条目视为 runtime root，并返回原样的 Cordis effect disposer。它的精确
身份影响组合效果中的撤销顺序；重复调用不等待此前尚在进行的释放。它仅拥有登记的
撤销，不能据此宣称 Agent 工作、Session 或外部副作用已经结束。

## 构造提供者及生命周期端口

**LA-F1**：注册表同一时刻最多绑定一个 factory；第二次绑定失败，不替换原者。
绑定属于调用方作用域，撤销后槽位可重新绑定。create/resume 在槽位缺失时失败；已有
Agent 的工作不由“槽位清空”这一事实自动终止。提供者卸载时如何排空其创建物属于提供者。

**LA-F2**：create/resume 委派时传递实际调用方的 owner context，并保持显式 parentAgent
选项独立；不能把 factory 的注册 context 偷换为所有创建物的 owner。上游对 Service
提供者先解除旧追踪，再按调用方追踪，以同时保持依赖来源和效果归属。

下列是上游**声明给 factory 的义务**，注册表只是委派入口，并未实现事务或恢复：

1. 私有准备 Agent/Session，执行可异步的 setup；其可选同步 commit 在对外登记前执行。
   setup 只组合作用域、不驱动 Agent，这是可信调用方约定，不是本包施加的运行时限制。
2. setup/commit 失败，撤销已拥有资源而不制造 created；调用者需要安装覆盖后续失败的清理链。
3. 进入 Session 与 Agent 注册表，再按 session/created → agent/created → agent/session-start
   公告并启动驱动器。已部分送达的公告不能回滚为“从未发生”，清理须配对相应生命周期。
4. 句柄释放、调用 owner 卸载及 provider 卸载均需纳入创建物的结构化生命周期。

**LA-F3（本轮保留问题）**：`AgentHandle` 一段上游 JSDoc 与其余生命周期说明存在
“作用域清理和注册表删除谁先发生”的顺序差异，见[来源差异](../source-map.md)。
本基线只接受注册表本身的 LA-R3/R4 顺序；端到端句柄的排空、作用域清理、两注册表撤除
必须在后续 factory/Loop 契约统一后才能承诺或实现。不能直接复制那一段 JSDoc 作为保证。

创建选项中的 Session ID、持久父系、种子事件、继承事件数、工作目录、preset、委派深度、
创建期 signal 和 setup 是提供者输入；它们不是本包实施的存储、沙盒、preset 或取消政策。
resume 是否需要/支持持久存储及恢复什么状态，由提供者和 Session 能力决定。

## 发起者边界与服务撤除

**LA-I1**：withInitiator 建立因果归因，withoutInitiator 显式清空。嵌套返回或抛错后恢复
外层；重叠异步链彼此隔离。currentInitiator 在边界外返回缺失，requireInitiator 缺失时
抛错。归因不证明引用活性，不授权任何操作，也不修改显式传递的身份字段。

**LA-I2**：边界保持操作的同步返回值和原 Promise 对象身份；同步抛错原样传播。
跟踪范围是操作返回、且能挂接完成观察器的真正 Promise（含跨 realm Promise），
不包括普通 thenable、游离后台任务或无法安装观察器的异常 Promise species。
后者释放跟踪计数且保持返回身份，不提供排空保证；不得将“任意异步工作”视为已被结构化拥有。

**LA-I3**：发起者能力的状态为 active → closing → disposed，不能逆行。closing 拒绝新的
with/without 边界，允许已有延续读归因；disposed 后 currentInitiator/requireInitiator
也失败。此状态只约束这四个发起者方法，不是整个注册表对象的通用失效开关；
get/list/roots/isOwnedBy 没有相应检查，原始 enter 的条目也不据此自动撤销。
释放等待尚未完成的被跟踪边界，但排除发起本次释放的边界及其祖先链，以免等自身造成死锁。
其他链仍必须排空。重复释放共用同一释放过程。

如未被排除的 Promise 永不完成，卸载可能一直等待；本包没有超时强杀或跨进程恢复。
排除的自卸载链可以在发起者能力失效后继续返回，不能再通过上述方法读归因。状态和排空计数由
[InitiatorScope.tla](InitiatorScope.tla) 表达；语言宿主的异步上下文传播由源测试验证。

## 事件和辅助计算

**LA-E1**：默认 agentCarrier 使用目标 Agent 同时作为 scope 与 subject；agentEvents
将 payload 中的 agent 覆盖成绑定引用。emit 对每个监听器隔离并报告错误；serial
依次等待，第一个既非 null、false 也非 undefined 的返回值使分发停止并成为结果，
无人短路则返回 undefined。waterfall 将监听器包在末端 next 回调外，返回最外层组合结果；
监听器通过 next 委派，也可不调用 next。后两者的异常向调用方传播。依赖语义见固定版本的
[Cordis 事件文档](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/events.md)。
这一 emit 规则与注册公告的同步否决路径不同。可选自带 carrier 未被上游校验，调用方
必须保证它和 Agent 匹配；分发作用域是路由，不能当租户授权。assembleContextFor
只构造目标与可选取消信号，不自行装配上下文。

**LA-M1**：installModelSelection 在装配开始取得 `selection.current` 的**对象引用**，
下游装配完成后将该引用记为 assembled，并设置提示变量；请求中间件在下游返回后应用
assembled 的 provider/model/可选 reasoningEffort。要保持一次装配与请求一致，调用者
须以新对象替换 current，且不再原地修改捕获对象。同一 selection 引用的一轮装配至
请求读取之间也不能被另一轮装配覆盖 assembled；助手没有并发装配隔离或按请求版本关联。
同一 selection 对应的 pre-step（含通知）、装配和 request 链串行消费是调用前提，
实现没有深复制或冻结保证。
无显式 effort 时清除继承 effort。路由变更提示只比较 provider/model，且受 pre-step
接纳、取消、空输入和既往请求头条件约束；effort 单独变更不提示。助手返回统一监听器
撤销能力。它不是模型适配器、OpenRouter 强制入口或 PF-023 的完整动态切换事务。

**LA-W1**：foldConsumedWork 只折叠给定的合法有序 Session 事件或调用方拥有的后缀。
折叠从空状态开始，不从截取点之前补回 open turn、step 或核算结果。一次 turn 在给定
输入中有 step，或本次折叠已看到 turn/start 后在该 open turn 内 claim 输入且非 completed
地结束，才成为最近的工作核算边界。若后缀漏掉 turn/start 且没有 step，仅有 claim 与
非 completed 的 turn/end 不足以归属并核算该工作；需要完整结果的调用者须提供覆盖边界的日志。
没有输入/step 的结束不替换该边界；已 claim 但 completed 且无 step 的空决策不核算。
已规范化的取消 splice（removedCount 字段存在且 inserted 为空）在后续核算 turn 之前
留下 droppedUnrun；替换输入不算丢弃，后续核算 turn 吸收先前标记。该结果既非成功判定，
也非计费、外部效果或存储落盘的权威事实；输入规范化与日志完整性不由此函数验证。

**LA-S1**：可选 invariant 插件按精确 Agent 引用记录最近 idle/running，重复同状态
通知触发违规。它是检测器；未安装不改变未来驱动器应满足的状态通知契约。

## Agent 驱动端口和词汇依赖

下表完整列出本包携带、但主要由其他包实现的端口组。记录已有接口有利于维护，
不等于接受其所有产品政策。公开方法、类型与事件逐项源路径见[来源映射](../source-map.md)。

| 端口组 | 上游声明含义与本轮边界 |
|---|---|
| options/session/inbox/status/ctx | Agent 的运行时表面；idle/running 不包含 disposed。维护任务可在公开 idle 下持有工作，因此 idle 不等于静止。 |
| cancel / whenIdle / runMaintenance | 驱动器负责协作取消、停止原因、可选保留 inbox 和排空。取消不为未来工作预置 abort；即使无活动 turn，默认清 pending 仍可能有作用。whenIdle 不是某条消息的完成凭据。 |
| send / followup / steer / inject | 分别为指定目标及是否唤醒的通用输入入口、后续 turn、后续 step、无唤醒注入；实际调度由 Loop 实现。steer 不承诺 interrupt_then_run；本轮不采纳上游队列策略为 OMNE 产品策略。 |
| inbox clear/append/prepend/replace/remove/splice | 两个有序列表 next-turn/next-step；规范化 splice、持久记录及 live 通知的顺序属于写入者/投影实现。 |
| AgentHandle / AgentFactory / CreateAgentOptions / ResumeAgentOptions | 构造、设置、恢复和释放端口，受 LA-F* 限定。 |
| agent/inbox/spliced、InboxState / InboxWireState、TurnBoundaryProjection | Session 事件和投影词汇；raw UserMessage 与 JSON 安全投影分开。turnBoundary 注册依赖 Loop，缺失表示能力缺失，不能直接判作存储损坏。 |

运行时事件：created、disposed、status、inbox/inserted、inbox/claimed、inbox/discarded、
session-start、assistant-stream、error；waterfall 端口为 pre-step、request、request-error；
serial 端口为 turn-stopping，均有 `agent/` 前缀。具体生产时机由声明端口的实现者负责，
本包直接拥有的 created/disposed 例外见 LA-R*。

assistant-stream 的 start/chunk/end 以 attempt 标识一次尝试，chunk index 连续递增，
end 包含块数及 committed（Session 事件类型/序号）或 abandoned。它是实时观察词汇，
不是持久化流协议；此处 committed 指逻辑事件边界，不代表 fsync。pre-step 接纳/拒绝、
request 参数、request-error 重试决定和 turn-stopping 短路均待 Loop 组合设计。

本轮不创建 JSON Schema：没有新接受的跨语言持久/传输结构，Session、消息和身份的
同义值不能在本能力重复定义。未来消费上述 wire 词汇时必须先建立/引用精确数据契约，
不能把 TypeScript 类型当正式 Schema。Alloy 暂不增加；当前注册结构约束已在 TLA+
有限状态模型中检查，授权结构并未因此得到验证。

## 依赖、动态替换和未来维护

Cordis 提供服务、调用追踪、效果和类型化分发；scope 提供目标路由；Session、LLM、
投影、system-prompt、typert、值类型和可选 invariants 构成其余包边界。
[基线清单](../upstream-baseline.json) 区分根入口运行时导入、类型依赖和附属入口；
package.json 的 peer 清单不等同于所有服务必须挂载的清单。

**LA-T1**：当可选 typert 服务可用时，本包贡献 Agent lookup 和 Agent context provider，
以 Session ID 解析当前 Agent 或其 ctx；贡献随注入作用域撤除，依赖重现可重新贡献。
这条 ID → 活体引用桥接直接使用 get，没有租户过滤，也不防止同 ID 新生命期被再次解析。
因此本轮允许它作为可信内部桥接的源语义，不能直接用作面向租户的远程能力入口；
后续装配必须在解析之前实施租户授权，并明确远程句柄的失效和再解析语义。

当前注册、作用域和 initiator 不持久化，进程退出后不可恢复这些活体引用。重新构造
同 ID Agent 是新的运行时实例。未来跨进程部署必须通过可授权的身份/代次/操作协议
重新取得能力，不能序列化对象引用或假设异步局部变量会跨网络传播。

允许 factory 解绑后重新绑定；已有实例和监听器按各自 owner 清理，不能假定更换
factory 或模型对象会原地迁移所有实例。这些显式变化点支撑动态组合，并非任意热替换保证。

fork 的下一阶段应保存来源与版权、逐项保留或明确修订 LA 规则，并为选定的包入口和
依赖建立可重复构建。先明确租户能力如何取得、驱动端口与 Session 数据的本项目契约，
再将 primitive 接入产品运行路径。新增包装只有承载这些实际边界时才有价值。

本轮只形成源语义基线；不实现工具、模型请求、持久化、跨租户访问入口、HITL、
interrupt_then_run 或恢复接续。它们的缺口不以此基线通过评审而消失。

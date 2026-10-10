# 完整模型请求的公共边界与宿主接缝

本页记录模型能力的目标边界和集成选择，不复制操作业务条款。
完整十五操作、公共端口及必要独立算法已迁入本包；现行行为归 [SPEC](../SPEC.md)。[精确保留范围](../../../../.meta_harness/design/architecture/pilots/n4-ownership.md#模型请求运行时)继续约束未迁提供者投影与综合模型。
本页不会把设计采用提升为公共入口、提供者或生产来源已经交付。

## 唯一拥有者

完整操作形状归本包纯根。操作协议名为 `ModelRuntimeOperations`，Cordis 抽象类名为 `ModelRuntimeService`；二者分属纯根与 `./cordis`，不互相代替。
绑定类静态唯一键为 `modelRuntime`，导出键 `MODEL_RUNTIME_SERVICE` 从该静态字段取得。
具体提供者使用 `model-request-runtime-local` 限定名。旧 local 操作接口、键与绑定重复定义在实际消费者切换时删除，不保留兼容别名。

完整方法集合为 acquireCall、legalTargets、displayList、effectiveModel、selectModel、openCall、dispatch、dispatchAgain、interrupt、releaseCall、reconcile、readAttempts、settleReply、canDispatchAgain、acknowledgeCall。
每个方法保持其原输入、闭合结果、错误判定次序和异步结果。
dispatch、dispatchAgain、readAttempts 的失败消费重载、acknowledgeCall 的明确目标及原 pending 认回不得在类包装中丢失。绑定保留完整函数类型，不能只用取最后一个签名的 Parameters/ReturnType 代替全部重载。
公开形状迁移时，类型外行为随本包 SPEC 接续；以本包 SPEC 接续公共行为，不以本页摘要替代完整承诺。

完整形状见[操作接口](../src/service-types.ts)。迁移单位是下列整套接口，不按方法分批留下两个定义拥有者。

| 操作             | 显式输入 → 闭合结果                                        | 行为定位    |
| ---------------- | ---------------------------------------------------------- | ----------- |
| acquireCall      | AcquireCallInput → AcquireCallResult                       | S-89        |
| legalTargets     | `{session}` → ServiceLegalTargetsResult                    | S-24        |
| displayList      | `{session}` → ServiceDisplayListResult                     | S-25        |
| effectiveModel   | `{session}` → ServiceEffectiveModelResult                  | S-26        |
| selectModel      | `{session, routeName}` → ServiceSelectModelResult          | S-27        |
| openCall         | OpenCallInput → OpenCallResult                             | S-28        |
| dispatch         | DispatchInput → DispatchResult；保留失败消费重载           | S-29        |
| dispatchAgain    | DispatchAgainInput → DispatchAgainResult；保留失败消费重载 | S-30        |
| interrupt        | InterruptInput → InterruptResult                           | S-31        |
| releaseCall      | CallKey → ReleaseCallResult                                | S-32        |
| reconcile        | ReconcileInput → ReconcileResult                           | S-33        |
| readAttempts     | CallKey → ReadAttemptsResult；保留失败消费重载             | S-34        |
| settleReply      | SettleReplyInput → SettleReplyResult                       | S-49        |
| canDispatchAgain | CanDispatchAgainInput → CanDispatchAgainResult             | S-50        |
| acknowledgeCall  | AcknowledgeCallInput → AcknowledgeCallResult               | S-96～S-103 |

`releaseCall` 是 S-32 的调用上交收场，不是消费句柄的 `release`。
消费句柄释放只撤等待/观察引用，不取消原执行、不产生 durable ACK；上交、执行中断与结果确认分别按原操作处理。

| 相关定义                      | 当前公共拥有者                 | 保留责任                                                               |
| ----------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| 日志追加、前缀、原子判重      | `core/session-log`，SL3        | 普通 append 与参与事务明确区分；完整前缀、未知回执及实际写者停止保持   |
| 档案目录、凭据读取            | `core/model-profile-directory` | 精确版本、当前资格与原调用快照；工厂构造和私有库接口不整体搬入公共定义 |
| 当前求值及 registry 输入/历史 | `core/asset-evaluation`        | evaluation-input-store 是提供者，不另建同义公共包；不可用不得补空输入  |
| registry 操作与值             | `core/asset-registry`          | 原表/报告/来源认回范围保持；公共类型存在不表示完整 provider 已验收     |
| 租户映射、当前会话访问        | `core/session-tenancy`         | 租户身份显式；scope、来源版本与历史许可均不是授权                      |

原公开独立调用、守卫、选择、重试、结算、历史、诊断、引用及 ACK 构件仍须可单独取用。
公共操作类型及其必要值形状按定义拥有者归位。通用算法只有在不依赖具体后端、其完整消费者同步后才迁入公共函数入口；提供者构造、物理 close、存储、调度与组件工厂留在其实现拥有者。
不能因导出可见就把整个提供者搬进 core，也不能以只保留十五方法为由删除其他独立能力。

## Session 编排的宿主输入与注入

以下十五操作及其调用容器由 `session/session-runtime-local` 实现。物理 Model 提供者不消费这些 Session 宿主输入；其独立执行函数通过 `ModelInvoker` 显式借入。

运行时提供者自行构造其调用容器、内容保留和私有协调构件；这些具体实现不是公共业务契约。
原 `SessionModelConstruction` 仍是独立工厂的显式输入，不因 Cordis 集成而变成插件 JSON 配置。

跨包宿主端口的纯形状归本包。`ModelRuntimeHostInputs` 只组合以下已存在的语义端口：

| 字段           | 责任与现行形状                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `sessions`     | `RuntimeSessionAccess`；每次绑定实际 tenant/Session、日志、档案、当前输入及观察者归属                            |
| `history`      | `CurrentHistoryReaders`；原调用、失败、校准、Run 的同一完整前缀解释                                              |
| `recovery`     | `RuntimeRecoveryAccess`；每次 authorize 核当前主体资格；enter 拥有真实旧写者停止、唯一 scope、原调用定位及 close |
| `callAccess`   | `CallAccess`；每次使用点的当前读/等待/处分/控制资格                                                              |
| `callPresence` | `CallPresence`；实际执行代际及连续性，notFound 与 unknown 分开                                                   |
| `identities`   | `ModelIdentitySource`；实际 call/response/message 身份来源，不替换已有数据身份                                   |

它是受信宿主的集成接缝，不拥有模型发送、费用、结果或 Session 业务状态。宿主桥分别借用原拥有者的端口，不复制其事实或给予统一的授权答案。
绑定为 `ModelRuntimeHostInputsService`，静态键 `modelRuntimeHostInputs`。`capture()` 无业务输入，同步返回 `{ inputs: ModelRuntimeHostInputs, lease: ModelRuntimeHostLease }`。宿主桥拥有 capture 与借用登记；模型提供者拥有取得的租约引用。租约形状为 `{ generation: object, isCurrent(): boolean, release(): void }`；generation 是宿主桥本次实际资源代际；各被借用来源仍携带自己的原 generation/sourceVersion，不能用桥代际替代日志或执行身份，isCurrent 只判新准入资格，release 幂等地交还这一份借用，不取消执行、不写 ACK，也不声称底层资源已关闭。

提供者保有本代注入的精确宿主桥实例，不在每次调用重新发现或绑定后继。每次调用用本次接收者的 `this.ctx.reflect.trace(原宿主桥引用)` 取得其调用方投影，再 capture；源服务键已撤除也不改用后继实例，保有引用本身仍不构成资源或授权保证。
capture 必须沿本次服务调用接收者的 Context 定位受信宿主登记的调用主体；Cordis 的接收者 Context 可是追踪派生对象，不能以 Context 对象全等判定注册身份。可信登记以实际调用 fiber 的宿主登记为定位依据，并继续核真实主体资格；未知主体得到拒绝访问的端口，不回退为 provider 主体。Context 只用于定位，不是资格证明。宿主桥从认证入口捕获的真实主体建立独立绑定；不能从调用方传入的 tenant/Session/allowed 声明建立资格，也不能在 provider setup 时 capture 一份特权主体供所有人使用。
capture 不进行 IO、业务授权判定或异步借用，始终正常返回上述形状。主体未知、桥已停止/物理撤除、原来源不可取得时，也返回完整输入组合和该原桥代际的租约；不得因此抛出业务异常或提前返回整个方法的 unavailable。不可取得的对应端口在原操作的绑定/来源使用点给出其原 invalidInput/unavailable 等闭合结果；不补空事实或取得后继来源。其他可用端口仍按原协议工作，不能把某一来源失败扩成所有十五操作的统一拒绝。失效或没有实际借用的租约 isCurrent 为 false，release 幂等且不关闭别人的资源。
异步借用仍发生在原 sessions.bind/recovery.enter 等端口的协议位置；取得每份实际资源前先登记其责任。部分借用失败不交付不完整 binding/scope，不改变原业务失败次序；已取得的资源前缀由原桥登记的拥有者收口。其排空或释放未知时继续保有，不能因该操作返回失败或交还一份租约而遗失责任。

capture 在任何异步工作之前固定本次主体、来源和代际；取得的函数只闭包捕获这一份绑定，不能通过可变的全局 currentActor 取得资格。返回的 CallConsumer.wait 及观察回调继续引用原主体及撤权信号；另一个主体的并发调用不能替换它们。
一个已登记调用 fiber 在存续期间只绑定一个受信主体，登记后不得覆写。共用 HTTP/CLI 入口 fiber 不可把当前请求主体写进该登记；装配须先建立各主体的独立调用贡献，或使用显式绑定真实主体的纯工厂门面。Context 隔离不代替认证与当前授权。两个主体即使访问同一 Session，也不得共用同一主体登记。
同一 Session 的两个调用主体仍有独立 callAccess 和撤权信号。原十五操作的输入保持；其原输入校验、绑定、授权与错误次序不被 capture 添加的提前拒绝改变。资格缺失在原协议规定的使用点返回原失败分支。CallAccess.check 的 admitted 回调仍携带真实证据，并在原读取、等待、处分、控制和 ACK 使用点重核当前资格；不能先做一次允许检查，再以宿主特权执行。

提供者按当前调用主体投影操作门面，各门面共享同一调用容器、在途登记、执行拥有者和整体 close。门面不是另一份 createSessionModelRuntime，撤除门面也不调用共享 runtime.close。原已外发的执行、结算写者和费用归原拥有者；新的读取或控制仍由本次主体取得资格。原调用的持久写入依据不能被后来的主体覆盖。
纯工厂调用者显式交入已经绑定真实主体的相同端口，不必创建 Context，也不获得自动授权。

宿主桥在取得原日志、历史、恢复及 presence 来源时登记实际借用，保有其精确资源代际；租约引用本身不能阻止源释放。模型行装配在宿主桥和实际支持来源之后，关闭顺序相反。原模型 close 未确认时，该行保持 pending，装配拥有者不得先物理关闭其来源行。单独撤除调用主体或 Session 贡献只失效该新准入/消费门面，来源资源仍由稳定宿主与原在途拥有者保有。独立部署不使用该装配协议时，也须由调用方显式提供等价的排空后释放顺序。
isCurrent 失效只关闭该代际的新工作，不能统一屏蔽关闭后读、对账和 ACK；这些操作仍核当前资格与实际保有来源。
执行、等待/观察及借用均停止或完成可核实交接后才 release；归还一份借用不意味着其他借用或未知写者已消失。来源失权使当前访问按原协议拒绝，但不能借此删除原结果、费用或 ACK 收场责任。

函数型执行政策由单独的 `ModelRuntimeExecutionSupport` 纯接口组合，字段保持现有 SessionModelConstruction 的 settlementContention、settlementScheduler、policy、acknowledgementCleanup、diagnostic 及可选 diagnosticCollector 原形状；不包含 calls、callFacts、sessions、history 或 recovery。
绑定为 `ModelRuntimeExecutionSupportService`，静态键 `modelRuntimeExecutionSupport`。它提供同部署代际的显式执行政策，调用方先取得这一代际的固定引用。具体政策由可替换的支持提供者创建；时间与调度仍借用实际 Clock，不自行创建第二套时钟。配置只描述现有显式政策数据；next、decide、schedule、diagnostic 等可执行对象不序列化，不加入隐式重试或清理默认。
支持拥有者负责其调度句柄和诊断资源，按原在途工作排空后释放；模型行在其后装配、之前完成关闭。它与受信主体桥是不同的变更/寿命拥有者，不因接线便利合成整个 SessionModelConstruction 服务。

提供者必需注入 host-input、execution-support、Storage、Clock、modelTransport 及其实际已采用支持能力。modelInputMeters 由实际选择并登记计量器的 transport／adaptation 贡献注入；local runtime 不添加无直接消费的依赖。
支持服务的精确键从公共 `./cordis` 取得，不复制字符串常量。
配置只含已有显式标量/序列化策略；maxScopes、等待界、token margin、ACK 清理及关闭诊断没有隐式默认值。
身份、回调、策略执行、资源与生命周期对象经具名服务或提供者自有构件交入，不进 JSON。
可选诊断/观察来源缺席按原协议处理，不伪造可选 inject，也不以缺观察者取消模型执行。

已有 transport、retrySample、inputMeter、目录、凭据和共享生命周期接缝直接复用。
本能力不新增业务控制或事实权威事件（RT12 S-37）；通知和诊断仍沿各自拥有者，不把模型事实广播改成放行协议。

## Session 与执行责任

Session/Run 的业务事实与恢复索引由正式 Session 协调拥有；候选方向见[Session 边界](../../../../.meta_harness/design/architecture/session-agent-runtime-phase1/boundaries.md)。
H4 不建立第二套 Session 状态服务，也不以该候选的存在宣称完整来源已实现。
模型执行拥有者独立于 Agent 等待/观察寿命；Agent 交还句柄不触发模型 provider 的整体 close。

会话动态贡献可在独立 Context 中装载，但 Context 不拥有持久 Run/费用/ACK，不授予租户权限。
模型执行池在稳定宿主保有原调用；Session 桥绑定明确身份、当前授权与来源代际。
只停某个 Session 时，只关闭其新工作准入并传播该 Session 已接受的取消目标，不能撤掉所有 Session 共用的模型 provider。
共用 provider 真正关闭或替换时，按原 S-36 收场全部自身在途责任。

Session 没有新增不可逆业务终态：PF-015 的运行/休眠/归档仍按其有效规则。
运行时 scope 的撤除与 Session 归档不是同一件事；Run 终结由真实持久事实认定，不能由 Agent 缺席、Map 空或 fiber dispose 推导。

新工作继续按原当前工作准入及尝试栅栏处理。
原已准入 dispatch 的 opened 继续 S-88 的 unfenced + tailEquals 全前缀协议；新 attempt 本身不拒绝真实旧执行的 first-token。
这项例外不能扩大到新 dispatch 或新 Loop 推进。
迟到结果及费用保持原 call/dispatch/Run 归因；最新 attempt 不取得原结果的所有权。

## 停止、恢复与交接

关闭准入、请求取消、实际停止、持久结果/ACK 和资源释放是不同边界。
宿主先同步关闭新 open/dispatch/dispatchAgain，再沿原操作记录中断及观察实际工作。
读、处分、对账、消费释放和 durable ACK 认回保留原关闭后行为，不能用统一 runtimeStopped 包装全部方法。

原 close 返回 unavailable 或抛错时仍由同一 owner 保有原资源、完整 payload、写者及依赖；原责任没有移交就不报告 released。
复用 assembly-lifecycle 的 retained-work/原 close control，不用一份失败 Promise 代表真实完成。
换代先失效旧新工作准入。Session/主体贡献的换代不关闭稳定模型执行池，旧调用仍由原实际执行或有可核实交接的后继接续。
模型 provider 所属整体装配代际的替换遵循 assembly-lifecycle：原已登记行关闭结果完整、失败处置及宿主 guard 完成前，不启动后继整体代际。retained/unknown 不能放行并行启动新模型池；原调用交接也不能绕开这个门。无法确认时保持未完成，不重发同义请求。

恢复资格来自旧网络、内容门、追加及结算写者已经实际停止和唯一恢复拥有者，不来自单次取消请求或超时。
恢复在没有 Agent、没有新通知时也要公平检查持久义务。存储/权限/来源不可用保留 blocked 和继续责任，不制造终结或部分成功。
扫描、退避、并发与关闭等待是显式有界策略，不借有限模型编造恢复 SLA。

Session 的保管承接不能成为通用 ACK 布尔值。
原完整 Pending、必要引用和原值身份可靠保存后，模型拥有者按 RT12 S-96～S-103 核自己的明确目标及资格，确认与清理仍按原提交边界。
未知交接不能触发 ACK，迟到保存也不使 Run 复活；确认后的全文释放不删除历史账或抹去真实费用。

## 复核条件

选择正式 Service、独立会话贡献及保有原执行责任，不新增自有内核或 Session 状态框架。
代价是显式宿主桥、代际租约、恢复驱动和跨 owner 验证；隐藏在一个 construct 回调中虽少接线，却无法由正式依赖及生命周期管理替换。
将全部请求实现在 core 集中维护能减少文件边，但会把后端、物理资源和政策绑定给所有消费者，故不采用。

当宿主输入的字段出现不同替换/生命周期拥有者，或租约不能保留真实旧来源时，拆分相应支持接缝，而不增加整个 provider 依赖豁免。
新 Session 准入、日志事务参加或原调用 ACK 适配若改变当前业务/提交保证，须有其独立采用范围及真实组合；本页不接受完整 Session/Agent 第一期 API 或其数据格式切换。
公开契约、实际 provider 和消费者全部切换后才退役精确旧源；未迁义务保持。

完整日志前缀的私有品牌、唯一 reader 与解释器同归公共拥有者，保留唯一模块 token。读取通过显式原日志/任务登记执行 IO，品牌仅防止绕过完整前缀校验，不认证授权、真实日志来源或后续写方停止。实际注册、停止、代际与 IO 责任留原宿主/提供者。

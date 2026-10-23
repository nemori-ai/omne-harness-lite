# @omne-harness/session-cordis 行为规格

状态：Service 实现成员，候选设计，尚未技术接受，没有运行实现。本成员把 [session](../session/SPEC.md) 的机制装进 [session-cordis-contract](../session-cordis-contract/SPEC.md) 定义的服务 `session`，承担端口取得、配置校验、调用方类核对、提交通知的派发与订阅、每租户扫描者的绑定，以及撤除与换代。领域行为归 [session-contract SPEC](../session-contract/SPEC.md)，机制行为归 session SPEC，本页都不复述。插件、配置与撤除的机制说明归 [Cordis 说明](docs/cordis.md)。

本页的性质编号是 1 至 11。服务定义成员的性质 1 至 7 写作「定义性质 n」。

## 提供者责任

本成员必须保持下列性质。

### 服务与依赖

1. 服务与键：`./cordis` 导出 `SessionService` 的具体子类与插件。子类不写键，不自己 `ctx.provide` 键 `session`（[IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)、定义性质 1）。根入口不导出任何东西（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4) 的空根入口）。不装配 Cordis 的宿主直接用 session 的工厂 `createSessionInstance`。一个 isolate 标签下只装一份本插件（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。同一标签下重复装载时第二份失败，不静默覆盖。这一点只有源码读数。
2. 依赖取得：插件的 `inject` 只写事务端口的键 `sessionTransactions` 与内部主体的键 `sessionPrincipals`，用数组字面量和定义成员导出的键常量（[IC-8](../../../docs/architecture/cordis-integration-conventions.md#ic-8)）。其余端口在每次调用时经 `ctx.get` 现取（[IC-9](../../../docs/architecture/cordis-integration-conventions.md#ic-9)）。现取用插件装载时捕获的本插件 Context，不用服务方法里的 `this.ctx`，因为后者是调用方的 Context（[service-method-ctx-is-caller](../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。本成员不跨调用持有端口引用。每个端口怎样交给工厂、缺席或抛出时怎样表现，见下文[端口接线](#端口接线)。
3. 配置：插件配置用 Standard Schema 校验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。字段是调度策略 `policy`、撤除等待上限 `disposeWaitMs` 与受理槽声明 `admission`。`admission` 可以省略，或取 `'none'`，含义见性质 8。`policy` 的每个字段可以省略，省略时取 session 的 `defaultSchedulingPolicy`。默认值只是初值。校验拒绝未知键、负数、零上限、空退避序列与非有限数；`preEvaluation.prewarm` 只接受 `false`。配置错误时插件加载失败，fiber 进入 `FAILED`，不构造实例。Service 子类静态 `Config` 的这条路径没有 basis 核验，是假设。配置不含租户、主体、句柄或回调（[IC-16](../../../docs/architecture/cordis-integration-conventions.md#ic-16)）。
4. 构造：事务端口与内部主体都在场且配置合法时，插件调用 `createSessionInstance(dependencies, { policy })`，服务实例拥有得到的 `SessionInstance`。工厂对配置的再次校验失败时，插件加载失败，与第 3 条同样处置。共享事务域不成立时，`maintain` 返回 `unavailable`，面上的读写同样返回 `unavailable`，`owner` 为存储参加者。本成员只报告这个结果，不改写它（[P-1](../session-contract/SPEC.md#具名前提与明确缺项)）。

### 端口接线

session 的工厂把依赖分成三类（[参数与依赖](../session/docs/public-api.md#依赖)）。本成员按下表把[端口服务键](../session-cordis-contract/docs/cordis.md#端口服务键)接到工厂字段。端口缺席时的契约表现以服务定义成员的端口表为准，本表只写本成员怎样兑现它。

| 键 | 工厂字段 | 本成员怎样交给工厂 | 缺席时 | 端口抛出时 |
| --- | --- | --- | --- | --- |
| `sessionTransactions` | `transactions` | 插件体里 `inject` 取得的实现，直接传入 | 插件停在 `PENDING`，服务不在场，`inject` 了 `session` 的调用方插件也停在 `PENDING` | 不包装。失败由事务端口按契约返回 |
| `sessionPrincipals` | `principals` | 插件体里 `inject` 取得的内部主体，直接传入（性质 8） | 同上。插件停在 `PENDING`，不启动任何协调器与调度器 | 不适用。内部主体是对象，不是端口调用 |
| `sessionIdentity` | `identity` | 完整接口的代理。每次方法调用时现取 | 该次调用返回 `unavailable`，`owner` 为该端口的服务键 | 该次调用返回 `unavailable`，`diagnostic` 带原因，并记录诊断 |
| `sessionEvidence` | `evidence` | 同上 | 同上 | 同上 |
| `sessionIdleInput` | `idle` | 同上 | 同上 | 同上 |
| `sessionContextInput` | `context` | 同上 | 同上 | 同上 |
| `sessionClock` | `clock` | 同上。`sample` 按上两列处置 | `sample` 返回 `unavailable`。`waitUntil` 的结果类型没有不可用分支，代理以指明端口缺席的错误拒绝这个 Promise，见[明确缺项](#明确缺项) | `sample` 同上；`waitUntil` 原样拒绝 |
| `sessionNotifier` | `notifier` 的一部分 | 见第 5 条。本成员组合出的通知者每次提交后现取这个键，存在时转发 | 只派发 Cordis 事件，不转发 | 记录诊断，不回滚提交，不改回执 |
| `sessionAgentDrive` | `agentDrive` | `Current`：`current()` 现取，缺席时返回 `null` | 出站调用不发出，任务保留，由 session 的调度器重放 | 不包装。结果由 session 的协调器按契约处置 |
| `sessionToolStartFence` | `startFence` | 同上 | 同上 | 同上 |
| `sessionDeliveryRelease` | `deliveryRelease` | 同上 | 同上 | 同上 |
| `sessionScopeRelease` | `scopeRelease` | 同上 | 同上 | 同上 |

代理只把「缺席」与「抛出」映射为 `unavailable`。代理不补默认值，不用系统时间代替时钟采样，也不把缺席报告为成功。已经发出的端口调用不改投新的提供者：端口提供者在调用途中换代时，该次调用以旧实现给出的结果结束。

### 唤醒、调用方与扫描者

5. 提交通知：本成员交给工厂的 `notifier` 是一个组合通知者。每次提交确认耐久后，它先派发事件 `session-cordis-contract/committed`，再现取 `sessionNotifier`，存在时把同一载荷转发给它。派发用本插件 Context 的 `parallel`，不在提交路径上等待监听者完成。派发在 `await` 外捕获失败，包括 `AggregateError` 里的监听者失败，只记录诊断（[IC-12](../../../docs/architecture/cordis-integration-conventions.md#ic-12)、[事件与作用域](../../../docs/architecture/runtime/runtime-contract-integration.md#事件与作用域)）。通知缺席或失败不回滚提交，不改回执（[EC-11](../session-contract/SPEC.md#ec-11)）。插件同时用 `ctx.on` 监听同一事件，把载荷交给实例的 `committed`。本插件自己派发的通知可以跳过这一步，因为实例已在本地唤醒；跳过只是优化，重复交入也无害。监听者同步执行，不返回 Promise，失败只记录诊断。
6. 调用方类核对：四个面属性 `work`、`management`、`reconciliation`、`history` 每次被读取时，用 `this[Service.resolveConfig]()` 取调用方 fiber 的 intercept 配置（定义性质 4）。取不到配置，或其中的调用方类不在四类之中时，该面的每个操作返回 `denied`，`action` 为操作名，不默认为任何一类。取到时返回 `facesFor(caller)` 给出的面，该面在每个操作上再核对调用方类是否在该操作允许的范围内（[VC-O05](../session-contract/SPEC.md#候选的持续验证义务)）。两层核对都是一致性检查，不计为访问控制。访问边界是每个操作的调用资格（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。属性读取经调用方的服务代理到达这里，所以 `this.ctx` 是调用方的 Context。这一点与定义性质 4 一样只有源码读数，是假设。
7. 每租户一个扫描者：第一版靠装配单实例兑现（[IC-19](../../../docs/architecture/cordis-integration-conventions.md#ic-19)、[靠装配兑现的保证](../session-cordis-contract/docs/cordis.md#靠装配兑现的保证)）。应用装配在全部进程里只装一份本插件。本插件第一次在某个租户的提交通知里见到该租户时，调用 `maintain(tenant)`，持有返回的句柄。通知可以来自本实例的提交，也可以来自监听到的事件。同一实例对同一租户再次调用 `maintain` 得到已有句柄。`maintain` 返回失败时，本插件记录诊断，等该租户的下一条通知再试，不在失败后立即重试。在两个 isolate 标签下各装一份本插件，会使一个租户有两个扫描者。这违反本条，装配拥有者不得这样装，除非租约协议已经定义。这时第二道保护仍是操作幂等、`expected` 核对与执行记录提供者的条件提交围栏（[SR-2](../session/SPEC.md#sr-2)）。租户集合的来源是[明确缺项](#明确缺项)：插件配置不列租户，扫描者以系统作用域读取应用装配配置的租户目录。
8. 内部主体与受理槽：工厂要求 `principals`（协调器与调度器提交命令时用的主体）与 `admission`（受理前的槽列表）。主体是运行时对象，由应用装配的维护拥有者签发，按 [IC-16](../../../docs/architecture/cordis-integration-conventions.md#ic-16) 由装配入口经服务键 `sessionPrincipals` 提供（[端口服务键](../session-cordis-contract/docs/cordis.md#端口服务键)），本插件与事务端口一起 `inject` 取得。槽由命令域与 hooks 的拥有者经 session-adapters 接入（[AD-08](../session-adapters/SPEC.md#ad-08)），它的服务键尚未定义，见[明确缺项](#明确缺项)。槽的键定义之前，受理准入按不可用处理（[准入服务不可用走全拒承接](../../../docs/architecture/runtime/control-and-recovery.md#存储与关键服务降级)）：`admission.current()` 返回不可用，`accept` 返回 `unavailable`，`owner` 为受理槽，不经槽受理。只有装配在插件配置里以 `admission: 'none'` 声明本部署没有命令域与 hooks 时，`admission.current()` 才返回空列表，`accept` 不经槽。这项声明由装配者负责，本成员不推断。

### 撤除与换代

9. 撤除：插件卸载时，本插件在一个 effect 里按下列顺序撤除。几步写在同一个 effect 里，因为不同 effect 的释放是并发的（[effect-disposal-concurrent-not-ordered](../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。
   1. 标记撤除中。此后读到的面对每个操作返回 `unavailable`，`owner` 为 `session`。监听到的通知不再交给实例，也不再为新租户调用 `maintain`。
   2. 释放全部维护句柄，各租户的扫描者停止。
   3. 调用实例的 `close()`，最多等待 `disposeWaitMs`。`close` 按 session 的停止顺序进行：调度器停止接受新的触发，在途命令跑完或返回未知，协调器在当前命令结束后停止，最后释放时钟等待与缓存（[资源与替换](../session/SPEC.md#资源与替换)）。
   4. 等待超时时记录诊断，然后返回。超时不表示实例已经停止。仍在途的命令以自己的结果结束：提交成功时调用方得到回执，提交未确认时得到 `commit-unknown`，调用方以同一操作身份重试或调用 `queryOperation`。

   每一步抛出时本插件捕获它、记录诊断，并继续后续步骤。撤除期间完成的提交不发通知，后续工作由下一个实例的扫描找回。撤除不回滚已提交的事实，不补发未发出的出站调用，不取消任何 Model、Tool、Agent 执行或子会话。外部效果不因 disposer 运行而变得可撤回。依赖丢失不报告为业务成功。
10. 换代：`sessionTransactions` 或 `sessionPrincipals` 的提供者换代或离开 `ACTIVE` 时，插件体先卸载再重跑（[plugin-body-reruns-on-provider-change](../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md)）。旧实例按第 9 条撤除，新实例重新构造，并在新的通知里重新绑定各租户的扫描者。`inject` 了 `session` 的调用方插件随之重跑，取得新服务。Cordis 4.0.4 重跑插件体之前是否等待旧 fiber 的撤除完成，basis 没有条目，是假设。新旧两个实例因此可能短暂并存。这不影响正确性：并存期间的保护是操作幂等、`expected` 核对与条件提交围栏，不是先后顺序。其他端口的提供者换代时插件体不重跑，下一次调用现取到新的提供者。跨换代要保留的事实不在插件体的闭包里。会话事实在存储里，维护的租户集合是可丢的派生物。
11. 边界：本成员不导入任何邻域契约，也不导入存储后端（[落位判据](../docs/architecture.md#落位判据)）。租户与会话是每次操作的参数，不从 Context、isolate 标签、插件实例或插件配置推断，不为会话建 fiber 或 isolate（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)、[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 所有权与生命周期

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务实例与它拥有的 `SessionInstance` | 本插件的 fiber | 插件卸载，按性质 9 撤除 |
| 插件配置 | 装配者给出，静态 `Config` 校验 | 插件卸载。改配置即重新装载 |
| 维护句柄与已见租户集合 | 服务实例 | 撤除第 2 步。集合是派生物，重跑后从通知重新建立 |
| 提交通知的监听 | 本插件的 fiber，经 `ctx.on` | 插件卸载 |
| 端口的实现 | 提供该端口的插件 | 该插件卸载。只影响需要它的操作 |
| 调用方类声明 | 调用方插件的 intercept 配置 | 随调用方 fiber |
| 会话事实、修订、操作回执 | 不在本成员。归事务端口的提供者 | 不随本成员结束 |

进程失败：本成员没有可恢复的东西。重启后插件重新装载，扫描者在各租户的下一条通知到达时重新绑定。会话事实与待办在存储里，由 S3 的启动扫描找回（[S3](../session/SPEC.md#s3)）。

## 明确缺项

下列缺口闭合之前，本成员按「之前」一列表现。

| 缺什么 | 拥有者 | 之前 |
| --- | --- | --- |
| 受理槽列表的服务键或登记入口 | session-cordis-contract，随命令域与 hooks 的公开入口一起定义（[NP-07](../session-adapters/SPEC.md#np-07)）。缺项期间是否允许限定降级由命令域与 hooks 的拥有者裁定 | `accept` 返回 `unavailable`；装配声明 `admission: 'none'` 时不经槽 |
| 来源拥有者变化通知到达本成员的通道。本成员不导入资产、工作区或设置的契约，session-adapters 与本成员没有编译期依赖 | session-cordis-contract | 本插件不调用实例的 `changed`，S7 在 Cordis 装配下不被唤醒。`startRun` 与 `reload` 照常在入口求值，只失去提前求值带来的时延收益（[S7](../session/SPEC.md#s7)） |
| 租户集合的来源 | 应用装配，即契约明确缺项里的事务域目录（[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)） | 扫描者按性质 7 在见到租户的第一条通知时绑定。进程重启后，有待办却没有新提交的租户，在下一条通知之前不被启动扫描覆盖 |
| `SessionClock.waitUntil` 在时钟缺席时的结果类型 | [session-contract](../session-contract/SPEC.md) | 代理拒绝这个 Promise。session 的调度器按它的[时钟被拒](../session/SPEC.md#调度器)规则处置 |
| Cordis 4.0.4 重跑插件体前是否等待旧 fiber 撤除完成；Service 子类静态 `Config` 失败是否使 fiber `FAILED`；同一 isolate 标签重复 `provide` 是否抛出 | 本成员，补 probe | 按性质 3、性质 1 与性质 10 的假设设计。补齐前这三条不是已核验的保证 |

## 验证

当前两个入口测试只检查两个入口都没有导出，不证明下列任何一项。下列义务随实现进入 `tests/`，在真实 Cordis 4.0.4 上运行，不用 Cordis 的替身：

1. 事务端口或内部主体缺席时插件停在 `PENDING`，服务不在场。两者都到场后服务在场。
2. 其他端口逐个缺席：只有需要它的操作返回 `unavailable`，`owner` 为该端口的服务键；读取与无关操作照常。出站端口缺席时任务保留，端口到场后下一次调用取到它，插件体不重跑。
3. 端口抛出时该次调用返回 `unavailable`，不返回成功。
4. 两个声明不同调用方类的插件各自取到自己的配置。没有配置或调用方类不在四类之中时返回 `denied`。调用方类不在操作允许的范围内时返回 `denied`。
5. 每次提交派发一次 `session-cordis-contract/committed`，载荷是租户、会话、修订、原提交证据与事件种类集合，不含正文。监听者抛出、`sessionNotifier` 缺席或失败时，提交的回执不变。
6. 外来的提交通知唤醒实例。同一租户只绑定一个扫描者。`maintain` 失败后，该租户的下一条通知再次绑定。
7. 配置错误时 fiber 进入 `FAILED`。同一 isolate 标签下重复装载失败。
8. 撤除顺序：撤除开始后面返回 `unavailable`；维护句柄全部释放；`close` 完成或超时；超时时在途命令仍以回执或 `commit-unknown` 结束；撤除期间没有出站调用发出，也没有通知派发。
9. 事务端口或内部主体换代时插件体重跑，新实例接管扫描，调用方插件取得新服务。新旧实例并存时，同一命令按操作身份认回，不产生第二次效果。

服务定义成员要求提供者验证的项目（[验证义务](../session-cordis-contract/docs/cordis.md#验证义务)）包含在第 1、2、4、5 项里。机制本身的义务归 [session SPEC 的验证](../session/SPEC.md#验证)。本成员不覆盖：跨进程的每租户单扫描者、持久化与真实邻域的端到端组合。

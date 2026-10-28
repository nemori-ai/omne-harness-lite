# tool-host-local 行为规格

本页维护单机宿主在公共契约之外真实承担的行为：配置、资源所有权、失败、生命周期、并发、持久性、取消与恢复。公共结果、不变量和协议归契约包 `@omne-harness/tool-contract` 的 [SPEC](../tool-contract/SPEC.md)。本页不另写公共保证，也不能用提供者限制改写公共承诺。

下列决定已接受，由本包承担。它们在契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)中有完整记录：

- G4：宿主时钟适配器，同进程单调时钟加进程 epoch，跨进程比较返回 unknown。尚未实现。
- G5：第一版采用同机的启动协调器和耐久受理台账，实现 [P04](../tool-contract/SPEC.md#p04-实际发起围栏) 要求的启动排序域。本地启动协调器已实现，见下文；现有测试使用非耐久记录仓。耐久记录仓提供者尚未交付，耐久受理台账仍依赖该提供者。
- G7：`ToolBindingRegistry` 与换代协调者 `toolGenerations` 由本包实现。尚未实现，见[绑定登记表与换代协调者](#绑定登记表与换代协调者g7)。
- G9：本包命名为 `packages/tool/tool-host-local`。

## 本地启动协调器（G5）

`createLocalStartCoordinator({ store, access, guardsOf, commitAttempts })` 返回 `ToolStartAuthority`。`commitAttempts` 不是正安全整数时抛 `TypeError`。

### 1 排序域

协调器的全部记录放在记录仓的 `host` 域，每个租户一个域，键是 `start-coordinator`。每个操作读这个域、做决定、按域修订号条件提交，同一进程内同一租户的操作还经过该租户的串行区。所以同一租户的许可、受理、拒绝、排除与失效有一个共同的先后，它就是提交的先后。排序只在一个租户的域内需要成立，不同租户的操作不互相排队。修订冲突时重读重判，最多 `commitAttempts` 次，用尽后回复 `unavailable`。

实施状态：租户串行区是本包必须兑现的承诺。仅有进程级串行区的提供者不满足该隔离要求。成员测试与实际 prepare 路径的验证完成前，不能从本条声明推定已实现。

本排序域只在一个进程内验证过。两个进程共用记录仓的装配没有验证，所以本协调器不声明跨进程的启动保证（P04）。

### 2 许可与守卫

`prepare` 核对资格、启动记录与固定请求，然后对 `guardsOf(request)` 的每个资源读取当前守卫修订号，从未失效的守卫是 `0`。它把许可提交为该启动的当前许可，再回复许可。新许可替换同一启动的旧许可。许可本身不授权执行。

`invalidate` 把一个守卫的修订号加一，与失效操作记录一起提交之后才回复失效证据。每个租户内，操作号绑定完整守卫输入的规范摘要与首次证据。摘要涵盖 owner、resource、revision、完整 evidence 与 scope 变体的全部契约字段，不受属性顺序或额外属性影响。同操作号、同输入重送时回复首次证据，守卫不再前进；同操作号、异输入回复 `conflict`，`operation` 为本次操作号，不写记录。后续失效或使用同一记录仓重建协调器不改变原操作的绑定。提交结果未知回复 `commit-unknown`，不可用回复 `unavailable`，两者都不给证据。

### 3 consume

`consume` 只能由受信执行边界调用，它在胶囊暂存之后以许可与执行者回执调用。决定顺序：

1. 该启动已有受理时回复原 `started`，已有启动拒绝或整次调用的排除时回复原 `rejected`。
2. 许可不是该启动的当前许可（摘要不同，或已被 `inspect` 收回）：有排除标记时回复 `not-started` 与该标记，否则回复 `invalid`（`permit: not-issued`）。
3. 许可里任一守卫的修订号已不是当前修订号：提交永久的启动拒绝，回复 `rejected`。失效先成立，所以不发起。
4. 否则提交唯一的受理并收回许可，回复 `started`。受理先成立，所以之后的失效只影响后来的启动。

受理提交结果未知回复 `unknown`，之后重送同一许可会认回受理。

### 4 inspect

`inspect` 回复已有的受理或拒绝。都没有时，它先提交排除标记并收回当前许可，再回复 `not-started`。所以在这个回答之前签发的许可，在回答之后不能被受理。之后签发的新许可可以受理，这就是同一启动身份在排除证明之后的首次执行。已有标记且没有未收回的许可时，直接回复该标记，不再提交。

### 5 exclude

`exclude` 排除一个调用尚未受理的全部启动，将整次调用的拒绝与本次排除操作记录共同提交，再回复拒绝证据。每个租户内，以调用与操作号定位排除操作记录，绑定本次 reason 与返回 evidence。同操作号、同理由重送回复原证据；同操作号、异理由回复 `conflict`，`operation` 为本次操作号，不写记录。

已排除的调用收到另一操作号时，协调器提交该操作号与本次理由的绑定后，仍回复首次排除的证据，不改变调用的拒绝理由或终态。使用同一记录仓重建协调器后，所有已提交的排除操作仍按原绑定认回或冲突。首次排除与别名绑定的提交结果未知均回复 `commit-unknown`，不可用均回复 `unavailable`，两者都不给证据。该调用已有受理时回复 `conflict`，`operation` 是被受理的启动：在途执行只能由控制停止。

### 6 身份、租户与失败

每个操作先检查边界输入。缺租户、租户形状不对或缺主体回复 `denied`，然后才问 `access.qualify`：调用范围的操作用动作 `start`，`invalidate` 用动作 `invalidate`。资格拒绝回复 `denied`，不可读回复 `unavailable`（`dependency` 为 `access-guard`），这些都不读记录仓。守卫属于租户内的资源，所以一个租户的失效不影响另一个租户的同名守卫。启动的键同时含调用与启动操作号，因为启动操作号只在一个调用内唯一（P01）。

台账不可读回复 `unavailable`（`dependency` 为 `start-ledger`），不回复受理或拒绝，也不读缓存（P04：准入资料不可读时拒绝新的 consume）。台账里出现本协调器没有写过的记录时同样回复 `unavailable`。

## 环境准备的租户调度

调度位于实际 ToolEnvironment.prepare 的宿主协调入口。它消费注入的可替换策略，纯选择逻辑与实际环境获取分开。策略提供正且有限的 quantum 与租户权重、非负整数的队列容量与租户在途上限，以及取消和重试时机。无合法策略值时拒绝配置，不猜生产默认值。策略来源是宿主受信装配配置，provider 继续拥有当前租户与全局配额准入权威。

调度采用 DRR，一次新的 acquire 提交成本为 1，查询、原键认回和结清不计新提交。一个租户等待慢存储、慢 provider 或已占满时，其他租户仍可被尝试。只有全局容量满时才共同等待。每个租户内部的启动资格、许可消费和失效仍按同一事务串行域排序，调度次序不能越过本租户围栏或 FIFO。

prepare 在发出外部获取前保存原准备与原获取引用。取消、pending、unknown 和重试策略沿原记录决定等待、查询、结清，或在查询确认已分配后进入原获取的首次采用/认回。inspect 只刷新事实，不签发租约。后续同键 acquire 必须保持 acquisition、tenant、origin、scope、placement、provider 及全部获取输入不变，并且原登记、guard、ledger 有效且当前准入成立。首次采用不再次调用 provider 获取，也不重新计划、许可或接续。采用失败、已失效或已结清的原记录不复活。策略不能批准更换原键重新获取。确定的零分配配额拒绝是原键终局，合法重新排队必须由调用者明确提供新操作，不能由策略偷偷重发。查询不可用时保留原名额和任务。旧调用已经在途或持有资源时，取消与配额下降不自动返额、回滚效果或清除清理责任。

调度器消费 ToolEnvironment 的 allocated 事实时，先核其原准备绑定。inspectPreparation 只转达事实，不因策略为 recognize 就执行采用。对调用方已经请求的原 prepare，重试策略允许 recognize 且原条目仍有效时，调度器才可在查询后沿完全相同输入再次 prepare；它不新增获取成本或操作身份。wait 或 inspect 只保留或刷新原事实。allocated、pending、unknown 及尚有清理责任的 rejected 都不返额。已确认释放的条目不因迟到分配事实、重试答复或重新获权而恢复排队；每次等待后及转发前仍核原采用和条目未退休。冷恢复的原描述 allocated 不能映射成这条首次采用路径。


宿主把调用原适配器 prepare 前的本地预占与已经发出的原请求分开保存。首次派发的当前资格或原采用核验失败，且原 prepare 尚未被调用时，只撤回这次本地预占；不调用适配器释放、不报告资源 released，也不生成零分配证据。资格抛错时亦先撤本地预占，再进入下述资源诊断边界。返还本地预占不等待诊断接收完成。原身份与固定输入的绑定仍保留。

调用者以后显式请求同一原 prepare 时，仍核完整绑定和当前资格，才能重新尝试首次发送；inspect 不代发。原 prepare 一经调用，即使抛错、丢答或结果未知，也不能沿“未发送”路径返额，继续保留原查询与清理责任。已有可靠 excluded 允许同键重新排队时，新一轮预占重新记录是否已发送；该轮派发前失败也先返还本地预占。unknown、allocated 与仍需清理的 rejected 不适用。已确认释放的退休项不因该区分恢复资格。


公平性以前提为界：有限参与者、正权重、持续调度、有界 provider 答复与反复有容量。它不保证执行完成或强制回收长期 lease。验证必须通过实际 prepare 路径证明替换策略被消费，并观察 A 租户慢或满时 B 能推进。孤立策略对象的单测不能证明宿主隔离。真实耐久与跨进程提供者另验。

### 环境资源诊断边界

本地环境调度器消费一个受信诊断接收者。它只在执行环境跨拥有者资源操作边界适用 DP-01 的例外。资源操作原错误、封闭操作阶段及原 tenant/call/operation 关联交该接收者。原错误只在受信处理边界内使用；写入任何日志或持久记录前必须去除秘密值、原能力和解析器，访问控制不能免除此要求。保留脱敏后的原错误事实、阶段及原操作关联，查询与导出继续受当前披露权限约束。本调度器不声明诊断已耐久保存。

诊断接收者的 record 成功返回 recorded 或 unavailable。异常也视为 unavailable，但不把接收异常或原资源异常重新抛给普通调用者。接收者自身必须在受信侧处置其失败；本边界仅能通过下表的诊断缺口对外报告不可用，不递归调用同一故障接收者。记录不是释放、补偿、采用或业务提交。

公开错误映射如下，均沿现有 Reply/PreparationProgress/ReleaseProgress 形状，不增加通用结果框架。

| 触发 | 返回 | 对资源与诊断的含义 |
| --- | --- | --- |
| 资格正常返回失败 | 保留原闭合失败 | 不调用 prepare；若为派发前预占，立即撤预占。没有捕获异常就不伪造诊断事件 |
| 原采用核验不成立 | 既有 unavailable，dependency 为 tool-environment-scheduler | 不调用 prepare；若为派发前预占，立即撤预占 |
| 环境资格检查抛出异常 | failure.kind=unavailable，dependency=tool-environment-scheduler | 原请求未发送时不占额；已发出原请求的责任不因资格未知而消失 |
| 原 prepare 或原键认回抛异常 | ok.kind=unknown | 保留原获取与清理责任，不能据此返额或另开获取 |
| 原 inspectPreparation 抛异常 | ok.kind=unknown | 不签发租约，不改变原责任 |
| 原 release 或 inspectRelease 抛异常 | ok.kind=unknown | 不报告 released，保留清理责任及名额 |
| 策略 retry/release 在资源操作协调中抛异常 | ok.kind=unknown | 不调用后续效果、不替换原操作；已在途的责任和名额保持 |

捕获异常的上述返回都使用已有 diagnostic 字符串给出固定安全标记。recorded 时为 `environment operation failed; stage=<stage>; diagnostic=recorded`；接收者返回 unavailable 或抛错时为 `environment operation failed; stage=<stage>; diagnostic=unavailable`。stage 必须来自封闭的 `qualify | prepare | retry | inspect-preparation | release-policy | release | inspect-release`，不来自错误消息或调用者文本。diagnostic=recorded 只表示接收，不代表持久化或资源成功。所有原错误消息、堆栈和对象属性均不进入此字符串。

工厂要求装配者显式提供诊断接收者，不能默认 no-op 并声称已记录。该依赖只适用于环境工厂，不改凭据公开面。资源适配器正常给出的闭合失败按现有契约处理，不把其未捕获的业务失败当成新异常事件。

四个环境资源动词读取当前原环境的 `adoption` 抛错时，按 `qualify` 阶段处理，并关联该次公开操作。`release` 与 `inspectRelease` 的内部准备核验也关联原 `release.operation`。正常读取后采用值不匹配仍返回原不可用结果，不产生异常诊断事件。同步 `adoption` 属性本身没有操作上下文，不伪造诊断关联。

## 凭据适配的边界

本包按[Tool 凭据端口](../tool-contract/SPEC.md#第三方凭据端口)接入 settings 秘密保管。适配器核实际秘密绑定，执行使用时重核租户、工具采用、用途与目标。秘密保管端口 `ToolCredentialSecrets.resolve` 每次交出绑定、能力与撤销句柄；适配器在解析时只用能力证明绑定并立即撤销，在 `use` 里把本次能力交给动作，动作结束后一律撤销，再返回或原样重抛。动作成功而撤销失败抛撤销错误，两者都失败抛 `AggregateError([动作错误, 撤销错误])`。撤销句柄缺失按 `unavailable` 处理，能力不交出。撤销后能力不再动作、错误文本不含秘密值，是秘密保管提供者的义务。当前没有真实 vault 的交付证据，接口与替身不得声明真实保管已完成。

文档导航见 [index](index.md)。

## 绑定登记表与换代协调者（G7）

本节规则由 [RFC-0012](../../../docs/rfcs/RFC-0012-tool-dynamics.md) 于 2026-10-21 采用，两者都尚未实现。公共的登记键、同键规则与保留义务归契约的 [G7](../tool-contract/SPEC.md#342-契约缺口决定)，协调者的动词与返回归 [Tool 的 Cordis 定义](../tool-cordis-contract/docs/cordis.md#换代协调者契约)。本节只写本包承担的部分。

- 本包的绑定登记表在单机、单进程内成立，登记不耐久。跨进程、远端目录与耐久存储不在本包覆盖之内。
- 两个 fiber 同时首次登记同一个键时，本地排序域决定哪一方成功，另一方得到 `conflict`。
- 换代协调者 `toolGenerations` 是本包 `./cordis` 的 Service。它是 `ctx.plugin` 句柄的唯一持有者，由 `ensureLoaded` 动态 import 实现包。
- 进程恢复后，`sweep` 重装持有者采用依据记下的键。包字节保留，同一 digest 可以重新 import。
- 按键排空与交接依赖契约 [P09](../tool-contract/SPEC.md#p09-账目恢复与退出) 的 `inspectDrain({ executor })` 范围。该范围交付之前，有在途调用时 `unload` 停在 `draining`。

## 实例宿主与普通调用的边界

本包尚未提供生产 ToolInstanceHost、来源签发器或 ToolInstanceIdentities。宿主实现须在创建实例时取得身份，向 driver.run 显式传入，同一存活实例重复唤醒沿用。runtime 工厂不再接受全局 instance。当前测试将普通 payload 经 invoke、配对来源 issuer/guard、真实 ledger 和本地启动协调器组合，driver 的 instance 由测试 host 提供。这只证明单进程非耐久组合，不证明 claim、换实例接管或恢复。

# @omne-harness/execution-environment 行为规格

状态：机制实现成员，`draft`。本成员实现执行环境的登记表：提供者表、设施声明表、获取表、租约视图、访问核验、落点解析、获取、采用核验、采用记录签发、原获取的查询、恢复编排与关闭。公开行为归 [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md)。本页只写本成员源码真实承担的本地行为，不重复契约条款。源码与契约不一致的地方列在[明确缺项](#明确缺项)。

## 范围与依据

本成员与 Cordis 无关（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。根入口导出工厂 `createEnvironmentRegistry` 与错误类 `RetirementPending`。工厂的输入是 `RegistryDependencies`：恢复授权端口 `recovery`、环境授权端口 `authority`、作用域绑定来源 `bindings`，可选的采用失败清理等待上界 `cleanupWaitMs`（缺省 1000 毫秒，是配置初值；负数或非有限数时工厂抛出 `RangeError`）与可选的诊断出口 `diagnose`。工厂的输出是 `EnvironmentRegistry<P>`：它实现契约的 `ExecutionEnvironment<P>` 与 `ProviderRegistrations`，另有 `close()`。Cordis 绑定、服务撤除与宿主提供者归 [execution-environment-host-local](../execution-environment-host-local/SPEC.md)。

资源账本与设施守卫不是工厂的依赖。集成方在每次 `acquire` 的输入里给出账本与守卫。本成员把账本原样交给提供者，把守卫装进租约视图。本成员自己不调用账本。

本成员不持有任何耐久状态。获取的状态归集成方的耐久账本，采用记录由集成方随准备记录保存。本成员的全部表都是进程内副本。进程重启后表为空，本成员不重建租约（[IC-19](../../../docs/architecture/cordis-integration-conventions.md#ic-19)、[契约的获取与租约](../execution-environment-contract/SPEC.md#获取与租约)）。

包外依赖：`@omne-harness/execution-environment-contract`（全部类型与 `matchProviders`、`bindingScope` 两个纯函数），`@omne-harness/legal-identity`（`tenantEquals`、`tenantCodec`），`@omne-harness/runtime-context-contract`（`ScopeRef`、`ScopeBindingSource`、`AuthorityDecision` 类型）。

## 结果与不变量

### 表与视图

| 表 | 键 | 内容 | 谁改 |
| --- | --- | --- | --- |
| 提供者表 | 登记顺序；名称加代唯一 | 提供者、身份（名称、代与版本）、是否在场、进行中的退役 | `registerProvider` 加入；退役标为不在场，已排空时移除 |
| 设施声明表 | 设施键 | 操作名单与须授权的操作名单 | `registerFacility` 加入；撤除函数移除 |
| 获取表 | 获取方租户加获取键 `AcquisitionRef`；同一个键下每个租户各一条记录 | 原获取描述（租户、获取键、原调用、请求方作用域、落点）及其指纹、首次调用给的账本与守卫、所选提供者、`AcquisitionState` 与版本号、尚未采用的临时回执、租约视图 | `acquire` 写入；采用、查询、结清与租约视图的回调改状态，每次改状态版本号加一 |
| 已释放作用域 | 作用域引用 | 已由 `releaseScope` 释放的作用域。只在进程内，耐久保存归集成方账本，见[耐久映射](#耐久映射) | `releaseScope` 加入 |

租约视图包住提供者交回的租约原件，每次获取一个。对象与生灭见[对象模型](docs/object-model.md)。

### 落点解析

各拒绝原因的含义与触发条件归[契约的拒绝原因](../execution-environment-contract/SPEC.md#拒绝原因)。本节与下一节只写本成员的核对顺序。

- 访问身份里的租户不是 legal-identity 铸造的值时（`tenantEquals(租户, 租户)` 为假），`resolvePlacement` 先于其他核对返回 `invalidInput`。`acquire` 与 `describe` 同样如此，`inspectAcquisition` 答复 `invalidInput`（它是无效查询答复，不是记录状态）。这项核对不写获取表，也不调用提供者。
- 然后做[访问核验](#访问核验)，动作为 `resolve`，目标作用域是输入里的请求方作用域。
- `resolvePlacement` 在本成员关闭后返回 `ownerStopped`。
- 未关闭时，输入里的请求方作用域已由 `releaseScope` 释放，返回 `referenceExpired`，不做匹配。
- 否则本成员把在场的提供者交给契约的 `matchProviders`。交给它的每个提供者的设施键先与设施声明表取交集：提供者声明了、但声明表里没有的键，不算它提供的键。`matchProviders` 按允许清单的顺序逐层查找。在一层里，声明了该层、提供全部设施键、能确认全部隔离断言的提供者恰好一个时，选中它。同一层里这样的提供者有两个或更多时，以 `ambiguousEnvironment` 拒绝，不按登记顺序取先登记者，也不再看清单里后面的层。没有匹配时返回最接近的原因：`missingFacility`、`isolationUnconfirmed` 或 `noMatchingEnvironment`。
- 选中的层是另一租户的租户级沙箱时，返回 `notAuthorized`。选中的层带作用域（会话级沙箱或无状态沙箱），但这个作用域不等于请求方作用域时，返回 `invalidInput`。
- 落点带要求、绑定层、提供者身份、该提供者的连续性与配额域。落点不授设施，也不授资源。

### 访问核验

普通操作的核验顺序归[契约的访问核验](../execution-environment-contract/SPEC.md#访问核验)。本成员按下列方式实现：

1. 用这次操作的动作调用环境授权端口。答 `refused` 为拒绝，答 `unavailable` 为不可用；抛出、答复不在闭合集合里、或 `authorized` 不带同步的 `current()` 时为未知，原因 `authority`。
2. 动作有目标作用域时，向作用域绑定来源查这个作用域。绑定到访问租户才通过；绑定到另一租户与未绑定同样为拒绝，答复不区分两者，所以不泄露另一租户；答 `unavailable` 为不可用；抛出或答复不在闭合集合里为未知，原因 `scope-binding`。前一步不通过时不做后一步。
3. 通过时得到 `current()`。本成员在写入获取的最后一步之前和采用之前各核一次；`current()` 抛出按假处理。

各操作把核验结果映射为自己的答复：落点解析与描述把拒绝映射为 `notAuthorized`、不可用映射为 `unavailable`、未知映射为 `LookupUnknown`；获取把未知映射为阶段 `preflight` 的 `UnknownAcquisition`；查询映射为 `refused`、`queryUnavailable` 或 `queryUnknown`，并带原因。按键查询没有目标作用域，只问授权端口。

### 获取

本成员按下列顺序处理一次 `acquire`。第一次等待之前，本成员复制输入的数据字段（租户、获取键、原调用、请求方作用域、落点）作为原获取描述，账本与守卫保留原对象身份。

1. 访问身份里的租户未铸造时返回 `invalidInput`。落点的绑定层带作用域、但不等于请求方作用域时返回 `invalidInput`。这两项都不查也不写获取表。
2. [访问核验](#访问核验)，动作为 `acquire`，带原获取描述，目标作用域是请求方作用域。不通过时不读获取表。
3. 获取表里已有同一租户在这个键下的记录时，本成员比较原获取描述的指纹，并比较账本与守卫的对象身份。指纹覆盖请求方作用域、原调用、绑定层、提供者身份（名称、代与版本）、配额域、连续性与要求；设施键与隔离断言按集合比较，顺序与重复不计。任一项不同时返回 `acquisitionConflict`，不调用提供者，不改变记录。都相同时按[同键重复](#同键重复)读原记录。另一租户在同一个键下有没有记录，不影响这一步：对本租户来说，没有本租户记录的键就是新键。
4. 本成员已关闭时返回 `ownerStopped`。落点是另一租户的租户级沙箱时返回 `notAuthorized`。这两项都不写获取表。
5. 其余情况先在这个键下为本租户写入一条记录，状态为获取中，再重新核对落点。下列任一项不成立即拒绝，原因写入获取表，不换落点：
   - 落点里的提供者身份（名称、代与版本）仍在场，且它的配额域等于落点的配额域，否则 `providerUnavailable`。
   - 请求方作用域没有被释放，否则 `referenceExpired`。
   - 绑定层仍在允许清单内，且该提供者声明了这一层，否则 `noMatchingEnvironment`。
   - 隔离断言都由该提供者确认，否则 `isolationUnconfirmed`。
   - 要求里的设施键都已登记声明，并都由该提供者提供，否则 `unsupportedFacility`。
6. 配额预查：本成员调用提供者的 `quota(租户)`。答 `unavailable` 时返回 `unavailable`；抛出或答复不是 `declared` 时返回阶段 `preflight` 的 `UnknownAcquisition`；然后再核 `current()`，为假时返回 `notAuthorized`。这三种情况都删除第 5 步写入的记录，所以暂时的预查失败不占用这个键。本成员不判断声明的上界值，也不自己计数；`quotaExceeded` 与 `globalCapacityExceeded` 只来自提供者在 `acquire` 里的原子接纳。
7. 本成员调用提供者的 `acquire`，交给它获取键、原调用、请求方作用域、落点、租户与账本。提供者拒绝时沿用它的原因，状态为已拒绝。提供者抛出、答未知、或答复不在闭合集合里时，状态为分配未知（`allocationUnknown`），返回阶段 `allocation` 的 `UnknownAcquisition`，并给出诊断 `providerThrew`；答复的获取键不是这个键时另给诊断 `receiptForOtherKey`。本成员不为提供者计时：进展上界归提供者（[契约 INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)）。
8. 提供者交回临时回执后，状态为临时，本成员保留回执并进入[采用](#采用与采用失败)。

同一个键的并发请求不会两次调用提供者。第二个请求在第一个请求结束前到达时，得到待定，状态为获取中。

#### 采用与采用失败

一份临时回执只有一次采用转换，并发的调用方共用它，所以只签发一个租约视图。下列任一项成立即采用失败：本成员已关闭（`ownerStopped`），提供者已不在场（`providerUnavailable`），请求方作用域已释放（`referenceExpired`），回执里的绑定层与落点不同（`unavailable`），回执的租约缺少要求里的设施（`unsupportedFacility`），`current()` 为假（`notAuthorized`）。访问身份由获取记录绑定，不在回执里核验。

采用失败时，本成员在记录失败的同一同步步骤里封住采用：状态为 `allocationFailed`，带原因与清理状态 `pending`，然后经原回执的租约释放清理。第一个调用方最多等 `cleanupWaitMs`：释放成功时清理为 `settled`，释放待处置为 `pending`，抛出为 `unknown`，超过上界为 `unknown`。超界之后的迟到答复仍更新清理状态。原因不再改变。清理没有确认为 `settled` 时给出诊断 `cleanupUnconfirmed`。

关闭、提供者退役与作用域释放发生时，还在临时状态、没有在采用的记录同样转为采用失败，原因分别为 `ownerStopped`、`providerUnavailable` 与 `referenceExpired`。

采用通过时，本成员签发采用记录：获取键、原调用、落点、提供者身份、实例身份与代、连续性与提供者证据。提供者不能自签。然后本成员建立租约视图，状态为已获取。

#### 同键重复

同一租户、同一指纹、同样账本与守卫的重复不再调用提供者：

| 原记录状态 | 答复 |
| --- | --- |
| 已获取 | 同一租约与同一采用记录 |
| 已拒绝 | 同一原因 |
| 采用失败 | `allocationFailed`，带原因与当前清理状态 |
| 分配未知 | 阶段 `allocation` 的 `UnknownAcquisition` |
| 临时且保留着回执 | 进入同一次采用转换 |
| 其余状态 | 待定，带当前状态 |

#### 查询

`inspectAcquisition` 按 `AcquisitionQuery` 的两种形式作答。访问身份里的租户未铸造时答复 `invalidInput`。

- 按键查询（`local`）：[访问核验](#访问核验)的动作为 `inspect`，没有目标作用域。然后只读本租户在这个键下的记录。没有本租户的记录时答复 `unrecorded`，不论另一租户有没有用过这个键。记录处于分配未知、获取中、临时但没有回执、或采用失败且清理未结清时，本成员经原配额域的路由查询原记录，按[契约的原获取的查询与结清](../execution-environment-contract/SPEC.md#原获取的查询与结清)的缓存表更新本地副本；查询期间记录的版本号变了，就丢弃这个答复，答复当前状态。答 `acquired` 时只保留回执、状态为临时，下一次同键获取才采用；答 `notAllocated` 时状态为已拒绝，原因 `allocationNotPerformed`；本地已有采用记录或采用失败，而原记录答 `notAllocated` 时，答复 `queryUnknown` 并给出诊断 `contradictoryOriginal`；答 `conflict` 时答复冲突并给出诊断 `originalConflict`。没有该配额域的路由时答复 `queryUnavailable`。
- 按原获取描述查询（`original`）：访问核验的动作为 `inspect-original`，目标作用域是描述里的请求方作用域。核验通过后，描述里的租户必须等于访问租户，否则答复 `refused`（`notAuthorized`），不调用提供者。然后本成员经原配额域的路由问原记录，答复提供者的事实，并附本地相同指纹记录的采用记录或采用失败。这个答复从不采用，也不交出租约。

路由按配额域选择：优先原提供者代，原代已不在表里时用同一配额域的另一份登记；从不问另一配额域，也不问另一配额域里同名的提供者。原记录的查询抛出或答复不在闭合集合里时按未知处理。

`inspectRecoveryAcquisition(恢复访问, 原获取描述)` 先用描述里的请求方作用域问恢复授权端口。答不允许为 `refused`，答不可用为 `queryUnavailable`，抛出或答复不在闭合集合里为 `queryUnknown`，原因都是 `authority`。授权通过后与按原获取描述查询的后半段相同。

两个租户用同一个键时，各自是一次独立的获取，互相看不见，也互不改变状态。所以按键查询与按键获取都不泄露另一租户是否有这个键。

进程重启后表为空。按键查询对旧键答复 `unrecorded`；对旧键再调用 `acquire` 会作为新获取交给提供者，由提供者的原记录决定它是同一次获取、冲突还是新获取。按原获取描述查询仍可以问原配额域的原记录。

### 租约视图与逐操作门

租约视图只暴露要求里的设施键。一个键要同时满足三项才能取到设施：在要求里，设施声明表里有它，提供者的租约原件有它。否则 `facility(键)` 返回 `undefined`。

设施声明里列出的每个操作在调用提供者设施之前先过门。门的核对项与顺序以[契约的获取与租约](../execution-environment-contract/SPEC.md#获取与租约)为准，本成员不另写一份。第一项不成立即返回拒绝，不调用提供者设施。本成员在各项上的实现如下：

- 请求形状：请求有非空的请求身份、非空的原调用、带租户的访问身份与带种类的绑定层。
- 租约仍接纳新操作：租约失效或释放已发起后不再接纳。
- 账本没有关闭：账本取自这次获取的 `AcquireInput`，核对它的 `ledger.closed` 没有触发。
- 设施声明：门每次调用都按键从声明表重新取声明，所以撤除声明之前已经取到的设施对象也在这一项被拒绝。
- 租户：用 `tenantEquals` 比较请求里的租户与获取方的租户。
- 绑定层：请求里的绑定层与租约落点的绑定层比较；请求里的原调用必须等于获取时固定的原调用，否则在守卫之前返回 `invalidInput`。
- 设施守卫：守卫答不允许时返回 `notAuthorized`，答不可用或抛出时返回 `unavailable`。守卫答允许之后再核一次租约与账本。

门不解释主体。主体原样交给守卫。设施声明里没有列出的成员不经过门，所以设施拥有者的声明必须列全操作（[契约的设施协议](../execution-environment-contract/SPEC.md#设施协议)）。

### 失效与释放

- 失效原因是契约的 `LeaseInvalidation`。本成员给出的原因来源为 `registry`：提供者退役（`providerRetired`）、作用域释放（`scopeReleased`）、本成员关闭（`registryClosed`）、释放成功（`released`）；原件的失效通知以拒绝结束时为 `providerInvalidated`。原件报告的原因一律记为来源 `provider`，原因文本原样保留，原件自称的来源不采用。失效只发生一次，状态从已获取变为已失效。
- 释放只作用于这一次获取。`release()` 一开始就关闭租约的入口：之后不论释放结果是已释放、待处置还是仍在进行，新的设施操作都在门的「租约仍接纳新操作」一项返回 `closed`。释放中状态为释放中。原件释放成功时状态为已释放，租约随之失效。原件释放待处置或抛出时，状态为待处置释放，带未停的受管资源。
- 同一释放可以重试。待处置之后再调用 `release()` 会再次调用原件的释放。已释放之后再调用 `release()` 直接返回已释放，不再调用原件。同一时刻的并发释放共用一次调用。
- 丢掉租约引用不是释放。获取表保留该记录。

### 描述

`describe(访问身份, 作用域)` 在访问身份里的租户未铸造时返回 `invalidInput`，这项核对先于关闭。它在本成员关闭后返回 `ownerStopped`。然后做[访问核验](#访问核验)，动作为 `describe`，目标作用域是输入的作用域。通过后，它列出获取表里同一租户、请求方作用域是该作用域、有采用记录且尚未释放的获取，宿主机与租户级沙箱上的获取也在内。每项带获取键、原调用、绑定层、提供者身份、实例身份与代、连续性、设施键与当前状态名。

### 登记与退役

- `registerFacility` 对已登记的键抛出错误，原声明不变。撤除函数只删除它自己登记的那一份声明：本成员登记时存一份声明的副本，所以同一个描述符对象撤除后再登记，旧的撤除函数不删除新登记。
- `registerProvider` 在本成员关闭后抛出错误。同名同代的提供者已在提供者表里时也抛出错误。提供者身份带提供者声明的版本；本成员不核对版本，也不记住已移除的代，所以「每次登记取一个新的代」由提供者兑现。
- 撤除提供者即开始退役。本成员先把提供者标为不在场，再使它交出的全部租约以 `providerRetired` 失效，然后调用它的 `retire()`。`retire()` 抛出时按待处置处理，未停资源列表为空。本成员不为 `retire()` 设计时器：它在提供者自己配置的上界内返回，超界答待处置。
- 已排空时，本成员从提供者表移除这个提供者。待处置时，提供者留在表里但不在场，撤除函数抛出 `RetirementPending`，带未停的受管资源。再调用同一撤除函数会再次调用 `retire()`。同一时刻的并发退役共用一次调用。

### 恢复

- 本节的「该作用域」都按获取记录里的请求方作用域判断，不按绑定层的归属；宿主机与租户级沙箱上的获取也在内。
- `recoverOwned` 与 `releaseScope` 可以带维护者带回的已知原获取描述列表。列表里任一项不合形（租户未铸造、获取键为空、没有配额域）或请求方作用域不是该作用域时，返回 `invalidInput`，不问恢复授权。
- 然后核恢复授权。本成员收集获取表里该作用域内处于待处置释放的全部受管资源，连同恢复授权与作用域一起，调用一次恢复授权端口。端口答不允许或不可用时，本成员以该答案拒绝，不做任何恢复。端口抛出或答复不在闭合集合里时返回 `LookupUnknown`，原因 `authority`。
- `releaseScope` 在授权通过后把作用域记为已释放，使该作用域内的全部租约以 `scopeReleased` 失效，仍在临时状态的记录转为采用失败，然后做与 `recoverOwned` 相同的恢复。之后以这个作用域为请求方作用域的落点解析与获取都返回 `referenceExpired`，不论落在哪一层。
- 资源路径：按登记顺序逐个提供者进行，包括退役待处置的提供者。没有 `listRecoveryResources` 或 `recover` 的提供者记为不支持。枚举失败或抛出的提供者记为不可用，不当空集。每个资源的停止结果是已确认停止、待处置或不支持。`recover` 抛出的资源记为待处置。
- 获取路径：每个配额域只列一次该作用域的原获取，因为同一配额域的任一份登记都能看到该域的全部获取；列出失败或答复不合形时，该登记记为不可用，不当空集。已知列表里没有被列出的项也加入。每一项经[查询](#查询)里的路由调用一次 `settleAcquisition`，抛出或答复不合形按未知处理。答 `settled` 或 `notAllocated` 进入已结清获取，答 `pending` 进入待处置获取并带资源，答 `conflict` 或 `unknown` 进入待处置获取、原因 `unknown`，答 `unsupported` 进入不支持的获取，答 `unavailable` 或没有路由时记为不可用。结清后本成员更新相同指纹的本地记录：有采用记录的转为已释放，采用失败的只更新清理状态，其余转为已结清或已拒绝。本成员不自己归还名额。
- 前面已处理的部分不因后面的失败而丢失。同一个提供者身份在不可用列表里只出现一次。
- 本成员关闭之后，恢复两操作仍可调用。
- 恢复授权只用于这两个操作与 `inspectRecoveryAcquisition`，本成员不把它用于获取或设施操作。

### 关闭

`close()` 依次做三件事：

1. 记为已关闭。之后新的落点解析、获取与描述返回 `ownerStopped`，新的提供者登记抛出错误。已在获取表里的键仍按同键规则返回当前状态。
2. 使全部租约以 `registryClosed` 失效，仍在临时状态、没有在采用的记录转为采用失败。之后这些租约上的设施操作在门的「租约仍接纳新操作」一项返回 `closed`。
3. 并发退役全部提供者，等全部退役结束。全部已排空时返回已排空，否则返回待处置并合并全部未停的受管资源。

本成员不另外等待在途的 `acquire`。在途获取在采用核验时看到本成员已关闭，按 `ownerStopped` 采用失败并经回执清理。在途的设施操作由原提供者在 `retire()` 中结清。关闭不清空获取表，`inspectAcquisition` 仍能答复关闭前的状态。重复调用 `close()` 返回同一个结果。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 失败时 | 结束 |
| --- | --- | --- | --- |
| 四张表 | 登记表实例 | 进程失败即丢失。重启后按键查询答复 `unrecorded`；按原获取描述查询仍问原配额域 | 进程结束；`close()` 不清空表 |
| 采用失败后的清理 | 原回执的租约原件；本成员只驱动和记录 | 清理待处置或未知时记录保留该状态并给出诊断 | 清理确认为 `settled` |
| 租约视图 | 所属获取 | 失效后设施操作返回 `closed` | 释放确认 |
| 采用记录 | 本成员签发，集成方保存 | 本成员不保存耐久副本 | 随集成方的准备记录 |
| 提供者登记 | 登记它的一方 | 退役待处置时撤除函数抛出 `RetirementPending` | 已排空 |
| 设施声明登记 | 登记它的一方 | 重复键抛出错误 | 撤除函数 |
| 受管资源 | 造出它的提供者；耐久部分在集成方账本 | 本成员只在待处置释放里转交资源列表 | 归[契约](../execution-environment-contract/SPEC.md#所有权失败与生命周期) |

进程失败后，本成员没有东西可恢复。集成方据自己的账本判断哪些获取需要处置，再由维护者凭恢复授权调用 `recoverOwned` 或 `releaseScope`。提供者的枚举给出该作用域现存的受管资源。本成员不重建租约，也不重放任何设施操作。

### 耐久映射

本成员的保证只在同一进程、同一登记表实例里成立（[IC-19](../../../docs/architecture/cordis-integration-conventions.md#ic-19)）。下表写明每项保证此刻靠什么兑现，以及进程重启后由谁重新兑现。

| 保证 | 此刻靠什么兑现 | 重启之后 |
| --- | --- | --- |
| 同一获取键不重新分配 | 获取表与提供者的原记录 | 集成方先查自己的账本；同键再调用 `acquire` 时由提供者的原记录认回或答冲突。原记录只在进程内的提供者（如宿主文件）在进程重启后答未知 |
| 已释放的作用域不再获取 | 已释放作用域集合 | 集成方的账本耐久保存已释放的作用域。重启后，集成方在该作用域的第一次获取之前重新调用 `releaseScope`，或者自己拒绝该作用域的新获取（[契约的恢复](../execution-environment-contract/SPEC.md#恢复)） |
| 待处置的受管资源可以找到 | 获取表里的待处置释放记录 | 集成方账本里的记录与提供者的恢复枚举 |
| 采用记录 | 本成员只签发，不保存 | 集成方随准备记录保存 |

## 组合与验证

| 承诺 | 位置 |
| --- | --- |
| 获取、租约、设施协议、恢复的公开行为 | [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md) |
| 撤除即退役、登记随调用方 fiber | [execution-environment-cordis-contract SPEC](../execution-environment-cordis-contract/SPEC.md) |
| 服务撤除时调用 `close()`、撤除失败的报告 | [execution-environment-host-local SPEC](../execution-environment-host-local/SPEC.md) |
| 账本的许可、终局与采用记录的耐久保存 | 集成方，不在本组 |

持续验证在 [tests/registry.spec.ts](tests/registry.spec.ts)：

| 场景 | 检查的结果 |
| --- | --- |
| 提供者缺少要求的设施 | 落点解析返回 `missingFacility`；它有的设施仍能落在宿主层，租约只暴露要求里的键 |
| 某层没有提供者；提供者撤除之后 | 返回 `noMatchingEnvironment`；撤除时调用一次 `retire()`，租约以 `providerRetired` 失效，旧落点再获取返回 `providerUnavailable` |
| `session_sandbox` 层的落点；同层两个提供者设施不同 | 落点与租约使用所选提供者的连续性 |
| 同一获取键重复与并发获取 | 只调用一次提供者；并发的第二个请求得到获取中；之后得到同一租约与同一采用记录 |
| 另一租户使用同一键 | 另一租户查询答复 `unrecorded`；它在第一个租户的作用域里获取为 `notAuthorized`；在自己的作用域里是一次独立获取，再调用一次提供者，得到另一个租约；第一个租户的状态不变 |
| 同一租户同一键换落点 | 返回 `acquisitionConflict`，不再调用提供者 |
| 同一层两个提供者都满足 | 落点解析返回 `ambiguousEnvironment` |
| 设施声明没有登记 | 获取返回 `unsupportedFacility`，不调用提供者 |
| 须授权的操作 | 守卫答不允许或不可用时不调用设施；另一租户的请求返回 `notAuthorized` |
| 作用域释放 | 恢复授权不允许时拒绝且仍能获取；允许后租约以 `scopeReleased` 失效，再获取返回 `referenceExpired` |
| 关闭 | 退役提供者，租约以 `registryClosed` 失效，新获取返回 `ownerStopped`，旧租约上的操作返回 `closed` |

[tests/acquisition.spec.ts](tests/acquisition.spec.ts) 覆盖获取的失败与采用核验路径：

| 场景 | 检查的结果 |
| --- | --- |
| 提供者的 `acquire` 抛出；回执的获取键是另一个键 | 状态为分配未知，答阶段 `allocation` 的未知；同键重复不再调用提供者；分别给出诊断 |
| 提供者拒绝 | 沿用提供者的原因，同键重复得到同一原因 |
| 采用记录 | 七项内容取自核验通过的回执；提供者身份带提供者声明的版本 |
| 采用失败：回执绑定层不同；回执缺设施；核验前访问被撤销 | 经回执清理一次；分别为 `unavailable`、`unsupportedFacility`、`notAuthorized`，清理 `settled` |
| 清理超过等待上界 | 第一次答清理 `unknown`；迟到的成功把清理改为 `settled`，原因不变；负数上界时工厂抛出 |
| 清理待处置或抛出 | 采用失败带清理 `pending` 或 `unknown`，同键重复得到同一答复 |
| 提供者工作期间登记表关闭、提供者被撤除（已排空或退役仍待处置）、作用域被释放 | 分别为 `ownerStopped`、`providerUnavailable`、`referenceExpired`，回执被清理 |
| 重核落点 | 绑定层不在允许清单、提供者不声明该层、隔离断言不被确认、提供者代或版本不同，分别拒绝，不调用提供者 |
| 同键重复的指纹 | 设施键与隔离断言按集合比较；提供者名、代、版本、设施集合、隔离集合、作用域、原调用不同都为 `acquisitionConflict` |
| 租户级沙箱 | 经 JSON 以租户文本往返的要求能落点与获取；重新解析的同一租户重放得到同一租约；另一租户的落点解析与获取为 `notAuthorized` 且不写记录 |
| 退役待处置的提供者 | 不再参与落点解析 |
| 访问身份里的租户未铸造 | 落点解析、获取与描述返回 `invalidInput`（描述在关闭后也是），获取不写记录、不调用提供者；按键查询答复 `invalidInput`，即使这个键有铸造租户的记录 |

[tests/original.spec.ts](tests/original.spec.ts) 覆盖原获取：按原获取描述查询另一租户的描述为 `notAuthorized`，即使作用域属于访问租户也不问提供者；丢失答复后同键的两个并发重复只采用一次，不再调用提供者；原记录确认未分配为终局 `allocationNotPerformed`；原记录答不可用、未知、冲突与释放中时按缓存表作答；原记录与已确认的采用失败矛盾时答 `queryUnknown`；按原获取描述查询答复提供者事实、附采用记录且不交租约，没有该配额域的路由时为 `queryUnavailable`；恢复查询依次答恢复授权的不允许、不可用与未知；已知列表的作用域不对时不问恢复授权；结清答复分入各获取组，列出失败记为不可用；每个配额域只列一次，结清后本地记录转为已释放。

[tests/lease-gate.spec.ts](tests/lease-gate.spec.ts) 覆盖租约视图：只暴露要求里的键；各种不合形的请求为 `invalidInput`；绑定层不等为 `invalidInput` 且不问守卫；重新解析的同一租户通过、另一租户 `notAuthorized`；开放操作不问守卫；守卫抛出为 `unavailable`；守卫作答期间租约失效为 `closed`；这次获取的账本关闭后为 `closed`，不问守卫、不调设施，另一份获取的账本不受影响，声明也撤除时仍为 `closed`；守卫作答期间账本关闭为 `closed`；撤除声明后已取到的设施对象为 `unsupported`，租约已释放时即使声明已撤除也为 `closed`；原件自报失效记为来源 `provider`，只记一次；原件失效通知以拒绝结束为 `providerInvalidated`；释放一发起就拒新操作，待处置后仍拒；待处置后重试、并发共用一次调用、已释放后不再调用原件；释放抛出为待处置且资源为空。

[tests/lifecycle.spec.ts](tests/lifecycle.spec.ts) 覆盖登记、退役、关闭、描述与资源路径的恢复：重复声明被拒且旧撤除函数不删新登记；同名同代提供者被拒、新代可登记；撤除只使自己的租约失效；退役待处置时撤除函数抛出 `RetirementPending`（带主体与资源），再调用会再次 `retire()`，排空后移出提供者表；并发撤除共用一次 `retire()`；`retire()` 抛出为待处置且资源为空；关闭合并全部未排空提供者的资源，重复关闭返回同一结果；关闭后落点、描述、登记被拒而状态与恢复仍可用；`describe` 只列本租户、该作用域、已签发且未释放的获取；恢复把资源分成已停、待处置、不支持，枚举失败或抛出记为不可用，`recover` 抛出记为待处置，缺任一恢复操作的提供者记为不支持，后面的失败不抹前面的结果；恢复授权答不允许或不可用时以该答案拒绝，抛出时为未知，都不做任何恢复；作用域释放只使该作用域的租约失效。

[tests/scope.spec.ts](tests/scope.spec.ts) 覆盖请求方作用域：宿主租约在 `releaseScope(S)` 后以 `scopeReleased` 失效，另一作用域的宿主租约不变，S 的落点解析与再获取为 `referenceExpired`；`describe(S)` 列出宿主落点，另一作用域为空；沙箱层的作用域与请求方作用域不同时，落点解析与获取为 `invalidInput`，不调用提供者，不留记录；租户级沙箱的获取记在请求方作用域下；同键换请求方作用域为 `acquisitionConflict`；提供者收到请求方作用域；宿主获取的待处置资源按请求方作用域交给恢复授权。

[tests/contract-conformance.spec.ts](tests/contract-conformance.spec.ts) 用契约的 `executionEnvironmentConformance` 跑本成员，访问端口用套件给的替身，覆盖访问核验的顺序与拒绝、配额预查与提供者接纳、丢失答复与原获取查询、恢复的获取组。

[tests/public-entry.spec.ts](tests/public-entry.spec.ts) 核对根入口只导出 `createEnvironmentRegistry` 与 `RetirementPending`，并核对任何模块都不导入 `@deepseek-ai/cordis`。测试替身集中在 [tests/doubles.ts](tests/doubles.ts)。

2026-10-25 在 Node v26.12.0、linux 上，`pnpm --filter @omne-harness/execution-environment test` 的 8 个测试文件、120 个测试全部通过，退出码 0。`test:slow` 没有测试文件。

本成员不覆盖：持久化、跨进程一致性、真实提供者的资源停止，以及账本的许可先于效果。这些归 Service 实现、提供者与集成方的真实组合验证。

### 明确缺项

资源操作的异常目前会映射到闭合失败。诊断出口 `diagnose` 只接了五种事件：提供者获取抛出（`providerThrew`）、回执的获取键不符、原记录冲突、原记录与本地事实矛盾、采用失败的清理未确认；诊断只带获取键与原因，不带提供者的错误文本。其余捕获点仍没有诊断：`registry.ts` 的退役、配额预查与恢复授权，`access.ts` 的两个访问端口，`original.ts` 的原记录查询与结清，`lease-view.ts` 的守卫、释放及失效通知拒绝，以及 `recovery.ts` 的枚举和恢复。原资源的待处置责任按现有状态保留，但还不满足 [DP-01 资源边界例外](../../../docs/defensive-patterns.md#dp-01-独立事实分别报告)的全部条件。其余捕获点的接线是本成员的剩余责任。

下列契约条款，本成员的源码现在没有兑现。依赖它们的集成方不能假定本成员已经承担：

- 可能造出受管资源的设施操作在过门之后先经账本计划与许可（[INV-EE15](../execution-environment-contract/SPEC.md#inv-ee15-准备持有回收与确认保持一致)）。本成员不调用账本，这一步由提供者在拿到账本后承担。根入口的模板标记写明这项用法还没有接受。
- 长期运行的保留与淘汰策略待定：获取表的记录（含已释放与已拒绝）与已释放作用域集合现在只增不减，随进程结束释放。淘汰会改变按键查询与同键获取的答复，所以保留策略不是可随意调的配置项，要与集成方账本的重放规则一起定。
- 块生产者的读取面没有定义：生产者读什么、按哪个租户维度读、由什么事件使当前值失效。`describe` 要求访问身份，本成员也不发出变化通知，所以现有操作不够生产者使用。它在生产者插件接受之前定义，拥有者是本成员与 [execution-environment-host-local](../execution-environment-host-local/SPEC.md)；回调的形状由 [Runtime Context 契约](../../context/runtime-context-contract/SPEC.md)给出（[契约 INV-EE17](../execution-environment-contract/SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)）。

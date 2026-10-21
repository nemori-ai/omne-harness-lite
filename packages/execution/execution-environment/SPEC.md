# @omne-harness/execution-environment 行为规格

状态：机制实现成员，`draft`。本成员实现执行环境的登记表：提供者表、设施声明表、获取表、租约视图、落点解析、获取核验、采用记录签发、恢复编排与关闭。公开行为归 [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md)。本页只写本成员源码真实承担的本地行为，不重复契约条款。源码与契约不一致的地方列在[明确缺项](#明确缺项)。

## 范围与依据

本成员与 Cordis 无关（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。根入口导出工厂 `createEnvironmentRegistry` 与错误类 `RetirementPending`。工厂的输入是 `RegistryDependencies`，现在只有恢复授权端口 `recovery`。工厂的输出是 `EnvironmentRegistry<P>`：它实现契约的 `ExecutionEnvironment<P>` 与 `ProviderRegistrations`，另有 `close()`。Cordis 绑定、服务撤除与宿主提供者归 [execution-environment-host-local](../execution-environment-host-local/SPEC.md)。

资源账本与设施守卫不是工厂的依赖。集成方在每次 `acquire` 的输入里给出账本与守卫。本成员把账本原样交给提供者，把守卫装进租约视图。本成员自己不调用账本。

本成员不持有任何耐久状态。获取的状态归集成方的耐久账本，采用记录由集成方随准备记录保存。本成员的全部表都是进程内副本。进程重启后表为空，本成员不重建租约（[IC-19](../../../docs/architecture/cordis-integration-conventions.md#ic-19)、[契约的获取与租约](../execution-environment-contract/SPEC.md#获取与租约)）。

包外依赖：`@omne-harness/execution-environment-contract`（全部类型与 `matchProviders`、`bindingScope` 两个纯函数），`@omne-harness/legal-identity`（`tenantEquals`），`@omne-harness/runtime-context-contract`（`ScopeRef` 类型）。

## 结果与不变量

### 表与视图

| 表 | 键 | 内容 | 谁改 |
| --- | --- | --- | --- |
| 提供者表 | 登记顺序；名称加代唯一 | 提供者、身份、是否在场、进行中的退役 | `registerProvider` 加入；退役标为不在场，已排空时移除 |
| 设施声明表 | 设施键 | 操作名单与须授权的操作名单 | `registerFacility` 加入；撤除函数移除 |
| 获取表 | 幂等键 `AcquisitionRef` 加获取方租户；同一个键下每个租户各一条记录 | 获取方租户、原调用、落点、所选提供者、`AcquisitionState`、租约视图 | `acquire` 写入，租约视图的回调改状态 |
| 已释放作用域 | 作用域引用 | 已由 `releaseScope` 释放的作用域 | `releaseScope` 加入 |

租约视图包住提供者交回的租约原件，每次获取一个。对象与生灭见[对象模型](docs/object-model.md)。

### 落点解析

- `resolvePlacement` 在本成员关闭后返回 `ownerStopped`。
- 未关闭时，本成员把在场的提供者交给契约的 `matchProviders`。`matchProviders` 按允许清单的顺序逐层查找。在一层里，声明了该层、提供全部设施键、能确认全部隔离断言的提供者恰好一个时，选中它。同一层里这样的提供者有两个或更多时，以 `ambiguousEnvironment` 拒绝，不按登记顺序取先登记者，也不再看清单里后面的层。没有匹配时返回最接近的原因：`missingFacility`、`isolationUnconfirmed` 或 `noMatchingEnvironment`。
- 选中的层是另一租户的租户级沙箱时，返回 `notAuthorized`。选中的层属于已释放的作用域时，返回 `referenceExpired`。
- 落点带要求、绑定层、提供者身份与该提供者的连续性。落点不授设施，也不授资源。

### 获取

本成员按下列顺序处理一次 `acquire`：

1. 获取表里已有同一租户在这个键下的记录时，本成员比较落点：绑定层与提供者身份（名称加代）都相同，就返回该记录的当前状态。已获取返回同一租约与同一采用记录，已拒绝返回同一原因，其余状态返回待定并带当前状态。落点不同时，按参数冲突返回 `invalidInput`。这两种情况都不再调用提供者，也不改变记录。另一租户在同一个键下有没有记录，不影响这一步：对本租户来说，没有本租户记录的键就是新键。
2. 本成员已关闭时返回 `ownerStopped`，不写获取表。落点是另一租户的租户级沙箱时返回 `notAuthorized`，不写获取表。
3. 其余情况先在这个键下为本租户写入一条记录，状态为获取中，再重新核对落点。下列任一项不成立即拒绝，原因写入获取表，不换落点：
   - 落点里的提供者身份仍在场，否则 `providerUnavailable`。
   - 落点的作用域没有被释放，否则 `referenceExpired`。
   - 绑定层仍在允许清单内，且该提供者声明了这一层，否则 `noMatchingEnvironment`。
   - 隔离断言都由该提供者确认，否则 `isolationUnconfirmed`。
   - 要求里的设施键都已登记声明，并都由该提供者提供，否则 `unsupportedFacility`。
4. 本成员调用提供者的 `acquire`，交给它幂等键、原调用、落点、租户与账本。提供者抛出时按 `providerUnavailable` 拒绝。提供者拒绝时沿用它的原因。
5. 提供者交回临时回执后，状态为临时，本成员核验回执。下列任一项成立即核验失败：本成员已关闭（`ownerStopped`），提供者已不在场（`providerUnavailable`），作用域已释放（`referenceExpired`），回执里的绑定层与落点不同（`unavailable`），回执的租约缺少要求里的设施（`unsupportedFacility`）。
6. 核验失败时，本成员释放回执里的租约原件。释放成功则这次获取以核验失败的原因拒绝。释放待处置或抛出时，状态为待处置释放，带未停的受管资源，采用记录为空。
7. 核验通过时，本成员签发采用记录：幂等键、原调用、落点、提供者身份、实例身份与代、连续性与提供者证据。提供者不能自签。然后本成员建立租约视图，状态为已获取。

同一个键的并发请求不会两次调用提供者。第二个请求在第一个请求结束前到达时，得到待定，状态为获取中。

`inspectAcquisition` 只读本租户在这个键下的记录。没有本租户的记录时答复 `unrecorded`，不论另一租户有没有用过这个键。两个租户用同一个键时，各自是一次独立的获取，互相看不见，也互不改变状态。所以按键查询与按键获取都不泄露另一租户是否有这个键。

### 租约视图与逐操作门

租约视图只暴露要求里的设施键。一个键要同时满足三项才能取到设施：在要求里，设施声明表里有它，提供者的租约原件有它。否则 `facility(键)` 返回 `undefined`。

设施声明里列出的每个操作在调用提供者设施之前先过门。门按下列顺序核对，第一项不成立即返回拒绝，不调用提供者设施：

1. 请求有非空的请求身份、非空的原调用、带租户的访问身份与带种类的绑定层，否则 `invalidInput`。
2. 租约仍有效，否则 `closed`。
3. 请求里的租户等于获取方的租户，否则 `notAuthorized`。
4. 须授权的操作问设施守卫。守卫答不允许时返回 `notAuthorized`。守卫答不可用或抛出时返回 `unavailable`。
5. 守卫答允许之后，租约若已失效，返回 `closed`。

门不解释主体。主体原样交给守卫。设施声明里没有列出的成员不经过门，所以设施拥有者的声明必须列全操作（[契约的设施协议](../execution-environment-contract/SPEC.md#设施协议)）。

### 失效与释放

- 租约失效的原因有：提供者退役（`providerRetired`）、作用域释放（`scopeReleased`）、本成员关闭（`registryClosed`）、释放成功（`released`），以及提供者原件报告的原因。原件的失效通知以拒绝结束时，原因是 `providerInvalidated`。失效只发生一次，状态从已获取变为已失效。
- 释放只对本次获取。释放中状态为释放中。原件释放成功时状态为已释放，租约随之失效。原件释放待处置或抛出时，状态为待处置释放，带未停的受管资源。
- 同一释放可以重试。待处置之后再调用 `release()` 会再次调用原件的释放。已释放之后再调用 `release()` 直接返回已释放，不再调用原件。同一时刻的并发释放共用一次调用。
- 丢掉租约引用不是释放。获取表保留该记录。

### 描述

`describe(访问身份, 作用域)` 在本成员关闭后返回 `ownerStopped`。未关闭时，它列出获取表里同一租户、绑定层属于该作用域、有采用记录且尚未释放的获取。每项带幂等键、原调用、绑定层、提供者身份、实例身份与代、连续性、设施键与当前状态名。

### 登记与退役

- `registerFacility` 对已登记的键抛出错误，原声明不变。撤除函数只删除它自己登记的那一份声明。
- `registerProvider` 在本成员关闭后抛出错误。同名同代的提供者已在提供者表里时也抛出错误。
- 撤除提供者即开始退役。本成员先把提供者标为不在场，再使它交出的全部租约以 `providerRetired` 失效，然后调用它的 `retire()`。`retire()` 抛出时按待处置处理，未停资源列表为空。
- 已排空时，本成员从提供者表移除这个提供者。待处置时，提供者留在表里但不在场，撤除函数抛出 `RetirementPending`，带未停的受管资源。再调用同一撤除函数会再次调用 `retire()`。同一时刻的并发退役共用一次调用。

### 恢复

- `recoverOwned` 与 `releaseScope` 先核恢复授权。本成员收集获取表里该作用域内处于待处置释放的全部受管资源，连同恢复授权与作用域一起，调用一次恢复授权端口。端口答不允许或不可用时，本成员以该答案拒绝，不做任何恢复。端口抛出按不可用处理。
- `releaseScope` 在授权通过后把作用域记为已释放，使该作用域内的全部租约以 `scopeReleased` 失效，然后做与 `recoverOwned` 相同的恢复。之后这个作用域的落点解析与获取都返回 `referenceExpired`。
- 恢复按登记顺序逐个提供者进行，包括退役待处置的提供者。没有 `listRecoveryResources` 或 `recover` 的提供者记为不支持。枚举失败或抛出的提供者记为不可用，不当空集。每个资源的停止结果是已确认停止、待处置或不支持。`recover` 抛出的资源记为待处置。前面已处理的部分不因后面的失败而丢失。
- 本成员关闭之后，恢复两操作仍可调用。
- 恢复授权只用于这两个操作，本成员不把它用于获取或设施操作。

### 关闭

`close()` 依次做三件事：

1. 记为已关闭。之后新的落点解析、获取与描述返回 `ownerStopped`，新的提供者登记抛出错误。已在获取表里的键仍按幂等规则返回当前状态。
2. 使全部租约以 `registryClosed` 失效。之后这些租约上的设施操作在门的第 2 步返回 `closed`。
3. 并发退役全部提供者，等全部退役结束。全部已排空时返回已排空，否则返回待处置并合并全部未停的受管资源。

本成员不另外等待在途的 `acquire`。在途获取在核验时看到本成员已关闭，按 `ownerStopped` 拒绝并释放回执。在途的设施操作由原提供者在 `retire()` 中结清。关闭不清空获取表，`inspectAcquisition` 仍能答复关闭前的状态。重复调用 `close()` 返回同一个结果。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 失败时 | 结束 |
| --- | --- | --- | --- |
| 四张表 | 登记表实例 | 进程失败即丢失。重启后按键查询答复 `unrecorded` | 进程结束；`close()` 不清空表 |
| 租约视图 | 所属获取 | 失效后设施操作返回 `closed` | 释放确认 |
| 采用记录 | 本成员签发，集成方保存 | 本成员不保存耐久副本 | 随集成方的准备记录 |
| 提供者登记 | 登记它的一方 | 退役待处置时撤除函数抛出 `RetirementPending` | 已排空 |
| 设施声明登记 | 登记它的一方 | 重复键抛出错误 | 撤除函数 |
| 受管资源 | 造出它的提供者；耐久部分在集成方账本 | 本成员只在待处置释放里转交资源列表 | 归[契约](../execution-environment-contract/SPEC.md#所有权失败与生命周期) |

进程失败后，本成员没有东西可恢复。集成方据自己的账本判断哪些获取需要处置，再由维护者凭恢复授权调用 `recoverOwned` 或 `releaseScope`。提供者的枚举给出该作用域现存的受管资源。本成员不重建租约，也不重放任何设施操作。

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
| 同一幂等键重复与并发获取 | 只调用一次提供者；并发的第二个请求得到获取中；之后得到同一租约与同一采用记录 |
| 另一租户使用同一键 | 另一租户查询答复 `unrecorded`；它的获取是一次独立获取，再调用一次提供者，得到另一个租约；第一个租户的状态不变 |
| 同一租户同一键换落点 | 返回 `invalidInput`，不再调用提供者 |
| 同一层两个提供者都满足 | 落点解析返回 `ambiguousEnvironment` |
| 设施声明没有登记 | 获取返回 `unsupportedFacility`，不调用提供者 |
| 须授权的操作 | 守卫答不允许或不可用时不调用设施；另一租户的请求返回 `notAuthorized` |
| 作用域释放 | 恢复授权不允许时拒绝且仍能获取；允许后租约以 `scopeReleased` 失效，再获取返回 `referenceExpired` |
| 关闭 | 退役提供者，租约以 `registryClosed` 失效，新获取返回 `ownerStopped`，旧租约上的操作返回 `closed` |

[tests/public-entry.spec.ts](tests/public-entry.spec.ts) 核对根入口只导出 `createEnvironmentRegistry` 与 `RetirementPending`，并核对任何模块都不导入 `@deepseek-ai/cordis`。

2026-10-21 在 Node v24.18.0、linux 上，`pnpm --filter @omne-harness/execution-environment test` 的 2 个测试文件、14 个测试全部通过，退出码 0。

本成员不覆盖：持久化、跨进程一致性、真实提供者的资源停止，以及账本的许可先于效果。这些归 Service 实现、提供者与集成方的真实组合验证。

### 明确缺项

下列契约条款，本成员的源码现在没有兑现。依赖它们的集成方不能假定本成员已经承担：

- 契约要求落点解析只选设施声明都已登记的层（[契约的获取与租约](../execution-environment-contract/SPEC.md#获取与租约)）。本成员在落点解析时不查设施声明表，只在获取时以 `unsupportedFacility` 拒绝。
- 契约要求撤除设施声明后，已有租约上对这个键的后续操作以 `unsupported` 拒绝（[契约的设施协议](../execution-environment-contract/SPEC.md#设施协议)）。本成员在撤除后让 `facility(键)` 返回 `undefined`。撤除之前已经取到的设施对象仍按旧声明过门，继续调用提供者设施。
- 契约要求本成员重启后对同一个键答复 `unrecorded` 且不重新分配。重启后 `inspectAcquisition` 答复 `unrecorded`，但对同一个键再调用 `acquire` 会作为新获取调用提供者。集成方须先查自己的账本，不对账本里已有的键再次调用 `acquire`。
- 可能造出受管资源的设施操作在过门之后先经账本计划与许可（[INV-EE15](../execution-environment-contract/SPEC.md#inv-ee15-准备持有回收与确认保持一致)）。本成员不调用账本，这一步由提供者在拿到账本后承担。根入口的模板标记写明这项用法还没有接受。

# authorization

## 职责与状态

本成员拥有动作准入的裁定、许可引用与消费事实。它消费 identity 的可信主体与当前资格事实，给出可核对的裁定。它不拥有资源的含义，也不定义业务对象的生命周期。业务规则的采用范围见 [SPEC](SPEC.md)。首批公开形状由 [#659](https://github.com/nemori-ai/omne-harness-lite/issues/659) 交付，方向依据是 [#638 的决定记录](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6357861225)。[后续有限采用](https://github.com/nemori-ai/omne-harness-lite/issues/659#issuecomment-6370208573)明确首批适配边界。消费点在 Tool P04 的 consume，受理记录带许可引用。

已实现的部分：裁定输入与结论、纯函数 `decideAdmission`、裁定端口 `AdmissionCheck`、许可引用与消费事实、可核对证据，以及进程内参考件。尚未实现的部分：表达解释、人工决定的绑定、撤回操作、结构化约束的接入、持久台账。

## 使用

用包名导入公开入口。依赖是 `@omne-harness/identity`、`@omne-harness/legal-identity` 与 `@omne-harness/operation-result`。本包没有 Cordis 入口。测试替身在子路径 `@omne-harness/authorization/testing`。

```ts
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { inMemoryPermitLedger, noArguments, referenceAdmissionCheck } from '@omne-harness/authorization'

const authority = inProcessPrincipalAuthority()
const permits = inMemoryPermitLedger()
const check = referenceAdmissionCheck({
  verifier: authority.verifier,
  standing: tenantStandingSource, // identity 读口的提供者
  permits: permits.ledger,
})

const decision = await check.check({
  access: { principal, tenant },
  operation: { owner: 'session', name: 'read-history' },
  target: { owner: 'session', kind: 'session', key: 'ses_1' },
  arguments: noArguments(), // 或 effectiveArgumentsOf(<实际执行采用的固定参数>)
  requires: [],
  permit: null,
})
// decision.kind 是 'allowed'、'denied' 或 'unavailable'
```

消费端口的适配器把端口输入映射为 `AdmissionInput`，把结论映射回端口结论。`tests/port-adapters.spec.ts` 演示 Agent、Tool 与 Session 的有限映射。ActionAdmission 的 `permissions` 是列表。示例在该列表为空且 `decision` 为 null 时，按 [SPEC](SPEC.md#消费端口的适配)「消费端口的适配」的映射裁定。附言按 [AU-03](SPEC.md#au-03-授权表达与适用范围) 解释，示例没有安装附言的解释器。所以答复为附言时，示例先核对租户与资格，裁定为 `allowed` 时按 [AU-05](SPEC.md#au-05-人工决定参数改写与重新核验) 改为拒绝，原因为 `human-guidance`。其他输入在缺少解释端口时返回 `unavailable`。它不实现选择、拒答与附言的解释、结构化权限或人工决定的绑定。真实业务在操作点还须核对原工作资格，缺少必要守卫时不得推进。

| 导出 | 用途 |
| --- | --- |
| `AdmissionInput`、`AdmissionOperation`、`AdmissionTarget` | 裁定输入 |
| `AdmissionDecision`、`DenialReason`、`AdmissionBasis`、`StandingBasis` | 裁定结论、拒绝原因与依据 |
| `AdmissionFacts`、`decideAdmission(input, facts)` | 对已读事实的纯裁定 |
| `AdmissionCheck` | 裁定端口 |
| `DurableEvidence`（再导出 exchange-refs 的唯一定义）、`DecisionEvidence`、`decisionEvidence`、`digestOf`、`canonicalText` | 可核对证据与摘要 |
| `EffectiveArguments`、`effectiveArgumentsOf`、`noArguments()` | 生效参数的摘要；许可绑定它 |
| `PermitId`、`decodePermitId`、`PERMIT_ID_MAX_LENGTH`、`PermitRef` | 许可引用 |
| `PermitGrant`、`PermitState`、`ConsumptionFact`、`ConsumerPosition` | 许可与消费事实 |
| `PermitLedger`、`PermitGrantor`、`PermitLookup`、`ConsumeOutcome`、`GrantOutcome` | 台账端口 |
| `referenceAdmissionCheck`、`inMemoryPermitLedger` | 进程内参考件 |
| `operationEquals`、`targetEquals` | 操作与目标的相等 |
| `SystemActionRequest`、`SystemActionTarget`、`SystemActionDecision`、`SystemActionDenial`、`SystemActionBasis`、`SystemActionFacts`、`SystemActionAuthorization` | 系统动作授权端口及其请求、结论与依据 |
| `decideSystemAction(request, facts)`、`referenceSystemActionAuthorization` | 系统动作的纯裁定与进程内参考检查 |
| `SYSTEM_ACTION_MATRIX`、`SystemActionRow` | 十行系统用途矩阵 |
| `MaintenanceGrant`、`MaintenanceGrantReading`、`MaintenanceGrantSource`、`SystemActionClock`、`ExpiryReading`、`SystemActionDependencies` | 维护授权读口与可信时钟 |
| `scriptedMaintenanceGrants`、`manualSystemClock`（`./testing`） | 读口与时钟的替身，不是生产来源 |

系统动作的判定顺序、矩阵与撤权已知限制见 [SPEC AU-12](SPEC.md#au-12-系统动作授权端口判定顺序用途矩阵与维护授权读口)。本包不提供生产 `SystemActionAuthorization` 与生产授予来源，也没有 grant 管理入口。

## 契约

公开类型在 `src/`。[SPEC](SPEC.md) 的 AU-11 拥有类型表达不了的条款：裁定步骤与顺序、每个拒绝原因的条件、许可绑定操作、目标与参数摘要、不可用不放行、不缓存允许、撤权后再核拒绝、许可消费一次且 `consumed` 才是执行依据、证据的重算。其余条款沿 AU-01 至 AU-10。

`decideAdmission` 与参考件都不抛出。参考件的依赖抛出时，结论是 `unavailable`，诊断不带异常文本。

## 设计

`src/admission.ts` 是裁定的纯函数与类型。`src/reference.ts` 读依赖并调用它。`src/permit.ts` 定义许可、台账端口与内存台账。`src/evidence.ts` 定义证据与规范 JSON 的 SHA-256 摘要。`src/operation.ts` 定义操作与目标。`src/system-action.ts` 是系统动作的纯裁定与类型，`src/system-matrix.ts` 是矩阵，`src/system-reference.ts` 读依赖并调用纯裁定，`src/testing/` 是替身。[内部设计](docs/internals.md)维护机制与流程。

## 配置与运行

本包不读环境变量，不创建存储或进程。内存台账属于一个进程：进程退出丢失全部许可。摘要用 `node:crypto`。

## 验证

单元与契约测试从包名导入公开入口，所以同时检查 `dist` 能被独立消费。集成测试与端到端测试不适用：本包没有存储、应用服务或用户旅程。

| 文件 | 覆盖 |
| --- | --- |
| `tests/decide.spec.ts` | 每个步骤与拒绝原因、两种不可用、证据重算、参数摘要、许可逐项比较、核验得到另一主体时拒绝、纯函数 |
| `tests/evidence.spec.ts` | 规范 JSON 的成员顺序、undefined 成员、数组保序；摘要与证据 |
| `tests/reference-check.spec.ts` | 撤权后再核拒绝、每次重新读取、依赖抛出不放行、许可消费后不再放行 |
| `tests/permit.spec.ts` | 许可文本、授予、查找、跨租户、手写租户、重复消费 |
| `tests/snapshots.spec.ts` | 修改输入或返回值不能改写许可、消费事实或历史裁定依据；证据仍可重算，主体与租户保留原身份 |
| `tests/port-adapters.spec.ts` | Agent、Tool 的有限映射；未支持的权限或答复输入不放行；Session 的成员资格示例映射，用 session-contract 的真实 `SessionAccessCheck` 形状与非耐久事务替身 |
| `tests/system-action.spec.ts` | 系统动作的四个步骤与顺序、不可用分支、纯函数快照 |
| `tests/system-matrix.spec.ts` | 矩阵逐行、固定参数、授予互不借用、无通配 |
| `tests/system-evidence.spec.ts` | 系统动作的证据重算与无记录证据、下一次核验撤销与到期、无围栏名称 |
| `tests/system-testing-doubles.spec.ts` | 两个替身与 `./testing` 导出清单 |
| `tests/public-entry.spec.ts` | 公开导出清单 |

端口适配器测试用 `@omne-harness/agent-contract`、`@omne-harness/session-contract`、`@omne-harness/tool`、`@omne-harness/tool-contract` 作为 devDependencies 取端口类型。`Access<P>` 只有 legal-identity 一份定义，各契约成员再导出它，所以没有类型等价测试。Session 一侧的映射用 session-contract 根入口的真实 `SessionAccessCheck` 形状与它的非耐久事务替身验证（[#680](https://github.com/nemori-ai/omne-harness-lite/issues/680)）。它仍是参考映射，只覆盖选定的成员资格示例，不证明生产授权政策、系统作用域授权或完整的模式解释。前两项在里程碑 M2 接入；完整的模式解释不在 M2。测试不执行业务，不证明签发持有约束、原工作关系或当前工作资格守卫已装配。

在仓库根运行 `pnpm turbo run test --filter=@omne-harness/authorization`。turbo 先构建依赖与 `dist`，再运行测试。本目录里的 `pnpm test` 不构建。

## 维护

改公开形状先改 `src/`，再同步 SPEC AU-11、本页与消费者。消费者是实现四个消费端口的适配器与应用装配；它们在各自的交付里采用。持久台账的提供者按 AU-06 与本页的条款写自己的资源与失败责任，不另写一份公共保证。

# authorization

## 职责与状态

本成员拥有动作准入的裁定、许可引用与消费事实。它消费 identity 的可信主体与当前资格事实，给出可核对的裁定；它不拥有资源的含义，也不定义任何业务对象的生命周期。业务规则的采用范围见 [SPEC](SPEC.md)。首批公开形状由 [#659](https://github.com/nemori-ai/omne-harness-lite/issues/659) 交付，依据是 [#638 的 2026-10-23 决定记录](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6357861225)：裁定形状能直接实现 `AgentAccessCheck`、`ActionAdmission`、`SessionAccessCheck` 与 Tool 的 `access.qualify`；消费点在 Tool P04 的 consume，受理记录带许可引用。

已实现的部分：裁定输入与结论、纯函数 `decideAdmission`、裁定端口 `AdmissionCheck`、许可引用与消费事实、可核对证据，以及进程内参考件。尚未实现的部分：表达解释、人工决定的绑定、撤回操作、结构化约束的接入、持久台账。

## 使用

用包名导入公开入口。依赖是 `@omne-harness/identity`、`@omne-harness/legal-identity` 与 `@omne-harness/operation-result`。本包没有 Cordis 入口。

```ts
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { inMemoryPermitLedger, referenceAdmissionCheck } from '@omne-harness/authorization'

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
  requires: [],
  permit: null,
})
// decision.kind 是 'allowed'、'denied' 或 'unavailable'
```

消费端口的适配器把端口输入映射为 `AdmissionInput`，把结论映射回端口结论。`tests/port-adapters.spec.ts` 给出四个端口的进程内适配器。

| 导出 | 用途 |
| --- | --- |
| `AdmissionInput`、`AdmissionOperation`、`AdmissionTarget` | 裁定输入 |
| `AdmissionDecision`、`DenialReason`、`AdmissionBasis`、`StandingBasis` | 裁定结论、拒绝原因与依据 |
| `AdmissionFacts`、`decideAdmission(input, facts)` | 对已读事实的纯裁定 |
| `AdmissionCheck` | 裁定端口 |
| `EvidenceRef`、`DecisionEvidence`、`decisionEvidence`、`digestOf`、`canonicalText` | 可核对证据与摘要 |
| `PermitId`、`decodePermitId`、`PERMIT_ID_MAX_LENGTH`、`PermitRef` | 许可引用 |
| `PermitGrant`、`PermitState`、`ConsumptionFact`、`ConsumerPosition` | 许可与消费事实 |
| `PermitLedger`、`PermitGrantor`、`PermitLookup`、`ConsumeOutcome`、`GrantOutcome` | 台账端口 |
| `referenceAdmissionCheck`、`inMemoryPermitLedger` | 进程内参考件 |
| `operationEquals`、`targetEquals` | 操作与目标的相等 |

## 契约

公开类型在 `src/`。[SPEC](SPEC.md) 的 AU-11 拥有类型表达不了的条款：裁定步骤与顺序、每个拒绝原因的条件、不可用不放行、不缓存允许、撤权后再核拒绝、许可消费一次、证据的重算。其余条款沿 AU-01 至 AU-10。

`decideAdmission` 与参考件都不抛出。参考件的依赖抛出时，结论是 `unavailable`，诊断不带异常文本。

## 设计

`src/admission.ts` 是裁定的纯函数与类型。`src/reference.ts` 读依赖并调用它。`src/permit.ts` 定义许可、台账端口与内存台账。`src/evidence.ts` 定义证据与规范 JSON 的 SHA-256 摘要。`src/operation.ts` 定义操作与目标。[内部设计](docs/internals.md)维护机制与流程。

## 配置与运行

本包不读环境变量，不创建存储或进程。内存台账属于一个进程：进程退出丢失全部许可。摘要用 `node:crypto`。

## 验证

单元与契约测试从包名导入公开入口，所以同时检查 `dist` 能被独立消费。集成测试与端到端测试不适用：本包没有存储、应用服务或用户旅程。

| 文件 | 覆盖 |
| --- | --- |
| `tests/decide.spec.ts` | 每个步骤与拒绝原因、两种不可用、证据重算、纯函数 |
| `tests/reference-check.spec.ts` | 撤权后再核拒绝、每次重新读取、依赖抛出不放行、许可消费后不再放行 |
| `tests/permit.spec.ts` | 许可文本、授予、查找、跨租户、手写租户、重复消费 |
| `tests/port-adapters.spec.ts` | 进程内适配器实现 `AgentAccessCheck`、`ActionAdmission`、Tool `access.qualify`、`SessionAccessCheck` |
| `tests/access-equivalence.spec-d.ts` | `Access<P>` 与 agent、tool、model 契约的副本是同一类型 |
| `tests/public-entry.spec.ts` | 公开导出清单 |

端口适配器测试用 `@omne-harness/agent-contract`、`@omne-harness/tool`、`@omne-harness/tool-contract`、`@omne-harness/model-contract` 作为 devDependencies 取端口类型。`SessionAccessCheck` 尚不存在，测试按已定形状本地声明。在仓库根运行 `pnpm turbo run test --filter=@omne-harness/authorization`。turbo 先构建依赖与 `dist`，再运行测试。本目录里的 `pnpm test` 不构建。

## 维护

改公开形状先改 `src/`，再同步 SPEC AU-11、本页与消费者。消费者是实现四个消费端口的适配器与应用装配；它们在各自的交付里采用。持久台账的提供者按 AU-06 与本页的条款写自己的资源与失败责任，不另写一份公共保证。

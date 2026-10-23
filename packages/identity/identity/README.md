# identity

## 职责与状态

本成员拥有主体、组织成员、租户、登录与当前租户选择的事实，以及治理模型给出的可解释资格。业务规则的采用范围见 [SPEC](SPEC.md)。首批公开形状由 [#659](https://github.com/nemori-ai/omne-harness-lite/issues/659) 交付，依据是 [#638 的 2026-10-23 决定记录](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6357861225)：两种主体与复合主体、具名资格「组织成本账目读取」、登录入口租户冲突只管治理入口、成功业务访问报告的形状。

已实现的部分：两种主体的类型、签发与核验接口、进程内权威；具名资格与角色映射；当前资格读口的类型；成功业务访问报告的类型。尚未实现的部分：账号、组织、成员关系、登录的存储与流程，以及实现读口和报告口的提供者。原有效能力与阶段承诺沿[产品正文](../../../.meta_harness/design/product/identity-and-authorization/design.md)判断。

## 使用

用包名导入公开入口。依赖是 `@omne-harness/legal-identity` 与 `@omne-harness/operation-result`。本包没有 Cordis 入口。

```ts
import { tenantCodec } from '@omne-harness/legal-identity'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'

const authority = inProcessPrincipalAuthority()
const coordinator = authority.issuer.issueSystem({ component: 'session-coordinator' })
const tenant = tenantCodec.parse('{"organization":"org_…","account":"acc_…"}')
if ('failure' in coordinator || !tenant.ok) throw new Error('fixture')

const acting = authority.issuer.issueActingForTenant({
  actor: coordinator.ok,
  tenant: tenant.value,
  work: { owner: 'session', work: 'ses_1' },
})
// authority.verifier.verify(acting.ok) → { kind: 'verified', principal }
```

应用装配创建一个权威，把 `verifier` 交给授权与其他消费方；把 `issuer` 只交给需要主体的具名持有者：identity 自己的登录与会话建立流程，以及装配声明的系统部件（扫描、卸载、目录枚举、中继、协调者读取用系统主体）。持有者由装配声明。持有者把签发的主体放进 `Access<Principal>` 的 `principal`。协调者代原工作行事的签发怎样核对工作归属，是 [SPEC ID-16](SPEC.md) 的具名缺口。`inProcessPrincipalAuthority` 同时返回两者，这是骨架参考件的便利，不证明持有约束。

| 导出 | 用途 |
| --- | --- |
| `SystemPrincipal`、`ActingForTenantPrincipal`、`Principal`、`WorkRef` | 两种主体与原工作关联 |
| `PrincipalIssuer`、`PrincipalVerifier`、`PrincipalAuthority`、`inProcessPrincipalAuthority()` | 签发与核验接口，以及进程内权威 |
| `scopeOf(principal)` | 主体的行事作用域（`ActingScope`） |
| `QUALIFICATIONS`、`Qualification`、`isQualification` | 具名资格 |
| `RoleMapping`、`RoleRef`、`GovernanceModelRef`、`qualificationsOf`、`governanceModelEquals` | 治理模型的角色到资格映射 |
| `DEFAULT_TEAM_MODEL`、`DEFAULT_TEAM_ROLES`、`DEFAULT_TEAM_ROLE_MAPPING` | 默认团队方案的映射 |
| `TenantStandingSource`、`TenantStandingReading`、`StandingEvidence` | 当前资格读口 |
| `BusinessAccessReport`、`BusinessAccessReportOutcome`、`LoginActivityReporter` | 成功业务访问报告 |

## 契约

公开类型在 `src/`。[SPEC](SPEC.md) 的 ID-16 拥有类型表达不了的条款：签发条件、核验的三种答复、资格的含义、读口答当下事实、治理入口的租户冲突、报告不带时间。其余条款沿 ID-01 至 ID-15。合法身份的纯值归 [legal-identity](../../common/legal-identity/README_ZH.md)。

签发与核验都不抛出：签发失败返回 `IssueFailure`，核验失败返回 `rejected` 或 `unavailable`。`verify` 是判定，不是解码：`verified` 带回的 `principal` 就是传入的那个对象。`scopeOf` 对手写的代租户行事主体抛出 `TypeError`，因为它的租户没有铸造。

## 设计

`src/principal.ts` 定义两种主体与进程内权威。权威用 `WeakSet` 登记自己签发并冻结的对象；核验就是登记成员资格。`src/qualification.ts` 定义具名资格、角色映射和默认团队映射。`src/standing.ts` 与 `src/login-activity.ts` 只定义端口类型。[内部设计](docs/internals.md)维护机制与流程。

## 配置与运行

本包不读环境变量，不创建账号、凭证、时钟或进程。进程内权威的登记属于一份已加载的模块：主体经过 JSON、结构化克隆、worker 消息或另一个进程后不再带有签发。

## 验证

单元与契约测试从包名导入公开入口，所以同时检查 `dist` 能被独立消费。集成测试与端到端测试不适用：本包没有存储、应用服务或用户旅程。`TenantStandingSource` 与 `LoginActivityReporter` 只有端口类型，本包没有它们的实现，所以没有它们的行为测试；提供者自测。

| 文件 | 覆盖 |
| --- | --- |
| `tests/principal.spec.ts` | 签发两种主体、拒绝的输入、畸形输入不抛出、核验、手写副本与 JSON 往返 |
| `tests/principal.spec-d.ts` | 不带租户的代租户行事主体、带租户的系统主体是类型错误 |
| `tests/qualification.spec.ts` | 具名资格清单、默认团队映射、别的模型与未列出的角色 |
| `tests/login-activity.spec-d.ts` | 报告不带时间；报告口只答三种结果 |
| `tests/public-entry.spec.ts` | 公开导出清单 |

在仓库根运行 `pnpm turbo run test --filter=@omne-harness/identity`。turbo 先构建依赖与 `dist`，再运行测试。本目录里的 `pnpm test` 不构建。

## 维护

改公开形状先改 `src/`，再同步 SPEC ID-16、本页与消费者。当前消费者是 `packages/identity/authorization`。实现读口或报告口的提供者按 SPEC 的条款写自己的资源、失败与持久责任，不另写一份公共保证。

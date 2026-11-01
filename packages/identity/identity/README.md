# identity

## 职责与状态

本成员拥有主体、组织成员、租户、登录与当前租户选择的事实，以及治理模型给出的可解释资格。业务规则的采用范围见 [SPEC](SPEC.md)。首批公开形状由 [#659](https://github.com/nemori-ai/omne-harness-lite/issues/659) 交付，依据是 [#638 的 2026-10-23 决定记录](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6357861225)：两种主体与复合主体、具名资格「组织成本账目读取」。

已实现的部分：两种主体的类型、签发与核验接口、进程内权威；具名资格与角色映射；当前资格读口的类型。注册并激活、签发登录与识别登录三项操作的契约类型，条款见 SPEC ID-17。测试入口 `./testing` 提供这三项操作的进程内参考替身与契约测试套件。尚未实现的部分：账号、组织、成员关系、登录的持久存储与其他流程，切换租户、查询、退出与撤销登录，成功业务访问报告的形状，以及实现读口和三项操作的真实提供者。原有效能力与阶段承诺沿[产品正文](../../../.meta_harness/design/product/identity-and-authorization/design.md)判断。

## 使用

用包名导入公开入口。纯值依赖是 `@omne-harness/legal-identity`、`@omne-harness/operation-result` 与 `@omne-harness/utc-instant`。独立的 `./cordis` 入口使用 `@deepseek-ai/cordis` 4.0.4，提供四个原接口的抽象服务定义与键，见 [Cordis 消费说明](docs/cordis.md)。根入口不加载 Cordis。

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

应用装配创建一个权威，把 `verifier` 交给授权与其他消费方，把 `issuer` 只交给装配声明的受信具名持有者。持有者在签发前须向原工作拥有者核对原主体、目标租户与原工作的关系。核对失败、依据不可得或能力未安装时不得签发。签发的主体放进 `Access<Principal>` 的 `principal`。消费方在实际操作点还须核当前成员关系及原工作资格，缺少必要守卫时不得推进业务。责任与有限采用依据见 [SPEC ID-16](SPEC.md)。`inProcessPrincipalAuthority` 只提供进程内来源核验，不实现上述真实提供者能力。

| 导出                                                                                          | 用途                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `SystemPrincipal`、`ActingForTenantPrincipal`、`Principal`、`WorkRef`                         | 两种主体与原工作关联                                         |
| `PrincipalIssuer`、`PrincipalVerifier`、`PrincipalAuthority`、`inProcessPrincipalAuthority()` | 签发与核验接口，以及进程内权威                               |
| `scopeOf(principal)`                                                                          | 主体的行事作用域（`ActingScope`）                            |
| `QUALIFICATIONS`、`Qualification`、`isQualification`                                          | 具名资格                                                     |
| `RoleMapping`、`RoleRef`、`GovernanceModelRef`、`qualificationsOf`、`governanceModelEquals`   | 治理模型的角色到资格映射                                     |
| `DEFAULT_TEAM_MODEL`、`DEFAULT_TEAM_ROLES`、`DEFAULT_TEAM_ROLE_MAPPING`                       | 默认团队方案的映射                                           |
| `TenantStandingSource`、`TenantStandingReading`、`StandingEvidence`                           | 当前资格读口                                                 |
| `IdentityOperations`、`IdentityOperationsOptions`                                             | 注册并激活、签发登录与识别登录的操作端口，以及提供者的注入项 |
| `RegisterAndActivateInput`、`RegisterAndActivateOutcome`、`LoginCredentialInput`              | 注册并激活的输入与结果                                       |
| `IssueLoginInput`、`IssueLoginOutcome`、`IssuedLogin`                                         | 签发登录的输入与结果                                         |
| `RecognizeLoginInput`、`LoginRecognition`                                                     | 识别登录的输入与结果                                         |
| `IdentityClock`、`ClockReading`、`LoginTermsSource`、`LoginTermsReading`、`LoginTerms`        | 注入的时钟与登录期限配置                                     |

### 测试入口 `./testing`

`@omne-harness/identity/testing` 只给测试使用，产品源码不导入它。参考替身只实现注册即激活这一种开通方案，账号与登录只在内存中。替身证明什么、不证明什么见 [SPEC ID-17](SPEC.md#id-17-注册激活签发登录与识别登录)。

```ts
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import {
  adjustableLoginTerms,
  inProcessIdentityOperations,
  manualIdentityClock,
} from '@omne-harness/identity/testing'

const start = parseInstant('2026-10-25T09:00:00Z')
const maxLifetime = parseDuration('PT43200S')
const idlePeriod = parseDuration('PT1800S')
if (!start.ok || !maxLifetime.ok || !idlePeriod.ok) throw new Error('fixture')

const clock = manualIdentityClock(start.value)
const terms = adjustableLoginTerms({ maxLifetime: maxLifetime.value, idlePeriod: idlePeriod.value })
const identity = inProcessIdentityOperations({ clock: clock.clock, terms: terms.source })

await identity.registerAndActivate({ loginIdentifier: 'grace', credential: 'secret' })
const login = await identity.issueLogin({ loginIdentifier: 'grace', credential: 'secret' })
if (login.kind === 'succeeded') await identity.recognizeLogin({ loginProof: login.loginProof })
// → { kind: 'recognized', account, login, tenant }
```

| 导出                                                                                                                                            | 用途                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `inProcessIdentityOperations({ clock, terms, faults })`、`InProcessIdentityOptions`                                                             | 三项操作的进程内参考替身。时钟与期限配置都须注入，没有默认值。`faults` 可选 |
| `manualIdentityClock(start)`、`ManualIdentityClock`                                                                                             | 可控时钟：前进、后退、置为不可得                                            |
| `adjustableLoginTerms(initial)`、`AdjustableLoginTerms`                                                                                         | 可控期限配置：改值、置为不可得                                              |
| `recordStoreFaults()`、`RecordStoreFaultControl`、`RecordStoreFaults`、`RecordStore`                                                            | 可控记录库故障：使账号记录库或登录记录库对查询不作答                        |
| `checkIdentityOperationsContract(fixture, options)`、`IDENTITY_CONTRACT_CASES`                                                                  | 契约测试套件与用例清单。真实提供者用同一套件检查自己                        |
| `IdentityContractFixture`、`IdentityContractProviderOptions`、`IdentityContractOptions`、`IdentityContractReport`、`IdentityContractCaseResult` | 套件的输入与逐项报告                                                        |

## 契约

公开类型在 `src/`。[SPEC](SPEC.md) 的 ID-16 拥有类型表达不了的条款：签发条件、核验的三种答复、资格的含义、读口答当下事实。ID-17 拥有三项操作的判断次序、结果种类、注入与期限条款。治理入口的租户冲突归 ID-08。其余条款沿 ID-01 至 ID-15。合法身份的纯值归 [legal-identity](../../common/legal-identity/README_ZH.md)。

签发与核验都不抛出：签发失败返回 `IssueFailure`，核验失败返回 `rejected` 或 `unavailable`。`verify` 是判定，不是解码：`verified` 带回的 `principal` 就是传入的那个对象。`scopeOf` 只提取作用域，不验证主体来源或当前资格。代租户主体的租户未经合法铸造时，它抛出 `TypeError`。手写主体即使携带合法租户，仍须经 `PrincipalVerifier` 核验来源。

## 设计

`src/principal.ts` 定义两种主体与进程内权威。权威用 `WeakSet` 登记自己签发并冻结的对象；核验就是登记成员资格。`src/qualification.ts` 定义具名资格、角色映射和默认团队映射。`src/standing.ts` 只定义端口类型。`src/operations.ts` 定义三项操作、注入时钟与期限配置的类型。`src/testing/` 是测试入口：`double.ts` 是参考替身，`controls.ts` 是可控时钟、期限配置与记录库故障，`contract.ts` 是契约测试套件，`time.ts` 是替身的期限加法。[内部设计](docs/internals.md)维护机制与流程。

## 配置与运行

本包不读环境变量，不创建进程。包根入口不创建账号、凭证或时钟。测试入口的参考替身只在内存中创建账号与登录。时钟与登录期限配置都由调用方注入，没有默认值。进程内权威的登记属于一份已加载的模块：主体经过 JSON、结构化克隆、worker 消息或另一个进程后不再带有签发。

## 验证

单元与契约测试从包名导入公开入口，所以同时检查 `dist` 能被独立消费。Cordis 测试使用真实 Context 和测试子类，另用打包制品验证消费隔离。本包没有存储、应用服务或用户旅程，未进行完整服务端端到端验证。`TenantStandingSource` 没有生产实现，测试仅检查读数委托，真实提供者须自测。

| 文件                                             | 覆盖                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `tests/principal.spec.ts`                        | 签发两种主体、拒绝的输入、畸形输入不抛出、核验、手写副本与 JSON 往返                     |
| `tests/principal.spec-d.ts`                      | 不带租户的代租户行事主体、带租户的系统主体是类型错误                                     |
| `tests/qualification.spec.ts`                    | 具名资格清单、默认团队映射、别的模型与未列出的角色                                       |
| `tests/public-entry.spec.ts`                     | 公开导出清单                                                                             |
| `tests/testing-entry.spec.ts`                    | `./testing` 的导出清单                                                                   |
| `tests/operations-contract.spec.ts`              | 契约测试套件在两组配置下对参考替身全部通过，套件对逐条故意违反的提供者报告失败           |
| `tests/operations-double.spec.ts`                | 替身的截止时刻来自注入的时长、闰秒限制、失效登录不恢复、端口抛出与诊断不含秘密、可控时钟 |
| `tests/operations-scenario.spec.ts`              | 只经包入口完成注册、登录与识别                                                           |
| `tests/operations.spec-d.ts`                     | 三项操作结果种类的类型正反例                                                             |
| `tests/cordis.spec.ts`、`tests/cordis.spec-d.ts` | 四个服务定义的真实注册、委托、撤除及原接口类型，复用 Operations 契约套件                 |
| `tests/cordis-package.spec.ts`                   | 打包制品的根入口隔离、`./cordis` 实际消费及类型正反例                                    |

在仓库根运行 `pnpm turbo run test --filter=@omne-harness/identity`。turbo 先构建依赖与 `dist`，再运行测试。本目录里的 `pnpm test` 不构建。

## 维护

改公开形状先改 `src/`，再同步 SPEC ID-16 或 ID-17、本页与消费者。三项操作的真实提供者用 `checkIdentityOperationsContract` 检查自己，并另行证明持久与恢复。当前消费者是 `packages/identity/authorization`。实现当前资格读口的提供者按 SPEC 的条款写自己的资源、失败与持久责任，不另写一份公共保证。

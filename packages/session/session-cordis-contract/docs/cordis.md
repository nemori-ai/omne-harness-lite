# Session 的 Cordis 定义

本页是 Session 这一接缝的 Cordis 定义正文：服务键、抽象 `Service`、intercept 配置、端口服务键、事件、依赖分类，以及它们怎样符合 IC 约定。性质编号指本成员 [SPEC](../SPEC.md#唯一性) 的性质 1 至 7。四个面的领域行为归 [session-contract SPEC](../../session-contract/SPEC.md)，机制归 [session](../../session/README.md)，Service 实现、注入与扫描者绑定归 [session-cordis](../../session-cordis/docs/cordis.md)。共同集成规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)，四个运行成员之间的共同生命周期归[运行契约集成](../../../../docs/architecture/runtime/runtime-contract-integration.md)，本页不复制。

现状：`src/cordis.ts` 导出下文的服务定义，`src/index.ts` 只重导出契约类型。被替代的两个端口键不定义，见[被替代的协议](../../session-contract/SPEC.md#被替代的协议)。机制事实按已采用的 Cordis 4.0.4 核对。有 basis 条目的写条目链接，只有源码读数的标明「源码读数」。

## 服务定义

| 定义 | 形状 | 依据 |
| --- | --- | --- |
| 服务键 | `session`，只由 `SessionService` 的 `static readonly provide` 给出。`./cordis` 导出的键常量取自它 | 性质 1，[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) |
| 抽象类 | `SessionService extends Service`，以 `work`、`management`、`reconciliation`、`history` 四个属性暴露契约根入口的四个面，类型取自 `session-contract` 的 `SessionFaces<P>`，同一组签名不写两份。主体类型 `P` 由应用装配选用的身份适配器确定，服务仍在运行时核验每次调用的主体 | 性质 2，[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) |
| 类的 JSDoc | `@owner packages/session/session-contract` | 性质 2，[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) |
| intercept 配置类型 | `{ caller: SessionCallerClass }`，`SessionCallerClass` 取自契约根入口 | 性质 4 |
| 事件 | `session-cordis-contract/committed`，模式 `parallel` | 性质 5，[IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11) |

四个面挂在同一个键上，是因为它们共享同一条权威提交序列与同一组构造依赖；按调用方切分由面与每个操作允许的调用方类表达，不由服务键表达。

## intercept 配置与调用方类

调用方插件用对象形式的 `inject` 声明自己以哪个调用方类调用：

```ts
export const inject = {
  session: { caller: 'intake' },
}
```

对象形式仍然是必需依赖。对象里的值只是给这项服务的 intercept 配置，不是「可选」标记（[inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md)）。服务方法用 `this[Service.resolveConfig]()` 取得配置；服务方法里的 `this.ctx` 是调用方的上下文（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)），所以不同调用方插件各自取到自己的配置。这一点现在是源码读数，见[机制读数与假设](#机制读数与假设)。

| 调用方类 | 典型调用方 | 主要调用 |
| --- | --- | --- |
| `intake` | 受理入口的适配插件、宿主接入 | 受理、会话管理与控制操作 |
| `coordinator` | Agent 提交参加者与事件消费插件、Model 与 Tool 的消费适配插件 | 推进、消息记录、保管与消费操作，按生产者事实写入的 `receive`、业务分支的 `accept`，以及 Tool 冻结判定的 `freeze` |
| `maintainer` | 恢复扫描、待决认回、级联推进、控制重放、空闲取证与自动归档 | 恢复用到的推进与保管操作、控制、`receive`，以及只开放给它的待对账扫描、系统作用域的引用查询 `references` 与已释放作用域列表 `releasedScopes`、空闲取证与自动归档裁定 |
| `reader` | 历史读取者、Request Context 的历史源对接插件、人读界面 | 历史读取，含 epoch 视图读取 `readModelView` |

调用方类按操作授权，不按面授权。每个操作允许哪些调用方类，以 [session-contract SPEC](../../session-contract/SPEC.md) 的四面操作表为准；本表只给概览。一个操作可以允许几个调用方类，例如 `receive` 允许 `coordinator` 与 `maintainer`，`queryOperation` 允许任一变更调用方类。调用方类是装配事实，不是资格授予（[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。服务把配置里的调用方类与该操作允许的调用方类核对，不在其中即拒绝；这条核对是一致性检查，不计为访问控制。访问边界是每个操作的调用资格。经 `ctx.get` 现取服务的调用方没有这份配置，调用被拒绝，所以调用方必须用对象形式 `inject`。

## 端口服务键

七个构造依赖端口、两个出站端口与内部主体各有一个服务键，共十个；下表另列两个已被替代、不再定义的键。接口归 `session-contract`；键与抽象类归本成员；抽象类名为端口名加 `Service`，`static readonly provide` 只在定义类声明（性质 3）。

| 键 | 端口 | 谁提供 | 怎样取得；缺席时 |
| --- | --- | --- | --- |
| `sessionTransactions` | `SessionTransactionPort` | [session-storage-sql](../../session-storage-sql/README.md) 或其他存储提供者 | 进 `inject`，与内部主体同为必需依赖。缺席时 Session 服务停在 `PENDING` |
| `sessionPrincipals` | `SessionInternalPrincipals`：本组协调器与调度器提交命令时用的内部主体 | 应用装配（维护拥有者签发） | 进 `inject`。缺席时 Session 服务停在 `PENDING`，不启动任何协调器 |
| `sessionIdentity` | `SessionIdentityBridge` | [session-adapters](../../session-adapters/README.md) | 按调用现取。缺席时变更操作返回 `unavailable`，读取照常 |
| `sessionEvidence` | `SessionEvidenceBridge` | session-adapters | 按调用现取。缺席时只有需要该材料的命令返回 `unavailable` |
| `sessionClock` | `SessionClock` | 应用装配 | 按调用现取。缺席时空闲取证与等待返回 `unavailable` |
| `sessionIdleInput` | `SessionIdleInput` | session-adapters | 按调用现取。缺席时空闲维护与裁定返回 `unavailable`，不阻断读取与控制 |
| `sessionContextInput` | `SessionContextInput` | session-adapters | 按调用现取。缺席时创建、声明修改与推进采用返回 `unavailable` |
| `sessionNotifier` | `SessionNotifier` | 应用装配或 session-cordis | 每次提交后现取。缺席或失败不回滚提交 |
| `sessionAgentDrive` | 驱动 Agent 的出站端口 | session-adapters | 按调用现取。缺席时推进、续入、恢复、控制传播与迟到结果记录的出站调用不发出，任务保留，由调度器重放；预热在 Agent 入口定义前不调用 |
| 已被替代的 `sessionDeliveryRelease`（已被替代） | 已被替代的 `DeliveryReleasePort`（已被替代）：向 Model 或 Tool 发出交付责任解除 | session-adapters | 按调用现取。缺席时结果的 `release` 保持 pending，恢复协调按 `pending(release)` 找回后重发 |
| `sessionScopeRelease` | 作用域释放的出站端口 | session-adapters | 按调用现取。缺席时释放任务保留，按策略重试 |
| 已被替代的 `sessionToolStartFence`（已被替代） | 已被替代的 `ToolStartFencePort`（已被替代）：请 Tool 让启动资格失效并读回是否已生效 | session-adapters | 按调用现取。缺席时控制进度保持传播中，启动资格失效任务保留，不声称新发起已被阻止 |

事务端口与内部主体进 `inject`：没有事务端口任何读写都不成立，没有内部主体本组的协调器与调度器不能提交命令。内部主体是应用装配交付的运行时对象，按 [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 经服务键 `sessionPrincipals` 提供，不放进插件配置。其余端口按调用用 `ctx.get` 现取，使一个端口缺席只影响需要它的操作，不让整个服务停下（[ctx-property-is-not-ctx-get](../../../../.meta_harness/design/basis/cordis/ctx-property-is-not-ctx-get.md)）。各端口缺席时的契约表现以 [session-contract SPEC](../../session-contract/SPEC.md) 的端口表为准。

出站端口的接口在契约成员（本域只说自己要什么），键在本成员，实现在 session-adapters，由 session-cordis 注入。session-cordis 与 session-adapters 之间没有编译期依赖，靠这两个键在装配时接上。

Tool 宿主协调者调用的 `ToolResidencyReader` 与 `ToolResidencyActions` 不在上表。它们是 Tool 声明的端口，形状与服务键归 Tool 契约，session-adapters 以本组的 `references` 与 `freeze` 实现并登记提供者（[由本组实现的 Tool 端口](../../session-contract/SPEC.md#由本组实现的-tool-端口)）。

## 事件

`session-cordis-contract/committed` 是本成员唯一的事件。名称的范围取声明它的包名，事件部分用过去分词（[IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10)）。`./cordis` 增补 `Events`，JSDoc 写 `@mode parallel` 与载荷各项的 `@param`（[IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11)）。模式与另外三个运行成员的通知一致，见[运行契约集成的事件与作用域](../../../../docs/architecture/runtime/runtime-contract-integration.md#事件与作用域)。

| 项 | 内容 |
| --- | --- |
| 载荷 | 租户、会话身份、会话修订、原提交证据、本次提交的事件种类集合。不带消息正文、凭据或附件地址 |
| 含义 | 只是唤醒提示，不是事实源。修订与原提交证据取自该次提交的原回执，重试保持原值；先提交的通知晚到时仍带它自己的修订，不拼接最新快照 |
| 监听者 | 派发方在提交之后派发，不等待监听者完成。监听者失败只记录诊断，不改变已提交的结果（[IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12)） |
| 过滤 | 监听者按载荷里的租户与会话身份自行过滤，数据动作再按调用资格核权 |
| 丢失 | 不影响正确性。调度器按权威扫描补查 |

## 依赖分类

| 依赖方 | 怎样依赖 | 换代或缺席时 |
| --- | --- | --- |
| 调用方插件 | 对象形式 `inject: { session: { caller } }`，用定义包导出的键常量或字符串字面量（[IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)） | 提供者换代时插件体先卸载再重跑（[plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md)）。在途操作按原操作身份认回，不因重跑换身份 |
| 端口提供插件 | `extends` 对应的端口抽象类，不另写键 | 事务端口卸载时 Session 服务停在 `PENDING`；其他端口卸载时只有需要它的操作返回 `unavailable`。已提交的业务事实不变 |
| 只监听唤醒的一方 | 不 `inject`。用 `ctx.on` 监听事件，类型增补用 `import type {} from '@omne-harness/session-cordis-contract/cordis'` 取得（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)） | 提供者不在场时没有唤醒。正确性不依赖唤醒 |
| 提供者 [session-cordis](../../session-cordis/docs/cordis.md) | `extends SessionService`，不另写键，不自己 `ctx.provide` 这个键（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)） | 不适用 |
| 只需要契约类型的包 | 从 [session-contract](../../session-contract/README.md) 根入口 `import type`。不需要本成员 | 不适用 |

依赖方只引用本成员与契约成员，不导入提供者的实现入口（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。提供者选择归应用装配。

## 靠装配兑现的保证

每个租户同一时刻只有一个恢复扫描者，这一条第一版靠装配单实例兑现：应用装配只装一个 session-cordis 提供者并在其中绑定扫描者。跨进程的第二道保护是操作幂等与 Agent 的条件提交围栏，不是锁。租约接口预留，换成多实例前须先定义租约协议（[IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19)）。

## IC 符合性映射

| 规则 | 本成员怎样符合 | 现在的证据 |
| --- | --- | --- |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次 | 每个键只在对应抽象类的 `provide`，键常量取自它，提供者 `extends` 不写键 | `src/cordis.ts` |
| [IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) 抽象 Service 与 `@owner` | 抽象类的属性取契约类型，JSDoc 写 `@owner packages/session/session-contract` | `src/cordis.ts` |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关 | 根入口只重导出契约类型，Cordis 定义只在 `./cordis` | `src/cordis.ts` |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) 一个 isolate 标签一个提供者 | 本成员每个接缝只定义一个键。重复装载的处置归提供者 | 归 session-cordis |
| [IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11) 事件 | `session-cordis-contract/committed`，在 `./cordis` 增补 `Events` | `src/cordis.ts` |
| [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 登记即效应 | 本成员不定义登记操作。提交参加者的登记归登记它的适配插件 | 归 session-adapters |
| [IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17) 作用域不是 Context 或 isolate | 租户与会话是操作参数，不为会话建 fiber 或 isolate | `src/cordis.ts` |
| [IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18) 租户是参数 | intercept 配置只声明调用方类，不授予资格 | `src/cordis.ts` |
| [IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19) 靠同进程成立的保证写明兑现方式 | 见[靠装配兑现的保证](#靠装配兑现的保证) | `src/cordis.ts` |

## 机制读数与假设

| 机制 | 依据 | 支撑 |
| --- | --- | --- |
| 服务方法里的 `this.ctx` 是调用方上下文 | [service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md) | 性质 4 |
| 必需服务换提供者，插件体重跑 | [plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md) | 依赖分类 |
| `inject` 没有可选形式 | [inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md) | 性质 4；通知能力因此不进 `inject` |
| isolate 只隔离实例可见性 | [isolate-hides-instances-not-data](../../../../.meta_harness/design/basis/cordis/isolate-hides-instances-not-data.md) | 性质 6 |

对象形式 `inject` 的值到达服务方法的 `this[Service.resolveConfig]()`，不同插件各自取到自己的值：这一条只有源码读数，与 [Runtime Context 的同一条候选](../../../context/runtime-context-cordis-contract/docs/cordis.md#机制读数与假设)共用一个待补的 probe。补齐之前，性质 4 是假设，不是已核验的保证。Cordis 升版时，先按 IC 约定重跑相关 probe。

## 验证义务

本成员自己验证：根入口没有运行导出，也不导入 `@deepseek-ai/cordis`；`./cordis` 不导入任何提供者（性质 7）；每个导出的键常量等于对应抽象类的 `provide`。

继承这些定义的提供者验证：两个调用方类的插件各取到自己的配置，调用方类不在操作允许的范围内时被拒绝；事务端口缺席时服务停在 `PENDING`，其他端口缺席只影响需要它的操作，通知能力缺席不阻止提交；事件载荷不含正文。这些义务归 [session-cordis](../../session-cordis/docs/cordis.md)。

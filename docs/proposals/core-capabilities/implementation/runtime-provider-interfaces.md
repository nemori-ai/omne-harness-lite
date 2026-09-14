# P2 运行提供者与最小装配接口候选

状态：待审技术设计；尚未接受、尚未实现。基线 `61e732b979098f568ccd5d21d21939ff0c5036c4`。
本稿的首个提交先固定相邻设计消费的服务键及归属，生命周期与验证随后补齐；
这个中间稿不能作为产品开工或运行就绪的依据。

## 边界与输入

本稿只把已接受的 TG/AU/BG、AR/SR 逻辑接口映射到具体 Cordis 提供者和
`apps/local-harness` 的最小装配。沿用 [治理接口](governance-interfaces.md)
`058c77c`、[Session/Agent 接口](session-runtime-interfaces.md) `cd16f1`、
[共享接口](shared-interfaces.md)、[D-005](../../../decisions/D-005-agent-runtime.md)、
[D-007](../../../decisions/D-007-runtime-composition.md)、
[D-008](../../../decisions/D-008-core-capabilities.md) 与
[D-010](../../../decisions/D-010-shared-diagnostics.md)。逻辑端口、数据形状和状态机
保持原归属，本稿不复制第二套声明。

目标和验收沿 [scope](scope.md)、[最小运行基线](runtime-baseline.md)、
[acceptance](acceptance.md) 及 [plan](plan.md)；完整 M1/M2 仍未交付。
TL/HD/local-execution 由并行技术稿拥有，本稿只给它们可消费的相邻提供者。
维护规范、skills 和长期包设计归属继续由另一会话处理。

## 最小服务键与公开归属

下表是候选实现映射，所有新入口须由所属包在默认公开入口导出并实际验证。
现存 `/baseline` 入口不是目标应用的隐式后门；类型引用沿各包实际公开源码，
实现前本表只表达必须交付的符号与职责，不声称已有对应 TS 签名。

| Cordis 服务键 | 提供插件 / 默认公开入口所有者 | 服务内容与边界 |
|---|---|---|
| `omneDiagnostics` | 应用 `SharedServicesPlugin`；类型与 factory 归 `@omne-harness-lite/diagnostics` | D-010 的受限 `Diagnostics`；关闭/配置管理面只在应用宿主持有 |
| `omneAdmission` | 同一应用 `SharedServicesPlugin`；类型与 factory 归 `@omne-harness-lite/admission` | 唯一 `AdmissionCoordinator`，包含 `RecordPreparation`；不暴露 `AdmissionHost`、writer 或 `createUseIssuer` |
| `omneIdentity` | 应用 `IdentityPlugin`；身份消费协议由 `@omne-harness-lite/tenant` 默认入口声明 | 本机真实认证发行与当前检查，兑现治理稿的 `AuthenticatedInvocation`；不拥有成员、对象权或 grant |
| `omneTenant` | `TenantPlugin` / `@omne-harness-lite/tenant` | TG 已接受管理与资格端口；引用清单通过受信注册面进入，缺失不是空清单 |
| `omneAuthorization` | `AuthorizationPlugin` / `@omne-harness-lite/authorization` | AU 设置/grant/声明/四值判断端口；当前 Session、绑定、资源及一次决定事实分别注册，不 hard inject 反向依赖方 |
| `omneBudget` | `BudgetPlugin` / `@omne-harness-lite/budget` | BG 管理、联合预留与原 attempt 结算；可信费用来源按原 owner 注册 |
| `agents` | `AgentRegistryPlugin` / `@omne-harness-lite/agent` | AR 唯一 Registry、Factory 精确贡献与受限活体操作；沿用现有键，直接演化 fork，不并挂 baseline registry |
| `omneSession` | `SessionPlugin` / `@omne-harness-lite/session` | SR 已接受操作、attachment、委托/工作事实及引用清单；长期根不由临时 Agent Fiber 拥有 |
| `omneSessionProjection` | `SessionProjectionPlugin` / `@omne-harness-lite/session-projection` | SR 授权读取所消费的版本化派生视图；无独立正文披露权或准入权 |

不提供 `omneRecords` 服务键：records 是纯端口/codec 包，准备面已经由
`omneAdmission` 提供。受信恢复 owner 经自己的 factory/options 获得受限
`RecordReader`，普通业务/工具 body 不取得完整 reader 或 writer；这项装配
输入不伪装成另一种记录能力。`createJsonlProvider(options, diagnostics)` 和
`createAdmissionCoordinator(writer, diagnostics)` 的真实 factory 仍沿共享稿，
由应用调用一次后桥接受限服务，不把 codec/data 插件化。

TG/AU/BG/SR 的权威由各自 `createTenantHost`、`createAuthorizationHost`、
`createBudgetHost`、`createSessionHost` 创建；AR 由 `createAgentHost` 创建。
这些候选默认导出属于各自包。应用保有 host 的恢复/关闭管理面，操作插件只挂
受限运行面；同一个 host 可附着多个消费 Context，但不能创建第二份权威。
host 不是通用状态容器，各自仅能执行原稿具名状态转移。

`@omne-harness-lite/session-persistence` 导出候选 `recoverSession`，消费 reader、
同一恢复水位与 Session 的 decoder/fold；不增加 Cordis 服务或另一份持久提交。
Factory/驱动是向 `agents` 注册的贡献，没有额外全局 Factory 服务键。
scope 继续复用自有 `@omne-harness-lite/scope` 的协议；Context 可见性、scope、
Fiber ACTIVE 和 initiator 都不能发行认证、授权或工作许可。

各 host 的受信事实注册/参与者管理面只交给装配指定的 link 插件，不放在上述
普通服务表面，也不交给用户/工具。TL/HD/local-execution 可沿其 own state host
存续；AU/BG 失联时关闭新动作，原请求、调用、执行与清理仍归原 owner。

## 尚待本稿补齐的实施门

需要在本稿完整版本固定：每个插件的实际 inject 与资源所有权；恢复后发布顺序；
事实 link 的双端准备/同门 current/撤除顺序；身份撤回；Registry/Factory/attachment
的独占与代次；计划退出和突然失联的原责任；应用启动至原 Step 接续的完整链；
固定 Cordis 4.0.2 与 DSH `c291e796` 的证据、实际机制检查和未运行的产品场景。
这些门未闭合时，服务键确定不等于可以进入对应实施。

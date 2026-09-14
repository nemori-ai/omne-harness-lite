# Tenant 提供者设计

状态：从受审 `5ffba4bb55aa9514ebd7f3c2b48f0d26fc9a8e18` 迁入的当前候选，
尚待主调度接受；本目录尚无目标产品实现，设计文件不建立 workspace 成员。
来源、检查与采用边界见[原施工入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)。

## 契约与公开面

采用 [TG v1](../../../spec/capabilities/tenant-governance/v1/contract.md) 的
TG-01/02/04/05、[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md) 与
[work-data v1](../../../spec/data/core-work/v1/contract.md)。TG-03 后置。
状态、事件、操作结果及管理/资格端口沿已接受
[治理接口](../../../docs/proposals/core-capabilities/implementation/governance-interfaces.md)
`058c77c`，不在本文另定义。

候选默认公开入口 `@omne-harness-lite/tenant` 拥有 `createTenantHost`、
`TenantPlugin`、`IdentitySource`/`AuthenticatedInvocation` 消费协议及
`registerReferenceSource` 管理面。精确签名在所属公开源码建立后以其为准；当前
不存在可供应用调用的目标源码。跨包数据直接用 work-data/records 的公共类型。

TenantHost 是本域 TG 状态权威，按 tenant 分区维护原 logical/durable 根及当前
引用来源，不输出可变根。应用只创建一次并保有恢复/关闭面；对同一 coordinator
重复创建拒绝 `authority_already_bound`。这个同一部署/同一产物的防错不代替
真实 writer 排他。第二 Context 只能挂原 host，不能重新发号或建个人租户索引。

身份协议归本包声明，由[应用身份适配](../../../apps/local-harness/design.md#身份与宿主装配)
发行实际调用依据。私有 invocation 在每次 GateFrame 重认 principal、credential
修订和当前可用性；DTO、readonly、tenant 字段与 Context 不证明认证。TG 才
解释当前成员、joinedRevision、引导与列名管理权；租户管理权不隐含 Session 正文权。

## 插件、当前检查与引用来源

`TenantPlugin` 提供 `omneTenant`，required inject 为 `omneAdmission`、
`omneDiagnostics`、`omneIdentity`。options 只接受受信装配的原 TenantHost；
apply 不创建权威。恢复相同已验证 Watermark 的 TG decoder/fold/操作记录完成，
且身份来源就绪后，才 `ctx.provide` 受限管理/资格面。缺 SR/TL 引用来源只关闭
需要完整清单的操作，不等待所有未来能力才发布整个服务。

在受信 `apply(c)` 捕获 `c.fiber` 和 host 发出的本次 mount generation；
`ctx.plugin()` 返回的 PromiseLike 外壳只用于 await/dispose，不能凭
`symbols.original` 或 uid 猜测它与 status 参数的身份。宿主生命周期观察分派
到本 host 的关闭入口；最终 check 同门核原挂载/来源 stamp、捕获 Fiber 及所有
必需 provider 当前代次/存活性，不只查仍 ACTIVE 的消费者。每次 apply 创建新
mount generation，同 Fiber 重载不恢复旧闭包。UNLOADING 后 effect 尚未开始
的窗口也拒绝旧候选；存活检查之后仍须
真实认证、成员、定义/权益/选用及本次操作资格，绝非 Fiber ACTIVE 即许可。

`registerReferenceSource` 只交受信 link，输入为已开放 source kind/适用范围、
精确来源代次和治理稿的 `prepareReferences/checkReferences`。SR 的提供实现
由 [Session](../../session/session/design.md) 拥有；TL 由其真实 owner 兑现。
来源与 TG 必须使用同一 coordinator：门外准备双方，门内登记两端精确关系及
stamp，门外通知。link 在 LOADING 时只登记 held，正常 check 等本代双方和
link 可用；任何部分失败只撤自己已登记的关系。

来源不明/恢复未完/撤除时返回 `unavailable/complete=false`，不当空集合。
只有已封闭该范围所有引用创建、并证明来源不适用时才列为不适用。SR/TL 增引用
与 TG discard/retire/disable/remove 同门检查原 stamp；TG 不反向 import 或
required inject SR/TL，也不从查询 projection 推断无引用。

## 装载效应与撤除责任

| 建立的效应及可见时点 | 拥有者、撤除与完成判据 |
|---|---|
| 恢复后的 `omneTenant` 挂载、普通监听/订阅 | 当前插件拥有本次注册；撤代先关本代新调用，再由 effect 撤精确注册。其他 Context 挂载与长期 TG 根保留 |
| source 登记/held 准备 | 原 link 及 TG host 持有精确 registrationId/generation；retire/inspect/waitReleased 认回原关系，旧 disposer 不能撤新 source。来源失联不删除业务引用 |
| owner_change 候选、原操作结果与审计 | TG host 保有；逻辑撤权立即约束新准入，正向权利等耐久。操作 Fiber 卸载不撤销已提交事实，也不移除 pending/unknown 责任 |

关闭等待可取消，原关闭继续；清理失败以原残留/诊断保有。facade 重挂只向同一
host 开放已就绪范围，旧 mount 能力不复活。替换 host 本体须关闭新工作、排空
pending publication、冻结完整 durable 水位并确认原资源释放后恢复切换；原 host
未释放拒绝第二权威。P1 失联关闭新提交，不能把未耐久控制/未知结果报为成功。

## 实施与验证范围

先完成真实 P1 组合，再按原治理 T1–T5 实现管理、双视图和恢复，随后接实际
身份/SR/TL link。allow 基线需要 A01–03/A11 的当前资格与 S01/S15–17 相关
切片：真实双凭据隔离、成员重加不恢复旧权、create 重试认回原 ID、准备后撤权、
SR 引用与 TG 撤选交错、来源突然失联。仅测内部 Map 次数不能通过。
当前这些产品测试未运行；[三项 Cordis 机制证据](../../../docs/proposals/core-capabilities/implementation/evidence/runtime-provider-design/README.md)
只支持内核时序，不证明本 host 已实现。

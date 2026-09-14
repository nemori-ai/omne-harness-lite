# Authorization 提供者设计

状态：`f98ac926` 映射及评审消歧已接受为最小运行基线施工输入；目标包尚未实现。
[来源入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)
保留完整历史修订与检查。当前服务于 allow 最小基线，完整 HD 运行后置。

采用 [AU v1](../../../spec/capabilities/action-authorization/v1/contract.md)、
[TG v1](../../../spec/capabilities/tenant-governance/v1/contract.md)、
[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md)。设置/grant/声明、
四值矩阵及事件以[治理接口](../../../docs/proposals/core-capabilities/implementation/governance-interfaces.md)
`058c77c` 为已接受实施依据；Session 权限事实沿
[Session 接口](../../../docs/proposals/core-capabilities/implementation/session-runtime-interfaces.md) `cd16f1`。

## 提供与依赖

候选默认入口 `@omne-harness-lite/authorization` 导出 `createAuthorizationHost`、
`AuthorizationPlugin` 及下面具名事实管理面。目标公开源码尚未存在，本文不另写
TS 签名。包依赖 TG/data/records/admission/diagnostics 的公开入口；AU 不 import
SR/TL/HD 实现，不为声明纯数据另建插件。

AuthorizationHost 持有本域按租户分区的设置/grant/解析声明、logical/durable 根、
原操作与当前事实源；应用单次创建并保有恢复/关闭面，同一 coordinator 重复
创建返回 `authority_already_bound`，第二 Context 复用原 host。插件仅挂运行面。

`AuthorizationPlugin` 的 service key 为 `omneAuthorization`；required inject
是 `omneAdmission`、`omneDiagnostics`、`omneIdentity`、`omneTenant`。恢复 AU
decoder/fold/审计/原操作至同一水位后才 provide。业务特定来源尚缺时，该操作
返回 unavailable，不能用声明存在或“可信工具”推导 allow，也不让可用管理面
等待尚未开放的 HD/模型功能。

apply 捕获真实 `c.fiber` 与 host 的 mount generation，service 闭包绑定原挂载；
不把 ctx.plugin 返回的等待/卸载外壳当真实 Fiber。宿主观察器先调用 AU 的具名
关闭门推进 stamp；末门同时核挂载、所有必需 provider 及各事实 source 当前
存活/代次，覆盖 consumer 仍 ACTIVE 而 provider 已失效、effect 异步清理窗口。
每次 apply 新建 mount generation，同 Fiber 重载不复活旧闭包；之后独立核
身份/TG、当前模式/grant、硬权限和精确 Action。

## 具名事实源与无环组合

以下管理面仅交装配指定的 link；普通 `omneAuthorization`、用户及工具 body
拿不到它们。接口内容沿上述逻辑稿，不复制 Action、Decision 或 grant 定义。

| 本包拥有的注册符号 | 真实来源与末门责任 |
|---|---|
| `registerSessionFacts` | SR prepareSessionFacts/checkSessionFacts：原 owner、settingsUser、subjectDefinition、acquisition、对象操作/Run epoch。SR 只查自身/TG 事实，不递归向 AU 求模式 |
| `registerActionFacts` | TL 的原冻结 Action、实际 Binding/声明/参数与版本；TL 的 check 不反调用 AU |
| `registerResourceFacts` | 真实资源 owner 的对象权、硬限制、可授予上限和当前根；缺失不是默认具有资源权 |
| `registerDecisionFacts` | HD 的原决定、消费/关闭状态和 grantorBasis；AU 核当前硬资格，HD 核原决定和消费，两者由具名组合分别准备/同门检查 |

[SR link](../../session/session/design.md#链接与当前资格) 同时把 SessionFacts 登记给
AU、把 AU 当前配置面登记给 SR；工具/资源/HD 的 link 由其原 owner 实现。
各方门外准备、同一 coordinator.enter 登记双方精确 host/source/registration/
generation/范围与 stamp，最后门外通知；LOADING 只持 held，不能半边开放。
retire/inspect/waitReleased 只控制本次注册，任何失败/旧 disposer 不清别人新登记。

**重载消歧**：失效的是旧 `DecisionFacts` 私有候选和运行句柄。未消费、未关闭
的耐久批准历史仍归 HD 保留，当前 HD owner 可重新发行候选并按当前资格重检，
只供原 Action；普通 AU 或 link 重载不自动取消批准。批准不是持久 grant，
重建候选也不让已消费/已关闭/不匹配 Action 的决定重新执行。当前 allow 基线
可不装完整 HD；一旦判断为 ask，缺真实 HD 路径须具名不可执行。

## 装载、撤除与保有

| 效应 | 撤除及不可丢失的责任 |
|---|---|
| 恢复后公开服务、普通监听 | 本次 Fiber 撤自己的注册；先单调关闭 mount。旧 facade 不追随新代；AU 根、原结果和审计不随之删除 |
| 事实源/解析器受管登记与未交接准备 | 原注册的 owner 清理、保有晚到准备；来源撤代立即使相应新判定 unavailable。当前 stamp 不由 TS brand 或缓存版本号代替 |
| 设置/grant 修订和判断审计 | AU host 沿原 owner_change/组合批提交，保留 pending/unknown。撤权 logical 立即约束，正向权限等 durable；应用/link 不补写 grant 或判断状态 |

AU 失联关新的授权/作答资格，已准入动作由 SR/TL/执行控制合同收口；不把失联
解释为用户 cancel。清理/事实通道不冒用失效授权去启动新工作。facade 重挂复用
原 host，host 本体更换必须先排空、确认清理/合法移交和完整水位；残留具名
retained，不能建空 host 掩盖。真正资源清理按一个有序过程等待，disposer 返回
或超时不能证明业务停止。

## 实施门

真实 P1、TG/身份与资源事实先通过，按治理 U1–U5 推进真实 grant/amend/revoke、
set/clear/readEffective、声明解析及当前判定。allow 基线必须覆盖 A01/A03/A11、
S01/S16：同租户管理者无正文/设置权、准备后撤权、缺来源、重载旧候选、同操作
冲突和重启恢复。HD 当前候选重发/唯一消费作为后续接口符合性要求保留，不将
完整双入口审批变成本会话新硬门。当前产品组合未运行，原机制探针不抵扣。

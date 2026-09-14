# Session 提供者设计

状态：受审 `5ffba4b` 的当前映射迁移候选，尚待接受。现有
[src/index.ts](src/index.ts) 为 `/baseline`，目标默认入口及真实 SR 产品尚未交付。
[来源入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)
保留历史、采用范围和检查；当前实施终点为 allow 最小基线。

采用 [SR v1](../../../spec/capabilities/session-run/v1/contract.md)、
[identity v1](../../../spec/data/agent-runtime-identity/v1/contract.md)、
[CD v1](../../../spec/data/core-work/v1/contract.md)、
[CB v1](../../../spec/compositions/agent-session-binding/v1/contract.md)、
[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md)。逻辑操作、事件/fold、
对象权限、Step/DriverClaim 与结果接续直接沿已接受
[Session 接口](../../../docs/proposals/core-capabilities/implementation/session-runtime-interfaces.md)
`cd16f1`，治理事实沿 `058c77c`；本文只拥有具体提供者映射。

## Host 与服务

候选默认入口 `@omne-harness-lite/session` 拥有 `createSessionHost`、
`SessionPlugin`、下面三个 link 插件和具名注册面，以及公共事件 decoder/纯 fold。
准确签名由目标公开源码建立，不把现有 append/create/flush 当作符合 DR 的入口。
SessionHost 拥有本域分租户的长期 Session、队列、Run/Step/continuation/control、
当前委托、attachment 与 referenceRevision；不把长期事实放在 Agent Fiber 下。

应用单次创建 host，保有受限恢复安装/关闭与 link 管理能力，同一 coordinator
重复创建返回 `authority_already_bound`。第二 Context 复用原 host，不生成另一
Run/驱动占位。运行发号沿原 writerEpoch/启动命名空间，恢复不反序列化活句柄。
业务只持 coordinator 的窄 RecordPreparation/提交面，完整 reader 只供受信恢复。

`SessionPlugin` 提供 `omneSession`；required inject 是 `omneAdmission`、
`omneDiagnostics`、`omneIdentity`、`omneTenant`、`agents`。options 接已恢复的
原 SessionHost。先由 [persistence](../persistence/design.md) 校验同一 Watermark
的纯 fold/跨记录关系、必需 state contribution/定义/配置兼容性，再 provide。
坏前缀/未知必需事件不默认空；已恢复安全前缀的受权历史读可独立开放，原效果
核实未完则新运行 unavailable。投影可读不证明恢复完成。

## 链接与当前资格

| 本包导出 / required inject | 两端具名关系与失联结果 |
|---|---|
| `SessionTenantLinkPlugin` / `omneSession`,`omneTenant` | 向 TG registerReferenceSource 交 SR 原 ReferenceInventory；SR create/attachment 的引用更新与 TG retire/disable 同门核 stamp。缺来源不能报告无引用 |
| `SessionAuthorizationLinkPlugin` / `omneSession`,`omneAuthorization` | 向 AU registerSessionFacts 交 Session/工作事实，向 SR `registerAuthorization` 交当前配置面；失联关闭相应设置/新 Run/Action，受权读控不因 AU 缺席全部消失 |
| `SessionAgentLinkPlugin` / `omneSession`,`agents` | 向 AR registerSessionProvider 交 RuntimeAccess/SessionAttachment，向 SR `registerAgentRuntime` 交工作/结算面；未登记不能激活/驱动，原收口能力独立保有 |
| `registerProjection` / 无反向 required inject | 由宿主登记 [projection](../projection/design.md) 的只读查询适配/水位/代次；缺失显示 rebuilding/unavailable，不给出额外正文权 |

注册管理面只给受信 link options，不在普通服务、用户/工具 body 上公开。两端
门外 prepare，同一 coordinator.enter 核精确 host/source/mount/registration/
generation 与适用范围后建立；LOADING 只持 held，双方及 link 当前可用才正向
消费。部分装载失败撤原精确登记，retire/inspect/waitReleased 不作用后来新代。

包依赖 TG/AU/AR 的公共消费协议；它们不反向 import Session 实现。SR 的
SessionFacts/RuntimeAccess/Attachment check 只查实际身份/TG/对象/原 attachment
事实，不递归调用 AU 判模式或 AR activate/work。SR 具名组合者分别准备/检查
这些参与者并提交一次 batch；link 不获得业务状态转移权。

每个 apply 捕获 `c.fiber` 与 host 发出的本次 mount generation；ctx.plugin
返回外壳只供控制等待/卸载。生命周期观察推进本 owner 的单调关闭 stamp，
最终 gate 同时检查原 mount/link 和所有 required provider 的代次/真实存活，
覆盖消费者尚 ACTIVE、provider 已 UNLOADING 和同 Fiber 重载两个窗口。
旧 closure 不能因 Fiber 又 ACTIVE 复活；之后仍需身份/TG/SR 对象权、当前 AU
配置、原 epoch/WorkPermit，不以 Context 或 scope 当授权。

## 从文本到原结果

SR 拥有 create/enqueue/takeBatch/acquireNextStep 和原 DriverClaim 的进展/结算。
create 在分配 Session ID 前固定 OperationInput，在当前认证/披露资格内先 lookup，
生成 ID 只进后果；
取批由真实内部派发意图代表原 owner，原队首/成员加入/定义 acquisition 当前
检查通过后，与 AR pin 一次 input_run 批提交。只有 durable ready 才交工作给
确定性 driver，pending/unknown 留原占位，不偷偷取第二批。

TL proposed 与 SR 原 continuation 同批登记；完整 return/yield 后接原裁决 claim，
allow 的联合授权/预算/执行准入由 TL 拥有，deny 回原 Step。原真实结果按当前
接收资格进入原 continuation，再由 SR 串行取得 claim/结算；后来的新决策才新
Step，不把结果当新用户输入。重启先核实原 call/attempt，unknown 不盲目重发。
完整细节及 S18 沿原逻辑稿，应用/driver 没有 append 或直接 setState 权。

独立 TL/HD owner 的原结果/请求不依赖 Agent 活体存续。当前 allow 基线不装完整
审批时 ask 明确不可执行；后续 HD 答复/结果接收仍必须按其所属契约核当前
receiving/control 资格，不因原 adjudicate claim 已交还而遗失合法后果。
普通 AU/link 重载不自动取消 HD 未消费、未关闭的耐久批准；旧私有候选失效与
原历史保留的边界由 [AU](../../governance/authorization/design.md) 维护。

## 装载效应与撤除责任

| 效应 | 撤除/清理与保留 |
|---|---|
| `omneSession` 操作面、普通订阅 | 原 Fiber 撤精确服务/监听；当前披露先重检权限。Session 根/Run/原结果保留在 host，失联不变不存在 |
| 三类 link、projection 与 authoritative contribution 注册 | 原 owner 撤本次 generation；未知/缺失必需贡献关依赖工作。projection 仅关视图，authoritative 撤回先封闭依赖并排空或 busy，记录不删除 |
| attachment/委托/工作账目 | 新工作撤代与原 TG/AR 同门；旧 attachment revoked 不复活，清理能力只处理原实例；AR 确认真实 release 才去原引用，非一条卸载通知即减引用 |
| 已准入 Run、pending publication/控制与接续 | SR host 保有，原 TL/执行 owner 核停止/结果；checkpoint/epoch_parked 和接管确认之后才让 AR settle。没有实际证据不释放 stopping 占位 |

计划 Agent/owner close 按 AR 原协议：关新工作→SR 耐久 checkpoint/封闭旧执行
者→TL 等确认独立保有→AR settle/真实 quiescent→释放。它不是用户 cancel。
cancel/force_stop 的原 epoch/停止墓碑和迟到结果隔离沿 SR/TL，不靠 dispose
或 AbortSignal 证明停止。P1 不可用时可封闭旧运行通道并尽力收口，但不得声称
控制耐久成功。清理失败留原 remaining/诊断，重试原清理不用新 Context 申请资源。

facade 重挂复用原 host；host 本体替换先关新工作、排空 publication/确认清理
或具名移交、冻结完整 durable 水位，再恢复切换。旧权威未释放拒绝第二份。
恢复以新 epoch/委托/AR 许可与当前 TG/身份资格重新成立，不反序列化旧句柄。

## 采用来源与本批验证

保留自有 fork 的有效 scope 路由、快照和纯 fold；直接移除绕门裸写、无代次
贡献和假 flush。官方 Cordis 4.0.2、固定 DSH `c291e796` 与有限机制依据见
[原证据](../../../docs/proposals/core-capabilities/implementation/evidence/runtime-provider-design/README.md)。
真实 P1/AR/TG/AU 类型先固定，然后按 S01–S10/S14–S18 中 allow 基线实际依赖
推进：双租户权限、唯一激活/取批/claim、fsync/回执中断、原 deny/结果恢复、旧
epoch、依赖失联、投影与真实资源清理。S11/S13 的完整 HD/M2 部分留后续规划。
本稿没有运行这些产品符合性测试；共享诊断只记录安全阶段/关联，关键审计仍
在原耐久批，普通日志失败不能覆盖业务结果。

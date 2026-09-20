# D-014：Session、Run 与 Agent 实例生命周期

- 状态：旧谱系架构和有限模型已接受；目标新谱系 v1、提供者及装配分别等待精确采用与验证。
- 来源：`e3573ca72d18bfe7ddd002df5025551b51eede46:docs/decisions/D-014-session-run-agent-lifecycles.md`，SHA-256 `b112d9566ae618cb3af544a5f6b5bf4e0beb5d2734c9df8f9a8c1b6fe14e845c`；来源提案为同修订 `docs/proposals/session-run-agent-lifecycles/README.md#接受记录`，研究背景见[循环/事件/hooks](../../../research/legacy_backup/agent-loop-events-and-hooks/README.md)。
- 接受依据：2026-09-14，任务作者结合独立评审与用户 U-17～U-32 裁决接受三台状态机的权威拆分、组合与 Cordis 边界；原精确对象为 session@1、run@1、生命周期组合@1、CC@2、run-driver@2。需求基线沿 D-012。

## 保留的选择

1. [Session](../../spec/capabilities/session/v1/contract.md)拥有身份、历史、队列和 Inbound；[Run](../../spec/capabilities/run/v1/contract.md)拥有耐久执行状态、Step、epoch 与控制；活体 Agent 拥有实例资源。附着、占位、执行者三条关系及其级联由[生命周期组合 LC-01～09](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)统一描述。占位从已提交 Run 状态派生，不另立事实源。
2. 级联按“能派生就派生；允许中间态则提交后反应；不允许中间态才同提交”选择形状。同提交的行须由同协调域内发布的组合契约逐行声明；[CC-01](../../spec/compositions/core-work-coordination/v1/contract.md)负责共同提交边界，跨域部署前的义务不能当作单机证明。
3. 已提交事实的原完整 envelope 在 publication ready 后广播一次；通知只是提示，反应者在准入门内重读、幂等处理，丢失提示由启动扫描补齐。[LC-06](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)的原 envelope 要求尚未由当前 receipt-only Admission 实现兑现。
4. Session、Run、Agent 实例是独立插件；跨两种状态权威的动作归组合者、裁决者或调度者，不通过插件互相 required inject 抢走状态权威。实例交 Run 时需 ready，退役时驱动器 Yield。

## 精确取代

D-014 取代 D-008 的 `session-run@1`、D-012 的 `session-run@2` 与 `run-driver@1` 的**当前依赖身份**，以及 D-013 provider 表中 `session-run@2` 引用；D-012/013 的其余选择保留。D-015 后来取代 D-014 的 session@1、run@1、生命周期组合@1、run-driver@2 的**旧版本身份**，加入等待登记簿、`superseded` 和工具结算；三台权威、三形状级联与事实广播选择保留。当前 Run 强停终态还须遵守另获用户接受的[RN-05 安全门](../../spec/capabilities/run/v1/contract.md)，不能从旧宽松表达推断 `unverified` 可放行。

旧同域/跨域有限模型仅证明记录的抽象配置；原 envelope handoff、通知过滤、关闭和重启场景及跨域责任仍须按当前规格验证。

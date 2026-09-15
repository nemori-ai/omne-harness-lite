# Agent/Session 实施接口的受审来源

本页保留 `cd16f1` 的实施选择、S-R1–S-R4 反例与接受身份，供重建当时的交接
范围。接受记录归[固定交付](delivery.md#p2-agentsession-施工输入)；后续
`f98ac926` 的 Cordis 映射与消歧另见[映射来源](runtime-provider-interfaces.md)。
当前正文已按以下拥有者迁移，原源码起点、设计接受与产品验证仍分别判断。
迁移源快照为 `7e758f21f8f92c1d46fab194fdaf120239b8e11c` 的本路径；原段落身份
由该固定提交保留，当前接口不再在本页并行维护。

| 原稿范围 | 当前拥有者 |
|---|---|
| AR 激活/附着/工作端口、活体审计与通知 | [Agent](../../../../packages/core/agent/design.md) |
| 数据/事件/纯 fold、对象权限、Step/driver、TL/HD 交接、控制与状态贡献 | [Session](../../../../packages/session/session/design.md) |
| 已确认前缀、恢复顺序及 reader 开放边界 | [persistence](../../../../packages/session/persistence/design.md) |
| 派生视图、投影贡献、查询与撤回 | [projection](../../../../packages/session/projection/design.md) |
| 真实身份/挂载、跨提供者组合与 S01–S18 | [local-harness](../../../../apps/local-harness/design.md#agentsession-原组合场景) |

## 保留的选择与范围

四包分别拥有活体、长期业务事实、只读恢复和可重建投影；Session 不反向 import
persistence/projection，agent 不 import Session/治理实现。受信宿主连接原 owner，
默认公共入口承担目标行为，原 `/baseline` 不作为绕门路径。

原选择限定 text 与确定性工具基线：创建固定原 acquisition；Run/Step/claim/
continuation 不混成一个状态；已提出调用在 allow/ask 前也有可恢复裁决责任。
拒绝、取消、停驻、物理停止、清理和外部未知保持各自事实。这些选择是 S-R1–S-R4
修订的因果背景，完整产品符合性不能由结构检查或源算法测试推出。

## Cordis 与 fork 映射的证据边界

采用官方 `@deepseek-ai/cordis@4.0.2`，不 patch/fork 官方包。DSH 文档/源码固定
`c291e7961a515f6d7af9304e7fd1d257929aef26`；既有发行物完整性与有限运行证据沿
[运行组合来源](../../runtime-composition/sources.md)、[agent fork 验证](../../agent-runtime/fork/review.md)，
Session 原算法/差异沿[来源基线](../fork/session-source.md)。本次阅读了活动 agent
类型/实现与 provenance；没有把源测试称为本稿 AR/SR 实现验证。

官方[生命周期文档](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md)
说明受管 effect/子插件清理及多个异步 disposer 的并发；[既有源码核对](../../../research/cordis-lifecycle-and-tool-composition.md)
进一步定位同修订 fiber/events 的边界。这支持复用资源原语，不能支持“dispose
返回即业务静止”。本稿选择由原 AR/Driver/Session owner 实现收口顺序，最后才
调用实际卸载；这项顺序是 OMNE 契约的实施映射，不是声称 Cordis 有同名事务 API。

source agent 的单字符串键/裸 AgentHandle、可否决 created、Factory slot 撤除和
creator-agent 归属不足以实现本稿；直接改其 registry/factory/dispatch 类型与行为，
保留可用路由/initiator 算法，不保留绕门 create/execute 兼容层。实际 4.0.2 资源
错误/迟到 disposer、依赖丢失、事件重入均由下表真实探针/符合性测试检验；本稿
只沿用既有事实，不声称新退出协议已由源 inspection 证明。

## 作者检查与评审请求

原作者以 `de39a86` 为基线，文档结构与路径检查通过；最终受审对象、九份
原始资产及接受范围由[证据入口](evidence/session-runtime-design/README.md)保留。
这些检查不证明产品符合性。

### 对 746ce47 独立评审的定点修订

本轮 actor `agt-028` 仅处理 R1–R4，治理输入更新为已接受 058c77c/HUB 4bf0d3c；
本稿仍为 proposed，等待原 architecture-reviewer 复核。没有修改正式 v1 或产品。

| 评审项 | 修订定位与最小测量 |
|---|---|
| R1：driver 只会取 Step、不会交付或结算 | “Driver 向 SR 交付进展与结算”“原 Step 的继续与下一次决策”，及 step/claim/失败事件；S14 覆盖无工具、真实结果、q1/q2、失败和同批关闭 |
| R2：遗失原 acquisition | Session/Run shape、其后原选用规则、attachment 和 AU 当前事实；S15 的 a/b/c 同版本与配置/重启反例 |
| R3：Session 设置写权缺失 | “当前调用者、对象权限与运行委托”的设置写/SettingsUser 段及 AU SessionFacts；S16 覆盖 owner、紧急控制者、撤权、set/clear |
| R4：缺 TG ReferenceInventory 提供者 | “SR 提供给 TG 的引用清单”、R2 施工/依赖表；S17 覆盖创建/停用顺序、真实来源缺失及披露 |

S14–S17 是实施必须测量的场景，本轮没有运行产品测试或以自写条件断言替代它们。
文档/范围检查针对该次修订运行，`docs-check-r1-r4.log` 已包含于上述原件归档；
实际 `make docs-check BASELINE=de39a86` 通过 404 份 Markdown，`git diff --check`
及写入范围检查通过。未宣称语言记法可编译，也未自行认定评审通过。

### 对 a58bc7c 复核剩余 R1 的定点修订

本轮 actor `agt-032` 仅补 proposed→裁决→结果交接；R2–R4 及其已复核内容未重写。
新增 prepareProposedCall 的 TL/SR 同批登记与原接续身份，明确 recordStepReturn
交还前提/同批 ready、三路裁决消费 claim、执行前 deny 结果证据及恢复来源。
施工门增加 S18，要求原 Step/Action/CallRef 不变且实际零效果；这些仍是待执行
产品测量，没有运行产品测试、条件断言或额外上游实验。本稿仍为 proposed，
交由原 architecture-reviewer 定点复核，不自行接受。

该次文档/范围检查的 `docs-check-proposed-deny.log` 已包含于上述归档；
实际 `make docs-check BASELINE=de39a86` 通过 404 份 Markdown；`git diff --check`
及允许路径检查通过，仅本页发生受版本控制的修改。检查不证明产品运行或架构接受。

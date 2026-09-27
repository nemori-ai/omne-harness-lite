# model-request-runtime

## v3 候选增量（2026-09-27）

- 语义接受：**runtime3及本节点增量无**；profile3/messages4/response4/directory3由D-070、agent-definition1由D-072、AE4/AM3/AR3/LC4由D-073接受，精确范围沿[catalog](../../../../registry/catalog.json)。runtime3/runner3仍为candidate，接受及实施接续属R3-G1；依赖接受不接受整条runtime。
- 可实施：候选 [v3-design.md](v3-design.md) 的R3-P1～P11覆盖独立invokeModel、十三操作、S-66真实当前授权与捕获配方、S-67默认重试身份/runner消费、精确引用、内容门、结算及观测；源码尚未建包。RT-AR1增补未知opened回执隔离、真实旧写者静止与权威日志恢复，尚待独立机制复审。高风险前置与受阻消费者见R3-G1～G8，未经接受及闭合不进入对应实施；耐久服务缺真实输入不能fallback成功。
- 绑定与证据：本版新增 **0条**；原v2六条形式绑定保留原坐标与模型前提，不当作v3实现证据。新有限模型和原型只按各自输入范围读取。
- 实际验证：**本版源码与真实装配尚无**。本次交付是候选映射和验收义务，不是实现、模型认证或总体交付验收。

当前增量读 [v3-design.md](v3-design.md) 与 [v3验证义务](verification.md#v3-增量证据义务)；以下按原v2日期读取。旧文的历史求值读取、无契约函数结果和seed/整数退避不作为v3施工输入。

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.model-request-runtime · v2`（[契约](../../../../spec/capabilities/model-request-runtime/v2/contract.md)，状态 `accepted`、已冻结）。插件边界、服务键与 inject 边取自 [D-059](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 接受的 model 拆分 A/A/A 的[装配草图](../../../../record/proposals/capability-split-model/design.md#装配草图与切分理由)（P-2、P-5）；与草图不同的四处在 [design.md](design.md#与装配草图不同的四处) 逐条写理由
- 源码位置：`packages/model/model-request-runtime`——尚未建包。第二层 `model` 由 D-059 拍板，布局见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是 `invokeModel`（一次发出，不重试、不回退、不续接）、`TransportAdapter`（`plan`／`send`／`read` 三段；生产实现是独立公开包 [`pi-ai-transport`](../pi-ai-transport/README.md)，D-063 R-5）、`classifyCause`、`redact`、S-10～S-12 的纯判定、`dispatchGuard`、`decideRetry`、`retryDelay`（候选名），不依赖 Cordis、会话、租户或存储；**Cordis 服务面** P-2 复用 `invokeModel`——锚点先写后行、至多一条响应体、跨尝试的发出守卫、对账、所有请求经 OpenRouter 只在这一层成立，函数层不承诺（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：一个包、两个插件。**P-2**（候选插件名 `model-request-runtime`）provide 服务 `modelRuntime`（候选），兑现契约十三个操作；**一次调用是宿主（agent runtime）上的一个 effect，不是 fiber**（草图 N-1）；**P-2 必需 inject `modelTransport`**（改自草图 N-2 的构造参数级内部依赖），生产实现是 pi-ai 定向 fork 节点 [`pi-ai-transport`](../pi-ai-transport/README.md)（[D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md)；基线 pi 0.86.1 `3390bd9`、托管为本仓一个包，[D-063 R-5](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)；节点已立、尚未建包、比较门未过），验收装配以脚本化传输登记同一个键；`statusCauseTable` 初值用那个包导出的 `openRouterStatusCauseTable`。**P-5**（候选插件名 `model-default-retry`）是默认重试件，只向 runner 登记一件系统自带实现（S-35）；退避是策略对象 `retryPolicy`（`kind`／`base`／`factor`／`max`／`jitter`，默认初值在配置层，次数由 S-35 推出；D-060 §八 N-36）。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-5～S-22 与 S-51（概念、贯穿规矩、模型侧装配宿主）、S-24～S-34 与 S-49、S-50（十三个操作）、S-35（P-5）、S-36、S-37、S-38 左列、S-39，逐条落点见 [design.md](design.md#操作落点)。**尚未建包，没有任何实现。**可实施性的阻断（[缺口](design.md#实施缺口与消费者影响)）：会话日志、装配清单、会话持有租户三处**接口已定、真承接者未到**（`capability.session-log`、`capability.assembly-manifest`、`capability.session-tenancy` v2；最小提供者节点 `session-log-jsonl`、`assembly-manifest-store`、`session-tenancy-table` 已立（accepted，只进验收装配）；MRR-N1、N3、N10）——六种记录、判重键与尝试栅栏落在会话日志的 S-8、S-10 上；**契约 G-19 已闭合**（D-063 R-4：`A` 由目录读面直接给），`legalTargets`／`selectModel`／写过切换记录的会话的 `displayList` 解阻，`openCall` 不读求值（S-28 ④）；**「用哪个模型」这项设置的产出方未定（契约 G-20，MRR-N13）**：从没切换过的会话 `effectiveModel`／`displayList` 一律 `unavailable`，新会话在第一次切换之前发不出请求；写过切换的会话，求值读不到才 `unavailable`、求值成功而没有这一项即「没有锁」（契约 S-10 第 2 步），但**读求值结果（锁判、`dispatch` 的两个时限）仍挡在 assembly-manifest G-4（读法未约定，MRR-N3）**；契约 G-8 已闭合（退避是策略对象）；凭据的据点保管方接口已定、中心一侧本版不收，保管方最小提供者节点 `credential-custodian-local` 已立、本版只进验收装配，产品装配里据点离线如实 `undispatched{credential_unavailable}`（MRR-N2）；传输 fork 节点 `pi-ai-transport` 已立、尚未建包（MRR-N4）；从模型面名字到工具条目已由契约闭合（S-28 ①：`openCall` 带 `report`、经注册表 `lookup` 取，MRR-N14）；排队中被首 token 时限中止的成因已由契约 S-21/S-18 明确为本地 `unrecognized`（MRR-N15 已闭合，实际场景未执行）；产品装配里会话持有租户没有写入方，要发起租户的操作一律 `unavailable`；函数层没有契约条款（MRR-N12）。2026-09-25 修订波处置见 [verification](verification.md#修订波2026-09-25-公开面)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 六条，全部绑 `formal:model-request-runtime-v2-invocation`（run `2026-09-25-formal-assets-runtimes`，退出 0）——S-15、S-17、S-22、S-30、S-31、S-33，每条对应一个有否定配置证明会失败的不变量。**这是契约层的交错证据，不证本节点的实现。**规范场景 S-41～S-48、S-52、投影性质测试与三条真并发演练都没有实现可跑，见 [verification.md](verification.md#覆盖缺口)
- 实际验证：无

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 两个插件、inject 边与换代时收掉什么、一次调用的 effect、跨 owner 的共同存储对象、装配给怎样兑现 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml) |
| 实际跑过什么、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

## 2026-09-27 最终技术采用

[D-076](../../../../record/decisions/model-runtime-delivery-adoption/decision.md)接受对应精确规格与本节点投影。旧候选读数和验证历史保留。此事件不代替源码、真实故障/停止或37模型生产认证；新增实际绑定另附运行证据。

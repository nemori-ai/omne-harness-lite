# Session、Run 与 Agent 实例生命周期组合 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, composition.session-run-agent-lifecycles, 1)`，状态为 candidate、
`acceptance:null`。正文从 `omne-harness-lite-legacy-spec` 的 `composition.session-run-agent-lifecycles@2`
当前版本重基，保留 LC-01～LC-09 的身份和仍有效语义；旧决定、旧接受、
执行日志和旧模型结果只作 provenance，不自动接受或验证本坐标。

本能力的责任是：附着、占位、执行者三条关系和跨 Session/Run/Agent 的原子级联、Yield 与恢复。 本轮采用 F/S/G 精确候选坐标；尚未迁移的
model-execution、media-content、message-stream 与 external-hooks 引用只表示后续接口需要，
不构成本候选 catalog 的当前依赖。后文出现的 legacy 路径和旧版本号用于恢复来源，
同名新谱系依赖均以本任务 candidate manifest 为准。

## 范围与三台状态机

**LC-01**：本组合适用于一个 Session、其全部 Run 与先后附着于它的实例。三台状态机是：
Session 的 `open ⇄ archived → deleted`（SE-02（legacy source: `../../../capabilities/session/v2/contract.md`））；
Run 的 preparing/running/waiting/interrupted/stopping/completed/failed/cancelled/superseded
（RN-01～05（legacy source: `../../../capabilities/run/v2/contract.md`））；实例的
`preparing → ready → closing → releasing → disposed`（AR-4～7、AR-11～13（legacy source: `../../../capabilities/live-agent/v1/contract.md`））。
Session 与 Run 的转移是耐久事实；实例的转移不耐久，Registry 重启从空重建
（AR-7、AR-17（legacy source: `../../../capabilities/live-agent/v1/contract.md`））。Run 的"等人 / 等工具 /
等门"不是状态，是 RN-01（legacy source: `../../../capabilities/run/v2/contract.md`） 等待登记簿的投影；本组合
只连接三台状态机，不复述登记簿的成员规则。

## 三条关系

**LC-02**：连接三台状态机的关系恰有三条，各有唯一拥有者：

| 关系 | 定义 | 拥有者 | 耐久性 |
|---|---|---|---|
| 附着 | 实例 → Session，`held → revoked/releasing → released`；一个实例一生只附着一个 Session；一个 Session 同一时刻至多一个未释放的实例，前一实例 disposed 前不能为同 Session 预留新 AgentRef | live-agent Registry 与 Session 附着提供者（CB-04～07（legacy source: `../../agent-session-binding/v1/contract.md`）、AR-4（legacy source: `../../../capabilities/live-agent/v1/contract.md`）） | 不耐久 |
| 占位 | Session → Run，`null \| RunRef`，表示"该 Run 仍拥有本 Session 的驱动权"。它由 Run 的已提交事实派生：`placeholder(S)` 是 S 中唯一处于 running、waiting，或处于 stopping 且其终止意图是在该 Run 占位时受理的 Run，没有则为 null；interrupted、终态，以及由 interrupted 升级进入 stopping 的 Run（RN-03（legacy source: `../../../capabilities/run/v2/contract.md`）：它在 interrupt 时已释放占位，升级不使占位恢复）不占位。派生关系的唯一性就是 RN-01（legacy source: `../../../capabilities/run/v2/contract.md`）"精确持有"的含义（D-012（legacy source: `../../../../docs/decisions/D-012-run-driver-and-inbound.md`） 接受的不变量 I-1），不需要单独的预留/释放事实 | Session（读 Run 状态与其终止受理记录） | 派生 |
| 执行者 | Run → 实例，`null \| {agent, epoch, workPermit}`，表示"当前谁可以为该 Run 提交"。`executor(R)` 非空当且仅当 R 的当前 epoch 未封闭且 Registry 中存在持有该 epoch 工作许可的 ready 或 closing 实例；实例消失则为 null，Run 状态不变 | Run 的 epoch（RN-01（legacy source: `../../../capabilities/run/v2/contract.md`））与 AR 的 WorkPermit（AR-8/10（legacy source: `../../../capabilities/live-agent/v1/contract.md`）、CB-09（legacy source: `../../agent-session-binding/v1/contract.md`））共同表达 | epoch 耐久，持有者关联不耐久 |

执行者非空蕴含：持有者是该 Session 当前附着的实例，处于 ready 或 closing，其 epoch
未封闭，且 Run 占位。任何非终态且执行者为空的 Run，推进的唯一路径是以新 epoch 重取
（LC-07）；控制请求可以在执行者为空时受理。

## 级联的三种形状

**LC-03**：一台状态机的转移对另外两台与三条关系的效应只能采用三种形状之一，判断
顺序固定：

1. **派生与守卫**：不写不传。效应是其他已提交事实的函数，由 fold 得到；或依赖方在
   自己转移的门里读对方当前状态并据此拒绝。能派生就派生。
2. **同提交共写**：效应必须成为新事实，且不变量禁止中间态。用 CC-01（legacy source: `../../core-work-coordination/v2/contract.md`）
   的具名组合在同一协调域一次提交，参与的每个权威只核自己的事实（prepare/check），
   不修改对方状态。只在派生不可能且中间态被禁止时采用。
3. **提交后反应**：效应允许延迟，或效应本身不是耐久事实（资源动作、通知）。反应者
   订阅已提交事实的广播（LC-06），幂等地做第二次提交或资源动作。

## 同提交声明

**LC-04**：以下级联采用形状 2，是本组合按 CC-01（legacy source: `../../core-work-coordination/v2/contract.md`）
声明的原子关系；每行由一个具名组合承担，Session 与 Run 的提供者互相不持有对方的
状态：

| 行 | 触发 | 同一提交内的效应 | 依据 |
|---|---|---|---|
| 1 | Session 归档 / 删除 | 生命周期转移；未取批队列项 closed_by_archive/delete；accepted 与 classified 未消费的 arrival closed；封闭新激活的资格。前提"无非终态 Run"由 LC-05 守卫 | SE-02（legacy source: `../../../capabilities/session/v2/contract.md`）、SE-14（legacy source: `../../../capabilities/session/v2/contract.md`） D2 列、CB-05/06（legacy source: `../../agent-session-binding/v1/contract.md`） |
| 2 | Session 级 force_stop | 队列 hold；当前占位 Run → stopping；该 Run 的 epoch 在受理点撤销；该 Run 的等待登记整簿注销（`cancelled`） | SE-09（legacy source: `../../../capabilities/session/v2/contract.md`）、RN-05（legacy source: `../../../capabilities/run/v2/contract.md`） |
| 3 | 取批 / 取命令 / 取 trigger；或在既有 Run 的空闲点取批 | 建立新 Run 的形态：队列侧固定并取用项；Run 建立（basis、定义、模型、初始 epoch）；epoch 发行给持有工作许可的实例。取入既有 Run 的形态（Run 处于 waiting 的空闲点）：队列侧固定并取用项；该批记为占位 Run 的 `supplement` 并开其下一个 Step，不建立 Run、不发行新 epoch | SE-06/07/15（legacy source: `../../../capabilities/session/v2/contract.md`）、RN-01/02（legacy source: `../../../capabilities/run/v2/contract.md`）、AR-8（legacy source: `../../../capabilities/live-agent/v1/contract.md`）、RD-06（legacy source: `../../../capabilities/run-driver/v3/contract.md`） |
| 4 | Run → completed / failed / cancelled / superseded | 终态转移；仍开放的等待登记整簿注销（`failed \| cancelled \| superseded`；completed 以登记簿已空为前提）；指向本 Run 的未消费 continuation 转为 trigger 项（completed/failed）、改判为 context（superseded）或 closed（cancelled 与级联关闭）；superseded 另在同批受理一条 `source: system`、意图 context 的被保留工作清单到达；执行者 epoch 封闭 | RN-02/04/09（legacy source: `../../../capabilities/run/v2/contract.md`）、SE-13/14/17（legacy source: `../../../capabilities/session/v2/contract.md`）、D-012 的 I-14（legacy source: `../../../../docs/decisions/D-012-run-driver-and-inbound.md`） |
| 5 | Run 的 force_stop / cancel | 控制受理；epoch 撤销；等待登记整簿注销（`cancelled`）；活动 Run 进 stopping，对 interrupted 的 cancel 直接 cancelled，对 interrupted 的 force_stop 在存在可升级 unknown 调用时进不占位的 stopping、否则直接 cancelled；对 TL/HD 的停止意图同域则同批、跨域沿 CC-05（legacy source: `../../core-work-coordination/v2/contract.md`） | RN-03/05（legacy source: `../../../capabilities/run/v2/contract.md`） |
| 6 | Run 的 interrupt | 关 Step；停止请求；安全收口（每个停止请求都有物理事实，`unknown` 计入）后 interrupted；epoch 封闭；等待登记簿保留、不注销 | RN-03（legacy source: `../../../capabilities/run/v2/contract.md`） |
| 7 | 驱动器 Yield | epoch 封闭；Run 状态、等待登记簿、阻塞集合不变；占位随状态派生保留 | RD-14（legacy source: `../../../capabilities/run-driver/v3/contract.md`）、RN-01（legacy source: `../../../capabilities/run/v2/contract.md`） |
| 8 | interrupt_then_run 受理 | 新 input 耐久；当时精确 Run 与复合意图记录；旧 Run 关新 Step 并受理终止意图。旧 Run 的终态 `superseded`、整簿注销与工作清单在其收口提交（行 4） | SE-08（legacy source: `../../../capabilities/session/v2/contract.md`）、RN-04（legacy source: `../../../capabilities/run/v2/contract.md`） |
| 9 | Inbound 裁决 | arrival 的意图与 observedRun 记录；裁决为 continuation 时同批注销该 holder 在其发起 Run 上的等待登记（`settled`）；裁决与被引用 Run 的终态转移在同一协调域全序 | SE-12/14（legacy source: `../../../capabilities/session/v2/contract.md`）、RN-01（legacy source: `../../../capabilities/run/v2/contract.md`）、D-012 的 I-13（legacy source: `../../../../docs/decisions/D-012-run-driver-and-inbound.md`） |

首版五条流（session、queue、inbound、frames、run；`frames(S)` 由 SE-19（legacy source: `../../../capabilities/session/v2/contract.md`）
登记）位于同一协调域；把它们拆到不同域前须先满足 LC-09。

## 守卫与派生

**LC-05**：以下效应采用形状 1，不写事实、不发通知：归档/删除的前提"无非终态 Run"
（含 interrupted；`superseded` 是终态，被越过的 Run 不再阻止归档）在门内读 Run 当前状态；
取批的前提"无占位"读 LC-02 的派生关系，取入既有 Run 的前提"占位 Run 处于 waiting"同样
在门内读 Run 当前状态；附着资格、租户权限、定义授权失效只封闭后续准入（CB-06（legacy source: `../../agent-session-binding/v1/contract.md`）、
CC-02/04（legacy source: `../../core-work-coordination/v2/contract.md`） 的撤销屏障），不解释为 cancel，进行中的
Run 沿冻结依据继续（AR-9（legacy source: `../../../capabilities/live-agent/v1/contract.md`）），驱动器在下一
安全边界的联合准入被拒即 Yield；写入权丢失封闭新提交，驱动器停在已确认水位
（DR-03（legacy source: `../../../capabilities/durable-records/v2/contract.md`））；旧 epoch 的提交由每次提交的
epoch 核对拒绝（RN-01（legacy source: `../../../capabilities/run/v2/contract.md`））；崩溃后"该重取"由
"占位 Run 的执行者为空"派生，不依赖任何实例事实。

## 事实广播与提交后反应

**LC-06**：协调者在提交返回 committed 后把该 envelope 原样广播一次，按租户与
Session 作用域过滤；广播只是提示，不是第二种事实。反应者的义务：幂等；动手前在
自己的门里重读权威状态，不据通知推进；容纳自身异常，不影响其他监听者；通知失败
按 DR-02（legacy source: `../../../capabilities/durable-records/v2/contract.md`） 单独报告 delivery 状态，不改已
提交事实；丢失由提供者启动扫描兜底。以下效应采用形状 3：

- Session 级调度者对铃的反应：队列变化、Run 终态、hold 解除、arrival 判为接续或审批
  就绪、epoch 封闭、门恢复、resume；判断"无占位且队首合格则开新 Run""占位 Run 执行者
  为空且有可干之事则重取"；先查 ready 实例，无则激活（SE-15（legacy source: `../../../capabilities/session/v2/contract.md`））。
- 宿主对 Session 归档/删除的反应：关闭该 Session 的空闲实例
  （AR-11（legacy source: `../../../capabilities/live-agent/v1/contract.md`） 的显式退役），释放附着。
- AR 对 Run 终态、interrupted 与 Yield 的反应：`settle(work)` 结算许可
  （AR-10（legacy source: `../../../capabilities/live-agent/v1/contract.md`））。
- 资源政策对"Run 等待中且实例空闲"的反应：可回收实例，Yield 无在途工作。
- 退役流程对实例的资源动作：请求驱动器 Yield（AR-12（legacy source: `../../../capabilities/live-agent/v1/contract.md`） 步骤 1）。

## Yield 与重取

**LC-07**：实例退役而 Run 在执行时，驱动器到安全边界提交 Yield（LC-04 行 7；前提沿
RD-14（legacy source: `../../../capabilities/run-driver/v3/contract.md`）），静止后按
AR-12（legacy source: `../../../capabilities/live-agent/v1/contract.md`） 释放资源与附着。占位 Run 的执行者为空
后，重取由 Session 级调度者发起：先完成本 Session 的裁决扫描
（SE-18（legacy source: `../../../capabilities/session/v2/contract.md`）），再取得 ready 实例或激活新实例，在同一
提交发行新 epoch 并封闭旧 epoch，operationId 从 `(RunRef, 封闭的 epoch)` 派生，重取须
通过 RN-08（legacy source: `../../../capabilities/run/v2/contract.md`） 的恢复兼容证据。多数重取不需要新实例。

## 崩溃与恢复

**LC-08**：崩溃与进程重启不留下任何实例事实或 Yield 事实。恢复顺序：耐久记录同步
有效前缀 → Session 校验并完成全部 Session 的裁决扫描 → 投影重建 → 各执行 owner 核实
在途 attempt/call/request → 当前资格重新取得 → 调度者对每个 Session 判断重取或开新 Run。
"epoch 未封闭但无实例持有"与"epoch 已封闭"在恢复上是同一种情况，都只能重取
（RN-08（legacy source: `../../../capabilities/run/v2/contract.md`））。裁决扫描先于任何重取是硬顺序。

## 跨协调域部署前的义务

**LC-09**：本版只承诺同一协调域。将 Run 权威另置协调域之前，必须以新版本契约兑现
以下义务，否则形状 2 的行退化而不变量失效（D-014（legacy source: `../../../../docs/decisions/D-014-session-run-agent-lifecycles.md`）
引用的验证说明中 `LifecyclesSplit` 配置与否定变体给出证据）：Session 域的裁决门、归档门与取批门带
Run 域的状态版本戳；Run 域在消费 create 意图时重查占位；归档同时关闭已取项而尚未
建 Run 的 create 意图；settle 与 create 意图按 CC-05（legacy source: `../../core-work-coordination/v2/contract.md`）
耐久、幂等消费、源确认后撤回；D-012 接受的 I-13 与 I-14（legacy source: `../../../../docs/decisions/D-012-run-driver-and-inbound.md`）
与 LC-04 行 9 的"同域全序"改写为
最终性质；等待登记的注销与释放它的事实（裁决、detach 确认、门放行、终态）跨域时不能
同批，退化为按 CC-05 的耐久意图与幂等消费，`waiting` 因此在窗口内可能滞后；旧 epoch
持有者的活性判定（live-agent v1 缺口）。这是"边界就绪"的证据，不是"已可分布"的证明。

## 验证边界

模型抽象三台状态机、三条关系与级联触发；把每个具名组合当作原子动作是提供者须实现的
线性化义务，不是对多个实际服务已能原子协作的证明。租户、帧、预算数值、多 Session、
等待登记簿本身的成员规则、工具与人类决定的具体状态机、多进程活性均不在模型内；
`superseded` 与 interrupt_then_run 的一步转移在本版进入模型，interrupted 升级进入的
不占位 stopping 与"取入既有 Run"未建模，覆盖与缺口逐条见验证说明。
实际提供者的符合性与装卸行为另行验收。

## Legacy 当前版形成时的来源差异

来源裁决列的编号（作者裁决 x、等待登记簿等）出自
决定 D-015（legacy source: `../../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md`）
接受的工具执行提案；编号到提案正文与锚点的链接由本组合的可变入口
（`spec/compositions/session-run-agent-lifecycles/README.md`）维护，契约正文不引用候选材料。

| 条款 | 性质 | 变更 | 来源裁决 |
|---|---|---|---|
| LC-01 | 语义变化 | Run 状态集合按 run v2 更新（删 waiting_human / waiting_gate，加终态 `superseded`）；写明"等人/等工具/等门"是等待登记簿的投影 | 作者裁决 3/8 |
| LC-02 | 语义变化 | 占位派生改为按"Run 状态与其终止受理记录"：running、waiting 与由活动 Run 受理进入的 stopping 占位；由 interrupted 升级进入的 stopping 不占位 | 本批次作者裁决（[差异说明](#未由来源直接给出的表达)） |
| LC-04 行 2 | 兼容扩展 | Session 级 force_stop 的受理提交加"整簿注销" | 作者裁决 15 |
| LC-04 行 3 | 兼容扩展 | 增加"在既有 Run 的空闲点取批"的同提交形态（取项 + `supplement` + 开下一个 Step，不建 Run、不换 epoch） | 作者裁决 7 |
| LC-04 行 4 | 语义变化 | 触发加 `superseded`；效应加整簿注销、superseded 的 continuation 改判 context、被保留工作清单作 `source: system` 的 context 到达同批受理 | 作者裁决 3/4/12 |
| LC-04 行 5 | 语义变化 | 受理提交整簿注销；写明 interrupted 上 cancel 直达、force_stop 在有可升级 unknown 调用时进不占位的 stopping | 作者裁决 10/14/15 |
| LC-04 行 6 | 澄清 | 安全收口写明"`unknown` 计入"；等待登记簿保留、不注销 | 作者裁决 2/8 |
| LC-04 行 7 | 澄清 | "等待位置"改称等待登记簿；依据升为 run-driver v3 | 作者裁决 13 |
| LC-04 行 8 | 澄清 | 写明受理提交只关新 Step 与受理终止意图，终态 `superseded` 与整簿注销属行 4 | 作者裁决 3 |
| LC-04 行 9 | 兼容扩展 | 声明"裁决为 continuation 与该 holder 的登记注销同批" | 作者裁决 8、T-17 |
| LC-05 | 澄清 | 归档守卫写明 `superseded` 为终态、不再阻止归档；补"取入既有 Run"的守卫 | 作者裁决 3/7 |
| LC-06 | 不变 | 反应义务与形状 3 清单与 v1 相同 | — |
| LC-09 | 兼容扩展 | 跨域义务加"等待登记的注销与释放事实不能同批时按 CC-05 退化" | 等待登记簿的跨域边界 |

### 未由来源直接给出的表达

LC-02 的占位派生改写是本版为使作者裁决 10/14
的"interrupted 上 force_stop 经 stopping"与 v1 RN-03（legacy source: `../../../capabilities/run/v1/contract.md`）
的模型发现（interrupted 经 stopping 会重新占位，与此时运行的新 Run 并存，违反占位唯一）
同时成立而写明的边界；来源提案提出了升级路径，但没有处理它与占位关系的交互。LC-04
行 3 的第二种形态与行 9 的注销同批是 CC-01（legacy source: `../../core-work-coordination/v2/contract.md`）
要求"同提交组合必须由组合契约明确声明"的直接后果：session v2 的取入既有 Run 与
Inbound 裁决同批注销登记若不在此声明，它们就没有原子关系的依据。

# P3 工具、系统审批与本地执行施工交接

状态：**最小基线所需 TL/LE 设计已接受为施工输入；完整 HD 保留后续候选**。
产品仍未交付。本入口
维护范围、来源、采用快照、正文导航与施工安排，不另存公开接口/生命周期正文。
历史原稿完整保存在 `e6c0b8c5d1a7cc3b282c809498a241a66ad71b9d`，本次修订
消费新维护规范与计划 `0703f6e`，不改变已接受正式 v1。

## 接受与验证

主调度接受 `0a6e91ea643497f309f1a69f8adecc8a98751df3` 中本次基线所需的
TL/LE 共同面、T0–T2 及对应恢复/控制义务，包括 T0-H 中被 TL 实际消费的
共享形状/纯 fold；这不接受或开放完整 HD 产品实施。该源提交经 `23020cf` 合入 HUB，
P2 相邻面采用 `f98ac92650beb46bb1e4bc993995e21800a300a2`，已由原独立
architecture-reviewer `/root/review_first_batch` 定点确认 T-R1/T-R2 与 reader
归属闭合。完整 HD/system_approval、T3/T4 及超出基线的测量保留后续候选；
未交付 ask 必须不可执行，不能将其解释为隐式 allow。

HUB 已核对作者资产/三个包设计哈希并复跑两组当前资格机制，输出逐字一致，
见[HUB 证据](evidence/provider-design-hub/README.md)及
[复核记录](review.md#p3-工具审批与执行施工稿评审)。原文件效果前后两个
SIGKILL 窗口也在 HUB 复验，只有底层效果窗口的观察范围。作者检查记录中的
原 actor 标识绑定初稿执行，修订通过原生作者的后续任务完成；接受绑定上述
实际 Git 对象，不把一次执行结束等同于设计或产品接受。

诊断创建/关闭面消费 [D-011](../../../decisions/D-011-diagnostics-directory-ownership.md)
及所属 [design](../../../../packages/observation/diagnostics/design.md)。本次未改
正式 v1；真实 P1、P2 及执行产物仍是实施与组合验收前置，机制探针与文档检查
不能抵扣 D01–D12 的产品场景。

## 四输入、范围和实现依据

| 输入 | 固定版本与消费范围 |
|---|---|
| 目标 | 原 `8c791b3a1966afa86b3d60c24fecd3da3f1ea0b9` 的 [scope](scope.md)、[runtime-baseline](runtime-baseline.md)；按用户后续收窄，本会话到真实 Agent/Session/工具最小闭环即停止，完整 HITL/M2 后置 |
| 验收 | 同提交 [acceptance](acceptance.md)：A10–20、A26 本地子场景、A28–32，及其 A01–09 前提；SR S18 的 proposed→直接 deny→原 Step 恢复必须贯通 |
| 规格与共享面 | 同提交 [implementation-spec](implementation-spec.md)、[shared-interfaces](shared-interfaces.md)、D-010 [observability](observability.md)；治理受审源 `058c77c`、SR 受审源 `cd16f1`，采用本树 [治理](governance-interfaces.md)及 [SR](session-runtime-interfaces.md)正文和接受范围 |
| 计划 | 原基线提前 P3 段，加 `plan.md@0703f6e` 的长期正文迁入段；本次检查基线 `b585608`；施工安排见下文 |

正式身份从 [catalog](../../../../spec/catalog.json)定位：`data.agent-runtime-identity@1`
经 D-005，`data.core-work@1` 经 D-008；`capability.live-agent@1` 经 D-005，
`composition.agent-session-binding@1` 经 D-007；下列均为 D-008 接受的 v1：
`capability.tools`、`capability.human-decisions`、`capability.action-authorization`、
`capability.budget-accounting`、`capability.session-run`、`capability.tenant-governance`、
`capability.durable-records`、`capability.engineering-observation`
及 `composition.core-work-coordination`。下文 TL/HD/AU/BG/SR/TG/DR/OB/CC
沿这些精确契约，不把实施事件或 TypeScript 记法升格为冻结规格。

work-data/records 已有真实产物；P1 writer/admission 及业务 owner 尚须真实交付。
D1 diagnostics 候选正在独立验收，本稿仅消费已接受的 Diagnostics/factory 注入
接口。runtime-baseline 中历史实施状态不取代后续接受记录，也不证明节点已运行。
三包正文的 shape/方法/事件是语言无关施工记法，**不是已编译 TS 模块**。

本次运行目标是部署信任的工具、Linux 本地文件和前台关系，尽量组合共用
日志/trace、本地费用和真实 JSONL；完整 system_approval 候选保留后续，当前
不要求其全部实施，也不允许未开放的 ask 执行。原排除项保持：
question/agent_approval、专属账号/设备同意、暂行执行、detach、任意代码、shell、
网络文件系统、模型路由不开放。识别未知/不支持的声明并拒绝，不能退化成普通
批准或成功空操作。独立 owner、费用、停止和恢复义务不因前台或本地而豁免。

## 当前正文与采用快照

| 唯一正文 | 维护内容 | 历史来源及消费 |
|---|---|---|
| [tools/tools](../../../../packages/tools/tools/design.md) | 声明/Schema/manifest、TL 状态与准入批、SR/HD/LE 窄消费、TL 插件/代次/维护 | e6 的工具和跨包 TL 组合责任；消费 HD/LE 下列正文及 SR `cd16f1` |
| [human-decisions](../../../../packages/governance/human-decisions/design.md) | 请求/唯一答案/后果、答复组合、SystemApprovalSource/DecisionFacts、HD 插件/资源 | e6 的 HD 状态/操作/ask 配合、暂行和专属边界；双入口仍同一 owner |
| [local-execution](../../../../packages/tools/local-execution/design.md) | 真实对象权限、accept/start/stop/inspect/墓碑、文件 I/O/费用/帧及 LE 插件 | e6 的执行状态/资源/生命周期；read/write 限于本提供者 |

这三份正文作为本次同一 Git 修订的候选快照交付。已有签名归公共源码，待实现
符号明确为候选；目录中出现 design.md 不证明包 member/API 存在。后续实施
四输入必须固定经审阅/接受的整份修订，不只引用浮动路径。包 README/spec
可变入口、应用/总索引及接受记录由整合者补导航，本作者没有这些写入权限。

相邻提供者选用 `runtime-provider-interfaces.md@5ffba4bb55aa9514ebd7f3c2b48f0d26fc9a8e18`
及其 evidence 的固定版本，**仍未接受**。共同面为唯一 omneAdmission 准备面与
各包受信 host options 的真实 RecordReader；P2 service/provider/应用装配仍归
原作者。共同面最终复核及 P1 真实组合通过前，不据候选开放实施。

## 本轮审阅处置

| 发现 | 修订位置及最小待执行产品反例 |
|---|---|
| T-R1，effect 延迟留下旧入口窗口 | [TL 当前代次检查](../../../../packages/tools/tools/design.md#当前代次的最后门内检查)及 HD/LE 各自末门：直接核原操作/必要依赖 Fiber 同步状态、单调关闭代次和 host stamp；不等 disposer。dispose 后同栈旧 prepare/句柄、必要依赖失联/重現不得新准入/答复消费/start，原已准入责任保留。机制实测与产品义务分别记录于 evidence |
| T-R2，claim 与事实入口混写 | [TL 窄交接](../../../../packages/tools/tools/design.md#原调用与邻包的窄交接)、[HD 答复](../../../../packages/governance/human-decisions/design.md#答复与后果交接)、[LE 终态](../../../../packages/tools/local-execution/design.md#cordis-映射与撤除责任)：new_step/adjudicate claim 仅管工作；answer/原终态/fullRun 控制核当前接收资格及原事实。准入后 Agent 释放再送真实终态应续原 Step，旧伪回调拒绝；控制无 claim 仍可合法关闭 |

来源、许可和有限机制/文件窗口观察见 [设计证据](evidence/tool-decision-design/README.md)。
未更改冻结 v1；修订只消除实施投影矛盾和补全可观测生命周期屏障。

## 施工顺序、独占范围与真实开放门

此表是未来派发输入，**当前仅授权本稿、三份包 design.md 和专属 evidence/tmp**。每任务同时消费
本文四输入及整合者固定的本稿接受 commit、真实前置产物版本、自己的验收行；
源码/签名冲突先报告，不能让应用临时补业务规则或修改冻结 v1。
本会话到 T2 最小节点结束；T0-H 仅提供实际被 TL 消费的共享形状/纯 fold，
不先实现完整审批。T3/T4 的完整 HITL/M2 安排保留后续，不构成 T2 的全量前置。

| 增量 / 角色 / 独占未来写路径 | 前置产物和 RED→GREEN 交接 |
|---|---|
| T0-H / capability-developer / `packages/governance/human-decisions/` 的公开端口、事件/纯 fold 与测试 | 已接受 AU/SR/records 端口；先固定 SystemApprovalSource/DecisionFacts/事件来源，再以错 tenant、重复 outcome、错误转移的反例验证。真实打包、独立编译消费通过后才给 TL 开工；不把声明全绿当可答 |
| T0-T / capability-developer / `packages/tools/tools/` 公共端口、Schema/事件/纯 fold 与测试 | T0-H 固定产物及 SR S18；固定 ExecutionProvider/PermitFacts/资源消费端口、移除 llm/baseline 类型依赖。共享完整声明与跨包消费者编译后交 LE；不得让两作者同时改公共文件 |
| T1-L / infrastructure-developer / `packages/tools/local-execution/` | 真实 P1/诊断、T0-T、TG/AU 当前资源接口；先跑 D06/D07/D09 的真实失败，再交接实际资源管理、accept/stop 墓碑、I/O/fd 收口、恢复和 CostSource。资源权限没交付时不得用 permissive fixture 开工具 |
| T1-T / 原 TL capability-developer / `packages/tools/tools/` | 真实 P1/TG/AU/BG/SR、T0 与 LE 公开端口；D01–D05/D08 先反例再完整注册/proposed/deny/allow/结果。与 T1-L 可按固定端口并行，但共同真实 composition 才通过开放门 |
| T2 / application-developer / `apps/local-harness/` 被派定的文件工具/CLI/确定性驱动装配 | 真实 T1、AR/SR/TG/AU/BG/P1/身份产物；D03/D06/D07、SR S18 和最小节点全部适用门通过，给独立 tarball/实际启动和调用命令。ask 未完成则不可执行，交接仍不声称 M1 完成 |
| 后续 T3-H / 原 HD capability-developer / `packages/governance/human-decisions/`；T3-T / 原 TL owner / 原 tools 包 | 在 T0 固定面上独立实现 HD 管理/恢复/池与 TL 对应 source；D04/D05/D08/D10 的双客户端/q1q2/撤权/控制真实组合全部通过后才开放 M1 ask。保留缺失/关闭 source 的产品结果，不作为本会话最小节点的全量前置 |
| T4 / application-developer / 原应用入口；verification-developer / 单独派定组合与故障测试文件 | 接实际 Session/池/单次 stop/帧/资源管理；D01–D12、A28–32 和完整 M1 对账。M2 由 MC/Loop owner 消费本稿 manifest/结果/待答接口，在原包实现，不在这里伪造模型通过 |

每个包作者继续负责自己的恢复/失败/生命周期，verification 不补缺失产品行为。
跨 owner 的 ActionFacts/ReferenceInventory/BG 事实端口由其真实提供者共同验证，
对邻包必要接口修订归原 owner 单独任务；本稿不能授权改 P1/SR/AU 源码。根配置/
锁/索引/应用总装配归整合者，不能为并行建第二套类型或服务映射。

### 有区分力的实际测量

下列为待执行产品验收，只有真实组合实际通过才可写 GREEN。现有 fork 符合行为
先刻画保留，不人为造红；新增行为的 RED 必须能否定具体错误实现。
最小节点只执行实际消费的切片；完整待批/双入口/M2 场景保留后续，不能在本次
记为已覆盖。T-R2 最小切片必须实际验证准入后释放 Agent，原终态仍能交 SR，
以及没有 active claim 的合法 fullRun 控制；旧来源/旧控制 epoch 则不得冒充当前资格。

| ID / 原验收 | 刺激与必须观察 |
|---|---|
| D01 / A10/A30/PF024 | 同一工具 read/write，一个 alias；未知 command/多余参数/不支持 Schema、resolver/skill 缺失、handler 错配；在发布屏障换代 → 无半发布、无 body 效果，模型单槽位；程序化原证据也走相同门 |
| D02 / A01/A03/A11 | 两凭据/两 tenant 同名目标，真实资源 owner 权限和 AU grant/amend/revoke；none 读取缺权、模式矩阵、准备后撤资格 → 非法数据和旧私有句柄不能 allow/ask，不泄漏存在；管理预算不获得文件正文 |
| D03 / A09/A19/SR S18 | TL proposed+SR 原接续登记→完整返回/yield→当前直接 deny→重启消费原结果；在各批 fsync/回执处阻断 → 原 Step/Action/CallRef/continuationId 不变，无执行接纳/文件效果；旧 claim 和缺绑定无法绕过 |
| D04 / A12/A13 | ask 后释放 Agent/客户端、重启；Session/池同时 approve/reject/comment、旧 contentVersion/expected、同键异输入 → 唯一耐久 outcome，comment 不抢答；两入口认回相同原请求，时间前进不产生答案 |
| D05 / A14/A15/A17 | q1/q2 独立待答，q1 approve/reject 后先完成；批准后撤硬权/换绑定/改参数、两次消费、mode pending 收紧/放宽 → q1 串行续原 Step、q2 保留；旧批准不搬新 Action、不双执行，approved_but_not_admitted 和历史答案可查 |
| D06 / A16/A19 | start 尚未送达/已接纳但未 dispatch/真实 I/O 已发出三个窗口分别 stop，迟到 start、两个并行不同文件只停一个；实际 fd 延迟关闭 → 墓碑耐久且未实际收口前不报 stopped；另一个调用不受影响，超时保持 stopping/retained |
| D07 / A07/A17/A19 | 真实文件 open/write/rename/sync/terminal 回执各窗口 kill/reopen，重复 start、完整 journal 无回执 → 认回原 attempt；可能已效果保持 unknown 不重发，确认终态只重交结果；文件内容相同不能抵扣效果计数 |
| D08 / A18/A29 | 实际 Cordis 两 Context 同域、贡献新代准备失败/晚到、旧 disposer、AU/HD/LE 服务突失/重现、待批与在途各一项 → 同一状态 owner、无新准入、旧 pin/清理归原 owner；已准入不随操作 Fiber dispose 丢任务，请求不靠内存 Promise 存续 |
| D09 / A26/A28 | 真实 enableSource/budget 立场、最后额度并发、0 费用精确来源与另一个非零/unknown 来源、stop-before-start/late meter → 无超卖、无默认免费；原 period/CallRef 归集，unknown 暴露不因断连释放，同事实重放不增费 |
| D10 / A16/A17/HD-04 | fullRun 控制与刚 proposed/ask/已答未消费/真实终态竞争，强停中 continueQueue、迟到答案/结果、driver throw → 相关 TL/HD/SR 一批关闭，未证实安全停止/隔离保持 stopping；hold 不自动清，原成功不改写中断 |
| D11 / A20/A28 | 两帧订阅独立 cursor、保留溢出、重启缺口、终态早于重连、投递前撤权；审计/诊断同时失败 → 无竞争 cursor/隐含模型注入，gaps 明确，终态耐久；关键审计失败封闭效果，诊断失败不推翻原回执 |
| D12 / A29–32 | 原生公开 tarball 独立定义工具并跑真实最小节点；100 次待批/释放/恢复/结束循环，故障后再次装载 → 真实 task/订阅/timer/fd 回基线或逐项 retained，依赖无环；每门实际环境/命令/未执行项对账，不能以源测试或编译抵扣 |

D08 同时验证上述真实 Cordis keys/inject/资源归属；不能以“插件能加载”抵扣其
动态失联/退出测量。D07 的有效停止只在列名环境成立；内核 I/O 永不完成或
原提供者无法核实的情况保持 unknown/retained，不能为通过回归伪造安全证明。

## 尚待交付与作者检查

| 缺口 | 责任与开放限制 |
|---|---|
| 真实 P1/diagnostics | 各原 provider 作者交付并通过实际 JSONL/admission/诊断组合；本稿不推定其尚未交付行为。没有共同门，T0 可做共享/fold，目标运行不开 |
| 当前身份、AR/SR、TG/AU/BG | 各原作者交真实管理/当前事实和已接受窄口，应用只接真实凭据；完整插件映射由其原任务继续，不能因本稿列消费键而说全部完成 |
| 文件资源与执行协议 | T1-L 必须交真实对象权限/同门 stamp、受管 I/O/墓碑/费用依据，TL 的资源端口缺 provider 为 unavailable；不是 app 预置许可责任 |
| TL/HD 互供与恢复 | T0 固定类型、T1/T3 交真实 source/decision/后果端口及 D03–D10；未交付 HD 时 ask 不能执行，未交付原 source 时请求不可答 |
| 暂行/专属/后台/模型 | 仍按 scope 排除或后续 MC 任务交付，不由普通批准/本地 I/O 扩充能力声明；无相应真实提供者不能开放 |

作者仅写获准正文和专属 evidence/tmp；检查基线 `b585608`。文档/范围检查与必要
底层可行性观察记录在[设计证据](evidence/tool-decision-design/README.md)。没有
运行本稿产品 TDD、形式模型、完整 Cordis 组合或 TS 接口编译；技术候选的接受
不等于这些验收通过。独立复核及整合者接受范围见上文，本作者不自行接受。

# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

## v3 维护候选

2026-09-25：依据 PF-017 rev5 起草 [v3](v3/contract.md)，candidate，未接受。S-55～S-59 的真实组合验证均**未开始**；不沿用下文 v1 的实现通过声明。

| 规范条款与性质 | 证据义务与范围 | 本轮状态／owner |
|---|---|---|
| S-55～S-59 形状闭合及体检/31路由保持 | [examples.json](v3/examples.json)逐项验证；v2的93个已有定义逐项比较 | **通过**：108例（继承28、新增80）；93定义不变。仅Schema形状，不证明授权/内容/持久性 |
| S-55/S-58/S-59 属主、真实结束、unknown不计成功、明文隔离 | [维护TLA+](v3/formal/README.md#维护模型)：安全正配置、带弱公平的进展配置、四个预期反例配置 | **未运行**；形式工具由主线后续执行，否定配置不是formal task |
| S-55 一致观察与不改源事实 | 并发业务写入下核对完整同一副本、原中心/迁移/时间底线及登录活动；副本不是拼接 | **未开始**；存储维护、身份/时钟各owner与装配 |
| S-56 时间与每日进展 | 20/24小时等号；仅匹配BackupFileName的直接条目计候选，超256先capacity，非普通文件/符号链接不跟随并计invalid；完整性后先排除外中心、再评价当前中心时间；外中心未来时刻不挡due；I/O异常不计坏件；同刻最小名、unknown重取、停机不自启 | **未开始**；装配和调度提供者 |
| S-57/S-58 文件与安全边界 | 已有空目标拒绝、源不变、目标不覆盖、封装与原身份不变、结果businessOpen=false、不开业务 | **未开始**；本机维护工具 |
| S-59 真实收场及崩溃残余 | 断连/取消/关闭交错、旧等待界后仍持源属主、发布各切点/清理删除回退、所有正式支持打开路径拒绝 | **未开始**；存储维护与装配。模型不替代介质/真实进程证据 |
| S-29 秘密输出边界 | 答复/元信息/诊断无秘密；受保护副本不打印为文本，不把宿主访问冒称产品沙箱 | **未开始**；维护工具与诊断提供者 |

本轮实际执行：`.venv/bin/python tmp/production-cli-onboarding/check-ec3.py` 输出
`PASS: 108 schema examples; 93 inherited definitions unchanged; 31 resources enumerated; candidate not accepted.`
原始输出在本次任务区 `tmp/production-cli-onboarding/ec3-schema-check.log`；未归档为正式证据。
主线已集成候选清单片段。`.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal registered`
本轮输出 `PASS: design tree …/.meta_harness/design passed gate=internal; formal=registered.`；5项v3正向任务逐项为
`registered; execution was not requested`。原始输出在本次任务区 `tmp/production-cli-onboarding/ec3-design-check.log`。
这只核对登记、资源、引用与冻结边界，不是TLC执行。四份登记口径由本次片段给出：catalog候选、47条未复核covers、5项正向任务、复用既有编号族；不新增namespace前缀。

### v3 静态检查义务

本节编号只属于 `composition.governance-center-entry/v3`；下文v1的SC-1～SC-3及其历史通过记录原样保留，不作为本版通过依据。

| # | 检查什么 | 守的条款 | 状态／owner |
|---|---|---|---|
| SC-1 | 客户端可调用操作恰为S-17的31条业务路由及S-18公开体检，无泛化服务/方法分派；S-24未投影的治理操作没有旁路入口 | v3 S-17/S-18/S-24/S-31 | **未开始**；入口提供者及静态检查工具 |
| SC-2 | 运行中运维可调用操作恰为full-health、backup、backup-status；没有账号/登录/组织/成员/邀约/注册/清除治理调用。维护仅消费S-59的副本只读核对与维护要求，不能把只读核对变成治理调用；两面不共用通道 | v3 S-25/S-31/S-55/S-56/S-59 | **未开始**；入口、维护提供者及静态检查工具 |
| SC-3 | 客户端没有完整体检/维护路由；verify与restore-isolated仅为本机文件工具，不进入任一服务通道；完整体检仍沿S-26原十字段且纯读，维护状态不混入 | v3 S-18/S-25/S-26/S-31/S-57/S-58 | **未开始**；入口和host工具装配 |

### v3 变化的影响

S-1/S-2/S-25/S-29/S-34/S-36/S-47/S-48/S-54 与缺口说明接续维护责任；新增 S-55～S-59，公开体检和完整体检保持原表示，31条业务route IDs保留。
维护形状、结果和发布/隔离模型是新增范围，所有维护实现证据必须重建；继承模型行为未改，其有限范围不扩张。
S-2 与新catalog片段按正文实质消费补登 AI S-13/14/18/38/52、OG S-53/64、OE S-8/9/12/13/15/16/20；冻结v2未改。
v2没有独立covers条目；v3先保留v1业务条款覆盖声称且标未复核，再增加PF-017 rev5维护关系，不把旧登记当新覆盖已验证。
本轮主线另澄清：发布已确认但暂存清理失败也为unavailable（不证明无效果），unknown优先于清理失败；正文、场景和Maintenance.KeepResidual同步，前一模型读法的运行不能替代本修订。
既有G号保留：G-1候选/支持制品采用、G-7安全再开放、G-10新增维护绑定、G-12升级契约家；不填新默认政策。

2026-09-25独立评审修订：按主线裁定对齐S-31三运维操作及本版SC义务；S-55/S-56明确目录直接条目的精确名称筛选、先计候选上限、拒绝跟随符号链接、完整性/中心身份/时间的判定次序。补6项场景，外中心未来时间不能阻止本中心due，I/O异常不冒充坏件。examples的OG2 S-55与历史v1 G-1改为精确坐标，formal入口标v3并把v2运行只作历史。Schema、机器样例、模型与配置均未修改；新增目录语义不在既有TLA+模型覆盖内，真实目录/时间场景仍未开始。

2026-09-25批内对齐：EC3与HT3统一采用PF-017 rev5；核对三运维逻辑名、payload/结果及必填null、onlyIfDue/backup-status共享目录判定、发布确认/清理失败/unknown优先级、断连与独立defect不释放owner。本契约的独立缺陷边界和闭合返回集合未改；HT3只规定受理后独立defect的网络关闭及本机ops-internal-defect诊断，不新增EC状态或反向依赖。共享数据继续IV1/OE2，HT3直接消费EC3 Schema，字段不另定义；旧冻结版只读，Schema与模型不改。该对齐不代替独立评审或真实适配验证。

同轮主线裁定修正维护排他的作用域：S-55/S-57/S-58/S-59采用在线部署属主单槽、离线调用作用域单槽及同一维护工作区跨进程互斥；不同工作区允许并行只读同一封装，各自固定输入观察、暂存独立持久隔离、恢复目标独占。旧“同源维护排他”不再适用，也不引入全机锁服务。补4个场景，真实验证**未开始**；模型从单个已接纳工作开始，原本不验证准入，因此Schema/模型/配置未改，formal入口明确此限制。HT3只暴露在线三操作，继续消费部署属主单槽，不把离线文件工具上线。

批内对齐后的本轮实际检查：EC3样例108例通过、93个继承定义不变；HT3的24份完整HTTP例通过，其中8份继承字节不变。当前catalog的EC3/HT3均为candidate，`check_design.py --formal registered`实际退出0并输出`PASS … gate=internal; formal=registered`；形式任务仅登记核对、未请求执行。本轮没有新增模型运行结论。

## 既有版本的证据

> **当前状态：`composition.governance-center-entry` v1 在身份清单里是 `accepted`（[D-028](../../../record/decisions/governance-center-design-acceptance/decision.md)，2026-09-23），所依赖的 `capability.account-identity` v2 同由 D-028 接受；主责产品依据 PF-017（rev 1 于 2026-09-23 接受，同日升 rev 2）。**
> 形式模型的一次执行已入库：[`2026-09-23-formal-governance-center-entry`](../../../record/evidence/2026-09-23-formal-governance-center-entry/README.md)（输入与当前 `v1/formal/` 逐字节相同）。
> 实现测试的一次运行已入库：[`2026-09-23-tests-tenancy-leg-2`](../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md)（源码提交 `c9b5850`；入口层提供者是[实现映射节点](../../../realization/packages/tenancy/governance-center-entry/README.md)，承载装配是 [`apps/tenancy-host`](../../../realization/apps/tenancy-host/README.md)）。
> V-1～V-14 与 SC-1～SC-3 都有通过的承担者；V-15 部分；V-16 无证据。模型检查、样例自检与实现测试是三类证据，分开陈述（[结果与反例](#结果与反例)）；**通过不提升或改变任何接受状态**。

## 证据义务

下表「实际证据入口」一栏里测试的承担者写成「文件 › describe › it」，来自 run `2026-09-23-tests-tenancy-leg-2`（逐条状态在它的 `cases.tsv`）；
不带路径的文件在入口层包 `packages/tenancy/governance-center-entry/tests/` 下，装配的写 `apps/tenancy-host/tests/…`，静态检查的写 `tools/ts-checks/tests/…`。

| 规范条款与性质 | 证据形式与抽象映射 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| **V-1** 判定次序 × 四种入口答复 × 「判不了优先于无效」：[S-6](v1/contract.md#s-6-四种入口答复)、[S-7](v1/contract.md#s-7-答复集合闭合)、[S-8](v1/contract.md#s-8-协议版本与跨版本不变的两样)、[S-10](v1/contract.md#s-10-判定次序)、[S-11](v1/contract.md#s-11-认人)、[S-12](v1/contract.md#s-12-身份推导)、[S-13](v1/contract.md#s-13-补授权)、[S-14](v1/contract.md#s-14-失败映射)、[S-18](v1/contract.md#s-18-公开体检)、[S-19](v1/contract.md#s-19-免认人的两条路由注册登录)、[S-33](v1/contract.md#s-33-认出人之后登录状态被撤销) | TLC：[`EntryDecision.cfg`](v1/formal/EntryDecision.cfg) 的十三条绑定条款的不变量（另有 `AnsweredClosed`，由 `TypeOK` 推出、只作回归）；映射见 [formal/README](v1/formal/README.md#本版本选用什么) | **已执行**（[下表](#实际执行)）：无反例，完整穷尽；入库的一次是 run `2026-09-23-formal-governance-center-entry` | 范围：一次行为一个请求、模型抽象之内。**S-7 只到「失败集合之外的东西收成 `unavailable`、不成为第四类答复」**（`DefectIsUnavailable`），具名值的枚举闭合归 Schema（V-4）。**逐字节相同不在模型里**（V-5）；**哪个身份值、哪个组织**不在模型里（V-9、V-13）；补授权多个组织「不短路」不在模型里（V-7） |
| **V-2** [S-10](v1/contract.md#s-10-判定次序) 的进展、[S-32](v1/contract.md#s-32-进展性质与前提) 的「这一次就得到答复」 | TLC：`EventuallyAnswered`，前提只有 **P1**（中心在运行）——模型里是 `WF_vars(Pipeline)`；环境不受公平性约束 | **已执行**：时序性质在 776 个状态上检查完，无反例（同一入库 run） | **模型只用到 P1**：P2～P4 在模型里是答复分支（读不到答 `unavailable`、版本对不上答 `version-mismatch`），不是前提；P1 在真实系统里由运维者兑现，不是被证明的事实 |
| **V-3** 模型断言不平凡 | 有效性核对 [`Validity_Reachability.cfg`](v1/formal/Validity_Reachability.cfg) ＋ 八个变异配置（断言集合与时序性质都与正配置相同） | **已执行**：九条「从不」全部被违反；八个变异各得预期反例（同一入库 run） | **五条断言没有专门变异**：`HealthUnconditional`、`ExemptIgnoresPresentation`、`ExemptInputWithoutLookup`、`RejectionOnlyWhenJudged`、`NoDomainWithoutGates`。它们的前件可达，但没有证明它们会失败。责任：本契约的下一轮修订 |
| **V-4** Schema 与样例一致 | 逐节把 [examples.md](v1/examples.md) 的第一列喂给 `$defs`，与第二列比对 | **已执行**：255 条实例，0 条不符；85 个定义项里 73 个被直接校验、各至少一条通过一条拒绝，27 条路由的载荷与成功返回都在其中。另由 run `2026-09-23-tests-tenancy-leg-2` 的[独立核对](../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md#二入口契约-schema三份副本与-examplesmd-的样例)用产品运行期的校验器（入口层包的 `entryValidator`）逐行求值：73 个定义、255 行、0 行不一致；包内三份 Schema 副本与 `spec/` 逐字节相同 | 其余 12 个定义项只被间接求值（清单在 [examples.md](v1/examples.md) 页首）。`issuedAt`、`startedAt` 引用 `data.offer-expiry` v1 的 `Instant`，时间点形状由它的 pattern 断言；`format: date-time` 仍只作注解。**`credential` 的内部格式不在 Schema 里**，归凭据方案 owner 的解析规则（V-13） |
| **V-5** [S-6](v1/contract.md#s-6-四种入口答复)、[S-11](v1/contract.md#s-11-认人) 整个线上答复逐字节相同 | 规范场景 [S-39](v1/contract.md#s-39-规范场景拒绝逐字相同)：六种不认情形 ＋ 撤销落在认人与办事之间，比较传输层状态、头与体 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：桩 `decide.spec.ts` › `T-2 桩那一半：六种不认与其间撤销逐字节相同；表示层不合格不调 exchange`（3 条）；真实组合 `center.spec.ts` › `T-2 线上逐字节相同（真实组合）`（2 条）；与传输绑定 `examples.md` 的快照比对 `bytes.spec.ts` › `T-2：四种入口答复与 examples §1、§3 逐字节相同`（5 条）等；另有该 run 的独立字节核对（函数级） | 受阻消费者：据点一侧的客户端代理。**TLC 的「同一个答复值」不能替代这一条** |
| **V-6** [S-10](v1/contract.md#s-10-判定次序) 答复的先后（真实组合） | 规范场景 [S-38](v1/contract.md#s-38-规范场景答复的先后) | **已通过**（同 run）：`decide.spec.ts` › `T-3 判定次序（桩那一半）`（7 条）；`center.spec.ts` › `T-3 判定次序（真实组合）`（2 条） | 同上 |
| **V-7** [S-6](v1/contract.md#s-6-四种入口答复)、[S-13](v1/contract.md#s-13-补授权)、[S-14](v1/contract.md#s-14-失败映射) 三个出口不合并；补授权多个组织全部读完、不短路；缺陷在完整体检里可见 | 规范场景 [S-40](v1/contract.md#s-40-规范场景三个出口不合并)：故障注入让存储读不到、让领域给出集合外的值、让两个组织一个读不到一个「无效」并交换读的先后 | **已通过**（同 run）：`center.spec.ts` › `T-4 三个出口不合并（真实组合 + 运维面）`；`decide.spec.ts` › `T-4 缺陷那一半` | 责任：入口层提供者 ＋ 承载装配。`defectCount` 只计入口层自己记的缺陷（[S-26](v1/contract.md#s-26-完整体检)），场景只核这一层 |
| **V-8** [S-9](v1/contract.md#s-9-列表句柄)、[S-20](v1/contract.md#s-20-登录状态的两条路由撤销列出) 列表不给能直接用的东西；按 `LoginStateId` 撤销；备份里的值用不了 | 规范场景 [S-41](v1/contract.md#s-41-规范场景列表不给能直接用的东西)：列表那一半、撤销的幂等与查不到、备份那一半（含两个仍有效出示物的正对照） | **已通过**（同 run）：`center.spec.ts` › `T-5 列表句柄、撤销与备份（真实组合）`（4 条，含备份那一半）；`decide.spec.ts` › `T-5 桩那一半：句柄、撤销与列表`（2 条） | 备份那一半在账号能力一侧另有 [AI S-46](../../capabilities/account-identity/v2/contract.md#s-46-存储里翻不出能用的出示物)；**本条从线上再验一次，不以那边的结果代替**；反过来，「三种形式都不出现在持久内容里」那一搜只归 AI S-46，本条的通过也不代替它。责任：入口层提供者 ＋ 承载装配（做备份） |
| **V-9** [S-12](v1/contract.md#s-12-身份推导)、[S-13](v1/contract.md#s-13-补授权) 身份推导与补授权 | 规范场景 [S-43](v1/contract.md#s-43-规范场景身份推导与补授权) | **已通过**（同 run）：`decide.spec.ts` › `T-6 身份推导与补授权（桩那一半）`（7 条）；`center.spec.ts` › `T-6 身份推导与补授权（真实组合）`（2 条） | — |
| **V-10** [S-15](v1/contract.md#s-15-δ--0每个请求现读入口不跨请求缓存)、[S-16](v1/contract.md#s-16-不记住来访不区别对待来者) 只认登录状态；中心一侧 δ = 0 | 规范场景 [S-42](v1/contract.md#s-42-规范场景只认登录状态不认客户端)：撤销之后**立刻**再来 | **已通过**（同 run）：`center.spec.ts` › `T-7 δ = 0：每个请求现读（真实组合）`；S-42 前半（不区别对待来者）`center.spec.ts` › `T-16 不记住来访、不区别对待来者` | 模型表达不了跨请求缓存，**只能靠这条** |
| **V-11** [S-27](v1/contract.md#s-27-governancecenterid-的形状与相等)、[S-28](v1/contract.md#s-28-铸造存放与不变) 中心标识 | 规范场景 [S-44](v1/contract.md#s-44-规范场景中心标识)，含「那一格启动时读不出来 ⇒ 起不来、不铸新的」「表还在、那一格不在 ⇒ 起不来、不铸新的」「值不合 S-27 ⇒ 起不来」「已有账号与组织却丢了那一格所在的表 ⇒ 启动前核对拒绝、不重建」 | **已通过**（同 run）：`center-id.spec.ts` › `读或铸（S-28 ④）`（8 条，含真并发首启 sqlite 一支）、`迁移前核对 governanceCenterPreflight（R-GC8；三支）`（3 条）、`T-8「表整个丢了」…`（3 条）；`lifecycle.spec.ts` › `T-8 经插件：中心标识的读或铸`（6 条）；装配一侧「表丢了」`apps/tenancy-host/tests/upgrade.spec.ts` › `assembly.upgrade-preflight-refuses…` 的 ③ 两条；真并发首启的 pg 一支在 pg 一侧（PostgreSQL 16.14）`apps/tenancy-host/tests/pg.spec.ts` › `pg 首跑 · 各包留给 pg 的支` › `入口层「真并发首启（pg）」…` | 责任：入口层提供者；最后一支由承载装配、存储提供者与入口层实现映射一起演练（判据归实现映射）。**读不到当作「未铸」**、**那一格不存在当作「未铸」**、**结构被丢时重建**这三种改坏必须真跑——它们最容易被一个「查不到就新建」抹掉 |
| **V-12** [S-24](v1/contract.md#s-24-有意不投影)、[S-25](v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由) 两张面没有第三张 | 规范场景 [S-45](v1/contract.md#s-45-规范场景两张面没有第三张) ＋ 静态检查 SC-1～SC-3 | **已通过**（同 run）：`center.spec.ts` › `T-9 客户端一面没有第三张面`；`ops.spec.ts` › `T-9、V-8 运维面的答复（S-21、S-26）`（2 条）、`V-8 运维面的承载（S-20）`（3 条）；静态检查见[下表](#静态检查义务) | — |
| **V-13** [S-4](v1/contract.md#s-4-请求信封) 重复成员、[S-14](v1/contract.md#s-14-失败映射) 缺陷清单、[S-19](v1/contract.md#s-19-免认人的两条路由注册登录)～[S-23](v1/contract.md#s-23-当前租户身份的两条路由) 路由表逐条映射 | 实现符合性测试：对 27 条路由的每一个可达失败值，观察线上答复等于路由表所写；含 `interrupted` 不改写、`identifier-held-by-expired-record` 不出现、空列表记缺陷、OG S-21／S-25 就调用方本人给出的 `accountNotActivated`／`accountDoesNotExist` 记缺陷、矛盾清单三项各记缺陷；第 ② 步的 AI S-44 与身份推导的 OG S-36 抛出、返回了却没有值或给出集合外的值 ⇒ `unavailable` 且 `defectCount` 加一（S-11、S-12）；身份推导的 OG S-36 返回 `invalidInput`（S-12）与补授权读到 `invalidInput` 或集合外的值（S-13 合成表第一行）⇒ 同样 `unavailable` 且 `defectCount` 加一；撤销路由把 `loginStateHandle` 原样交给 AI S-16、不先读列表，已撤销的再撤一次得 `ok`、AI S-16 的 `not-authorized` 上线为 `login-state-rejected`、`invalid-input` 上线为 `invalid-input`；信封四个成员各重复一次，答复落在 S-4 那张表写的那一步。**成员名以本契约 Schema 为准**：每条路由的请求过 `Envelope`、成功答复连同 `operation` 过 `Exchange`，再逐条对照参与条款 ①／⑤ 的散文，确认 [S-17 命名表](v1/contract.md#路由的线上成员命名表)的每一格都指得到一项 | **已通过**（同 run）：`decide.spec.ts` › `T-10：每条路由的每个可达失败值 ⇒ 契约路由表所写（S-14、S-19～S-23）`（142 条）、`V-9 与 T-10 的成功那一支：27 条路由的成功返回`（28 条）；信封四个成员重复 `decide.spec.ts` › `T-15 重复成员落在它那一步（S-4；https-json/1 S-8）`（9 条）；`credential` 的表示层 `decide.spec.ts` › `T-17 凭据表示层跟随 credentials.parse（S-19）`（2 条） | `credential`：核「凭据方案 owner 的解析规则判不过 ⇒ `invalid-input`，且那个值从不被交给领域」（注册、登录两条）；解析规则本身不在本契约里 |
| **V-14** [S-29](v1/contract.md#s-29-秘密不进任何输出)、[S-30](v1/contract.md#s-30-工程记录) 输出里搜不到秘密；工程记录边界 | 规范场景 [S-46](v1/contract.md#s-46-规范场景输出里搜不到秘密)：出示物按 AI S-46 的三种形式（原样、base64url 带／不带填充、十六进制大小写）逐一搜；另核工程记录只写入口层观察到的失败值，只有入口层自己的读（中心标识、`startedAt` 读钟、运维面现探）区分存储与钟 | **已通过**（同 run）：`center.spec.ts` › `T-11 秘密不进任何输出（本文件全部答复、体检、工程记录）`（出示物按三种形式搜）；`decide.spec.ts` › `T-2 桩那一半…` › `工程记录分得出 absent／multiple／malformed／judged`；`lifecycle.spec.ts` › `T-14 …` › `全部日志与启动失败说明里没有私钥、没有 config 的值（目录路径）`；装配一侧 `apps/tenancy-host/tests/lifecycle.spec.ts` › `assembly.keys-only-in-owner-config…`。按用例名，入口层那一搜的范围是 `center.spec.ts` 一个文件的全部输出 | Schema 挡得住完整体检里多出的成员（`FullHealthReply` 已封闭）；答复、公开体检之外的输出与工程记录里的秘密只能靠场景 |
| **V-15** [S-34](v1/contract.md#s-34-起来即整体停机时在途请求归谁) 起来即整体（两张面同起同停）；面缺席只在启动／停机／换代；启动以钟可读为条件；停机先停收、再等在途、再关闭 | 装配的启动与撤除测试：让任一参与方的面缺席，观察两张面都不应答；让存储或钟不可用，观察答复是 `unavailable` 而不是问不到；换代一个参与方的提供者，观察在途请求答完、新请求问不到、`defectCount` 不变、换代完成后两张面都恢复应答；另核装配在运行中不换代存储与时钟的提供者（S-34 的前提）；启动时让钟读不到，观察等到界内读到即起来、超界即起不来并点名是钟；停机时注入在途请求 | **部分**（同 run）。有：参与方缺席两张面都不应答 `lifecycle.spec.ts` › `T-12 inject 缺一即 PENDING ⇒ 装配启动失败`（9 条）与 `apps/tenancy-host/tests/lifecycle.spec.ts` › `assembly.pending-is-manifest-error…`（2 条）；同起同停、存储不可用答 `unavailable` 而不卸载 `lifecycle.spec.ts` › `T-12 两张面同起同停；存储不可用时不卸载`（2 条）与 `ops.spec.ts` › `T-18 两张面同起同停与十项的来源`（12 条，含两种次序的 `storage` 换代演练）；起来之前的失败外面问不到 `apps/tenancy-host/tests/lifecycle.spec.ts` › `assembly.no-commit-before-open 与 assembly.entry-loads-last`（3 条）；启动以钟可读为条件 `apps/tenancy-host/tests/slow.spec.ts` › `assembly.clock-ready-timeout ②③ 与快速重启`（2 条）；停机 `lifecycle.spec.ts` › `T-12 停机时的在途请求（S-34）`（2 条）与 `apps/tenancy-host/tests/lifecycle.spec.ts` › `assembly.dispose-reverse-order 与 assembly.dispose-with-inflight`（2 条）；参与方换代 `apps/tenancy-host/tests/lifecycle.spec.ts` › `assembly.credentials-swap-no-rerun（CV 换代演练）`（用例名写「入口层随之关门再开门」）。无同名用例的：换代中在途请求答完、`defectCount` 不变两件；「装配在运行中不换代存储与时钟的提供者」这一前提的核对 | 责任：承载装配；「存储或钟不可用不表现为面缺席」由存储与时钟的提供者兑现 |
| **V-16** [S-8](v1/contract.md#s-8-协议版本与跨版本不变的两样) 跨版本不变的两样在传输上也稳定 | 两个协议版本的传输绑定工件逐项比对：`version-mismatch` 的识别方式与公开体检请求的发法相同 | **无证据**：[G-10](v1/contract.md#十三已知缺口) 已由 [D-029](../../../record/decisions/governance-center-transport-binding-acceptance/decision.md) 闭合（`composition.governance-center-entry-https-json` v1 接受并冻结），但只有这一个协议版本的传输绑定工件，「两个版本逐项比对」现在没有对象。两样在 v1 传输上的取值由 https-json 的 V-2 钉在测试里（见[那份验证入口](../governance-center-entry-https-json/verification.md#证据义务)） | 责任：入口层的实现映射节点 |

### 静态检查义务

| # | 检查什么 | 守的条款 | 状态 |
|---|---|---|---|
| SC-1 | 客户端一面的路由表**恰为** [S-17](v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读) 列出的 27 条加公开体检，没有泛化分派；入口层不引用 `capability.account-identity` v2 的 S-13／S-14／S-17／S-18／S-38（认人只走 S-44，线上来的 `LoginStateId` 不进 S-17）、`capability.organization-governance` v1 的 S-20／S-53、`composition.account-registration` v1 清除链的任何面 | [S-17](v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读)、[S-24](v1/contract.md#s-24-有意不投影)、[S-36](v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：路由表 `decide.spec.ts` › `T-1 路由表封闭（S-17、S-24；SC-3）`（3 条）；限定调用点 `tools/ts-checks/tests/rules.spec.ts` › `restricted-call-sites`、`tools/ts-checks/tests/entry-rules.spec.ts` › `restricted-call-sites：入口 SC-1 新增的四个方法`（2 条）；认人只走 AI S-44 `entry-rules.spec.ts` › `presentation-only-authn`（4 条）；`pnpm run lint:rules` 在真实源码上退出 0 |
| SC-2 | 运维面所在的单元不引用任何治理能力（账号、登录状态、组织、成员资格、邀约、清除、注册）的面；运维面上恰有完整体检一个操作；两张面不共用通道 | [S-25](v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由)、[S-36](v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) | **已通过**（同 run）：`tools/ts-checks/tests/entry-rules.spec.ts` › `ops-import-whitelist`（5 条）、`ops-event-whitelist`（4 条），`lint:rules` 退出 0；运维面恰一个操作、两张面不共用通道 `ops.spec.ts` › `V-8 运维面的承载（S-20）`（3 条）、`T-9、V-8 运维面的答复（S-21、S-26）`（2 条） |
| SC-3 | 客户端一面没有读完整体检或写任何部署事实的路由；公开体检答复只由启动时载入的三样构造 | [S-18](v1/contract.md#s-18-公开体检)、[S-24](v1/contract.md#s-24-有意不投影) | **已通过**（同 run）：`decide.spec.ts` › `T-1 路由表封闭（S-17、S-24；SC-3）` › `SC-3：本包源码不按名字解析服务或方法…`；`center.spec.ts` › `T-9 客户端一面没有第三张面` |

## 实际执行

**已入库的运行（2026-09-23）：**

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| [`2026-09-23-formal-governance-center-entry`](../../../record/evidence/2026-09-23-formal-governance-center-entry/README.md)（V-1、V-2、V-3） | formal task `governance-center-entry-v1-decision`（`EntryDecision.cfg`，命令与登记逐项相同：`-workers 1 -cleanup -noGenerateSpecTE`，无 `-continue`）与九个否定配置；输入快照与当前 `v1/formal/`、`frozen.json` 逐字节相同（下面哈希表的十一个文件）；TLC 2026.09.12（rev 867aefb）、Temurin 21.0.12.1、1 worker；源码提交 `c9b5850` 的工作树 | 正配置**无反例**、退出 0：初始 224 · 804 generated · 776 distinct · 0 left · 深度 9，`EventuallyAnswered` 在 776 个状态上检查完；九个否定配置各出预期反例（八个变异无 `-continue` 时退出 12）；另经设计检查器执行一次，`exit=0` | 该 run 的 `governance-center-entry-v1-decision/`（输入、原始输出、`validity-check/`）、`commands.txt`、`exit-codes.tsv` |
| [`2026-09-23-tests-tenancy-leg-2`](../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md)（V-4 的独立核对、V-5～V-15、SC-1～SC-3） | 源码提交 `c9b5850`；入口层包 `tests/` 十三个文件（参与方桩；真实组合：真实 CV／AI v2／OG／AR 与入口层两个插件同装一个 Cordis Context，`storage-sql` sqlite 临时文件库，钟是包内替身；真 TLS 与真 Unix 套接字）；`apps/tenancy-host/tests/` 的装配用例（真实 clock、子进程）；`tools/ts-checks` 自测与 `pnpm run lint:rules`；Node v24.18.0（OpenSSL 3.5.7）、vitest 4.1.11；pg 一侧只有 `apps/tenancy-host/tests/pg.spec.ts`（PostgreSQL 16.14） | 全部 0 失败：入口层包 424 条 **422 通过、2 跳过**（两条占位，承担者在 `apps/tenancy-host`）；`apps/tenancy-host` 102 条 91 通过、11 跳过（整个 `pg.spec.ts`，pg 一侧 11/11 通过）；`tools/ts-checks` 65/65；`lint:rules` 退出 0（20 条规则，扫描 `packages/`、`apps/`）；Schema 样例 255 行、0 行不一致（产品运行期的校验器） | 该 run 的 `output/`、`json/`、`output-pg/`、`byte-checks/`；义务对应 [`coverage.md`](../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagestenancygovernance-center-entry) |

两行分属两类证据：形式那一行是**契约模型**的结果，不说明任何实现；测试那一行是**入口层提供者与承载装配**的结果，不说明模型性质。
**有限检查不写成无条件证明**：模型只在一次行为一个请求、流水线带弱公平的前提下成立；测试在 sqlite 临时文件库、单主机、各跑一次下成立，真实组合里入口层包内的钟是替身（真实 clock 的组合在 `apps/tenancy-host`），pg 只跑了 `pg.spec.ts` 的 11 条；客户端一侧（传输绑定的 V-10、G-11 防冒充的客户端规则）没有承担者——`apps/cli` 不存在。

**下面是此前起草者自跑的记录，原始输出未入库；同一模型与配置的入库执行见上表。**

**2026-09-23，起草者在工作树 `panqiwei/tenancy-leg-2` 上执行**，工作目录为 `design/`；本表是**评审第二轮修订之后**的重跑：模型的 `Authenticate` 新增一个缺陷分支（AI S-44 给出失败集合之外的东西，契约 S-11），`RejectionUniform` 的「判得了」加上「没有缺陷」，两处注释改正（矛盾清单 ③、`DefectIsUnavailable` 覆盖认人）；十个配置字节未变。状态数与三处计数随之变化（下表），其余与上一轮相同。此前各次的结果随哈希变更作废。原始输出未入库。

| 配置 | 命令要点 | 结果 |
|---|---|---|
| [`EntryDecision.cfg`](v1/formal/EntryDecision.cfg)（formal task `governance-center-entry-v1-decision`） | 与 [formal-tasks 登记](../../../registry/README.md)的命令相同：`-workers 1 -cleanup -noGenerateSpecTE`，无 `-continue` | **退出 0，无反例**；初始 224 个状态；804 generated · 776 distinct · 0 left on queue · 深度 9；十五条不变量（含 `TypeOK`）逐状态检查；时序性质 `EventuallyAnswered` 在 776 个状态上检查完 |
| [`Validity_Reachability.cfg`](v1/formal/Validity_Reachability.cfg)（否定配置，不登记） | 加 `-continue` | 退出 0（`-continue` 下 TLC 不以违反为失败退出）；**九条全部被违反**：`NeverVersionMismatch` 96、`NeverInvalidInput` 70、`NeverHealth` 64、`NeverDefect` 36、`NeverUnavailable` 34、`NeverRejected` 28、`NeverResult` 12、`NeverGatePassed` 8、`NeverLateRevocation` 4（违反状态数）；状态空间与正配置相同 |
| [`Validity_passthroughStateNotValid.cfg`](v1/formal/Validity_passthroughStateNotValid.cfg) | 无 `-continue`；另以 `-continue` 跑一次 | 退出 12，`LateRevocationUniform` 被违反；`-continue` 下只有它（2 次） |
| [`Validity_unavailableAsRejected.cfg`](v1/formal/Validity_unavailableAsRejected.cfg) | 同上 | 退出 12，`CannotJudgeIsUnavailable` 被违反；`-continue` 下只有它（20 次） |
| [`Validity_readPresentationBeforeVersion.cfg`](v1/formal/Validity_readPresentationBeforeVersion.cfg) | 同上 | 退出 12，`VersionFirst` 被违反；`-continue` 下 `VersionFirst` 64 次、`EnvelopeBeforeAuth` 64 次 |
| [`Validity_inputBeforeAuth.cfg`](v1/formal/Validity_inputBeforeAuth.cfg) | 同上 | 退出 12，`RejectionUniform` 被违反；`-continue` 下 `RejectionUniform` 12 次、`InputAfterAuth` 4 次 |
| [`Validity_gateUnavailableAsDenied.cfg`](v1/formal/Validity_gateUnavailableAsDenied.cfg) | 同上 | 退出 12，`CannotJudgeIsUnavailable` 被违反；`-continue` 下只有它（2 次） |
| [`Validity_defectAsResult.cfg`](v1/formal/Validity_defectAsResult.cfg) | 同上 | 退出 12，`DefectIsUnavailable` 被违反；`-continue` 下只有它（36 次） |
| [`Validity_authBeforeEnvelope.cfg`](v1/formal/Validity_authBeforeEnvelope.cfg)（评审第一轮修订新增） | 同上 | 退出 12，`EnvelopeBeforeAuth` 被违反；`-continue` 下只有它（84 次） |
| [`Validity_deriveBeforePayload.cfg`](v1/formal/Validity_deriveBeforePayload.cfg)（评审第一轮修订新增） | 同上 | 退出 12，`PayloadBeforeDerive` 被违反；`-continue` 下只有它（22 次） |
| 同一 formal task，经设计检查器执行 | `make design-check FORMAL=run`（即 `check_design.py --root .meta_harness/design --formal run`，在工作树根） | 评审第二轮修订之后：`FORMAL governance-center-entry-v1-decision: executed; exit=0`（同次另执行了已登记的四个任务，均 exit 0）；检查器整体 `PASS: design tree … passed gate=internal; formal=run.`；同次 `make docs-check`：`PASS: 801 Markdown files; local links and skill mirrors.` |
| [examples.md](v1/examples.md) 对 [Schema](v1/governance-center-entry.schema.json) 自检 | jsonschema 4.26.0 ＋ referencing 0.37.0，Draft 2020-12，注册表含本 Schema、`data.identity-values` v1 与 `data.offer-expiry` v1 的 Schema | 首稿 70 条；主线裁决修订后 84 条；线上形状定稿后 221 条；评审第一轮修订后 245 条；**改钉账号能力 v2 后 255 条、0 条不符**（`LoginStateHandle` 一节换成出示物 `LoginStatePresentation` 一节，含空串、首尾空白、尾随换行、前导 U+FEFF、孤立代理码点五个反例与一个成对代理的正例；1024 的上界另以 1024／1025 个码点各一次手工探测，结果为通过／拒绝，未写进样例表；信封加「AI S-44 不是路由」「v1 的路由标识不在表里」两例；句柄改按 `LoginStateId` 校验）；AI v2 评审修订之后的牵连核对与评审第二轮修订之后各再跑一次，仍是 255 条、0 条不符；每次 `check_schema` 都通过 |

**工具与环境**：TLC2 Version 2026.09.12.025210（rev 867aefb），OpenJDK Temurin 21.0.12.1，1 worker，Linux 5.15 amd64。

**被检查文件的 SHA-256**（结果只绑定这些修订）：

| 文件 | SHA-256 |
|---|---|
| `v1/formal/EntryDecision.tla` | `05006b6c3ca100d3c5182a6a701044c988a38b08af76a09223f4ee1ffafd24a0` |
| `v1/formal/EntryDecision.cfg` | `12cd556423baedc91761f932ee2e686a1fb4bbf1cb1278d78de1d9c4e0cd4e26` |
| `v1/formal/Validity_Reachability.cfg` | `9949177bb351b7c7ada65ed7b1686de145a15f65085903e350829ace1acccdc8` |
| `v1/formal/Validity_passthroughStateNotValid.cfg` | `3701c37d37fd09db78ae46660fd225669f75e610e6a17f91c4faefdf573e9af4` |
| `v1/formal/Validity_unavailableAsRejected.cfg` | `e50939eb0ce697cc8591f3cbe7c7bece61c9f073b6b750c4ea4272483fda8a88` |
| `v1/formal/Validity_readPresentationBeforeVersion.cfg` | `2029dbcf6d0dc12e610e7daff161f884698e34c1f890f7736bea6511edc3ca5d` |
| `v1/formal/Validity_inputBeforeAuth.cfg` | `45ba38425a16981c50b027f9823ac32991a92fdf0e6f0b6827e4090ea83f7315` |
| `v1/formal/Validity_gateUnavailableAsDenied.cfg` | `60b7d27b324765a917985b2148b97dadd87fb2d1742ef6a154f1abf6bd0704dc` |
| `v1/formal/Validity_defectAsResult.cfg` | `d6fa442ff09cba54fdf367e7a1fefef94c60983e417297df9a04fef6fdde19bf` |
| `v1/formal/Validity_authBeforeEnvelope.cfg` | `d1580671536a87d03bb7d943be14c9c0fadaccf9774ee696a3c7762b1917e28b` |
| `v1/formal/Validity_deriveBeforePayload.cfg` | `97be78b86fc6a3855c63da980a9466a460f8606852bf3f1e35188cb00641ca91` |

**重现**：在 `design/` 下导出 `JAVA_BIN` 与 `TLA2TOOLS_JAR`，正配置用登记的命令；否定配置把 `-config` 换成对应文件，可达性那一个另加 `-continue`。

## 结果与反例

- 正配置：**没有反例**。范围是模型抽象之内、一次行为一个请求；不外推到多请求交错、传输落地或真实存储。
- 否定配置：反例都是**预期的**，它们证明对应断言有内容，不是缺陷。
- 必须分开陈述的三类结果：**模型检查**（上面两张表的 TLC 行）、**样例自检**（起草者表末行与测试 run 的独立核对）、**实现的符合性**（测试 run：V-5～V-14 与 SC-1～SC-3 的承担者通过，V-15 部分，0 失败）。前两类通过不说明第三类，第三类通过也不说明模型性质。
- 实现测试**没有反例**，但有两处按用例名看不出的地方记在义务表里：V-14 入口层那一搜的范围是一个测试文件的输出；V-15 换代中的在途请求与 `defectCount` 没有同名用例。

## 变化的影响

| 时间 | 变化 | 对证据的影响 |
|---|---|---|
| 2026-09-23 | 首稿：v1 候选包成稿，登记 catalog、covers、formal-tasks | 上表为首次执行。此后模型或任一配置改动，按哈希判断上表是否仍适用，不适用的整行作废重跑 |
| 2026-09-23 | 按主线裁决原地修订（未冻结）：表示名与交换表示定稿（原 G-5 闭合），载荷与返回的成员名改为规则（沿参与方契约的 Schema，入口不改名），登录成功返回 `{ loginState, loginStateHandle }`、列表项 `{ loginStateHandle, issuedAt }` 进 Schema；完整体检加 `defectCount` 并封闭成员集合（原 G-6 闭合）；缺口重编号 G-7→G-5、G-8→G-6 | **形式模型与七个配置字节未变，上表 TLC 结果仍适用**（哈希不变）。Schema 与样例变了：自检已重跑，结果见「实际执行」末行 |
| 2026-09-23 | 按主线裁决原地修订（未冻结）：线上载荷与成功返回的形状归本契约——S-17 加命名表（27 行）与三类「推导／推不出」说明；Schema 新增 67 个定义（每条路由 `Payload_<路由>`／`Result_<路由>`、五个共用形状、七个值定义、`Exchange`），`Envelope.payload` 按 `operation` 判别；`data.offer-expiry` v1 登为依赖（S-4、S-7、S-14）；新开 G-7（命名表待主线认可） | **形式模型与七个配置字节未变，TLC 结果仍适用**：模型把路由结果收成一个 `result`，不涉成员名。样例自检已重跑（221 条）。V-13 改为以本契约 Schema 为准逐条对照参与条款散文 |
| 2026-09-23 | 主线通读并认可 S-17 命名表（当时编为 G-7 并删行，缺口回到 G-1～G-6）；`offerTtl`「不是整数」答 `invalid-input` 的说明改为定稿措辞 | Schema、examples、模型与配置均未改动，V-4 与 TLC 结果仍适用 |
| 2026-09-23 | **按 spec-reviewer 第一轮评审的主线裁决原地修订（未冻结）**：`credential` 线上为非空字符串、表示层用凭据方案 owner 的解析规则（登 AI S-26）；缩写与全部跨契约引用改为坐标或链接，路由表用「认人所得 `AccountId`」「推导所得 `TenantId`」；S-34 起来即整体覆盖两张面、面缺席只在启动／停机／换代、存储与钟不可用只表现为返回值、启动以钟可读为条件；S-8 两样在传输上也跨版本稳定；补授权 `invalidInput` ⇒ 缺陷、多个组织全部读完不短路；S-14 按「交给领域的输入里有没有来自载荷的项」分支、矛盾清单封闭为四项、OG S-21／S-25 调用方本人的两个值记缺陷；`defectCount` 收窄为入口层自记；S-28 只在治理事实为空时铸造；S-30 工程记录只写入口层观察到的失败值；S-4 四个成员重复各归一步；S-9 句柄跨重启与换密钥稳定；S-36 残余暴露、OE S-17 第 4 行单列、出示物不可伪造改写为前提；各路由表补第 9 件事一列；正文补齐 covers 对应的产品小节链接。**缺口编号按 id-namespaces 规矩恢复**：G-5、G-6 标已闭合；原「效力不变」回到 G-7、「多进程」回到 G-8；上一行误编为 G-7 的命名表改为 G-9（已闭合）；新开 G-10 传输绑定、G-11 防冒充。Schema：`CredentialMaterial` 非空字符串、`OfferTtl` 上界 2⁵³−1、三个不透明标识自定值定义（不再 `$ref` IV 内部基定义）、`issuedAt`／`startedAt` 改引 OE `Instant`、`GovernanceCenterId` 标题改 Identifier；catalog 登 AI S-26、OE S-17 与 S-22 | **模型与全部配置已改**：新增 `EnvelopeBeforeAuth`、`PayloadBeforeDerive` 两条断言与 `authBeforeEnvelope`、`deriveBeforePayload` 两个变异；`Derive`／`Gate` 加缺陷分支；可达性核对加 `NeverDefect`；八个变异配置都带 `PROPERTIES EventuallyAnswered`。**此前的 TLC 结果全部作废**，「实际执行」一节是重跑结果，哈希随之更新。样例自检重跑（245 条）。V-1、V-2、V-3、V-4、V-7、V-11、V-13、V-14、V-15 改写，新增 V-16 |
| 2026-09-23 | **按主线指令改钉 `capability.account-identity` v2 原地修订（未冻结）**：依赖由 v1 改为 v2（`candidate`），S-2 消费面加 S-44、S-45（S-17 保留，作 S-44 判定的来源，本组合不调用它）；S-5 出示物改为 AI S-45 的登录状态出示物，交换表示**直接取 AI S-45 的「交换表示」一行**（Unicode 标量值序列、非空、至多 1024 个标量值、首末不在 IV S-31 空白码点表里），INT-011 链接；S-9 列表句柄就是 `LoginStateId`，入口层不再派生句柄，「跨重启换密钥稳定」改由 AI S-45 派生式保证；S-11 认人改调 AI S-44，六种不认情形不变，拿 `LoginStateId` 当出示物归「查不到」；S-12 新增「认人所得 `LoginStateId`」，OG S-36／S-37、AI S-16／S-37 用它；S-14 矛盾清单由四项减为三项（「按句柄匹配到不止一项」随句柄派生一并消失）；S-20 撤销把载荷里的 `LoginStateId` 原样交给 AI S-16、一次调用，已撤销的再撤一次得 `ok`，AI S-16 的 `invalid-input` 上线为 `invalid-input`；S-31 前提与 S-36 改写：「出示物不可伪造」改为「出示物猜不中」（安全性在出示物的熵上，由 AI 兑现），新增「只有 AI S-44 认出示物」「出示物只交到调用方手里」两行，第 2 行加 INT-012 链接；S-10、S-13 加 INT-013、INT-014 链接；S-41 覆盖备份那一半并加正对照；**G-1 闭合**（号保留）；S-2 消费者一栏改为节点与 tenancy-host 的现状。**派生后果**：账号能力三条路由的标识随被投影条款坐标变为 `capability.account-identity/v2#S-15`／`#S-16`／`#S-37`（线上可见）。Schema：删 `LoginStateHandle`，新增 `LoginStatePresentation`（`minLength` 1、`maxLength` 1024、`not.pattern` 排除孤立代理码点、首末空白 pattern 与 IV S-31 同一张表），`presentedLoginState` 与 `LoginResult.loginState` 引用它，三处 `loginStateHandle` 改引 IV `LoginStateId`，`EnvelopeRouteId` 与两处按路由判别的 `if` 改为 v2 坐标。catalog：对 AI 的依赖改钉 v2，clauses 加 S-44、S-45；covers：PF-017 §8 与 acceptance §三两条的 note 去掉「本版不满足」 | **模型只改注释**（`PresKinds` 上一行「现读 AI S-17」→「现读 AI S-44」，并注明拿 `LoginStateId` 当出示物与 `neverIssued` 同一答复）：七种出示物情形与 AI S-44 的三个出口一一对应，出示物的形状、句柄与路由标识本来就不在模型里，**不需要改断言或配置**；因 `.tla` 哈希变了，正配置、可达性核对与八个变异全部重跑，数字与上一轮逐项相同（见「实际执行」）。样例自检重跑（255 条、0 条不符）。V-8、V-13、SC-1 改写；V-4 条数更新 |
| 2026-09-23 | **AI v2 评审修订（5041f4e）之后的牵连核对（未冻结）**：S-36「只有 AI S-44 认出示物」行左列按 AI S-30 第 10 行改为「用来认人的那个 `LoginStateId`（S-17 输入、S-16 发起方、S-37 调用方）来自 AI 自己的结果，S-16 的目标不在此列」，右列补「OG S-36／S-37 的那个也是认人所得」；「出示物猜不中」行与 S-31 写明是 AI 的**提供者义务**；S-2 的 AI S-16／S-37 两处消费说明补来源规则（目标可来自线上、发起方与调用方按来源读）；S-20 撤销一行引 AI S-16「目标可以来自线上载荷」；S-9 交换表示一行写明句柄的表示层只用 IV S-31、不收紧到 64 个十六进制字符（AI S-45）；S-5 删去「那一行变了本条跟着变」，保留「上界 1024 是 AI S-45 的候选值，随它的接受一起定」；S-36 第 2 行残余暴露的理由改写——「`AccountId` 猜不出、枚举不了」是前提，归 AI G-2 的 `AccountId` 那一半（该半已退回为开放）；S-41 写明与 AI S-46 的分工；S-46 出示物按 AI S-46 的三种形式搜 | **Schema、样例、模型与全部配置未改**：S-45 交换表示与本包 `LoginStatePresentation` 逐项一致（标量值序列、非空、≤1024、首末空白），不需要改；TLC 结果与哈希仍适用。样例自检重跑确认（见「实际执行」）。V-8、V-14 改写 |
| 2026-09-23 | **PF-017 rev 1 被产品负责人正式接受**（rev 不升，[decisions §一](../../../product/PF-017-governance-center-as-deployable-application/decisions.md#2026-09-23--正式接受)）：契约抬头、README、本页页首与 `spec/README.md` 当前状态里的「PF-017 rev 1 仍是 draft／依据它的都是候选依据／PF-017 接受前本契约不进入接受」改为「PF-017 rev 1 已接受（2026-09-23）」；covers 本契约 30 条 note 同改。本契约状态仍是 `candidate`，接受另行决定；「AI v2 被接受之前本契约不进入接受」保留 | 条款、Schema、样例、模型与配置都未改；证据义务与执行结果不受影响 |
| 2026-09-23 | **按第二轮 spec-reviewer（无阻断，12 应修）与 architecture-reviewer（1 阻断）的主线裁决原地修订（未冻结）**。**B-1**：S-28 不再判「治理事实是否为空」——那一格与存储结构同时立起、初始为「未铸」；三种读法：「未铸」⇒ 铸造并写入、已铸且合 S-27 ⇒ 用它、那一格不存在或值不合 S-27 ⇒ 启动失败；失败集合恰为四支；「恢复不全把结构整个丢了」写成前提，由存储提供者的迁移前只读核对挡住（装配给），S-36 新增「那一格立起过就不被重建」一行；S-44 规范场景改写第 4 句并新增「值不合 S-27」「丢了整个结构」两句（E-10 情形一随之闭合，情形二随 B-1 消失）。**E-1**：S-11 出口表、S-12 推导行各加「失败集合之外 ⇒ `unavailable`，记为缺陷」，S-14 缺陷全集覆盖 S-11、S-12、S-13 与 S-19～S-23。**E-2**：Schema `RouteSuccess` 说明、`Payload_AI_S37` 标题、样例 §14.4 依据句改为与 S-9／S-20 同一说法。**E-3**：`.tla` 与 formal/README 的「矛盾清单 ④／四项」改「③／三项」。**E-4**：S-2 与 catalog 补登 AI S-46。**E-7**：S-31 第 3 行前提写明注册组合把判不了收成 `interrupted` 的例外。**E-8**：S-6 与 S-10 对 `invalid-input` 同一句（含信封层）。**E-9**：S-9 写成 AI S-16／AI S-17／AI S-37。**N-2**：S-34 与 S-36「起来即整体」行加前提「本版运行中不换代存储与时钟的提供者」。**N-6**：S-34 声明升级整体性与启动前只读核对不归本契约，新开 **G-12**；covers 新登 PF-017 §6.9 → S-34、§6.10 加 S-34，两条 note 指到 G-12。**S1**：S-13 合成表表头改「按本表行序」。**S3**：S-19 写明 `credential` 解析规则的发布处是 `credential-verification` 节点，换方案须发本契约新版本 | **模型已改**：`Authenticate` 新增缺陷分支（随 E-1），`RejectionUniform` 的前件加「没有缺陷」，两处注释改正；十个配置未改。**全部配置重跑**：正配置 776 distinct（原 756）；可达性 `NeverDefect` 36（原 16）；变异 `defectAsResult` 36 次（原 16）、`authBeforeEnvelope` 84 次（原 64），其余不变；哈希已更新。formal/README 的映射表加 S-11 与 `Authenticate` 缺陷分支。样例自检重跑。V-2、V-11、V-13、V-15 改写 |
| 2026-09-23 | **第二个架构评审 W-2**（按主线指令，未冻结）：S-32 的 P3 与 S-36「运行中钟往回倒」一行加例外——跨 OS 崩溃或断电，「时钟不后退」不在本契约承诺内，依据 [D-027](../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md)（sqlite `synchronous=NORMAL`）；写明这是装配给的边界、协议补不了 | 判定、失败集合、Schema、样例、模型与配置都未改；证据义务不变——跨 OS 崩溃的回拨本来就不在任何一条证据义务里 |
| 2026-09-23 | **按第三轮 spec-reviewer（无阻断，定向复评）的主线裁决原地修订（未冻结）**：S-28 ② 限定为读或铸那一步不看别的数据；S-28 前提、S-36「那一格立起过就不被重建」与 S-44 两句的判据统一为「已有别的治理事实却没有那一格所在的表」（判据归实现映射、机制归存储提供者），「整个存储结构」统一改称「那一格所在的表」；S-32 例外改写为进展表映射的例外、只引 D-027；S-36 新增「已提交事实跨 OS 崩溃」一行统一登记 D-027 边界对 S-28／S-31／S-34 的影响，S-31 中心标识行前提补齐；S-34 的「不归本契约」标题收窄到 §6.9 与 §6.10 第 1 行；S-11／S-12 缺陷行明确「返回了却没有值」、「一直不返回」归 S-32；covers 的 §6.10 拆为 S-36 真覆盖与 S-34 缺口登记两条 | 判定、失败集合、Schema、样例、模型与配置都未改；V-11 措辞与 S-44 对齐；V-13 补两支缺陷计数（OG S-36 返回 `invalidInput`、补授权读到 `invalidInput` 或集合外的值）|

## 已知的来源问题（黑盒验收 2026-09-23 核出，待裁）

三处不是实现缺陷：实现照冻结契约做；是产品正文与契约、或两份契约之间没写定。裁决归产品负责人与各契约 owner，裁前本表只登记。

| # | 冲突 | 现象 | 待裁 |
|---|---|---|---|
| A-1 | [PF-001 flows §二「撤销登录状态 2」](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)要用户看到「这个登录已经不在有效之列」；[S-20](v1/contract.md#s-20-登录状态的两条路由撤销列出) 与 AI S-16 定「已撤销 ⇒ ok」 | 再撤同一目标线上答 `ok`，客户端分不出 | 产品正文改读法（客户端先列有效登录状态再撤），或入口契约新版本给可区分答复 |
| A-2 | PF-001 flows §二「注册 1」要用户看到「具体哪条规则不满足」；[S-7](v1/contract.md#s-7-答复集合闭合) 与 Schema `RouteFailure` 无承载规则的成员 | 线上只有 `credential-rejected` | 入口契约新版本让规则上线，或客户端本地预检政策 |
| A-3 | [S-21](v1/contract.md#s-21-组织治理写路由) 「已解除后重发 ⇒ noSuchAffiliation」 vs OG S-33 ②「任一方」与 ⑦ 判定先后 | 下级重发得 `noSuchAffiliation`，原上级重发得 `notAuthorized` | 改写入口契约「重发」格，或 OG 先判「属性已空」（会向任何超管透露有无上级） |

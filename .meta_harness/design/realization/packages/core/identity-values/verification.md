## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 21 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# identity-values 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.identity-values/v1`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/identity-values` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**259 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 21 项 core-local、0 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/identity-values/verification.md`](../../../../spec/data/identity-values/verification.md)（V-1～V-14、SC-1～SC-n）。
本页只登记**落在本节点上的那一部分**，以及本节点为别的 owner 提供的检查器；其余义务各归它们的 owner 节点。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [V-1 形状校验](../../../../spec/data/identity-values/verification.md#证据义务)（S-1／S-3／S-4／S-5／S-7／S-8／S-9／S-10／S-11／S-12／S-31／S-32／S-35 的形状面） | `examples.md` 第 1～11 节的正反实例逐条过包内 `validate`，作为本包的测试；测试同时核对包内 Schema 副本与 spec 逐字节相同 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：`schema.spec.ts` › `V-1：examples.md 第 1～11 节的正反实例`（173 条）、`Schema 副本`（2 条）；副本逐字节另有该 run 的独立核对 | 本节点；测试落包并在 CI 跑过一次、结果登记进 [record/evidence](../../../../record/evidence/README.md) 即闭合 |
| S-5／S-7／S-13 值判定 | 结构相等、规范序列化唯一、`sameAccountDistinctTenants` 的单元测试（含 S-13 那条「只在 V-14 有落点」的值判定） | **已通过**（同 run）：`values.spec.ts` › `TenantId（S-5 / S-7）`（4 条）、`sameAccountDistinctTenants（S-13）`（2 条） | 本节点 |
| S-14／S-15 定义式 | 纯函数版 `ancestorChain`／`shareAncestor` 对着 [`Affiliation.als`](../../../../spec/capabilities/organization-governance/v1/formal/Affiliation.als) 的 `shareAncestor` 定义逐字核对（含自身、`ancestorChain` 不含自己），并给「一个组织与它自己的上级」这个曾经的反例一条测试 | **部分**（同 run）：单元测试有——`predicates.spec.ts` › `ancestorChain（S-14）`（4 条）、`shareAncestor（S-15）`（5 条，含那个曾经的反例）；本次新增 [有界机器对照](../../../../record/evidence/2026-09-26-tests-core-foundation/coverage.md#packagescoreidentity-values)：冻结模型 hash 守卫、6 个链集合与 36 个有序对，基准为实际 Alloy 输出；不是无条件等价证明 | 本节点；治理节点消费它 |
| [S-35](../../../../spec/data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant) 六条性质里**本模块能证的**：不透明（核实不解析）、绑定该标识、由产出方签发（错误密钥／错误用途／错误 AccountId 一律 `invalid`） | 单元测试：正例、四类反例（不带、绑另一标识、用途不符、自制字符串） | **已通过**（同 run）：`handoff-warrant.spec.ts` › `交接凭证（S-35）`（9 条：正例、反例 1～6、非规范 base64url、重放） | 本节点。**性质 4（不作废）与性质 6（不核领域事实）不在本模块证**——那是两个实例各自契约的规范场景（[`capability.account-identity/v1#S-41`～`#S-43`](../../../../spec/capabilities/account-identity/v1/contract.md#八规范表达与验证义务)） |
| [V-2 静态检查](../../../../spec/data/identity-values/verification.md#静态检查义务) 里由本模块提供检查器输入的 SC-1／SC-2／SC-9 | lint 规则实现 ＋ 一条「故意违反就失败」的自测 | **规则形式已验证、消费者覆盖部分**：本次 checks [100/100](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-checks-path-hub.log) 与两向 fixture。SC-1 真实准入函数覆盖 0；SC-2 typed 直接记录及真实 AccountRow 内存变异；SC-9 直接归属形状。原 S-2 品牌不相容负向类型测试通过，但它不是契约 SC-3 的身份参数义务 | 本节点提供公开身份名单，tools/ts-checks 实现语法规则；各消费者须登记适用准入函数与核完整字段／归属形状。S-2 品牌相容性由负向类型测试另守 |

义务从契约条款与本节点声称的范围产生。**受阻项**：规则形式不存在的缺口已补，但 SC-1 的真实准入函数登记为空、SC-2／SC-9 完整消费者范围尚未闭合（见[覆盖缺口](#覆盖缺口)）；不将规则自测视为消费者隔离通过。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 包内测试 | `packages/core/identity-values/tests/`：`schema.spec.ts`（Schema 副本与 spec v1 逐字节相同；契约 `examples.md` 第 1～11 节参与机检的 86 行正反实例逐条校验）、`values.spec.ts`／`predicates.spec.ts`（S-5、S-7、S-13～S-15 与上级链、有共同上级）、`handoff-warrant.spec.ts`（签发／核实；改一字节、换密钥、换 AccountId、换 purpose 四类反例核不过；私钥 PEM 不被当作验证密钥）、`identifier.spec.ts`、`types.spec-d.ts` | 211 条通过、类型测试无错误 | 终端输出（本行是主线转述，尚未登记 record/evidence run） |
| [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) | 源码提交 `c9b5850`；同上六个测试文件，纯模块单元测试与类型测试，不涉存储、不涉时钟；Node v24.18.0、vitest 4.1.11（`typecheck.enabled`），单进程，`OMNE_TEST_PG_URL` 未设 | build、typecheck 退出 0；211 条用例 **211 通过**、0 跳过、0 失败（其中类型测试 4 条，无类型错误） | [`output/identity-values.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/identity-values.log)、[`json/identity-values.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/identity-values.json)；逐条状态 [`cases.tsv`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/cases.tsv)，义务对应 [`coverage.md`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagescoreidentity-values) |

**有限检查不写成无条件证明。**这些测试只证纯模块对契约实例与反例的判定，在 Node v24.18.0 这一次、单进程下成立；Schema 校验走的是包内那份副本（与 spec 逐字节相同，run 独立核过 `1d1f5743…`）。隔离义务 S-16～S-30 落在消费者节点，本包只给检查器。**通过不提升契约或本节点的任何接受状态。**

## 本次追加验证（2026-09-26）

实现 `efe73eb5`，HUB `f73078ba` 构建／类型检查退出 0、**259/259**；[原命令 log](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/foundation/verification.log)、[HUB log](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-foundation-hub.log)。
新增唯一冻结 26 点空白数组、3 品牌／5 类型公开清单；S-31 回归从冻结正文表导出期望，核 parser／Schema 首尾拒绝、中间保留和数组不可改。
S-14／S-15 的 43 条追加用例是模型 hash 守卫与 6 链／36 对对照，基准取 [实际 Alloy solution](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/foundation/alloy-fixture/coreCorrespondenceFixture-solution-0.json)，
不是 fixture 自己重写一个图算法。Alloy 6.2.0／SAT4J 求一个六组织固定图；它是有限对应证据，不是全部结构的证明。
外部消费者通过 built exports，runtime 和最终严格 tsc 通过；首次缺 Node 类型声明的失败也保留在原 log。
Schema 副本逐字节核对仍相同，冻结 v1 未改；[输入与哈希审计](../../../../record/evidence/2026-09-26-tests-core-foundation/audit.json)。
checks `46be3697`、HUB `59669096` 的 [100/100 与 scan](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-checks-path-hub.log) 提供 SC-1／2／9 的规则自测，
当前真实准入覆盖 0，完整消费者责任与 S-35 领域守卫仍在对应 owner；[逐项覆盖](../../../../record/evidence/2026-09-26-tests-core-foundation/coverage.md#packagescoreidentity-values)。

## 公开消费者追加验证（2026-09-26）

`w1.identity.public-values`、`w1.identity.in-band-closed-input`、`w1.identity.public-parent-snapshot`、`w1.identity.public-warrant` 四项通过，分别补 S-2／5／7／13，S-10～12／31～33，S-14／15，S-35 的模块公开面。品牌错配／原字符串／缺分量、表示非法与效力不可用分支由 `w1.types.identity.brands`／`w1.types.identity.in-band-results` 两组严格声明测试守住。链含自身／近到远、不可用／循环不返短链，warrant 错误用途／账号／密钥／自制字符串与重放只证纯模块原语。

本轮没有新 Alloy 运行，不推广上级快照为所有结构的定义式证明；没有核 SC-1 实际准入或 S-16～S-30 租户隔离、SC-2／SC-9 完整消费者记录／归属，也没有闭合密钥秘密与领域守卫。公开具名类型完整清单仍需后续实际类型运行，现有两组反例不冒充全表。

原始 [正常 Node report](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__w1-public-consumers__normal-afySRP__report.json)、[负向 report](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__w1-public-consumers__negative-WagReR__report.json)、[HUB build／typecheck／12/12 log](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__core-delivery__w1-public-consumers-hub.log)、[逐项条款对应](../../../../record/evidence/2026-09-26-tests-core-public/coverage.md)与[实际源码／配置／环境](../../../../record/evidence/2026-09-26-tests-core-public/README.md)分别保留。工具源码5140574b，HUB起点e0b6c212加当时未提交且与dc431fdf同字节的lock；期间文档提交不改变本轮产品／工具／配置。子场景不叠加进外层测试数，六组类型只覆盖具体断言。测试通过不提升语义接受或用户最终接受。

## 覆盖缺口

按上面这次 run 的对应清单，本节点还缺的证据：

- **规则已交付，消费者完整覆盖仍待各 owner**：[原 coverage](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/checks/coverage.json) 记录 SC-1 注册／标注实际为 0。SC-2 不核普通 string 聚类键或关联表，SC-9 不核跨文件／继承／重命名／复合记录；不能凭 24-rule scan 宣称 S-16～S-30 隔离成立。
- **S-14／S-15 已补固定图的机器对照**：[实际 Alloy 输出](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/foundation/alloy-fixture/coreCorrespondenceFixture-solution-0.json) 是六组织 fixture；6 链集合／36 对与实现同判。它不穷尽所有结构、不证全部定义式等价；链序另由原近到远用例承担。

其余不在本节点证据范围内的：

- **隔离义务 S-16～S-30 一条也不在本节点闭合**：本模块给检查器与类型，判定路径在各 owner。V-3（六路径）、V-4（冒充隔离）、V-5（不可用≠无效）、V-6、V-9、V-10、V-11、V-13 的演练分别归 `account-identity`、`organization-governance`、`account-registration` 与尚未建立的资产／会话／执行环境节点。
- **G-04／G-05 未裁**：标识词法与标量键的候选在 [design.md](design.md#能力到-cordis-的投影)，没有裁决就没有可测的规范。
- **密钥私有性**：签名方案的不可伪造前提「私钥不外泄」在单进程内只能靠装配纪律，没有可机检的证据形式；跨进程演化时须重新给出。

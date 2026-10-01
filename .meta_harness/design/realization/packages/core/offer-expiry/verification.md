## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 6 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# offer-expiry 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.offer-expiry/v2`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/offer-expiry` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**85 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 6 项 core-local、0 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/offer-expiry/verification.md`](../../../../spec/data/offer-expiry/verification.md)。
那张表里的义务**绝大多数落在消费者**（拥有发出／撤回／接受与读面的能力契约的提供者，本版即 [organization-governance](../../tenancy/organization-governance/verification.md)）；
本页只登记**本模块自己能证的那一小部分**——判定函数与解析器的行为。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-8](../../../../spec/data/offer-expiry/v1/contract.md#s-8-判定式) 判定式与求值次序 | `deriveState` 单元测试：终结记录优先（`settled='withdrawn'` 且 `now > expiresAt` ⇒ `withdrawn` 不是 `expired`）；严格不等号（`now === expiresAt` ⇒ `pending`）；`target='absent'` ⇒ `expired` | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：`derive.spec.ts` › `deriveState（S-8 判定式与求值次序）` › `终结记录优先…`、`严格不等号…`、`指向对象不存在 ⇒ expired…` | 本节点 |
| [S-20](../../../../spec/data/offer-expiry/v1/contract.md#s-20-不可用--不存在) 不可用 ≠ 不存在 | 单元测试：`now='unavailable'` 或 `target='unavailable'` ⇒ 返回 `'unavailable'`，**不是** `pending` 也不是 `expired`；且有终结记录时仍返回终结记录（①在②之前） | **已通过**（同 run）：同 describe › `S-20：now 或 target 不可用 ⇒ unavailable…`、`S-20 与终结记录的次序…` | 本节点。**这条只证纯函数**；契约 verification 要求的故障注入（让读面真的读不到）在消费者节点 |
| [S-13](../../../../spec/data/offer-expiry/v1/contract.md#s-13-接受路径上三种来路给同一个拒绝值) | `acceptable` 对 `expired`／`withdrawn`／`accepted` 三值返回同一个 `false` | **已通过**（同 run）：`derive.spec.ts` › `acceptable（S-13）` › `pending 为真；三种来路同一个 false` | 本节点；「逐字相同的失败值」在消费者节点的 S-24 三支同跑里证 |
| [S-4](../../../../spec/data/offer-expiry/v1/contract.md#s-4-offertiming)／[S-14](../../../../spec/data/offer-expiry/v1/contract.md#s-14-offer_ttl) | `timingFrom` 与 `parseOfferTtl` 单元测试：`0`、负数、`NaN`、`Infinity`、非数值 ⇒ `invalidInput`；`undefined` 不进解析器（缺席由调用方分流） | **已通过**（同 run）：`derive.spec.ts` › `timingFrom / parseOfferTtl（S-4 / S-14）`（4 条） | 本节点。「指定值拒绝、默认值启动失败」两路的收场在消费者节点与装配 |
| [S-22](../../../../spec/data/offer-expiry/v1/contract.md#s-22-schema-的范围) 形状 | Schema 副本逐字节核对 + 正反实例过 `validate` | **已通过**（同 run）：`schema.spec.ts` › `Schema 副本` › `与 spec 目录的规范工件逐字节相同`、`Schema 自带的 examples 与 x-counterexamples 逐条核对`（10 条）；`time.spec.ts`（6 条）；副本逐字节另有该 run 的独立核对（`63a8ccb4…`，与 `frozen.json` 相同） | 本节点 |
| 三条 lint 规则 SC-OE-1～3（[design.md](design.md#静态检查义务怎么承载)） | 规则实现 + 「故意违反就失败」自测 | **部分**（同 run）：三条规则都在，自测通过——SC-OE-1 `tools/ts-checks/tests/consumer-rules.spec.ts` › `sc-oe-1`（3 条）、SC-OE-2 同文件 › `sc-oe-2`（3 条）、SC-OE-3 `tools/ts-checks/tests/rules.spec.ts` › `no-wall-clock`（1 条）；`pnpm run lint:rules` 在真实源码上 PASS。本次 [checks 100/100](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-checks-path-hub.log) 中 `core-rules.spec.ts` 三种直接墙钟调用各有必红反例，显式时间构造合法 | 本节点提供规则，消费者包 CI 跑 |

**受阻项**：无。原先写的「`Instant` 表示选型未定前 S-8 的测试写不了」已不成立——S-8 的测试已写成并通过（本包的 `Instant` 是品牌化数值，见 `types.spec-d.ts` › `编译期挡住的条款` 的用例名）。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 包内测试 | `packages/core/offer-expiry/tests/`：`derive.spec.ts`（终结优先、严格不等号、`unavailable` 传播、指向对象不存在 ⇒ `expired`）、`time.spec.ts`（RFC 3339 解析与偏移、非法时长拒绝、两路默认／指定）、`schema.spec.ts`（Schema 副本逐字节；examples 与 `x-counterexamples` 正反实例）、`testing.spec.ts`（`testClock` 只前推）、`types.spec-d.ts` | 31 条通过、类型测试无错误 | 终端输出（本行是主线转述，尚未登记 record/evidence run） |
| [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) | 源码提交 `c9b5850`；同上五个测试文件，纯模块单元测试与类型测试，时间一律由测试给定（`testClock` 只前推），不涉存储；另含 `tools/ts-checks` 里 SC-OE-1～3 三条规则的自测与 `pnpm run lint:rules` 对真实源码的扫描；Node v24.18.0、vitest 4.1.11，单进程 | build、typecheck 退出 0；31 条用例 **31 通过**、0 跳过、0 失败（类型测试 3 条，无类型错误）；`lint:rules` 退出 0（20 条规则，扫 `packages/`、`apps/`） | [`output/offer-expiry.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/offer-expiry.log)、[`json/offer-expiry.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/offer-expiry.json)、规则自测 [`output/ts-checks.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/ts-checks.log)、[`output/_lint-rules.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/_lint-rules.log)；义务对应 [`coverage.md`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagescoreoffer-expiry) |

两次 formal evidence run（`2026-09-22-formal-tenant-domain`、`-2`）**不覆盖本契约**——它不建形式工件，契约 verification 已明写。

**有限检查不写成无条件证明。**上面的测试证的是纯函数与解析器对给定输入的判定，在 Node v24.18.0 这一次、单进程下成立；`now` 由测试给出，不证任何真实时间源的行为（那一半归 `infra/clock` 与装配）。静态规则只扫 `lint:rules` 那一次看到的源码。**通过不提升契约或本节点的任何接受状态。**

## 本次追加验证（2026-09-26）

产品源码本次未变；HUB `f73078ba` 对本包 build／typecheck 退出 0、**31/31**、零跳过／失败。
[spoke 原命令](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/foundation/verification.log)、[HUB 原 log](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-foundation-hub.log)、[Schema 独立哈希核对](../../../../record/evidence/2026-09-26-tests-core-foundation/audit.json)。
checks 最终修订 `46be3697`、HUB `59669096` 的 [100/100 与 24-rule scan](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-checks-path-hub.log) 补齐 SC-OE-3 的三种直接调用反例；
原 98 条运行同样保留，未改写旧结果。测试输入时间与 testClock 是替身，未运行真实邀约写路径或实际时间源。
[逐项覆盖](../../../../record/evidence/2026-09-26-tests-core-foundation/coverage.md#packagescoreoffer-expiry) 只覆盖本包纯函数、解析器、形状与语法规则。

## 公开消费者追加验证（2026-09-26）

`w1.offer.public-time-shape`、`w1.offer.public-evaluation-order` 两项通过，补 S-4／14／22 的 RFC3339 相等、非法 ttl 带内拒绝、形状与跨字段语义区分，以及 S-8／13／20 的相等截止仍 pending、严格晚才 expired、不可用先于不存在、终结状态优先。`w1.types.offer.derived-state-and-clock` 核状态集合、品牌时刻、Clock 返回形状与 readonly 负例；readonly 不是 runtime 深冻结。

HUB 起点 `e0b6c212` 已含产品 `3a8b2117` 日历解析修正，与 worker `5b3014f8` 的旧输入分开保存。本轮公开消费者没有穷尽 formatter／历法输入，不借本结果声称新的 parser 71 项或包测试 306 项已经重跑。实际 Clock 同源、五行装配保证、存在性读面、同提交求值与持久化终结写路径仍由各消费者／装配提供证据。

原始 [正常 Node report](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__w1-public-consumers__normal-afySRP__report.json)、[负向 report](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__w1-public-consumers__negative-WagReR__report.json)、[HUB build／typecheck／12/12 log](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__core-delivery__w1-public-consumers-hub.log)、[逐项条款对应](../../../../record/evidence/2026-09-26-tests-core-public/coverage.md)与[实际源码／配置／环境](../../../../record/evidence/2026-09-26-tests-core-public/README.md)分别保留。工具源码5140574b，HUB起点e0b6c212加当时未提交且与dc431fdf同字节的lock；期间文档提交不改变本轮产品／工具／配置。子场景不叠加进外层测试数，六组类型只覆盖具体断言。测试通过不提升语义接受或用户最终接受。

## 覆盖缺口

按上面这次 run 的对应清单，本节点还缺的证据：

- **原 SC-OE-3 三种直接调用反例的缺口已补**（[coverage](../../../../record/evidence/2026-09-26-tests-core-foundation/coverage.md#packagescoreoffer-expiry)）；`Date.now()`、无参 `new Date()`、`performance.now()` 均检出。经别名获取墙钟仍在规则的不覆盖范围，实际时钟同源与单调仍归消费者／装配。

其余不在本节点证据范围内的：

- **四条规范场景 S-23～S-26 一条也不在本节点跑**：它们需要真实的发出／撤回／接受路径与存储，owner 是 organization-governance（邀请、隶属请求）；资产那两类**无 owner**（[G-2／G-6](../../../../spec/data/offer-expiry/v1/contract.md#八已知缺口)）。
- **S-17 五行装配给保证**在本节点没有可跑的证据形式，是装配设计的选型声明 + 架构评审；其中第 5 行「`now` 不后退」的承接者 [`infra/clock`](../../infra/clock/verification.md) 在同一次 run 里有包内测试通过，装配一侧见 [`apps/tenancy-host`](../../../apps/tenancy-host/verification.md)——那些是承接者的证据，不记作本节点的。
- **「插件体抛出 ⇒ 启动失败」**：kernel-basis 的 probe `plugin-throw-fails-fiber.test.ts` 在同一次 run 里通过（4.0.4；已升格为 basis 条目 [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)），不再是待核对主张；S-14 默认值那一路的收场由消费者节点与装配的启动失败测试承担。

## 2026-09-27 W17：精确条件比较增量

[D089 rev1](rfc3339-order-design.md)的TO-V1～V9 core部分已按[实际独立证据与限定签收](../../../../record/evidence/2026-09-27-tests-core-rfc3339-order/README.md)核验：150测试、两fresh闭合公开制品各9475具名oracle、12literal执行、量化/字典序两真编译行为负控。root198输入和4542归档成员零漂移核对；产品slice Pass、整体证据Pass with issues（首次oracle脚本原PID/完整stderr缺项保留）。

TO-V7的runtime实际timing/原opened全值关系、TL-G1生产来源/合法历史、G28～G31和完整纵线仍未覆盖；conditional ok不认证历史公告。成本亲核作者同78字节raw，未独立重跑。新增规范bindings0，保持此前OE业务/规范场景的日期和范围，不用pure比较验收覆盖其消费者责任。

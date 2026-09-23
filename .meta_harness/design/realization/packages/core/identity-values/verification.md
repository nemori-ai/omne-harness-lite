# identity-values 验证与证据

契约侧的证据义务权威在 [`spec/data/identity-values/verification.md`](../../../../spec/data/identity-values/verification.md)（V-1～V-14、SC-1～SC-n）。
本页只登记**落在本节点上的那一部分**，以及本节点为别的 owner 提供的检查器；其余义务各归它们的 owner 节点。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [V-1 形状校验](../../../../spec/data/identity-values/verification.md#证据义务)（S-1／S-3／S-4／S-5／S-7／S-8／S-9／S-10／S-11／S-12／S-31／S-32／S-35 的形状面） | `examples.md` 第 1～11 节的正反实例逐条过包内 `validate`，作为本包的测试；测试同时核对包内 Schema 副本与 spec 逐字节相同 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：`schema.spec.ts` › `V-1：examples.md 第 1～11 节的正反实例`（173 条）、`Schema 副本`（2 条）；副本逐字节另有该 run 的独立核对 | 本节点；测试落包并在 CI 跑过一次、结果登记进 [record/evidence](../../../../record/evidence/README.md) 即闭合 |
| S-5／S-7／S-13 值判定 | 结构相等、规范序列化唯一、`sameAccountDistinctTenants` 的单元测试（含 S-13 那条「只在 V-14 有落点」的值判定） | **已通过**（同 run）：`values.spec.ts` › `TenantId（S-5 / S-7）`（4 条）、`sameAccountDistinctTenants（S-13）`（2 条） | 本节点 |
| S-14／S-15 定义式 | 纯函数版 `ancestorChain`／`shareAncestor` 对着 [`Affiliation.als`](../../../../spec/capabilities/organization-governance/v1/formal/Affiliation.als) 的 `shareAncestor` 定义逐字核对（含自身、`ancestorChain` 不含自己），并给「一个组织与它自己的上级」这个曾经的反例一条测试 | **部分**（同 run）：单元测试有——`predicates.spec.ts` › `ancestorChain（S-14）`（4 条）、`shareAncestor（S-15）`（5 条，含那个曾经的反例）；「对着 `Affiliation.als` 逐字核对」是人工对照，没有用例 | 本节点；治理节点消费它 |
| [S-35](../../../../spec/data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant) 六条性质里**本模块能证的**：不透明（核实不解析）、绑定该标识、由产出方签发（错误密钥／错误用途／错误 AccountId 一律 `invalid`） | 单元测试：正例、四类反例（不带、绑另一标识、用途不符、自制字符串） | **已通过**（同 run）：`handoff-warrant.spec.ts` › `交接凭证（S-35）`（9 条：正例、反例 1～6、非规范 base64url、重放） | 本节点。**性质 4（不作废）与性质 6（不核领域事实）不在本模块证**——那是两个实例各自契约的规范场景（[`capability.account-identity/v1#S-41`～`#S-43`](../../../../spec/capabilities/account-identity/v1/contract.md#八规范表达与验证义务)） |
| [V-2 静态检查](../../../../spec/data/identity-values/verification.md#静态检查义务) 里由本模块提供检查器输入的 SC-1／SC-2／SC-9 | lint 规则实现 ＋ 一条「故意违反就失败」的自测 | **无证据**：`tools/ts-checks` 的 20 条规则里没有这三条。owner 栏的 SC-3「编译期挡」一形另有承担者且通过：`types.spec-d.ts` › `编译期挡住的条款` › `S-2：登录标识与 AccountId 类型不相容` | 本节点提供规则；各消费者包 CI 跑。SC-3 一类由品牌类型在编译期挡，证据是「一段违反的代码编译不过」的负向测试 |

义务从契约条款与本节点声称的范围产生。**受阻项**：SC-1／SC-2／SC-9 的规则形式不存在（见[覆盖缺口](#覆盖缺口)）；其余各行已有承担者。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 包内测试 | `packages/core/identity-values/tests/`：`schema.spec.ts`（Schema 副本与 spec v1 逐字节相同；契约 `examples.md` 第 1～11 节参与机检的 86 行正反实例逐条校验）、`values.spec.ts`／`predicates.spec.ts`（S-5、S-7、S-13～S-15 与上级链、有共同上级）、`handoff-warrant.spec.ts`（签发／核实；改一字节、换密钥、换 AccountId、换 purpose 四类反例核不过；私钥 PEM 不被当作验证密钥）、`identifier.spec.ts`、`types.spec-d.ts` | 211 条通过、类型测试无错误 | 终端输出（本行是主线转述，尚未登记 record/evidence run） |
| [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) | 源码提交 `c9b5850`；同上六个测试文件，纯模块单元测试与类型测试，不涉存储、不涉时钟；Node v24.18.0、vitest 4.1.11（`typecheck.enabled`），单进程，`OMNE_TEST_PG_URL` 未设 | build、typecheck 退出 0；211 条用例 **211 通过**、0 跳过、0 失败（其中类型测试 4 条，无类型错误） | [`output/identity-values.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/identity-values.log)、[`json/identity-values.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/identity-values.json)；逐条状态 [`cases.tsv`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/cases.tsv)，义务对应 [`coverage.md`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagescoreidentity-values) |

**有限检查不写成无条件证明。**这些测试只证纯模块对契约实例与反例的判定，在 Node v24.18.0 这一次、单进程下成立；Schema 校验走的是包内那份副本（与 spec 逐字节相同，run 独立核过 `1d1f5743…`）。隔离义务 S-16～S-30 落在消费者节点，本包只给检查器。**通过不提升契约或本节点的任何接受状态。**

## 覆盖缺口

按上面这次 run 的对应清单，本节点还缺的证据：

- **SC-1／SC-2／SC-9 的规则形式没有**：`tools/ts-checks` 现有 20 条规则里没有这三条，也就没有「故意违反就失败」的自测。owner：本节点提出规则形式，`tools/ts-checks` 落规则。
- **S-14／S-15 对着 `Affiliation.als` 的逐字核对没有用例**：它是人工对照；单元测试证的是本包函数的行为，不证与 Alloy 模型的定义式逐字一致。owner：本节点（要机检就把两边的定义式各抽一份比对）。

其余不在本节点证据范围内的：

- **隔离义务 S-16～S-30 一条也不在本节点闭合**：本模块给检查器与类型，判定路径在各 owner。V-3（六路径）、V-4（冒充隔离）、V-5（不可用≠无效）、V-6、V-9、V-10、V-11、V-13 的演练分别归 `account-identity`、`organization-governance`、`account-registration` 与尚未建立的资产／会话／执行环境节点。
- **G-04／G-05 未裁**：标识词法与标量键的候选在 [design.md](design.md#能力到-cordis-的投影)，没有裁决就没有可测的规范。
- **密钥私有性**：签名方案的不可伪造前提「私钥不外泄」在单进程内只能靠装配纪律，没有可机检的证据形式；跨进程演化时须重新给出。

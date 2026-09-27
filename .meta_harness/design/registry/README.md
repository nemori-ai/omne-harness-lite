# 身份、版本与关系清单

2026-09-27：[D086](../record/decisions/model-runtime-tail-settlement-adoption/decision.md)登记RT4 accepted，新增27冻结资源／17精确依赖／55项reviewed=false covers／6形式任务，原记录及445冻结hash保持；当前catalog79、frozen472、covers2015、formal tasks54。旧推荐不自动升级消费者，后文较早计数按当时事件读取。

这里是设计链全部**坐标与关系**的唯一权威。任何会被机器 join 的事实住在这里，
其余目录只引用坐标，不复制一份同义登记。

失效事件：发布、接受、冻结、身份重分解。内容变化都由这些事件驱动，
不因某份正文改了措辞而变。

## 清单一览

| 文件                 | 持续含义与关键字段                                                                                               | 谁写           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------- |
| `baseline.json`      | `format=1`、稳定 `baseline_id`、输入 `snapshot_id`、Schema `schema_namespace`、旧谱系清单及显式 `version_policy` | 基线切换       |
| `catalog.json` | **63 条，全部 accepted**；治理线 21 条保持原坐标，#9 的 34 条由 [D-066](../record/decisions/pr9-pr10-coordinate-reconciliation/README.md) 行政迁移坐标，沿用 D-061 的语义接受。315 条依赖带精确坐标与消费 clauses；推荐／接受新版本不自动升级消费者 |
| `frozen.json` | **351 项规格资源**；治理线 173 项 hash 不变，#9 的 146 项在新坐标冻结，原字节在完整 main 快照中按原 182 项登记核对。后续修改须出新版本 |
| `lineage.json`       | 旧→新 baseline 的条款关系、退出身份、`freeze_gate` 与实际产品消费者的旧/新谱系观察                                           | 重分解         |
| `version-migrations.json` | 同 baseline 的行政版本迁移：原提交/完整快照、原新坐标、逐文件摘要及决定/产品修订映射；#9 的 34 份规格遵循 [D-066](../record/decisions/pr9-pr10-coordinate-reconciliation/decision.md) | 行政迁移 |
| `formal-tasks.json`  | 模型种类、已登记工件、可注入 argv runner 和超时；结果不写回规范                                                  | 形式义务变化   |
| `id-namespaces.json` | 稳定编号前缀到拥有者的映射                                                                                       | 新增编号族     |
| `covers.json`        | 需求条款 ↔ 契约坐标的多对多覆盖关系                                                                              | 需求覆盖被复核 |

catalog 的稳定键是 `(baseline_id, contract_id, version)`。资源位置为
`spec/{family}/{topic}/v{version}/...`，路径相对设计根；同一坐标重复登记直接拒绝，
即使两个文件内容不同。`accepted` 条目必须链接实际 `record/decisions/` 文件，
全部版本资源必须冻结；候选状态和接受状态不能靠文件存在相互提升。

## lineage

原名 `rebase-map.json`。改名是因为它记录的就是身份血缘——`retired_identities`
与旧新条款 relations——而「rebase」描述的是当初那次操作，不是这份事实的长期含义。
字段与语义不变。

关系声明源/目标 clauses、逐条 mapping、实际 consumers、release evidence 及 freeze gate。
`freeze_gate.blocked=true` 会阻断采用；退出身份不能作为当前依赖复活，
先把其被消费条款映射到当前活体能力，再让 catalog 依赖当前坐标。

一个 source 可以出现在多条 relation 中，因此「一个旧契约拆成两个新契约」用两条关系表达。

## id-namespaces

登记每个稳定编号前缀属于谁，例如需求条款的 `PF-`/`SYS-`、决定的 `D-`、防御指导的编号族。

它解决的是一类真实事故：独立分析在不知情时为新对象自造一个前缀，
恰好撞上已有契约正在使用的前缀，两套编号在同一篇引用里无法分辨。
新增编号族前先在此登记；登记表为空不等于前缀空闲。

```json
{
  "prefix": "PF-",
  "kind": "requirement-clause",
  "owner": "requirements/product",
  "description": "产品需求 topic 的稳定编号"
}
```

`prefix` 全局唯一，`owner` 指向实际维护它的目录或 topic。
同一 `kind` 可以有多个前缀，但一个前缀只能有一个 owner。

## covers

需求条款覆盖哪些契约条款。**一条需求可覆盖多个契约，一个契约被多条需求覆盖，
这是多对多关系，不属于任一端。**

放需求侧，契约重分解时要遍历全部需求；放契约侧，每个契约各存一份自己的需求列表，
需求改一次要改 N 个文件。两种做法都立刻产生第二份权威，所以它住在关系自己的家。

```json
{
  "requirement": { "topic": "PF-001-tenant-organization-context", "clause": "C1" },
  "target": {
    "contract_id": "capability.tenant-context",
    "version": 1,
    "clauses": ["S-3", "S-4"]
  },
  "reviewed": false,
  "note": "批量导入，尚未逐条复核"
}
```

`target` 用 catalog 的精确坐标；`clauses` 为空表示「覆盖该契约但尚未定位到条款」，
与「已确认不涉及任何条款」不同，后者不应登记为一条 cover。
**一种例外——缺口登记型 cover**：某条契约条款**明文声明**一条需求不归本契约、并点名一个具名缺口
（如入口契约 S-34 对 PF-017 §6.9 登 G-12），这条需求 → 该条款可以登记，`note` 必须写明
「为让缺口可见而登，不表示已覆盖」并指到缺口号；缺口闭合（有契约家）时把 `target` 改指真正的承接条款。
没有点名缺口的否定式提及仍不登。

**互引成环的登记口径（2026-09-25，D-060 §七 M2）**：两份 data 契约要共用同一形状而互相引用会成环时，一侧 `$ref` 并在 catalog 登依赖，另一侧**逐字自定义**、不登依赖，在自己的 `verification.md` 登「对齐义务」（指明以哪一侧为家、逐字同步）。定义性引用（只为说明形状、不据以写出承诺）同样不登。已用此法的：messages↔model-response 的 `ParameterAdjustment`／`droppedParameters`、`SelectedBy`／`CredentialScope`；content-blocks↔slash-command 的来路标记；content-blocks↔tool-definition 的 `ModelToolName`（家在 tool-definition S-6）。

每项覆盖带 `reviewed` 标记。批量导入时 `reviewed: false` 是诚实的初值——
它表示「声称覆盖但尚未逐条复核」，与「已复核确认覆盖」必须可区分；
不要为了让报表好看而默认填 true。以 `false` 计入缺口，由 [views/](../views/README.md)
的覆盖报告汇总。

契约拆分后，覆盖关系按 `lineage.json` 的条款级 mapping 自动仍然正确——
这正是覆盖以**契约条款**而非装配对象为键的原因：对象是会被重新分解的那一层，
以它为键，每次重分解整份索引作废。

## 维护边界

- 清单由发布、接受与复核动作驱动，不在设计正文里顺手改；改动要能指出是哪次事件。
- 不在其他目录复制坐标清单。需要展示时由 [views/](../views/README.md) 派生，派生物不得被引为依据。
- `version_policy` 决定能否新增版本。`{"kind":"initial-uniform","version":1}` 下任何契约都只能有 v1；
  稳定演化阶段切换为 `{"kind":"evolving"}` 后可新增 v2，且不能改写 v1。
- 清单是数据不是叙述。为什么这样分解归 [record/decisions/](../record/decisions/README.md)，
  这里只登记结果。

## 当前状态

2026-09-22 登记了租户相关领域的第一批。
此后五份契约经过四轮 spec-reviewer 评审并逐条修订，第四轮全部无阻断，改动一律落在 v1 原地（当时未冻结）；
catalog 的依赖 clauses 按「正文以坐标引用即消费、只算消费者 → 提供者方向、
只登实质消费」的口径在评审轮三／四补齐（口径见 [spec/README](../spec/README.md#当前状态)）；
其中两份带形式工件的契约，模型与配置改过之后**已第二次执行**，
结果在 [`record/evidence/2026-09-22-formal-tenant-domain-2/`](../record/evidence/2026-09-22-formal-tenant-domain-2/README.md)。
**同日晚些时候，[D-023](../record/decisions/tenant-domain-design-acceptance/README.md) 接受了五份 v1，本清单据此翻状态并冻结**——
接受事件是唯一的触发，评审与重跑本身不提升状态。

**2026-09-23 第二批（治理中心入口）**：新登两条 `candidate`——`composition.governance-center-entry` v1
与 `capability.account-identity` **v2**（出示物与 LoginStateId 分离）；入口契约带一个 TLC 任务；
covers 补登 PF-016／PF-017 → 入口契约、PF-001／PF-017 → AI v2（含一条「缺口登记型」：§6.9 与 §6.10 第 1 行 → S-34，指 G-12）。
**同日夜里 [D-028](../record/decisions/governance-center-design-acceptance/README.md) 接受了这两条，本清单据此翻状态并冻结**：
入口契约 v1 的 15 项资源与账号能力 v2 的 1 项追加进 `frozen.json`；账号能力 v1 与 v2 并存，注册组合与治理契约仍钉 v1。主责产品依据 PF-017 rev 2。
**同日 [D-029](../record/decisions/governance-center-transport-binding-acceptance/README.md) 接受了传输绑定 `composition.governance-center-entry-https-json` v1**：状态翻 `accepted`，两项资源追加进 `frozen.json`；入口契约 G-10／G-11 随之闭合（契约正文已冻结，闭合记录在决定与入口节点）。

| 清单                 | 现在有什么                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog.json` | **63 条，全部 accepted**；治理线 21 条保持原坐标，#9 的 34 条由 [D-066](../record/decisions/pr9-pr10-coordinate-reconciliation/README.md) 行政迁移坐标，沿用 D-061 的语义接受。315 条依赖带精确坐标与消费 clauses；推荐／接受新版本不自动升级消费者 |
| `formal-tasks.json`  | **37 个 TLC 任务**（治理线 26 个原任务 + #9 的 10 个行政重编号任务，未声称本次执行）；下列为原 main 的历史登记说明：**原 15 个 TLC 任务**（2026-09-25 接口契约批加 `session-log-v1-appends`、`credential-custodian-v1-sweep`；前者已跑 run `2026-09-25-formal-session-log`）。此前 13 个：`organization-governance-v1-membership`、`account-registration-v1-{basic,crash,progress}`、`governance-center-entry-v1-decision`（2026-09-23），加 2026-09-23 起草的四份候选的 8 个——`asset-transfer-v1-{transfer,share,revival}`、`stream-assembly-v1-assembly`、`model-request-runtime-v1-invocation{,-no-fallback}`、`tool-execution-runtime-v1-execution{,-progress}`（候选契约的任务，执行不提升状态）。runner 用 `${JAVA_BIN}` / `${TLA2TOOLS_JAR}` 两个可注入变量，工作目录是设计根。**已由 `--formal run` 实际跑通**。**保存下来的两次运行走的不是这条路径**——它们是主线本机直接调 TLC（4 workers），结果与输入快照在 [`…-formal-tenant-domain/`](../record/evidence/2026-09-22-formal-tenant-domain/README.md) 与 [`…-2/`](../record/evidence/2026-09-22-formal-tenant-domain-2/README.md)，[两者的 runner 差异与「为什么不影响被检查的东西」写在 run README](../record/evidence/2026-09-22-formal-tenant-domain-2/README.md#命令仍然是从日志重建的)                                            |
| `covers.json`        | **1496 条，指向 63 个契约版本**（原标记沿用，行政迁移不提升 reviewed；以下数量沿革仅描述 #9 原输入）（2026-09-25 接口契约批后按文件实际计数刷新；此前修复波 3 跨批对齐时为 1053／35；修复波 1／1b 后为 1045，修复波 2 +3、修复波 3 +5；各契约条目数见该文件全局 `note`）：PF-001／002／003／015 → 租户五份，2026-09-23 补登的 PF-016／PF-017 → 入口契约、PF-001／PF-017 → AI v2、传输绑定 12 条，加 26 份候选各自起草时登记的条目、2026-09-24 整批对齐补登的 6 条与同日修订批的增删，全部 `reviewed: false`；全局 `note` 已合成一段，写明口径、一律不登的几类与各契约的条目数。`clause` 用产品 topic 的**小节锚点**，理由与三处已知不完整写在该文件的 `clause_form` 与 `note` 里                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `frozen.json` | **351 项规格资源**；治理线 173 项 hash 不变，#9 的 146 项在新坐标冻结，原字节在完整 main 快照中按原 182 项登记核对。后续修改须出新版本 |
| `lineage.json`       | **仍为空。**2026-09-17 那三个候选于 2026-09-22 整体废弃，**从未接受或冻结，不产生血缘**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `id-namespaces.json` | 8 个前缀族（2026-09-23 起加了 `G-`、`CS-/IS-/SC-/V-/P-`、`M`），整批对齐未变                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**两件没有登记进来的事，都是有意的**：

- **Alloy 的四条命令没有成为 formal task。**检查器支持 `kind: "alloy"`，
  但 `alloy exec` 的退出码与断言结果无关（改坏判环前置后 `check` 变成 SAT，它仍退出 0），
  而 `--formal run` 只看退出码——登记它会得到一个**永远通过的任务**。
  [证据与闭合条件在那次运行的 README](../record/evidence/2026-09-22-formal-tenant-domain/README.md)。
  候选里的两份 Alloy 模型（`capability.asset-evaluation` 的 `Evaluation.als`、`data.messages` 的 `Readable.als`）同理不登记：
  判读写在各自的 `verification.md`（`check` 行 UNSAT 读作本作用域内无反例、`run` 行 SAT 读作有实例），2026-09-24 整批对齐复跑一次，原始输出在主检出 `tmp/formal-runs/`，未入库。
- **`Membership_NoSerialization.cfg` 没有成为 formal task。**它**期望失败**（退出 12），
  与本清单的语义相反；它作为有效性核对保存在同一次运行里。

其余存量清单尚未从 `design_legacy/` 迁入。

工具状态：检查器已读 `registry/` 下的清单，`lineage.json` 这个名字自 2026-09-22 起与工具一致；
`id-namespaces.json` 与 `covers.json` 是新增清单，**检查器尚无对应校验**，格式只由本文示例约束。

返回[设计链入口](../README.md)。

**2026-09-26 正式接受**：[D-065](../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md) 签署 D-061，34 条候选改为 accepted；版本资源逐项追加 SHA-256。形式任务登记与执行结果、覆盖 reviewed 标记均不因接受而提升。


**当前坐标协调（2026-09-26）**：按 [D-066](../record/decisions/pr9-pr10-coordinate-reconciliation/decision.md)，组织治理的 main v2→v3，#9 其余 33 份 v1→v2；draft OG2/AI3/OE2/入口/客户端继续钉原坐标。`version-migrations.json` 是同 baseline 行政迁移的唯一关系登记，`lineage.json` 仍只承载旧 baseline 的血缘；现有通用检查器不读取新的行政迁移清单，本次的独立逐字核对与 Schema 解析检查由 D-066 指向的证据提供。原接受声明用原 main 快照解释，当前 migrated catalog 的 acceptance 统一指向 D-066。

部署提供路径接续：[D-070 Docker R4](../record/decisions/core11-integration-coordination/decision.md#docker-r4)承接本支原采用的tenancy-host Docker R4，仍消费原EC3/HT3等精确版本；不新增catalog身份或改动frozen资源，Docker绑定与产品运行尚未建立。

数据实现映射接续：[D-070](../record/decisions/core11-integration-coordination/decision.md)整体采用上游 CB／core，承接生产者铸号 I-B，退役本支旧 N-A。原本支 D-068 的快照和验收保留历史身份；不改变下节上游现行 D-068 的契约接受。24个外部消费者精确版本仍为2，完整 pi 的入口、登记／恢复与比较门继续保留。

## 2026-09-26：D-068 core v3

独立规格复审无阻断后，主调度在用户技术验收委托内接受八份3；8 catalog、37精确依赖、334 reviewed:false覆盖、32冻结资源和1个SA3正配置任务由 [D-068](../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 触发。总计63 accepted、315依赖、1496覆盖、351冻结资源、37任务。原55条接受、319冻结hash、lineage及36任务保持原内容；登记新增任务不声称执行。24外部消费者仍采用2，八个core实现的采用须另登记。上表治理线/#9数量仅描述原迁移历史。

## D-069 Skill3（2026-09-26）

按[独立复审后的技术接受](../record/decisions/skill-yaml-key-resolution/acceptance.json)新增Skill3：catalog当前64 accepted、318精确依赖、1518覆盖、354冻结资源。351旧冻结hash与37形式任务不变；新3只补未知YAML键最终无法排重时M16，ordinaryunknown仍忽略。其它消费者继续精确Skill2，不自动升级。接受不表明实现／证据／人的总体签字。

## D-070 模型绑定首批（2026-09-27）

[技术接受](../record/decisions/model-adaptation-binding-acceptance/acceptance.json)新增4 accepted、13 frozen资源；354原冻结hash原样保留。其它5候选仍未接受。提供者增量采用另归[D-071](../record/decisions/model-value-provider-adoption/acceptance.json)，不声称真实生产路径已验证。

2026-09-27：[D-072](../record/decisions/agent-definition-read-adoption/decision.md)技术接受 AD1 及纯提供者；新增三份冻结资源，真实源与总体交付状态另核。

2026-09-27：[D-073](../record/decisions/model-current-input-contracts-adoption/decision.md)技术接受 AE4/MF3/AR3/LC4，纯 AE4 投影同步采用；runtime/runner 及 IO 交付另核。

[D-076](../record/decisions/model-runtime-delivery-adoption/decision.md)：RT3/runner3最终精确技术接受，17项RT依赖对齐；四个提供者/装配投影采用，真实交付与认证另核。

2026-09-27，按 [D-078](../record/decisions/model-main-integration-coordination/decision.md)接续模型施工提交的历史 D-070～D-072：五个既有 accepted 坐标只切换 acceptance 路径，资源 hash、版本、依赖、覆盖与任务不变。采用不因主分支同步提升实现验收状态。

按 [D-079](../record/decisions/model-original-fill-adoption/decision.md)接受 MF4/AR4，冻结四资源；旧版本/依赖保持精确采用，不自动升级其它消费者。
2026-09-27：[D083](../record/decisions/session-log-tail-condition-adoption/decision.md)在独立两轮复评后技术接受session-log v3：新增1accepted、5精确依赖、24冻结资源、11覆盖（reviewed:false）和3正形式任务。有限run1及其旧正文输入／未变模型范围另读，登记不成为真实实现验收；旧SL2及全部旧规范消费关系保持，不自动升级RT3。

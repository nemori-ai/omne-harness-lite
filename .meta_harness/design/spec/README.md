# 精确规格容器

这里拥有待设计系统的数据、能力与组合契约。身份、版本与接受登记归
[registry/](../registry/README.md)；某项登记缺失表示当前上下文或采用关系未闭合，
不能据此断言系统不存在相关能力，也不能回读工作区外的同名文件补齐。

失效事件：语义变更。已发布规格不可原地覆盖，修改发布新版本。

## 路径即身份

资源位置 `spec/{family}/{topic}/v{version}/...` 是 `contract_id` 与版本的派生拼写，
不是分类学遗留。Schema 的 `$id` 为
`{schema_namespace}/{baseline_id}/spec/{family}/{topic}/v{version}/{resource}`，
`frozen.json` 逐文件登记 SHA-256，两者都以此路径为准。

因此**这一层的目录结构不随组织方式调整而变动**。设计链的其余目录
可以重新归并，本目录的路径形状原样保留。

## 从本地规格包起步

| 语义拥有者 | 本地模板包 | 实际主题位置 |
|---|---|---|
| 共享数据含义与结构 | [data](.templates/data/README.md) | `data/<topic>/` |
| 单项能力承诺 | [capability](.templates/capability/README.md) | `capabilities/<topic>/` |
| 跨能力交接与整体性质 | [composition](.templates/composition/README.md) | `compositions/<topic>/` |

每个包有可变 `README.md`、候选版本目录 `v-next/` 和版本外 `verification.md`。
复制后按实际版本规则命名候选版本并修正链接；`v-next` 不可作为发布版本。
Schema、Alloy、TLA+ 行为模型及规范场景按表达与证据需要加入版本目录，不预造空模型。
接受/采用信息从 registry 的 catalog 引用；可变验证结果不写入已冻结的规范目录。

## 准入门槛与停止条件

- 新 topic 必须有语义拥有者、稳定契约身份、适用范围、版本边界、精确依赖和候选/接受状态；发布还需 catalog 的采用依据。
- 语义或接受未定时保留候选版本，不填正式登记；依赖条款无等价对应、Schema 身份冲突或已触发的证明义务未闭合时，停止相应发布与消费。
- data 只拥有共享含义与结构，capability 拥有单项能力的操作/状态/失败，composition 拥有不能归于单项能力的整体性质与交接；归属不明先返回能力模型。

## 清单在哪里

七份清单在 [registry/](../registry/README.md)，形成同一发现面：`baseline.json` 固定谱系和坐标规则；
`catalog.json` 以 `(baseline_id, contract_id, version)` 为键登记
`coordinate/family/topic/status/contract_path/resources/acceptance/dependencies`；
`lineage.json` 保存旧到新条款对应和实际消费者；`frozen.json` 保护已发布资源；
`formal-tasks.json` 登记实际模型任务；`id-namespaces.json` 与 `covers.json` 分别登记编号归属与需求覆盖。

catalog 依赖必须给精确 `coordinate`、消费 `clauses` 与血缘关系。模板负责收集这些语义输入，
不自行生成或批准清单；清单间身份、路径、资源与接受关系不一致时停止发布，由唯一集成拥有者修正。

这里的 `candidate`、`accepted` 和 `frozen` 只陈述规格采用与资源不可变性；`implemented` 与
`assembled` 由 [realization/](../realization/README.md) 的实际证据拥有。任一缺失以具名 `gap` 保留，
不能用旧基线接受、形式任务登记、目标设计或文件存在补齐。完整状态词见[系统设计链](../README.md#状态词怎样组合)。

### 按需展开形式化工件

三种规格模板包均提供可选的 `v-next/formal/README.md`：导航性质、模型、前提、检查范围与论证缺口。
它是待填写的形式化入口，不是已经完成的模型；依据条款选用工件，没有需要时可删去并同步包入口。
已由设计触发的模型检查或证明义务不因模板可选而消失，门槛见 `harness-design-handbook` skill 的「组合性质」。

```text
<topic>/
├── README.md
├── v-next/                       复制后按实际版本命名
│   ├── contract.md
│   └── formal/                   可选
│       ├── README.md             规范条款到形式化工件的映射
│       ├── Behavior.tla          需要行为模型时添加
│       └── Structure.als         需要结构模型时添加
└── verification.md              覆盖与实际证据的可变入口
```

实际执行的配置、输入快照和原始结果归 [record/evidence/](../record/evidence/README.md)，
不写进版本目录——它们是运行产物，与规范的冻结边界分属两类失效事件。

图中的模型与执行目录是选用后的落点示意；当前模板不包含可运行的空模型或伪造结果。
TLA+ 行为规格可用 TLC 检查，模型模块与检查配置分别固定；参见 [TLC 官方说明](https://tla.msr-inria.inria.fr/tlatoolbox/doc/model/executing-tlc.html)。
Alloy 可按结构关系建立模型，检查断言并探索合法实例；参见 [Alloy 官方教程](https://alloytools.org/tutorials/day-course/s3_static.pdf)。
实际证据绑定精确输入与范围；模型检查不自动取代需要的形式证明，规范模型与执行结果继续分开维护。

**进展性质有证据形式。** 无上界的措辞（「尽快停止」）写不出会失败的断言，
但把它改写成有界形式后可以：`(phase = "closing") ~> (phase = "disposed")` 这类 leads-to
在显式公平性假设下由 TLC 检查。写不出任何证据形式时，问题在性质表述本身，
回到需求把它改写成可被反例否定的陈述，不新设「无法验证」的状态登记缺口。

从 [数据](data/README.md)、[能力](capabilities/README.md)、[组合](compositions/README.md) 继续导航；
`archive/` 仅保留历史来源，`.templates/` 是写作资源，二者都不能当作当前接受的规格。

## 当前状态

**当前有六个 topic**，都属租户相关领域。前五个**为 `accepted`、资源已冻结**
（[D-023](../record/decisions/tenant-domain-design-acceptance/README.md)，产品负责人，2026-09-22）；
`compositions/governance-center-entry` 是 **`candidate`**（2026-09-23 登记，未接受、未冻结，主责产品依据 PF-017 rev 1 仍是 draft），下文关于接受与冻结的段落不适用于它：

| topic | 拥有什么 |
|---|---|
| [`data/identity-values`](data/identity-values/README.md) | 身份值的形状与隔离义务 |
| [`data/offer-expiry`](data/offer-expiry/README.md) | 一份待接受的邀约何时不再可被接受 |
| [`capabilities/account-identity`](capabilities/account-identity/README.md) | 账号事实、登录状态、凭据校验 |
| [`capabilities/organization-governance`](capabilities/organization-governance/README.md) | 组织、成员关系、邀请与隶属请求、当前租户身份 |
| [`compositions/account-registration`](compositions/account-registration/README.md) | 一次注册从入口走到稳定点的整体责任 |
| [`compositions/governance-center-entry`](compositions/governance-center-entry/README.md) | 客户端 ↔ 治理中心这条边：判定次序、四种入口答复、身份推导与补授权、公开体检与运维面、治理中心标识（`candidate`） |

**五份已在 [catalog](../registry/README.md) 登记并接受**（登记与接受都在 2026-09-22），
`acceptance` 一律指向 D-023 的 `acceptance.json`，`frozen.json` 登记了五个 v1 目录的全部 18 项资源。
它们之间的依赖带精确坐标与消费 clauses，登记口径是**正文以坐标引用某条款即为消费**，
只有否定式提及（「不来自」「不同于」）不登；**方向只算消费者 → 提供者**：data 契约正文以坐标引用
capability／composition 条款作「落点」（谁在用它），不构成 data 契约对它们的依赖；
**登的是实质消费**——本契约据以写出承诺、判定、映射或证据落点的条款；只作结构性前提
（如引用对方的依赖方向声明）或类比（「与……是同一条规矩」）的引用不登；`organization-governance` 对 `data.identity-values`
的消费面已于评审轮二收齐为 27 条，与 [契约 S-4 的表](capabilities/organization-governance/README.md)一致。

**接受由 [D-023](../record/decisions/tenant-domain-design-acceptance/decision.md) 完成，冻结由 registry 完成。**
评审期间「PF-001 升 rev 的语义变化直接落在 v1 上」的做法**自接受起终止**：
v1 目录任何字节变化都会被检查器报 `frozen file changed`，语义改动[发布 v2](#路径即身份)
（`baseline.json` 的 `version_policy` 已是 `evolving`）。D-023 已点名四处措辞与现行节点设计对不上、
一处 S-39 读法待收口——**都留给 v2，实施按现行节点设计**。
接受不表示已实现或已验证：五个 `verification.md` 在版本外，仍可变，实际状态以它们为准。

**形式工件已执行过两轮**（都在 2026-09-22：
[第一轮](../record/evidence/2026-09-22-formal-tenant-domain/README.md)，
以及评审轮一改了模型之后的[第二轮](../record/evidence/2026-09-22-formal-tenant-domain-2/README.md)）：
`organization-governance` 的 `Membership.cfg` 与 `account-registration` 的三个配置
**四个都登记成了 formal task**，两轮**四个都无反例**；
`Membership_NoSerialization.cfg` 两轮都**按预期给出反例**（有效性核对，因期望失败而不登记为任务）；
四条 Alloy 命令按预期 SAT／UNSAT，但 **`alloy exec` 的退出码与断言结果无关，因此未登记为任务**。
**当前模型的结论以第二轮为准**——`Registration.tla`、`progress.cfg` 与 `Affiliation.als` 都改过，
只有 `Membership.tla` 与它的两个 cfg 两轮逐字节相同。

**「无反例」在这里离「已验证」还差一大截**：
两份 formal 入口一共列了 11 个变异核对与 2 个 TLA+ 有效性核对，**两轮一个都没登记**；
五份契约的规范场景**一条都没演练**。
各包的实际状态与边界以其 `verification.md` 的「实际执行」一节为准。

2026-09-17 建在 PF-001 rev 1 上的三份候选
（账号身份、租户治理、账号注册组合）已于 2026-09-22 由产品负责人裁定**整体废弃**，
它们从未被接受或冻结，原件只在 Git 历史里；架构与规格设计从 PF-001 rev 8 及其后续修订从零起步，
第一站是租户相关领域。

存量 topic 尚未从 `design_legacy/spec/` 迁入。由于路径形状不变，
迁入是整目录搬运：`$id`、冻结清单中的相对路径与包内相对链接都不需要重写，
SHA-256 也不改变。

候选设计可使用本次明确输入并保留版本/接受缺口。返回 [系统设计链](../README.md)。

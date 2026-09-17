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

因此**这一层的目录结构不随组织方式调整而变动**。上一代结构调整时，
其余目录重新归并，本目录路径原样保留。

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
已由设计触发的模型检查或证明义务不因模板可选而消失，门槛见[组合性质](../../agents/skills/harness-design-handbook/canonical/references/architecture/assurance/composability.md)。

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

已有三个 topic：[account-identity](capabilities/account-identity/README.md)、
[tenant-governance](capabilities/tenant-governance/README.md)、
[account-registration](compositions/account-registration/README.md)，均为 candidate。
注册组合含 TLA+ 行为模型与三个检查配置，已实际执行。

存量 topic 尚未从 `design_legacy/spec/` 迁入。由于路径形状不变，
迁入是整目录搬运：`$id`、冻结清单中的相对路径与包内相对链接都不需要重写，
SHA-256 也不改变。

候选设计可使用本次明确输入并保留版本/接受缺口。返回 [系统设计链](../README.md)。

# 在设计工作区内取得上下文

**何时读：**需要定位本次要求、既有能力、采用依据或产物归属。
**读后决定：**哪些输入已知、哪些材料有效、哪些仍缺失，以及成果应落在哪里。
**返回：**[需求归位](intake.md)、[提供者投影](project.md)或[交付](handoff.md)。

## 工作区边界

本工作区的新维护依据从 `design/architecture/README.md` 取得：系统级预期仍在设计工作区，
新或已迁模块的公开形状、薄规格与验证资源随接口拥有者维护，执行路径由任务明确给出。
本页下方 spec/realization 的目录映射只用于具名未迁单元；不为新任务预建空节点。
这改变产物归属，不取消领域责任、Cordis 装配、租户和必要验证义务。

`.meta_harness/` 是完整的设计工作区。手册提供可复用方法，`design/` 保存本次待设计系统的事实；
系统名称、需求、技术约束、现有能力和采用版本都从内部材料或本次明确提供的输入取得。
手册不预先知道承载它的产品仓库，也不继承父目录的需求或架构作为设计事实。

下表路径均相对该工作区根。通过本 skill 实际文件所在的 `.meta_harness/` 定位；
若由宿主软链接暴露，先解析实际文件位置。独立迁出后由任务明确工作区根。
不要把当前 shell 目录、Git 根或宿主 `.agents/` 的父目录自动当作设计上下文。

## 通用 family 名落在本工作区的哪里

[信息包准入](information-packages.md)用的是**通用语义名**，因为手册可被单独迁出；
**本节把它们映射到这个工作区的实际路径**。分区按「什么事件让这条事实失效」划分，
不按文档体裁或被描述的对象划分——权威表在 `design/README.md#组织原则`。

| 通用 family 名 | 本工作区的实际位置 | 失效事件 |
|---|---|---|
| requirements（产品方向） | `design/product/<topic>/` | 产品方向改变 |
| requirements（系统目标与全局约束 `SYS-*`） | `design/foundation/<topic>/` | 系统目标改变 |
| requirements/interview | `design/product/<topic>/interviews/` | —（只追加） |
| research | **`research/`**——与 `design/` **平级的顶层家族**，不在 design 下 | 上游或事实本身变化 |
| proposals | `design/record/proposals/<topic>/` | 永不失效，只追加 |
| decisions | `design/record/decisions/<topic>/` | 永不失效，只追加 |
| spec/data · spec/capability · spec/composition | `design/spec/{data,capabilities,compositions}/<topic>/v<N>/` | 语义变更（发新版，不原地改） |
| providers | `design/realization/packages/<node>/`（`kind: provider`） | 实现换方案 |
| assemblies | `design/realization/apps/<node>/`（`kind: assembly`）；应用的形状（拓扑、进程、交互面、分层、技术栈、分发）在同一节点的 `architecture.md`；**交付面已有 PF 即可建 `candidate` 节点**，不必等源码 | 实现换方案 |
| 设计投影（[步骤 G](../SKILL.md)） | `design/product/<topic>/projection/v<N>/` | 需求变更或上游设计变更（**出新版，不原地改**） |

**还有几个分区没有对应的通用 family 名，它们是这个工作区自己的：**

| 分区 | 保存什么 | 失效事件 |
|---|---|---|
| `design/ubiquitous_language/` | 每个概念精确指什么；词条带「形态」（对象 / 视图 / 属性……）与带 rev 的出处 | 某个概念的含义变了 |
| `design/domain_objects/` | **产品设计与架构、规格之间的那一站**：跨 topic 收齐的领域对象条目（宿主、身份依据、生灭、带 rev 的依据）与对象性待裁项。键是统一语言的词条 ID | 一个对象被重新认定或重新分解 |
| `design/registry/` | 身份、版本、基线、血缘、命名空间、形式任务、覆盖关系（`*.json` 清单，不按 topic） | 发布、接受、冻结、重分解 |
| `design/basis/` | 内核与上游的机制语义条目及其 probe | 上游换版本 |
| `design/record/evidence/` | 形式任务与符合性**实际执行**留下的配置、输入快照、原始结果 | 永不失效，只追加 |
| `design/views/` | 全部派生的聚合视图，**不手写、不手改、不得引为依据** | 上游任一处变动 |

**三个通用名在本工作区没有独立分区，不要去建：**

| 通用名 | 它的内容现在归谁 |
|---|---|
| architecture | **尚未开始**。当前能力基由 `design/registry/catalog.json` + `design/spec/` + `design/realization/` 共同回答；**不要另建一份架构正文** |
| migrations | 旧新身份的对应关系归 `design/registry/lineage.json`；过程材料留 `tmp/` |
| providers ／ assemblies 分家 | **已合并为 `design/realization/`**，两者是同一种节点的两个 `kind`——那边 README 有合并理由 |

## 需求与系统约束

**需求分两处，按「什么会让它失效」分：**

- **系统目标与全局约束（`SYS-*`）**读 `design/foundation/README.md`，按相关条款展开各 topic。
  它拥有目标、部署/隔离/模型访问等全局约束，**失效事件是系统目标改变**。
- **产品设计**读 `design/product/README.md`，按 topic 展开。每个 topic 包内
  `design.md` 拥有概念、模型与产品规则，`acceptance.md` 拥有可观察结果，
  `decisions.md` 分开记录拍板、PM 推导与待裁决，**失效事件是产品方向改变**。

- **领域对象**读 `design/domain_objects/objects.md`，从派生总表 `design/views/domain-object-map.md` 找入口。
  [步骤 A](../SKILL.md) 要的「相关领域对象」与 C1 对象分解的起点都从这里取：每条给出宿主、身份依据、生灭，
  并指回产品正文的具体章节与 rev。**它是输入，不是依据**——条目与它指向的产品正文不一致时以正文为准；
  条目里标了「未裁」的，以及 `pending.md` 里与本次需求相关的待裁项，**在依赖它的设计定稿之前要先闭合**，
  不要就地猜一个。它只回答「有哪些领域对象」；`已有对象 → 需求条款` 的反查索引（视图清单里的 `object-index`）仍未建立。

手册中的示例不补充产品要求。本次输入尚未归档时明确记录来源和确认范围，不伪造已有条款编号。

**产品正文只写最终确定的设计**：版本对照、交割说明与推导过程分别归该 topic 的
`changelog.md`、`decisions.md` 与 `interviews/`，读正文时不必在里面找历史。

`design/product/<topic>/interviews/` 保存可选的需求访谈语境。需要理解当时的争论、公开理由、观点修正或决定背景时按主题读取；
它不是正式条款或接受依据。交互正在形成值得回顾的需求语境时，按[需求归位](intake.md#何时自主启记访谈)接续或建立信息包。

目录是空骨架、正文未导入或版本不明时，说明缺哪项输入以及影响。
可以凭用户已给出的需求继续候选分析；必要信息不足只阻止依赖它的定稿或实施。
不向工作区外寻找同名 docs/spec 补齐，也不因没有内部登记便断言系统不存在相关能力。

## 契约与架构

| 当前问题                              | 工作区内的拥有者                                             |
| ------------------------------------- | ------------------------------------------------------------ |
| 当前能力基、组合关系及候选/已接受范围 | **没有单独的架构区**：由 `design/registry/catalog.json` 的状态、`design/spec/` 的正文与 `design/realization/` 的绑定共同回答 |
| 已接受选择、理由与取代范围            | `design/record/decisions/`                                   |
| 候选与取舍                            | `design/record/proposals/`                                   |
| 观察证据（上游事实、版本化读数）      | **顶层 `research/`**（与 `design/` 平级）                    |
| 运行证据（实际跑过什么、得到什么）    | `design/record/evidence/`                                    |
| 机制语义条目及其 probe                | `design/basis/`                                              |
| 数据、能力与组合的精确含义            | `design/spec/README.md` 及对应版本正文                       |
| 可采用身份、版本与接受依据            | `design/registry/catalog.json`，仅在实际存在且已有有效登记时消费 |

**`accepted` 这个状态词要求接受依据可定位**：catalog 里一个条目从 `candidate` 变成
`accepted` 时，它的 `acceptance` 必须链接一份实际的 `design/record/decisions/` 文件——
**没有那份文件就不能标 accepted**，规则在 `design/registry/README.md`。

已有正式契约先查其接受依据与精确版本，再按需追溯候选和研究。
能力基按语义承诺与关系查找，不能从插件目录或已实现接口反推完整范围；
已定义但未实现的能力仍可被识别，实际提供者与证据状态另行报告。
catalog、冻结记录和形式任务清单不存在或不含相关身份时保持缺失状态，不创建空文件冒充已完成迁移。

## 权威与变化

用户明确的新要求优先于历史交接。有效需求前提与适用范围内，已有决定约束后续设计；
接受范围、持久化判断、消费基线与复议的方法由[设计选择](design-decisions.md)提供。

语义、提供者与装配的工件分工见[交付页](handoff.md#s7把内容放回拥有者)。
本手册拥有跨产品复用的设计方法；具体格式、接受主体和工具约束只从工作区的实际 owner 与本次明确输入取得。
尚未提供的登记格式或发布工具是具体执行输入缺口；本手册的方法继续适用，
不能因为该目录为空省略选择依据、版本约束或变更传播，也不借用承载仓库的流程作为默认规则。

## 主题信息包与模板

先用[信息包准入](information-packages.md)判断是否值得长期保存，再读 `design/README.md` 和相关分区 README；已有主题先读其包入口。
新主题的可复制信息包归各分区本地 `.templates/`，例如 `design/record/proposals/.templates/topic/`；
产品 topic 的包形状见 `design/product/.templates/topic/`（含可选的 `interviews/` 与 `projection/`）；
规格家族由 `design/spec/README.md` 导航 data、capability、composition 三种包；
实现节点由 `design/realization/.templates/node/` 起步，`kind` 决定它落在 `packages/` 还是 `apps/`。
模板资源不参与实际需求、能力、决定或规格发现，不能把占位内容当作已知系统事实。

一个 topic 是入口与相关正文、证据、评审等组成的信息包，各家族按自己的职责选择形状。
按包起步，按本次问题裁剪，删除附属文件时同步入口；不要求每个任务创建所有家族或填满所有文件。
跨包引用实际主题与可恢复修订，不复制另一份权威；模板自身不产生确认、接受或发布状态。

手册的方法自包含，模板属于可选的工作区写作资源。单独分发 skill 或尚未提供模板时，
沿本手册的产出要求组织材料并说明实际落点，不回读外部产品仓库补模板或推断政策。

## 规格维护与验证

最小充分表达与证据范围由[规格专题](architecture/assurance/specification.md)说明，
版本、冻结与消费者传播由[规格演进](spec-evolution.md)说明，分层就绪见[交付页](handoff.md)，证明门槛见
[组合性质](architecture/assurance/composability.md)。这些方法不依赖外部维护文档才可理解。

实际契约归 `design/spec/`；冻结记录与形式任务清单归 `design/registry/`（`frozen.json`、`formal-tasks.json`）；
工具入口归 `tooling/`，先读其说明确认支持范围。

**本工作区正处在两种做法之间**：终态是每份契约只留最新一版（路径不带版本号、原地修订、修订号记在登记里），
切换还没有执行，树里仍是 `v{N}/` 目录、冻结字节仍不可改。过渡期的规矩——新版仍落成 `v{N+1}/`、不新增指向旧版的引用、
消费者迁完的旧版才删——写在 `design/spec/README.md`，依据是 `design/record/decisions/spec-single-revision/`。
每个旧版目录还被谁消费，用 `tooling/` 的「旧版规格的消费者盘点」列出来。

**当前自动检查覆盖到哪，要分清楚：**

| 检查得到 | 检查不到 |
|---|---|
| 设计树的身份、资源、引用、冻结与形式任务**登记**（`tooling/src/check_design.py`） | **设计投影的 `provenance.json` 与上游是否仍一致**——没有核对器 |
| 形式任务在 `--formal run` 下的**实际执行**及其退出码 | 投影正文与它声称的来源之间有没有漂移 |

**设计评审报告**（`tooling/src/design_review.py`）是另一个入口，**只读、只报告、不判失败**：对契约做确定性的机械核对——
未带坐标的条款引用、分析阶段的编号进了契约、产品依据标的 rev 过期、依赖与覆盖登记指不到条款、版本目录里有未登记的文件、
九件事表格缺行、失败集合开放式收尾——并给出契约依赖图上的环、稳定的依赖不稳定的、扇入扇出。
派发设计评审之前由派发者跑，把输出附进简报；评审者不运行它，拿到输出后逐条判断成立与否（见[评审判据](review/expression.md#先读工具算过的)）。
**它报出一条不等于契约有错**；它不判断歧义、同名不同义、用词、状态词与业务选择。

所以**投影是否过期只能人工核**：据某一版实施之前，按它的 `provenance.json`
回到各来源坐标对一遍。`tooling/src/projection.py` **不是**做这件事的——
那是 agent 产物（skills/roles）的编译器，与设计投影同名不同义。

**形式任务一旦真的执行，结果不落在规格的版本目录里**：规范资源一经接受即冻结并逐文件登记
SHA-256，而运行结果每跑一次就多一份——两类失效事件互相打架。实际执行留下的配置、
输入快照与原始结果归 `design/record/evidence/`，规格那边只登记任务与工件。
现有生成工具不自动具备规格验证能力；模型、证明和实现结果必须对应本次真实版本与执行记录。
规范清单用于发现契约及采用依据，区别于 Cordis 运行时服务/贡献注册表。
实际工具缺失不会使证据义务消失，也不授权自行发布契约。

## 实现设计与交付

| 当前问题                               | 工作区内的拥有者                              |
| -------------------------------------- | --------------------------------------------- |
| 具体提供者、依赖、资源、采用对象与版本 | `design/realization/packages/<group>/<node>/`（`kind: provider`；两层布局与 `core` 的准入见该区 README） |
| 应用选择、配置和跨能力装配             | `design/realization/apps/<node>/`（`kind: assembly`） |
| 本项目怎样接进 Cordis：服务定义放哪、服务键、依赖、事件、登记、配置、插件树（步骤 F 与节点的符合性核对表照它判） | `design/realization/cordis-integration-conventions.md`，规则编号 `IC-`。它核于 `@deepseek-ai/cordis` **4.0.4**（DSH `639ed015`），本手册「最小内核模型」核于 4.0.2（DSH `c291e796`）；两处对不上时以约定与 `design/basis/` 的 probe 为准 |
| 精确契约条款绑到哪份证据上             | 该节点的 `bindings.yaml`；**绑定要有稳定名字和一个在该语义消失时会失败的检查** |
| 长期迁移边界和消费关系变化             | `design/registry/lineage.json`（旧新身份对应）；过程材料留 `tmp/` |
| 评审与起草角色及行动边界               | `agents/roles/`，按实际定义与宿主可用能力使用；主线与角色的分工见下表 |
| 临时试验、施工安排与进度               | `tmp/`；值得持久保留的判断回到相应设计拥有者  |
| 探路件（[先把主路径跑通](../SKILL.md#主路径还没跑通过先做探路件)） | 执行仓库的 `examples/` 或本次任务的 `tmp/`；不进 `packages/`、`apps/`，产品包不得导入它（执行仓库的依赖方向检查会报）。带回设计的只有事实清单 |
| 故事卡的可执行验收 | 执行仓库里承载该卡用户入口的成员的 `acceptance/`，一张卡一个文件、文件名带卡号；由负责人、主会话或 qa 写，实施角色只读。核对它没被实施提交动过的入口是执行仓库的验收锁（本仓库是 `make acceptance-lock BASE=<任务基线>`） |
| 对外提供哪些产物、采用修订与来源       | `publication/`                                |

具体源码是提供者/装配设计中的显式映射：说明代码位置、修订、消费契约及证据范围，
不假设某个父目录就是实现仓库。映射或源码尚未提供时保留为实施缺口，语义设计仍可继续。

**主线做什么、角色做什么**（2026-09-22 租户领域一程之后定，2026-10-01 改为架构归人；判据：要与需求方对话、要跨全程上下文裁定、
或产物本身是一次裁决的归主线；输入写得成简报、产物能被独立评审、量大到压垮主线上下文的立角色）：

| 步 | 执行者 | 说明 |
|---|---|---|
| A 前身识别、D 对账与回询、E 简报、F 装配与符合性核对的四问与处置、G 投影、每轮评审处置 | **主线** | 都是裁定或核对，各一页表；F 的符合性核对表由 `realization-drafter` 随节点交、主线核；G 在节点评审闭合后落 |
| B 领域读数、C 承载读数、能力拆分提案（≥3 候选） | **主线或负责人亲写**，不派起草角色；agent 只评审与反驳 | 「系统该怎么切」是判断本身，用领域与能力的语言写，不借内核机制的词。**B 先写完并封存（落盘、提交），再开始 C**，产物开头写明 B 封存在哪个提交；同一执行者先后完成的如实标「双盲未达成，B 先行封存」。读数留任务区，被引用的理由落 `record/proposals/`；写完一律派 `design-reviewer` 判「选择」 |
| 契约、Schema、examples、形式工件、registry 登记、整批对齐 | `spec-drafter`；共用 data 契约先竞标合并，其余并行，最后一位做整批对齐 | 见[批内起草协议](define.md#一批契约并行起草时的协议) |
| provider／assembly 节点、bindings | `realization-drafter` | 节点评审闭合前不落 G |
| 基座级选择 | 三票独立评审投票（reviewer 角色，中立 prompt、强制二选一） | 反证互不重复才算独立 |
| 产品修订、词条、领域对象条目 | **主线**（新 topic 才派 `product-design-drafter`） | 要与产品负责人来回 |

主线亲自写的设计**同样**派独立评审；自评置信度对反例没有预测力。
需要施工计划时使用[交付规划](delivery-planning.md)；实际负责人、工具及环境由任务明确，不从角色名字推断已具备。

## 原语来源与外部证据

研究可读取官方文档、指定版本源码或任务明确提供的材料；这是有对象和范围的取证，
不会把外部仓库自动接入设计权威链。将相关事实、版本、局限留在**顶层 `research/`**
的对应 topic；**跨多次设计被反复依赖、且给得出 probe 的机制语义**另立
`design/basis/` 条目，上游换版本时由 probe 失败暴露。设计**采用**了什么是另一回事，
归 `design/record/decisions/`。方法见[来源核对](source-check.md)。

来源档案只解释材料从哪里整理而来，不能据此要求运行中的 agent 回到原仓库找当前需求。

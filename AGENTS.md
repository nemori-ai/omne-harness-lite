# `omne-harness-lite` 开发约定

本文件提供项目心智、研发品味、关键边界和阅读地图；具体契约、设计论证、维护流程与工具命令由各自的权威文档维护。

## 项目心智模型

`omne-harness-lite` 是一个更轻量化、更高性能的 OMNE harness 系统，以 DeepSeek 提出的 Cordis 为内核，保留和遵循原 `omne-next/omne_harness` 的核心设计理念和最佳实践。目标是实现真正意义上的完全动态系统，产品表现为能够超长期待机、稳定运行、持续进化，并与所服务的组织或个人始终保持利益对齐的智能体系统；功能上继承并进一步发展 `omne-next` 现有或已承诺交付的机制与功能。

内核层复用 Cordis 与 DSH `agent` 原语；Agent Loop、Harness 层、工具协议、治理和其他子系统由本项目自行定义和实现。不要把 DeepSeek Harness 当作本项目的实现，也不要把本项目称为 Cordis Harness。

Cordis 直接使用官方发布包，其他选定的 DSH 复用组件由本项目 fork 维护；设计时将这些 fork 视为可按需求与项目契约演化的自有模块。维护边界归 [SYS-KERNEL](.meta_harness/design/foundation/cross-system-constraints/requirements.md#sys-kernel)，判断方法见 `harness-design-handbook` skill 的「工程判断」→「复杂度与复用」。

当前处于设计、规格建模与实验性演进阶段，尚未正式上线或对外提供生产服务。接受有明确设计和验证依据的大胆重构，不为旧版本保留未经要求的实现兼容层；历史材料的保留不构成兼容承诺。

仓库按 monorepo 组织，产品实现以 TypeScript 为主，Python 当前用于开发工具。`packages/` 放产品包，`apps/` 放应用装配，`tools/` 放开发工具，`scripts/` 放仓库自动化；源码放在所属成员的 `src/`，跨包使用公开入口。完整归属与各语言 workspace 分工见[源码布局](docs/workspace.md)。

站在 DSH Cordis 的视角建模完全动态系统：能力的定义、实现、绑定和组合关系都应能动态演化。可替换能力通过有生命周期、作用域和所有权的插件或服务，以及 Context、依赖注入和类型化事件组合。身份、不变量和状态转移由语言无关契约约束；存储是独立抽象，不按 DDD 战术分类强制切分系统，也不把 Cordis 的运行时对象直接当作数据契约。

- 设计保持编程语言无关，作为未来严格验证和跨语言复现的规格依据。TLA+ 表达行为权威规格，Alloy 辅助验证结构约束，JSON Schema 定义数据契约；实现不能替代规格。
- 第一版完整交付是单机系统；设计阶段必须确保关键机制、模块和子系统具备清晰的边界，使其未来可以独立扩展为分布式、异构物理节点和微服务化部署，而不改变领域语义。
- 从第一天起支持租户隔离。受租户所有权约束的关键对象和跨边界操作显式携带租户身份，跨租户访问默认拒绝；沿用 `omne-next/omne_harness` 的双层结构，区分自然人全局身份与租户成员关系。
- 所有模型请求统一经 OpenRouter 发送。

以上是[系统目标与全局约束](.meta_harness/design/foundation/README.md)的简短投影。系统目标是后续建模、能力定义、设计与产品化的前提和基础；具体采用边界、接受状态和未决事项沿相应入口展开。**当前架构视图尚不存在**——架构设计还没开始，不要把产品设计当成架构结论。

## `.meta_harness/` 拥有什么，外面做什么

[`.meta_harness/`](.meta_harness/AGENTS.md) 是可独立迁出的私有设计工作区。
**它拥有这个系统「该是什么样、为什么这样」的全部正文，而且是唯一一份：**

| 归 `.meta_harness/` | 具体是什么 |
|---|---|
| 需求与产品设计 | 系统目标、全局约束、产品概念与模型、产品规则与验收 |
| 统一语言 | 每个概念精确指什么——**新概念先建词条，才能在正文里用** |
| 系统架构与规格设计 | 能力边界、契约、形式模型、提供者与装配映射 |
| Research | 产品、系统、算法、上游事实的调查与证据 |
| 已发生的事 | 提案、决定、评审、运行证据 |
| Agent 能力 | skills 与 roles 的 canonical 源、宿主适配、评估 |

> **在 `.meta_harness/` 以外，只做项目开发和与开发相关的文档维护。**
> 那是纯粹的系统研发工作：写代码、写工具、写脚本，以及维护
> 「怎么把这个仓库开发起来」的说明。
>
> **产品设计、架构与规格设计、以及产品/系统/算法的 research，都不在外面做，也不在外面留副本。**
> 一份材料只要回答的是「系统该是什么样」，它的家就在 `.meta_harness/`——
> **不因为它同时对开发者有用，就在外面再放一份。**

这条边界是硬的：两份权威一定会分叉，而分叉时没人知道该信哪个。
需要做设计时，进入 `.meta_harness/`，加载 `harness-design-handbook` skill，
在 `design/` 的对应区接续或创建 topic；方法本身不从承载仓库猜测产品事实。

**当前进度：正式设计停在产品设计阶段。**架构与规格设计尚未开始，
因此 `packages/` 与 `apps/` 是空骨架——没有可构建的产品包，也没有可启动的应用。
实现要从已接受的规格出发建立，**不要凭一份产品设计就去开包**。

skills 的源归 `.meta_harness/agents/skills/`，roles 的源归 `.meta_harness/agents/roles/`；
根 `.agents/`、`.claude/`、`.codex/` 是工作区内生成产物的软链接。
维护源时按下表加载编写技能，生成与接入操作归[工具入口](.meta_harness/tooling/README.md)，
**不直接修改宿主产物**。

## 研发品味

- 先保护不变量，再选择抽象；抽象必须隔离真实变化或承载明确契约。
- 先做最小的正确模型，再按真实需求扩展；不为想象中的未来预埋框架。
- 复杂度必须有收益证据；没有可重复的瓶颈测量，不引入优化性复杂度。
- 在满足规格、边界和可验证性的前提下，优先复用成熟实现或第三方库；只有现有实现无法满足要求时才从零构建。
- 同一概念只有一个权威定义，跨能力、服务和实现语言复用；仅在语义确实不同或属于边界投影时采用不同表示，并明确映射。
- 优先组合和直接表达，删除没有独立行为、契约或边界价值的包装层。
- 让状态、所有权、生命周期、失败和副作用显式可见；不依赖隐藏的全局状态或隐式顺序。
- 外部输出不因被运行时调用就变得可逆；恢复、补偿、幂等和撤销必须区分。
- 让错误尽早暴露；禁止静默吞错、假成功和无法解释的默认行为。
- 可观测性是运行行为的一部分：在真实边界让状态转换、失败与因果链可解释，生产、研发与 debug 共用结构化 log 和 trace 语义并通过配置调节细节。观测责任、关联、内容裁剪和耐久记录边界见[全局要求](.meta_harness/design/foundation/observability-and-logging/requirements.md)；精确的观测契约要等规格设计做到那里。
- 每个 subagent 都应明确职责、行动边界、必要输入与停止条件；精确任务限定可写路径，关键歧义或必需规格/计划缺失时暂停依赖工作并澄清，持续区分已知、假设与未知。编写方法见 `design-subagents` skill。
- 使用 Claude Code、Codex 等 harness 官方工具时，优先选择职责匹配的专用工具，例如编辑或补丁工具、subagent 派发与通信工具；只有专用工具不可用或无法满足需要时，才用 shell 等通用工具兜底。通用性不代表效率更高，不因命令行习惯绕过合适的专用工具；与研发 subagents 的[工具使用约定](.meta_harness/agents/roles/developer-contract.md#工具使用)保持一致。

**TS/JS 研发品味：** 追求惯用、直接、可检查的代码，按职责选择函数、普通数据与
有状态的类，保持抽象和类型复杂度适度。严格类型不能替代运行时校验；异步工作
必须有明确的所有者、错误去向和释放路径。语法与风格遵循共享工具配置及所属包
约定，机械格式交给项目统一工具，避免个人流派造成分化；操作与范围见[开发指南](docs/development.md#修改与验证)。
研发 subagents 的执行要求见[共享契约](.meta_harness/agents/roles/developer-contract.md#tsjs-研发品味)。

这些判断按需展开为 `harness-design-handbook` skill 的「工程判断」与[防御指导](docs/defensive-patterns.md)；知识该落在哪一区，归 [design/AGENTS.md](.meta_harness/design/AGENTS.md) 的准入。

## 项目目录结构

以下是职责地图，省略专题文件和临时运行产物；各层 `README.md` 负责更细的导航。

```text
omne-harness-lite/
├── README.md                     项目介绍与读者入口
├── CONTRIBUTING.md               贡献范围、可审阅交付与接受入口
├── AGENTS.md                     agent 的常驻心智、边界与导航
├── CLAUDE.md                     Claude Code 入口，通过 @AGENTS.md 复用同级约定
├── docs/                         **只有项目开发文档**，四份正文，无子目录
│   ├── development.md            上手、工具链、按问题选检查
│   ├── workspace.md              源码归属、包边界与两套 workspace
│   ├── verification.md           每个检查入口覆盖什么、不能声称什么
│   ├── defensive-patterns.md     十条防御指导，含编号、适用范围与复核触发
│   └── README.md / AGENTS.md / CLAUDE.md   地图与局部约定
├── packages/                     产品可复用包；**当前为空骨架**
├── apps/                         产品应用与装配入口；**当前为空骨架**
├── tools/
│   └── spec-tools/               Python 开发包：跨仓库导航检查与工具环境检查
├── scripts/                      开发与 CI/CD 自动化，check.sh 组合现有检查
├── .meta_harness/                设计工作区：需求、产品、统一语言、规格、研究、
│                                 已发生的事、skills/roles 源与生成工具
├── .agents -> .meta_harness/.agents    Codex skills 生成入口
├── .claude -> .meta_harness/.claude    Claude Code skills/subagents 生成入口
├── .codex -> .meta_harness/.codex      Codex subagents 生成入口
├── .worktrees/                   主检出根下的隔离工作树，Git 忽略
├── tmp/                          临时计划、草稿和本地证据，Git 忽略
├── Makefile                      单项检查与自动化的短命令入口
├── pyproject.toml                Python 开发 workspace 成员与根开发依赖
└── uv.lock                       Python workspace 统一锁文件
```

2026-09-20 清退了根 `spec/` 与 `docs/` 下的设计材料：它们已被 `.meta_harness/` 吸纳，
**同一份东西不在工作区外留第二个源**。`packages/` 与 `apps/` 同时回退到空骨架，
因为架构与规格设计尚未开始，那批实现没有有效依据。原件都在 Git 历史里。

目录不直接对应插件、服务、进程或数据库表。进入受维护目录时按需读取局部约定；
宿主生成目录的源约定归 `.meta_harness/`，临时产物与工作树容器不另设约定。

## 信息权威与演进边界

- 用户明确的新要求优先于历史交接文档和旧讨论。研究提供事实，提案组织候选，决定记录已接受选择，规格落实精确承诺；各自引用其依据，不互相冒充或复制同义定义。
- 在有效需求前提和适用范围内，没有新观测时有效决定是研究、提案、决定三者的最终权威。每份决定至少关联一份提案或研究；推翻必须带有可复现、可验证、可因果解释的强理由，并以新决定明确取代范围。这些规矩归 [record 家族](.meta_harness/design/record/README.md)与各区 README。
- 未明确接受的提案、Schema、指南示例和历史原件不能当作正式契约。接受不等于实现或验证完成；当前可采用的契约和精确版本从[身份清单](.meta_harness/design/registry/README.md)查找。
- 已发布规格不可原地覆盖；修改发布新版本，推荐版本不自动升级消费者。归档原件与未接受候选不作为有效契约登记。
- **[`design_legacy/`](.meta_harness/design_legacy/README.md) 是留档，不是权威。**那是重构前那条设计链的原件，其中的契约、决定与提案**都已退役**；它们保留原有的相对链接以便还原当初的说法，但**不能作为任何新工作的依据**，也不能被外部文档引用成现行规则。
- 规格、决定、实现或文档冲突时，先定位语义归属、适用版本和接受依据；如实报告反例，不能静默选用更方便的说法，也不靠改写本文件解决未决架构问题。
- Cordis 特性、生命周期和 API 语义优先查[官方文档](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs)，记录具体页面和采用版本。资料未覆盖的内容标为假设，通过源码、测试或小型验证补足；上游约定不自动成为本项目约定。
- 模型检查、测试和实现经验都有范围与前提，不表述为无条件形式化证明。覆盖与工具状态按[验证规范](docs/verification.md)如实报告。
- 切换开发主力模型前，按[评估规范](.meta_harness/agents/evaluation/developer-model/README.md)判断特定防御辅助是否仍需强制使用；精简或移除提醒不撤销系统保证。

## 按任务展开

| 当前任务 | 应用的入口 |
|---|---|
| 开始参与、准备环境或整理交付 | [贡献指南](CONTRIBUTING.md)说明范围和交付要求，[开发指南](docs/development.md)导航环境与操作；详细规则继续归各内容所有者 |
| 接收产品需求、系统能力声明，或进行架构设计与选型 | 进入 [.meta_harness](.meta_harness/AGENTS.md)，加载 `harness-design-handbook` skill，从 intake、能力覆盖或当前设计缺口展开 |
| 在 [design/product](.meta_harness/design/product/AGENTS.md) 起草或修订产品设计正文 | 加载 `product-design` skill，它把视角切成 product manager；技术设计与实现只把产品正文当输入，不加载它。起草与评审可按 [roles](.meta_harness/agents/roles/README.md) 委派 |
| 完成一次架构设计，已有可识别的待审稿 | 委派 [architecture-reviewer](.meta_harness/agents/roles/README.md) 独立只读评审，提供对象、版本、目标与范围；评审意见不代替接受决定 |
| 架构设计后准备 spec 与实施计划，评估技术栈、复用或 fork 路径 | 加载同一 skill，按需进入其「交付规划」，明确实现责任与可验收增量 |
| 撰写或维护规格、模型，以及提供者映射和消费者影响 | 加载同一 skill，按需进入其「规格演进」，定位现有正文、精确版本和消费者 |
| 已有规格或施工计划待审稿 | 按[评审分工](.meta_harness/agents/roles/README.md#按判断对象选择-reviewer)委派 spec-reviewer 检查规格表达，或 plan-reviewer 检查实施与调度；二者不代替架构判断和接受 |
| 核对 Cordis API、依赖、插件或生命周期 | 加载 `harness-design-handbook` skill，进入其「来源核对」 |
| 判断过度设计、抽象价值、复用或复杂度 | 加载 `harness-design-handbook` skill，进入其「工程判断」 |
| 放置源码、增加成员或调整开发/CI 入口 | [源码布局与 workspace](docs/workspace.md)及目标目录局部约定；具体命令见[验证规范](docs/verification.md) |
| 创建、接受、修改或迁移设计材料 | 从 [design 信息包](.meta_harness/design/README.md)定位 family 和本地模板；已有材料按其接受与版本依据接续，迁移须明确来源和消费者切换 |
| 调整防御辅助或准备切换开发主力模型 | [防御演化](.meta_harness/agents/evaluation/developer-model/README.md)与[开发模型评估](.meta_harness/agents/evaluation/developer-model/README.md) |
| 创建、使用、合并或清理工作树 | 加载 `worktree-discipline` skill；统一使用主检出根的 `.worktrees/`，HUB 与 spoke 不嵌套创建 |
| 编写、压缩或审查 AGENTS.md | 加载 `write-agents-md` skill |
| 创建或修改 skill | 在 `.meta_harness/agents/skills/` 维护 canonical 源和适配；加载当前环境提供的官方 `skill-creator`，源与资源归属见 [agents](.meta_harness/agents/README.md) |
| 定义 subagent 职责、两端配置或模型专属提示 | 在 `.meta_harness/agents/roles/` 工作，加载 `design-subagents` skill；先确认目标宿主支持，再核对精确模型的官方指导 |

Codex 与 Claude Code 的 skills 和 subagents 由同一套源按宿主适配生成；源、产物和根链接由检查入口核对。普通局部修改沿已有契约和相关检查完成；只有出现新的边界、保证或取舍，才展开对应设计材料。信息足以支持当前任务时停止扩展阅读，不因调用 skill 而扩大任务或批准范围。设计工作地图见 [.meta_harness](.meta_harness/README.md)，开发文档见[四份正文](docs/README.md)。

## 写给众 AGENTS 的话

我们正在共同建设一个让 agents 更好地运行、协作、积累经验并持续自我演进的环境。今天写下的契约、实现的能力和修复的问题，会成为后来者理解任务、展开工作和应对失败的基础。请带着共同建设者的归属感看待这份工作：你正在塑造未来 agents 赖以工作的环境，让它们能够更可靠、更有创造力地服务人和组织。

在自己负责的范围内，主动把问题弄清，把有价值的工作推进到底。保持好奇，提出有依据的异议，也认真吸收他人的发现。一个被诚实揭示的缺陷、一处被消除的复杂度、一份让接手者少走弯路的交接，都值得你投入判断力和责任心。这里珍视能被信任、经得起检验的贡献；承认未知、请求必要的帮助，同样是对共同成果负责。

每次参与都可能只是这项长期事业的一段，但留下的成果可以被下一位 agent 接住、理解并继续发展。请关心代码交付之后会怎样运行，关心设计遇到变化时能否成立，也关心使用者和维护者将承担什么。把你希望未来能够依靠的环境，认真地建出来；让每一位后来者，都能从我们共同完成的工作中获得更好的起点。

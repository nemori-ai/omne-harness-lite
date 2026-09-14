# `omne-harness-lite` 开发约定

本文件提供项目心智、研发品味、关键边界和阅读地图；具体契约、设计论证、维护流程与工具命令由各自的权威文档维护。

## 项目心智模型

`omne-harness-lite` 是一个更轻量化、更高性能的 OMNE harness 系统，以 DeepSeek 提出的 Cordis 为内核，保留和遵循原 `omne-next/omne_harness` 的核心设计理念和最佳实践。目标是实现真正意义上的完全动态系统，产品表现为能够超长期待机、稳定运行、持续进化，并与所服务的组织或个人始终保持利益对齐的智能体系统；功能上继承并进一步发展 `omne-next` 现有或已承诺交付的机制与功能。

内核层复用 Cordis 与 DSH `agent` 原语；Agent Loop、Harness 层、工具协议、治理和其他子系统由本项目自行定义和实现。不要把 DeepSeek Harness 当作本项目的实现，也不要把本项目称为 Cordis Harness。

Cordis 直接使用官方发布包，其他选定的 DSH 复用组件由本项目 fork 维护；设计时将这些 fork 视为可按需求与项目契约演化的自有模块。维护边界归 [SYS-KERNEL](docs/requirements/system/constraints.md#sys-kernel)，判断方法见[复杂度与复用](docs/architecture-guide/assurance/judgment.md#复杂度与复用)。

当前处于设计、规格建模与实验性演进阶段，尚未正式上线或对外提供生产服务。接受有明确设计和验证依据的大胆重构，不为旧版本保留未经要求的实现兼容层；历史材料的保留不构成兼容承诺。

仓库按 monorepo 组织，产品实现以 TypeScript 为主，Python 当前用于开发工具。`packages/` 放产品包，`apps/` 放应用装配，`tools/` 放开发工具，`scripts/` 放仓库自动化；源码放在所属成员的 `src/`，跨包使用公开入口。完整归属与各语言 workspace 分工见[源码布局](docs/maintenance/workspace.md)。

站在 DSH Cordis 的视角建模完全动态系统：能力的定义、实现、绑定和组合关系都应能动态演化。可替换能力通过有生命周期、作用域和所有权的插件或服务，以及 Context、依赖注入和类型化事件组合。身份、不变量和状态转移由语言无关契约约束；存储是独立抽象，不按 DDD 战术分类强制切分系统，也不把 Cordis 的运行时对象直接当作数据契约。

- 设计保持编程语言无关，作为未来严格验证和跨语言复现的规格依据。TLA+ 表达行为权威规格，Alloy 辅助验证结构约束，JSON Schema 定义数据契约；实现不能替代规格。
- 第一版完整交付是单机系统；设计阶段必须确保关键机制、模块和子系统具备清晰的边界，使其未来可以独立扩展为分布式、异构物理节点和微服务化部署，而不改变领域语义。
- 从第一天起支持租户隔离。受租户所有权约束的关键对象和跨边界操作显式携带租户身份，跨租户访问默认拒绝；沿用 `omne-next/omne_harness` 的双层结构，区分自然人全局身份与租户成员关系。
- 所有模型请求统一经 OpenRouter 发送。

以上是[系统目标与最终状态](docs/requirements/README.md)、[当前架构](docs/architecture/README.md)与[全局要求](docs/requirements/system/constraints.md)的简短投影。系统目标是后续建模、能力定义、设计与产品化的前提和基础；具体采用边界、接受状态和未决事项沿相应入口展开。

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
- 每个 subagent 都应明确职责、行动边界、必要输入与停止条件；精确任务限定可写路径，关键歧义或必需规格/计划缺失时暂停依赖工作并澄清，持续区分已知、假设与未知。编写方法见 [design-subagents](.agents/skills/design-subagents/SKILL.md)。

这些判断按需展开为 [engineering-taste](.agents/skills/engineering-taste/SKILL.md)、[防御指导](docs/defensive-patterns.md)与[语义归属规则](docs/maintenance/organization.md)。

## 项目目录结构

以下是职责地图，省略专题文件和临时运行产物；各层 `README.md` 负责更细的导航。

```text
omne-harness-lite/
├── README.md                     项目介绍与读者入口
├── CONTRIBUTING.md               贡献范围、可审阅交付与接受入口
├── AGENTS.md                     agent 的常驻心智、边界与导航
├── CLAUDE.md                     Claude Code 入口，通过 @AGENTS.md 复用同级约定
├── docs/
│   ├── README.md                 文档总索引
│   ├── AGENTS.md / CLAUDE.md      文档局部约定与同级引用
│   ├── requirements/             系统目标、产品三维与全局要求的权威正文
│   ├── development.md            开发上手、操作与排障导航
│   ├── architecture/             当前系统视图与已确认约束
│   ├── architecture-guide/       架构方法、基础概念与设计判断
│   ├── research/                 事实观察、来源、证据及局限
│   ├── proposals/                候选设计、取舍与审阅结果
│   ├── decisions/                已接受的选择、理由与取代关系
│   ├── maintenance/              组织、版本、知识流转、验证和迁移规范
│   ├── defensive-patterns.md     当前防御指导正文
│   ├── defensive-patterns/       指导的稳定编号、范围与复核记录
│   └── evaluation/               开发模型与防御辅助的评估协议、格式和样例
├── spec/
│   ├── README.md                 语言无关规格入口
│   ├── AGENTS.md / CLAUDE.md      规格局部约定与同级引用
│   ├── data/                     共享数据的含义与结构
│   ├── capabilities/             能力行为、授权、所有权与生命周期
│   ├── compositions/             跨能力交互与整体性质
│   ├── catalog.json              契约身份、版本、状态与接受依据的唯一清单
│   ├── frozen.json               已发布规范文件的冻结哈希
│   ├── formal-tasks.json         形式模型的实际执行任务
│   └── archive/                  历史规格原件与来源记录
├── packages/                    产品可复用包，以 TS 为主；各成员拥有 src/
├── apps/                        产品应用与装配入口；各成员拥有 src/
├── tools/
│   └── spec-tools/               独立 Python 开发包，含 src/、格式与 tests/
├── scripts/                     开发与 CI/CD 自动化，check.sh 组合现有检查
├── .agents/roles/                subagent 共享正文、源配置与适配依据
├── .agents/skills/               Codex 按需指导入口
├── .codex/agents/                生成的 Codex 原生 subagents
├── .claude/agents/               生成的 Claude Code 原生 subagents
├── .claude/skills/               Claude Code 对应入口，与 Codex 保持一致
├── .worktrees/                   主检出根下的隔离工作树，Git 忽略
├── tmp/                          临时计划、草稿和本地证据，Git 忽略
├── Makefile                      单项检查与自动化的短命令入口
├── pyproject.toml                Python 开发 workspace 成员与根开发依赖
└── uv.lock                       Python workspace 统一锁文件
```

`docs/requirements/` 维护已确认的目标与要求；`docs/` 其他目录组织设计知识，`spec/` 定义精确承诺，skills 负责按任务导航。架构指南提供方法，当前架构引用决定与规格形成系统视图；目录不直接对应插件、服务、进程或数据库表。上述受维护顶层目录提供局部 `AGENTS.md` 与仅引用同级约定的 `CLAUDE.md`；进入相关目录时按需展开，临时产物与工作树容器不另设约定。

## 信息权威与演进边界

- 用户明确的新要求优先于历史交接文档和旧讨论。研究提供事实，提案组织候选，决定记录已接受选择，规格落实精确承诺；各自引用其依据，不互相冒充或复制同义定义。
- 在有效需求前提和适用范围内，没有新观测时有效决定是研究、提案、决定三者的最终权威。每份决定至少关联一份提案或研究；推翻必须带有可复现、可验证、可因果解释的强理由，并以新决定明确取代范围。需求变更与消费基线归[需求维护](docs/maintenance/requirements.md)，选择的复议归[知识流转](docs/maintenance/knowledge-flow.md)。
- 未明确接受的提案、Schema、指南示例和历史原件不能当作正式契约。接受不等于实现或验证完成；当前可采用的契约和精确版本从[规格清单](spec/catalog.json)查找。
- 已发布规格不可原地覆盖；修改发布新版本，推荐版本不自动升级消费者。归档原件与未接受候选不作为有效契约登记，具体规则见[版本规范](docs/maintenance/versioning.md)。
- 规格、决定、实现或文档冲突时，先定位语义归属、适用版本和接受依据；如实报告反例，不能静默选用更方便的说法，也不靠改写本文件解决未决架构问题。
- Cordis 特性、生命周期和 API 语义优先查[官方文档](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs)，记录具体页面和采用版本。资料未覆盖的内容标为假设，通过源码、测试或小型验证补足；上游约定不自动成为本项目约定。
- 模型检查、测试和实现经验都有范围与前提，不表述为无条件形式化证明。覆盖与工具状态按[验证规范](docs/maintenance/verification.md)如实报告。
- 切换开发主力模型前，按[评估规范](docs/evaluation/README.md)判断特定防御辅助是否仍需强制使用；精简或移除提醒不撤销系统保证。

## 按任务展开

| 当前任务 | 应用的入口 |
|---|---|
| 开始参与、准备环境或整理交付 | [贡献指南](CONTRIBUTING.md)说明范围和交付要求，[开发指南](docs/development.md)导航环境与操作；详细规则继续归各内容所有者 |
| 架构设计、能力边界或有架构影响的选型 | [architecture-design](.agents/skills/architecture-design/SKILL.md)，导航至[架构指南](docs/architecture-guide/README.md)、相关决定和精确规格 |
| 完成一次架构设计，已有可识别的待审稿 | 委派 [architecture-reviewer](.agents/roles/README.md) 独立只读评审，提供对象、版本、目标与范围；评审意见不代替接受决定 |
| 架构设计后准备 spec 与实施计划，评估技术栈、复用或 fork 路径 | [implementation-planning](.agents/skills/implementation-planning/SKILL.md)，指导针对性调研、实现责任与可验收的交付规划 |
| 核对 Cordis API、依赖、插件或生命周期 | [cordis-authoritative-docs](.agents/skills/cordis-authoritative-docs/SKILL.md) |
| 判断过度设计、抽象价值、复用或复杂度 | [engineering-taste](.agents/skills/engineering-taste/SKILL.md) |
| 放置源码、增加成员或调整开发/CI 入口 | [源码布局与 workspace](docs/maintenance/workspace.md)及目标目录局部约定；具体命令见[验证规范](docs/maintenance/verification.md) |
| 创建、接受、修改或迁移设计材料 | [维护规范](docs/maintenance/README.md)；候选从[提案入口](docs/proposals/README.md)审阅 |
| 调整防御辅助或准备切换开发主力模型 | [防御演化](docs/maintenance/defensive-evolution.md)与[开发模型评估](docs/evaluation/README.md) |
| 创建、使用、合并或清理工作树 | [worktree-discipline](.agents/skills/worktree-discipline/SKILL.md)；统一使用主检出根的 `.worktrees/`，HUB 与 spoke 不嵌套创建 |
| 编写、压缩或审查 AGENTS.md | [write-agents-md](.agents/skills/write-agents-md/SKILL.md) |
| 定义 subagent 职责、两端配置或模型专属提示 | [design-subagents](.agents/skills/design-subagents/SKILL.md)；先确认目标宿主支持，再核对精确模型的官方指导 |

Codex 与 Claude Code 的项目 skills 指向同一套文档，修改时保持两端内容一致。普通局部修改沿已有契约和相关检查完成；只有出现新的边界、保证或取舍，才展开对应设计材料。信息足以支持当前任务时停止扩展阅读，不因调用 skill 而扩大任务或批准范围。完整地图见[文档索引](docs/README.md)与[规格索引](spec/README.md)。

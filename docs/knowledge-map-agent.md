# 项目知识与文档体系：agent整体上下文

本文件供初次接手项目、判断知识归属或维护文档体系时一次性读取。它给出完整的体系模型、拥有者位置和分歧处置入口，不递归加载所列材料。普通局部任务已找到承诺与验证责任时，无需每次重读本文件。人类图文说明见[知识全景](knowledge-map.md)。

本文件是现行体系的解释投影；规范归[文档治理](engineering/documentation.md)、[成员文档规范](member-documentation.md)及各实际拥有者。改业务含义、采用范围或工程规则时先改其权威源；不能在此文件裁定。路径以仓库根为参照，Markdown链接按本文件位置解析。

## 分层模型

| 维度 | 划分 | 判断边界 |
| --- | --- | --- |
| 阅读深度 | 定位 → 任务路径 → 使用/解释 → 精确承诺 | 只展开足以确定本次责任、前提、交接和验证的材料；一次了解体系不等于一次加载全部正文 |
| 遵循约束 | 项目目标与产品规则、系统架构、领域/成员承诺、实现/验证；工程规则按适用范围横向约束 | 本项目要求以docs/requirements.md为准，全局架构以docs/architecture已接受正文为准；产品设计须符合这两处和适用工程规则，下层只能有效细化，不得以实现或旧材料倒改目标 |
| 维护位置 | 项目根、docs系统/领域、packages能力组/实际成员、apps/tools成员、meta、任务过程 | 目录位置说明维护范围，不自动决定权威、DDD边界、包、插件、进程、服务或数据库表 |

产品决定业务后果，架构限定全系统技术边界，领域说明角色与交接，成员维护精确公开形状、必要行为和机制。它们不是单一总分目录：一个产品问题可跨领域，一个领域可跨包，一个包可含多个内部模块；遵循关系和物理目录须分别判断。

## 知识归属

| 要找的知识 | 唯一拥有位置或定位入口 | 必须保留的边界 |
| --- | --- | --- |
| 项目定位、阶段概览与开始路径 | [根README](../README.md) | 人类概览是投影，不另立产品承诺或进度源 |
| 常驻项目心智、责任、关键边界和加载触发 | [根AGENTS](../AGENTS.md)及任务目录实际AGENTS | agent可承担多种角色；提示不复制技能流程或完整业务契约，局部提示不能反转全局要求 |
| 角色路径、任务路由、维护步骤 | [docs/README](README.md)、[context-map](context-map.md)、[maintenance](maintenance.md) | 三者分别拥有起点、按任务展开和维护步骤；本说明拥有整体模型 |
| 项目目标、阶段及全局要求 | [docs/requirements.md](requirements.md) | 旧要求不能补入新条款；有效未决验收条件保持缺项 |
| 独立设计目标及本项目要求的meta导航 | [.meta_harness/design/foundation/](../.meta_harness/design/foundation/README.md) | 本项目现行要求仍只归docs/requirements.md，迁出工作区不能自动给其他项目授予本项目目标 |
| 产品需求/旅程、能力及实现状态、版本承诺、未决 | [.meta_harness/design/product/](../.meta_harness/design/product/README.md) | 模块聚焦业务，框架允许配置与扩展；能力支持来自绑定版本及覆盖的证据，不能从目标目录推定 |
| 开工前的领域地图、核心四项方向及顶层分层与单机进程图 | [docs/orientation.md](orientation.md) | 导航投影，每图带状态（已接受正文、首条路径已装载、已知冲突待裁、已裁定待写回）与出处；不拥有结论，冲突交出处拥有者 |
| 全系统分解、分层、生命周期、数据、安全、部署及集成保证 | [docs/architecture/](architecture/README.md) | 描述应然；系统未决集中由该区README导航。Cordis是装配与生命周期内核，领域独立建模 |
| 领域责任、逻辑模块、事实拥有者、允许协作、组合验证 | [docs/domains/](domains/README.md) | 不复制成员字段、状态协议、算法或完整SPEC；精确技术未决链接实际拥有者 |
| 目标能力组、包边界、SDK及新增扩展 | [docs/package-organization.md](package-organization.md)、[docs/workspace.md](workspace.md) | 前者维护目标组织，后者维护源码归属与实际工具边界；新目录不批准实施 |
| 能力组内工程分解、成员依赖、关键流程及共同维护 | [packages/<domain>/](../packages/README.md)的README及按需工程专题 | 与docs领域关系分开；成员未具名时保留承接缺项，不创建组根统一SPEC代替成员 |
| 公开形状、必要行为、内部机制、使用与持续资源 | 实际[packages](../packages/README.md)、[apps](../apps/README.md)、[tools](../tools/README.md)成员 | 类型/Schema拥有形状；SPEC拥有非类型行为；docs维护机制及使用；verification/tests/acceptance维护相称资源。完整必要行为不受“薄SPEC”篇幅限制 |
| 工程规则、任务场景、技能采用与交付 | [docs/engineering/](engineering/README.md)、[CONTRIBUTING](../CONTRIBUTING.md)、[development](development.md) | 项目额外约束归工程拥有者，通用方法引用已采用pstack/Matt技能。精确来源、版本及宿主读取归skills页；技能名字不证明实际加载或遵循 |
| 正式技术提案与最小决定、写回关系 | [docs/rfcs/](rfcs/README.md) | 正式条目按真实审议产生，初始空骨架不制造历史；提案不是当前完整规范，获准范围须写回实际拥有者 |
| 一次交付范围、条件、具名接受及恢复定位 | 实际GitHub Issue，入口为[agent-delivery](engineering/agent-delivery.md) | feature/bug/refactor/performance/maintenance/investigation为普通任务类型；不维护专门产品卡。Project为派生调度视图，先读单一配置的启用范围，平台关闭不授予接受 |
| 统一概念、正式用语及英文名 | [.meta_harness/design/ubiquitous_language/](../.meta_harness/design/ubiquitous_language/README.md) | 用词读取词条，不另建同义词表；改概念加载ubiquitous-language，单纯消费词条不加载治理技能 |
| 有身份对象的宿主、身份、生灭、依据与对象性未决 | [.meta_harness/design/domain_objects/](../.meta_harness/design/domain_objects/README.md) | 条目依统一语言与有效产品依据维护；不是完整领域架构或成员数据模型 |
| 上游机制在固定版本下提供与不提供什么 | [.meta_harness/design/basis/](../.meta_harness/design/basis/README.md)及有效来源/probe | 读数受上游版本和实际验证范围约束，不能自动把上游保证授予本系统 |
| 持续研究与条件性知识 | [.meta_harness/research/](../.meta_harness/research/README.md)及[agent研究入口](../.meta_harness/agents/research/README.md) | 根research职责/结构仍待负责人定义；读实际入口，不恢复旧模板或从目录推定结论采用 |
| 怎样给 agent 布置与评审一类设计（写给人的学习材料） | [.meta_harness/human/](../.meta_harness/human/README.md) | 不是规则，规则以其引用的拥有者为准；agent 不以它为任务依据 |
| 项目独有skills/roles、适配及持续评估资源 | [.meta_harness/agents/](../.meta_harness/agents/README.md)、[tooling](../.meta_harness/tooling/README.md) | canonical是源；.meta_harness下宿主目录是生成物，根.agents/.claude/.codex暴露入口，不手改产物 |
| 派生视图、结构库存、来源/符合性观察 | [设计views](../.meta_harness/design/views/README.md)、[spec-tools](../tools/spec-tools/README.md)、[repo-toolchain](../tools/repo-toolchain/README_ZH.md)、[verification](verification.md) | 视图用于定位源，报告用于定位偏离/未知。由真实输入重新生成，不手填结果或把观察变成权威 |
| 保留技术源、封存PF与旧实现 | [旧技术入口](../.meta_harness/design/architecture/README.md)、产品及包/应用入口中的legacy导航 | 只作核对出处或尚未承接的材料；旧接受、当前消费者或绿测不能批准冲突设计继续采用 |
| 候选、单次调查、访谈、逐轮评审、原始输出及调度状态 | 工作树tmp/<task>/，规则归[终态与过程材料](development.md#终态与过程材料) | 不成为永久第二规范；cloud接续保存正式成果的要求不等于提交全部临时材料。运行时业务数据仍由对应领域/存储承担，不以tmp充当Session持久存储 |

四类长期成果是产品设计、RFC、长期规格、技术设计。源码及验证资源分别说明实际兑现和覆盖，不成为第五种业务规范。一次交付规格只组织任务，不能取代长期规格；具体分类归[规格规则](engineering/documentation.md#单次交付规格与长期规格)。

## 状态与判断

以下各维度须分别取证，不是可倒推的单线流程。

| 维度 | 判断所需输入 | 不能推出 |
| --- | --- | --- |
| 候选或正式维护位置 | 文件身份、范围和来源 | 已接受、可开包或可调用 |
| 内容接受/技术采用 | 有权者、精确修订及范围 | 已实现、已装配或运行成功 |
| 实现支持 | 固定实现/制品、能力范围和相称证据 | 所有部署或全部产品承诺已支持 |
| 装配与实际运行 | 提供者、配置、环境及真实组合观察 | 未覆盖的配置、故障或资源条件成立 |
| 验证 | 执行记录、输入版本、前提、方法及覆盖 | 用户接受、发布授权或全系统正确 |
| 发布与启用 | 已授权动作、制品/模板及启用范围的实际读回 | 业务交付自动被接受 |
| 缺项/未覆盖/无法判定 | 应有要求、缺的输入、责任与闭合条件 | 相邻保证成立；空文件或允许留空不清除缺项 |

判断顺序如下。

1. 明确问题是目标、产品业务、全局技术关系、领域交接、组内工程、成员契约、实现观察还是一次任务；确定访问资格、实际拥有者和有效修订。
2. 读取所需权威正文；全局约束先核docs要求与已接受架构，工程规则按场景横向适用。仅消费内部依据的人需有实际访问资格，角色名字不授予权限。
3. 将现状与目标分开。冲突旧材料不能迁入新规范；源码限制记偏离。相互冲突的有效规范定位具体条款、范围及拥有者，交其裁定，不静默择一；只暂停依赖部分。
4. 判断所需精确承诺、消费者、失败/生命周期交接及验证是否足够。未接受的新方案、缺契约或绕过公开入口均不授予实施；责任足够后停止扩大读取。
5. 获准改变持续含义时写回唯一拥有者，同步真实消费者、入口、必要登记和验证；本说明、人类图和图中路径作为受影响投影同时维护，不在投影中修正规范。

实际受检检查范围由[验证说明](verification.md)和[clean-loop](clean-loop.md)拥有。`check:docs`证明导航/镜像，inventory观察登记结构，source检查证明准入及出处条件，context查询提供所选角色章节与直接引用；它们均不证明内容完整或行为符合。模型、测试、独立评审、交付接受分别记录其实际范围。

## 加载与维护

人和agent都可能承担终端使用、租户管理、部署运维、集成扩展、实现维护、验证评审、工具文档维护、系统架构、产品或项目交付角色。十类起点归[docs/README](README.md)，按任务展开归[context-map](context-map.md)，维护步骤归[maintenance](maintenance.md)。公开使用者只需有资格读取的操作和契约，不要求读取私有meta或安装维护插件。

- 起草产品加载product-design；改统一词条或对象分别加载对应治理技能；仅消费正文不改变工作视角。工程方法按[skills](engineering/skills.md)及实际场景选择。
- 文档、AGENTS、skills和roles分别沿根提示的专用技能触发；常驻AGENTS保持心智与路由，本文件只有在上述整体判断任务时加载。
- 局部修复可直接进入成员、局部AGENTS和受影响检查；新边界再展开架构/领域；正式方案审议才进入RFC；任务操作先核实际启用与授权。
- 信息位置、文种、约束、状态语义或必要加载入口变化时，维护规范拥有者及两份体系说明；仅业务细节变化且不影响地图时不机械改地图。SVG是人类说明的表达附件，不是第三套规范。
- 需要核某一具体保证时再打开相关源；仅了解完整体系时读本文件即可结束。不了解所需采用范围、缺权限或缺精确承诺时，在相应拥有者处停止行动，不补造规则。

# 文档阅读入口

十类读者共享同一套正文；本页按角色选起点，[任务地图](context-map.md)按工作选必需上下文。人和 agent 都使用这些路径。角色不授予访问或操作权限。Agent 可用[角色查询](../tools/spec-tools/README.md#按角色读取上下文)取得本页单个角色章节及直接引用；查询结果不授予支持或接受。

需要整体认识知识和文档体系，人读[知识地图](knowledge-map.md)，agent读[体系上下文](knowledge-map-agent.md)。两份分别用图文和紧凑文字说明同一套归属、遵循关系与状态；了解整体后再按本次角色或任务展开。

理解项目先读[项目要求](requirements.md)，理解系统设计再读[架构总览](architecture/README.md#系统总览)。架构向下展开到[领域责任](domains/README.md)和实际成员契约；[工程入口](engineering/README.md)帮助维护者选择工作场景、共享规范与技能方法。各层只维护自己拥有的正文，位置与遵循方向归[文档治理](engineering/documentation.md)。

项目要求、架构及领域正文已获负责人按相应范围接受。具体状态、未决条件和后续责任以各入口为准。已接受设计约束后续工作，当前支持的操作仍由实际应用或成员说明；设计接受、源迁移、实现完成与验证通过分别判断。

准备设计、实施或验收时，先区分[单次交付规格与长期规格](engineering/documentation.md#单次交付规格与长期规格)。前者组织本次任务，后者由各层承诺拥有者持续维护；任务输入引用长期源，持续保证不能只留在任务材料里。

## 选择阅读路径

| 你要做什么 | 阅读路径 |
| --- | --- |
| 使用系统 | [终端使用者](#终端使用者) |
| 管理租户及成员 | [租户管理者](#租户管理者) |
| 部署、运行或诊断服务 | [部署运维者](#部署运维者) |
| 使用独立包，接入SDK或扩展能力 | [集成扩展者](#集成扩展者) |
| 修复代码，新增或重构模块 | [实现维护者](#实现维护者) |
| 评审成果，识别偏离及证据缺口 | [验证评审者](#验证评审者) |
| 维护文档、工具、技能或生成入口 | [工具文档维护者](#工具文档维护者) |
| 设计系统及领域的边界和协作 | [系统架构负责人](#系统架构负责人) |
| 定义产品概念、场景和规则 | [产品负责人](#产品负责人) |
| 安排交付，决定验收与接受 | [项目交付负责人](#项目交付负责人) |

一个人可以沿不同任务进入多条路径。使用者不必通读内部设计，公共能力消费者也不要求访问私有meta。任务指南尚有缺项时，从所选应用或成员的公开说明判断当前支持范围，缺少关键前提或保证就交其拥有者补齐。

## 终端使用者

- 直接读当前[封存版 CLI](../apps.0.0.1.legacy/cli/README.md)，核对构建、连接、认证与命令权限。[使用指南](guides/usage.md)区分封存源与目标能力，说明尚缺的操作验证与承接责任。
- 按所选命令读输入、结果和失败处置。封存版 CLI 的 README 描述多轮会话及 Shell 等工具；这些来源说明不能证明新树或当前发布支持。专门使用指南由应用与文档维护者接续。
- 操作前提和预期结果明确后即可停止。需要其它能力才展开其公开说明；未支持任务或权限不明时暂停该操作。

## 租户管理者

- 直接读[封存版 CLI](../apps.0.0.1.legacy/cli/README.md)，确认调用身份、授权和作用范围。[管理指南](guides/administration.md)已有来源及停止点，完整操作流程仍待验证，缺少所需命令或失败处置时交治理应用拥有者补齐。
- 读所选公开命令及限制。管理指南由治理应用与文档维护者接续，产品目标不代表管理操作已支持。
- 职责、授权和失败处置明确后即可停止。跨租户或配置影响不明时展开有关公开契约，由拥有者澄清后再操作。

## 部署运维者

- 准备或诊断现有装配，直接读[tenancy-host](../apps.0.0.1.legacy/tenancy-host/README.md)及其部署说明，核对环境、构建、配置与数据目录。[部署指南](guides/deployment.md)已有来源及停止点，完整操作流程仍待验证。
- 规划daemon、进程分工或集群布局时，另读[部署架构](architecture/deployment/README.md)。目标拓扑不代替当前装配的操作说明和支持范围。
- 当前任务的环境与失败处置明确后即可停止。涉及存储或网络故障时展开相关成员；所需备份、恢复或生产保证未说明时，暂停对应承诺，交宿主维护者。

## 集成扩展者

- 消费独立能力，先按[集成指南](guides/integration.md)区分目标文档和可核对的封存来源，再从[包消费路径](context-map.md#消费独立包)及[包入口](../packages/README.md)选择实际成员，读其README、公开类型、行为和资源约定。
- 设计客户端接入或SDK扩展时，走[公开边界路径](context-map.md#公开边界变更)核对系统分层。新增类别、提供者或模块时，走[领域扩展路径](context-map.md#领域设计与新增模块)，再核对[产品包组织](package-organization.md)。
- 所需依赖、生命周期和结果责任明确后即可停止。跨成员交接才展开组合约束；缺关键契约或需要绕过公开入口时，先交契约拥有者处理。集成任务指南由相应拥有者接续。

## 实现维护者

- 先按[开发初始化](development.md#准备可用的检出)准备检出和coding agent插件，再从[局部修复](context-map.md#局部修复)或[领域设计路径](context-map.md#领域设计与新增模块)定位成员与局部约定。
- 依[源码布局](workspace.md)找公开承诺，按[验证说明](verification.md)选择受影响检查。工作步骤从[工程场景](engineering/scenarios/README.md)展开，技能采用与加载继续归[技能入口](engineering/skills.md)。
- 处理一次交付卡时读[交付操作](engineering/agent-delivery.md)与适用类型，先核启用范围；当前SPEC和设计仍随拥有者读取。
- 局部承诺和验证责任明确后停止扩大阅读。新增公开保证或产品含义转[公开边界路径](context-map.md#公开边界变更)；关键依据缺失时只暂停依赖的实施，交语义拥有者裁定。

## 验证评审者

- 从[冲突与验收](context-map.md#冲突与验收)及[验证说明](verification.md)确认对象、修订、采用范围与可运行环境。私有依据仅供有权限的内部评审者。
- 核对目标保证时读[架构符合性](architecture/assurance.md)，核对跨模块组合时读[领域验证责任](domains/verification.md)，再到实际成员的测试或模型。工作步骤沿[评审与交付](engineering/scenarios/review-and-delivery.md)。
- 证据足以判断本次范围后停止，缺环境、未执行或方法不支持分别保留。归属冲突或关键证据不足时交拥有者与交付负责人，不能把结构通过当作语义或运行通过。

## 工具文档维护者

- 从[文档重写整合](context-map.md#文档重写整合)进入[维护指南](maintenance.md)，按[文档治理](engineering/documentation.md)确认层级、唯一源与本次消费者。
- 格式及检查能力归[spec-tools](../tools/spec-tools/README.md)，环境归[开发指南](development.md)，宿主生成归内部[meta工具](../.meta_harness/tooling/README.md)。方法沿[文档与技能](engineering/scenarios/docs-and-skills.md)及[技能维护](engineering/skills.md#更新与维护传播)。
- 源、入向锚点、登记及必要读取者明确后停止扩大阅读。语义未定或消费者无法定位时只暂停对应切换；缺项交拥有者补齐，不能靠删除登记消除。

## 系统架构负责人

- 从[项目目标与架构设计路径](context-map.md#项目目标与架构设计)核对项目要求，再按问题选择架构专题。逻辑模块分工从[领域入口](domains/README.md)展开，精确接口与行为继续随实际拥有者。
- 用[采用范围](architecture/README.md#采用状态与当前有效源)核对目标与旧源关系，用[后续设计入口](architecture/README.md#未决事项与后续设计入口)定位尚未决定的事项。需要内部产品、独立目标或研究依据时才展开meta，工作方法沿[调查与设计](engineering/scenarios/research-and-design.md)。
- 责任、约束和必要组合义务明确后停止本轮展开。跨提供者、协调者或生命周期的保证需核对完整责任链；设计描述应然，实现事实用于识别偏离，未决方向由负责人裁定。

## 产品负责人

- 具备内部工作区权限后，从[产品入口](../.meta_harness/design/product/README.md)读取本次topic，再按需查[统一语言](../.meta_harness/design/ubiquitous_language/README.md)与[领域对象](../.meta_harness/design/domain_objects/README.md)。
- 场景、概念或规则的技术后果沿[架构入口](architecture/README.md)和实际契约核对，无需先读全部源码。产品正文的末块显示有效未决并链接技术拥有者，能力表显示有证据范围的实现观察。尚未承接的 PF 内容沿后续专项处理；新正文和目标成员文档不代表功能已支持。
- 场景、规则和剩余责任明确后停止。跨topic或概念变化时追踪必要消费者；推断与待裁由产品拥有者处理，工程整理不替产品裁定。

## 项目交付负责人

- 安排研发前，按[给负责人的开发指南](development_human.md)核对所用harness、插件初始化及责任。判断交付时从[贡献与接受](../CONTRIBUTING.md)及[验证说明](verification.md)核对范围、基线与实际证据。
- 用[冲突与验收](context-map.md#冲突与验收)定位缺项与拥有者，从[质量与证据](engineering/quality.md)看成果依据，从[完成声明](engineering/workflow.md#完成与交付声明)看结论边界。方法采用沿[技能入口](engineering/skills.md)，不要求逐项通跑技能。
- 通过对话建卡、取任务或维护阶段时，走[交付操作](engineering/agent-delivery.md)，先核启用范围。技术方案审议从[RFC入口](rfcs/README.md)展开；日常接入、当前规范与过去决定分别判断。
- 责任和接受范围明确后停止展开。红项、跨批依赖或未知影响需要对应细节；关键证据或裁决未到位时暂停相应接受。正文、工具、实际运行与读者体验分别判断，留空仍由工具报告缺项。

## 顶层入口分工

以下概览列出本区的顶层文件和专题分区。工程场景、架构流程与各领域的完整目录由分区README维护，避免在本页重复登记全部专题。

```text
docs/
├── README.md                  十类读者的起点与首轮路径
├── context-map.md             按任务展开与停止的上下文地图
├── knowledge-map.md           人类图文知识全景
├── knowledge-map-agent.md     Agent一次加载的体系上下文
├── assets/knowledge-map.svg   知识地图的静态图，正文有文字替代
├── AGENTS.md / CLAUDE.md       本区跨任务心智、触发与宿主入口
├── requirements.md            项目目标、范围与全局要求
├── development.md             开发初始化、工具操作与检查选择
├── development_human.md       负责人介入、核对与接受
├── workspace.md               顶层源码归属与开发workspace
├── package-organization.md    目标能力组、SDK位置与包边界
├── member-documentation.md    能力组与成员包的完整文档要求
├── verification.md            检查覆盖、证据与结论限制
├── defensive-patterns.md      项目防御要求与复核触发
├── clean-loop.md              传感器、硬线及处置责任
├── maintenance.md             文档新增、拆分、整合与维护
├── documentation.json         应有文档及必要章节登记
├── rfcs/                      正式技术提案、最小决定与写回关系
├── engineering/               共享规范、场景流程及技能引用
├── architecture/              全系统设计及跨责任约束
│   ├── runtime/               运行时与关键流程
│   ├── security/              授权、隔离及数据保护
│   └── deployment/            部署态、进程线程与分布式责任
├── domains/
│   └── <责任>/                责任关系及所属目标登记
└── guides/                    四类任务的来源、停止点及待补操作指南
```

| 入口 | 唯一导航职责 |
|---|---|
| [项目 README](../README.md) | 项目目标、阶段与开始入口 |
| 本页 | 十类读者的起点、前提及首轮路径 |
| [任务地图](context-map.md) | 共享任务的上下文、展开和停止条件 |
| [知识地图](knowledge-map.md)、[体系上下文](knowledge-map-agent.md) | 同一知识体系的人类图文说明与agent整体上下文；不另立规范或任务流程 |
| [文档维护指南](maintenance.md) | 选择信息粒度及新增、拆页、整合、登记和检查的维护步骤 |
| [产品包组织](package-organization.md) | 目标能力组、公共SDK落点、包边界与扩展规则，区分目标和工具现状 |
| [两层成员文档](member-documentation.md) | 能力组及成员包的知识归属、必要内容、阅读、维护与检查边界 |
| [项目要求](requirements.md) | 已接受的项目目标、交付范围和全局要求；未决验收条件继续保留 |
| [贡献指南](../CONTRIBUTING.md) | 贡献范围、可审阅交付与接受入口 |
| [根AGENTS](../AGENTS.md)、[本区AGENTS](AGENTS.md)及[CLAUDE入口](CLAUDE.md) | 项目心智、本区边界与按条件加载指引；宿主复用相应AGENTS |
| [工程](engineering/README.md)、[架构](architecture/README.md)、[领域](domains/README.md)、[指南](guides/README.md) | 对应分区的源、落点与缺口 |
| [开发](development.md)、[负责人指南](development_human.md)、[布局](workspace.md) | 开发操作、负责人职责及源码归属，详细规则继续引用其拥有者 |
| [验证](verification.md)、[防御](defensive-patterns.md)、[整洁回路](clean-loop.md) | 检查能力与限制、项目防御要求及质量反馈机制；迁移时须同时核对实际读取者 |
| 内部 [产品](../.meta_harness/design/product/README.md)、[研究](../.meta_harness/research/README.md)、[agent 能力](../.meta_harness/agents/README.md) | 私有源的内部入口，不作公共必读 |

角色起点由本页维护，任务路由由 context-map 维护；局部细节继续随领域／成员，不在各入口复制相同正文。发现失效路径交对应源维护者，导航调整交文档维护者。

工作分支同步、轨道提升及稳定点从[多层分支集成](engineering/integration.md)进入；实际命令与启用前提由[工具指南](../tools/dev-flow/src/integration/README.md)维护。

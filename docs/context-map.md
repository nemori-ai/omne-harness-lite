# 任务上下文地图

角色查询的范围、输入和命令见[工具说明](../tools/spec-tools/README.md#按角色读取上下文)，取得入口片段后仍沿本次任务展开。

本页拥有共享任务路由；[读者入口](README.md)拥有角色选择，具体规则与行为仍由被引用的源维护。按任务加载必需材料，信息足以确定本次责任后停止扩大阅读。精确版本、采用范围和运行证据不能从文件存在推断。

尚未建立整体知识模型时，人先读[知识地图](knowledge-map.md)，agent一次读取[体系上下文](knowledge-map-agent.md)。本页继续只负责按任务展开，不要求局部工作先通读全部体系。

## 项目目标与架构设计

讨论系统要达成什么、阶段范围或全局要求时，先读[项目要求](requirements.md)。讨论系统边界、组成与依赖时，先读[架构总览](architecture/README.md#系统总览)，再按本次问题展开专题。正文的接受范围、暂缓内容及旧源关系分别由项目要求和[架构采用状态](architecture/README.md#采用状态与当前有效源)维护，不由本地图另记状态。

| 本次要确定什么 | 必需架构入口 |
| --- | --- |
| 系统内外边界、责任分解与质量目标 | [边界与环境](architecture/context-and-scope.md)、[结构与责任](architecture/structure.md)、[目标与约束](architecture/drivers-and-constraints.md) |
| Session治理、三个runtime、装配变化及上下文组装 | [运行架构](architecture/runtime/README.md)，按流程选择所需专题 |
| 持久确认、状态恢复、授权、隔离与数据保护 | 按问题选[数据与状态](architecture/data-and-state.md)或[安全与隔离](architecture/security/README.md) |
| daemon、进程线程、单机与集群部署 | [部署拓扑](architecture/deployment/README.md)，具体操作仍走下方使用路径 |
| 公共表示、接口共同语义与保证的验证责任 | 按问题选[跨系统技术约定](architecture/cross-cutting-concepts.md)或[质量与符合性](architecture/assurance.md) |

需要细化逻辑模块时转[领域设计路径](#领域设计与新增模块)，客户端、SDK及服务端接口走[公开边界路径](#公开边界变更)。新边界、保证或取舍加载 `harness-design-handbook`，工作步骤沿[调查与设计](engineering/scenarios/research-and-design.md)。本次责任、约束和必要交接明确后停止扩大阅读；尚未决定的语义从[后续设计入口](architecture/README.md#未决事项与后续设计入口)找拥有者。

顶层正文描述应然。核对实现时读取实际成员契约与验证证据，报告与目标的差距，不据源码反向改写目标；具体原则归[顶层设计表达应然](engineering/documentation.md#顶层设计表达应然)。

## 使用管理部署

核对封存应用的操作，直接读[封存版 CLI 说明](../apps.0.0.1.legacy/cli/README.md)；部署或诊断旧宿主，直接读[tenancy-host说明](../apps.0.0.1.legacy/tenancy-host/README.md)及其部署入口。核对支持任务、环境、调用身份、输入结果与失败处置。[专门指南](guides/README.md)按使用、管理、部署和集成提供来源与停止点，完整操作流程仍有缺项。仅需操作时无需读内部产品设计。现有源无法闭合该操作或权限不明时暂停，缺口交应用拥有者；不靠目标设计推断已支持能力。

## 消费独立包

从[包入口](../packages/README.md)选择能力，核对目标成员的文档与实现状态，读 README、公开承诺和必要行为／生命周期约定。目标目录只有文档时不能直接安装或调用；核对已有实现则从[封存包入口](../packages.0.0.1.legacy/README.md)进入，再按其实际例子和检查验证。仅在资源交接或跨成员组合影响保证时展开[系统架构入口](architecture/README.md)。公开责任足够时停止；缺承诺或需要内部深层导入时暂停，由契约拥有者处理。

## 局部修复

从[开发指南](development.md)准备检出，按[源码布局](workspace.md)定位成员及其局部 AGENTS、公开承诺与受影响检查；执行路径从[缺陷指南](engineering/scenarios/bug-fix.md)展开，类型方法按条件读[技能入口](engineering/skills.md#pstack-方法入口)，资源责任按条件读[防御指导](defensive-patterns.md)和[异步验证](engineering/quality.md#异步资源的验证责任)。已有明确承诺足够支撑局部修复时不用通读产品与架构。出现新公开保证、身份、授权或失败语义，转下一条路径；缺规格或相冲突时暂停依赖改动。

## 公开边界变更

先核对[项目要求](requirements.md)中本次涉及的全局约束，再从已接受的[系统分层](architecture/layers-and-dependencies.md)展开客户端SDK、公开协议和服务端接入的边界。具体采用范围及缺项以正文说明为准，后续设计从[集中入口](architecture/README.md#未决事项与后续设计入口)定位。

读[贡献指南](../CONTRIBUTING.md#确定变更范围)，定位语义拥有者、当前采用范围、全部消费者与验证责任；系统技术关系从[架构入口](architecture/README.md)，产品含义由有权限的内部维护者进入 meta。方案与新边界用[调查与设计](engineering/scenarios/research-and-design.md)，已明确的新行为用[新功能](engineering/scenarios/feature.md)，消费者切换用[重构与迁移](engineering/scenarios/refactoring.md)。获得本次所需依据后停止扩展。必要语义或采用未定时不能从候选开包；公共参与者缺内部输入则由负责人提供允许的约束投影，不要求其访问私有材料。

## 领域设计与新增模块

从已接受的[责任入口](domains/README.md)按任务进入[边界地图](domains/boundaries.md)，再读相关责任页、实际公开契约及验证。领域页承载应然模块分工与组合责任，精确行为随实际成员或协调者；找到必要拥有者及交接后停止扩大阅读。

产品包目标分组、公共SDK位置和包边界从[产品包组织](package-organization.md)展开，[workspace](workspace.md)维护顶层归属与开发环境。旧包路径保持实际消费，模板与检查器的旧投影沿工具适配范围核对，不凭目录名推断新规则已被工具覆盖。

新增业务责任、类别、内部模块或提供者先按[扩展指导](domains/extending-the-system.md)判断，工作方法走调查与设计或Feature场景。目录不自动成为DDD、包、插件或进程；已接受的责任分解也不自动批准具体包和接口，尚未接受的新方案不能作为实施依据。新语义冲突只暂停依赖部分，原未迁源保持消费者责任。

## 文档重写整合

从[维护指南](maintenance.md)选择信息层级、粒度和维护路径，再读[文档治理](engineering/documentation.md)与本次目标入口，核对负责人方向、现行有效信息、待写位置、入向链接、格式／代码读取及生成消费者。具体工作走[文档与技能](engineering/scenarios/docs-and-skills.md)。工程通过共享／场景正文引用现行要求和方法，架构与领域正文仍由负责人主导，未采用内容保留待审／缺项。当前源及依赖足够就按块推进；有效信息处置或采用含义未定时暂停该块，不复制全文凑齐文件。维护者同步唯一登记与必要导航。调整能力组或成员文档时，读[两层文档要求](member-documentation.md)，区分系统责任、组内工程关系和单包契约，再按[模板入口](development.md#创建和整改产品包)建立实际草稿。

承接旧技术材料时，先读[现行系统架构](architecture/README.md)，再从[旧材料入口](../.meta_harness/design/architecture/README.md)及实际成员找细化和消费者。按[架构准入规则](engineering/documentation.md#位置与唯一源)筛选；冲突旧设计不迁入规范，实际限制作为偏离记录，未判定条款不授予采用。迁出位置未定的专题暂留原处，不为承接造空包，也不因此成为并列架构权威。当前产品、领域和具名成员设计从[产品地图](../.meta_harness/design/product/README.md)展开，有效问题归产品末块或所链接的技术拥有者。未分配成员的完整行为候选及尚未承接 PF 内容保留其缺项与来源，不作为新正文的并列权威。源退出和实际消费切换按[修改与迁移](maintenance.md#修改与迁移)核对。

## 冲突与验收

读[验证说明](verification.md)及实际承诺拥有者，核对精确修订、采用范围、反例和方法前提；步骤走[评审与交付](engineering/scenarios/review-and-delivery.md)，接受路径归[贡献指南](../CONTRIBUTING.md#评审与接受)。区分候选、未执行、有限通过、未知和确认偏离。能确定反例所属与证据范围时停止搜集无关材料；归属或版本冲突由拥有者裁定，不能改规则或删除登记让报告变绿。

## 性能与运行环境

可测指标走[性能指南](engineering/scenarios/performance.md)，依赖／平台／后端变化走[依赖与运行环境](engineering/scenarios/dependencies-and-runtime.md)。先明确本次被测的接口或操作、环境、契约与可比基线；责任足够就停止扩大阅读。没有运行或某后端跳过时保留未知，不能从配置可读推断生产支持。

## 交付卡与技术提案

人通过对话要求起草、建卡、取任务、更新或取消时，读[agent交付操作](engineering/agent-delivery.md)，再核[配置](engineering/github-delivery.json)的启用范围；六类任务的输入与证据归[工作类型](engineering/work-types.md)。找到本次真实卡、长期源、具名写者、必要条件及有权接受者后停止。协议未启用时不作平台写入；旧 ST 已退役，不继承其任务或专属历史协议。读取不等于派发，平台关闭不等于接受。

需要正式审议技术变化时，读[RFC入口](rfcs/README.md)；已有承诺足够的局部修复无需强制提案。进入审议后保留最小决定和写回关系，当前保证始终从实际规范拥有者读。只缺一次实施输入时沿规格分类使用Matt方法，不新建长期副本。

## 工程方法展开

按[场景选择](engineering/scenarios/README.md)确定主场景，再读其适用共享条款和[技能来源／加载](engineering/skills.md)。三层方法（流程 poteto-mode、写法 Matt、品味 ub-mode）的来源、宿主发现和读取方式沿技能页核对；原生调用及行为结果仍分别取证。独立任务从[隔离交接](engineering/workflow.md#责任与协作交接)展开，长任务从[成果保存](engineering/publication.md#成果保存与跨会话接续)展开。技能名字是指针，缺正文就不声明已调用；已有充分授权与输入不重复审批，关键缺口只停依赖部分。

集成拥有者负责[工作分支、轨道、main 与 stable 的运输](engineering/integration.md)。任务结果及修订仍归 Issue/交付拥有者；Project 是派生视图，Git 技术回执不授予结果接受。

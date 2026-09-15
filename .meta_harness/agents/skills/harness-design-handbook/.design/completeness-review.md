# 前轮设计方法完整性核对

日期：2026-09-15。对象：harness-design-handbook；状态：选择性整合草稿，待用户审阅。
本记录只供维护者，不参与 skill 分发；验证结果见[验证记录](validation.md)。
本记录保留前轮取舍及当时的认识；其中“变化轴 → 能力责任”的分解依据已被用户后续澄清取代。
当前心智、失效表述与修订范围见[能力维度心智修订](capability-model-review.md)，本页不作为运行时方法。

## 判定依据

完整性以新模型下的任务闭合为准：agent 能从要求与变化轴，辨认能力责任，
定义性质和完整动作链，给出 Cordis 提供者/装配设计，并说明选择、规格演进、就绪与证据。
旧材料是否逐篇搬入，不是完成条件。

一段内容有保留价值，是因为它解决具体设计判断、保护仍有效的边界或帮助接续；
重复主线改为路由，产品前提改为明确输入，宿主操作和项目专属格式留在各自范围。
每个方法分支要有何时加载、带回什么和返回点，不能把缺少的方法推给空的 governance 目录。

## 沿新主线核对与补齐

| 需要闭合的判断 | 原有状态与本轮处理 | 当前方法拥有者 |
|---|---|---|
| 来源、观察者、确认范围与终点 | 已有 S1；补充确认/交付阶段/验证区别和可恢复消费基线 | [intake](../canonical/references/intake.md)、[design-decisions](../canonical/references/design-decisions.md) |
| 变化轴、七类关系及权威边界 | 保留；不把关系当成本/证据判定器，亦不把空清单视为不存在能力 | [decompose](../canonical/references/decompose.md) |
| 性质、动作链、失败后的交接 | 保留 S4–S5 为方法拥有者；contract-description 改为消费者反查，减少重复教程 | [define](../canonical/references/define.md) |
| 复用、研究与实际版本 | 补许可/维护责任、候选失败分类和同版本文档/源码差异处理 | [project](../canonical/references/project.md)、[source-check](../canonical/references/source-check.md) |
| 选择、持久化、接受与复议 | 原来概述不足；吸纳仍有效的知识流转判断，去掉旧格式/标签惯例 | [design-decisions](../canonical/references/design-decisions.md) |
| 规格组织、冻结与消费者传播 | 原来集中于 handoff 几段；增加语义/映射/证据变更表、精确引用和混合版本核对 | [spec-evolution](../canonical/references/spec-evolution.md) |
| 证明与真实实现的对应 | 保留证据门槛；规格专题收敛为表达分工、抽象映射、前提责任与执行范围 | [specification](../canonical/references/architecture/assurance/specification.md) |
| 可实施增量和真实组合验收 | 原来条件规划过薄；补齐输入、产物/证据依赖、共享写入、集成、失败与接续 | [delivery-planning](../canonical/references/delivery-planning.md) |
| 分层就绪、评审与双向覆盖 | handoff 保留汇总，按问题路由；不把四层状态变成四轮审批 | [handoff](../canonical/references/handoff.md) |
| 小需求能否有最小完整路径 | 原例子集中于动态机制；新增已有能力读面示例，走通 S1–S8 而无需新插件 | [queue-view](../canonical/references/architecture/examples/queue-view.md) |

## 旧 skills 的选择性处置

来源身份及哈希见[来源清单](source-manifest.json)。以下“整合”表示方法已适配进包，
不表示旧入口已切换、旧目录可以删除或其全部原文都值得搬入。

| 来源 | 保留并适配的部分 | 不纳入本 skill 的部分 |
|---|---|---|
| architecture-design | 从目的到能力、语义/实现分工、权威消费、独立架构评审 | 固定旧仓库阅读路径、目录布局及产品采用事实 |
| implementation-planning | 契约适配、成熟复用、区分实验、维护权与成本、证据先于消费、真实组合交付 | 旧代码位置/施工命令、宿主调度操作和角色定义正文 |
| spec-maintenance | 最小充分规格、精确版本、分层就绪、映射补齐、变更分类与传播 | 旧 catalog 字段/状态枚举、冻结格式、当前检查器支持与产品登记数据 |
| cordis-authoritative-docs | 采用/查阅版本分开、原始证据、同版本冲突、原语/应用策略边界 | 默认回读来源仓库、把历史上游修订视为当前采用事实 |
| engineering-taste | 删除推演、责任价值、优化证据、总维护成本、错误和生命周期可见 | 开发主力模型选择、防御提醒成本评估及其专项实验流程 |

为补齐上述方法，另取旧维护正文中仍有效的知识流转、需求消费、语义归属、
规格维护/版本和交付规划判断。只取设计消费所需原则，不移植项目表单、发布工具或整套行政流程。
design-subagents、工作树纪律、角色模型提示与编排工具属于另外的能力，不是本 skill 完整设计路径的隐式前置加载。

## architecture 参考包逐题处置

| 专题 | 判断与本轮处置 |
|---|---|
| foundations/paradigm | 重写为合法结构、结构内行为、合法变迁；保留多种关系区别，删除重复 S1–S6、taste 与产品背景 |
| foundations/concepts | 保留统一词汇表；它解释语义职责，不要求实现同名类 |
| modeling/capabilities | 保留服务/插件不同边界、Agent 消费面、依赖及条目级失效 |
| modeling/identity-and-scope | 保留身份与授权、租户条件及旧清理风险；移除短页重复目录 |
| modeling/state-and-storage | 保留权威/投影、提交/耐久、存储与恢复区别；移除短页重复目录 |
| runtime/lifecycle | 保留效应配对、部分初始化、共享资源、静止、晚到结果；这些是动态投影不可缺少的义务 |
| runtime/interaction | 保留决策、提交、取消、结果未知与扩展点；移除短页重复目录 |
| runtime/evolution | 保留定义/运行、绑定、在途政策；删除“项目尚在快速演进”的默认背景，规格版本细节改为路由 |
| runtime/distribution | 保留有实际部署要求时的语义核对；主体/租户改为契约条件，避免推定产品必有租户 |
| assurance/invariants | 保留性质推导、保护/诊断分工和检查器演化；例子不接受为产品要求 |
| assurance/composability | 保留共享贡献、证明触发、机器检查条件、前提拥有者和实现对应；不以压缩削弱保证 |
| assurance/specification | 收拢为表达选择与证据映射；版本/消费者维护交 spec-evolution |
| assurance/judgment | 重写为删除推演、具体疑点与成本依据；复用路径交 project，不重复 taste |
| reference/contract-description | 从阶段教程改为消费者反查；保留“交出资格后被拒绝”的责任缺口示例 |
| reference/cordis-mapping | 保留历史机制/边界及固定来源；删去与 project 重复的具体提供者检查表 |
| examples/prompt-bindings | 保留声明、发布、绑定与历史的不同寿命；压缩导航 |
| examples/model-switch | 保留请求一致性、配置变化和外部效果归属；租户验证改为条件，压缩导航 |
| examples/storage-replacement | 保留写权、耐久与失败恢复；它与前两例解决不同问题，压缩导航 |
| examples/queue-view（新增） | 补充完整小路径，演示复用已有承诺及新增读面责任，不引入插件数量目标 |

18 个原实质专题均有仍有效的独立问题，因此保留主题；保留主题不等于保留原篇幅和职责。
原 7 个索引已由阶段路由与 topics 重组；原 AGENTS/CLAUDE 不进入运行时包。

## 方法自包含与实际输入缺口

选择、规格演进、交付规划及专题方法均在 canonical 内可达，不要求读取旧 skills、
旧指南或外部维护正文。实际产品要求、采用版本、接受主体、登记格式、源码位置、验证环境和可用角色由任务及内部设计提供。
这些实际输入可以缺失；缺失只限制相关结论和执行，不能作为省略方法的理由。

本轮保持旧指南、旧 skills、产品需求/spec、根宿主目录原状；生成产物仍在 .meta_harness 内。
角色渲染器/工具环境的独立打包、产品设计内容导入、旧入口切换和发布不属于本次方法核对。
当前结果是一份可审阅草稿；真实模型/产品实现验证和所有未来任务的正确性不由本轮阅读或试用证明。

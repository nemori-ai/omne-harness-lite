# 编写范围与整合依据

状态：待用户审阅。harness-design-handbook 是需求到 Cordis 设计的渐进式上下文地图；
示例承担 cookbook 式演示，不预置某个产品的设计事实。

## 用户约定

采用 C 布局，在 .meta_harness 内区分可复用方法、具体系统设计、agent 源与发布边界。
手册整理阶段保留旧指南、旧 skills 和产品设计正文，没有迁移需求/spec/角色。
后续已按用户授权迁入三个独立 skills 和角色源，见 [agents](../../../README.md)；
当前 worktree 根宿主目录的切换与旧实体留档见[退役记录](../../../evaluation/host-entry-retirement/README.md)。旧产品正文尚未整体迁移。

用户明确要求选择性吸纳：只保留在新设计模型下仍有价值且有效的部分，
允许调整 architecture 参考包，不按原文搬入率衡量完整性。
实际取舍、补齐和排除范围见[完整性核对](completeness-review.md)。
用户随后明确“能力维度”的含义：先用现有能力及其组合承载需求，再由未覆盖的独立责任形成新维度，
投影为独立插件。当前主线及关联页修订见[能力心智核对](capability-model-review.md)。
随后按用户明确的目录心智，将模板设计为 `design/{family}/.templates/` 中可复制的 topic 信息包，
取代刚起草的集中单文件模板；组织、检查与试用记录见[信息包模板修订](template-packages.md)。
正式 proposal topic 至少三个实质候选的后续要求，以及决定草稿归属修正，见[提案准入增量](proposal-admission.md)。
同一接受基线最多三轮实质迭代、未收敛时升级整体诊断的规则，见[评审收敛规则](review-convergence.md)。

## 来源与边界

核心路线来自主检出 tmp/requirement-to-plugin-way.md 与后续用户说明：
当前按后续澄清采用“需求 → 现有能力覆盖 → 剩余责任与演化 → Cordis 插件投影”；
原稿固定八根变化轴的划分不再作为能力分解方法。S1–S8 支持往返校准，taste 每点至多三句。
官方 /data/qiwei/.codex/skills/.system/skill-creator/SKILL.md 提供触发、渐进披露、自包含与验证方法。

原 architecture-guide、五个架构/spec 相关 skills 及所需维护正文为整理依据；
精确来源身份和哈希见[来源清单](source-manifest.json)。
来源记录只供维护者追溯，不能要求运行中的 agent 回读原仓库取得当前需求或方法。

运行上下文限于内部 design 材料和任务明确输入；手册不预知承载它的产品。
初版 project-context 的外部回读策略已撤除，产品默认政策改为条件；具体输入缺失不授权伪造。

## 运行资源的组织

| 层                                                    | 拥有的判断                                               |
| ----------------------------------------------------- | -------------------------------------------------------- |
| [SKILL.md](../canonical/SKILL.md)                     | 现有能力承载、能力基演化与插件投影的心智，终点与按需入口 |
| intake / decompose / define / project / handoff       | S1–S8 阶段问题、产出、停止点与返回路线                   |
| design-decisions / spec-evolution / delivery-planning | 条件加载的选择、规格演进与交付规划                       |
| source-check / workspace-context                      | 版本取证与内部实际输入/产物位置                          |
| [topics](../canonical/references/topics.md)           | 从具体问题直达参考页                                     |
| architecture                                          | 独立专题与五个示例；每页有读取条件与应带回的判断         |

原 18 个实质主题均有独立价值，因此保留主题，但重写职责、压缩重复正文并补充小需求完整示例。
原 7 个索引由阶段/专题路由替代，源目录 AGENTS/CLAUDE 不复制进运行包。
完整动作链归 define，复用投影归 project，规格演进与计划方法分别有单一拥有者。

canonical 是本草稿的运行资源源，.design 不分发；两端按显式 copy 包含所有 references。
可复用方法已经收敛到 canonical；独立 method 目录退役，取舍与来源见[目录退役记录](method-directory-retirement.md)。
外部 harness 的设计治理研究保存在 [.design/research](research/harness-design-decisions/README.md)，只供维护本 skill，运行中的 agent 无需读取。
模板由各 design family 拥有；skill 的 [information-packages](../canonical/references/information-packages.md)
携带可独立使用的准入与停止地图，实际文件形状仍从工作区本地模板取得，不复制模板正文。

## 后续实际工作

选择性方法整合与产品设计迁移是不同动作。具体系统的设计材料和采用基线按纵线接续，
真实产品登记/验证工具与实现映射仍以当前设计链为准；skills/roles 的源与根入口已经接续。
角色定义、工作树操作、宿主编排及模型/防御评估流程不属于本手册。后者已迁入 agent 评估区，
只在防御辅助采用任务中按自身协议加载，不扩张普通设计流程。

本轮验证覆盖官方元数据校验、链接/可达性、自包含阅读、独立只读复核和两端编译；
真实结果、历史证据局限及未覆盖范围见[验证记录](validation.md)。

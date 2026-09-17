# 研发角色源包

本目录维护 1 个产品设计起草者、4 个独立 reviewer 与 5 个开发者的共享正文及两端配置。
实际设计事实来自明确工作区的 design/ 或本次输入，实施位置由任务指定；
不从承载仓库或角色名称推断产品、包结构、能力清单与政策。

| 角色 | 当前职责 | 正文 |
|---|---|---|
| product-design-drafter | 把一个产品需求做成完整、可被评审的产品设计；配备联网**产品调研**能力，学同类产品的边界与取舍，不做技术调研；固定 xhigh | [产品设计起草](product-design-drafter/role.md) |
| product-design-reviewer | 评审起草交付的文档本身：逻辑、完整性、明显漏洞，叠加一层可实施性；**不评判品味与方向**；只读，固定 xhigh | [产品设计评审](product-design-reviewer/role.md) |
| architecture-reviewer | 从需求、能力覆盖与剩余责任检验演化选择、契约和 Cordis 投影；只读，不接受或修复 | [架构评审](architecture-reviewer/role.md) |
| spec-reviewer | 以给定设计为前提检查规格表达、版本、信息包与形式化声明；不代选业务语义 | [规格评审](spec-reviewer/role.md) |
| plan-reviewer | 检查实施输入、依赖与并行、写入归属、证明/探针和真实组合交付；不重审业务选择 | [计划评审](plan-reviewer/role.md) |
| kernel-developer | 实现明确划入内核的基础原语与生命周期机制；默认 xhigh | [内核开发](kernel-developer/role.md) |
| capability-developer | 实现已定义能力及组合的状态转换、规则与交接；默认 high | [能力开发](capability-developer/role.md) |
| infrastructure-developer | 实现具体提供者、后端与实际资源/持久性/失败保证；默认 high | [提供者开发](infrastructure-developer/role.md) |
| application-developer | 消费能力，完成应用装配和 API/CLI/Web 交互；默认 medium | [应用开发](application-developer/role.md) |
| verification-developer | 实现跨边界场景、故障注入、测量及形式工具适配；默认 high | [验证开发](verification-developer/role.md) |

角色正文拥有职责与边界，`codex.toml`、`claude.yaml` 和可选模型适配段拥有宿主差异。
五个开发者通过 `assembly.toml` 内联[共同契约](developer-contract.md)，固定提示已经包含必要输入、
行动授权和停止条件；[派发模板](developer-task.md)提供本次事实，不进入固定提示。
生成说明见[工具入口](../../tooling/README.md)，生成物归工作区内
`.codex/agents/` 与 `.claude/agents/`；这些目录由工具生成，未生成时不作为文档链接目标。

## 产品设计的起草与评审

这一对角色服务于**产品设计**，与下面三个 reviewer 服务的对象不同——
它们判断的是**技术材料**，这一对判断的是**产品文档**。

派发起草者时给出：需求的原始表述、可写的 topic 路径、设计工作区位置，
以及要建立关系的已有 topic。它开始之前必须能回答「解决谁的什么问题、
不做会怎样、边界到哪」，答不上来会停下来问——**这是有意的，不要替它编一个答案**。

**起草者的联网能力用于产品调研，不是技术调研。**它去看同类产品怎么划边界、
刻意不做什么、遇到同样的冲突怎么解；学的是取舍与品味，不是功能清单。
调研所得**不进拍板记录**，只能作为 PM 推导的参照，且必须说明为什么适用于本产品。

**评审者不评判品味。**方向与取舍由产品负责人裁决；起草者的判断即使不够漂亮，
只要自洽、完整、没有漏洞就不是问题。它找的是四类东西：逻辑矛盾、完整性缺口、
具体场景下的漏洞，以及（薄薄一层）这些定义能不能被无歧义地实施。
它若产生品味意见，会单列并标明不作为评审发现——**不要把那一段当成待办**。

两者可以串联使用：起草 → 评审 → 起草者按发现修订 → 必要时复评。
**评审不产生接受**；接受是产品负责人的动作。

## 按判断对象选择 reviewer

先给出明确设计工作区、待审对象与可恢复修订、目标/约束、采用依据及范围；
比较修订时再附比较基线。候选可以受审，设计缺陷本身不是开始评审的前置缺项。
不要假设 reviewer 继承了主会话的背景、已读 skill 或当前执行仓库。

| 判断 | reviewer 使用的 handbook 路线 | 特有输入与返回边界 |
|---|---|---|
| 现有能力能否承载；剩余责任是否支撑新维度；插件/组合能否兑现？ | decompose → define / project → handoff；按需展开性质与来源专题 | 需求确认范围、能力基或其缺口、设计快照；返回语义反例和所需决定/证据，不代写替代设计 |
| 既定选择是否被完整、明确、规范地表达？ | spec-evolution → specification → handoff | 规格快照及其落实的设计；返回表达/引用/版本/证据声明缺口，不重新判断是否应新增能力 |
| 依赖这些设计，实施能否安全推进并形成证据？ | delivery-planning → handoff / spec-evolution | 计划、验收、采用设计/规格与必要现状；返回受阻任务、写入冲突、证据和组合责任缺口，不逐条重审规格 |

路线均从 [harness-design-handbook](../skills/harness-design-handbook/canonical/SKILL.md)
进入，参考路径相对其根；实际 family/topic 入口拥有本次信息包，`.templates/` 只供裁剪使用。
上表三个角色共享只读纪律，判断对象不同，不要求每项局部修改依次经过全部角色。
product-design-reviewer 同样只读，但判断对象是产品文档，不走 handbook 那三条路线。

架构评审核对性质推导与机制证明门槛；规格评审核对性质、模型、范围与结果的准确表达；
计划评审核对证据的生产者和消费依赖。TLC/Alloy 工件按需选择，不因缺某工具文件就判错，
也不以 optional 取消已触发的义务。目录、审阅或工具通过不产生接受、发布或实际验证状态。

返回意见需带对象/版本、范围、位置、依据、触发后果及缺口，区分发现、风险、待裁决与未覆盖。
没有问题只说明本次范围内未发现阻断项。无写入、无执行测试/形式工具、无继续委派；
报告通过返回消息交付，由派发者按已有授权保存。

## 开发责任与并行

开发任务按能力纵线、产物及允许写入范围划分，不按角色反推模块。
使用 Cordis、拥有 runtime 或被复用不自动归内核；能力拥有行为与产品规则，提供者兑现
实际资源结果，应用负责接线/交互，验证设施不补造尚未实现的能力。

完整目标边界、验收清单、实施规格与施工计划是开发者必需输入，可以直接引用现有材料。
就绪按本任务的语义、提供者、装配与证据分别判断，内部算法和组织在既定契约内自主选择；
不能把尚未决定的公共语义交给 worker 猜测，也不为四项输入复制四套长期文档。

接口与前提可消费、写入不冲突时，消费者、提供者、应用和验证可并行；不强制五角色流水线。
每份共享接口/Schema/锁文件/装配资产指定写入负责人，需要组合时指定真实组合交付负责人。
替身和分支单测只支持其范围；组合责任不附带他人的写权、继续委派、Git 合并或接受权。

## 模型配置与本次派发

本轮沿用原配置：架构 reviewer 为 Codex `gpt-6-astra / xhigh`、Claude `claude-fable-5-1 / xhigh`；
规格/计划 reviewer 为 `gpt-5.6-sol / xhigh`、`opus / xhigh`，固定档位。
五个开发者为 `gpt-5.6-sol` / `opus`，默认档位见上表，可按任务选 medium/high/xhigh。
这是迁入的配置及有日期的支持记录，不是对当前账户或新版本宿主的重新核验。

开发者派发参数从源配置取得。在本工作区根、使用具备 Python 3.12+ 和 PyYAML 的解释器：

```sh
python agents/skills/design-subagents/canonical/scripts/render_pair.py \
  --source agents/roles/kernel-developer --dispatch codex --effort high
python agents/skills/design-subagents/canonical/scripts/render_pair.py \
  --source agents/roles/kernel-developer --dispatch claude --effort high
```

命令仅打印 JSON。Codex 派发需要显式应用返回的 effort；直接调用角色不保证采用源默认档位。
Claude 会话覆盖需应用完整角色 JSON，不以单个 effort 字段代替整份定义；实际调用面和支持范围
沿 [design-subagents](../skills/design-subagents/canonical/SKILL.md) 核对。固定 reviewer 不接受此调档入口。

原生文件存在不说明当前会话已加载。具名角色不可用时，可在已有授权内交接完整生成提示作普通
agent 试用，并说明未经应用的原生沙箱与权限不能算生效；无可用独立评审能力时保留具体缺口。
采用记录和迁移验证见[本轮记录](../evaluation/role-migration.md)，旧试用归
[历史记录](../evaluation/legacy-roles/README.md)，只支持原修订。
当前 worktree 根宿主入口的切换与原件留档见[退役记录](../evaluation/host-entry-retirement/README.md)。

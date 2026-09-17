# Meta Harness：心智与阅读地图

这里维护让 agent 从需求出发设计 harness 的方法、设计知识和研发能力；本文件负责常驻心智、权威边界与任务入口，详细判断由各自拥有者维护。

## 怎样看待这个工作区

`.meta_harness/` 是可以独立迁出的私有设计工作区。它既维护“怎样设计”的方法，也保存
“本次设计什么”的需求与设计链；方法不会预先知道产品名称、现有能力或实现仓库。
系统事实来自内部材料或本次明确输入，定位与缺失处理归[工作区上下文](agents/skills/harness-design-handbook/canonical/references/workspace-context.md)。

若它位于某个实现仓库中，对那个仓库的实际操作仍遵守适用约定；承载位置不使该仓库的
产品目标、技术栈、模型路由或旧 docs/spec 自动成为设计权威。目录为空表示材料尚缺，
不能据此断言系统不存在能力，也不能把模板和历史示例当作本次事实。

## 从需求长出能力，再投影到 Cordis

**需求的可观察结果 → 现有能力与组合覆盖 → 未覆盖责任 → 能力演化 → 语言无关契约与动作链 → Cordis 插件及组合 → 回到需求核对。**

能力维度按独立责任与变化边界划分，不由通用关注点表预设。先判断现有能力能否承载，
再辨别组合、扩展、提供者修复或新的独立责任；缺资料、缺实现和缺语义分别处理。
新增独立维度须给出独立插件边界；正交不等于无依赖或任意可交换。推理归[能力覆盖与演化](agents/skills/harness-design-handbook/canonical/references/decompose.md)。

契约拥有含义、状态权威与保证，提供者和装配拥有具体兑现关系；目录、类、服务键和插件数量
不能代替能力模型。组合须解释正常、失败及撤除后的责任交接，方法沿
[契约与动作链](agents/skills/harness-design-handbook/canonical/references/define.md)和[插件投影](agents/skills/harness-design-handbook/canonical/references/project.md)展开。

## 让知识能够接续

| 拥有者 | 保存什么，怎样进入 |
|---|---|
| [design/](design/README.md) | 产品需求、研究、候选、决定、精确规格、能力地图、提供者/装配与迁移关系 |
| [agents/](agents/README.md) | 可复用方法的 skill canonical 源与维护证据、宿主适配、角色正文和公共契约 |
| [tooling/](tooling/README.md) | 确定性的生成、检查与项目链接，实际支持边界以工具入口为准 |
| [publication/](publication/README.md) | 对外产物范围、来源修订与采用关系 |

一个 topic 是信息包：入口给范围、状态与阅读地图，正文给判断或契约，证据给真实观察。
先读 family/topic 入口；新主题从该 family 的 `.templates/` 起步并按问题裁剪，不能裁掉准入所需信息。
建包规则归[设计信息包](design/README.md#主题是信息包)，候选比较门槛归[提案准入](design/record/proposals/README.md#主题准入与候选比较)，当前迁移状态归 [README](README.md)。

## 权威与不可混淆的边界

- 用户明确的新要求优先于历史交接；研究、候选、接受与实际兑现各有依据。有效决定在其前提与范围内继续约束后续设计，复议说明新依据和取代范围；方法归[设计选择](agents/skills/harness-design-handbook/canonical/references/design-decisions.md)。
- 同一含义只有一个权威拥有者。冲突先定位条款、精确版本、接受依据与消费者，不把实现倒写成规格，也不在本文件裁决未定政策；发布后规范不可原地覆盖，传播规则归[规格演进](agents/skills/harness-design-handbook/canonical/references/spec-evolution.md)。
- 语义接受、提供者可实施、装配明确与实际验证分别陈述。形式化工件按需选择，已触发的证据义务不能因 optional 而消失；有限检查不写成无条件证明，边界归[交付](agents/skills/harness-design-handbook/canonical/references/handoff.md)与[规格及证据](agents/skills/harness-design-handbook/canonical/references/architecture/assurance/specification.md)。
- 修改 skills/roles 的源，再由工具生成工作区内 `.agents/`、`.claude/`、`.codex/`；不手改生成物。生成、宿主加载、项目根接入和对外发布是不同动作，依已有授权与[工具边界](tooling/README.md)、[发布边界](publication/README.md)处理，编译不扩张授权。

## 设计品味

以下是[手册判断方法](agents/skills/harness-design-handbook/canonical/references/architecture/assurance/judgment.md)的简短投影：

- 先说明需要保护的性质与真实变化，再选择抽象；没有独立契约或责任价值的包装直接表达。
- 优先复用能兑现契约的成熟机制，比较适配、验证和长期维护的总负担；复杂度要有对应收益依据。
- 把状态、所有权、生命周期与副作用放在真实边界上解释；局部成功不能冒充整体交接完成。
- 让下一位 agent 能找到来源、消费版本和剩余缺口；入口负责导航，正文与证据各留在拥有者处。

## 按当前任务展开

| 当前问题 | 入口与停止点 |
|---|---|
| 新需求、能力边界或插件设计 | [harness-design-handbook](agents/skills/harness-design-handbook/canonical/SKILL.md)：从当前缺口进入，达到本次分析/设计/交接终点即收口 |
| 需求交流值得持续回顾 | [需求归位](agents/skills/harness-design-handbook/canonical/references/intake.md#何时自主启记访谈)：在 requirements/interviews 接续可选笔记；访谈不自动升级为正式要求或决定 |
| 已有契约、映射或证据发生变化 | [规格演进](agents/skills/harness-design-handbook/canonical/references/spec-evolution.md)：定位拥有者与受影响消费者，只展开变化涉及的范围 |
| 知识应落哪里、怎样建 topic | [design 入口](design/README.md)，再读对应 family；不要求每项需求创建所有家族 |
| 已有架构、规格或计划待审稿 | [评审分工](agents/roles/README.md#按判断对象选择-reviewer)：给出对象/版本、依据与范围，按问题委派独立只读评审，意见不代替接受 |
| 派发或接手实现 | [开发者契约](agents/roles/developer-contract.md)与[任务输入](agents/roles/developer-task.md)：只实施本次已具备输入且获准写入的范围 |
| 核对 Cordis/DSH 事实 | [来源核对](agents/skills/harness-design-handbook/canonical/references/source-check.md)：核对采用版本和具体证据，上游应用政策不是产品要求 |
| 编写角色、宿主或模型适配 | [design-subagents](agents/skills/design-subagents/canonical/SKILL.md)：明确职责、行动、输入与停止条件，只核对本次实际目标 |
| 维护 skill 源、编译或链接 | [agents 源约定](agents/README.md)与[tooling](tooling/README.md)：确认输入、产物与目标根，检查不等于安装 |
| 操作执行仓库的 worktree | [worktree-discipline](agents/skills/worktree-discipline/canonical/SKILL.md)：先定位本次检出、基线与证据，操作限于授权 |
| 重写常驻指令或继承范围 | [write-agents-md](agents/skills/write-agents-md/canonical/SKILL.md)：先确认权威拥有者，再调整这里的投影 |
| 评估角色或采用模型 | [评估入口](agents/evaluation/README.md)：区分静态生成、独立试用与实际运行，消费本次明确的采用协议 |

普通局部改动沿已有契约与相关检查完成；出现新的责任边界、保证或失效前提才展开设计。
按当前问题逐层读取，信息足够就停，不把渐进披露变成通读全部 references。必要输入或关键
政策缺失时只暂停依赖它的工作，说明缺口与消费者；仍可继续独立分析，不补造前提或接受记录。

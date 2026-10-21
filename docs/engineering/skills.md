# 技能引用与采用边界

本页拥有工程技能的来源、项目采用范围、加载与冲突说明。场景页拥有项目步骤及交接，技能正文拥有具体方法。方法名称是指针；安装、发现、正文读取与行为结果按下文分别说明。

## 来源与项目采用

| 体系 | 固定来源 | 当前采用和证明边界 |
|---|---|---|
| pstack port | 0.9.79，[michael-denyer/pstack-claude@60ae9e25610744bccd45bd405c211413a471aaf8](https://github.com/michael-denyer/pstack-claude/tree/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack) | 工程主线的实际引用来源；本机 Codex 原生插件已安装、启用并由 skills/list 发现，行为按任务验证 |
| Matt skills | 1.3.1，[mattpocock/skills@b0618bc436ad893b3c5e84e55fba86586d34a404](https://github.com/mattpocock/skills/tree/b0618bc436ad893b3c5e84e55fba86586d34a404/skills) | 六项选定补充及必要依赖已在本机发现；安装完整插件不扩大方法采用范围 |
| Cursor 官方 pstack | 0.15.20，[cursor/plugins@1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def](https://github.com/cursor/plugins/tree/1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def) | Cursor 宿主采用来源；与 Matt 1.3.1 已本地安装，实际调用按任务取证。不覆盖 Codex/Claude 的 port 0.9.79 |
| 项目方法 | [.meta_harness/agents](../../.meta_harness/agents/README.md) | canonical 源与宿主生成分别维护，实际适用依据仍归项目拥有者 |

用户选定的 Matt 补充是 grill-with-docs、to-spec、to-tickets、code-review、codebase-design、writing-for-agents。只在相关缺口出现时使用，不要求每个任务六项全跑。采用方法不能替代正式语义接受或扩大任务权限。

参与本项目迭代维护前，人或agent须在实际使用的coding agent harness中安装并启用来源表指定版本的pstack与Matt插件。版本与revision以本表为准，安装完整插件不扩大方法采用范围。初始化、升级后复核和缺口处置沿[开发初始化](../development.md#初始化-coding-agent-插件)，负责人核对沿[给人的指南](../development_human.md#开始前准备-coding-agent-环境)。已有一台机器的安装记录不替代新机器、cloud环境或新宿主的初始化。

Claude Code on the web 环境按负责人要求跟随上游最新版本：每次会话启动时，[会话脚本](../../.meta_harness/agents/cloud/claude-code/README.md)把 pstack port 与 Matt 插件更新到各自默认分支的最新版本。所以该环境的实际版本可能比本表新。版本差异按[开发初始化](../development.md#初始化-coding-agent-插件)核对和报告。跟随最新版本不改变本表的采用范围。

Cursor Cloud 镜像把 Matt 这一 revision 的完整插件装进 ubuntu 用户的 `~/.agents/skills`，并链接到 `~/.cursor/skills`。步骤在[镜像说明](../development.md#cursor-cloud-agent-镜像)。这次安装不改变本表的采用范围，也不运行 `setup-matt-pocock-skills`。

## 阅读与实际加载

人类展开下表固定正文。agent 核对当前宿主目录，读取所选 SKILL.md 及其必要参考，再按场景工作。Codex 实际名称为 `pstack:<name>` 和 `mattpocock-skills:<name>`；下文 Matt 简称映射到后者。

当前原生缓存相对 Codex home 的路径为 `plugins/cache/pstack-claude/pstack/0.9.79/skills/` 和 `plugins/cache/mattpocock/mattpocock-skills/1.3.1/skills/`。pstack 正文在 `<name>/SKILL.md`，Matt 所选正文沿下表的 engineering 或 productivity 子路径定位。更换宿主或版本时先核对实际发现路径；不要复制插件正文到项目 canonical 源。

本机安装与发现已核对，记录日期为 2026-10-09，宿主为 codex-cli 0.162.0。pstack 发现 58 项，Matt manifest 暴露并发现 27 项；Matt 缓存中的 38 份 SKILL.md 不能当作 38 项宿主入口。计数是本机一次发现事实，不是每个会话的加载声明。

Matt grill-with-docs、to-spec、to-tickets 在固定源中声明 `disable-model-invocation: true`。它们已被发现，文件可直接读取，但不能据此声称 agent 可自动触发或本次完成了原生调用。目录没有显示这些入口时，沿已安装插件路径读取对应正文，并明确报告读取方式；禁止伪造 slash 调用或因此采用候选技能。

同名技能引用含来源：`pstack:tdd` 指下表 port 方法，`Matt:tdd` 指 Matt 的另一份正文，后者尚未作为默认流程采用。这些写法用于消除歧义，不声称当前宿主支持该 slash 语法。playbook 是 poteto-mode 引用的流程文件，Feature、Opening a PR、Babysit 和 Shipping 不是各自独立技能。

缺少入口、正文、必要依赖或宿主能力时报告具体缺口。能沿已明确项目约定独立推进的部分继续；依赖缺失技能的步骤暂停，交 agent 能力维护者。禁止用名称引用或 SessionStart 提醒代替实际加载声明。

## pstack 方法入口

以下入口固定 Codex/Claude port 的正文。Cursor 从来源表的官方版本加载同名方法及其真实宿主适配，不把 port 步骤自动复制为 Cursor 保证。按[场景选择](scenarios/README.md)触发，不作为要求全跑的清单。

| 精确方法 | 何时展开 |
|---|---|
| [pstack:poteto-mode](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/SKILL.md) | 非平凡任务选择 playbook；具体顺序归场景 |
| [pstack:how](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/how/SKILL.md) | 理解源码、职责与路径 |
| [pstack:why](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/why/SKILL.md) | 查取舍、历史与原因，保留置信度 |
| [pstack:architect](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/architect/SKILL.md) | 接口或边界设计 |
| [pstack:arena](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/arena/SKILL.md) | 存在多个有效方案时比较 |
| [pstack:figure-it-out](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/figure-it-out/SKILL.md) | 无适用 playbook 的复杂任务 |
| [pstack:benchmark-checklist](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/benchmark-checklist/SKILL.md) | 基线、噪声、指标和测量含义 |
| [pstack:blast-radius](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/blast-radius/SKILL.md) | 核对 diff 外消费者与真实结果 |
| [pstack:interrogate](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/interrogate/SKILL.md) | 对抗评审，发现由任务负责人处置 |
| [pstack:tdd](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/tdd/SKILL.md) | 有价值且相称的测试驱动路径 |
| [pstack:create-verification-skill](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/create-verification-skill/SKILL.md) | 没有真实验证路线时补方法 |
| [pstack:maintain-verification-skill](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/maintain-verification-skill/SKILL.md) | 验证路线漂移时维护 |
| [pstack:correct](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/correct/SKILL.md) | 重复错误优先查结构、类型和检查 |
| [pstack:reflect](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/reflect/SKILL.md) | 提出环境或技能改进，应用受原文及任务授权约束 |
| [pstack:automate-me](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/automate-me/SKILL.md) | 重复操作的自动化候选 |
| [pstack:technical-writing](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/technical-writing/SKILL.md) | 文种与技术表达方法，保留项目写作要求 |
| [pstack:unslop](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/unslop/SKILL.md) | 清晰表达；不删条件和未知 |
| [pstack:typescript-best-practices](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/typescript-best-practices/SKILL.md) | 读取或修改 .ts、.tsx 时加载，必要依赖为 type-system-discipline；具体项目保证仍归拥有者 |
| [pstack:swarm](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/swarm/SKILL.md) | 分区调查、覆盖矩阵和并行汇总，写者仍须隔离 |
| [pstack:show-me-your-work](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/show-me-your-work/SKILL.md) | 长任务的可审阅临时决策记录，项目保存边界见下文 |

### playbook 入口

| 固定流程文件 | 场景定位 |
|---|---|
| [investigation](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/investigation.md) | 只读调查，结论后结束 |
| [feature](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/feature.md) | 已明确的新行为交付 |
| [bug-fix](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/bug-fix.md) | 复现、机制与修复 |
| [refactoring](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/refactoring.md) | 保持行为的结构变化 |
| [perf-issue](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/perf-issue.md) | 一次性能问题 |
| [hillclimb](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/hillclimb.md) | 持续指标改进 |
| [runtime-forensics](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/runtime-forensics.md) | 运行观察，先交诊断 |
| [trace-forensics](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/trace-forensics.md) | 已有 trace 的分析 |
| [authoring-a-skill](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/authoring-a-skill.md) | 技能维护，采用项目维护入口 |
| [opening-a-pr](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/opening-a-pr.md) | 已授权的 PR 准备 |
| [babysit](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/babysit.md) | 已授权的 PR 监护 |
| [shipping](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/shipping.md) | 已授权的发布／合并 |
| [autonomous-run](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/autonomous-run.md) | 单项长任务驱动到明确终点，不把本地定时机制当宿主保证 |
| [orchestrate](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/orchestrate.md) | 跨阶段项目、多个独立执行者与单一协调责任；普通局部任务不增加调度层 |
| [autopilot-full](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/autopilot-full.md) | 独立交付队列，每项一个负责人，操作者合并 |
| [autopilot-stack](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/autopilot-stack.md) | 构建并验证线性栈，集成拓扑由一个负责人维护，落地由任务授权决定 |
| [multi-phase-plan](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md) | 多阶段或多 PR 的依赖和检查点；采用验证差异见质量入口 |
| [pause-safely](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/pause-safely.md) | 收到明确暂停要求时保存可恢复边界 |
| [session-pickup](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/session-pickup.md) | 接续检查点、cloud URL 或已推送分支 |
| [worktree-cleanup](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/worktree-cleanup.md) | 获准清理时核对材料与实际消费者，clean 状态不能证明唯一材料可丢 |

较大但单次可完成的任务用 figure-it-out 定制流程；长期项目才用 Orchestrate。并行覆盖用 swarm，方案竞争用 arena。任务规模与成果终点决定流程，不以“自驱”一词强制套完整项目调度。

[Codex 适配](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/references/codex-tools.md)和[恢复存储](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/references/resume-storage.md)属于必要参考。实际工具、停止能力、线程容量及定时方式以当前宿主为准。映射中的旧工具名称不能视为本会话能力；vendored scripts 的 gt 泛称不能成为统一安装条件，按具体脚本检查 Node、bun、gh 或其它实际依赖。

## Matt 补充与候选

| 精确入口 | 触发与采用范围 |
|---|---|
| [Matt:grill-with-docs](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/grill-with-docs/SKILL.md) | 已选补充：需求或偏好缺口的访谈，按需加载 grilling、domain-modeling |
| [Matt:to-spec](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/to-spec/SKILL.md) | 已选补充：综合已讨论内容成实施输入，不重新访谈或自动发 issue |
| [Matt:to-tickets](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/to-tickets/SKILL.md) | 已选补充：验收与依赖明确后的可交付切片，不另建正式规格权威 |
| [Matt:code-review](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/code-review/SKILL.md) | 已选补充：分别判断 Standards 与 Spec；实际 diff 覆盖必须核实 |
| [Matt:codebase-design](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/codebase-design/SKILL.md) | 已选补充：不变量、失败、配置与性能等类型外承诺 |
| [Matt:writing-for-agents](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/productivity/writing-for-agents/SKILL.md) | 已选补充：按需上下文、明确指针和完成条件 |
| [Matt:diagnosing-bugs](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/diagnosing-bugs/SKILL.md) | 按需候选：可证伪探针；未采用就不列为必需步骤 |
| [Matt:retro](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/retro/SKILL.md) | 按需候选：执行环境复盘，与 pstack correct／reflect 避免重复 |

[grilling](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/productivity/grilling/SKILL.md) 与 [domain-modeling](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/domain-modeling/SKILL.md) 是所选 grill-with-docs 的按需方法依赖。概念和当前理由写回项目既有拥有者，不另造 GLOSSARY／ADR 权威。[Matt:tdd](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/tdd/SKILL.md) 与原版 pstack 同名且要求不同，未作为另一套默认方法采用。

## 项目差异与负责边界

| 外部默认或风险 | 本项目实际依据与处置 |
|---|---|
| 并行代码写入、独立工作树或集成分支 | 用户已接受独立任务隔离并行，共享接口、锁文件及集成拓扑单一负责人，耦合工作按依赖串行；实际交接归[工作约定](workflow.md#责任与协作交接)。已获准并行不能被旧排他会话限制否决；检出、工具输入及清理条件仍核对实际执行者 |
| architect 默认设计后实施 | 按[贡献范围](../../CONTRIBUTING.md#确定变更范围)和任务终点；新承诺未接受只停依赖实施 |
| playbook 提交、PR、外部消息或 Shipping | 按[交付权限](publication.md#提交表达与权限)，技能不授予外部操作权限 |
| 保存决策日志、调度状态或 issue 形成史 | 按[成果保存](publication.md#成果保存与跨会话接续)和[终态规则](../development.md#终态与过程材料)，真实成果及时用Git远端保存，正式RFC与Issue最小记录按[保存例外](documentation.md#四类长期成果与普通任务)维护，临时trail、store及transcript不整体入库；本地 checkpoint 不证明跨机器持久 |
| 新词表／中央 ADR | 按[信息权威](../../AGENTS.md#信息权威与演进边界)及实际统一语言／领域对象维护入口，不产生第二源 |
| 直接写宿主 skills | 按 [agent 能力源](../../.meta_harness/agents/README.md)和[生成工具](../../.meta_harness/tooling/README.md)，canonical 源维护后生成 |
| 写作方法删除 hedging／未知 | 按 [asd-ste100](../../.meta_harness/agents/skills/asd-ste100/canonical/SKILL.md) 保留事实、条件、置信度和强度 |
| to-spec 新测试 seam 确认／自动发 issue | 已明确输入不重复审批；新验证边界才裁定；发布须有任务授权，缺 tracker 不阻断可独立的本地草稿 |
| code-review 固定点至 HEAD 的已提交 diff | 未提交修改不在该默认 diff 中；先明确实际源与覆盖，不能为适配方法擅自提交 |
| 专用流程固定 swarm、十条 live lane、性能检查或新增阻断 | 按[质量风险选择](quality.md#按成果和风险验证)及[整洁回路](../clean-loop.md)，依据风险、影响与真实输入选择，不新增全任务固定模板或门禁；定制采用须说明差异，不能声称完整执行 |
| to-tickets 广泛重构默认 expand–contract | 首版前仍沿[演进政策](publication.md#当前演进与消费者)，同波迁移消费者并删除替代实现；不能独立成立的切片合成可验证单元，不引入旧实现兼容过渡 |
| spec、票据、词表和通用设计方法 | Matt模板组织单次实施输入，切卡按[工作类型](work-types.md)及[交付操作](agent-delivery.md)承接；正式形状、完整必要行为契约、Schema身份及验收归实际拥有者。领域与包两层文档保留必要使用和机制说明，薄 SPEC 不构成整个体系厚度上限。普通任务按研发实际需要明确本次身份、范围与结果；未启用时只形成获准草稿，to-tickets不自动发布Issue |
| TypeScript、Node 自有通用指导 | TypeScript 方法引用本页 port 技能及其 type-system-discipline 依赖。配置、命令及公开入口按[开发准备](../development.md#准备可用的检出)、实际清单与[workspace](../workspace.md#使用与维护)核对，异步项目义务归[防御指导](../defensive-patterns.md)，具体生命周期仍归成员。自有 TS/Node 主题页退出，不重造 Node 教程；TS 技能不证明完整运行保证 |
| 所选技能未覆盖的项目独有能力 | 保留能力及必要资源；优化待定非阻塞，不以补充工程入口为由扩大重写 |

冲突先定位要求的范围、拥有者与接受依据，不用“外部方法优先”或“目录更深优先”处理。未知适配差异交方法和工程要求拥有者；可独立事实核对继续。

### 尚待明确的 TypeScript 政策

<!-- documentation:placeholder -->

更完整的项目 TypeScript 政策及采用例外尚未单独确定，由工程要求负责人维护必要缺项并取得采用依据。类型、状态、未知输入及断言方法按实际加载的 pstack:typescript-best-practices 和 type-system-discipline；断言不提供运行时校验，不能据技能名字声称项目政策完整或已遵循。配置事实分别归根 tsconfig.base.json、成员 tsconfig.json、workspace catalog 与 package.json，不在本页复制选项或版本表。

## hooks 与证明层次

port 的 [Claude hooks](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/hooks/hooks.json) 和 [Codex hooks](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/hooks/codex-hooks.json)只登记 SessionStart。[运行说明](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/docs/reference.md)及[POSIX 脚本](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/hooks/session-start.sh)须按宿主分别解释。目录中的工具前脚本属于 Copilot，不能作为 Claude/Codex 的工程遵循门禁。

文件与来源、宿主发现、原生调用、本次正文读取、hook 信任及执行、步骤遵循和行为结果分别提供证据。提醒不能证明加载；加载不能证明所有判断正确；有限行为通过不能推出未覆盖范围通过。单次任务记录精确源、跳过理由及实际检查，留任务 tmp。

`pnpm run docs:inventory` 当前只检查登记的位置和结构；外部依赖闭包、宿主加载、实际遵循及行为结果未覆盖。`pnpm run check:agents` 也不能证明宿主发现或模型行为。

## 完整 port 采用待定

<!-- documentation:placeholder -->

实际 port 版本、所列入口、安装发现及已接受项目差异已有核对。本页采用的是任务路由与明确补充范围，没有承诺整个 port 与原版等价、所有额外脚本可运行或全树方法均已采用。未涉及分叉及脚本依赖按后续实际采用补证，不阻塞已明确的独立任务。

## 宿主加载与行为验证待补

<!-- documentation:placeholder -->

本机安装和 skills/list 发现已完成，相关正文已按审计范围读取。本批可做入口代表任务走读，不能由此宣称原生调用、自动路由或产品行为验收。Codex SessionStart 自动路由仍需按宿主 /hooks 审阅并信任，本项目未提供其信任与执行完成证据。Windows、压缩恢复、隔离检出的实际 hook 观察及跨机器恢复分别保留未验证；结构可读不会解除这些缺项。

## 更新与维护传播

本页由工程文档维护者与 agent 能力维护者共同核对。更换上游 revision 前检查正文、必要参考、port 分叉、触发、权限和语义。源、适配、项目采用和宿主生成分别更新，hash 变化只说明字节变化。

若采用原生 project playbook 扩展，按 poteto-mode 的引用步骤原文锚定差异，并运行其 check-playbooks.mjs。本批没有创建另一套 project playbook，不能把场景摘要声称为通过了扩展检查。

同步实际引用场景、[任务地图](../context-map.md)及必要角色入口。新增方法或门禁回实际拥有者，不用新版本静默扩大采用。一次复核证据留 tmp，持续正文保留当前版本、采用范围及必要局限。

## 项目分支集成技能

涉及工作分支同步、FI/RI、checkpoint、主干准入或流程失效恢复时，加载自有 [branch-integration](../../.meta_harness/agents/skills/branch-integration/canonical/SKILL.md)。它从[共同规则](integration.md)和实际 CLI 展开，不替代 pstack 通用方法，也不因宿主发现而授予外部动作。

## 项目设计判断的边界

[harness-design-handbook](../../.meta_harness/agents/skills/harness-design-handbook/canonical/SKILL.md) 聚焦能力覆盖、性质保护责任和 Cordis 承载。默认入口只选一个方法页，再读任务实际拥有者。三种 reviewer 判据直接派发，不先加载 SKILL 或其他两页。普通工程/文档归属/交付由现有工程拥有者和 pstack/Matt 承担；风险与三轮升级归 quality，组合证明门槛归 verification。技能不再保存第二份内核版本事实。Cursor 项目生成与 Cloud 初始化见 [tooling](../../.meta_harness/tooling/README.md#cursor-原生包与项目视图)。

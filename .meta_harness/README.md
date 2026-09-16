# Meta Harness

建设 harness 的可复用设计方法、产品需求与设计链，以及研发 agent 源资产的私有工作区。
它可以整体迁出承载仓库；产品事实只从内部 `design/` 或本次明确输入取得。

## 工作区结构

```text
.meta_harness/
├── README.md
├── AGENTS.md / CLAUDE.md
├── design/                        待设计系统的完整权威链；各 family 自有 .templates/ 信息包
│   ├── requirements/              system / product
│   ├── research/
│   ├── proposals/
│   ├── decisions/
│   ├── architecture/
│   ├── spec/                      data / capabilities / compositions / archive
│   ├── providers/
│   ├── assemblies/
│   └── migrations/
├── agents/                        agent 资产的唯一编译源与评估证据
│   ├── skills/
│   │   └── harness-design-handbook/
│   │       ├── canonical/         自包含的运行时方法与按需 references
│   │       ├── adapters/          claude-code / codex 显式策略
│   │       └── .design/           方法维护、研究与审阅证据，不分发
│   ├── roles/
│   ├── adapters/
│   └── evaluation/
├── tooling/                       投影、编译、设计检查与链接工具
├── publication/                   交给产品仓库的产物范围与来源
├── tmp/                           本地草稿与临时证据
├── .claude/                       编译产物：skills / agents
├── .agents/                       编译产物：skills
└── .codex/                        编译产物：agents
```

可复用的架构设计与维护方法由
[harness-design-handbook](agents/skills/harness-design-handbook/canonical/SKILL.md) 自包含提供，
按当前问题渐进加载 references。方法研究和编写证据留在该 skill 的 `.design/`，不会作为运行时上下文分发。
产品要求、接受事实、能力契约和采用状态归 [design](design/README.md)，不能写进 skill 代替产品 owner。

## 当前入口

- 收到产品需求或系统能力声明：加载 [harness-design-handbook](agents/skills/harness-design-handbook/canonical/SKILL.md)，从 intake、能力覆盖或当前缺口进入。
- 新建长期设计材料：先过[信息包准入](agents/skills/harness-design-handbook/canonical/references/information-packages.md)，再使用相应 design family 的本地模板包。
- 维护 skills 或 roles：从 [agents](agents/README.md) 修改 canonical 源和适配，不手改生成产物。
- 生成、检查或接入宿主入口：使用 [tooling](tooling/README.md)；编译、项目根链接和发布是不同动作。
- 判断可发布契约与实际采用：从 [design/spec](design/spec/README.md) 的清单和精确版本开始，不按目录存在推断接受状态。

产品设计材料正在按能力纵线迁入；各 topic 的状态、来源和未决项以其入口及清单为准，
不由本页宣称完成。原架构指南和旧 skills/roles 的有效部分已经选择性吸收到当前方法与 agent 源；
退役原件和采用证据仍由对应 evaluation 记录维护。

## 自包含与发布边界

参考 cc-master 的 source-to-adapter 方式，共享正文与宿主适配分开维护。没有显式适配就拒绝生成，
不默认两个宿主能力相同。工作树根通过相对软链接引用工作区内的生成目录：

```text
<产品根>/.claude -> .meta_harness/.claude
<产品根>/.agents -> .meta_harness/.agents
<产品根>/.codex  -> .meta_harness/.codex
```

点前缀不提供访问隔离；真正迁出、私有发布与历史隔离仍由 [publication](publication/README.md)
及相应交付任务完成。移动工作区不改变需求、决定、规格或消费者采用状态。

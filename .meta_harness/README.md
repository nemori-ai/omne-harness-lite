# Meta Harness

建设 harness 的方法、需求、设计知识、精确规格与研发 agent 源资产的私有工作区。

## 当前阶段：骨架与方法草稿

采用完整私有设计工作区（方案 C）：需求、方法、设计论证、规格与提供者/装配设计在此闭合。
目前已有目录骨架、信息包模板与手册草稿；三个独立 skills 和八个研发角色已迁入，
角色指导已接入新手册，承载它的当前 worktree 根宿主入口已切换为相对软链接。
实质产品需求和规格尚未导入；新需求 intake 与设计工作从本工作区进入，既有材料作为明确输入接续。

目录按已选定的 C 方案组织：`method/` 拥有可复用方法，`design/` 拥有待设计系统的完整
需求与设计链，`agents/` 拥有研发 agent 源资产，`publication/` 拥有产物发布边界。
各类设计内容按这些职责归位，不保留顶层 docs/spec 容器。
工作区的自包含边界见[工作区上下文](agents/skills/harness-design-handbook/canonical/references/workspace-context.md)：
系统事实来自内部设计材料或本次明确输入，不从承载它的仓库推断。

```text
.meta_harness/
├── README.md
├── AGENTS.md / CLAUDE.md
├── method/                        可复用方法与治理
│   ├── guide/                     foundations / modeling / runtime / assurance / examples / reference
│   ├── governance/
│   ├── research/
│   ├── proposals/
│   └── decisions/
├── design/                        待设计系统的完整权威链；各 family 内有 .templates/ 信息包
│   ├── requirements/              system / product
│   ├── research/
│   ├── proposals/
│   ├── decisions/
│   ├── architecture/
│   ├── spec/                      data / capabilities / compositions / archive
│   ├── providers/
│   ├── assemblies/
│   └── migrations/
├── agents/                        新资产的唯一编译源
│   ├── README.md
│   ├── skills/
│   │   ├── harness-design-handbook/
│   │   │   ├── canonical/         SKILL.md + 按需加载的 references/
│   │   │   ├── adapters/          claude-code / codex 显式策略
│   │   │   └── .design/           维护与审阅材料，不分发
│   │   └── <其他 skill>/          write-agents-md / design-subagents / worktree-discipline，同一源包结构
│   ├── roles/                     三个 reviewer、五个开发者及共同契约
│   ├── adapters/                  宿主共用适配依据与安装约定
│   └── evaluation/                研发 agent 评估资产
├── tooling/
│   ├── README.md
│   ├── src/                       投影、编译入口与链接工具
│   └── tests/
├── publication/                   交给产品仓库的产物范围与来源
│   └── releases/
├── tmp/                           本地草稿与临时证据
├── .claude/                       编译产物：skills / agents
├── .agents/                       编译产物：skills
└── .codex/                        编译产物：agents
```

[method](method/README.md) 导航方法参考与研究，尚未填充的容器保留骨架；[publication](publication/README.md) 保留发布归属说明；
[design](design/README.md) 已有各知识家族入口及可复制的 topic 模板包；
[需求](design/requirements/README.md) 与 [规格](design/spec/README.md) 尚未迁入。
既有外部材料的保留是迁移状态，不使它们自动成为工作区的运行时依赖。
`design/spec/` 的 catalog、冻结记录与形式任务清单在迁移时一并接入，不预造空登记表。

## 本轮可审阅产物

- [Harness 设计手册 skill 草稿](agents/skills/harness-design-handbook/canonical/SKILL.md)：从现有能力覆盖需求，到未覆盖责任推动能力演化，再到 Cordis 插件与组合设计的上下文地图。
- [知识家族与 topic 模板包](design/README.md)：进入各 family 选择本地 `.templates/`，包入口按问题导航正文、证据与评审。
- [agent 编译源约定](agents/README.md)：一份源生成两个宿主的 skills 和角色。
- [编译与链接工具](tooling/README.md)：产物留在本目录内，当前 worktree 根软链接已接入；[退役记录](agents/evaluation/host-entry-retirement/README.md)保留原件与采用证据。

按用户授权，原 architecture-guide 的有效方法已整理为手册参考包，旧指南正文仍保留。
旧 skills/roles 根实体已退役，原件保存在退役快照中；来源与方法整合范围见[编写记录](agents/skills/harness-design-handbook/.design/README.md)。
角色已按任务导航手册，方法草稿不因此成为已接受的产品契约。
正式提案 topic 的候选要求归[提案准入](design/proposals/README.md#主题准入与候选比较)；
目录骨架不建立新的需求或规格登记表；承载仓库的检查入口已纳入本工作区的链接与生成一致性检查。

## 编译与项目入口

参考 cc-master 的 source-to-adapter 方式，共享正文与宿主适配分开维护。相同的方法可以
生成不同宿主的调用说明；没有显式适配就拒绝生成，不默认两端都支持。

当前 worktree 根只引用编译产物：

```text
<产品根>/.claude -> .meta_harness/.claude
<产品根>/.agents -> .meta_harness/.agents
<产品根>/.codex  -> .meta_harness/.codex
```

用户后续授权 skills/roles 退役与接入后，已完成上述链接；主检出未切换。
编译产物是可重建的本地产物；不在其中手改方法、角色或配置。

## 将来的迁移边界

迁移应保持条款身份、确认记录与冻结规范内容，修正入口及检查工具的路径归属，并明确
私有工作区与产品仓库之间的采用基线；导入记录应明确具体内容与有效范围。

点前缀不提供访问隔离。本轮仍是产品工作树中的本地变更；没有独立私有仓库、
发布排除或历史隔离，也没有对外推送。真正迁出和私有发布边界另行实施。

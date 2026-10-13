# Meta Harness：心智与阅读地图

这里维护让 agent 从需求出发设计 harness 的方法、设计知识和研发能力。
本文件负责**常驻心智、权威边界与任务入口**；详细判断由各自拥有者维护，
工作区地图见 [README](README.md)。

本项目已采用[项目要求](../docs/requirements.md)、[系统架构](../docs/architecture/README.md)与[领域责任](../docs/domains/README.md)顶层正文。
产品规则、统一语言、领域对象、持续研究及独有 skills/roles 仍在本区。
共同集成规则与采用映射归执行仓库架构区，成员精确承诺归实际拥有者；[保留技术源入口](design/architecture/README.md)定位尚未承接的专题、完整Session候选和PF详细技术。
本项目架构以docs已接受正文为准；旧技术材料按[准入规则](../docs/engineering/documentation.md#位置与唯一源)筛选，冲突设计不取得规范效力。顶层接受不表示材料已迁移、实现或验证。

## 怎样看待这个工作区

`.meta_harness/` 是可以独立迁出的私有设计工作区。它既维护「怎样设计」的方法，
也保存「本次设计什么」的知识；**方法不会预先知道产品名称、现有能力或实现仓库**。

若它位于某个实现仓库中，对那个仓库的实际操作仍遵守适用约定；**承载位置不使该仓库的
产品目标、技术栈、模型路由或既有 `docs/`、`spec/` 自动成为设计权威**。
目录为空表示材料尚缺，不能据此断言系统不存在能力，也不能把模板和历史示例当作本次事实。

## 从需求长出能力，装配时对上 Cordis

**需求的可观察结果 → 现有能力与组合覆盖 → 未覆盖责任 → 能力演化 → 明确的公开接口、行为承诺与动作链
→ 装配成 Cordis 插件及组合并核对符合性 → 回到需求核对。**

**领域与能力独立于 Cordis 建模。**Cordis 是内核，是全系统集成装配时要满足的契约规范——做出来的东西要能以
fiber、plugin、service、inject 的方式集成装配；它不是建模的视角。契约定下之后才轮到它，
对不上先换提供者设计，不改契约去迁就机制（D-112）。

能力维度按独立责任与变化边界划分，不由通用关注点表预设。先判断现有能力能否承载，
再辨别组合、扩展、提供者修复或新的独立责任；**缺资料、缺实现和缺语义分别处理**。
新增独立维度须有独立的契约边界，装配时由独立插件承载；正交不等于无依赖或任意可交换。

契约拥有含义、状态权威与保证，提供者和装配拥有具体兑现关系；
**目录、类、服务键和插件数量不能代替能力模型**。
组合须解释正常、失败及撤除后的责任交接。推理沿 `harness-design-handbook` skill 展开。

新维护单元从[系统架构入口](../docs/architecture/README.md)定位责任，使用执行仓库模板。
[两层成员文档](../docs/member-documentation.md)区分包群工程关系与成员使用、行为、内部设计和维护。
公开类型、完整行为契约、必要理由和验证资源归实际成员，不另建中央模块规格或节点四件套。
SPEC避免重复形状，不能删去必要条件、失败、生命周期或验证义务，也不限制完整成员文档。

## 知识只有一个家，由失效事件决定

> **每一个会被继续消费的事实，只有一个手写的家；那个家由「什么事件会让这条事实失效」决定。**

这一条是本工作区的组织根据。分区表、准入问题与停止条件归
[design/README.md](design/README.md#组织原则)；**进入 `design/` 之前先读
[design/AGENTS.md](design/AGENTS.md)**，那里拥有准入四步与两条最容易走错的归属。

| 拥有者 | 保存什么 |
|---|---|
| [design/](design/README.md) | 统一语言、产品、领域对象、上游机制及未迁精确技术源；已采用顶层要求、架构与领域正文归执行仓库docs |
| [research/](research/README.md) | 当前仅保留 TypeSafe Jev；目录职责与结构待负责人另行定义 |
| [agents/](agents/README.md) | skills 与 roles 的 canonical 源、宿主适配与评估证据 |
| [tooling/](tooling/README.md) | 确定性的生成、检查与项目链接 |

**一个 topic 是信息包**：入口给范围、状态与阅读地图，正文给判断或契约，证据给真实观察。
先读该区入口；新主题从它的 `.templates/` 起步并按问题裁剪，**不能裁掉准入所需信息**。

## 权威与不可混淆的边界

- **同一个概念只有一个词**，那个词定在 [统一语言](design/ubiquitous_language/README.md)。
  **要引入新概念先加词条，定义清楚之后才能在正文里用**——顺序是硬的，反过来做查重和自检都会走过场。
- **同一含义只有一个权威拥有者。**冲突先定位条款、精确版本、接受依据与消费者；
  不把实现倒写成规格，也不在本文件裁决未定政策。**规格只留最新一版**，修订过接受门、旧版及时删；
  实际承诺归属与当前维护规则见[架构维护入口](design/architecture/README.md)。
- **研究、候选、接受与实际兑现各有依据，不互相冒充。**有效决定在其前提与范围内
  继续约束后续设计；复议要说明新依据和取代范围，不靠重新措辞重开争论。
- **语义接受、提供者可实施、装配明确与实际验证分别陈述。**已触发的证据义务不能因
  optional 而消失；有限检查不写成无条件证明。
- **修改 skills/roles 的源，再由工具生成** `.agents/`、`.claude/`、`.codex/`、`.cursor/`；不手改生成物。
  生成、宿主加载、项目根接入和对外发布是不同动作，**编译不扩张授权**。
- **这里的文档写作与修订必须加载 `asd-ste100` skill。遵循其适用规范。**这包括产品、设计、规格、研究和 agent 正文。
  英文按文种选模式；中文至少满足可跨语言的清晰性原则，适用边界归[写作要求](agents/skills/asd-ste100/canonical/references/documentation.md)。
  清晰化必须保留正式术语、事实、条件、例外与要求强度；涉及语义变更时仍走材料所属的接受入口。

## 按当前任务展开

| 当前问题 | 入口与停止点 |
|---|---|
| 新需求、能力边界或插件设计 | 加载 `harness-design-handbook` skill：从当前缺口进入，达到本次终点即收口 |
| 在 product 区起草或修订产品正文 | 加载 `product-design` skill：它把视角切成 product manager。**做技术设计或实现的人只读正文，不加载它**；该区的维护规矩归 [product/AGENTS.md](design/product/AGENTS.md) |
| 要用到一个概念，或两处说法对不上 | [统一语言](design/ubiquitous_language/index.md) 查重；对不上的记进 [conflicts](design/ubiquitous_language/conflicts.md)，**不静默统一掉**。**查词、用词不加载 skill**；要新增或修改词条才加载 `ubiquitous-language` skill，该区的约定归 [ubiquitous_language/AGENTS.md](design/ubiquitous_language/AGENTS.md) |
| 系统里有哪些有身份的对象、各自依据在哪；或改了产品 topic 后要对账 | [领域对象](design/domain_objects/README.md)：条目以词条 ID 为键，依据带 rev。**来取输入的人只读，不加载 skill**；立条目、登记待裁、**topic 升 rev 后逐条复核被点名的条目**才加载 `domain-objects` skill，该区的约定归 [domain_objects/AGENTS.md](design/domain_objects/AGENTS.md) |
| 上游到底保证什么 | [research/](research/README.md) 的 topic 或 [basis/](design/basis/README.md) 的条目；**不在本次分析里重新推导一遍** |
| 已有契约、映射或证据发生变化 | 执行仓库的文档治理与维护入口：定位拥有者与受影响消费者，只展开变化涉及的范围 |
| 知识该落哪里、怎样建 topic | [design/AGENTS.md](design/AGENTS.md) 的准入四步，再读目标目录 README；**不要求每项需求创建所有目录** |
| 已有架构、规格或计划待审稿 | [评审分工](agents/roles/README.md#按判断对象选择-reviewer)：给出对象/版本、依据与范围，意见不代替接受 |
| 派发或接手实现 | [开发者契约](agents/roles/developer-contract.md)与[任务输入](agents/roles/developer-task.md)：只实施本次已具备输入且获准写入的范围 |
| 几种做法都成立，要选方向 | [工程技能](../docs/engineering/skills.md)选择已采用方法；[角色规则入口](agents/roles/engineering-taste.md)只内联项目拥有者指针 |
| 编写角色、宿主或模型适配 | 加载 `design-subagents` skill：明确职责、行动、输入与停止条件 |
| 维护 skill 源、编译或链接 | [agents 源约定](agents/README.md)与 [tooling](tooling/README.md)：**检查不等于安装** |
| 隔离任务、协作或清理工作树 | [协作流程](../docs/engineering/workflow.md)拥有检出、共享写权与清理条件；通用方法从工程技能入口加载 |
| 重写常驻指令或继承范围 | 加载 `write-agents-md` skill：先确认权威拥有者，再调整这里的投影 |
| 新建或修订本工作区文档 | 加载 `asd-ste100` skill：按[写作要求](agents/skills/asd-ste100/canonical/references/documentation.md)选择模式并复核语义；写作规范不替代该材料所属的方法与接受流程 |

普通局部改动沿已有契约与相关检查完成；**出现新的责任边界、保证或失效前提才展开设计**。
按当前问题逐层读取，信息足够就停，不把渐进披露变成通读全部 references。
必要输入或关键政策缺失时**只暂停依赖它的工作**，说明缺口与消费者；
仍可继续独立分析，**不补造前提或接受记录**。

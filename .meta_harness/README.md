# Meta Harness

建设 harness 的可复用设计方法、待设计系统的设计链，以及研发 agent 源资产的私有工作区。
**它可以整体迁出承载仓库**；产品事实只从内部 `design/`、`research/` 或本次明确输入取得，
不从承载它的仓库推断。

## 知识归属只有一条规则

> **每一个会被继续消费的事实，只有一个手写的家；那个家由「什么事件会让这条事实失效」决定。**

所以目录不按文档体裁分（设计／说明／视图），也不按被描述的对象分（会话／运行／工具）——
体裁会变，对象会被重新分解，**失效事件不会变**。
完整的分区表、准入问题与停止条件归 [design/README.md](design/README.md#组织原则)，本页只给地图。

## 工作区结构

```text
.meta_harness/
├── README.md / AGENTS.md / CLAUDE.md
├── design/                   待设计系统的设计链，按失效事件分区
│   ├── ubiquitous_language/  同一个概念只有一个词——失效于「某个概念的含义变了」
│   ├── product/              概念、模型、产品规则、验收——失效于产品方向改变
│   ├── foundation/           系统目标与全局约束 SYS-*——失效于系统目标改变
│   ├── basis/                内核与上游的机制语义条目及其 probe——失效于上游换版本
│   ├── spec/                 精确规格与形式工件——失效于语义变更，发新版不原地改
│   ├── realization/          提供者与装配设计、绑定与符合性证据——失效于实现换方案
│   ├── record/               候选、接受、运行结果——永不失效，只追加
│   ├── registry/             身份、版本、基线、血缘、覆盖关系——失效于发布与重分解
│   └── views/                全部派生的聚合视图，由生成器产出，任何人不手写
├── research/                 核实事实、版本化观察、推断与局限；**不拥有方案选择**
├── design_legacy/            重构前那条设计链的原件，**已不再维护**（见下方）
├── agents/                   skills 与 roles 的唯一编译源、评估证据，及 research/ 里当初立规的观察
├── tooling/                  确定性生成、设计检查与项目根链接
├── publication/              交给产品仓库的产物范围、来源修订与采用关系
└── .claude/ .agents/ .codex/ 编译产物，不手改
```

**`research/` 与 `design/` 是兄弟，不是子目录。**它拥有「这条事实成立到什么程度」，
写到「这让什么变得不可能、什么要额外付出代价」为止；**该怎么设计归
[record/proposals](design/record/proposals/README.md) 与
[record/decisions](design/record/decisions/README.md)**。

## 当前入口

| 手上的任务 | 从哪进 |
|---|---|
| 收到产品需求或系统能力声明 | 加载 `harness-design-handbook` skill，从 intake、能力覆盖或当前缺口进入 |
| 在 [design/product](design/product/AGENTS.md) 起草或修订产品正文 | 加载 `product-design` skill；**只把产品正文当输入读的技术工作不加载它** |
| 要用到某个概念，或要引入新概念 | [统一语言](design/ubiquitous_language/README.md)。**先有词条，再动正文** |
| 查证上游机制到底保证什么 | [research/](research/README.md) 的对应 topic，或 [basis/](design/basis/README.md) 的条目 |
| 新建长期设计材料 | 先过 [准入与停止条件](design/README.md#准入与停止条件)，再用目标目录的本地 `.templates/` |
| 维护 skills 或 roles | 从 [agents/](agents/README.md) 改 canonical 源，**不手改生成产物** |
| 生成、检查或接入宿主入口 | [tooling/](tooling/README.md)。编译、项目根链接、发布是三个动作 |
| 判断某个契约能不能用 | [design/spec](design/spec/README.md) 的清单与精确版本，**不按目录存在推断接受状态** |

## 自包含与发布边界

共享正文与宿主适配分开维护，**没有显式适配就拒绝生成**，不默认两个宿主能力相同。
工作树根通过相对软链接引用工作区内的生成目录：

```text
<产品根>/.claude -> .meta_harness/.claude
<产品根>/.agents -> .meta_harness/.agents
<产品根>/.codex  -> .meta_harness/.codex
```

点前缀不提供访问隔离；真正迁出、私有发布与历史隔离由
[publication/](publication/README.md) 及相应交付任务完成。
**移动工作区不改变需求、决定、规格或消费者的采用状态。**

## design_legacy 不维护

`design_legacy/` 是重构前那条设计链的原件，**已经不再维护，也不会再改**。

**它的入口正文至今仍自称「完整设计链」——那是留在原地的旧说法，不要照它办事。**
其中的契约、决定与提案[都已退役](../AGENTS.md)：不作为任何新工作的依据，
也不能被外部文档引用成现行规则。**新主题一律在 `design/` 下接续。**

保留它只为一件事：**还原当初的说法**。所以它内部的相对链接照旧，不随新体系调整。

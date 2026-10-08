# Meta Harness

建设 harness 的可复用设计方法、待设计系统的设计链，以及研发 agent 源资产的私有工作区。
**它可以整体迁出承载仓库**；产品事实只从内部 `design/`、`research/` 或本次明确输入取得，
不从承载它的仓库推断。

## 知识归属只有一条规则

> **每一个会被继续消费的事实，只有一个手写的家；那个家由「什么事件会让这条事实失效」决定。**

所以目录不按文档体裁分（设计／说明／视图），也不按被描述的对象分（会话／运行／工具）——
体裁会变，对象会被重新分解，**失效事件不会变**。
完整的分区表、准入问题与停止条件归 [design/README.md](design/README.md#组织原则)，本页只给地图。
新维护位置从[架构入口](design/architecture/README.md)取得；模块承诺随接口拥有者维护，必要模型/验证资源同归实际成员。

## 工作区结构

```text
.meta_harness/
├── README.md / AGENTS.md / CLAUDE.md
├── design/                   待设计系统的设计链，按失效事件分区
│   ├── ubiquitous_language/  同一个概念只有一个词——失效于「某个概念的含义变了」
│   ├── product/              概念、模型、产品规则、验收——失效于产品方向改变
│   ├── domain_objects/       跨 topic 收齐的领域对象，产品与架构、规格之间的那一站——失效于对象被重新认定或分解
│   ├── foundation/           系统目标与全局约束 SYS-*——失效于系统目标改变
│   ├── basis/                内核与上游的机制语义条目及其 probe——失效于上游换版本
│   └── views/                全部派生的聚合视图，由生成器产出，任何人不手写
├── research/                 当前仅保留 TypeSafe Jev；职责与结构待负责人另行定义
├── agents/                   skills 与 roles 的唯一编译源、宿主适配与评估
├── tooling/                  确定性生成、设计检查与项目根链接
└── .claude/ .agents/ .codex/ 编译产物，不手改
```

**`research/` 与 `design/` 是兄弟目录。**当前只保留 TypeSafe Jev，职责与结构待负责人另行定义。
具体任务的调查、比较和执行材料放工作树 tmp；当前终态归实际拥有者。

## 当前入口

| 手上的任务 | 从哪进 |
|---|---|
| 收到产品需求或系统能力声明 | 加载 `harness-design-handbook` skill，从 intake、能力覆盖或当前缺口进入 |
| 在 [design/product](design/product/AGENTS.md) 起草或修订产品正文 | 加载 `product-design` skill；**只把产品正文当输入读的技术工作不加载它** |
| 要用到某个概念，或要引入新概念 | [统一语言](design/ubiquitous_language/README.md)。**先有词条，再动正文** |
| 想知道系统里有哪些有身份的对象、各自依据在哪 | [领域对象](design/domain_objects/README.md)；总表是派生的[领域对象地图](design/views/domain-object-map.md) |
| 查证上游机制到底保证什么 | [research/](research/README.md) 的对应 topic，或 [basis/](design/basis/README.md) 的条目 |
| 新建长期设计材料 | 先过 [准入与停止条件](design/README.md#准入与停止条件)，再用目标目录的本地 `.templates/` |
| 维护 skills 或 roles | 从 [agents/](agents/README.md) 改 canonical 源，**不手改生成产物** |
| 生成、检查或接入宿主入口 | [tooling/](tooling/README.md)。编译、项目根链接、发布是三个动作 |
| 判断公开承诺及其采用范围 | [架构维护入口](design/architecture/README.md)定位实际公开类型、薄SPEC及验证资源；目录或绿测不表示接受 |

## 自包含与发布边界

共享正文与宿主适配分开维护，**没有显式适配就拒绝生成**，不默认两个宿主能力相同。
工作树根通过相对软链接引用工作区内的生成目录：

```text
<产品根>/.claude -> .meta_harness/.claude
<产品根>/.agents -> .meta_harness/.agents
<产品根>/.codex  -> .meta_harness/.codex
```

点前缀不提供访问隔离；真正迁出与私有发布需要明确的交付边界。
**移动工作区不改变需求、决定、规格或消费者的采用状态。**

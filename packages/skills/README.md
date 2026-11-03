# Skill能力组

状态：唯一的 workspace 成员是 `@omne-harness/skill`，它提供已接受的 `skill` 类别端口。组的分解、模型、端口与服务是工程设计草案，全部为候选。发现、读取、脚本执行和发布仍没有成员实现。

## 责任与范围

本组承接Skill专有工程责任，领域边界沿[已接受领域责任](../../docs/domains/skills/README.md)。产品规则、阶段及政策沿[产品第四章](../../.meta_harness/design/product/skills/design.md#未决问题与待定事项)。许可、原消息、工具执行、环境资源和逻辑工作继续由相邻拥有者承担，不能因组合在本组中集中改写。

## 成员与依赖

真实 workspace 成员只有一个：

| 成员 | 当前状态 | 阅读入口 |
| --- | --- | --- |
| `@omne-harness/skill`（`packages/skills/skill`） | 已实现已接受的 `skill` 类别端口 `skillBodyContract`。依赖 `@omne-harness/assets`，不依赖 Tool。不提供发现、读取、脚本执行或发布 | [成员入口](skill/README.md)与[规格](skill/SPEC.md) |

组设计另有四个具名文档目标。它们都尚非 workspace 成员：没有包、源码或运行实例。名字、职责与依赖都是候选，建包时随成员规格确定。

| 具名文档目标 | 状态 | 职责 | 允许的生产依赖 |
| --- | --- | --- | --- |
| `skill-contract`（纯契约） | 尚非 workspace 成员。计划由现有 `@omne-harness/skill` 改名而来，改名在实施波完成 | 值、`skill` 类别端口、纯函数、端口与服务接口。`skill-contract/testing` 导出符合性套件与内存来源 | `@omne-harness/assets` 与 common 下的公共值成员 |
| `skill`（通用实现） | 尚非 workspace 成员。它不是现有的 `@omne-harness/skill` | 四个应用服务：`PackageInspection`、`SkillCatalog`、`SkillAccess`、`ScriptPreparation`。不依赖 Session、Agent 与 Cordis | 只依赖 `skill-contract` 与公共值成员 |
| `skill-cordis-contract`（Cordis 契约） | 尚非 workspace 成员 | 服务键与抽象 Service。不含实现 | `skill-contract` 与 Cordis 发布包 |
| `skill-host-local`（本地宿主） | 尚非 workspace 成员 | 本机目录来源 `DirectorySource`。内容存储来源等存储契约就绪后再加 | `skill-contract` 与宿主依赖 |

依赖方向是 `skill-host-local` 与 `skill-cordis-contract` 各自指向 `skill-contract`，`skill` 也指向 `skill-contract`。`skill` 不依赖 Cordis 契约或本地宿主。依赖方向在建包时写入架构约束，本页不改约束文件。

各目标的模型、端口、服务、失败种类与分波见[工程设计](docs/architecture.md)。各候选由哪个目标承接，见[成员承接表](docs/architecture.md#完整行为候选的正式承接缺口)。定义拥有者维护自己的公开形状。消费者沿真实边界取得必要主体、当前资格、采用依据及原调用引用。本组不创建组根统一 SPEC。

## 关键协作

[组内流程](docs/key-flows.md)表达本组服务与端口的协作。[领域流程](../../docs/domains/skills/key-flows.md)表达跨领域消息、执行和恢复交接。[领域交接设计](../../docs/domains/skills/architecture.md#端口与实现方)写明每个端口的实现方。[工程设计](docs/architecture.md)维护模型、失败与技术处置，不在本入口复制。

## 组合验证

组技术拥有者协调方法定义、取用与协议适配及真实相邻消费者，验证授权、采用竞争、原内容与动作、未知、取消、耐久与结果接续。证据须绑定成员、提供者及消费者的精确版本与故障前提。第一波的验证候选见[工程设计「验证」](docs/architecture.md#验证)。本轮没有核实行为、攻击、资源或耐久。替身与结构检查不代替真实组合验证。

## 维护

具名组维护者尚待指定。成员边界与实际公开形状明确并取得技术采用后，维护者完整承接行为，同步本入口、局部登记、产品技术导航与真实消费者，不能以搬迁薄化条件或把候选升级为采用。包创建沿[成员文档规范](../../docs/member-documentation.md)及[开发入口](../../docs/development.md#创建和整改产品包)。具名文档目标建成 workspace 成员后，从第二张表移到第一张表。

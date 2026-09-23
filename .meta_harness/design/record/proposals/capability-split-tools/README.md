# 块 B 工具运行时的能力拆分：五个对象切成几份能力、几个插件、落在哪个领域

**选择对象**：块 B 机制读数判为落点 #8（plugin + service）的五个对象——
[工具执行](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)的运行时、
注册表（无词条）、拓展件派发器（无词条）、[放行判断](../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision)的提供者、
[MCP](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) 桥——
**切成几份能力契约、由几个插件兑现、落在 `packages/` 第二层的哪个领域**。
选错的后果不会报错：执行宿主多挂一个会换代的依赖，会话里所有在途工具执行就会一齐落「失败 · 异常中断」；
领域放错了，第一次建包之后再改，就要搬目录、改所有引用。

**作者推荐候选 C**：五份能力契约，每份由一个插件兑现（放行判断本批只有接口）；执行宿主只 inject 存储与时钟，是一条 fiber；
执行运行时、注册表、MCP 桥和放行接口放在 `tools` 领域；**派发器和 hooks 兼容层放在 agent loop 那一侧的领域**。
领域名与包布局**待产品负责人拍板**。理由与改票条件见[候选与取舍](alternatives.md#推荐与改票条件)。**推荐不是接受。**

- **当前状态：候选。**尚无评审和决定，[`record/decisions/`](../../decisions/README.md) 里没有对应的决定文件；[proposals 索引](../README.md#当前主题)尚未收录本包，由主线登记。
- **本次终点与范围**：比较五个实质候选，外加两个子选择（注册表落在哪个领域、放行判断将来的提供者落在哪）；
  逐个写出性质承载、失去的保护点、出现的反查信号和可计数代价；给出推荐和改票条件；
  把机制读数里的装配草图与「为什么这样切」收成 [design.md 的独立一节](design.md#装配草图与为什么这样切)，供提供者设计引用。
  **不写**契约条款、提供者设计与投影；**不改**产品正文、词条、对象条目、registry 与其他 proposals。
- **输入基线**（设计工作区 spoke `panqiwei/assets-runtimes-proposal-b`，基线 `e0ef60a1`，2026-09-23）：
  - 产品正文：[PF-006](../../../product/PF-006-tools-and-skills/README.md) rev 17、[PF-007](../../../product/PF-007-meta-capabilities/README.md) rev 16、
    [PF-012](../../../product/PF-012-agent-loop-and-run/README.md) rev 10、[PF-008](../../../product/PF-008-human-in-the-loop/README.md) rev 5、
    [PF-005](../../../product/PF-005-execution-environments-and-sandboxes/README.md) rev 5、[PF-002](../../../product/PF-002-assets-settings-and-permissions/README.md) rev 16、
    [PF-004](../../../product/PF-004-agent-definition-and-assembly/README.md) rev 10。以上各 rev 已逐个对照 README 的 `revision` 核过。
  - 系统约束：[SYS-DYNAMIC](../../../foundation/fully-dynamic-system/requirements.md)（C2：能力的实现与绑定能动态演化，在途工作怎么处置由设计写明）、
    [SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)、[SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)、
    [SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant)。
  - 有效决定：[D-032](../../decisions/tool-execution-runtime-baseline/README.md)（运行时自研，执行宿主不挂在 agent runtime 之下）、
    [D-033](../../decisions/hooks-compat-baseline/README.md)（hooks 兼容层的起点与 fork 边界）、
    [D-037](../../decisions/mcp-client-adoption/README.md)（官方 SDK 上自写薄桥；stdio 本版一律在据点机拉起）、
    [D-038](../../decisions/message-and-shape-rulings/README.md)（Q8 按装配清单排序、Q10 运行时只认统一的入出、Q15 结果落哪种消息由判断决定）、
    [D-024](../../decisions/tenancy-domain-name/README.md)（领域名先例：在第一次建包之前定）、
    [D-026](../../decisions/infrastructure-persistence-choices/README.md)、[D-025](../../decisions/cordis-adoption-version/README.md)（Cordis 4.0.4）。
  - 候选契约（未接受）：[`data.tool-definition`](../../../spec/data/tool-definition/README.md) v1、[`data.loop-extension`](../../../spec/data/loop-extension/README.md) v1。
    五份能力契约（`capability.tool-execution-runtime`、`capability.tool-admission`、`capability.loop-extension-runner`、`capability.mcp-bridge`、`capability.asset-registry`）
    以及 `data.mcp-endpoint`、`capability.hooks-import` **正在别的 spoke 上并行起草，都不在本基线里**。本包只读过它们的施工简报，所以凡涉及它们操作名的地方都标「候选」。
  - 机制语义：[basis](../../../basis/README.md) 的八条 Cordis 4.0.4 条目（按 id 引用）；basis 没有覆盖的语义，在 design.md 里标为假设。
  - 方法：`harness-design-handbook` 的[能力覆盖与演化](../../../../agents/skills/harness-design-handbook/canonical/references/decompose.md)与[提供者投影](../../../../agents/skills/harness-design-handbook/canonical/references/project.md#从能力维度确定插件边界)。

### 读了什么、没读什么

| 读了 | 为什么 |
|---|---|
| 任务区三份读数：块 B 领域读数（第一遍，已封存）、机制读数、对账四表 | 性质表、对象与落点、装配草图、「为什么这样切」、自证替代分解 α–ζ、回询草稿。**本包凡要长期引用的内容，都已在 design.md 里重新写出；正文不链接任务区** |
| 任务区的缺口处置表「块 B」两节与对账报回、裁决账本 §一 U-5/U-6 和 §二 G1–G11 | 主线在读数之后作的裁定。这些**都还没有经产品负责人签字**，本包引用时一律标「主线裁定，待确认」 |
| 任务区施工简报 `common`、S13、S14、S15、S19、S22 | 五份能力契约的拟议范围、账本，以及主线按机制读数所作的修订 |
| 本区：模板、范本 [`tool-execution-runtime-baseline`](../tool-execution-runtime-baseline/README.md)、先例 [`tenant-capability-split`](../tenant-capability-split/README.md)、上列决定、两份 data 候选契约的入口与相关条款、[realization 两层布局](../../../realization/README.md#packages-的两层布局)、basis 两条正文、PF-012 §5.8 两小节、[`infra/storage-sql`](../../../realization/packages/infra/storage-sql/README.md) 设计里讲升级的那几节 | 形制、先例、判据，以及判断 ζ 改票条件所需的事实 |

| 没读 | 为什么，影响到哪 |
|---|---|
| 并行 spoke 上起草中的五份能力契约、`capability.hooks-import` 与 `data.mcp-endpoint` | 不在本基线。它们的操作名以简报为准，标「候选」 |
| **块 A 的能力拆分提案**（并行起草） | 不在输入之列。**注册表落在哪个领域，与那份提案有接缝**，两边没有对齐——见[交接缺口](design.md#交接缺口) |
| D-025、D-026 正文，basis 其余六条正文 | 经 D-032 转述，basis 按 id 引用；本包不在正文里推导上游行为 |
| `design_legacy/` | 不作输入 |

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是。五个 #8 对象怎样切成能力契约、插件和领域；三个侧面互相牵连，所以候选以**整套配置**作答 |
| 现有能力覆盖 | 见 [design.md](design.md#现有能力如何承载)。数据契约与存储、时钟、内核小件已有候选或实现；**这五个对象都没有任何已接受的能力契约或提供者** |
| 剩余责任 | 见 [design.md](design.md#剩余责任与能力演化)：五项新的独立责任，另有执行者、样例工具、卸载判定、compat 实现几项**贡献**。贡献不是能力维度 |
| 三个实质候选 | **齐，五个**：A 一个插件承载全部；B 五个插件都放在 `tools`；C 五个插件按拥有者分领域；D 执行宿主拆成两条 fiber；E 派发器并进 agent loop 的提供者。A、D、E 各有一条结构性反例，B 与 C 的差别在于反复同步修改的信号和以后要不要搬迁，见 [alternatives.md](alternatives.md#五个候选) |
| 接受权限 | **本包不产生接受。**领域名、包布局与装配节点名都待产品负责人拍板 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要选的是什么、哪些性质不能丢、五个对象各归谁、现有能力承载到哪、剩下什么 | [设计正文](design.md) |
| 提供者设计要引用的装配草图、服务面、装卸配对、「为什么这样切 / 为什么不拆」、装配给与协议给 | [装配草图与为什么这样切](design.md#装配草图与为什么这样切) |
| 领域与包布局的候选路径（待拍板） | [领域与包布局](design.md#领域与包布局) |
| 五个候选各自怎么承载性质、丢了哪里、代价多少，为什么推荐 C，什么证据会改票 | [候选与取舍](alternatives.md) |
| 评审了什么、怎么处置 | [评审记录](review.md)（尚无） |

## 后续消费

- **下游（都还是候选）**：五份能力契约的「提供者映射」一节；块 B 各 provider 节点的 `design.md`（节点尚未建立），其中装配草图、装卸配对和「为什么不拆」引用本包；
  可独立运行的装配节点（候选名 `apps/runtime-host`，待拍板）。**本包被接受之前**，下游可以引用这里的草图和理由，但不能把领域名、包路径和推荐当作已定。
- **需要有权者裁定的**：`tools` 领域名；agent loop 那一侧的领域名（本包给了一个候选写法）；装配节点名；
  两条「主线裁定，待确认」——放行判断缺席时整批拒、停机后关闭孤卡（任务区 `tmp/assets-runtimes/pending-user-rulings.md` §一 U-5、U-6 的甲案）。
  另有六处缺口要主线处理，见 [design.md 交接缺口](design.md#交接缺口)，其中最急的是：按现在的裁定，**可独立运行的装配连一个工具也执行不了**。
- **登记不做的**：A、D、E 以及两个子选择里落选的几项，保留为候选；
  [alternatives.md](alternatives.md#推荐与改票条件) 写明了什么证据会让它们重新上桌。

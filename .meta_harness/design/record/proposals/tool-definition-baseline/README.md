# 工具定义基线：从哪一源拓展，还是按产品正文自研

**选择对象**：[工具定义](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)的**数据契约从哪里起步**。
三个参考源（DSH `core/tools`、omne-next `agentic/tool`、本仓库实验分支 minimal-runtime 的 `packages/tools/tools`）
各有一份现成形状；问题是以其中一份为起点改到符合产品正文，还是照
[PF-006 §5.3](../../../product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)（rev 16）另写一份 JSON Schema、只借三源的字段命名与校验经验。
**这里选的只是起点，不是契约正文**——字段名、JSON Schema 方言、返回形状声不声明，都由后续规格定。

- **当前状态：候选。**四个候选，作者推荐 **D（按产品正文自研，逐字段借用三源）**。
  **作者推荐不是接受**；[decisions](../../decisions/README.md) 里没有任何一条接受它，
  也[尚未记录实际评审](review.md)。
- **本次终点与范围**：完整候选比较与作者推荐。本包不写契约、不改产品正文与研究，
  不选工具执行运行时（那是「工具运行时基线」一题），也不选 MCP 客户端（「MCP 客户端采用」一题）；
  这两题与本题的交界写在 [design.md](design.md#契约动作链与-cordis-投影)。
- **输入基线**（2026-09-23）：
  - 产品正文：[PF-006](../../../product/PF-006-tools-and-skills/design.md) rev 16（§5.3、§5.4、§6.3、§6.4、§6.8、§6.13）、
    [PF-002](../../../product/PF-002-assets-settings-and-permissions/design.md) rev 13（§4 身份、Tool、MCP；§5.2 设置项四类）、
    [PF-007](../../../product/PF-007-meta-capabilities/design.md) rev 16（多命令范式、`Tools()`）。
  - 统一语言：[UL-tool-definition](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)、
    [UL-tool](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-tool--工具--tool)、
    [UL-capability-identifier](../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)、
    [UL-setting-category](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)。
  - 系统约束：[SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)、
    [SYS-SPEC](../../../foundation/cross-system-constraints/requirements.md#sys-spec)。
  - 有效决定：[D-025](../../decisions/cordis-adoption-version/decision.md)（Cordis 4.0.4）、
    [D-026](../../decisions/infrastructure-persistence-choices/decision.md)（不提供 in-memory 存储）、
    [D-023](../../decisions/tenant-domain-design-acceptance/decision.md) 接受的
    [`data.identity-values` v1](../../../spec/data/identity-values/v1/contract.md)。
  - 研究：[tool-definition-shape-sources](../../../../research/tool-definition-shape-sources/research.md)（主输入，24 行对照表）、
    [tool-execution-runtime-sources](../../../../research/tool-execution-runtime-sources/research.md)（定义与执行的边界）、
    [mcp-client-reuse](../../../../research/mcp-client-reuse/research.md)（MCP 动作作为工具条目）。三份都是 2026-09-23 的静态阅读。
  - **研究对照的是 PF-006 rev 14 / PF-002 rev 10**，此后产品升了两次 rev。本包按 rev 16 / rev 13 **重读了受影响的两行**
    （`help`、MCP），重读结果是本包的判断，**不是研究的更新**，见 [design.md](design.md#现有能力如何承载)。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：工具定义数据契约的起点——拓展哪一份现成形状，还是按产品正文自写 |
| 现有能力覆盖 | 规格区**没有**工具定义契约；能直接消费的只有 `data.identity-values` v1 的层身份与持有键，见 [design.md](design.md#现有能力如何承载) |
| 剩余责任 | 整份数据契约都是新的；本包只定它从哪起步，见 [design.md](design.md#剩余责任与能力演化) |
| 三个实质候选 | **齐，四个**：A 拓展 minimal-runtime、B fork DSH、C 移植 omne-next、D 自研。三源各有真实反例与真实长处，不是陪衬，见 [alternatives.md](alternatives.md) |
| 接受权限 | **本包不产生接受。**作者推荐、模板齐全都不提升状态 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要选什么、哪些条款一条不能丢、现在有什么能承载 | [设计正文](design.md) |
| 四条路各要改什么、代价多大、为什么推荐 D、什么证据会改变推荐 | [候选与取舍](alternatives.md) |
| 评审了没有 | [评审记录](review.md)：尚未记录实际评审 |

## 后续消费

- **尚无消费者落地。**本包被接受之后，下游是一份工具定义数据契约（`spec/data/` 下，名字未定）；
  它的字段、方言与返回形状由那份契约的起草者定，本包只提供起点与借用清单。
- **与两题相邻、不相代**：工具执行运行时的基线（DSH 执行管线 fork 与否）和 MCP 客户端的采用各自成题；
  本包推荐 D **不排除**运行时 fork DSH，交界见 [design.md](design.md#契约动作链与-cordis-投影)。
- 研究 [tool-definition-shape-sources](../../../../research/tool-definition-shape-sources/research.md#采用与后续核对) 的「采用与后续核对」
  写着「proposal 出现后回来补链接」，那一步归研究的维护者，本包不改研究。

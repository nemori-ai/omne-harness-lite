# MCP 客户端采用：整包复用、剥离 fork、官方 SDK 上自写薄桥，还是自写协议层

**选择对象**：MCP 客户端这一层用什么实现，以及它在本版**桥到哪一步**（tools 之外的 resources、prompts、sampling、
elicitation、通知等）。产品把后一半明确交给了这个选择——[PF-002 §4 MCP](../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)（rev 13）：
「本版桥到哪一步，**随采用的客户端**，产品不预定清单」。

**作者推荐 C**：以官方 SDK `@modelcontextprotocol/sdk` 为协议层，本项目自写连接池、run 前列举与持久清单、收场映射，
本版起步桥 tools、取消、elicitation（落[工具等待态](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state)）；
resources、prompts、sampling、roots、OAuth 本版不桥，各有写明的产品或架构前提。理由与翻盘条件见[候选与取舍](alternatives.md)。

- **当前状态：候选。**推荐不是接受；本包未经任何评审（[review.md](review.md)），没有任何决定引用它。
- **本次终点与范围**：四条实质候选的完整比较、一张「支持到哪一步」的结论表、挡住定稿的核对项。
  **不写**契约、提供者设计、节点或包布局；不改产品正文、研究与词条。
- **输入基线**（工作树 `panqiwei/assets-runtimes`，2026-09-23）：
  - 研究：[mcp-client-reuse](../../../../research/mcp-client-reuse/README.md)（首轮，DSH `c291e796`、Codex `5c5308fc`）；
    相关：[tool-definition-shape-sources](../../../../research/tool-definition-shape-sources/README.md)、
    [loop-extension-hooks-compat](../../../../research/loop-extension-hooks-compat/README.md)。
  - 产品：PF-002 rev 13（§4 MCP、§5.2 设置项四类）；PF-006 rev 16（§4 替换件与等待态、§5.5、§6.2、§6.3、§6.5、§6.12、§6.13）；
    PF-007 rev 16（§5.6 及其[决定簿校准](../../../product/PF-007-meta-capabilities/decisions.md#四已知的来源问题)）；PF-008 rev 5（§6.1）；
    [UL-mcp](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp)。
  - 约束与决定：[SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)、
    [SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、
    [SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)；
    [D-025](../../decisions/cordis-adoption-version/README.md)（Cordis 4.0.4）、
    [D-026](../../decisions/infrastructure-persistence-choices/README.md)（无 in-memory 实现）。
  - 产品负责人 2026-09-23 裁决原话（逐字已落
    [PF-006 decisions](../../../product/PF-006-tools-and-skills/decisions.md#2026-09-23--help-可选常驻由引用上的设置指定展示什么归装配策略mcp-对端动作映射成工具)）：
    「1）复用社区现有的通用做法，MCP -> tools 映射转化；2) 看直接复用的方案支持到哪种程度」。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：客户端实现路径（四选一）＋本版桥接范围。两者相关——桥接范围的上限由路径决定 |
| 现有能力覆盖 | **本设计链里还没有工具协议、工具运行时或 MCP 相关的契约与节点**（`spec/`、`realization/` 均无），所以没有现成承载者；[design.md](design.md#现有能力如何承载) 只列产品要求与各候选的覆盖 |
| 剩余责任 | 见 [design.md](design.md#剩余责任与能力演化)：连接池、run 前列举与持久清单、收场映射、等待态桥接、落点接口；另有三项不归本包的缺口 |
| 三个实质候选 | **齐，四个**：A 整包复用 DSH `mcp-client`、B fork 并剥离 DSH 依赖、C 官方 SDK 上自写薄桥、D 不用 SDK 自写协议层（借 Codex 形状）。A 与 D 被排除或不推荐，但都是真实路径（A 正是「直接复用」的字面读法），排除依据保留在 [alternatives.md](alternatives.md) |
| 接受权限 | **本包不产生接受。**推荐、评审、模板齐全都不提升状态；接受归产品负责人，另立决定 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要保住哪些性质，现在谁承载，剩下什么责任，大致怎样投影到 Cordis | [设计正文](design.md) |
| 四条路各自怎样兑现、代价与反例；为什么推荐 C；本版桥到哪一步；什么证据会翻盘 | [候选与取舍](alternatives.md) |
| 评审了哪个修订 | [评审记录](review.md)（尚无） |

## 后续消费

- **待接受**：路径选择（C 或其他）与「支持到哪一步」表，由产品负责人决定；接受后另立 `decisions/` topic。
- **接受之后的下游**（均尚不存在）：工具协议与工具运行时契约里 MCP 那一段；MCP 客户端的提供者节点（领域名与节点名未定）；
  「上一次清单」的存储需求（按 D-026 落持久存储）。
- **不归本包、已转交的缺口**：从未连上过的接入点怎么办（产品，[PF-006 decisions 第二节](../../../product/PF-006-tools-and-skills/decisions.md#二pm-推导)已记）；
  MCP 连接与 stdio 子进程本身的宿主（架构）；MCP 接入点凭据的词条（统一语言）。详见 [design.md 交接缺口](design.md#交接缺口)。

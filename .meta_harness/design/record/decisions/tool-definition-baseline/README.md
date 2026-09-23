# D-031：工具定义数据契约的起点——按 PF-006 §5.3 自研，三源只作参考、可以照抄

产品负责人 2026-09-23 裁定：[工具定义](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)的数据契约
**按产品正文自研 JSON Schema**（提案候选 D）；minimal-runtime、DSH `core/tools`、omne-next 三个参考源（候选 A、B、C）
**只作参考，字段命名与结构可以照抄**，不以任何一源为起点。
**接受的是契约起草的起点方向，不是契约**——工具定义数据契约还没有起草。

- **输入与下游**：来源提案 [`proposals/tool-definition-baseline`](../../proposals/tool-definition-baseline/README.md)（四个候选，作者推荐 D）；
  研究 [tool-definition-shape-sources](../../../../research/tool-definition-shape-sources/README.md)（主输入）、
  [tool-execution-runtime-sources](../../../../research/tool-execution-runtime-sources/README.md)、
  [mcp-client-reuse](../../../../research/mcp-client-reuse/README.md)。
  下游是 `spec/data/` 下的工具定义数据契约（名字未定，**未起草**），以及读它的工具执行运行时（[D-032](../tool-execution-runtime-baseline/README.md)）与 MCP 动作条目。
- **范围定位**：只解决「工具定义的数据契约从哪起步、三个参考源怎么用」。
  **不解决**：字段清单、参数 JSON Schema 方言、返回形状（归契约起草）；工具执行运行时的起点（D-032）；MCP 客户端的采用（另立决定）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-23 对 G1 七份复用提案逐项裁决，对本提案原话：**「D，其他的只作为参考，可以『抄』」**。逐字摘自当日裁决台账（主检出 `tmp/assets-runtimes/g1-rulings.md` 第 1 行；台账是过程材料，本处逐字引用是长期记录） |
| 精确修订 | 提案包在 HUB 分支 `panqiwei/assets-runtimes` 提交 `b12d927` 的内容（此后到本决定落地未再改动） |
| 接受范围 | 一个起点方向：D 为起点，A、B、C 只作参考、可照抄；逐项见[决定正文](decision.md#选择与范围) |
| 保留前提 | PF-006 rev 16、PF-002 rev 13、PF-007 rev 16 是需求基线；照抄的每一项重新对到产品条款并登记来源；见[正文](decision.md#理由与保留前提) |
| 评审状态 | 提案[未记录任何独立评审](../../proposals/tool-definition-baseline/review.md)；接受不以评审为前提，评审也不会因本决定补上 |
| 取代关系 | 不取代任何决定 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么、**不表示**什么 | [决定正文](decision.md) |
| 四个候选各要改什么、借用清单、什么证据会翻盘 | [提案候选与取舍](../../proposals/tool-definition-baseline/alternatives.md) |
| 三源逐条款的承载情况 | [研究对照表](../../../../research/tool-definition-shape-sources/research.md) |

返回[决定](../README.md)。

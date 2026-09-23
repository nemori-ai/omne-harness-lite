# D-036：斜杠命令识别与解析的起点——按产品正文自研统一解析器

产品负责人 2026-09-23 裁定：交付面上[斜杠命令](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command)的识别、名字解析、参数解析与展开分派
**按产品正文自研一套统一解析器**（提案候选 D），从 Codex 借识别边界、从 omne-next 借失败纪律与声明优先、从 Claude Code 借占位符与留痕形状。
**接受的是起点方向，不是契约**——识别文法与解析结果的契约、判定用例集都还没有。

同日产品负责人还就提案展开的 Q3、Q7、Q8 与三项产品未决逐一作答并补裁两处。
**那六条是产品正文修订，不在本决定接受范围**：它们归 PF-002／PF-014／PF-016（及 PF-004）的下一次 rev，本决定只在[「取代与影响」](decision.md#取代与影响)登记去向。

- **输入与下游**：来源提案 [`proposals/slash-command-parsing-baseline`](../../proposals/slash-command-parsing-baseline/README.md)（四个候选加一条排除路径，作者推荐 D）；
  研究 [slash-command-parsing-sources](../../../../research/slash-command-parsing-sources/README.md)（五源）、
  [connector-and-slash-command-sources](../../../../research/connector-and-slash-command-sources/README.md)、
  [skill-spec-sources](../../../../research/skill-spec-sources/README.md)（name 语法一条）。
  下游是交付面呈现与受理契约、受理契约（PF-014 的规格化）、斜杠命令资产的数据形状，**都待立**；以及 [cli-tui 提案](../../proposals/cli-tui/README.md) D7 的收窄。
- **范围定位**：只解决「识别—解析名字—解析参数—展开与分派这条链以谁为起点」。
  **不解决**：文法与解析结果的契约正文、判定用例集、字面发送的记法、导入器、任何一条系统业务流程；Q1–Q9 与三项产品未决的答案。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-23 对 G1 七份复用提案逐项裁决，对本提案原话：**「D」**。逐字摘自当日裁决台账（主检出 `tmp/assets-runtimes/g1-rulings.md` 第 7 行；台账是过程材料，本处逐字引用是长期记录） |
| 精确修订 | 提案包在 HUB 分支 `panqiwei/assets-runtimes` 提交 `b12d927` 的内容（此后到本决定落地未再改动） |
| 接受范围 | 只有起点：D 自研统一解析器及其借用来源；逐项见[决定正文](decision.md#选择与范围) |
| 保留前提 | N1–N12 按当前产品正文成立；判定用例集在三项产品未决落字前写不全；见[正文](decision.md#理由与保留前提) |
| 评审状态 | 提案[未记录任何独立评审](../../proposals/slash-command-parsing-baseline/review.md)；接受不以评审为前提 |
| 取代关系 | 不取代任何决定 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、同日产品裁决去哪、**不表示**什么 | [决定正文](decision.md) |
| 四个候选各与哪条性质相抵、D 借了什么、Q1–Q9 | [提案候选与取舍](../../proposals/slash-command-parsing-baseline/alternatives.md) |
| 必要性质 N1–N12、五片剩余责任、动作链草图 | [提案设计正文](../../proposals/slash-command-parsing-baseline/design.md) |

返回[决定](../README.md)。

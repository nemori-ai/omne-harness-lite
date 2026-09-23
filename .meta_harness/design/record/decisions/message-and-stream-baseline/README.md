# D-035：消息、到达语法与流装配器三层的起点——逐层混合

产品负责人 2026-09-23 先派独立架构评审论证、评审判「成立」之后，接受提案候选 D（逐层混合）：
**数据契约**按 PF-009／PF-013 自研 JSON Schema；**到达语法**以 DSH `StreamChunk` 的骨架为起点、把不变量伴件的检查逐项筛选补全后升格为语法条款；
**流装配器**自写；**pi-ai 只在传输适配处被翻译进来**；工具按同一语法直接发帧、不经 `pi-agent-core`；三层作为纯计算落 `packages/core/`，**先于模型请求运行时与工具运行时的契约定型**。
**接受的是三层的起点方向，不是契约**——消息与块的数据契约、到达语法契约、一致性用例集都还没有起草。

- **输入与下游**：来源提案 [`proposals/message-and-stream-baseline`](../../proposals/message-and-stream-baseline/README.md)（四个候选，作者推荐 D）与它的
  [独立架构评审](../../proposals/message-and-stream-baseline/review.md)（Codex `gpt-6-astra`，[原件](../../proposals/message-and-stream-baseline/reviews/2026-09-23-codex-architecture-review.md)）；
  研究 [message-model-and-stream-sources](../../../../research/message-model-and-stream-sources/README.md)、
  [model-request-transport-sources](../../../../research/model-request-transport-sources/README.md)。
  下游是消息与块的 `data.*` 契约、到达语法契约及其一致性用例集，以及以它们为前提的模型请求运行时与工具运行时两块契约与节点，**都未起草**。
- **范围定位**：只解决「三层各以谁为起点、pi-ai 止步在哪、三层落在哪」。
  **不解决**：块身份与嵌套寻址、供应商回放数据放哪、首 token 的判定与耐久记录、工具帧的记账、已交付内容在成品提交前崩溃由谁保全——评审上交的这些缺口列为[保留前提](decision.md#理由与保留前提)。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-23，产品负责人对本提案先裁：**「先派 codex gpt-6-astra 去论证 D 是否成立」**；评审判 D 成立后裁：**「接受」**。逐字摘自当日裁决台账（主检出 `tmp/assets-runtimes/g1-rulings.md` 第 6、6a 行；台账是过程材料，本处逐字引用是长期记录） |
| 精确修订 | 提案包在 HUB 分支 `panqiwei/assets-runtimes` 提交 `b12d927` 的内容，加提交 `9ab1e36` 的评审修订（`review.md`、`reviews/` 原件、`design.md` 剩余责任表「节流」一行改为「当前装配选择」） |
| 接受范围 | D 的三层起点、pi-ai 的止步处、工具发帧不经 `pi-agent-core`、三层落 core 且先于两块契约；逐项见[决定正文](decision.md#选择与范围) |
| 保留前提 | 评审的最强反证与上交的下游缺口逐条列为前提；PF-009 rev 5、PF-013 rev 5–6 仍待产品负责人确认；见[正文](decision.md#理由与保留前提) |
| 评审状态 | 一次独立架构评审，结论「D 成立」，置信度中等偏高；**评审不是接受**，接受依据是产品负责人的「接受」 |
| 取代关系 | 不取代任何决定；回答了 [D-019](../model-provider-pi-ai-fork/README.md) 明文留给「另一次选择」的那一项（DSH 的 context/stream/replay 转换是否复用），D-019 其余范围不变 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、评审上交了什么、**不表示**什么 | [决定正文](decision.md) |
| 四个候选、三层能不能分开选、什么证据会翻盘 | [提案候选与取舍](../../proposals/message-and-stream-baseline/alternatives.md) |
| 评审的最强反证、纸面走查、发现与处置 | [评审记录](../../proposals/message-and-stream-baseline/review.md) |

返回[决定](../README.md)。

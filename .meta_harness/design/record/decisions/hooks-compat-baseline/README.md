# D-033：hooks 兼容层的起点——fork DSH hook-protocol 无运行时的一半，其余自写

产品负责人 2026-09-23 裁定：把 Claude Code／Codex 的 hooks 配置翻译成本项目[拓展件](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)的那一层，
**先以提案候选 A 为起点**——fork DSH `hook-protocol` 里与运行时无关的四个文件（matcher、codec、merge、detached）加 `HookOutput` 类型，
runner、导入、方言映射表与结论交付全部自写。提案的区分实验保留：**改动超过一半就改选 C（全自研）**。
映射项 G1–G11 **推迟到拓展点协议起草时一并讨论裁决**。
**接受的是起点与 fork 边界，不是拓展点协议、兼容层契约或实现**——三者都还没有，fork 也还没做。

- **输入与下游**：来源提案 [`proposals/hooks-compat-baseline`](../../proposals/hooks-compat-baseline/README.md)（四个候选，作者推荐 A）；
  研究 [loop-extension-hooks-compat](../../../../research/loop-extension-hooks-compat/README.md)（Claude Code 2.1.280 文档快照、Codex `5c5308f`、DSH `c291e79`）。
  下游是本项目的拓展点协议（阶段 3/4，**未起草**）与兼容层的提供者设计（**未起草**）。
- **范围定位**：只解决「兼容层从什么起步、fork 到哪为止」。
  **不解决**：本项目自己的拓展点协议（位置的调用契约、每类拓展件的报错策略、结论条目形状）；G1–G11 任何一项。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-23 对 G1 七份复用提案逐项裁决，对本提案原话：**「选 A 先吧；几个G等协议起草时一起讨论裁决」**。逐字摘自当日裁决台账（主检出 `tmp/assets-runtimes/g1-rulings.md` 第 4 行；台账是过程材料，本处逐字引用是长期记录） |
| 精确修订 | 提案包在 HUB 分支 `panqiwei/assets-runtimes` 提交 `b12d927` 的内容（此后到本决定落地未再改动）；fork 源为 DSH `c291e79` |
| 接受范围 | A 的起点与 fork 边界；区分实验与改选 C 的判据保留；G1–G11 推迟；逐项见[决定正文](decision.md#选择与范围) |
| 保留前提 | 「先」读作：区分实验出结果之前以 A 为起点；fork 按 SYS-KERNEL 视作自有模块、不假设与上游同步；兼容层站在尚未起草的拓展点协议之上；见[正文](decision.md#理由与保留前提) |
| 评审状态 | 提案[未记录任何独立评审](../../proposals/hooks-compat-baseline/review.md)；接受不以评审为前提 |
| 取代关系 | 不取代任何决定 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么、**不表示**什么 | [决定正文](decision.md) |
| 四个候选、性质对照、区分实验怎么做 | [提案候选与取舍](../../proposals/hooks-compat-baseline/alternatives.md) |
| G1–G11 各是什么、谁定 | [提案交接缺口](../../proposals/hooks-compat-baseline/design.md#交接缺口) |

返回[决定](../README.md)。

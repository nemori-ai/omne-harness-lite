# D-032：工具执行运行时的实现起点——自研；DSH jobs 与 local-execution 只借鉴避坑

产品负责人 2026-09-23 裁定：承载一次[工具执行](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)的运行时
**自研**（提案候选 C：Cordis 4.0.4 fiber／服务 + `core/storage` 落账）；DSH `jobs` 三层与 minimal-runtime 的 `tools/local-execution`
**只作借鉴，目的是避坑、少走弯路**，不 fork、不以之为起点。提案要求把两源已知的失败情形列成测试义务，照此执行。
**接受的是实现起点方向，不是契约、提供者设计或实现**——三者都还没有。

- **输入与下游**：来源提案 [`proposals/tool-execution-runtime-baseline`](../../proposals/tool-execution-runtime-baseline/README.md)（四条路径对十条必要性质，作者推荐 C）；
  研究 [tool-execution-runtime-sources](../../../../research/tool-execution-runtime-sources/README.md)（17 条断言、16 行对照表）。
  下游是工具执行运行时的候选契约（`spec/`，**未起草**）与它的提供者节点（`realization/`，**未建**）。
- **范围定位**：只解决「运行时从哪起步、两源怎么用」。
  **不解决**：运行时契约与状态机、执行账落 SQL 还是 JSONL、D-026 对活体句柄的读法、`apps/cli` 的进程分组，以及同日另作的据点停机收场产品裁决（归产品正文，见[正文](decision.md#取代与影响)）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-23 对 G1 七份复用提案逐项裁决，对本提案原话：**「C，不过 minimal-runtime 和 dsh 各自的有可取之处的设计和实现方案，如果值得吸纳（只是为了避免走弯路、踩坑）的话，可以借鉴学习」**。逐字摘自当日裁决台账（主检出 `tmp/assets-runtimes/g1-rulings.md` 第 2 行；台账是过程材料，本处逐字引用是长期记录） |
| 精确修订 | 提案包在 HUB 分支 `panqiwei/assets-runtimes` 提交 `b12d927` 的内容（此后到本决定落地未再改动） |
| 接受范围 | 一个起点方向：C 自研 + 两源只借鉴 + 已知失败情形列为测试义务；逐项见[决定正文](decision.md#选择与范围) |
| 保留前提 | `core/storage` 协议被接受、会话与 Run 契约存在之前，C 只能起草契约、不能开包；X-2、X-5、X-6 在提供者设计前闭合；见[正文](decision.md#理由与保留前提) |
| 评审状态 | 提案[未记录任何独立评审](../../proposals/tool-execution-runtime-baseline/review.md)；接受不以评审为前提 |
| 取代关系 | 不取代任何决定 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么、**不表示**什么 | [决定正文](decision.md) |
| 四条路径的性质矩阵、借用表、翻盘条件、X-1～X-7 | [提案候选与取舍](../../proposals/tool-execution-runtime-baseline/alternatives.md) |
| 两源在源码上是什么样 | [研究正文](../../../../research/tool-execution-runtime-sources/research.md) |

返回[决定](../README.md)。

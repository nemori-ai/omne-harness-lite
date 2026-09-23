# D-032：工具执行运行时的实现起点——自研；DSH jobs 与 local-execution 只借鉴避坑

- **当前状态：已接受，一个实现起点方向。**
  **未接受**：任何契约（工具执行运行时契约还不存在）、提供者设计、存储形态、装配；任何实现。
- **来源提案**：[`proposals/tool-execution-runtime-baseline`](../../proposals/tool-execution-runtime-baseline/README.md)，HUB `panqiwei/assets-runtimes` 提交 `b12d927`——
  [十条必要性质与附带约束](../../proposals/tool-execution-runtime-baseline/design.md#需要作出的选择)、
  [四条路径与借用表](../../proposals/tool-execution-runtime-baseline/alternatives.md#四条路径)、
  [推荐 C 与 X-1～X-7](../../proposals/tool-execution-runtime-baseline/alternatives.md#推荐与仍待区分的事项)。
- **来源研究**：[tool-execution-runtime-sources](../../../../research/tool-execution-runtime-sources/research.md)（DSH `c291e796`、minimal-runtime `d79484d`，2026-09-23；对照的是 PF-006 rev 14，rev 16 纠正的影响见[提案](../../proposals/tool-execution-runtime-baseline/design.md#研究基线与-rev-16-的差)）。
- **需求与方法前提**：[PF-006](../../../product/PF-006-tools-and-skills/README.md) rev 16（含「工具执行有自己独立的 runtime、绑会话、从不由 agent runtime 承载」的纠正）、
  [PF-012](../../../product/PF-012-agent-loop-and-run/README.md) rev 9、[PF-008](../../../product/PF-008-human-in-the-loop/README.md) rev 5、[PF-007](../../../product/PF-007-meta-capabilities/README.md) rev 16；
  [D-025](../cordis-adoption-version/README.md)（Cordis 4.0.4）、[D-026](../infrastructure-persistence-choices/README.md)（无 in-memory、Kysely + `node:sqlite`/pg）、
  [D-022](../cli-tui-delivery-form/README.md)（工具执行在用户本机）；
  [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)、[SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant)。
- **实际接受依据**：2026-09-23，产品负责人（`panqiwei`）对 G1 七份复用提案逐项裁决，对本提案原话
  **「C，不过 minimal-runtime 和 dsh 各自的有可取之处的设计和实现方案，如果值得吸纳（只是为了避免走弯路、踩坑）的话，可以借鉴学习」**。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| 运行时实现起点：A fork DSH `jobs/{jobs,jobs-local,tool-jobs}`、B 拓展 `local-execution`、C 自研、D 混合 | **接受 C** | 以会话为宿主、执行宿主 fiber 不在 agent runtime fiber 之下、执行记录与账经 `core/storage` 落、执行者接口统一承载子进程／进程内函数／MCP 调用——这是提案 C 的**起点形状**，具体条款归契约 | 契约、状态机、执行者接口形状都未起草；执行账落 SQL 还是 JSONL 未定（X-3，提案倾向 SQL） |
| DSH jobs 与 local-execution 怎么用 | **只借鉴，目的是避坑**（原话「如果值得吸纳（只是为了避免走弯路、踩坑）的话，可以借鉴学习」） | 不 fork、不以之为起点、不继承代码；提案 C 的[借用表](../../proposals/tool-execution-runtime-baseline/alternatives.md#四条路径)（借什么、不借什么）是已识别的借鉴项；函数级借用（例如照 DSH `settle` 的首胜顺序写）在提供者设计里逐项登记来源，不算 fork | 借用表之外还值不值得吸纳，由契约与提供者设计的起草者按「避坑」这一目的判断 |
| 两源已知失败情形 | **照提案执行：列成 C 的测试义务** | 至少：撤除时 cancel 抛错要强制结算、同 id 换实例不串台、停止与 I/O 交错、bash spawn 失败被记成 killed（[提案推荐第 4 条](../../proposals/tool-execution-runtime-baseline/alternatives.md#推荐与仍待区分的事项)）；local-execution「停止与 I/O 交错那组反例」同列 | 测试义务要写进契约的验证义务或提供者节点的 verification，**现在都还没有** |
| 仍待区分的实验 X-1～X-7 | **未因本决定闭合** | — | 见[提案](../../proposals/tool-execution-runtime-baseline/alternatives.md#仍待区分的实验)：X-2 D-026 活体句柄读法（架构负责人，契约起草前）；X-4 进程组迁移（`apps/cli` 节点）；X-5 父进程被强杀后子进程存活（实现者，恢复路径设计前）；X-6 fiber 换代卸载 probe（`core/kernel-basis`，提供者设计前）；X-1、X-7 只在 A 或 D 重新上桌时才有用 |

## 理由与保留前提

**理由**（取自[提案推荐](../../proposals/tool-execution-runtime-baseline/alternatives.md#推荐与仍待区分的事项)，产品负责人未另述理由）：
A 与必要性质的冲突在 DSH jobs 的**契约签名**上（owner 是活体 Agent、`run()` 返回进程内钩子、进程内 id），改掉等于重写；
B 的强项是一种执行者的纪律，而运行时要的状态机、前后台、等待、帧、送达、多执行者全要新写，其恢复设计（`unknown`、恢复许可）与失去连续性落失败相反；
D 点名要取的两块各撞一条必要性质。C 是性质矩阵里唯一没有「冲突」格的路径。

**接受了的代价**：新写量最大、没有现成测试；提案原话「这是放弃了约 1300 行可 fork 的现成代码，换一份从零写的实现」。
产品负责人的「借鉴学习」限定就是为这笔代价设的——两源成熟的部分拿来避坑，不拿来当底座。

**保留前提：**

- **开包前提**：`core/storage` 协议**尚未被接受**，会话与 Run 的契约**尚不存在**。两者闭合之前，C 只能起草契约，**不能开包**（提案原话）。
- C 的「能」是**有前提地能**：`core/storage` 能表达同一行上的条件终态写；D-026「不提供 in-memory」不涵盖活体句柄（X-2，未决前按「持久事实全进存储，句柄丢了按停机处理」读）；Cordis 4.0.4 的 fiber 卸载语义（X-6，无 probe）。
- **会让 A 重新上桌的证据**、**会让 B 以执行者身份被复用的证据**沿用[提案](../../proposals/tool-execution-runtime-baseline/alternatives.md#推荐与仍待区分的事项)；翻盘要走**新决定**。

## 取代与影响

不取代任何决定。

| 受影响拥有者/消费者 | 应更新的引用、契约、地图或映射 | 所需产物/责任与闭合条件 |
|---|---|---|
| 工具执行运行时契约（`spec/`）与提供者节点（`realization/`） | 起草时以本决定为起点，回链本决定与提案 | **未起草、未建**；测试义务随之写入。起草、评审、接受各自另有记录 |
| [proposals 索引](../../proposals/README.md#当前主题) `tool-execution-runtime-baseline` 行 | 「候选／接受边界」改为已由本决定接受 | **已完成**（与本决定同批） |
| 提案[交接缺口](../../proposals/tool-execution-runtime-baseline/design.md#交接缺口)第一行：PF-012 §5.7 与 PF-006 §6.12 在据点整体停机下的收场张力 | 产品负责人同日另作了一条产品裁决（大意：agent runtime 恢复后在装配阶段追补「异常中断」的占位消息，由 agent 自决是否重调；前台与后台各一种追补方式；具体技术方案归会话与 agent runtime）。**它是产品正文修订，不在本决定接受范围** | 归 [PF-012](../../../product/PF-012-agent-loop-and-run/README.md) §5.7、[PF-006](../../../product/PF-006-tools-and-skills/README.md) §6.12、[PF-009](../../../product/PF-009-context-message-types/README.md)（占位消息原因）的下一次 rev；原话与读法以那几份正文的落字与 decisions 拍板记录为准。**未落字** |
| 提案交接缺口其余各行：D-026 活体句柄读法、执行账存放形态、「能否后台、多久自动转」的声明形状、`apps/cli` 进程分组 | 不变 | 声明形状的起点已由 [D-031](../tool-definition-baseline/README.md) 定为自研数据契约；其余各行 owner 照旧 |
| [`apps/cli` 架构](../../../realization/apps/cli/architecture.md#拓扑与进程模型)「前台每个运行一组进程」 | 不因本决定改动 | 等 X-4 结果 |

**明确不表示：**

- 任何契约被接受，或工具执行运行时契约、提供者设计已经存在；执行账的存放形态、执行者接口形状已定；
- 任何实现或测试已经存在；两源已知失败情形的测试义务已经写进任何契约或节点；
- X-1～X-7 任何一项已经做过；`core/storage` 协议已被接受；D-026 对活体句柄的读法已定；
- 同日关于据点停机收场的产品裁决已经落进产品正文——那是 PF-012／PF-006／PF-009 的事，不由本决定代记；
- 提案里的作者推荐构成接受——接受依据只有产品负责人的原话。

返回[本 topic 入口](README.md)。

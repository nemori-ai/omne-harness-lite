# 调度理论映射到「波式 map-reduce 交付」

**状态：调研材料。**本文是 [Map-Reduce 式交付推进](../README.md) 的依据，不是规则。标「未核」的结论使用前要复核。文中的「我们」指写作时采用这种交付做法的项目，文中的数值是当时的粗估或示例，不是阈值。

范围：把 DAG 调度、BSP、并发控制、幂等重试和合并队列的结论映射到我们的波式交付，给出可以从看板字段算出来的估算式。每条理论结论都带一手来源链接。标「未核」的只读到二手材料，或没有读到原文对应段落。标「推论」的是本文把理论用到我们场景时的推导，没有来源直接支持。

**一句话结论**：一波的时长下界是 `T_freeze + max_i L_i + S_last`，但我们实际受 `Σ S_j`（reduce 串行总量）约束。reduce 的串行量随线数线性增长，这比 Amdahl 假设的「固定串行段」更糟：加线有上限 `n* ≈ ρ·L/S`。所以首要杠杆是降低单卡 reduce 成本 `S` 和准入失败率 `p`（准入左移到线内），其次才是流水线化和批量合并。另外，「写范围不交」只排除写写冲突，不保证可串行化。我们的「输入过时」痛点就是快照隔离下的 write skew，补救办法是读集检查。

## 0. 记号与示例粗估

| 记号 | 含义 | 看板/产物取数 |
| --- | --- | --- |
| `n` | 本波卡数（线数） | 本波派发的卡 |
| `P` | 槽数，例：3 机 × 2 = 6 | 固定 |
| `L_i` | 第 i 条线从派发到交回的墙钟时长 | 卡进入进行中的时间 → PR 打开或交回评论的时间 |
| `r_i` | 交回时刻（reduce 的 release time） | PR 或交回评论的时间戳 |
| `S_j` | 第 j 张卡的 reduce 服务时长 = sync + `a_j`·admit + gate + accept | 准入日志起止、gate 评论、接受评论 |
| `a_j` | 该卡的准入运行次数（≥1） | 准入日志个数 |
| `p` | 单次准入失败率 | 失败次数 ÷ 准入运行次数 |
| `T_freeze` | 冻结基线与契约、写包、派发的时长 | 冻结开始 → 最后一张卡派发 |

**示例粗估（不是看板字段，取自一次收口的产物时间，只用来示范公式）**：6 份 gate 留言落在 86 分钟内，平均约 14–17 分钟/卡。准入日志约 10 份，对应约 7 张卡，`a ≈ 1.4`；其中 2 份是失败退出，`p ≈ 0.2`，若把重跑都算作上一次没过，`p ≈ 0.3`。下文示例取 `S̄ = 15 min`，`p = 0.25`。

## 1. DAG 调度

### 1.1 工作量—跨度界与 list scheduling

| 理论 | 结论 | 来源 |
| --- | --- | --- |
| Work–span（Brent） | `max(T_1/P, T_∞) ≤ T_P ≤ T_1/P + T_∞`。`T_1` 是总工作量（work），`T_∞` 是关键路径（critical path，span）长度 | [Brent 1974, JACM, doi:10.1145/321812.321815](https://doi.org/10.1145/321812.321815)（上界表述按教材通行形式，未核原文记号） |
| Graham list scheduling | 任何不让处理器在有就绪任务时空闲的列表调度，makespan ≤ `(2 − 1/m)·OPT`。同一文献给出调度异常（timing anomalies）：增加处理器、缩短任务或放松优先约束都**可能变长**（摘要明确写了增加处理器一种，另外两种按正文列举转述） | [Graham 1966, BSTJ 45:1563（全文扫描）](https://ia801900.us.archive.org/27/items/bstj45-9-1563/bstj45-9-1563_text.pdf) |
| HEFT | 按向上秩 `rank_u(i) = w̄_i + max_{j∈succ}(c̄_ij + rank_u(j))` 排序，每个任务放到最早完成时间（EFT）最小的处理器，允许插空 | [Topcuoglu, Hariri, Wu 2002, IEEE TPDS 13(3)](https://experts.arizona.edu/en/publications/performance-effective-and-low-complexity-task-scheduling-for-hete/)（公式按通行转述，未核原文） |
| CPOP | 用 `rank_u + rank_d` 找关键路径，把关键路径上的任务全放在使其总执行时间最小的**同一个**处理器 | 同上 [Marmara 记录](https://openaccess.marmara.edu.tr/entities/publication/feba5344-0457-405a-8cb2-1d26f8963e33/full) |

**映射**：卡对应 task，槽对应 processor，波间依赖对应边，冻结与写包的成本对应通信代价 `c_ij`。

- 波内的卡按构造互不依赖（拓扑分层后同层），所以 HEFT 的秩排序在波内**退化为按估计时长从长到短排**（LPT）。推论。
- 能迁移过来的是**处理器选择**。槽是异构的：机器不同，同机两线还争 CPU 和测试时间。HEFT 用 EFT 选处理器，对应「把重测试的线放到同机另一槽空闲或只跑轻活的机器」。CPOP 的「关键路径独占最优处理器」对应**最长的线独占一台机器**，这直接回应同机两线互挤超时的痛点。推论。
- Graham 异常提醒：同机加第二条线不保证缩短波时长，资源争用会把关键线拉长。

### 1.2 Amdahl、Gustafson 与我们的「串行段随 n 增长」

- Amdahl：串行比例为 `1−f` 时，`Speedup(N) = 1 / ((1−f) + f/N)`，上限是 `1/(1−f)`。[Amdahl 1967, AFIPS, doi:10.1145/1465482.1465560](https://doi.org/10.1145/1465482.1465560)（公式是后人归纳的通行形式，原文以论述为主，未核）
- Gustafson：问题规模随处理器增长时，`Scaled speedup = (s' + p'·N)/(s' + p') = N + (1−N)·s'`。前提是**串行段不随 N 增长**。[Gustafson 1988, CACM 31(5)（原文 PDF）](https://users.cs.utah.edu/~hari/teaching/paralg/Gustafson88.pdf)

我们的 reduce 是**逐卡串行**，串行量是 `n·S`，随并行度线性增长，Amdahl 和 Gustafson 的前提都不成立。设每卡线时长 `L`、reduce 时长 `S`，槽足够：

```
串行做 n 张：   n·(L + S)
波式做 n 张：   ≈ L + n·S              （reduce 在全部交回后才开始的最坏情况）
加速比：        n(L+S) / (L + nS)  →  (L+S)/S   （n → ∞）
```

示例：`L = 120 min`，`S = 15 min`，加速比上限是 9。`n = 6` 时加速比 `6·135/210 ≈ 3.9`，reduce 占波时长 `90/210 ≈ 43%`。推论。

### 1.3 reduce 的最优顺序（单机带释放时间）

reduce 是单机问题：卡在 `r_i` 到达，服务 `S_i`，要最小化最后完成时刻。按到达先后服务就是最优，完成时刻是：

```
C_reduce = max_k ( r_(k) + Σ_{j≥k} S_(j) )     （按 r 升序编号）
```

这是 `1|r_j|C_max` 的经典结论（按最早释放时间排序最优），见调度教材，例如 Pinedo《Scheduling: Theory, Algorithms, and Systems》（未核页码）。它说明两件事：reduce 能和 map 重叠，波时长的下界是 `max_i r_i + S_last`；只要早到的卡的 `Σ S` 超过晚到的卡的间隔，尾部就由 reduce 而不是最慢线决定。

## 2. BSP、straggler 与「不等慢线」

### 2.1 波就是 superstep

BSP 把计算分成 superstep：每步内各处理器只做本地计算，通信在步末批量完成，屏障之后才开始下一步。[Valiant 1990, CACM 33(8), doi:10.1145/79173.79181](https://doi.org/10.1145/79173.79181)；[MulticoreBSP 模型说明](https://multicorebsp.com/main/model/)。常见的步代价写成 `max_i w_i + g·h + l`（记号来自 BSP 文献的通行表述，未核原文）。

| BSP | 我们 |
| --- | --- |
| 本地计算 `w_i` | 线 i 的实施 `L_i` |
| 步内不通信 | 零通信，只在派发和交回两个时刻同步 |
| 批量通信 `g·h` | 交回 PR 和卡评论，加上 reduce 的 `Σ S` |
| 屏障 `l` | 新冻结头（下一波基线） |
| 屏障代价 | 空槽时间 `Σ_i (max_k L_k − L_i)` |

**尾部概率**：n 条线中至少一条落入慢尾（单线概率 `q`）的概率是 `1 − (1−q)^n`。Dean 与 Barroso 用这个式子说明扇出放大尾延迟：100 路扇出时 63% 的请求会碰到慢服务器。[Dean & Barroso 2013, CACM, doi:10.1145/2408776.2408794](https://doi.org/10.1145/2408776.2408794)（数字转引自[摘要](https://blog.acolyer.org/2015/01/15/the-tail-at-scale/)，未核原文）。我们 `n = 6`、`q = 0.15` 时，约 62% 的波会碰到至少一条慢线。

### 2.2 投机执行（speculative execution）

| 系统 | 规则 | 来源 |
| --- | --- | --- |
| MapReduce | 作业接近完成时，为仍在运行的任务起备份执行，谁先完成算谁；资源开销通常不超过几个百分点；关掉后排序作业**慢 44%** | [Dean & Ghemawat 2004, OSDI §3.6](https://static.googleusercontent.com/media/research.google.com/en//archive/mapreduce-osdi04.pdf) |
| LATE | 估计剩余时间 `(1 − progress)/progress_rate`，只给剩余时间最长的任务备份；备份上限约 10%，慢节点、慢任务阈值取第 25 百分位 | [Zaharia et al. 2008, OSDI](https://www.usenix.org/conference/osdi-08/improving-mapreduce-performance-heterogeneous-environments)（阈值取自作者报告幻灯片 [课程镜像](https://www.cs.purdue.edu/homes/bb/cs590/papers/osdi_late.pdf)，未核论文正文） |
| Mantri | 当 `t_rem > E(t_new) + Δ` 时 kill 并重启，最多 γ 次；当 `P(t_rem > t_new·(c+1)/c) > δ` 时复制，默认 `δ = 0.25`；作业末尾有空槽时，「作业完成时间的缩减大于启动时间」就更积极地复制，提取文本写作 `E(t_new − t_rem) > ρΔ`，默认 `ρ = 3`（式中符号按 PDF 提取文本，与文字说明的方向看似相反，原文排版未核）；作业完成时间降低 32% | [Ananthanarayanan et al. 2010, OSDI](https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Ananthanarayanan.pdf) |
| Dryad | 默认 stage manager 带启发式，发现比同伴慢的 vertex 就安排重复执行，作者说明类似 MapReduce 的备份任务；作业完成与输出处理隐含假设 vertex **确定性**执行，并指出允许非确定 vertex 会让容错「更有意思」 | [Isard et al. 2007, EuroSys](https://www.microsoft.com/en-us/research/wp-content/uploads/2007/03/eurosys07.pdf) |
| Spark | `spark.speculation` 默认关；某 stage 完成比例到 `quantile = 0.9` 后，比中位数慢 `multiplier = 3` 倍的任务才投机 | [Spark 配置文档](https://spark.apache.org/docs/latest/configuration.html) |

**映射**：对 agent 线，重派 attempt+1 的 `t_new` 是整条线重做（没有进度迁移），远大于 MapReduce 的单任务重跑。按 Mantri 规则，只有 `t_rem` 远大于一整条线的期望时长时才值得重派，所以实际只适用于**失联或卡死**，不适用于「稍慢」。推论。

### 2.3 不等慢线：SSP 的条件

Stale Synchronous Parallel 允许快的工作者读旧缓存继续前进，只要陈旧度不超过界 `s`，并证明了正确性。[Ho et al. 2013, NIPS](https://proceedings.neurips.cc/paper/4894-more-effective-distributed-ml-via-a-s)。这给「慢线跨波、下一波照常冻结」提供了理论形状，但正确性依赖更新可以交换合并。映射到我们，四个条件同时成立才可以不等：

1. 慢线的写范围与下一波所有线不相交（否则它变成下一波的写写冲突）。
2. 慢线基线到当前头之间的共享契约改动全部是增量非破坏的（单调，见 §3.3）。
3. 陈旧度 `s ≤ 1` 波。推论：超过 1 波时，契约漂移的累积不可控。
4. 慢线交回后在**当前头**上重新同步并重新准入，不能拿旧基线的准入结果入轨。

reduce 内做的 breaking 改动是非单调的协调点。跨越它的慢线必须变基并重新验证，或者作废重派。

**Backpressure（推论）**：零通信下 reduce 不能向线发「慢一点」的消息，唯一能施加 backpressure 的是派发者，信号是 reduce 队列长度而不是消息。规则：队列长度超过 `Q_max`（§6.2）时，派发者不再填补空出的槽，空槽先给准入让机器，直到队列回落。这对应看板的 WIP 上限：限制的是「已交回、未接受」的卡数，不只是在跑的线数。

## 3. 一致性与隔离

### 3.1 冻结头 = 快照隔离；写范围不交 ≠ 可串行化

快照隔离（SI）：事务读开始时刻的快照，提交时按 first-committer-wins 检查：若它的写与开始后已提交事务的写冲突就中止。**SI 允许 write skew（A5B）**：T1、T2 读同一组相关数据，各自写不相交的部分，都能提交，但违反两者之间的约束。[Berenson et al. 1995, SIGMOD（arXiv 版）](https://arxiv.org/abs/cs/0701157)

乐观并发控制（optimistic concurrency control，OCC）的验证（validation）条件：对与 Tj 时间重叠的已提交 Ti，要求 `WS(Ti) ∩ RS(Tj) = ∅`（另加写阶段先后条件），**检查的是读集与写集的交**，不是写集与写集。[Kung & Robinson 1981, TODS, doi:10.1145/319566.319567](https://doi.org/10.1145/319566.319567)（条件按通行转述，未核原文）

| 事务概念 | 我们 |
| --- | --- |
| 开始时间戳 / 快照 | 冻结头提交号 |
| 写集 WS | 线的写范围 |
| 读集 RS | 线依赖的契约、被 import 的包、引用的正文 |
| first-committer-wins | 写范围不交，所以永远不触发 |
| write skew | A 线假设 X 包的行为不变，B 线在自己的写范围内改了 X 的行为：两边都过准入，合起来坏 |

**推论**：「输入过时引起的分解错误」就是 write skew。补救是派发前同时声明读集，并检查 `WS(line_a) ∩ RS(line_b) = ∅`（同一波内两两检查）。读集可以从包依赖图机械取得（例如 turbo 的受影响包），不靠人记。

### 3.2 串行化顺序

- 读集与写集都不交时，任何顺序等价，可以按到达顺序（§1.3）。
- 有读写交叉时，顺序必须与「读自」关系一致：A 读了 B 将改的旧版本，A 要排在 B 之前合入，否则 A 的准入要基于 B 之后的头重跑。
- 风险排序（推论）：失败需要重派的卡，返工时长是一整条 `L`。把影响面大或失败概率高的卡**先** reduce，失败的返工能和其余卡的 reduce 重叠；放最后则返工整段落在关键路径上。这与痛点「风险最大的集成放在最后」方向相反。SubmitQueue 用逻辑回归预测构建成功概率来选投机构建（约 100 个特征，97% 准确率），说明按成功概率排序在工业中可行。[Ananthanarayanan et al. 2019, EuroSys（经 Colyer 摘要）](https://blog.acolyer.org/2019/04/18/keeping-master-green-at-scale/)，未核论文原文。

### 3.3 单调性：CALM 与 CRDT

- CALM：有一致且免协调的分布式实现的程序，恰好是能用单调逻辑表达的程序。[Hellerstein & Alvaro, arXiv:1901.01930（CACM 2020 版）](https://arxiv.org/abs/1901.01930)
- CRDT：状态构成半格、合并满足交换、结合、幂等时，副本无需协调就能收敛。[Shapiro et al. 2011, SSS / INRIA RR-7687](https://hal.sorbonne-universite.fr/inria-00609399v1)

**映射**：增量非破坏契约改动等价于只增集合（G-Set）上的并，单调，所以线之间不需要协调。breaking 改动非单调，必须有协调点，也就是 reduce 和波屏障。

**注意（推论）**：TypeScript 里「加东西」不一定单调。给判别联合加一个成员，会破坏做穷尽 switch 的消费者；给输入类型加必填字段，会破坏生产者。单调性要按型变位置定义：输出位置只增成员要检查消费者，输入位置只能加可选字段。准入应机械检查这一点，不靠「看起来是新增」。

## 4. 幂等、重试与空槽利用

| 问题 | 理论 | 映射 |
| --- | --- | --- |
| exactly-once | 端到端论证：可靠性只能在端点保证。底层至少一次交付，加上端点去重，实现效果上的恰好一次。[Saltzer, Reed, Clark 1984, TOCS, doi:10.1145/357401.357402](https://doi.org/10.1145/357401.357402) | 派发可以至少一次（attempt 可重派）。**接受**必须对 `(card, revision)` 幂等：同一 revision 只接受一个 attempt，其余交回作废 |
| 重复执行的输出 | MapReduce 依靠确定性算子加原子 rename，保证最终只留下一次执行的输出。[OSDI 2004 §3.3](https://static.googleusercontent.com/media/research.google.com/en//archive/mapreduce-osdi04.pdf) | LLM 输出**不确定**，两个 attempt 的结果不能合并，只能选一个。选择规则（先过准入者胜）要事先写定 |
| 失联检测 | Lease：有期限的授权，到期未续即失效，不需要对方确认。论文分析和实验认为短租期（约 10 秒，数字取自摘要，未核原文）就有效。[Gray & Cheriton 1989, SOSP](https://www.eecg.utoronto.ca/~yuan/teaching/gradOS/papers/89-leases.pdf)。MapReduce 的 master 定期 ping，超时就标为失败并重派 | 零通信不允许心跳消息，但可以**被动观测**线分支的推送时间作为心跳。租期取 `k × 中位线时长`。到期就派 attempt+1 |
| 迟到的旧 attempt | Fencing token：每次授权带单调递增编号，下游拒绝旧编号的写。[Kleppmann 2016](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)（未核全文） | attempt 编号就是 fencing token。reduce 只接受当前 attempt 的 PR |
| 空槽 | 随机 work stealing 的期望时间是 `T_1/P + O(T_∞)`。[Blumofe & Leiserson 1999, JACM, doi:10.1145/324133.324234](https://doi.org/10.1145/324133.324234)。MapReduce：任务数 M、R 应远大于机器数，以便动态负载均衡 | 线派发后不可分割、不可通信，所以无法窃取线内工作。可行的变体是**过量分解加拉取**：就绪卡多于槽，空槽从全局就绪队列拉下一张。条件是这张卡的依赖在当前冻结头已满足 |

## 5. 流水线化 reduce 与批量合并

### 5.1 流水线的上限

把 reduce 拆成 sync → admit → gate → accept 四段，稳态吞吐是 `1 / max(stage)`，单卡延迟仍是各段之和。准入独占机器 10–15 分钟，占 `S̄ ≈ 15` 的大部分，所以流水线化的收益上限约 `S̄ / t_admit ≈ 15/12 ≈ 1.25×`。推论：真正的杠杆是缩短 `t_admit` 或降低 `a_j`。

### 5.2 批量合并与剔除

| 系统 | 机制 | 来源 |
| --- | --- | --- |
| GitHub merge queue | 为队列中每个 PR 建临时分支，内容是目标分支加上它前面的全部 PR；build concurrency 取 1–100；有最小、最大组大小；检查失败或冲突的 PR 被移出队列，其余重建 | [GitHub 文档](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)；组大小默认值 1/5 只见于[二手博客](https://humanwhocodes.com/blog/2026/04/improving-developer-velocity-github-merge-queue)，未核 |
| bors-ng | 成批测试，批失败就一分为二重新入队，单个 PR 的批失败退回作者 | [bors-ng README](https://github.com/bors-ng/bors-ng) |
| Zuul 依赖流水线 | 假设前面的变更都会通过，并行测试每个变更加它前面的全部变更；中间一个失败就移除它，依赖它的变更去掉它重测 | [Zuul gating 文档](https://zuul-ci.org/docs/zuul/latest/gating.html) |
| SubmitQueue | 投机图并行构建，冲突分析器按构建目标判断两变更是否冲突，无冲突的变更可并行提交；16 个可能冲突的并发变更约有 40% 概率出问题 | [Colyer 摘要](https://blog.acolyer.org/2019/04/18/keeping-master-green-at-scale/)，未核原文 |
| 理念源头 | 「Not Rocket Science Rule」：自动维护一个永远通过全部测试的仓库 | [Graydon Hoare 博文](https://graydon2.dreamwidth.org/1597.html)，未核（页面要求验证码） |

**批量的账（推论，二分剔除的简化模型）**：批大小 `b`，单卡失败率 `p`，整批通过概率 `(1−p)^b`。

| `p` | `b=2` 通过率 | `b=3` 通过率 | `b=4` 通过率 |
| --- | --- | --- | --- |
| 0.05 | 0.90 | 0.86 | 0.81 |
| 0.25 | 0.56 | 0.42 | 0.32 |

批量只在 `b·p ≪ 1` 时划算。我们粗估 `p ≈ 0.2–0.3`，此时批量多半失败并触发二分，比单卡更慢。所以顺序应该是：先把准入**左移**到线内（线在冻结头上跑同一套准入后再交回），让 reduce 的准入只是确认，`p` 降到 0.05 量级，再开 `b = 2–3` 的批。

### 5.3 多 reduce 分片与 RI 扇入

按受影响包（读集加写集）把卡分成互不相交的轨道，每条轨道一个 reduce，最后 RI 扇入。正确性条件和 §3.1 相同：轨道之间读写集都不交。代价是跨轨道的集成只在 RI 才被测试，又回到「风险最大的集成放在最后」。缓解办法是借用 Zuul 和 SubmitQueue 的投机：轨道 reduce 进行时，就在空闲机器上提前构建「当前各轨道头的合并」，问题早暴露。推论。

## 6. 对我们怎么用、量什么

### 6.1 波时长估算

```
r_i      = t_dispatch_i + L_i
S_j      = t_sync + a_j·t_admit + t_gate + t_accept
T_wave   = T_freeze + C_reduce,   C_reduce = max_k ( r_(k) + Σ_{j≥k} S_(j) ) − t_dispatch_0
下界     T_wave ≥ T_freeze + max( max_i L_i + S_last ,  min_i L_i + Σ_j S_j )
reduce 占比  f = Σ_j S_j / (T_wave − T_freeze)
```

示例：`L_max = 120`，`L_min = 60`，`n = 6`，`S̄ = 15`。两个下界分别是 135 和 150，所以本波受 reduce 约束，`T_wave ≥ T_freeze + 150 min`。在这个下界处 `f = 90/150 = 60%`；尾部等待让 `T_wave` 更长时，`ΣS` 不变，`f` 反而更低。所以 `f` 低不一定是好事，要和空槽时间一起看。

### 6.2 阈值与上限

| 量 | 推荐值 | 依据 |
| --- | --- | --- |
| reduce 利用率 `ρ = λ·S̄`（λ 为交回到达率） | ≤ 0.7–0.8 | Kingman 重载近似：排队等待 `≈ (ρ/(1−ρ))·((c_a²+c_s²)/2)·S̄`，ρ 从 0.5 到 0.8 等待增至 4 倍，0.9 时 9 倍。[Kingman 1961, doi:10.1017/S0305004100036094](https://doi.org/10.1017/S0305004100036094)（近似式按 Hopp & Spearman《Factory Physics》的 VUT 形式，未核页码） |
| 每波卡数 `n` | `n ≤ ρ_target · L_max / S̄` | 推论：reduce 要在 map 期内消化完到达。`0.75 × 120 / 15 = 6`，恰好等于槽数 |
| reduce 队列 WIP | `Q ≤ W_target / S̄` | Little 定律 `L = λW`。[Little 1961, Oper. Res., doi:10.1287/opre.9.3.383](https://doi.org/10.1287/opre.9.3.383)。要求交回到接受 ≤ 60 分钟时，`Q ≤ 4` |
| map WIP | 每机至多 1 条重测试线，另一槽给轻活 | Graham 异常加同机争用；CPOP 的独占思想 |
| 就绪卡储备 | 槽数的 1.5–2 倍 | MapReduce「任务数远大于机器数」；推论给出倍数 |
| 投机重派 | 每波至多 1 次；只在租约过期，或线时长 ≥ 3× 中位且本波 ≥ 90% 已交回时 | LATE 约 10% 上限，Spark 的 3× 与 0.9 默认值，Mantri 的 `t_new` 代价 |
| 准入失败率 `p` | 开批量前 ≤ 0.05 | §5.2 的表 |

### 6.3 要量的指标

`L_i` 的分布（中位与 P90），`S_j` 分解到四段，`a_j` 与 `p`，每波 `f` 与 `ρ`，空槽时间 `Σ(max L − L_i)`，以及「分解错误」次数：合并冲突（写写）和读写交叉（write skew）分开记。

### 6.4 在我们这里不成立的理论前提

| 理论前提 | 实际情况 | 影响 |
| --- | --- | --- |
| 任务时长已知（HEFT、CPOP） | LLM 线时长方差大，事前只有估计 | 秩排序只能用估计，交回后要回填校准 |
| 处理器同构（Graham 界） | 机器不同，同机争用 | `(2 − 1/m)` 界只能当参考 |
| 串行段固定（Gustafson） | reduce 串行量 `∝ n` | 加线有上限 `n*` |
| 任务确定、可幂等重跑（MapReduce） | LLM 输出不确定，重派代价是整条线加 token | 投机只用于失联；接受按 revision 去重 |
| 写集不交即可串行化 | SI 允许 write skew | 需要读集检查 |
| 「新增」即单调 | TS 型变使部分新增变成破坏 | 准入机械检查型变位置 |
| 合并队列的低失败率 | `p ≈ 0.2–0.3`（粗估） | 先左移准入，再批量 |
| 可用心跳检测失联 | 零通信 | 用分支推送时间被动观测 |
| BSP 步内无通信 | 按设计成立 | 这是我们与理论最贴合的一点 |

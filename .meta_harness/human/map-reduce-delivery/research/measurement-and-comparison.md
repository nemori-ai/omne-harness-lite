# 交付度量与跨里程碑对比：调研

**状态：调研材料。**本文是 [Map-Reduce 式交付推进](../README.md) 的依据，不是规则。标「未核」的结论使用前要复核。文中的「我们」指写作时采用这种交付做法的项目，文中的数值是当时的粗估或示例，不是阈值。

日期：2026-10-26。范围：给「人 + 多 coding agent、按里程碑与波 map-reduce 交付」设计一套度量和跨里程碑对比机制。

来源分级：**一手**指标准制定者、论文或作者原文。**二手**指转述或厂商材料，结论后标「二手」。没有拿到原文核对的，标「未核」。

**一句话结论**：每个里程碑只有十几张卡，样本太小，做不了显著性检验，也做不了正式的 ITS 或 DiD。可行的做法分四步。第一，把卡级事实接成一条跨里程碑的连续序列，用 XmR 图找信号。第二，用效应量和 bootstrap 区间比较两个里程碑。第三，方案变更前写下事前假设。第四，用不受本次变更影响的 Kind 或 Line 做对照序列。做到这四步，才能把回归归因到某项方案调整。

---

## 1. 交付度量体系

### 1.1 DORA 的演变

| 年份 | 变化 | 来源 |
| --- | --- | --- |
| 2015 | 把指标分成 throughput（部署频率、lead time）与 stability（恢复时间、change fail rate） | [DORA metrics history](https://dora.dev/guides/dora-metrics/history/) |
| 2023 | MTTR 改名为 failed deployment recovery time，只算生产变更引起的故障 | 同上 |
| 2024 | 新增 **deployment rework rate**，四键变成五个指标。分为 **Throughput** 因子（change lead time、deployment frequency、failed deployment recovery time）和 **Instability** 因子（change fail rate、rework rate） | 同上；[DORA metrics guide](https://dora.dev/guides/dora-metrics/) |
| 2024 报告 | AI 采用提高个人 productivity、flow 和满意度，但「negatively impacts software delivery stability and throughput」。常被引用的模型估计是「AI 采用增加 25%，吞吐约降 1.5%，稳定性约降 7.2%」，这组数字为二手且未核 | [DORA 2024 页](https://dora.dev/research/2024/dora-report/)；[InfoQ](https://www.infoq.com/news/2024/11/2024-dora-report/)（二手） |
| 2025 报告 | 「Unlike last year, we observe a positive relationship between AI adoption on both software delivery throughput and product performance」；同时「AI adoption does continue to have a negative relationship with software delivery stability」。核心论点是 AI 作为 amplifier：变更量上升以后，没有自动测试、版本控制和快速反馈这些控制系统，就会出现不稳定 | [Google Cloud 2025 公告](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report)；[DORA 2025 页](https://dora.dev/research/2025/dora-report/) |
| 2025 AI Capabilities Model | 七项能力：Clear and communicated AI stance、Healthy data ecosystems、AI-accessible internal data、Strong version control practices、Working in small batches、User-centric focus、Quality internal platforms | [Google Cloud 博客](https://cloud.google.com/blog/products/ai-machine-learning/introducing-doras-inaugural-ai-capabilities-model) |

还有一项对照证据。METR 2025 做了 RCT：16 名资深开源开发者完成 246 个任务，允许用 AI 时耗时约多 19%，而开发者自己估计快了约 20%。这说明自评感受不能代替实测。以上数字据多方转述一致，未逐字核对原文（[METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)）。

DORA 指南自己的告诫：指标适用于单个应用或服务。不要把指标设为目标（会被博弈），不要跨团队比较。应同时看多个「彼此有张力」的指标（[DORA metrics guide](https://dora.dev/guides/dora-metrics/)）。

### 1.2 其他框架与粒度适用性

| 指标或框架 | 定义（原文） | 卡 | 波 | 里程碑 | 来源 |
| --- | --- | --- | --- | --- | --- |
| **SPACE** | 五维：Satisfaction and well-being、Performance、Activity、Communication and collaboration、Efficiency and flow；不用单一指标衡量生产力。「至少取三个维度」的说法未核 | – | ○ | ● | [Microsoft Research](https://www.microsoft.com/en-us/research/?p=733804)；ACM Queue 原文 403，未核 |
| **Cycle Time** | 「elapsed time between when a work item started and when a work item finished」 | ● | 分布 | 分布 | [Kanban Guide](https://kanbanguides.org/english/) |
| **Work Item Age** | 「elapsed time between when a work item started and the current date」，是在途卡的领先指标 | ● | ● | – | 同上 |
| **WIP** | 「number of work items started but not finished」 | – | ● | – | 同上 |
| **Throughput** | 「number of work items finished per unit of time」 | – | ● | ● | 同上 |
| **Flow efficiency** | 主动工作时间 ÷ 总 lead time。未关注 flow 的团队约 5–15%（转述 Vacanti，二手） | ● | 汇总 | 汇总 | [Businessmap](https://businessmap.io/blog/how-to-measure-the-flow-efficiency-of-a-process-on-a-kanban-board)（二手） |
| **Rework rate / 首次通过率** | DORA 的 rework rate 以部署为单位。在我们这里改成「卡被退回修复的比例」与「一次通过准入或评审的比例」 | ● | 比例 | 比例 | 定义改编自 [DORA](https://dora.dev/guides/dora-metrics/) |
| **评审往返次数** | Google 的研究用评审延迟和变更规模描述评审流（中位端到端延迟低于 4 小时）。轮次分布未核 | ● | 分布 | 分布 | Sadowski et al. ICSE 2018（转述见 [Graphite](https://graphite.com/blog/how-google-does-code-review)，二手） |

图例：● 直接适用；○ 作为上下文或汇总适用；– 不适用。

粒度原则：**卡**用于事实与分布（时长、轮次、返工），**波**用于流量与并行度（WIP、吞吐、集成排队），**里程碑**用于结果与对比（中位数、比例、效应量）。DORA 的部署类指标没有生产部署可以对应。在这里只保留其思想：Throughput 对 Instability，用「吞吐 vs 返工」成对来读。

---

## 2. 判断改善与回归的统计方法

| 方法 | 做法 | 我们的样本能否支撑 | 来源 |
| --- | --- | --- | --- |
| **XmR（process behavior chart）** | X 图限 = 均值 ± 2.66 × 平均移动极差；mR 图上限 = 3.268 × 平均移动极差。不要用标准差算限。信号规则通常为：单点出限；连续 8 点在中线同侧；4 点中 3 点靠近同一限（规则表述二手，未核 Wheeler 原文） | **卡级可以**：把上一里程碑与本里程碑的卡按 Accepted at 排成一条序列，在方案切换处画分段线。5–6 点可得试用限（二手，未核），15–30 点更稳。**波级不行**（每里程碑只有 2–4 点） | [JMP 社区](https://community.jmp.com/message/231006)（二手）；[Holistics](https://docs.holistics.io/docs/charts/custom-charts/library/control-chart)（二手）；[NHSRplotthedots](https://cloud.r-project.org/web/packages/NHSRplotthedots/vignettes/number-of-points-required.html)（二手） |
| **Monte Carlo 预测** | 从历史吞吐或 cycle time 中重复抽样，给出「N 张卡 85% 概率在某日前完成」这类概率预测 | 可以：每波按上一里程碑的历史抽样，预测本里程碑工期，事后对照实际 | [55degrees 文档](https://55degrees.atlassian.net/wiki/spaces/AAS/pages/2405826697/Monte+Carlo+When)（二手）；Vacanti 原书未核 |
| **Reference class forecasting** | 三步：选参考类；建立该类的结果分布；把本项目放进分布读出结果 | 可以：以上一里程碑同 Kind 的卡为参考类，估计本里程碑卡的 Cycle days | [Flyvbjerg（arXiv）](https://arxiv.org/pdf/1303.7400) |
| **Interrupted time series** | 分段回归。**事前**指定影响模型，不按数据挑模型。主要威胁是时变混杂与同期共干预。可加不受干预影响的对照序列（controlled ITS）。没有固定的最少点数，但「few time points…should be interpreted with caution」 | 正式 ITS 不行；**借用其纪律**：事前登记假设、对照序列、记录共干预 | [Bernal et al. 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5407170/) |
| **Difference-in-differences** | 处理组的变化减去对照组的变化。依赖 parallel trends 假设，而事前趋势检验功效低，拿来筛选反而引入偏差 | 只能做描述性 DiD：对照组为方案变更不触及的 Kind 或 Line。不下因果结论 | [Bilinski & Hatfield（arXiv）](https://arxiv.org/abs/1805.03273) |
| **效应量而非显著性** | SE 实证中常用 Mann-Whitney U 配合 Vargha-Delaney Â12，Â12 表示「A 优于 B 的概率」 | **主力方法**：对两个里程碑的卡级分布报告中位数差、Â12（或 Cliff's δ）与 bootstrap 95% 区间。不报 p 值 | [Arcuri & Briand ICSE 2011](https://2011.icse-conferences.org/content/practical-guide-using-statistical-tests-assess-randomized-algorithms-software-engineering.html)（「≥1000 次运行」为二手，未核） |

**小样本下的判断纪律**（综合上表）：

1. 只有同时满足三条，才判为「改善」或「回归」：XmR 出现信号；效应量区间不跨 0.5（Â12）；方向与事前假设一致。
2. 只满足一两条，记为「迹象」，继续观察下一里程碑。
3. cycle time 分布右偏，报中位数和 P85，不报均值（Kanban 实践通用做法，未核到一手出处）。
4. 有效性按 Wohlin 的四类威胁逐条写进报告：conclusion、internal、construct、external（转述见 [arXiv 1809.01940](https://arxiv.org/pdf/1809.01940)；原书未核）。我们的情形更接近 case study，报告结构可参照 [Runeson & Höst 2009](https://www.cse.chalmers.se/~feldt/advice/runeson_2009_emse_case_study_guidelines.pdf)。该文也承认最低要求要按情境判断。

---

## 3. 跨里程碑对比机制

| 成熟做法 | 借用的部分 | 来源 |
| --- | --- | --- |
| DORA Core Model（capabilities → delivery performance → outcomes） | 把「方案」看成 capability 集合，把指标看成 outcome。每项方案调整都要说明它预期推动哪个 outcome | [DORA research](https://dora.dev/research/) |
| Improvement kata | 四步：understand the direction、grasp the current condition、establish the next target condition、experiment toward it。用来定义「里程碑 = 一次实验」 | [TechTarget](https://www.techtarget.com/whatis/definition/improvement-kata)（二手）；Rother 2009 原书未核 |
| ITS 的事前登记与共干预记录 | 「方案调整」本身登记为变量：带版本号、日期、预期方向 | [Bernal et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC5407170/) |
| Wohlin / Runeson 的最小要求 | 写清研究问题、事前假设、度量定义、威胁 | 见第 2 节 |

**机制设计**：

- **三张档案表**，每个里程碑一份，带版本号存档：
  - `cards.csv`：每卡一行，只放事实。
  - `waves.csv`：每波一行，由 cards 派生。
  - `milestone.csv`：每里程碑一行，由前两张派生。
  - 只有一个计算脚本负责派生。脚本与指标定义一起版本化。改了定义，就对历史里程碑重算。
- **方案版本登记表** `plan-changes.csv`：一行记一项调整，字段为 `plan_version`（每个里程碑一个代号，例如本里程碑为 A、下一里程碑为 B）、`change_id`、生效日期、作用范围（哪些 Line/Kind/Wave）、预期影响的指标与方向、理由。每张卡挂 `plan_version`。作用范围之外的卡自动成为该项调整的对照组。
- **一次只动少数变量**。同一里程碑里若有多项调整作用于同一指标，就把它们记为共干预，结论只能归因到这组调整的整体。

---

## 4. 质量与交付的平衡：门还是观察

Goodhart（1975）的原意是：统计规律一旦用于控制，就趋于失效。Campbell（1969 起）说：量化社会指标越多地用于决策，越容易被腐蚀。通行的表述「when a measure becomes a target, it ceases to be a good measure」见于 Strathern 1997，是她本人的话还是转述 Hoskins，各来源说法不一（[Wikipedia 汇总](https://en.wikipedia.org/wiki/Goodhart%27s_law)，二手）。DORA 指南也明确引用了 Goodhart（[DORA](https://dora.dev/guides/dora-metrics/)）。

| 适合当门（二值、可机检、难博弈） | 只适合观察（设成目标会扭曲行为） |
| --- | --- |
| 依赖规则检查、差分变异阈值、覆盖率阈值、圈复杂度与 CRAP 阈值。前提是它们已作为机检二值判定（各项现在是否已在 `make check` 或评审子代理中设门，本文未核，以仓库为准；未设门的建议升门） | Cycle days、修复轮次数、评审发现密度、token 成本、吞吐 |
| 准入通过与否 | 首次通过率（设成目标，会诱导人少报问题或少评审） |

观察指标必须**成对**来读：吞吐对返工率，Cycle days 对评审发现密度，token 成本对首次通过率。这对应 DORA 的「metrics with tension」原则。

---

## 5. agent 特有的度量

| 指标 | 现成定义 | 来源 |
| --- | --- | --- |
| token / 美元成本 | 有。评估 agent 应联合报告成本与准确率，取 cost–accuracy 的 Pareto frontier。复杂 agent 成本最高可达基线的 50 倍，准确率却不更好 | [Kapoor et al. 2024](https://arxiv.org/abs/2407.01502v1) |
| 利用率、影响、成本 | 有，但是厂商框架。DX AI Measurement Framework 分 utilization、impact、cost 三维，含「分派给 agent 的任务数」 | [DX](https://getdx.com/research/measuring-ai-code-assistants-and-agents/)（厂商） |
| agent PR 接受率 | 有，但各研究的定义与过滤口径不一。有研究提醒：短期接受率可能掩盖长期维护负担 | [AIDev 系列](https://arxiv.org/html/2601.15195v1)；[arXiv 2602.02345](https://arxiv.org/html/2602.02345v1) |
| churn、重复代码 | 有，但是厂商数据。GitClear 报告复制粘贴行在 2024 年首次超过移动（重构）行。具体数字为二手，未核 | [LeadDev](https://leaddev.com/software-quality/how-ai-generated-code-accelerates-technical-debt)（二手） |
| 修复轮次数、评审发现密度、分解错误（冲突或越界）计数、上下文包陈旧导致的返工、人裁决等待时间 | **文献中没有找到现成定义**。下表的定义为本项目自拟 | – |

---

## 6. 对我们怎么用、量什么

### 6.1 最小可行指标表

| 指标 | 粒度 | 来源字段或日志 | 计算方法 | 门/观察 |
| --- | --- | --- | --- | --- |
| Cycle days | 卡 → 里程碑 | `Dispatched at`、`Accepted at`（已有 `Cycle days`） | 卡值；里程碑报中位数与 P85、XmR、Â12 | 观察 |
| 实施时长 / 集成等待 | 卡 | `Dispatched at → Delivered at`；`Delivered at → Accepted at`；Status=Integrating 的停留时长 | 拆分 Cycle days，定位 reduce 瓶颈 | 观察 |
| 吞吐 | 波、里程碑 | 按 `Wave` 统计 `Accepted at` 计数 | 张/波、张/工作日 | 观察 |
| WIP 峰值、在途卡龄 | 波 | 卡在 Status 上的时间区间 | 同时在途数；Work Item Age 超过参考类 P85 时预警 | 观察 |
| 首次通过率 | 卡 → 里程碑 | 准入日志、`修复轮次数` | 修复轮次 = 0 的比例 | 观察 |
| 修复轮次 | 卡 | `修复轮次数` | 分布，按 `Kind` 分层 | 观察 |
| 评审发现密度 | 卡 | 评审报告的发现条目 ÷ PR 改动行（千行） | 按严重级分层 | 观察 |
| 返工率（按原因） | 卡 → 里程碑 | **新增** `rework_cause` | 各原因占比：规格缺陷、分解越界或冲突、上下文包陈旧、评审发现、环境 | 观察 |
| 分解错误数 | 波 | **新增** 冲突或越界事件（reduce 节点记录） | 次数/波、占卡比 | 观察 |
| 人裁决等待 | 卡 | **新增** `decision_requested_at`、`decided_at`（现在只有 `Needs decision` 标志） | 等待时长中位数；占 Cycle days 比例 | 观察 |
| token / 成本 | 卡 | **新增** `tokens_in/out`、`cost_usd`（按角色与模型） | 每张接受卡的成本；与首次通过率成对看 | 观察 |
| 结构度量 | 卡 | CC、CRAP 读数 | 超阈值即失败；里程碑报超阈值函数数的变化 | **门**（阈值）+ 观察（趋势） |
| 差分变异 | 卡 | 差分变异报告 | 存活率阈值 | **门** |
| 覆盖率 | 卡 | 覆盖率报告 | 阈值 | **门** |
| 依赖规则 | 卡 | 依赖检查 | 违规数 = 0 | **门** |
| （注）上面四行标「门」，指它们适合当门；现在是否已设门未核，见第 4 节 | | | | |
| 测试运行稳定性 | 里程碑 | 测试账本 JSONL | 重跑率、失败后通过（flaky）率、门耗时中位数 | 观察 |
| 预测偏差 | 里程碑 | Monte Carlo 预测（事前存档）对比实际 | 实际完成日落在第几个百分位 | 观察 |

### 6.2 里程碑对比报告骨架

1. **目标与方向**（kata：direction）：本里程碑要推动哪些 outcome。
2. **方案版本与变更清单**：引用 `plan-changes.csv` 中的每项调整及其作用范围，并列出共干预。
3. **事前假设**：在里程碑开工前写下并冻结，例如「调整 X 使 Line 内修复轮次中位数下降，对照组不变」。
4. **卡级读数**：跨里程碑的连续 XmR 图（Cycle days、修复轮次），在方案切换处画分段线；中位数、P85、Â12 与 bootstrap 区间。
5. **对照序列**：作用范围外的卡做同样读数，算描述性 DiD。
6. **质量侧**：门的通过记录；结构、变异、覆盖的趋势；返工原因占比。
7. **判定**：每项调整判为「改善 / 回归 / 迹象 / 无变化」，并附第 2 节的三条判据。
8. **有效性威胁**：按 conclusion、internal、construct、external 四类写。
9. **下一里程碑的 target condition 与方案调整**：写进下一版 `plan-changes.csv`。

### 6.3 本里程碑必须开始记录的字段（否则下一里程碑无法对比）

| 字段 | 位置 | 原因 |
| --- | --- | --- |
| `plan_version`、`change_id` 列表 | 卡 | 归因的前提，也用来划分对照组 |
| `plan-changes.csv`（含作用范围、预期方向、生效日期） | 里程碑档案 | 让「方案调整」成为登记的变量；记录共干预 |
| 事前假设与 Monte Carlo 预测（开工前存档） | 里程碑档案 | 防止事后挑模型（Bernal et al. 的事前原则） |
| `decision_requested_at`、`decided_at` | 卡 | 没有它们，算不出人裁决等待 |
| `rework_cause`（每轮修复一条） | 卡 | 区分「上下文包陈旧」「分解越界」「规格缺陷」 |
| `tokens_in/out`、`cost_usd`（按角色与模型） | 卡 | 成本与质量成对读 |
| Status 变更时间戳（含进入和离开 Integrating） | 卡 | 拆出集成等待，并算 WIP 与卡龄 |
| 冲突或越界事件日志 | 波 | 分解错误计数 |
| 评审发现条目（含严重级）与 PR 改动行数 | 卡 | 算评审发现密度 |
| 指标定义版本号 | 脚本 | 定义一变，就对历史重算，保证可比 |

另外要补一份上一里程碑的回填：从已有的 Dispatched/Delivered/Accepted 时间、修复轮次和评审报告回填上一里程碑的 `cards.csv`，作为 XmR 的基线段与参考类。回填不出来的字段标为缺失，不要估填。

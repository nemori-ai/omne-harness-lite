> **归档说明（2026-09-29）**：本文件是并行调研中一路子代理的报告原貌，**是模型输出，不是证据**。
> 主会话复核过哪些来源，见 [证据记录](../../../evidence.md)；文中的 scratchpad 路径是当时的临时目录，已不存在，
> 其中的计算脚本归档在 `sources/probe/subagent-calc/`。正文自归档起冻结，不再回改。

# 学术与统计文献取证：检验《Automating eval design and hillclimbing with Claude》C1–C6 的成立条件

- 调查日期：2026-09-29
- 来源域：学术论文与统计方法文献（不含工程工具文档、厂商博客；厂商研究院发表的论文单独标注立场）
- 性质：只做事实调查与计算，不给设计建议或方案取舍
- 博客原文：按分工**未读**。下文对 C1–C6 的复述以派发方提供的描述为准

---

## 0. 方法与标注约定

1. **取得方式**
   - 「一手原文」：从 arXiv / ACL Anthology / JMLR / NeurIPS Proceedings 下载 PDF 全文，用 `pypdf` 抽成文本后阅读，并从抽取文本逐字摘录。多数论文只精读了摘要、引言和所引章节，未逐页通读，每条会写明精读范围。
   - 「仅摘要」：只看到搜索结果摘要或元数据，没有打开全文。
2. **引文处理**：PDF 抽取会把 fi/ff 变成连字符号，行末单词也会被断开。引文里这两类都已还原，其余逐字照抄；章节号按原文。
3. **会议/期刊信息**：只写在 PDF 页眉、arXiv 页 Comments/Journal-ref 字段或检索结果里核对到的。没核对到的写「正式发表信息未核对」。
4. **「本人计算」「本人推断」**：凡属于我自己的计算或推断都显式标注，不是任何来源的结论。计算脚本在 `scratchpad/calc/`（`stats.py`、`paired.py`、`adaptive_sim.py`）。
5. **情境基准**：条目中「与本情境的差异」一栏里的「本情境」统一指：用 LLM 代理在 30–几百条用例上爬山，每轮一个 patch，跑二三十轮，每轮用 test 分数决定保留还是回退，最后选 test 上最好的版本，并报告 test 上的置信区间。

---

## 1. 来源总览

共 **49** 条来源，全部为一手原文（抓到全文 PDF）。其中 3 条的正式发表信息来自 arXiv 页或检索结果（元数据），正文均读自 PDF。

| 编号 | 来源（年份） | 立场 | 主要对应 | 取得 |
|---|---|---|---|---|
| A1 | Dwork et al., Generalization in Adaptive Data Analysis and Holdout Reuse (2015) | 独立学术（理论，作者含多家企业研究院） | C2 | 一手原文 |
| A2 | Blum & Hardt, The Ladder (2015) | 独立学术 | C2, C6 | 一手原文 |
| A3 | Hardt, Climbing a shaky ladder (2017) | 独立学术 | C2 | 一手原文 |
| A4 | Mania et al., Model Similarity Mitigates Test Set Overuse (2019) | 独立学术 | C2 | 一手原文 |
| A5 | Recht et al., Do ImageNet Classifiers Generalize to ImageNet? (2019) | 独立学术 | C2 | 一手原文 |
| A6 | Engstrom et al., Identifying Statistical Bias in Dataset Replication (2020) | 独立学术 | C2 | 一手原文 |
| A7 | Roelofs et al., A Meta-Analysis of Overfitting in Machine Learning (2019) | 独立学术 | C2 | 一手原文 |
| A8 | Cawley & Talbot, On Over-fitting in Model Selection and Subsequent Selection Bias (2010) | 独立学术 | C2 | 一手原文 |
| A9 | Gorman & Bedrick, We need to talk about standard splits (2019) | 独立学术 | C2 | 一手原文 |
| A10 | Søgaard et al., We Need to Talk About Random Splits (2021) | 行业研究（Google Research） | C2, C5 | 一手原文 |
| A11 | Kapoor et al., AI Agents That Matter (2024) | 独立学术 | C2, C5 | 一手原文 |
| A12 | Singh et al., The Leaderboard Illusion (2025) | 厂商研究（Cohere 主导） | C2 | 一手原文 |
| A13 | Bertran, Roth & Wu, What Fits (Into Few Tokens) Doesn't Overfit (2026) | 厂商研究（Amazon Responsible AI，作者兼任大学教职） | C2（反面） | 一手原文 |
| A14 | Akinwande et al., Understanding prompt engineering may not require rethinking generalization (2023) | 独立学术（含 Bosch 合作者） | C2（反面） | 一手原文 |
| A15 | Madras et al., Prompts Generalize with Low Data (2025) | 厂商研究（Google DeepMind） | C2 | 一手原文 |
| B1 | Phang et al., Adversarially Constructed Evaluation Sets Are More Challenging, but May Not Be Fair (2021) | 独立学术 | C1 | 一手原文 |
| B2 | Bowman & Dahl, What Will it Take to Fix Benchmarking in NLU? (2021) | 学术+行业研究（NYU、Google） | C1, C3, C5 | 一手原文 |
| B3 | Zellers et al., HellaSwag (2019) | 独立学术 | C1（反面） | 一手原文 |
| B4 | Kiela et al., Dynabench (2021) | 行业研究为主（Facebook AI Research 等） | C1（反面/限定） | 一手原文 |
| B5 | Bartolo et al., Beat the AI (2020) | 独立学术 | C1（反面/限定） | 一手原文 |
| B6 | Kaushik et al., On the Efficacy of Adversarial Data Collection for QA (2021) | 学术+行业研究（CMU、FAIR） | C1, C5 | 一手原文 |
| B7 | Vania et al., Comparing Test Sets with Item Response Theory (2021) | 独立学术（含 Amazon/AI2 作者） | C1, C5 | 一手原文 |
| B8 | Polo et al., tinyBenchmarks (2024) | 学术+行业研究（Michigan、IBM） | C1, C3（反面） | 一手原文 |
| B9 | Northcutt et al., Pervasive Label Errors in Test Sets (2021) | 学术+企业（MIT、Cleanlab、AWS） | C1, C4 | 一手原文 |
| S1 | Miller, Adding Error Bars to Evals (2024) | **厂商研究（Anthropic，与所检验博客同一厂商）** | C3, C6 | 一手原文 |
| S2 | Bowyer, Aitchison & Ivanova, Don't Use the CLT in LLM Evals… (2025) | 独立学术 | C3, C6 | 一手原文 |
| S3 | Card et al., With Little Power Comes Great Responsibility (2020) | 独立学术 | C3, C6 | 一手原文 |
| S4 | Dror et al., The Hitchhiker's Guide to Testing Statistical Significance in NLP (2018) | 独立学术 | C3 | 一手原文 |
| S5 | Madaan et al., Quantifying Variance in Evaluation Benchmarks (2024) | 厂商研究（Meta GenAI 主导） | C3, C5, C6 | 一手原文 |
| S6 | Heineman et al., Signal and Noise (2025) | 非营利研究机构（AI2，同时是开源模型开发方） | C5, C6 | 一手原文 |
| S7 | Schaeffer et al., Are Emergent Abilities of LLMs a Mirage? (2023) | 独立学术 | C3, C5 | 一手原文 |
| J1 | Zheng et al., Judging LLM-as-a-Judge (2023) | 独立学术（LMSYS） | C4 | 一手原文 |
| J2 | Wang et al., Large Language Models are not Fair Evaluators (2023) | 学术+厂商（北大、港大、腾讯云） | C4 | 一手原文 |
| J3 | Shi et al., Judging the Judges: A Systematic Study of Position Bias (2024/2025) | 独立学术 | C4 | 一手原文 |
| J4 | Panickssery, Bowman & Feng, LLM Evaluators Recognize and Favor Their Own Generations (2024) | 学术为主，**作者之一署 Anthropic** | C4 | 一手原文 |
| J5 | Wataoka et al., Self-Preference Bias in LLM-as-a-Judge (2024) | 厂商研究（SB Intuitions） | C4 | 一手原文 |
| J6 | Li et al., Preference Leakage (2025) | 独立学术 | C4 | 一手原文 |
| J7 | Tripathi et al., Pairwise or Pointwise? (2025) | 独立学术 | C4 | 一手原文 |
| J8 | Lee et al., CheckEval (2024/2025) | 学术为主（含 SK Telecom、NAVER） | C4 | 一手原文 |
| J9 | Furuhashi et al., Are Checklists Really Useful…? (2025) | 独立学术/公共研究机构（NII） | C4 | 一手原文 |
| J10 | Stureborg et al., LLMs are Inconsistent and Biased Evaluators (2024) | 学术+行业（Duke、Grammarly、NVIDIA） | C4 | 一手原文 |
| J11 | Thakur et al., Judging the Judges: Evaluating Alignment and Vulnerabilities… (2024/2025) | 学术+行业（UMass、Meta） | C4 | 一手原文 |
| J12 | Gao, Schulman & Hilton, Scaling Laws for Reward Model Overoptimization (2022) | 厂商研究（OpenAI） | C4, C5 | 一手原文 |
| V1 | Raji et al., AI and the Everything in the Whole Wide World Benchmark (2021) | 学术+行业研究 | C5 | 一手原文 |
| V2 | Bean et al., Measuring what Matters: Construct Validity in LLM Benchmarks (2025) | 独立学术（Oxford 主导，含 UK AISI） | C5 | 一手原文 |
| V3 | Ott et al., Mapping global dynamics of benchmark creation and saturation (2022) | 独立学术 | C5 | 一手原文（期刊信息来自检索结果） |
| V4 | Ren et al., Safetywashing (2024) | 非营利（Center for AI Safety）+学术 | C5（反面） | 一手原文 |
| V5 | Thomas & Uminsky, Reliance on Metrics is a Fundamental Challenge for AI (2020) | 独立学术 | C5 | 一手原文 |
| V6 | Manheim & Garrabrant, Categorizing Variants of Goodhart's Law (2018) | 独立研究者+MIRI（非营利） | C2, C5 | 一手原文 |

---

## 2. C1：「对抗性采样」有害——按当前模型的失败挑用例，测到的是该模型的失败指纹，而不是内在难度

**文献对应关系。** 学术文献讨论的是 *adversarial filtering*（从候选池里挑模型做错的样本）和 *model-in-the-loop adversarial data collection*（人写题去骗模型），研究对象是公共基准。博客的情境是从生产工单里挑评估用例，然后用这些用例爬山。两者的机制同源（按某个模型的失败做选择），但规模、用途和被测对象都不同。

### 2.1 支持 C1 的来源

#### B1. Phang, Chen, Huang, Bowman (2021). *Adversarially Constructed Evaluation Sets Are More Challenging, but May Not Be Fair.*
- 标识：arXiv:2111.08181；URL https://arxiv.org/abs/2111.08181 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§1、§5.2、§7、§8）。
- 关键引述：
  - 摘要："We find that AFLite indeed selects more challenging examples, lowering the performance of evaluated models more as stronger adversary models are used. However, the resulting ranking of models can also be unstable and highly sensitive to the choice of adversary model used. Moreover, AFLite over-samples examples with low annotator agreement, meaning that model comparisons hinge on the most contentiously labeled examples."
  - §1："The performance on the resulting datasets is also much worse if the evaluated model is fine-tuned from the same base model as the adversary. In other words, the difficulty of an adversarially filtered task may be overstated if evaluated on the same pretrained model."
  - §5.2："There is no case where the rank improves when filtering with the same pretrained model."
  - §8："avoid measuring the difficulty of adversarial datasets using the adversary models themselves."
- 成立前提：用 AFLite 对现成 NLU 评估集做过滤，18 个 encoder 类模型（45M–1.5B），过滤器是某个预训练模型，然后评估**其他**模型；对抗收集部分只看了 ANLI 和 AdversarialQA。
- 与本情境的差异：本情境是从几十条生产工单里按某个 Claude 版本的失败挑选，被测对象是同一模型家族的后续版本加各种 patch，样本量小两到三个数量级。B1 说的「对 adversary 本身不公平」直接对应「评估测的是同一个模型的失败指纹」，但 B1 没有研究「用这批用例去爬山」这件事。
- 短板与反面：作者自己在 §7 写了："most of our models are encoder-only Transformer-based models, and excluded experiments on sequence-to-sequence models such as T5 … and GPT-3"；§1 也承认 "with only a small number of adversarial datasets available, it is more difficult to draw strong conclusions"。同一篇 §8 还有对 C1 不利的一面："the resulting datasets are indeed more challenging, the impact on model rankings is somewhat expected as a higher proportion of difficult examples remain after filtering"。后续批评未专门检索。
- 立场：独立学术（NYU；一位作者当时在 Capital One）。

#### B2. Bowman & Dahl (2021). *What Will it Take to Fix Benchmarking in Natural Language Understanding?*
- 标识：arXiv:2104.02145；URL https://arxiv.org/abs/2104.02145 。arXiv Comments 写的是 "Proceedings of NAACL 2020"，与 2021 年 4 月的发布时间不符，照录原文，未进一步核对。
- 取得：一手原文（精读摘要、§1、§3.1、§3.3）。
- 关键引述：
  - 摘要："The recent trend to abandon IID benchmarks in favor of adversarially-constructed, out-of-distribution test sets ensures that current models will perform poorly, but ultimately only obscures the abilities that we want our benchmarks to measure."
  - §1："collecting examples on which current models fail is neither necessary nor sufficient to create a useful benchmark. … a model can top the leaderboard either by producing fewer errors than the adversary or by simply producing different errors, because the examples on which these new errors would be tested will not appear in the evaluation set."
  - §3.1："it can systematically eliminate coverage of linguistic phenomena or skills that are necessary for the task but already well-solved by the adversary model. This mode-seeking (as opposed to mass covering) behavior by adversarial filtering, if left unchecked, tends to reduce dataset diversity and thus make validity harder to achieve."
- 成立前提：这是一篇 position paper，论证多于测量；讨论对象是 NLU 公共基准和排行榜。
- 与本情境的差异：「produce different errors」这一机制可以原样搬到爬山：patch 让被选中的失败变好，同时在未入选的「当前已会」的能力上退化，而这部分不在评估集里（**本人推断**，文中没有针对 agent 爬山的实验）。
- 短板与反面：同一篇 §3.1 也承认对抗竞赛可以是生态的一部分："adversarial competitions, in which one compares the difficulty of collecting valid task examples that are adversarial to each of several systems, could be part of a healthy evaluation ecosystem"。没有量化实验。
- 立场：学术+行业研究（NYU；Google Research, Brain Team）。

#### B9. Northcutt, Athalye, Mueller (2021). *Pervasive Label Errors in Test Sets Destabilize Machine Learning Benchmarks.*
- 标识：arXiv:2103.14749；URL https://arxiv.org/abs/2103.14749 ；正式发表信息未核对。
- 取得：一手原文（精读摘要与引言）。
- 关键引述（摘要）："we estimate an average of at least 3.3% errors across the 10 datasets, where for example label errors comprise at least 6% of the ImageNet validation set." 以及 "lower capacity models may be practically more useful than higher capacity models in real-world datasets with high proportions of erroneously labeled data."
- 与 C1 的关系（**本人推断**）：强模型答错的样本里，标注错误的比例会高于总体。按失败挑样本会富集这类错误，这和 B1 的「过采样低标注一致性样本」、B5 的「越强的 model-in-the-loop 收集到的题对人越难」是同一方向。在工单场景里，对应的是参考答案或 rubric 本身有错的工单。
- 成立前提：CV、NLP、音频分类数据集，错误由 confident learning 找出、再经众包复核（"51% of the algorithmically-flagged candidates are indeed erroneously labeled"）。
- 与本情境的差异：本情境没有固定标签，而是用 rubric 或 LLM 评委打分，「标签错误」对应 rubric 错误或评委错误。
- 短板与反面：用来找错的算法本身有假阳性（候选只有约一半被确认为错）。后续批评未专门检索。
- 立场：学术+企业（MIT；Cleanlab 是做标签纠错产品的公司，有利益相关；AWS）。

### 2.2 反面或限定 C1 的来源

#### B3. Zellers et al. (2019). *HellaSwag: Can a Machine Really Finish Your Sentence?*
- 标识：arXiv:1905.07830（arXiv Comments："ACL 2019"）；URL https://arxiv.org/abs/1905.07830 。
- 取得：一手原文（精读摘要、§6.3 标题附近）。
- 关键引述（摘要）："We achieve this via Adversarial Filtering (AF) … AF proves to be surprisingly robust." 以及 "it suggests a new path forward for NLP research, in which benchmarks co-evolve with the evolving state-of-the-art in an adversarial way, so as to present ever-harder challenges."
- 成立前提：AF 过滤的是机器生成的**错误选项**，不是按模型失败挑题目本身；筛选另外要求 "trivial for humans (>95% accuracy)"。
- 与本情境的差异：本情境按「当前模型做错」挑的是题目本身，没有 HellaSwag 这种对人类可解性的独立约束。
- 短板与反面：B1 和 B2 的批评都把 HellaSwag 这类 AF 数据集列为对象。B7 的 IRT 分析里，HellaSwag 属于区分度最好的数据集之一，这一点对 AF 有利。
- 立场：独立学术（UW、AI2）。

#### B4. Kiela et al. (2021). *Dynabench: Rethinking Benchmarking in NLP.*
- 标识：arXiv:2104.14337（arXiv Comments："NAACL 2021"）；URL https://arxiv.org/abs/2104.14337 。
- 取得：一手原文（精读摘要、§4 "Caveats and Objections"）。
- 关键引述（§4）：
  - "Another risk is that the data distribution might be too heavily dependent on the target model in the loop. When this becomes an issue, it can be mitigated by using ensembles of many different architectures in the loop"
  - "Ideally, we would combine adversarially collected data with non-adversarial—preferably naturally collected—data, so as to capture both the average and worst case scenarios in our evaluation."
  - "it is natural to assume that the last round is automatically the best evaluation round, but that does not mean that it should be the only round"
- 成立前提：动态、多轮、人机对抗收集，面向公共基准。
- 与本情境的差异：Dynabench 把对抗数据定位为测 worst case 的工具，而且主张与自然分布的数据并用。在这个定位下，「测到的是失败模式」是设计目标而不是缺陷。所以 C1 的「有害」取决于评估要回答平均情况还是最坏情况的问题。
- 短板与反面：B2 和 B1 是对它的直接批评；作者在 §4 自己也承认 "How do we account for future, not-yet-in-the-loop models? Obviously, we can't—so this is a very valid criticism."
- 立场：行业研究为主（Facebook AI Research，另有 UCL、UNC、Stanford 等）。

#### B5. Bartolo et al. (2020). *Beat the AI: Investigating Adversarial Human Annotation for Reading Comprehension.*
- 标识：arXiv:2002.00293；TACL Vol. 8, 2020, pp. 662–678（arXiv Journal-ref）；URL https://arxiv.org/abs/2002.00293 。
- 取得：一手原文（精读摘要、§3.3）。
- 关键引述：
  - 摘要："training on adversarially collected samples leads to strong generalisation to non-adversarially collected datasets, yet with progressive performance deterioration with increasingly stronger models-in-the-loop. Furthermore, we find that stronger models can still learn from datasets collected with substantially weaker models-in-the-loop."
  - §3.3："We observe a clear trend: the stronger the model in the loop used to construct the dataset, the harder the resulting questions become for humans."
- 成立前提：主要结论针对**训练**数据的价值；评估侧只有部分结果。
- 与本情境的差异：对 C1 来说，这篇是一个限定：对抗数据可以迁移到别的模型，但 §3.3 同时显示，越强的 adversary 收集到的题对人也越难，这和 B1 的低一致性结论方向一致。
- 短板与反面：B6 的随机对照研究在 OOD 上得到了更不利的结果。
- 立场：独立学术（UCL）。

#### B6. Kaushik, Kiela, Lipton, Yih (2021). *On the Efficacy of Adversarial Data Collection for Question Answering: Results from a Large-Scale Randomized Study.*
- 标识：arXiv:2106.00872（arXiv Comments："Accepted at ACL-IJCNLP 2021"）；URL https://arxiv.org/abs/2106.00872 。
- 取得：一手原文（精读摘要）。
- 关键引述（摘要）："models trained on adversarial data usually perform better on other adversarial datasets but worse on a diverse collection of out-of-domain evaluation sets."
- 成立前提：工人随机分配到有模型在环和无模型在环两种条件，属于随机对照；研究的是训练侧效果。
- 与 C1 的关系：说明对抗收集出来的分布与自然分布系统性不同，间接支持 C1 和 C5 的「贴近生产分布」一条。
- 短板与反面：只研究 QA，而且是训练侧，不是评估侧。
- 立场：学术+行业研究（CMU；Facebook AI Research）。

#### B7. Vania et al. (2021). *Comparing Test Sets with Item Response Theory.*
- 标识：arXiv:2106.00840（arXiv Comments："ACL 2021"）；URL https://arxiv.org/abs/2106.00840 。
- 取得：一手原文（精读摘要、§4.1、§4.3）。
- 关键引述：
  - 摘要："We find that Quoref, HellaSwag, and MC-TACO are best suited for distinguishing among state-of-the-art models, while SNLI, MNLI, and CommitmentBank seem to be saturated for current strong models."
  - §4.1："We notice a half-moon shape pattern in most datasets, which indicates that most of the discriminative examples are either very easy or very difficult."
  - §4.1："ANLI, which is created with adversarial model-in-the-loop crowdsourcing, also has of many hard examples."（原文如此）
- 与 C1 的关系（**本人推断**）：在 IRT 框架里，题目难度（β）和区分度（α）是相对一个模型群体估计出来的（本文是 18 个模型）。C1 说的「内在难度」可以操作化为「相对一个模型群体的难度」；只用单个模型的一次作答结果挑题，相当于只用一个被试的一次作答来估难度。
- 短板与反面：S5 第 5 节（标题 "The false promise of item response theory for LLMs"）认为 IRT 在 LLM 上降方差效果有限，见 C3。
- 立场：独立学术为主（NYU；作者含 Amazon、AI2 人员）。

#### B8. Polo et al. (2024). *tinyBenchmarks: evaluating LLMs with fewer examples.*（C1 部分，C3 部分见后文）
- 标识：arXiv:2402.14992；PMLR 235 (ICML 2024)，见 PDF 页脚；URL https://arxiv.org/abs/2402.14992 。
- 取得：一手原文（精读摘要、"Specialized LLMs" 段、§6.2）。
- 关键引述：
  - Figure 5 图注："Correctness-based example selection is affected the most by this distribution shift."
  - 正文："As we anticipated, the correctness-based anchor strategy deteriorates when tested on specialized LLMs."
- 与 C1 的关系：按一群模型的**对错模式**挑出来的样本子集，遇到对错模式不同的新模型时估计会变差。这与 C1 的方向一致：按对错挑样，结果依赖挑样时用的是哪些模型。
- 立场：学术+行业研究（Michigan 统计系、Pompeu Fabra、IBM Research、MIT）。

### 2.3 C1 的事实汇总（不含建议）

- **有文献支持的成立条件**：
  - 用 adversary 自身或同一基座的模型去度量难度或比较排名时，难度会被高估，排名会不稳（B1）。
  - 模型可以靠「犯不同的错」而不是「犯更少的错」得分（B2 的论证）。
  - 挑出的集合会丢掉 adversary 已经会的技能（B2），并富集低一致性或可能错标的样本（B1、B5、B9）。
- **有文献支持的退化条件与反面**：
  - 对抗集对所有模型都更难（B1、B5），可以迁移（B5）；AF 数据在 IRT 上区分度高（B7 中的 HellaSwag）。
  - 用多模型集成做 adversary、并与自然分布数据并用，可以减轻对单一模型的依赖（B4 的主张，未见量化）。
  - 如果评估目的是 worst case，这种依赖是有意为之（B4）。
- **规模差异**：上述文献的数据集都是几千到几十万条，候选模型十几到几十个。44 条工单这个量级没有找到专门研究。
- **一个统计机制**（**本人推断**，由 S1 的 $s_i = x_i + \epsilon_i$ 分解和 V6 的 Regressional Goodhart 推出，文献没有针对这一情境的实测）：按「单次运行中做错」挑用例，挑中的既有「条件均值 $x_i$ 低」的用例，也有「本次随机项 $\epsilon_i$ 恰好为负」的用例。后者下一次重跑会向均值回归，所以即使模型没有任何改动，这批用例的分数也会上升。

---

## 3. C2：train/test 切分能抓过拟合，但流程每轮用 test 分数决定保留还是回退，最后选 test 上最好的版本，并报告 test 上的置信区间

### 3.1 说明「反复用 test 做选择」有害的来源

#### A1. Dwork, Feldman, Hardt, Pitassi, Reingold, Roth (2015). *Generalization in Adaptive Data Analysis and Holdout Reuse.*
- 标识：arXiv:1506.02629；URL https://arxiv.org/abs/1506.02629 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§1、§1.1.1、§2.3、§5）。
- 关键引述：
  - 摘要："Reusing a holdout set adaptively multiple times can easily lead to overfitting to the holdout set itself."
  - §1："One well-known reason for such dependence is that the holdout data is used to test a large number of predictors and only the best one is reported. If the set of all tested hypotheses is known and independent of the holdout set, then it is easy to account for such multiple testing … However such static approaches do not apply if the estimates or hypotheses tested on the holdout are chosen adaptively"
  - §1 把以下情形列为自适应复用："using the holdout set for feature selection, … checking a stopping condition, and analyst-in-the-loop decisions."
  - §5："In this scenario no classifier can achieve true accuracy better than 50%. Nevertheless, reusing a standard holdout results in reported accuracy of over 63% for k= 500 on both the training set and the holdout set"
  - §1.1.1（Thresholdout）："The number of queries that Thresholdout can answer is exponential in n as long as the number of times that the analyst overfits is at most quadratic in n."
  - §2.3 Theorem 9（描述长度界）："Then P[S∈R(A(S))] ≤|Y|· β."
- 成立前提：
  - holdout 样本 i.i.d.；给出的是最坏情况分析者下的保证。
  - §5 的实验是 n=10,000、d=10,000、标签为纯噪声。
  - 实验里 Thresholdout 的参数 "lower than the values necessary for the proof"。
- 与本情境的差异：本情境每轮用 test 分数做保留/回退，正属于 §1 列举的 "checking a stopping condition / analyst-in-the-loop decisions"；test 只有 14 条。按照 Theorem 9 的思路，本人计算得到的界在 n=14 时是空泛的（见 §3.4）。
- 短板与反面：最坏情况理论。A5、A7 等大样本实证发现，真实世界的自适应过拟合远小于最坏情况。
- 立场：独立学术（理论 CS；作者当时分属 Microsoft Research、IBM、Google、Samsung Research 与大学）。

#### A2. Blum & Hardt (2015). *The Ladder: A Reliable Leaderboard for Machine Learning Competitions.*
- 标识：arXiv:1502.04585；URL https://arxiv.org/abs/1502.04585 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§1.1、§5）。
- 关键引述：
  - §1.1："the maximum error of our algorithm on any estimate is never worse than O((log(k)/n)^{1/3}) where k is the number of submissions and n is the size of the data used to compute the leaderboard. In contrast, we observe that the error of the Kaggle mechanism (and similar solutions) scales with the number of submissions as √k"
  - §1.1："An important aspect of our algorithm is that it only releases a score to the participant if the score presents a statistically significant improvement over the previously best submission of the participant. Intuitively, this prevents the participant from exploiting or overfitting to minor fluctuations in the observed score values."
  - §5 Theorem 5.1（boosting attack）：只观察 k 次提交的损失估计，就能构造出损失 ≤ 1/2 − Ω(√(k/n)) 的向量。
  - §1.1 实际 Kaggle 数据："little overfitting occurred and the errors of the Kaggle leaderboard were generally within the expected statistical deviations"
- 与本情境的差异：Theorem 5.1 表明，**仅凭标量分数反馈**（看不到逐条 test 样本）就足以对 holdout 过拟合。所以「test 永不可见」只挡住了逐条泄漏，挡不住经由分数和保留/回退决策的泄漏（这是对定理的直接应用，但攻击是刻意构造的对抗式）。Ladder 的「超过 s/√n 才更新」规则，形式上对应 C6 的「噪声门槛」。n=14 时 1/√n≈0.27（本人计算）。
- 短板与反面：攻击是对抗性构造；真实 Kaggle 数据中过拟合很小（同文）。A3 改进了上界速率。
- 立场：独立学术。

#### A3. Hardt (2017). *Climbing a shaky ladder: Better adaptive risk estimation.*
- 标识：arXiv:1706.02733；URL https://arxiv.org/abs/1706.02733 。
- 取得：一手原文（精读摘要、§1）。
- 关键引述（§1）："The lack of independence between model and holdout data is what invalidates classical confidence bounds for the holdout setting." 以及 "The Ladder algorithm maintains the risk of the best model … on a sequence of k adaptively chosen models up to an additive error of O(log(kn)^{1/3}/n^{1/3})."
- 与 C2 的关系：在 test 上做过选择之后再报告 test 上的经典置信区间，正是这句话所说的「经典置信界失效」的情形。
- 短板：纯理论。
- 立场：独立学术。

#### A8. Cawley & Talbot (2010). *On Over-fitting in Model Selection and Subsequent Selection Bias in Performance Evaluation.*
- 标识：JMLR 11:2079–2107；URL https://jmlr.org/papers/v11/cawley10a.html （PDF：https://jmlr.org/papers/volume11/cawley10a/cawley10a.pdf ）。
- 取得：一手原文（精读摘要、§5 末段、§6）。
- 关键引述：
  - 摘要："we show that the effects of this form of over-fitting are often of comparable magnitude to differences in performance between learning algorithms, and thus cannot be ignored in empirical evaluation. Furthermore, we show that some common performance evaluation practices are susceptible to a form of selection bias as a result of this form of over-fitting and hence are unreliable."
  - §5："the external cross-validation protocol exhibits a consistent optimistic bias, potentially of a very substantial magnitude even when the number of hyper-parameters is small (in this case only two)"
  - §6："model selection should be viewed as an integral part of the model fitting procedure, and should be conducted independently in each trial in order to prevent selection bias"
- 与本情境的差异：本情境「最后选 test 上最好的版本并在 test 上报告」，在结构上等同于文中的 external protocol（选择与评估用同一份数据）。文中场景是核方法、交叉验证和中小型 UCI 类数据，不是 LLM 代理。
- 短板：经典机器学习实验，没有涉及 LLM。
- 立场：独立学术（UEA）。

#### A12. Singh et al. (2025). *The Leaderboard Illusion.*
- 标识：arXiv:2504.20879；URL https://arxiv.org/abs/2504.20879 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§3 Section Findings）。
- 关键引述：
  - 摘要："We establish that the ability of these providers to choose the best score leads to biased Arena scores due to selective disclosure of performance results."
  - §3："we simulate the expected distortions to leaderboard Arena rankings and show that testing just 10 variants yields a notable increase of approximately 100 points in the maximum score identified." 以及 "Submitting multiple model variants to the Chatbot Arena can lead to a systematic advantage in rankings, even when the underlying models are identical or only marginally different."
- 与 C2 的关系：从多个版本中取评估分最高的一个，即使各版本真实水平相同，报告出的最高分也会被系统性抬高（winner's curse）。
- 与本情境的差异：研究对象是 Bradley–Terry 排名和人类投票，与固定集合上的准确率不同。
- 短板与反面：作者单位 Cohere 与被评平台存在竞争关系；平台方的回应属于厂商博客，不在本域，未核对。
- 立场：厂商研究（Cohere Labs 主导；合作者来自 Princeton、Stanford、MIT、AI2 等）。

#### A11. Kapoor, Stroebl, Siegel, Nadgir, Narayanan (2024). *AI Agents That Matter.*
- 标识：arXiv:2407.01502；URL https://arxiv.org/abs/2407.01502 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§5）。
- 关键引述：
  - 摘要："many agent benchmarks have inadequate holdout sets, and sometimes none at all. This has led to agents that are fragile because they take shortcuts and overfit to the benchmark in various ways."
  - §5："We propose as a core principle that the more general the intended generality of the agent, the more the held-out set should differ from the training set"；Table 1 列出的留出层级依次为 In-distribution samples、Out-of-distribution samples、Tasks、Domains。
- 与 C2 的关系：一方面支持 C2「需要 holdout」的前提；另一方面说明从同一批工单里随机切出的 i.i.d. 14 条，只能对应 Table 1 最低的 "distribution-specific" 层级，不能检测对任务漂移的过拟合。
- 立场：独立学术（Princeton）。

#### A9. Gorman & Bedrick (2019). *We need to talk about standard splits.*
- 标识：ACL 2019, pp. 2786–2791；URL https://aclanthology.org/P19-1267/ 。
- 取得：一手原文（精读摘要、§3.3、§5）。
- 关键引述：
  - 摘要："We fail to reliably reproduce some rankings using randomly generated splits."
  - §5："the use of a single standard split, may result in avoidable Type I error."
- 与 C2 的关系：本情境只有一次 30/14 切分，结论可能依赖这一次切分。
- 反面：A10。
- 立场：独立学术。

#### A10. Søgaard, Ebert, Bastings, Filippova (2021). *We Need to Talk About Random Splits.*
- 标识：EACL 2021, pp. 1823–1832；URL https://aclanthology.org/2021.eacl-main.156/ 。
- 取得：一手原文（精读摘要、§1）。
- 关键引述（摘要）："We argue that random splits, like standard splits, lead to overly optimistic performance estimates." 以及 "In NLP, however, even worst-case splits, maximizing bias, often under-estimate the error observed on new samples of in-domain data" 和 "future benchmarks should ideally include multiple, independent test sets instead"。
- 与 C2、C5 的关系：随机切分得到的 test 会高估对新采样数据的表现，这与「生产分布」随时间漂移有关。
- 立场：行业研究（Google Research；一位作者兼 Copenhagen 大学）。

#### V6. Manheim & Garrabrant (2018). *Categorizing Variants of Goodhart's Law.*（C2 与 C5 共用）
- 标识：arXiv:1803.04585（v4，2019）；URL https://arxiv.org/abs/1803.04585 ；预印本，未见同行评审信息。
- 取得：一手原文（精读引言与 §1）。
- 关键引述（§1）："Regressional Goodhart - When selecting for a proxy measure, you select not only for the true goal, but also for the difference between the proxy and the goal." 以及 "it can not be avoided. No matter what measure is chosen for optimization, an inexact metric necessarily leads to a divergence between the goal and the metric in the tail."
- 与 C2 的关系：「选 test 最好的版本」是在带噪声的代理指标上做选择，选中的版本的误差项期望为正。
- 立场：独立研究者 + MIRI（非营利）。

### 3.2 说明影响可以很小，或给出限定条件的来源

#### A5. Recht, Roelofs, Schmidt, Shankar (2019). *Do ImageNet Classifiers Generalize to ImageNet?*
- 标识：arXiv:1902.10811；URL https://arxiv.org/abs/1902.10811 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§1、§5.1 开头）。
- 关键引述：
  - 摘要："Our results suggest that the accuracy drops are not caused by adaptivity, but by the models' inability to generalize to slightly "harder" images than those found in the original test sets."
  - §1："the relative order of models is almost exactly preserved on our new test sets"
- 成立前提：CIFAR-10 test 集 10,000 条、ImageNet 验证集 50,000 条，复用者是整个社区里十年间大量独立团队，模型类几乎都是 CNN。
- 与本情境的差异：本情境是单一优化者、单一 test、14 条样本，连续 24 轮决策。
- 短板与反面：
  - A6 指出复现流程本身带统计偏差："after remeasuring selection frequencies and correcting for the identified statistical bias, only an estimated 3.6% ±1.5% of the original 11.7% ±1.0% accuracy drop remains unaccounted for."
  - A7 §5 指出 A5 "assembled new test sets from scratch, which makes it hard to disentangle the effects of adaptive overfitting and distribution shifts" 且只覆盖两个图像基准。
- 立场：独立学术（UC Berkeley）。

#### A6. Engstrom, Ilyas, Santurkar, Tsipras, Steinhardt, Mądry (2020). *Identifying Statistical Bias in Dataset Replication.*
- 标识：arXiv:2005.09619；URL https://arxiv.org/abs/2005.09619 ；正式发表信息未核对。
- 取得：一手原文（只精读了摘要与引言）。
- 关键引述：见 A5 的「短板与反面」一栏。
- 与 C2 的关系：修正的是 A5 对「掉点来自分布差异」的解释，没有推翻「自适应过拟合小」这一点。
- 立场：独立学术（MIT、UC Berkeley）。

#### A7. Roelofs, Fridovich-Keil, Miller, Shankar, Hardt, Recht, Schmidt (2019). *A Meta-Analysis of Overfitting in Machine Learning.*
- 标识：NeurIPS 2019（PDF 页脚为 "33rd Conference on Neural Information Processing Systems (NeurIPS 2019)"）；URL https://papers.nips.cc/paper_files/paper/2019/file/ee39e503b6bedf0c98c388b7e8589aca-Paper.pdf 。
- 取得：一手原文（精读摘要、§1、§3.2、§3.4、§3.5、§5）。
- 关键引述：
  - 摘要："Our study shows, somewhat surprisingly, little evidence of substantial overfitting."
  - §1："these competitions usually have pathologies such as non-i.i.d. data splits or (effectively) small test sets."
  - §3.2："The other competition is 12681, which contains a public test set of size 90. Very small (effective) test sets make it easier to reconstruct the public / private split (and then to overfit), and also make the public and private scores more noisy."
  - §3.4："our results for accuracy competitions suggest that at least 10,000 examples is a reasonable minimum test set size to protect against adaptive overfitting."
  - §3.5："Overall we see more signs of overfitting as we sharpen our analysis to highlight smaller effect sizes."
- 成立前提：120 场 Kaggle 分类竞赛，公开榜样本量通常上千，由大量人类团队分散提交，并有提交频率限制。
- 与本情境的差异：本情境的 test 只有 14 条，比文中被判为「异常」的 90 条公开集还小一个数量级。文中的 10,000 门槛，作者自己写明 "Although a reliable recommendation for applied machine learning will require broader investigation"。
- 立场：独立学术（UC Berkeley）。

#### A4. Mania, Miller, Schmidt, Hardt, Recht (2019). *Model Similarity Mitigates Test Set Overuse.*
- 标识：arXiv:1905.12580；URL https://arxiv.org/abs/1905.12580 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§1）。
- 关键引述：
  - 摘要："Many proposed models are similar in their predictions and we prove that this similarity mitigates overfitting."
  - §1："A simple adaptive strategy, resembling the practice of selectively ensembling k models, can bias the holdout method by as much as √(k/n)."
- 与本情境的关系：同一代理的相邻 patch，预测很可能高度相似（**本人推断**，未测）。按本文理论，这会减轻过拟合；但本文的实证基础是 ImageNet 级别的 holdout，而且在 n=14 时连非自适应的 √(log k/n) 本身就很大。
- 立场：独立学术。

#### A13. Bertran, Roth, Wu (2026). *What Fits (Into Few Tokens) Doesn't Overfit: Compression and Generalization in ML Research Agents.*
- 标识：arXiv:2606.11045；URL https://arxiv.org/abs/2606.11045 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§1、§5 压力测试段、§6）。
- 关键引述：
  - 摘要："In input compression, the explorer receives only one-bit feedback indicating whether each submitted model improves on the running best. … we find that these bottlenecks have little effect on performance" 以及 "when we deliberately induce validation-set overfitting, the results fail to reproduce with short prompts."
  - §5："Under these conditions, agents reliably exploit Dval at training time … across 102 checkpoints, 38 exceed a 10% relative validation–holdout gap."
  - §6："The ladder bound directly controls the population performance of the explorer's models with rigorous confidence intervals." 以及 "If the LLM has memorized aspects of Dval during pre-training, it possesses a side channel that bypasses both bottlenecks."
- 成立前提：研究对象是 LLM 研究代理，在 8 个数据集上训练 ML 模型。文中示例的验证集是 "n= 5,000"。一位反馈用的是 Ladder 机制。
- 与本情境的差异：这是与本情境最接近的一手研究（LLM 代理、每步只得到「是否改进」一位反馈）。但它的验证集比 14 条大两个半数量级，代理优化的是训练策略，不是提示词或 skill 文本。它的正面结论（过拟合小）是在大 n 下取得的；压力测试（给代理完整验证集访问、换更小的验证集）显示过拟合会真实发生。
- 立场：厂商研究（Amazon Responsible AI；Roth 兼 UPenn，Wu 兼 CMU）。

#### A14. Akinwande, Jiang, Sam, Kolter (2023). *Understanding prompt engineering may not require rethinking generalization.*
- 标识：arXiv:2310.03957；URL https://arxiv.org/abs/2310.03957 ；正式发表信息未核对。
- 取得：一手原文（只精读了摘要）。
- 关键引述（摘要）："the discrete nature of prompts, combined with a PAC-Bayes prior given by a language model, results in generalization bounds that are remarkably tight by the standards of the literature: for instance, the generalization bound of an ImageNet classifier is often within a few percentage points of the true test error."
- 与 C2 的关系：从理论上说明离散提示搜索天然不易过拟合，这是反面证据。它的数据规模是 ImageNet 级别；A15 指出这类界在 m<1000 时是空泛的。
- 立场：独立学术（CMU；Kolter 兼 Bosch Center for AI）。

#### A15. Madras, Safyan, Zhang (2025). *Prompts Generalize with Low Data: Non-vacuous Generalization Bounds for Optimizing Prompts with More Informative Priors.*
- 标识：arXiv:2510.08413（arXiv Comments："EXAIT Workshop paper at ICML 2025"）；URL https://arxiv.org/abs/2510.08413 。
- 取得：一手原文（精读摘要、§3 与实验段中关于样本量的句子）。
- 关键引述：
  - "this still results in vacuous bounds for mild regimes of m <1000 as the divergence is large when applying the previous approaches of Akinwande et al. [2023]"
  - "around 0.46. While this is not necessarily low enough to be useful (real test error was 0.11) … we obtained our non-trivial results using only 150-300 examples."
- 与 C2 的关系：在 150–300 条样本上，已知最紧的提示泛化界约为 0.46，而实际误差是 0.11。几十条样本的情形没有非空泛的理论保证（这是对文中数字的直接读取）。
- 立场：厂商研究（Google / Google DeepMind）。

### 3.3 小结：各来源给出的量级与条件

| 条件 | 来源给出的量级 |
|---|---|
| 最坏情况、自适应、只有分数反馈 | 偏差可达 Ω(√(k/n))（A2 Thm 5.1；A4 §1） |
| Ladder（只在显著改进时更新） | 误差 O((log k / n)^{1/3})（A2），随机化版本 O(1/n^{0.4})（A3） |
| 纯噪声标签，n=10,000，选 500 个变量 | holdout 报告 >63%，真值 50%（A1 §5） |
| 大型公开竞赛，n 上千到数万 | 过拟合效应量 "typically small (e.g., less than 1% classification accuracy)"（A7 §1） |
| 公开 test 只有 90 条 | 被列为异常（A7 §3.2） |
| LLM 代理、一位反馈、n=5,000 | 验证集与留出集差距小；给了完整访问后 38/102 个检查点相对差距 >10%（A13） |
| 同数据上做选择、同数据上报告 | 乐观偏差 "of comparable magnitude to differences in performance between learning algorithms"（A8） |

### 3.4 本人计算与模拟（非来源结论）

**(a) 均匀一致界在 n=14 时的量级**

用 Hoeffding 不等式加上 A1 §2.3 Theorem 9 的并集论证，95% 水平下的偏差上界 ε（分数取值在 [0,1]）如下：

| n | 单次使用 | 25 个事先固定版本中取最好 | 24 位保留/回退记录 × 25 选 1（描述长度界） |
|---|---|---|---|
| 14 | 0.363 | 0.497 | 0.917 |
| 30 | 0.248 | 0.339 | 0.626 |
| 100 | 0.136 | 0.186 | 0.343 |
| 1000 | 0.043 | 0.059 | 0.108 |
| 10000 | 0.014 | 0.019 | 0.034 |

公式为 ε = √((ln|Y| + ln(2/δ)) / (2n))，δ=0.05，|Y| = 2^24 × 25。这些都是最坏情况上界，不是期望偏差的估计；它们只说明：在 n=14 或 30 时，现有理论给不出任何非空泛的保证。

**(b) 玩具模拟**（`calc/adaptive_sim.py`，假设全部由我设定，结果对参数敏感）

模型设定：
- 每条 test 用例有基线 logit，总体准确率约 76%。
- 每个候选 patch 给每条用例加一个独立的 logit 扰动 N(δ, τ²)，其中 δ 是 patch 的真实总体效应。
- 每次评估对每条用例做 K=3 次伯努利抽样。
- 每轮重新测「当前版本」和「候选」，候选分 ≥ 当前分则保留。共 24 轮。
- 「真实值」是这组累积 patch 在全新用例上的期望准确率。

结果（每格 600 次重复，n=100 为 300 次；蒙特卡洛误差约 ±1pp）：

| n | δ | τ | 最终版本重测的乐观偏差 | 「历轮所见最高 test 分」的乐观偏差 |
|---|---|---|---|---|
| 14 | 0 | 0.6 | +5.6pp | +18.3pp |
| 30 | 0 | 0.6 | +3.9pp | +13.9pp |
| 100 | 0 | 0.6 | +2.1pp | +9.0pp |
| 14 | 0.15 | 0.6 | +3.4pp | +8.9pp |
| 30 | 0.15 | 0.6 | +2.4pp | +6.2pp |
| 100 | 0.15 | 0.6 | +1.1pp | +2.8pp |
| 14 | 0 | 0.3 | +1.4pp | +13.9pp |
| 14 | 0 (K=1) | 0.6 | +2.8pp | +23.9pp |

补充两点：
- 当 δ=0、τ=0.6 时，这个模型里的「真实值」反而从 75.9% 降到 69.7%。原因是在高准确率区间加对称噪声，由于 sigmoid 的凹性会拉低均值。模拟里 test 分数没有显示出这种下降。
- 这个模拟只说明方向和大致量级随 n、K、τ 的变化，不代表博客的真实情形。例如 A4 所说的 patch 间相似性就没有建模。

---

## 4. C3：小样本——44 条工单（30 train / 14 held-out），held-out 90.5% 对 78.6%；另一例 24 轮从 66.1% 爬到 87.9%

### 4.1 来源

#### S1. Miller (2024). *Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations.*
- 标识：arXiv:2411.00640；URL https://arxiv.org/abs/2411.00640 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§1、§2.2、§3.1、§4.2、§5）。
- 关键引述：
  - §1 列出的五项做法："1. Computing standard errors of the mean using the Central Limit Theorem 2. When questions are drawn in related groups, computing clustered standard errors 3. Reducing variance by resampling answers … 4. … conducting statistical inference on the question-level paired differences … 5. Using power analysis"
  - §2.2："Failure to adjust standard errors for clustered sampling may lead an unsuspecting analyst to suppose that the measurement of the overall eval score is much more precise than it actually is." 以及 "the cluster adjustment in our real-world example is far from trivial (up to 3X)."
  - §3.1："Note that computing a pooled standard error across all KN answers will be inconsistent, as multiple answers to the same question would violate the assumption of independent draws."
  - §4.2："paired differences represent a "free" reduction in estimator variance when comparing two models."
  - §5："suggest that new evals should contain at least 1,000 questions in order to have good signaling ability."
- 成立前提：题目是从超总体中 i.i.d.（或按簇独立）抽样；推断基于 CLT。
- 短板与反面：S2 明确把 Miller (2024) 列为 CLT 方法的使用者，并指出小 N 时 CLT 区间覆盖率不足（见 S2）。
- 立场：**厂商研究（Anthropic）**，与被检验的博客同属一家厂商，不算独立来源。

#### S2. Bowyer, Aitchison, Ivanova (2025). *Position: Don't Use the CLT in LLM Evals With Fewer Than a Few Hundred Datapoints.*
- 标识：arXiv:2503.01747；PMLR 267 (ICML 2025)，见 PDF 页脚；URL https://arxiv.org/abs/2503.01747 。
- 取得：一手原文（精读摘要、§1、§3.1–3.3、§4、附录 A.2）。
- 关键引述：
  - 摘要："In these small-data settings, we demonstrate that CLT-based methods perform very poorly, usually dramatically underestimating uncertainty (i.e. producing error bars that are too small)."
  - §3.1："in the N=100 column we see that 95% CLT-based intervals achieve a coverage of only 92.5%." 以及 "We would, therefore, recommend using WS or Bayesian intervals in practice."
  - Figure 3 图注："in a small-data regime, neither simple CLT nor clustered CLT intervals produce correct coverage."
  - §4："A key reason we chose to word the title of this paper as we did is to avoid implying the existence of some hard-valued N∗ below which the CLT is always invalid"
- 成立前提：模拟实验，θ ~ Beta(1,1)，N ∈ {3, 10, 30, 100}。
- 短板与反面：覆盖率是在 θ 服从均匀先验时平均得到的，§4 自己讨论了先验失配的影响；另外所有结果都来自模拟。
- 立场：独立学术（Bristol、Oxford）。

#### S3. Card, Henderson, Khandelwal, Jia, Mahowald, Jurafsky (2020). *With Little Power Comes Great Responsibility.*
- 标识：arXiv:2010.06595（arXiv Comments："To appear at EMNLP 2020"）；URL https://arxiv.org/abs/2010.06595 。
- 取得：一手原文（精读摘要、§1、§3 开头、§7）。
- 关键引述：
  - §1："significant findings from underpowered experiments are more likely to exaggerate or reverse the true effect – so-called Type-M (magnitude) and Type-S (sign) errors"
  - §3："if an experiment's test set is small, the minimum detectable effect (MDE) size may be large: only large improvements will yield sufficiently powered comparisons (i.e., ≥80% power)."
  - §7："improvements found to be significant will exaggerate or reverse the true effect."
- 与 C3 的关系：在 n=14 上观察到的 +11.9pp，如果恰好被当作「显著」，按 Type-M 的逻辑它倾向于高估真实效应。
- 短板：作者自己说 "Every power analysis requires assumptions"（§2）。
- 立场：独立学术（Stanford、UCSB）。

#### S4. Dror, Baumer, Shlomov, Reichart (2018). *The Hitchhiker's Guide to Testing Statistical Significance in Natural Language Processing.*
- 标识：ACL 2018, pp. 1383–1392；URL https://aclanthology.org/P18-1128/ 。
- 取得：一手原文（精读摘要、§1、§3.2.2）。
- 关键引述：
  - §1："while most significance tests assume the test set consists of independent observations, most NLP datasets consist of dependent data points."
  - §3.2.2（McNemar）："Under the null hypothesis, with a sufficiently large number of disagreements between the algorithms, the test statistic has a distribution of χ2 with one degree of freedom."
- 与 C3 的关系：每条工单重复运行多次，得到的是相依数据；14 条上两个版本之间的分歧数很少，χ² 近似不适用，需要用精确检验。
- 立场：独立学术（Technion）。

#### S7. Schaeffer, Miranda, Koyejo (2023). *Are Emergent Abilities of Large Language Models a Mirage?*（C3 部分）
- 标识：arXiv:2304.15004；URL https://arxiv.org/abs/2304.15004 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§3、附录 A.1）。
- 关键引述（§3）："having insufficient resolution to estimate model performance in the smaller parameter regime, with resolution set by 1/test dataset size"
- 与 C3 的关系：n=14 时，单次评估的分辨率是 1/14≈7.1pp（本人计算）。
- 立场：独立学术（Stanford）。

#### B8. Polo et al. (2024). tinyBenchmarks（C3 部分，**反面**）
- 关键引述：
  - 摘要："to accurately estimate the performance of an LLM on MMLU … it is sufficient to evaluate this LLM on 100 curated examples."
  - 正文："100 examples per scenario is sufficient to achieve ≈2% average performance estimation error"
  - §6.2："The main limitations of the methods described in this paper are related to potential severe distribution shifts."
- 成立前提：要有数百个 LLM 在完整基准上的逐题结果来拟合 IRT，再用这个模型估计同一基准上的总分。它的目标是估计总分，不是在两个相近版本之间做比较。
- 反面的反面：S5 §5 专门评估了这一方法，结论是 "both methods suffer from greatly increased seed variance … indicating that the tiny-benchmarks method may have limited use during pretraining ablations as it makes model comparisons more likely to be confounded by randomness"，并指出直接用 100 条子集 "can lead to quite large deviations in the mean (an overestimation by 7% for ARC-C)"。

### 4.2 本人计算（非来源所述）

**(i) 百分比与整数比的对应。**
- 78.6% = 11/14（78.57%），是 14 的整数比。
- 90.5% × 14 = 12.67，不是 14 的整数比；13/14=92.9%，12/14=85.7%。
- 同时能凑出 90.5% 和 78.6% 的最小公共分母是 **42 = 14×3**：38/42=90.48%，33/42=78.57%。也能凑成 19/21 和 11/14，但那样两组分母不同。
- 所以最简单的解释是每条工单跑 3 次，或每条工单有 3 个判分点。这是推断，因为没有读博客原文，无法确认。
- 如果真是 42 个判分单位，它们按工单成簇，并不独立。S1 §3.1 已明确指出：把 K×N 个答案合并计算标准误是 "inconsistent"。
- 另一例 66.1% 与 87.9% 能共用的最小分母是 124（下一个是 165），不是 14、30 或 44 的倍数。说明那一例用的是分数型评分或另一套集合，无法从百分比反推结构。

**(ii) Wilson 95% 区间**（z = 1.96；式同 S2 附录 A.2 eq.12）

公式：

$$\text{center}=\frac{\hat p+\frac{z^2}{2n}}{1+\frac{z^2}{n}},\qquad \text{half}=\frac{z}{1+\frac{z^2}{n}}\sqrt{\frac{\hat p(1-\hat p)}{n}+\frac{z^2}{4n^2}}$$

n=14、p̂=0.905 的逐步演算：
- z²/n = 3.8415/14 = 0.27439
- center = (0.905 + 0.13720) / 1.27439 = 0.81780
- 根号内 = 0.905×0.095/14 + 3.8415/784 = 0.0061411 + 0.0048999 = 0.0110410，开方得 0.105076
- half = (1.96 / 1.27439) × 0.105076 = 1.53799 × 0.105076 = 0.16161
- 区间 = **[65.6%, 97.9%]**

| n | p̂ | Wilson 95% | 宽度 |
|---|---|---|---|
| 14 | 90.5% | [65.6%, 97.9%] | 32.3pp |
| 14 | 78.6% | [52.4%, 92.4%] | 40.0pp |
| 30 | 90.5% | [75.0%, 96.8%] | 21.8pp |
| 30 | 78.6% | [61.2%, 89.5%] | 28.4pp |
| 42（按 3 次重复视为独立，不成立的上界情形） | 90.5% | [78.0%, 96.2%] | 18.3pp |
| 42（同上） | 78.6% | [64.1%, 88.3%] | 24.2pp |

整数比的 Clopper–Pearson 对照：11/14 为 [49.2%, 95.3%]；13/14 为 [66.1%, 99.8%]；27/30 为 [73.5%, 97.9%]。

**(iii) 簇内相关对有效样本量的影响。** 设每条工单 m=3 次，有效样本量 n_eff = 42 / (1 + 2ρ)。对 90.5%：
- ρ=0：n_eff=42，区间 [78.0%, 96.2%]
- ρ=0.5：n_eff=21，区间 [71.1%, 97.4%]
- ρ=1：n_eff=14，区间 [65.6%, 97.9%]

实际区间落在「n=14」和「n=42 视为独立」这两行之间，具体位置取决于同一工单多次运行之间的相关程度。

**(iv) 两组差值 +11.9pp 是否可分辨。**
- 按独立两样本的 Newcombe 混合 Wilson 区间：
  - n=14：[−16.6pp, +39.1pp]
  - n=30：[−7.1pp, +30.4pp]
  - n=42（视为独立）：[−4.0pp, +27.5pp]
- Fisher 精确检验：38/42 对 33/42 为 p=0.227；13/14 对 11/14 为 p=0.596。
- 按工单配对（S1 §4.2 所说的配对设计）的精确符号检验或 McNemar：14 条上至少需要 **6 条不一致且全部同向**，双侧 p 才能达到 0.031（5 条是 0.0625）。这相当于至少 42.9pp 的净差。
- 按工单配对、每条 3 次取均值的差值（净差 1.67 条工单），结论取决于差值如何分布（**假设情形**）：
  - 5 条各 +1/3，其余 0：配对 t 检验 p=0.019，Wilcoxon 精确检验 p=0.062
  - 7 条 +1/3、2 条 −1/3：t 检验 p=0.096，Wilcoxon p=0.180
  - 2 条 +1、1 条 +1/3、1 条 −2/3：t 检验 p=0.315，Wilcoxon p=0.375
- 结论：只有两个汇总百分比，无法判断差值是否显著。另外按 S2，t 检验这类 CLT 方法在 n=14 时本身的覆盖率就不可靠。

**(v) 最小可检测效应（MDE）。** 用 S1 eq.(10)，参数照搬 S1 的示例值（ω²=1/9，σ²=1/6，α=.05，power=.8）。这些参数是 S1 自己设定的虚构值，不是这批工单的实测值。

| n | K=1 | K=3 | K=10 |
|---|---|---|---|
| 14 | 49.9pp | 35.3pp | 28.5pp |
| 30 | 34.1pp | 24.1pp | 19.4pp |
| 44 | 28.2pp | 19.9pp | 16.1pp |
| 198 | 13.3pp | 9.4pp | 7.6pp |

n=198 这一行可以对照 S1 自己的算例：S1 写的是 "reduces the Minimum Detectable Effect from 13.2% to 7.5%"，本人复算为 13.3% 和 7.6%，差异来自分位数的取整。

### 4.3 C3 的事实汇总

- 按 S2，n=14 和 n=30 都处在 CLT 区间不可靠的区间。
- 按 S1 和 S4，同一工单的多次运行不是独立观测。
- 按 S3，在小样本上被判为「显著」的效应存在 Type-M 高估。
- 反面：在有大规模先验作答数据、并且目标只是估计总分的条件下，约 100 条经 IRT 挑选的样本可以把总分估计误差控制在约 2%（B8）。但做模型之间的比较时，这类方法的种子方差会显著上升（S5）。

---

## 5. C4：LLM-as-judge——用可核对断言式 rubric 代替 1–5 分；有基线时做随机顺序的盲评成对比较；评委不应是被测模型；同一输出评两次，看判决是否变化

### 5.1 来源

#### J1. Zheng et al. (2023). *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena.*
- 标识：arXiv:2306.05685；NeurIPS 2023 Datasets and Benchmarks Track（PDF 页脚）；URL https://arxiv.org/abs/2306.05685 。
- 取得：一手原文（精读摘要、§3.1、§3.3、§3.4、§4.2、§6 Limitations）。
- 关键引述：
  - 摘要："strong LLM judges like GPT-4 can match both controlled and crowdsourced human preferences well, achieving over 80% agreement, the same level of agreement between humans."
  - §3.1："single answer grading may be unable to discern subtle differences between specific pairs, and its results may become unstable, as absolute scores are likely to fluctuate more than relative pairwise results if the judge model changes."
  - §3.3："The position bias can be very significant. Only GPT-4 outputs consistent results in more than 60% of cases."
  - §3.3（自我偏好）："GPT-4 favors itself with a 10% higher win rate; Claude-v1 favors itself with a 25% higher win rate. However, they also favor other models and GPT-3.5 does not favor itself. Due to limited data and small differences, our study cannot determine whether the models exhibit a self-enhancement bias."
  - §3.4："Another more aggressive approach is to assign positions randomly, which can be effective at a large scale with the correct expectations."
- 成立前提：
  - MT-bench 共 80 道开放式对话题，评委是 2023 年的模型。
  - 一致率指「随机抽一题、各随机抽一个评委，二者判决相同的概率」；85% 这个数字（"reaches 85%"）来自不计平局的 S2 设定。
  - 位置偏差实验刻意构造了非常相近的两个回答。
- 与本情境的差异：随机分配顺序被表述为「在大规模下、按期望」有效；在 14 条工单上，随机顺序会把系统性的位置偏差变成额外噪声，而不是在均值里抵消（**本人推断**，依据同一句话里的 "at a large scale"）。
- 短板：§6："This paper emphasizes helpfulness but largely neglects safety."
- 立场：独立学术（LMSYS：Berkeley、UCSD、CMU、Stanford、MBZUAI）。

#### J2. Wang et al. (2023). *Large Language Models are not Fair Evaluators.*
- 标识：arXiv:2305.17926；URL https://arxiv.org/abs/2305.17926 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§2.2）。
- 关键引述：
  - 摘要："Vicuna-13B could beat ChatGPT on 66 over 80 tested queries with ChatGPT as an evaluator."
  - Figure 2（§2.2）："When swapping the order of two responses, the smaller the score gap between them, the more likely GPT-4 is to produce conflicting results."
- 与 C4 的关系：爬山过程中相邻两个版本的质量差往往很小，而这正是位置冲突最多的区间（**本人推断**）。
- 立场：学术+厂商（北京大学、香港大学、腾讯云 AI）。

#### J3. Shi, Ma, Liang, Diao, Ma, Vosoughi (2024). *Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge.*
- 标识：arXiv:2406.07791（arXiv Comments："AACL-IJCNLP 2025"）；URL https://arxiv.org/abs/2406.07791 。
- 取得：一手原文（精读摘要、§2.2、§4、附录 D）。
- 关键引述：
  - 摘要："The findings confirm that position bias is not due to random chance and varies significantly across judges and tasks. While position bias is weakly influenced by the length of prompt components, it is strongly affected by the quality gap between solutions."
  - §4："The most capable models, such as Claude-3.5-Sonnet, GPT-4, and Llama-3.3-70B, all achieve near-perfect RS scores over 0.95 on both benchmarks. These results confirm that judgments from capable LLM judges, and the resulting position bias, are not due to random variations."
- 与 C4「评两次」的关系（**直接的反面证据**）：用同样的输入重复评判，测到的是 *repetition stability*。强评委在这一指标上接近 1，但位置偏差依然系统性存在。所以「评两次判决不变」不能说明评判没有偏差。
- 立场：独立学术（Dartmouth）。

#### J10. Stureborg, Alikaniotis, Suhara (2024). *Large Language Models are Inconsistent and Biased Evaluators.*
- 标识：arXiv:2405.01724；URL https://arxiv.org/abs/2405.01724 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§3.4–3.5、Table 4）。
- 关键引述：
  - 摘要："We also found that LLMs are inconsistent evaluators, showing low "inter-sample" agreement and sensitivity to prompt differences that are insignificant to human understanding of text quality."
  - §3.4："the self-consistency is worse than the consistency between multiple human annotators."
  - Table 4：人类之间 Krippendorff's α 为 0.659，GPT-4 样本之间为 0.587。
- 与 J3 的关系：
  - 支持 C4「评两次」的一面：在逐项打分、温度大于 0 的设定下，同一输出的判决确实会变。
  - J3 的一面：在成对比较的设定下，强评委重复评判非常稳定，但偏差仍然存在。
  - 两者合起来说明，「评两次」能测出随机不一致，测不出系统性偏差。
- 立场：学术+行业（Duke、Grammarly、NVIDIA）。

#### J4. Panickssery, Bowman, Feng (2024). *LLM Evaluators Recognize and Favor Their Own Generations.*
- 标识：arXiv:2404.13076；URL https://arxiv.org/abs/2404.13076 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§5.2 Limitations）。
- 关键引述：
  - 摘要："By fine-tuning LLMs, we discover a linear correlation between self-recognition capability and the strength of self-preference bias"
  - §5.2："Self-preference can be justifiable if the LLM's generation is indeed higher quality than the alternative." 以及 "We focus on text summarization"
- 与 C4 的关系：支持「评委不应是被测模型」。
- 短板：任务只有摘要；因果链没有完全验证（"our experiments can only provide evidence towards the causal hypothesis without fully validating it"）。
- 立场：学术为主（MATS、NYU），**作者单位中含 Anthropic, PBC**。

#### J5. Wataoka, Takahashi, Ri (2024). *Self-Preference Bias in LLM-as-a-Judge.*
- 标识：arXiv:2410.21819（arXiv Comments："Accepted at NeurIPS 2024 Safe Generative AI Workshop"）；URL https://arxiv.org/abs/2410.21819 。
- 取得：一手原文（精读摘要与引言）。
- 关键引述（摘要）："LLMs assign significantly higher evaluations to outputs with lower perplexity than human evaluators, regardless of whether the outputs were self-generated."
- 与 C4 的关系（**限定**）：偏好的机制是「熟悉度」（低困惑度），不只是「是不是我写的」。换一个评委未必能消除偏好，只要被测输出对这个评委来说困惑度同样低。
- 立场：厂商研究（SB Intuitions）。

#### J6. Li et al. (2025). *Preference Leakage: A Contamination Problem in LLM-as-a-judge.*
- 标识：arXiv:2502.01534；ICLR 2026（PDF 页眉 "Published as a conference paper at ICLR 2026"）；URL https://arxiv.org/abs/2502.01534 。
- 取得：一手原文（精读摘要）。
- 关键引述（摘要）："we first define three common relatednesses between the data generator LLM and the judge LLM: being the same model, having an inheritance relationship, and belonging to the same model family. Through extensive experiments, we empirically confirm the bias of judges towards their related student models" 以及 "preference leakage is a pervasive and real-world problem that is harder to detect compared to previously identified biases"
- 与 C4 的关系（**限定**）：「不是同一个模型」不够，同家族模型或有继承关系的模型之间也有偏好泄漏。
- 立场：独立学术（ASU、UCLA、Notre Dame、UIUC）。

#### J7. Tripathi, Wadhwa, Durrett, Niekum (2025). *Pairwise or Pointwise? Evaluating Feedback Protocols for Bias in LLM-Based Evaluation.*
- 标识：arXiv:2504.14716；COLM 2025（PDF 页眉）；URL https://arxiv.org/abs/2504.14716 。
- 取得：一手原文（精读摘要、§1）。
- 关键引述（摘要）："we show that pairwise protocols are more vulnerable to distracted evaluation. Generator models can exploit spurious attributes (or distractor features) favored by the LLM judge, resulting in inflated scores for lower-quality outputs. … Pairwise preferences flip in about 35% of the cases, compared to only 9% for absolute scores."
- 与 C4 的关系（**反面**）：成对比较并不总比绝对打分稳健。在爬山这种生成方会被持续优化的场景里，这类干扰特征可能被学到（**本人推断**；该文的设定是向质量固定的回答注入干扰特征）。
- 立场：独立学术（UMass Amherst、UT Austin）。

#### J8. Lee et al. (2024). *CheckEval: A reliable LLM-as-a-Judge framework for evaluating text generation using checklists.*
- 标识：arXiv:2403.18771（arXiv Comments："EMNLP 2025"）；URL https://arxiv.org/abs/2403.18771 。
- 取得：一手原文（精读摘要、§9 Limitations）。
- 关键引述：
  - 摘要："We attribute this to subjective evaluation criteria combined with Likert scale scoring in existing protocols. … CheckEval dramatically improves the average agreement across evaluator models by 0.45 and reduces the score variance."
  - §9："not all NLG tasks and evaluation criteria can be strictly answered with a yes/no response."
- 与 C4 的关系：支持「断言式 rubric 优于 1–5 分」，至少在评委之间一致性这一点上。
- 立场：学术为主（Boston University、SNU、KAIST，另含 SK Telecom、NAVER）。

#### J9. Furuhashi, Nakayama, Kodama, Sugawara (2025). *Are Checklists Really Useful for Automatic Evaluation of Generative Tasks?*
- 标识：arXiv:2508.15218（arXiv Comments："Accepted to the EMNLP 2025 Main Conference"）；URL https://arxiv.org/abs/2508.15218 。
- 取得：一手原文（精读摘要）。
- 关键引述（摘要）："we find that selective checklist use tends to improve evaluation performance in pairwise settings, while its benefits are less consistent in direct scoring. Our analysis also shows that even checklist items with low correlation to human scores often reflect human-written criteria, indicating potential inconsistencies in human evaluation."
- 与 C4 的关系（**限定**）：清单式评估的收益取决于协议，而且是「选择性使用」时才有收益。
- 立场：独立学术/公共研究机构（东北大学、日本国立情报学研究所 NII）。

#### J11. Thakur et al. (2024). *Judging the Judges: Evaluating Alignment and Vulnerabilities in LLMs-as-Judges.*
- 标识：arXiv:2406.12624；GEM2 2025 Workshop, pp. 404–430（PDF）；URL https://arxiv.org/abs/2406.12624 。
- 取得：一手原文（精读摘要）。
- 关键引述（摘要）："only the best (and largest) models show reasonable alignment with humans, though they still differ with up to 5 points from human-assigned scores. Our research highlights the need for alignment metrics beyond percent agreement, as judges with high agreement can still assign vastly different scores." 以及 "a bias toward leniency"
- 与 C4 的关系：「与人工一致率高」不等于「分数接近」。
- 立场：学术+行业（UMass Amherst、Meta）。

#### J12. Gao, Schulman, Hilton (2022). *Scaling Laws for Reward Model Overoptimization.*
- 标识：arXiv:2210.10760；URL https://arxiv.org/abs/2210.10760 ；正式发表信息未核对。
- 取得：一手原文（精读摘要与 §1）。
- 关键引述（摘要）："Because the reward model is an imperfect proxy, optimizing its value too much can hinder ground truth performance, in accordance with Goodhart's law."
- 与 C4 的关系：以学到的评估器为优化目标时，这是 Goodhart 效应的实测证据。
- 与本情境的差异：该文的设定是 RL 和 best-of-n 对奖励模型做优化，「金标准」是一个合成的奖励模型，与「代理对 LLM 评委 rubric 爬山」不同。
- 立场：厂商研究（OpenAI）。

另见 B9：rubric 或参考答案本身的错误率，与 C1 的机制共用。

### 5.2 C4 的事实汇总

- **断言式 rubric**：能提高评委之间的一致性（J8）；但收益依赖协议，在直接打分时不稳定（J9）；并非所有标准都能写成是/否题（J8 §9）。
- **成对比较**：J1 认为成对比较比绝对分稳定；J7 发现成对比较更容易被干扰特征翻转（35% 对 9%）。位置偏差在两个回答质量接近时最强（J2、J3）。随机分配顺序只在「大规模、按期望」下有效（J1 §3.4）。
- **评委与被测模型分离**：自我偏好有证据（J4），但 J1 在其数据上未能确认；偏好的机制可能是熟悉度（J5）；同家族或有继承关系的模型也会泄漏偏好（J6）。
- **评两次**：能测出随机不一致（J10），测不出系统性偏差（J3）。
- **与人工一致率**：在 MT-bench 上 GPT-4 对人类的一致率达到人与人之间的水平（J1）；但高百分比一致不代表分数接近（J11）。

---

## 6. C5：好评估的四要素——贴近生产分布、分数随模型能力与 effort 上升、前沿仍有余量、运行间方差低

### 6.1 来源

#### V1. Raji, Bender, Paullada, Denton, Hanna (2021). *AI and the Everything in the Whole Wide World Benchmark.*
- 标识：arXiv:2111.15366；NeurIPS 2021 Datasets and Benchmarks Track（PDF）；URL https://arxiv.org/abs/2111.15366 。
- 取得：一手原文（只精读了摘要与引言）。
- 关键引述（摘要）："we explore the limits of such benchmarks in order to reveal the construct validity issues in their framing as the functionally "general" broad measures of progress they are set up to be."
- 与 C5 的关系：支持「贴近真实用途」这一要素；它批评的对象是通用基准。
- 立场：学术+行业研究（Mozilla、UC Berkeley、UW、Google Research）。

#### V2. Bean et al. (2025). *Measuring what Matters: Construct Validity in Large Language Model Benchmarks.*
- 标识：arXiv:2511.04703；NeurIPS 2025 Datasets and Benchmarks Track（PDF）；URL https://arxiv.org/abs/2511.04703 。
- 取得：一手原文（精读摘要、§4、§5.1–5.3）。
- 关键引述：
  - §4："16.0% used uncertainty estimates or statistical tests to compare the results."
  - §5.3："Employ sampling strategies to ensure task items are representative of the overall task space" 以及 "27.0% of reviewed benchmarks used convenience sampling"
- 与 C5 的关系：支持「代表性抽样」这一要素。放到 C1 的语境下，按失败挑选用例属于非代表性抽样（**本人归类**）。
- 立场：独立学术（Oxford 主导，含 UK AI Security Institute 等）。

#### V3. Ott, Barbosa-Silva, Blagec, Brauner, Samwald (2022). *Mapping global dynamics of benchmark creation and saturation in artificial intelligence.*
- 标识：arXiv:2203.04592；Nature Communications 13:6793 (2022)（期刊信息来自检索结果，未打开期刊页）；URL https://arxiv.org/abs/2203.04592 ，https://www.nature.com/articles/s41467-022-34591-0 。
- 取得：一手原文（arXiv 全文；只精读了摘要与引言）。
- 关键引述（摘要）："a large fraction of benchmarks quickly trended towards near-saturation, that many benchmarks fail to find widespread utilization, and that benchmark performance gains for different AI tasks were prone to unforeseen bursts."
- 与 C5 的关系：支持「前沿仍有余量」这一要素的必要性。
- 立场：独立学术（维也纳医科大学、Oxford）。

#### S5. Madaan et al. (2024). *Quantifying Variance in Evaluation Benchmarks.*（C5、C6 共用）
- 标识：arXiv:2406.10229；URL https://arxiv.org/abs/2406.10229 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§3.2、§5）。
- 关键引述：
  - 摘要："we rarely quantify the variance in our evaluation benchmarks, which dictates whether differences in performance are meaningful." 以及 "more involved methods inspired from human testing literature (such as item analysis and item response theory) struggle to meaningfully reduce variance."
  - §3.2："Benchmarks with few test examples (like COPA and HumanEval) exhibit high variance (both seed variance and 95% CIs)."
- 成立前提：研究的是预训练检查点和 7B 模型的种子方差，不是代理运行的方差。
- 立场：厂商研究（Meta GenAI 主导，含 UCL、Stanford、Cohere 作者）。

#### S6. Heineman et al. (2025). *Signal and Noise: A Framework for Reducing Uncertainty in Language Model Evaluation.*（C5、C6 共用）
- 标识：arXiv:2508.13144；URL https://arxiv.org/abs/2508.13144 ；正式发表信息未核对。
- 取得：一手原文（精读摘要、§3 标题段）。
- 关键引述（摘要）："signal, a benchmark's ability to separate better models from worse models, and noise, a benchmark's sensitivity to random variability between training steps. We demonstrate that benchmarks with a better signal-to-noise ratio are more reliable when making decisions at small scale" 以及 "switching to a metric that has better signal and noise (e.g., perplexity rather than accuracy) leads to better reliability"
- 与 C5、C6 的关系：「分数随能力上升」大致对应这里的 signal，「低运行间方差」对应 noise，二者之比才预测决策是否可靠。该文的场景是预训练决策。
- 立场：非营利研究机构（AI2，同时开发开源模型），含 UW 作者。

#### S7. Schaeffer et al. (2023)（C5 部分）
- 关键引述（摘要）："nonlinear or discontinuous metrics produce apparent emergent abilities, whereas linear or continuous metrics produce smooth, continuous, predictable changes in model performance."
- 与 C5 的关系（**限定**）：「分数是否随能力平滑上升」不只由题目决定，也由评分方式决定（全对/全错 vs 连续分）。

#### V4. Ren et al. (2024). *Safetywashing: Do AI Safety Benchmarks Actually Measure Safety Progress?*
- 标识：arXiv:2407.21792（arXiv Comments："NeurIPS 2024"）；URL https://arxiv.org/abs/2407.21792 。
- 取得：一手原文（精读摘要、§3 方法定义）。
- 关键引述（摘要）："many safety benchmarks highly correlate with both upstream model capabilities and training compute, potentially enabling "safetywashing"—where capability improvements are misrepresented as safety advancements."
- 与 C5 的关系（**反面/限定**）：以「分数随模型能力上升」作为好评估的标准，会偏向选出主要测通用能力的评估；当目标属性按定义与通用能力可分（V4 对 safety 的界定）时，这恰恰是效度问题。这条标准是否可取，取决于评估要测的构念是不是能力本身。
- 立场：非营利（Center for AI Safety）+ 学术（UPenn、Berkeley、Stanford、Yale、Keio）。

#### V5. Thomas & Uminsky (2020). *Reliance on Metrics is a Fundamental Challenge for AI*（arXiv 标题：*The Problem with Metrics is a Fundamental Problem for AI*）
- 标识：arXiv:2002.08512（arXiv Comments："Accepted to EDSC (Ethics of Data Science Conference) 2020"）；URL https://arxiv.org/abs/2002.08512 。
- 取得：一手原文（只精读了摘要）。
- 关键引述（摘要）："overemphasizing metrics leads to manipulation, gaming, a myopic focus on short-term goals, and other unexpected negative consequences."
- 立场：独立学术（University of San Francisco）。

#### V6. Manheim & Garrabrant (2018)（C5 部分）
- 引言中列出四类 Goodhart 效应："1) Regressional, … 2) Extremal, where selection for the metric pushes the state distribution into a region where old relationships no longer hold, 3) Causal, … 4) Adversarial"
- 与 C5 的关系：四要素描述的是评估**在被优化之前**的性质。经过 24 轮以这个评估为目标的优化之后，Extremal Goodhart 描述的正是「旧有关系不再成立」的情形。四要素本身没有覆盖这个时间维度（**本人归纳**）。

另见：B2 §3.3 的统计功效论证（"if our benchmark datasets contain many examples that are easy for current or near-future systems, then we will need dramatically larger evaluation sets to reach adequate power"）；A10 关于随机切分过于乐观；A11 的 holdout 层级；B7 关于区分度的 IRT 解释（"most of the discriminative examples are either very easy or very difficult"）；B6 关于对抗分布与自然分布的差异。

### 6.2 C5 的事实汇总

- **四要素各自有学术对应**：
  - 贴近生产分布 ↔ 构念效度和代表性抽样（V1、V2）
  - 分数随能力上升 ↔ 信号或区分度（S6、B7）
  - 前沿余量 ↔ 饱和研究（V3、B7）
  - 低运行间方差 ↔ 噪声或种子方差（S5、S6）
- **要素之间的张力**：
  - 「贴近生产分布」与「前沿余量」可能冲突：自然分布里简单样本多，要达到足够功效就需要更大的集合（B2 §3.3）；而按失败挑样来制造余量，又会破坏代表性（C1 的来源）。
  - 「分数随能力上升」在目标构念按定义与能力可分时，会变成效度问题（V4）。
  - 「是否平滑上升」还取决于评分方式（S7）。
- 以上文献都没有给出「四要素足以构成好评估」的论证。

---

## 7. C6：开跑前检查噪声是否小于「值得行动的最小改进」

### 7.1 来源

- **S1**（厂商研究，Anthropic）§5：给出 MDE 公式 (9)(10)，并说明 "If the number of questions is fixed, … consumers can calculate the Minimum Detectable Effect and decide whether the eval is worth running." 这与 C6 在形式上一致。
- **S3**（独立学术）：功效分析在 NLP 中的必要性，以及 Type-M/Type-S 误差（见 §4.1）。
- **S6**（AI2）：用信噪比预测决策准确性（见 §6.1）。
- **S5**（Meta）§3.2："Generally, the 7B seed variance is well below the 95% CI for the same benchmark, though the ratio of the two is quite variable." 这说明「噪声」的定义（种子或运行间方差，还是抽题带来的置信区间）会让门槛相差很大。
- **A2**（独立学术）：Ladder 规则「只有超过 s/√n 的改进才计入」是同一思想的自适应版本，而且它有针对反复使用的理论保证（见 §3.1）。
- **S2**（独立学术，**限定**）：如果噪声用 CLT 估计，n 小时会被低估（"usually dramatically underestimating uncertainty"）。在这种情况下，「噪声小于门槛」的检查本身可能给出错误的放行。
- **A1、A3**（**限定**）：开跑前的一次性噪声估计是非自适应的；多轮以 test 分数为依据做决策之后，经典置信界不再适用（A3 §1）。所以开跑前的噪声检查并不覆盖自适应复用带来的偏差。

### 7.2 本人计算（与 §4.2 (v) 相同的数）

- 按 S1 eq.(10) 和 S1 示例的方差参数：
  - n=14、K=3 时 MDE ≈ 35pp
  - n=30、K=3 时 MDE ≈ 24pp
- 按 A2 的 1/√n 尺度：n=14 为 0.27，n=30 为 0.18。
- 按 S7 的分辨率：n=14 时单次评估的最小刻度是 7.1pp。
- 说明：S1 的方差参数是虚构示例，这批工单的实际方差没有来源可以核对。

### 7.3 C6 的事实汇总

- 学术文献普遍支持在开跑前做功效或 MDE 检查（S1、S3、S6），这与 C6 一致。
- 限定一：噪声的估计方法本身在小 n 下不可靠（S2）。
- 限定二：「噪声」的口径有两种，结果差异很大（S5）——一种是运行间方差，另一种是抽题带来的抽样方差。
- 限定三：开跑前的检查不覆盖多轮自适应使用 test 带来的额外偏差（A1、A2、A3）。

---

## 8. 未决问题

1. **90.5% 与 78.6% 的数据结构**：由百分比反推，最小公共分母是 42 = 14×3，但是否真是每条工单 3 次运行、是否按工单配对比较、是否用了簇调整，需要读博客原文或附带数据才能确认。
2. **66.1% → 87.9% 这一例**：最小公共分母是 124，不是 14、30、44 的倍数。评分单位是什么，是否在同一 test 上逐轮测，都无法从百分比推出。
3. **最终报告的 test 分数**：是选中之后在 test 上重新跑一遍的分数，还是历轮观察值中的最大值？按 §3.4(b) 的玩具模拟，两者的乐观偏差量级不同。
4. **评委与被测代理是否同一家族**：J6 的偏好泄漏对同家族模型成立；博客的具体配置未知。
5. **44 条工单的来源**：是从生产流量里随机抽取的，还是按「当前模型做错」挑出的？这决定 C1 的来源是否直接适用于这个示例本身。
6. **直接研究的缺口**：没有找到研究「LLM 代理在几十条 holdout 上、以 test 分数做保留/回退、爬 20–30 轮」的一手学术文献。最接近的是 A13，但它的验证集是 n=5,000，且优化对象不同。A7 的「10,000 条」门槛和 A13 的正面结论能否外推到 n≈14，没有文献依据。
7. **代理任务的运行间方差**：没有来源测量过客服工单类代理任务在逐条用例层面的运行间方差或簇内相关 ρ。S5、S6 的方差数据都来自预训练基准。
8. **patch 之间的相似度**：A4 的「模型相似性减轻过拟合」依赖可测的预测一致率；同一代理相邻 patch 的一致率没有数据。

---

## 9. 检索过但无果、或未使用的位置

- **Brown, Cai & DasGupta (2001), "Interval Estimation for a Binomial Proportion", *Statistical Science* 16(2)**：
  - projecteuclid.org 的 HTML 和 PDF 页被 Incapsula 拦截，只拿到 1,158 字节的脚本页。
  - Wharton 镜像（www-stat.wharton.upenn.edu）连接失败（No route to host）。
  - 因为未读到原文，本报告没有把它当作来源。Wilson 区间的公式与小样本表现引自 S2 附录 A.2 及其 §3.1。
- **Dwork et al. 2014, "Preserving Statistical Validity in Adaptive Data Analysis"（arXiv:1411.2664）**：已下载，但没有精读，未列为来源；相关结论改由 A1 引用。
- **Leaderboard Illusion（A12）的平台方回应**：属于厂商博客或平台声明，不在本域，未检索。
- **Phang et al. (B1)、Mania et al. (A4)、Recht et al. (A5)、Wang et al. (J2)、Panickssery et al. (J4)、Schaeffer et al. (S7) 等的正式发表信息**：arXiv 页的 Comments/Journal-ref 字段为空，未进一步核对，报告中一律写作「未核对」。
- **提示优化过拟合的检索**：搜索 "arXiv prompt optimization overfitting to validation set small held-out generalization gap study" 返回的结果里，下面几条只看到了搜索摘要，未打开，也未使用：
  - "Hyperband-based Bayesian Optimization for Black-box Prompt Selection"（arXiv:2412.07820）
  - "p1: Better Prompt Optimization with Fewer Prompts"（arXiv:2604.08801）
  - "Are Prompt Optimizers Blind?"（arXiv:2607.24354）
  - "Robust Prompt Optimization for Large Language Models Against Distribution Shifts"（arXiv:2305.13954）
- **各来源的 Limitations 节**：除条目中注明者外，对多数来源的后续批评没有做系统的引文追踪（forward citation search）。已查阅的反面材料都在条目的「短板与反面」一栏列出。

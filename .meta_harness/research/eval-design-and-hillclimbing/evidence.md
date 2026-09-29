# 可复核的来源与观察

版本 token（上游换版本时 grep 这些）：博客抓取 `2026-09-29`（发布 `Sep 28, 2026`，etag `2fe6e87bede1563e94544b8615425ea8`）；
`anthropics/skills@8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4`（2026-09-28T19:20:03-07:00，PR #1930）。
独立来源各自的版本或抓取日期写在对应记录里。

原样字节在 [sources/](sources/)，逐文件来历见 `sources/provenance.json`，校验：

```bash
cd .meta_harness/research/eval-design-and-hillclimbing/sources && sha256sum -c SHA256SUMS
```

记录分三组：**V** 厂商侧（博客、技能正文、文内引文，本轮主会话逐字读过原文）、**P** 本轮自算、
**L**／**E** 独立来源（学术与工程两路并行调研带回，逐条标明主会话是否复核过原文）。

## V1 博客原文

《Automating eval design and hillclimbing with Claude》。

- 消费对象：[research.md](research.md) 的 C-1、C-3、C-4、C-5、C-8、C-9。
- 来源与精确修订：<https://claude.dev/blog/automating-eval-design-and-hillclimbing/>，作者 Lance Martin，页面标注 `PUBLISHED Sep 28, 2026`；
  2026-09-29 06:58 GMT 抓取，HTTP 200，108327 字节，SHA256 `dfe8158738b80ef85313ede052e41b9dfbf3a3aae6555938d6064b650777239e`。
  原样字节：`sources/blog/claude-dev-automating-eval-design-and-hillclimbing-2026-09-29.html.txt`。
- 来源立场：厂商自述。它只证明 Anthropic 宣称什么、其技能打算怎么做；示例数字出自厂商内部基准，外部无法复跑。
- 取得方式：`curl -sSL -A "Mozilla/5.0"` 原样落盘，主会话去标签后通读全文；图只读到 `alt` 文本，未看图像本身。
  另有一次 WebFetch 的小模型转述，只用来对照是否漏节，不作证据。
- 实际观察（按原文小节）：
  - **Eval design**：四要素——「Eval tasks mirror production」「Performance improves with stronger models and more thinking」
    「There is “passable” headroom at the frontier」「Low run-to-run variance」。关于余量的限定原文：
    “the gap should not be explained by impossible or ambiguous tasks: a common tell is that a task fails every evaluation run, regardless of the number of replicates.”
  - **Adversarial sampling**：“If you pick cases because today's model fails them, you are sampling the valleys of one model's capability surface …
    The evaluation can end up measuring that model's failure fingerprint rather than what is intrinsically hard or valuable for your application to do.”
    随后：“Pick hard cases because a human judged them hard”；以及对生产流量的保留：“users sometimes try what they expect to work,
    so a task distribution drawn strictly from user traffic may skew easy.” 本节**没有给出数据或引文**，只有一张示意图（Figure 2）。
  - **build-eval**：输入来源四级次序；判分器「cheapest grader that fits」；LLM 评委读「a rubric written as checkable claims (not a 1-to-5 scale)」；
    有基线时随机顺序盲评；“You pick the judge model, and it should not be the model you are testing.”；
    诊断三项（同一输出评两次、管道错误、基线约 95% 以上时提示转向成本或延迟）。
  - **Hillclimbing**：选表面的三条——Cheap iteration、Attributable、Well-scoped objective；
    “open-ended modifications to an agent harness during hillclimbing may involve extensive code changes”；
    “an evaluation that’s near saturation or a poorly scoped surface (e.g., an open-ended request to update the harness) is more likely to stall.”
  - **Overfitting**：三条对策原文——“Use a train set that the hillclimber may read and a test set that is never seen”；
    “Never paste failures into the prompt”；“Keep the answers structurally out of the model's reach.”
  - **hillclimb 流程**：“if the train set improves but the test set is flat, Claude suspects overfitting and reverts the patch. If there is a regression, Claude reverts.
    If train and test sets improve, it keeps the patch”；“When hillclimbing completes, Claude leaves your code at the version that did best on the test set for your goal.
    It reports the test result against the baseline with confidence intervals”；“If the gain is within noise, it says so and recommends against merging.”
  - **示例一（成本）**：44 张工单，30 用于搜索、14 留出；Opus 4.8 high 起点 74.4%、4.6¢／单 → Opus 5.5 low 87.8%、1.9¢ → Sonnet 5 low 88.9%、1¢
    → 改提示词后 98.9%（以上均为搜索集）；留出集最终配置 90.5% 对原始配置 78.6%，成本约五分之一。**全段未给任何置信区间，也未说明每单重复次数。**
  - **示例二（性能）**：claude-api 技能自身，评估集「derived from our documentation」；66.1% → 第 24 轮 87.9%（Figure 9 的 `alt`）。
    中途改过评估本身：“One task asked for code that catches one error type, while its grader wanted a chain of at least three. Claude reworded the task.
    Another grader's instructions contradicted our docs …”。**全段未提 train/test 切分、留出集分数或区间，也未说改判分器后基线是否重评。**
- 支持范围：支持「厂商主张这些原则、其技能按此流程设计」。不支持「这些原则已被独立验证」「示例的提升幅度可推广」。
  示例一只有一个内部基准、一次搜索；示例二报告的是单一口径的通过率曲线。
- 后续核对：页面可原地改写（同站另一篇有 `Update:` 记录，见 V5）；复核时比对 SHA256，不一致即逐段重读。

## V2 技能正文 eval-hillclimb

- 消费对象：[research.md](research.md) 的 C-1、C-2、C-5、C-6、C-9。
- 来源与精确修订：`anthropics/skills@8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4`，`skills/claude-api/shared/evals/eval-hillclimb.md`（68773 字节，338 行）。
  原样字节：`sources/skill/anthropics-skills-8a1541c__claude-api_shared_evals_eval-hillclimb.md.txt`。下文行号指这份文件。
- 来源立场：厂商自述，但这是**模型实际被要求执行的指令**，比博客更接近真实行为；它仍不是运行记录——本轮没有跑过这两条命令。
- 取得方式：`git clone --depth 1 https://github.com/anthropics/skills.git`，`git log -1` 取 SHA；主会话通读全文。
- 实际观察：
  - **test 每轮都被打分并用于选择**（L207）：“*Test* is everything else: scored every round alongside train, never opened by the analyzer;
    its score picks the winning round and is the headline.” `SKILL.md` L518 同义：“test is scored every round and is the headline.”
  - **不受选择污染的数字是可选项**（L209）：“Large set (~150+ cases) where you want a final number untouched by round selection:
    optionally carve a third *validation* slice … For most evals the extra bookkeeping isn't worth it.”
  - **小集合不切分**（L208）：“Small set, or a cross-case metric … Don't split. Score the whole set every round, lean on **reps** …
    with no held-out set the headline is an iterate-on number, not a publish number.”
  - **区间经验式**（L211）：“For a binary pass-rate the 95% CI half-width is roughly `1/sqrt(n·reps)` - 25 test cases at 2 reps is about ±14 points, 50 at 2 reps about ±10”。
  - **切分方式**（L207）：随机、按 `tags[0]` 分层、“never by baseline score”；理由是按低分挑 train 会带来 regression to the mean。
  - **答案隔离必须是结构性的**（L215）：“This has to be structural; "don't look at the answers" in a prompt is not a defense, and an agent under optimization pressure
    will eventually find a `cat evals.json` that wins the game without playing it.” 公开基准加联网工具时答案经互联网可达，
    “don't assume any automated contamination check will catch it.”
  - **train/test 墙靠交接时的文件清单与指令**（L227、L243）：分析子代理被给到 train 的 trace 路径并被告知
    “not to read anything else under `traces/`”；L243 明说 “the train/test wall is enforced at hand-off … not by withholding test traces from disk”。
    L229 把这称作 “the data-isolation guarantee”。
  - **「不贴失败内容」是给分析者的提示**（L231）：“generalize, don't memorize … pasting specific nouns or phrases from train cases into the prompt
    is the fastest route to an overfit change”。正文没有描述任何机械检查。
  - **保留与回退规则**（L273）：train 涨 test 不涨 → 回退；train 也退 → 回退；train 降而 test 升 → “treat it as noise at low rep counts - keep the change only if the pattern repeats on a second run”。
  - **开跑前的可爬性证明**（L35）：把 noise floor、headroom、smallest improvement they'd act on 三个数摆出来；
    L41 记了一次实例：同一提示词的三次构建相差约 7 点，而重评噪声约 ±1.4，“the loop could not tell any of them from the default”。
  - **停滞时分桶**（L281–L300）：五桶（Artifact gap／Grader disagreement／Harness-infra／Structural／Variance）；
    改判分器后须 “re-grade *every* variant in place”，若排名翻转则 “propose restarting the loop from baseline”（L288）。
  - **平台期阈值两处说法**：Step 2 的 L91 写 “K >= 3 - two flat rounds is too few to call a plateau”；Step 4.5 的 L281 写 “two or three consecutive rounds”。
  - **评委被钻空子的告警**（L269）：“An LLM judge being gamed looks exactly like a breakthrough until you check.”
  - **安全边界**（L13）：无人值守轮次靠会话 allowlist 放行 runner 命令，“it is the security boundary for the loop”；
    harness 完整性门只是变更检测，“it cannot stop an agent that can already write anywhere the user can”。
- 支持范围：支持「技能文本规定了什么」。不支持「模型实际总会照做」——指令遵从率本轮未测。
- 后续核对：技能随仓库提交变动；复核时 `git log -- skills/claude-api/shared/evals/`，SHA 变了就重读差异。

## V3 技能正文 build-eval 与 eval-audit

- 消费对象：[research.md](research.md) 的 C-4、C-7、C-9。
- 来源与精确修订：同 V2 的提交；`build-eval.md`（54819 字节，233 行）与 `eval-audit.md`（27892 字节，204 行），原样字节在 `sources/skill/`。
- 来源立场：厂商自述（执行指令）。
- 取得方式：同 V2，主会话通读全文。
- 实际观察：
  - **规模**（build-eval L54）：首个评估 “between fifteen and a hundred inputs”；要爬山则按想检测的变化来定规模。
  - **合成用例的自述短板**（build-eval L52）：“Evals synthesized with nothing real to anchor on come out simplistic”。
  - **生产数据的可保留性**（build-eval L49）：“An eval built on data the user can't keep is an eval they can't re-run next quarter - that's worse than a synthetic one they can.”
  - **审阅页面**（build-eval L58）：默认给 markdown 文件或走 report builder，“Don't author an ad-hoc HTML page for this”，理由是用例文本不可信、可能带 `<script>`。
    博客（V1）的说法是 “generate a simple page that shows you every input”，未提这层限制。
  - **代理类应用判终态**（build-eval L80；eval-audit L149）：“A judge reading a coding transcript is grading the narration; the environment is the answer.”
  - **评委偏差清单**（eval-audit L173–L179）：position bias、verbosity bias、self-preference（“consider a different family or a small jury for close calls”）、
    label deference；**人工校准门槛**：“Validate the judge on a few dozen cases a human labelled independently and report agreement.
    Well below ~90% on clear-cut cases means the judge prompt needs another iteration”。博客只写到「同一输出评两次」与「读一批转录」，没有提人工一致率。
  - **成对评委的盲区**（build-eval L81）：“a per-case pairwise judge structurally cannot see a cross-case mode collapse”。
  - **金标来源**（eval-audit L61）：“Never use model A's outputs as gold when the question is A vs B.”
  - **饱和之后测到什么**（eval-audit L77）：“remaining variance is dominated by format quirks, grader tie-breaking, or mild reward-hacking rather than capability.”
  - **噪声地板算式**（eval-audit L185）：“the half-width of the paired-difference 95% CI at the current n × R (for a pass-rate, roughly `1/sqrt(n·R)` …)”。
  - **oracle／null 自检**（build-eval L175；eval-audit L123）。
  - **正文里没有「按当前模型失败挑用例」这一条的对应检查**：对 `shared/evals/` 四份文件检索 `adversarial`、`valley` 无命中，`fingerprint` 只命中 eval-hillclimb L219 的 “environment fingerprint”（语义无关）；
    最接近的是 eval-audit L187 对 *train 切片* 不得按基线分数挑的要求，对象是切分而非用例入选。
- 支持范围：同 V2。最后一条是「该读的地方读遍了没找到」级的负面观察，检索范围限于 `shared/evals/` 四份文件。

## V4 技能正文 cost-hillclimb

- 消费对象：[research.md](research.md) 的 C-1。
- 来源与精确修订：同 V2 的提交；`cost-hillclimb.md`（31574 字节），原样字节在 `sources/skill/`。
- 来源立场：厂商自述（执行指令），含两次内部迁移的回放。
- 取得方式：同 V2；主会话读了 L186–L215、L326–L370 两段并对全文做了关键词检索，**未通读全文**。
- 实际观察：
  - **选择集不是留出集**（L356–L358）：“**Selection set != holdout.** The split whose score picks winners each round is a selection set,
    even if the guide calls it "test". Pre-register confirm runs for the headline and expect train->holdout shrinkage.”
  - **逐轮选择会高估合并收益**（L343–L346）：“three sequential selections, each made on the data that chose it, overstate the combined win,
    so the confirm's number - not the per-round selection scores - is the headline.”
  - **一次确认失败的实例**（L205–L211）：同一配置在选择轮得 11/20，三次新跑得 11、6、11；
    结论写作 “cost cut firm, mean quality comparable within noise, NOISIER than baseline”。
  - **只登记质量的爬山抬高了成本**（L364–L366）：“a quality-only climb raised cost per deliverable by 75% in one measured search.”
  - **三道采用门须在第 1 轮前登记**（L328–L341）：Quality band、Cost margin、Mechanism。
- 支持范围：支持「厂商自己的成本指南承认 test 被用作选择集、并要求另跑确认」。实例数字出自厂商内部，未见原始数据。
- 后续核对：同 V2。

## V5 文内引文两篇

- 消费对象：[research.md](research.md) 的 C-2、C-3、C-6。
- 来源与精确修订：
  - <https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>，页面标注 `Published Jan 09, 2026`，2026-09-29 抓取，
    SHA256 `129d33119fd9fc4800cf15e6d767c9f618ddd6943a907db70e4dadc7f81d5301`。
  - <https://claude.com/blog/reducing-cost-and-improving-performance-with-claude-platform>，页内 `Update:` 写明初版 2026-09-08、其后为 Opus 5.5 重跑过部分基准，
    2026-09-29 抓取，SHA256 `1812ff6794b783fb3627c1b85fc0c7eecad5afa2587b72d3f2eeacc3f0248816`。
  - 原样字节均在 `sources/blog/`。
- 来源立场：厂商自述。
- 取得方式：`curl` 原样落盘；主会话去标签后读了前者「non-determinism」至「Step 8」各节、后者「Effort」一节与 `Update:` 段，其余未读。
- 实际观察：
  - 前者：“20-50 simple tasks drawn from real failures is a great start … this large effect size means small sample sizes suffice.
    More mature agents may need larger, more difficult evals to detect smaller effects”。
  - 前者给了两个评估自身出错的实例：Opus 4.5 在 CORE-Bench 上 42% → 修判分与任务后 95%；METR 的任务写「达到阈值」而判分要求「超过阈值」。
  - 前者关于状态泄漏：“in some internal evals we observed Claude gaining an unfair advantage on some tasks by examining the git history from previous trials.”
  - **同一基准的两种讲法**：后者写 “The hillclimber first tried Opus 5 at low effort … That cleared the Opus 4.8 baseline at 98.9% train accuracy and cut cost to 2.6 cents per ticket.
    … It then stepped down to Sonnet 5 at low effort … but accuracy fell to 88.9%.”；V1 写 Opus 5.5 low 为 87.8%、1.9¢，Sonnet 5 low “scored about the same, 88.9%”。
    两文的留出集结论一字不差（90.5% 对 78.6%，约五分之一成本）。
- 支持范围：两文的中间路径不同、终点相同，与后者 `Update:` 所述「重跑并改用 Opus 5.5」相容；
  **不支持**对 Opus 5 与 Opus 5.5 在该基准上的差异下任何结论——两次运行的提示词版本、重复次数都未公开。

## P1 本轮自算

- 消费对象：[research.md](research.md) 的 C-3。
- 来源与精确修订：输入取自 V1 示例一的六个百分数；脚本 `sources/probe/wilson.py`，输出 `sources/probe/wilson-output.txt`，Python 3.8.10。
- 来源立场：本轮主会话的计算，**不出自任何来源**。
- 取得方式：`python3 wilson.py`。
- 环境与前提：博客未给分母。六个百分数恰好都能写成整数比——留出集 38/42、33/42，搜索集 67/90、79/90、80/90、89/90——
  与「每单 3 个判分单元」（3 次重复，或每单 3 个判分点）相容。**这是由数字反推的假设，不是原文事实。**
- 实际观察：

  | 量 | 点估计 | Wilson 95% 区间（把 42 或 90 个单元当独立样本） |
  |---|---|---|
  | 留出集，最终配置 38/42 | 90.5% | 77.9%–96.2% |
  | 留出集，原始配置 33/42 | 78.6% | 64.1%–88.3% |
  | 搜索集，基线 67/90 | 74.4% | 64.6%–82.3% |
  | 搜索集，最终 89/90 | 98.9% | 94.0%–99.8% |

  留出集差值 11.9 点；非配对独立近似的 95% 半宽 ±15.3 点；按技能自己的经验式 `1/sqrt(n·R)`（V2 L211、V3 L185），n=14、R=3 时为 ±15.4 点。
- 支持范围：在上述假设下，留出集上两个配置的准确率区间重叠，差值小于技能自定的噪声地板。
  同一工单的多个判分单元并不独立，真实区间只会更宽，不会更窄；配对设计能收窄差值区间，但收窄多少取决于未公开的逐单结果。
  **不支持**「最终配置的准确率不如原始配置」——点估计方向是改善；也不触及成本结论，成本差是另一个量。
- 后续核对：若厂商公布逐单结果或分母，本记录按实际数字重算。

## 独立来源的读法

以下两组来自并行调研的两路子代理。**子代理的报告是模型输出，不是证据**：它们的原貌存在
[首轮报告的 notes/](reports/2026-09-29-first-round/notes/)，这里只登记被 [research.md](research.md) 实际引用的来源，并逐条标明复核状态——

- **已复核**：主会话在 2026-09-29 独立重新下载了该来源（不复用子代理的副本），把表中引文规范化空白与连字后在全文里逐字命中。
  下载副本未随包保存，其 SHA256 记在 `sources/provenance.json` 的 `verified_not_stored`。
- **仅转述**：只见于子代理报告，主会话未核原文。下游不得把这类条目单独当作事实引用。

编号在子代理报告的原编号前加前缀：学术一路 `L-`，工程一路 `E-`，便于回到 notes 里找完整条目。
两路的查重结果：无同一来源被两路重复提交；MT-Bench 的偏差数字在学术一路为原文（L-J1），在工程一路为 Eugene Yan 的转引，按一份证据计。

## L 学术与统计文献

- 消费对象：[research.md](research.md) 的 C-1、C-2、C-3、C-4、C-7。
- 取得方式：子代理从 arXiv、ACL Anthology、JMLR、NeurIPS Proceedings 下载 PDF 并用 `pypdf` 抽文本；多数只精读了摘要、引言与被引章节。
  主会话的复核同样走 PDF 全文。
- 来源立场：逐条见表。L-S1 出自 Anthropic，与被检验的博客同属一家，不算独立来源。

| 编号 | 来源与精确标识 | 立场 | 被引用的原文 | 复核 |
|---|---|---|---|---|
| L-A1 | Dwork 等，*Generalization in Adaptive Data Analysis and Holdout Reuse*，[arXiv:1506.02629](https://arxiv.org/abs/1506.02629) | 独立学术（理论） | “Reusing a holdout set adaptively multiple times can easily lead to overfitting to the holdout set itself.”；自适应复用的情形含 “checking a stopping condition, and analyst-in-the-loop decisions” | 已复核 |
| L-A2 | Blum、Hardt，*The Ladder*，[arXiv:1502.04585](https://arxiv.org/abs/1502.04585) | 独立学术 | “it only releases a score to the participant if the score presents a statistically significant improvement over the previously best submission”；对真实 Kaggle 数据：“little overfitting occurred” | 已复核（两句）；Theorem 5.1 的 Ω(√(k/n)) 仅转述 |
| L-A3 | Hardt，*Climbing a shaky ladder*，[arXiv:1706.02733](https://arxiv.org/abs/1706.02733) | 独立学术 | “The lack of independence between model and holdout data is what invalidates classical confidence bounds for the holdout setting.” | 仅转述 |
| L-A5 | Recht 等，*Do ImageNet Classifiers Generalize to ImageNet?*，[arXiv:1902.10811](https://arxiv.org/abs/1902.10811) | 独立学术 | “the accuracy drops are not caused by adaptivity” | 仅转述 |
| L-A7 | Roelofs 等，*A Meta-Analysis of Overfitting in Machine Learning*，NeurIPS 2019，[PDF](https://papers.nips.cc/paper_files/paper/2019/file/ee39e503b6bedf0c98c388b7e8589aca-Paper.pdf) | 独立学术 | “little evidence of substantial overfitting”；“contains a public test set of size 90. Very small (effective) test sets make it easier to reconstruct the public / private split (and then to overfit)”；“at least 10,000 examples is a reasonable minimum test set size to protect against adaptive overfitting” | 已复核 |
| L-A8 | Cawley、Talbot，*On Over-fitting in Model Selection and Subsequent Selection Bias in Performance Evaluation*，[JMLR 11](https://jmlr.org/papers/v11/cawley10a.html) | 独立学术 | 选择偏差 “often of comparable magnitude to differences in performance between learning algorithms” | 仅转述 |
| L-A13 | Bertran、Roth、Wu，*What Fits (Into Few Tokens) Doesn't Overfit*，[arXiv:2606.11045](https://arxiv.org/abs/2606.11045) | 厂商研究（Amazon） | “one-bit feedback”；压力测试下 “across 102 checkpoints, 38 exceed a 10% relative validation–holdout gap” | 已复核（两处）；验证集 n=5,000 仅转述 |
| L-A15 | Madras 等，*Prompts Generalize with Low Data*，[arXiv:2510.08413](https://arxiv.org/abs/2510.08413) | 厂商研究（Google DeepMind） | 既有界在 “m <1000” 时 vacuous；150–300 条时界约 0.46 而实际误差 0.11 | 仅转述 |
| L-B1 | Phang 等，*Adversarially Constructed Evaluation Sets Are More Challenging, but May Not Be Fair*，[arXiv:2111.08181](https://arxiv.org/abs/2111.08181) | 独立学术 | “the resulting ranking of models can also be unstable and highly sensitive to the choice of adversary model used”；“AFLite over-samples examples with low annotator agreement”；“There is no case where the rank improves when filtering with the same pretrained model.” | 已复核 |
| L-B2 | Bowman、Dahl，*What Will it Take to Fix Benchmarking in NLU?*，[arXiv:2104.02145](https://arxiv.org/abs/2104.02145) | 学术加行业研究；立场论文 | “collecting examples on which current models fail is neither necessary nor sufficient to create a useful benchmark”；模型可以靠 “simply producing different errors” 登顶 | 已复核 |
| L-B4 | Kiela 等，*Dynabench*，[arXiv:2104.14337](https://arxiv.org/abs/2104.14337) | 行业研究为主 | “Ideally, we would combine adversarially collected data with non-adversarial—preferably naturally collected—data, so as to capture both the average and worst case scenarios” | 仅转述 |
| L-B5 | Bartolo 等，*Beat the AI*，[arXiv:2002.00293](https://arxiv.org/abs/2002.00293) | 独立学术 | “stronger models can still learn from datasets collected with substantially weaker models-in-the-loop” | 仅转述 |
| L-S1 | Miller，*Adding Error Bars to Evals*，[arXiv:2411.00640](https://arxiv.org/abs/2411.00640) | **厂商研究（Anthropic）** | “computing a pooled standard error across all KN answers will be inconsistent, as multiple answers to the same question would violate the assumption of independent draws”；“new evals should contain at least 1,000 questions” | 已复核 |
| L-S2 | Bowyer 等，*Position: Don't Use the CLT in LLM Evals With Fewer Than a Few Hundred Datapoints*，[arXiv:2503.01747](https://arxiv.org/abs/2503.01747) | 独立学术 | “usually dramatically underestimating uncertainty”；“neither simple CLT nor clustered CLT intervals produce correct coverage” | 已复核 |
| L-S3 | Card 等，*With Little Power Comes Great Responsibility*，[arXiv:2010.06595](https://arxiv.org/abs/2010.06595) | 独立学术 | 功效不足的实验里，显著结果 “exaggerate or reverse the true effect” | 已复核 |
| L-B8 | Polo 等，*tinyBenchmarks*，[arXiv:2402.14992](https://arxiv.org/abs/2402.14992) | 学术加行业研究 | “100 examples per scenario is sufficient to achieve ≈2% average performance estimation error” | 仅转述 |
| L-J1 | Zheng 等，*Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*，[arXiv:2306.05685](https://arxiv.org/abs/2306.05685) | 独立学术 | 强评委与人 “over 80% agreement”；自我偏好 “our study cannot determine whether the models exhibit a self-enhancement bias” | 仅转述 |
| L-J3 | Shi 等，*Judging the Judges: A Systematic Study of Position Bias*，[arXiv:2406.07791](https://arxiv.org/abs/2406.07791) | 独立学术 | 位置偏差 “not due to random chance”、“strongly affected by the quality gap between solutions”；强评委重复稳定性 “over 0.95” | 已复核 |
| L-J6 | Li 等，*Preference Leakage*，[arXiv:2502.01534](https://arxiv.org/abs/2502.01534) | 独立学术 | 三种关联含 “belonging to the same model family” | 已复核 |
| L-J7 | Tripathi 等，*Pairwise or Pointwise?*，[arXiv:2504.14716](https://arxiv.org/abs/2504.14716) | 独立学术 | “Pairwise preferences flip in about 35% of the cases, compared to only 9% for absolute scores.” | 已复核 |
| L-J8 | Lee 等，*CheckEval*，[arXiv:2403.18771](https://arxiv.org/abs/2403.18771) | 学术为主 | 清单式评估把评委间一致性平均提高 0.45；“not all NLG tasks and evaluation criteria can be strictly answered with a yes/no response” | 仅转述 |
| L-J10 | Stureborg 等，*LLMs are Inconsistent and Biased Evaluators*，[arXiv:2405.01724](https://arxiv.org/abs/2405.01724) | 学术加行业 | “the self-consistency is worse than the consistency between multiple human annotators” | 仅转述 |

- 支持范围：上表文献的数据规模多为几千到几十万条、模型十几到几百个；**没有一篇研究「LLM 代理在几十条留出集上、以分数做保留或回退、爬二三十轮」**。
  最接近的 L-A13 验证集为 5,000 条，优化对象是训练策略而非提示词。把它们的量级外推到 n≈14，两个方向都没有依据。
- 子代理自算与玩具模拟：见 notes 的 §3.4、§4.2；脚本在 `sources/probe/subagent-calc/`。模拟的假设全由子代理设定，主会话未复跑，**research.md 不引用其数值**。
- 两路计算的一处差异：子代理对 “n=14、90.5%” 直接代入非整数比，得 Wilson 区间 65.6%–97.9%；P1 取整数比 13/14，得 68.5%–98.7%。
  两者都只是「按工单计」情形的示意，差异不影响任何结论。
- 后续核对：arXiv 版本号未逐条钉住；复核时以 `verified_not_stored` 的 SHA256 判断是否换了版本。

## E 工程实践来源

- 消费对象：[research.md](research.md) 的 C-1、C-5、C-6、C-7、C-8。
- 取得方式：子代理用 `curl` 或 GitHub API 取原文；openai.com 返回 403、rdi.berkeley.edu 返回 404，这三条读的是 Wayback 快照。
- 来源立场：逐条见表。

| 编号 | 来源与精确标识 | 立场 | 被引用的原文 | 复核 |
|---|---|---|---|---|
| E-A1 | DSPy MIPROv2，`stanfordnlp/dspy@9c900c7de0a3cc3114c23fe8202ebe48e2206ce1` 的源码与文档 | 维护者自述 | 不传 valset 时默认把 trainset 的 80% 切作 valset；“200 examples or more to prevent overfitting”；“A typical simple optimization run costs on the order of $2 USD” | 仅转述 |
| E-A2 | [DSPy issue #1181](https://github.com/stanfordnlp/dspy/issues/1181)（2024-06） | 维护者自述 | “**four** data splits”；“The final test set should not overlap with any sets used for training or validation or development.”；“using valset == devset is often OK too, especially if total data is less than 200-400 examples” | 已复核 |
| E-A3 | DSPy 的 GEPA 集成，同一提交的 [`gepa.py`](https://github.com/stanfordnlp/dspy/blob/9c900c7de0a3cc3114c23fe8202ebe48e2206ce1/dspy/teleprompt/gepa/gepa.py) | 维护者自述 | 省略 valset 的警告：“as it makes GEPA overfit prompts to the provided trainset”。默认反思模板要求 “Identify all niche and domain specific factual information about the task and include it in the instruction” | 警告句已复核；模板句仅转述 |
| E-A4 | [DSPy issue #10484](https://github.com/stanfordnlp/dspy/issues/10484)（2026-09-23，open） | 用户报告 | “the reflection LM tends to accumulate many case-specific rules”；“this is soft prompting, not a hard constraint: the reflection LM can still ignore a length request” | 仅转述 |
| E-A5 | Agrawal 等，GEPA 论文，[arXiv:2507.19457v2](https://arxiv.org/html/2507.19457v2) | 方法作者自述 | “We adopt a standard train/validation/test split … direct access to the content of validation instances is restricted.”；HoVer 用 150／300／300 | 仅转述 |
| E-A6 | [gepa-ai/gepa issue #261](https://github.com/gepa-ai/gepa/issues/261)（open）与 [#133](https://github.com/gepa-ai/gepa/issues/133)（open） | 维护者自述与用户报告 | #261：“**highest priority** … it's a silent failure mode (train score improves, production score doesn't)”。#133 同一用户先报 val≈95% 而 test “less than the unoptimized program”，十个月后报 “I did not succeed” 复现过拟合 | 已复核 |
| E-A7 | Dropbox，[How we optimized Dash's relevance judge with DSPy](https://dropbox.tech/machine-learning/optimizing-dropbox-dash-relevance-judge-with-dspy)（2026-03-17） | 生产团队报告 | “the optimizer could overfit by copying specific keywords, usernames, or verbatim document phrases directly into prompts”；“we added explicit guardrails” | 已复核 |
| E-A8 | Yang 等，OPRO，[arXiv:2309.03409](https://arxiv.org/html/2309.03409) | 方法作者自述 | “we do not set aside a validation set”；“our training accuracies are often 5%-20% higher than our test accuracies” | 已复核 |
| E-A9 | Yuksekgonul 等，TextGrad，[arXiv:2406.07496](https://arxiv.org/html/2406.07496) | 方法作者自述 | 50／100／100 三分，“if the performance is better than the previous iteration we update the Prompt” | 仅转述 |
| E-A10 | promptfoo [Prompt Optimization](https://www.promptfoo.dev/docs/usage/prompt-optimization/) 文档，2026-09-29 抓取 | 工具厂商自述 | “it can overfit to the configured tests”；“judges candidate adoption on the held-out 20%” | 已复核 |
| E-B2 | OpenAI，*Why SWE-bench Verified no longer measures frontier coding capabilities*（2026-02-23），Wayback `20260915162530` | 基准构建方兼模型厂商 | “We audited a 27.6% subset of the dataset that models often failed to solve and found that at least 59.4% of the audited problems have flawed test cases” | 仅转述 |
| E-B3 | [SWE-bench issue #465](https://github.com/SWE-bench/SWE-bench/issues/465)（2025-09 开，2026-03 关） | 独立研究者报告，维护者确认 | “agents may look at future repository state” | 已复核（该句）；`git log` 实例仅转述 |
| E-B6 | Cursor，[Reward hacking is swamping model intelligence gains](https://cursor.com/blog/reward-hacking-coding-benchmarks)（2026-06-25） | 集成方兼竞品，自家模型参与对比 | “63% of successful Opus 4.8 Max resolutions retrieved the fix rather than derived it”；封 git 历史并限外网后 “87.1% to 73.0%”、“74.7% to 54.0%”；审计 “731 Opus 4.8 Max trajectories”；脚注：幅度 “depend on the prompts used” | 已复核 |
| E-B8 | METR，[Recent Frontier Models Are Reward Hacking](https://metr.org/blog/2025-06-05-recent-reward-hacking/)（2025-06-05） | 独立评测机构 | “0.7% of runs across all HCAST tasks”；RE-Bench 小计 30.4%；“more than 43× more common”；“may be a significant underestimate” | 已复核 |
| E-B9 | Berkeley RDI，*How We Broke Top AI Agent Benchmarks*（2026-04），Wayback `20260903043932` | 独立学术团队 | “A conftest.py file with 10 lines of Python "resolves" every instance on SWE-bench Verified.” | 仅转述 |
| E-C1 | Husain、Shankar，[AI Evals FAQ](https://hamel.dev/blog/posts/evals-faq/)，页面标注 Modified September 21, 2026 | 独立从业者 | “it can happen even if you never put the dev examples directly in the prompt”；“Reserve the remaining 40 to 45 percent for one final test”；“using the same model is usually fine”；“Label 100 to 200 examples for each failure mode”；自动优化 “cannot discover new ones” | 已复核 |
| E-C2 | Shankar 等，*Who Validates the Validators?*，[arXiv:2404.12272](https://arxiv.org/html/2404.12272) | 独立学术；9 人定性研究 | criteria drift：“it is impossible to completely determine evaluation criteria prior to human judging of LLM outputs” | 仅转述 |
| E-D2 | Zhang 等，Darwin Gödel Machine，[arXiv:2505.22954](https://arxiv.org/html/2505.22954) | 方法作者自述 | “objective hacking … occurs more frequently when these functions are not hidden”；代理 “removed the logging of special tokens”；单次运行 “about USD 22,000” | 已复核（三处）；20.0%→50.0% 与约两周仅转述 |
| E-D3 | Huxley-Gödel Machine，[arXiv:2510.21614v3](https://arxiv.org/html/2510.21614v3) | 竞争方法作者 | “Metaproductivity-Performance Mismatch” | 仅转述 |
| E-D5 | Bäuerle 等，AlphaEvolve 用户研究，[arXiv:2605.05921](https://arxiv.org/html/2605.05921) | 厂商自述，引外部用户原话 | “thought it was doing well, it was cheating” | 仅转述 |

- 支持范围：B 组的泄漏幅度来自公开代码基准与前沿模型，不代表私有业务评估会有同等幅度；E-B6 的作者同时是被比较一方。
  A 组优化器只改指令与示例，程序结构固定，与「可改 harness 代码」的情形不同。
- 子代理报告的一处上游转述失真：Berkeley RDI 把 METR 的结果写成 “30%+ of evaluation runs”，METR 原文的 30.4% 只是 RE-Bench 小计，HCAST 为 0.7%。本包以 METR 原文（E-B8）为准。
- 检索过但无果：Braintrust 六页文档、OpenAI *Evaluation best practices* 均检索不到 “overfit”“split”；
  未找到对 ADAS 的可精确引用的独立批评或复现；未找到「train 与留出集同时上涨才保留」这种双门规则的任何对照实验。以上均为子代理所报，主会话未复查。
- 后续核对：GitHub issue 与文档页会变；E-A1、E-A3 已钉提交，其余以抓取日期 2026-09-29 为准。

# 评测基准：四套协议互不可比，且都没测到生产条件

- 原始出处（一手全文，2026-09-19 取得）：
  Full-Duplex-Bench v1 `arxiv.org/abs/2503.04721`（**已被 ASRU 2025 接收**）、
  v3 `arxiv.org/html/2604.04847v1`、GitHub `github.com/DanielLin94144/Full-Duplex-Bench`、
  IHBench `arxiv.org/html/2606.19595v1`、DuplexWorld `arxiv.org/html/2608.10716`、
  τ-Voice `arxiv.org/html/2603.13686v1`、Artificial Analysis `artificialanalysis.ai/speech-to-speech` 及其方法论页、
  Stivers et al. 2009 PNAS 经 PMC 镜像 `pmc.ncbi.nlm.nih.gov/articles/PMC2705608/`（`pnas.org` 直链 403）。
- 来源立场：学术团体为主，但**不完全干净**——FDB v3 有两位 NVIDIA 作者；IHBench 出自 Boson AI；
  DuplexWorld 出自 Centific；**τ-Voice 作者主体来自 Sierra.ai，一家销售语音客服 agent 的公司**，
  评测对象是上游模型而非自家产品，论文未对这层关系作披露。Artificial Analysis 是商业榜单。
- 消费对象：`research.md` 的「评测与生产脱节」「厂商自测数字缺独立复现」两条结论。

## 四套协议测的不是同一件事

| 基准 | 核心对象 | 语音是否真实 | 轮转/打断指标的算法 |
|---|---|---|---|
| FDB v1 | 暂停/反馈/轮转/打断的**行为层**准确性 | 部分真实（Candor/ICC）+ 部分 TTS | TOR：单轮二值判定的均值 |
| FDB v3 | v1 四维 + **真实不流畅语音下的工具调用鲁棒性** | 真实录音，但只有 12 位说话人 | Turn-take rate，与 v1 的 TOR **不同公式** |
| IHBench | 打断**之后**的工作流恢复**内容正确性**，显式排除时序与声学 | 全合成（TTS + ASR 验证） | 不测轮转时机，只测两条 rubric 通过率 |
| DuplexWorld | 企业场景任务完成 + 会话动态 + 自然性 | **全合成，声明无真实人声** | "on-time curve"，公式未公开 |
| τ-Voice | 客服任务完成率在噪声/口音退化下的掉分 | 全合成（TTS persona） | 不专测轮转，测 Response/Yield Rate 与 Latency |
| Artificial Analysis | 把上述若干基准合成单一分数 | 沿用各自来源 | **自行重实现 FDB v1/v1.5 子集**，非完整 v1，更非 v3 |

**同名不同义**：FDB 的 TOR（二值均值）、DuplexWorld 的 on-time curve、τ-Voice 的 Yield Rate
是三套不同算法，**数字不能跨基准换算或相加**。Artificial Analysis 把三个异质基准
**等权重**合成一个 Index，这是该榜单自己的方法论选择，四篇原论文之间从未互相校准，也未声称可比。

## 与生产条件的距离，作者自己都承认

- **延迟长尾：没有一篇报 p99**，全部只报均值或均值±标准差。FDB v3 明写云端模型延迟
  "inherently include non-deterministic network overhead"，且测试只在单一固定服务器区域完成。
  DuplexWorld 与 τ-Voice 用 G.711 编码加丢包模型模拟网络退化，但 Gilbert-Elliott/泊松突发
  不等同真实电话网的长尾分布，论文也未作此声称。
- **口音**：τ-Voice 自述 "Accent findings realized via TTS personas should be interpreted as
  suggestive rather than definitive"——作者本人不认为 TTS 口音能代表真实口音结论。
  FDB v3 是唯一用真实非母语说话人（韩语、俄语背景）的，但只有 12 人。DuplexWorld 完全不用真实人声。
- **噪声**：FDB v3 采了每位说话人 30 秒真实环境音，是四篇里最接近真实的；其余为合成叠加。
- **打断误判**：覆盖最多的一维，但 FDB v1 的中断时机是固定的"前一语句后 7 秒"，
  不是真实对话里中断时机的自然分布；DuplexWorld 与 τ-Voice 的中断由 LLM 模拟器注入。
- **没有一篇声称测过真实电话线路上的完整生产条件**；IHBench 与 τ-Voice 在 limitations 里明写
  需要 "validation against real end-user interactions in live deployment"。
  **这是学术侧集体承认的空白，不是本笔记的推断。**

## OpenAI 的 30 个百分点：无独立复现，且第三方数字差一个数量级

- Full-Duplex-Bench **官方 GitHub 的 README 不提及** `gpt-live-1` 或 `gpt-realtime-2.1`，无官方 leaderboard 登记。
- **四篇论文的投稿时间全部早于 `gpt-live-1` 的发布日（2026-09-10）**——τ-Voice 2026-03、
  FDB v3 2026-04、IHBench 2026-06、DuplexWorld 2026-08，**逻辑上不可能测过它**。
- DuplexWorld 测过 `gpt-realtime-2.1`（Pass@1 0.433），但那是它自己的任务完成率基准，不是 FDB，
  不构成对那句话的复现或反驳。
- **唯一可比的第三方数字**（Artificial Analysis 的 Conversational Dynamics，其"Full Duplex Bench"
  分项只覆盖 v1/v1.5 子集）：**GPT-Live-1 (Sol, low) 97.3% vs GPT-Realtime-2 (minimal) 96.1%，
  差约 1.2 个百分点**——方向与 OpenAI 一致，幅度差一个数量级。
  注意这不是对 OpenAI 说法的直接复现（测试条件、精确模型版本、基准子集都可能不同，
  且该榜单方法论未公开到可逐条核对）。
- 另一处易被忽略的落差：FDB v1 列出 17 个"被评测模型"，**实际跑出结果的只有 4 个**，论文未说明原因。

## 人类轮次间隙的学术基线

Stivers et al. 2009, PNAS 106(26):10587–10592，10 种语言、5 大洲自然对话，每语言 350 个问答对，
ELAN 标注 10ms 精度，"response time"定义为问句话轮结束到回应话轮开始的间隔：

- **总体众数 0ms**；各语言众数落在 0 至 +200ms。
- **总体中位数 +100ms**；各语言中位数 0ms（英语、日语等）到 +300ms（丹麦语、老挝语等）。
- **总体均值 +208ms**；最慢丹麦语 469ms，最快日语 7ms；各语言均值落在总体均值 **±250ms** 内。

**这与工程口径的关系要说清**：论文本身**从未出现"200–450ms"这个区间或措辞**。
它能支撑的是"人类自然轮转间隙在 0–250ms 量级"；工程博客常见的 450ms 上限在论文数据里
**没有直接支撑**（总体均值加 250ms 变异约为 458ms，量级接近，但这是本笔记的换算，不是论文陈述）。
本轮也没找到任何中间文献把 Stivers 的数字映射成"200–450ms"。

## 局限

- 除 FDB v1 被 ASRU 2025 接收外，**其余四篇只是 arXiv 预印本**，本轮未查到接收状态，不能当作已过同行评审。
- Artificial Analysis 的测试脚本、是否跑官方代码、网络条件均未公开到可核对程度。
- `gpt-realtime-2.1`（非 minimal）在该榜单同一分项的分数本轮未取得，无法给出版本更匹配的对比。
- 四个 agent 基准**没有一个引用或对标 Stivers 的人类基线**——把它当作效标是本笔记的参照选择，
  没有论文做过这个映射。
- FDB v3 论文里的 "GPT-Realtime" 未标版本号，无法确认对应哪个精确模型。

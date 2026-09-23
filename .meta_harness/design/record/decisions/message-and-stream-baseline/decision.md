# D-035：消息、到达语法与流装配器三层的起点——逐层混合

- **当前状态：已接受，三层的起点方向。**
  **未接受**：任何契约（消息与块的数据契约、到达语法契约、一致性用例集都还不存在）；块身份方案、回放数据的位置、首 token 的判定；任何实现。
- **来源提案**：[`proposals/message-and-stream-baseline`](../../proposals/message-and-stream-baseline/README.md)，HUB `panqiwei/assets-runtimes` 提交 `b12d927` 加 `9ab1e36` 的评审修订——
  [必须兑现的性质](../../proposals/message-and-stream-baseline/design.md#必须兑现的性质)、
  [候选 D 逐层表](../../proposals/message-and-stream-baseline/alternatives.md#d逐层混合推荐)、
  [三层能不能分开选](../../proposals/message-and-stream-baseline/alternatives.md#三层能不能分开选)、
  [推荐与会改变选择的证据](../../proposals/message-and-stream-baseline/alternatives.md#推荐与仍待区分的事项)。
- **来源研究**：[message-model-and-stream-sources](../../../../research/message-model-and-stream-sources/research.md)（首轮 2026-09-23，对照的是 PF-009 rev 4；rev 5 的差异见[提案](../../proposals/message-and-stream-baseline/design.md#输入基线的一处漂移)）；
  [model-request-transport-sources](../../../../research/model-request-transport-sources/research.md)。
- **评审**：[独立架构评审](../../proposals/message-and-stream-baseline/review.md)——产品负责人点名派 Codex `gpt-6-astra`（xhigh，只读）以 architecture-reviewer 职责评审，强制二选一，
  亲自做 `StreamChunk` → PF-009 §5.5 的纸面走查与两个场景；结论 **「D 成立」**，对骨架可承载的置信度中等偏高；
  [原件](../../proposals/message-and-stream-baseline/reviews/2026-09-23-codex-architecture-review.md)。
- **需求与方法前提**：[PF-009](../../../product/PF-009-context-message-types/README.md) rev 5（rev 4 已接受，**rev 5 全文待确认**）、
  [PF-013](../../../product/PF-013-model-profiles-and-invocation/README.md) rev 6（rev 4 已接受，**rev 5、rev 6 待确认**）、
  [PF-010](../../../product/PF-010-context-management-and-assembly/README.md) rev 5、[PF-012](../../../product/PF-012-agent-loop-and-run/README.md) rev 9、
  [PF-006](../../../product/PF-006-tools-and-skills/README.md) rev 16、[PF-000](../../../product/PF-000-occurrences-and-record-entries/README.md) rev 1；
  [D-019](../model-provider-pi-ai-fork/README.md)（pi-ai 定向 fork 作传输）、[D-026](../infrastructure-persistence-choices/README.md)（无 in-memory、会话日志一类落 JSONL）；
  [SYS-SPEC](../../../foundation/cross-system-constraints/requirements.md#sys-spec)、[SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)、
  [SYS-LLM](../../../foundation/cross-system-constraints/requirements.md#sys-llm)、[SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)。
- **实际接受依据**：2026-09-23，产品负责人（`panqiwei`）先裁 **「先派 codex gpt-6-astra 去论证 D 是否成立」**，评审判 D 成立后裁 **「接受」**。
  裁决台账对「接受」的读法：数据契约自研、语法借 StreamChunk 骨架并条款化、装配器自写、pi-ai 只在传输适配翻译、工具同语法发帧；三层落 core，先于 B/C 契约。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| **数据契约**的起点：DSH 类型扩展、pi 类型扩展、自研 | **接受自研** | 按 PF-009／PF-013 自研 JSON Schema；两源字段命名只作参考 | 七种判别、七类块、两标注、块身份、派生属性、来源属性、中断标记都未起草；块身份与嵌套寻址、供应商回放数据的位置未定 |
| **到达语法**的起点：`StreamChunk` 扩展、`AssistantMessageEvent` 扩展、自研、`StreamChunk` 骨架 + 条款化 | **接受 `StreamChunk` 骨架 + 条款化** | 拿五个步骤与块索引关联、封口交完整块、用量独立一步且在收尾前、失败归一为收尾步骤、参数保持原始串；伴件检查**逐项筛选补全**后写成条款（评审采纳：不是照抄）；补填法声明、整体替换、语音增量、「封口的块 = 所有填的结果」、切分不变与合并不变。**封口交出的块引用数据契约的块 schema，不引 DSH 的 `ContentBlock`**——提案点名的唯一不能分开的组合被排除 | 语法契约未起草；骨架里的 DSH 专有形状（工具调用身份、`TokenUsage`、`replayState`、可扩展结束原因）逐项判去留，**不因骨架被选中而自动成为共用协议** |
| **流装配器**的起点：fork `BlockAssembler`、fork 帧归约、自写 | **接受自写** | 借 DSH 的确定性测试形状与 pi 帧归约的语法错误用例；三种流断收场、违反语法的处置、性质测试自写 | 未实现；三源都没有可继承的切分／合并性质测试 |
| **pi-ai 的止步处** | **接受：只在传输适配处被翻译进来** | 适配层把 pi 的事件翻成本项目语法：原始参数串、丢弃 `partial`、用量发一次、无终止事件补出错收尾、状态码从注入的 `fetch` 取 | pi 的中间解析问题见保留前提第 1 条 |
| **工具帧** | **接受：工具按同一语法直接发帧，不经 `pi-agent-core`** | — | 工具帧的记账、违反语法的结果未定 |
| **三层落在哪、先后** | **接受：纯计算落 `packages/core/`，先于模型请求运行时与工具运行时契约定型** | 两个运行时与传输适配都只依赖它、彼此不依赖；两条链各自能从脚本化输入跑到真实 JSONL 日志，共用一份语言无关的一致性用例集 | 包名与节点未立；用例集未写 |

## 理由与保留前提

**理由**（取自[提案推荐](../../proposals/message-and-stream-baseline/alternatives.md#推荐与仍待区分的事项)，并经评审判成立）：
数据层两源都没有值得继承的判别体系；语法层 `StreamChunk` 在 PF-009 §5.5 九行里零「不可承载」，其不变量清单是现成的检查单，毛病在于检查是可选的；
装配器的上游行为与条款方向相反而代码量小；共用部分不能住在任何一个运行时里。
评审的纸面走查：`StreamChunk` 十项步骤／字段逐条对到五步语法，**不需要改变增量结构**；工具帧「日志 + 整体替换面板」场景与流断五行表各行走通。

**保留前提（评审的最强反证与上交的下游缺口，逐条照[评审处置](../../proposals/message-and-stream-baseline/review.md#发现与处置)）：**

1. **pi fork 必须禁止中间解析**：pi 普通 function 参数分支在每个增量上调用 `parseStreamingJson`、封口再解析一次，外层「拼原串、丢弃 partial」消除不了这次中间解析，与 PF-009 §6.10「收齐才解析、只解析一次」不符。
   **传输契约定稿前**须写明「fork 禁止中间解析、唯一解析点在装配器」，不能只登记「保留原串」。这是对 [D-019](../model-provider-pi-ai-fork/decision.md) fork 补丁范围的新义务，不改 D-019 的采用方向。
2. **「delta 原样」只核实了普通 function 分支**：custom grammar 分支会构造 JSON delta；pi 原始参数探针的范围扩到两条分支，**探针未做**。
3. **伴件不是完整检查集**：DSH 只查 usage 至多一次、不查必须出现、不查 usage 前全部块已封口；不保护「一个索引终身只开一次」——三条写进语法条款起草的检查单。
4. **骨架里的模型专属假设逐项判去留**（见上表）。
5. **已交付内容在成品提交前崩溃由谁、何时持久保存**：只记录「已开口」保全不了用户已看到的前缀——归架构负责人与两个运行时 owner，本决定不定。
6. **跨进程身份**：流内 `index` 不能独自承担租户／会话／尝试的绑定；迟到代际与跨进程校验责任——归数据契约起草与架构。
7. **F 四问**（dispose 时在途增量的唯一结算者、依赖消失的卸载范围、事件派发绑定、装配给／协议给分表）本包都未给出，是两个运行时契约与提供者设计的义务（阶段 3/4）。
8. **转交 spec-reviewer 的表达问题**（「账只一次」的至多／恰好、封口块按追加／替换分别定义、切分／合并的允许操作域等）在语法契约起草后由 spec-reviewer 判。
9. **需求基线未全部确认**：PF-009 rev 5、PF-013 rev 5–6 仍待产品负责人确认；提案判断起点选择不受影响，确认结果改变块类型或首 token 口径时回来复核。

**会让选择改变的证据**（评审给出的改票条件与提案一致）：块身份定稿后无法与流内索引稳定对应，或合法内容必须引入改变关联方式的新增量操作——**语法层退到 C**；
本项目决定在传输之外还复用 DSH 的 LLM 栈——改选 A；产品放宽 PF-009 §6.7、§6.10 或 §5.6 且 D-019 范围扩到 `pi-agent-core`——改选 B。翻盘走新决定。

## 取代与影响

不取代任何决定。

| 受影响拥有者/消费者 | 应更新的引用、契约、地图或映射 | 所需产物/责任与闭合条件 |
|---|---|---|
| [D-019](../model-provider-pi-ai-fork/decision.md)「DSH 的 context/stream/replay 转换值得复用或移植，那是另一次选择」 | D-019 正文不改；那一次选择由本决定作出：**DSH 的 LLM 栈代码不复用**，`StreamChunk` 只作到达语法的设计起点；pi-ai 止步于传输适配 | D-019 其余范围（传输采用方向、定向 fork、拒绝整包服务层）不变；保留前提第 1、2 条是 fork 补丁范围的新增义务，传输契约定稿前闭合 |
| 消息与块的 `data.*` 契约、到达语法契约、一致性用例集（`packages/core/`） | 起草时以本决定为起点，回链本决定、提案与评审 | **都未起草**；保留前提 3、4、6、8 是起草检查单 |
| 模型请求运行时、工具运行时两块的契约与节点 | 以本决定为前提，**不先于三层定型** | 未起草；保留前提 5、7 是它们的义务。工具运行时起点见 [D-032](../tool-execution-runtime-baseline/README.md) |
| [PF-013](../../../product/PF-013-model-profiles-and-invocation/README.md) owner | 语音增量与开口整交的块算不算首 token | 产品裁定；不挡本决定，语法只需让「第一个内容步骤」可识别 |
| [proposals 索引](../../proposals/README.md#当前主题) `message-and-stream-baseline` 行 | 「候选／接受边界」改为已由本决定接受 | **已完成**（与本决定同批） |

**明确不表示：**

- 任何契约被接受，或消息、块、到达语法的契约与一致性用例集已经存在；
- 任何实现存在：装配器、传输适配、pi fork 的补丁都没有；
- 提案的最小区分调查已全部做完——纸面走查已由评审完成，**pi 原始参数探针未做**；研究「未知」各行（pi 缺终止事件时挂起、监听者抛错拖垮结算等）仍是代码阅读推断；
- 评审上交的九条保留前提任何一条已闭合；
- PF-009 rev 5、PF-013 rev 5–6 已被确认；
- 评审「成立」本身构成接受——接受依据只有产品负责人的「接受」。

返回[本 topic 入口](README.md)。

# 候选与取舍

## 选择对象与必要约束

选择对象见 [design.md](design.md#需要作出的选择)：**数据契约、到达语法、流装配器三层，各以谁为起点。**
必须兑现的是 [N1–N13](design.md#必须兑现的性质)；可以调整的是每层借用哪份上游的形状或代码、fork 还是只借形状、放在哪个包。
各源对每条性质的五档判定见 [design.md 承载表](design.md#现有能力如何承载)，这里只引用，不重抄。

**三源都没有的部分**（三种自有消息、块级两标注、派生表示与 transcript、语音、整体替换、帧 → `ToolInternalMessage`）
**在每个候选里都要自研**，见 [design.md 剩余责任](design.md#剩余责任与能力演化)。下面比较的只是其余部分。

| 可识别候选及范围 | 如何兑现必要性质 | 差异、总负担及关键反例 | 当前证据与缺口 |
|---|---|---|---|
| **A 以 DSH `llm/llm` 为起点扩展**：fork `dsh-llm` 的类型、`StreamChunk`、`BlockAssembler` 与 `llm-invariant`，补三种消息、块标注、派生属性、语音、填法与整体替换，把伴件变成必选；**落盘不采 DSH 会话格式** | 到达语法现成 5/3/1/0；参数原始串、封口交完整块、失败归一为终止步骤都已有；其余靠改 | 装配器里与 PF 相反的行为**正是 DSH 有意的设计**（截断丢调用、叫停丢调用、缺收尾当正常、用量后写覆盖），全部要改；判别式从 role + `source.kind` 换成七种；类型文件要切掉 Cordis `Events`、Typert、`dsh-attachment`；装配器住在 LLM 包里，工具运行时要用就得搬家。**反例**：minimal-runtime 做过一次这种切片，丢了语法校验与失败归一两层（[M1][M1]） | 研究五档表；「delta 之和 ≠ block-end」的后果与伴件默认挂载都**未探针**，且只影响本候选 |
| **B 以 pi-ai 类型为起点**：`Message` 族、内容类型、`AssistantMessageEvent` 与帧归约；工具执行中的输出借 `pi-agent-core` 的 `onUpdate` | 落盘只存成品（N9 可承载）；有假 provider 与纯归约；与 D-019 是同一个上游 | 汇总表 9 行「不可承载」里 **8 行涉及 pi（7 行只有 pi），DSH 涉及 2 行**：残缺解析参数并删原串、截断合成错误结果、组装跳过中断消息、`partial` 以完整消息类型进上下文、压缩是截断线、出门占位。**反例**：pi 在 0.86.0 这个 minor 里改了 `ToolCall.arguments` 的类型——落盘格式跟 pi 类型走，只增不改的日志就要跟着上游小版本迁移；工具运行时要产出消息就得依赖一个模型传输库 | 两条运行时行为（缺终止事件挂起、监听者失败拖垮结算）**是代码阅读推断，未探针**；`pi-agent-core` 不在 D-019 采用范围内 |
| **C 全部自研**：按 PF-009／PF-013 写 JSON Schema 与到达语法，装配器自写；只借两源的字段命名与测试用例形状 | 每条性质按正文逐条写成，JSON Schema 原生；独立测试从一开始就设计进去 | 没有源码级反例。代价是到达语法**从零论证**：DSH 已经定下且有依据的几处（封口交完整块、用量在收尾前且只一次、失败归一为终止步骤、参数保持原始串、带着未封口的块结束只允许是出错或被叫停）要重新推一遍，漏一条就是一个没人发现的洞 | 无上游依赖；语法完备性只能靠评审与一致性用例集 |
| **D 逐层混合**：数据契约按 C 自研；**到达语法以 `StreamChunk` 的骨架为起点**，伴件的检查升格为语法条款，补填法、整体替换、语音、「封口的块 = 所有填的结果」与合并不变；**装配器自写**；pi-ai 只在传输适配处翻译成本项目语法；工具直接按同一语法发帧 | 数据层与装配器同 C；语法层继承 A 最强的那部分，并逐条对照 | 与 C 的差别只在语法层：有一张与 `StreamChunk` 逐条对照的表，DSH 的不变量清单成为起草的检查单。代价是骨架可能夹带 DSH 专有形状（收尾步骤带 `replayState`、工具调用增量按 id 关联且 `name` 可选），要逐项判去留 | pi 的 `toolcall_delta.delta` 是否恰为原始片段**未核**——影响 D-019 fork 的补丁范围，不影响本候选成立 |

## 各候选展开

### A：以 DSH `llm/llm` 为起点扩展

**起点与改法**：fork `dsh-llm` 的 `types.ts`（消息、`ContentBlock`、`StreamChunk`、`FinishReason`）、`assembler.ts`、`invariant.ts`，
搬出 LLM 包放到共用位置；切掉 `types.ts` 对 Cordis `Events` 与 Typert 错误表的扩展、对 `dsh-attachment` 的依赖（[D12][D12]）；
**不用** `dsh-llm-pi-ai`（它把参数重新序列化，[D10][D10]），传输适配另写；**不采** DSH 会话格式（[S2][S2]）。

**逐条兑现**：

- N1：DSH 以 role（三种）+ `source.kind` 判别（[D1][D1]），要换成七种判别；`ContextForm:'snapshot'` 的「取代」语义与 [§6.4](../../../product/PF-009-context-message-types/design.md#64-说状态的写清变化说事的写清发生消息一律追加) 相反，要删。**判别式是一个类型体系的根，换掉它之后剩下的主要是字段名。**
- N2–N4：补语音块、媒体类型决定模态、块标注、块身份、派生表示与 transcript——三源都没有，与 C 同量。
- N5、N6：`StreamChunk` 5/3/1/0，是四个候选里语法层起点最好的（[R§4][R§4]）；补填法声明与整体替换、语音增量；把伴件的六条检查写成必选。
- N7：`BlockAssembler` 的三处收场都要改——截断时丢全部工具调用、叫停时只留文本与思考、缺收尾当 `stop`；用量与收尾后写覆盖要改成违反语法（[D5][D5]）；「封口的块 = 所有填的结果」要新增校验。
- N8：DSH 没有帧（[D9][D9]）；同一装配器要服务工具，它必须先离开 `dsh-llm`。
- N11：DSH 类型是 TS，JSON Schema 仍要另写，TS 类型退为派生物。
- N13：纯零件可单独调用；脚本化输入 `mock-adapter` 是 `LlmAdapter` 子类，要经 Cordis 的 `LlmRuntime`（[D11][D11]），不能照搬。

**总负担**：fork 一个预发布包（`0.1.5-rc.2`），改掉装配器里几乎每一处影响结果的行为，再把它从宿主上拆下来。
改完之后与上游的差异大到**上游修复无法合并**，按 [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel) 它是自有模块，但 fork 的价值只剩「初始代码」——而装配器本身约一百七十行（`assembler.ts:38-208`，[D5][D5]）。
合并可扩展的 `ContentBlock` / `FinishReason` 与 `ReplayEnvelope` 这类扩展点会一并带进来，是否需要要另判。

**关键反例**：

- DSH 的宽容是**有意的**：以 `block-end` 为权威、先到先得、缺起止也能装配（[D5][D5]）；作者否决过中断提醒（[D8][D8]）、否决过「只存装配后的消息」（[S2][S2]）。**以它为起点，就是从一组与本项目条款方向相反、且有作者理由支撑的决定出发，再逐条推翻。**
- 保护性检查放在可选伴件里：minimal-runtime 切 `dsh-llm` 时只带走纯零件，**伴件与失败归一两层都丢了，没有任何一层报错**（[M1][M1]）。A 若照搬「伴件」这一结构，同样的事会再发生一次。

**A 能买到而 D 买不到的**：`BlockAssembler` 的代码与它的确定性测试。二者在 D 里以「测试用例形状」的方式借用。

### B：以 pi-ai 类型为起点

**起点与改法**：采 `pi-ai` 的消息与内容类型、`AssistantMessageEvent`、`reduceAssistantMessageFrames`；工具执行中的输出借 `pi-agent-core` 的 `onUpdate`（[P9][P9]）。
它的吸引力是真实的：与 [D-019](../../decisions/model-provider-pi-ai-fork/decision.md) 同一个上游，只跟一份 fork；落盘只存成品，与 §9.2 同向（[P7][P7]、[P8][P8]）；有假 provider 与带语法校验的纯归约（[P8][P8]、[P12][P12]）；是三源里唯一有工具执行中输出通道的。

**逐条兑现**：

- N1：四种角色，无消息身份（[P1][P1]）；三种自有消息要新增，提醒与压缩现为 `pi-agent-core` 的应用层消息（[P10][P10]）。
- N2：无文件块、无语音；图 base64 内联，与 [PF-006 附件是引用](../../../product/PF-006-tools-and-skills/design.md#工具的产出)相反；工具结果只能文本与图（[P2][P2]）。
- N5、N6：2/4/2/1；无独立记账步骤；图与文件不在助手流里；**每个事件携带共享的实时 `partial`，注释写明不是快照**（[P3][P3]）——这是进程内对象，跨进程没有意义（N11、[SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)）。
- N7：**不可承载 ×4**：参数每个增量与收尾都残缺解析并删原串（[P4][P4]）；截断时合成错误结果回喂（[P4][P4]）；组装跳过中止与出错消息（[P6][P6]）；`pi-agent-core` 把 `partial` 以 `AssistantMessage` 类型推进上下文（[P7][P7]）。
- N8：`onUpdate` 是结果级整份快照，没有块级填法，监听者被逐个 `await`、失败传回结算（**推断**）——与 §6.15–§6.17 相反（[P9][P9]）。
- N4、压缩：出门占位（[P11][P11]）与压缩截断线（[P10][P10]）都是不可承载。
- N11：块里嵌供应商专属字段（`textSignature`、`thoughtSignature`、`namespace`），`Usage` 带计价（[P2][P2]）。

**关键反例**：

- **落盘格式与上游小版本耦合。**pi 六周七个版本，0.86.0 在 minor 里改了 `ToolCall.arguments` 的类型（[transport 研究][TR-diff]、[TR-churn]）。
  会话日志只增不改（N10），**以 pi 类型为落盘形态，就要为每次类型变化迁移全部历史**；DSH 的会话格式已经演示了这笔账有多贵（三条迁移约 4,700 行，[S5][S5]）。
  若为此冻结一份 pi 类型的副本，它就不再随上游，等于 C 换了一套字段名。
- **工具运行时被迫依赖模型传输库。**要产出 `ToolMessage` 与帧，工具运行时得引用 `pi-ai` 的类型——N13 要的独立性在包依赖上就不成立；而 `pi-agent-core` 不在 D-019 的采用范围内。
- **汇总表 9 行「不可承载」里 8 行涉及 pi、7 行只有 pi**；DSH 只涉及 2 行（出门派生占位、嵌流结算）（[R§10][R§10]）。

**排除依据**：数据层与装配器以 pi 为起点，每一层都有至少一处源码级机制与条款相反，且落盘耦合是结构性的。
**保留下来的部分进了 D**：pi-ai 作传输（D-019）与它的假 provider 作模型侧脚本化输入。
B 的两条未探针推断（[P5][P5]、[P9][P9]）**不会翻转这个排除**——它们只让 B 更差或不变。

### C：全部自研

**起点**：只从 [PF-009](../../../product/PF-009-context-message-types/design.md)、[PF-013](../../../product/PF-013-model-profiles-and-invocation/design.md) 与相邻正文出发；两源只贡献字段命名与测试用例形状。

**兑现**：N1–N13 都按正文逐条写成；JSON Schema 是第一形态；两个运行时的独立测试接缝在契约阶段就设计进去。

**总负担**：到达语法要从零论证。PF-009 §5.5 本身写于[对 DSH 流式的访谈](../../../product/PF-009-context-message-types/interviews/2026-09-18-dsh-streaming.md)之后，所以 C 的语法**多半会收敛到与 `StreamChunk` 同构**；
差别在于不收敛时没人发现——DSH 的不变量伴件列着六条可执行检查（[D5][D5]），C 若漏掉其中「带着未封口的块结束只允许是出错或被叫停」「收尾之后不得再有增量」这类边角，
要等实现或评审撞上才补。

**关键反例**：没有源码级反例。它的风险是**设计遗漏**，不是**机制冲突**。

### D：逐层混合（推荐）

| 层 | 起点 | 从上游拿什么 | 自己写什么 |
|---|---|---|---|
| 数据契约 | **C**：按 PF 自研 JSON Schema | 两源的字段命名作参考 | 七种判别、七类块、两标注、块身份、派生属性、来源属性、中断标记 |
| 到达语法 | **`StreamChunk` 的骨架** | 五个步骤与块索引关联、封口交完整块、用量独立一步且在收尾前、失败归一为收尾步骤、参数保持原始串；伴件的检查**逐条升格为语法条款** | 开块时的填法声明、整体替换、语音增量、「封口的块 = 所有填的结果」、切分不变与合并不变；**封口交出的块引用数据契约的块 schema，不引 DSH 的 `ContentBlock`** |
| 装配器 | **C**：自写 | DSH 的确定性测试形状（幂等、紧凑与展开一致这类对照思路）、pi 帧归约的语法错误用例（重复封口、索引空洞，[P8][P8]） | 三种流断收场与 ✗✗、违反语法的处置（两侧不同，见 [design.md](design.md#剩余责任与能力演化)）、性质测试 |
| 传输适配 | **pi-ai（D-019）** | 事件流、假 provider | 翻译成本项目语法：原始参数串、丢弃 `partial`、用量发一次、无终止事件补出错收尾、状态码从注入的 `fetch` 取（[transport 研究][TR-status]） |
| 工具帧 | 无上游 | —— | 工具直接按同一语法发帧，**不经 `pi-agent-core`** |

**兑现 N13 的方式**：语法、装配器与数据契约是纯计算、落 `packages/core/`；两个运行时与传输适配都只依赖它，彼此不依赖（草图见 [design.md](design.md#契约动作链与-cordis-投影)）。
两条链各自从脚本化输入跑到真实 JSONL 日志（D-026），共用一份语言无关的一致性用例集作判据。

**总负担**：数据层与装配器的量与 C 相同；语法层多一张对照表，换来一份现成的检查单。
**骨架里要逐项判去留的 DSH 专有形状**：收尾步骤带 `replayState`（供应商回放数据，思考签名这类——它放在块上还是收尾步骤上，是数据契约要答的，见下）；
工具调用增量按 id 关联、`name` 可选（与块索引关联并存是否必要）；`FinishReason` 的合并可扩展。

**关键反例与风险**：若补填法与整体替换需要改骨架的「按用途分的三种增量」结构（例如整体替换要一种与块类型无关的「换掉」步骤），
骨架就只剩步骤名，D 在语法层退化为 C。这不是失败，是**把 C 的推导过程多做了一张对照表**。

## 三层能不能分开选

**能。**三层的依赖是单向的：数据契约 ← 到达语法（封口交出的块用数据契约的块形状）← 装配器 ← 传输适配。
只要语法层**引用**数据契约的块、不自带一套块定义，每层就可以各选起点。

| 层 | A | B | C | D |
|---|---|---|---|---|
| 数据契约 | DSH 类型扩展 | pi 类型扩展 | 自研 | 自研 |
| 到达语法 | `StreamChunk` 扩展 | `AssistantMessageEvent` 扩展 | 自研 | `StreamChunk` 骨架 + 条款化 |
| 装配器 | fork `BlockAssembler` | fork 帧归约 | 自写 | 自写 |

**唯一不能分开的组合**：语法层用 `StreamChunk`、却让 `block-end` 携带 DSH 的 `ContentBlock`——那等于把 DSH 的数据层从后门带回来。D 明确排除这一点。

## 未单列为候选的路径

| 路径 | 为什么不单列 |
|---|---|
| 采 DSH 会话格式作落盘层 | 与 [§9.2](../../../product/PF-009-context-message-types/design.md#92-流式不留到达的过程) 直接相反（[S2][S2]），且背三条迁移（[S5][S5]）；A 已明言不采 |
| 以 minimal-runtime 的 `@omne-harness-lite/llm` 切片为起点 | 它就是 A 去掉伴件与失败归一之后的样子（[M1][M1]），未进 main、不作证据；不是一条独立的路 |
| 以 pi 的 `AssistantMessageFrame` 编码作语法 | 属于 B；它「终止结算另存」与 §9.2 同向，但没有记账步骤与填法，参数在帧里已被解析（[P8][P8]、[P4][P4]） |
| 其他生态的消息与流协议 | **本轮研究没有调查**，不凭印象列候选。PF-009 已明确拒绝过「半条消息是消息的子类」一类做法（[半条消息不是消息](../../../product/PF-009-context-message-types/design.md#半条消息不是消息)）；有人要引入别的生态，先补一轮研究 |

## 推荐与仍待区分的事项

**推荐 D。**理由按分量排：

1. **数据层没有值得继承的判别体系。**两源的消息判别轴（DSH 的 role + 来源、pi 的四种角色）都与「七种、看类型就知道谁在说话」不同，换掉根之后剩下的是字段名；
   而 pi 的类型还把只增不改的日志绑在一个六周七版的上游上。数据契约只能自研。
2. **语法层有一份值得继承的骨架。**`StreamChunk` 在 §5.5 九行里零「不可承载」，且它的不变量清单是现成的检查单；
   它的毛病在于这些检查**是可选的**——D 把它们写成条款，恰好修掉 minimal-runtime 切片暴露的那个洞。
3. **装配器的上游行为与条款方向相反，而代码量小。**fork 它等于接过一组要逐条推翻的决定；自写的成本是百余行加性质测试。
4. **N13 要求共用部分不住在任何一个运行时里。**D 把三层都放进 core，传输适配与工具帧各自只依赖它；A 与 B 的起点都把共用部分放在 LLM 或 agent 包里。

**会改变选择的证据**：

- **语法层退到 C**：对照表走一遍后发现，填法声明、整体替换或语音需要改动 `StreamChunk` 的增量结构；或数据契约选定的块身份方案与「块索引关联」冲突。
- **改选 A**：本项目决定在传输之外还复用 DSH 的 LLM 栈（例如它的回放封装），使与 DSH 上游共享代码有持续价值。在 [SYS-LLM](../../../foundation/cross-system-constraints/requirements.md#sys-llm) 与 D-019 之下，DSH 的 adapter 都用不上，**目前看不到这条路**。
- **改选 B**：产品放宽 §6.7、§6.10 或 §5.6，且 D-019 的范围扩到 `pi-agent-core`。**两者都没有迹象。**

**最小区分调查**（在起草到达语法契约之前做）：

1. **纸面走查**：写出 `StreamChunk` → 本项目语法的逐条对照表，用它走一遍「先吐日志、最后一块汇总面板」的工具帧场景与五行流断表。结构不用改 → D 成立；要改 → 语法层按 C 写。
2. **pi 原始参数探针**：用假 provider 喂一段残缺 JSON，看 `toolcall_delta.delta` 拼起来是否等于原串。它决定 D-019 fork 要不要多一个补丁，不改本推荐。

**仍待区分、但不影响起点选择的**（归属见 [design.md 交接缺口](design.md#交接缺口)）：首 token 是否含语音与整交块、工具帧的「记一次账」、工具帧违反语法的后果、块身份方案、
**供应商回放数据**（思考签名等）放在块上还是收尾步骤上——DSH 放 `ReplayEnvelope`、pi 放块上且带供应商字段，二者都与 N11 的供应商中立有张力，由数据契约起草时答。

**不做 A 的代价要明说**：放弃 DSH 装配器与伴件的现成代码，以及未来从 DSH 上游拿修复的可能。后者在我们改掉这些行为之后本来也拿不到。

[R§4]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#4-流事件语法问题二
[R§10]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#10-汇总不可承载与未覆盖
[D1]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d1-消息一个带身份的不可变值角色只有三种
[D5]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d5-装配器是宽容的语法由一个可选的不变量伴件把关
[D8]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d8-这些零件在-agent-loop-里被接成一次尝试一份结算
[D9]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d9-工具执行没有执行中往外说话的通道
[D10]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d10-调-pi-ai-的那条路由会把原始参数串换成重新序列化的结果
[D11]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d11-可测零件
[D12]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d12-与宿主的耦合
[S2]: ../../../../research/message-model-and-stream-sources/notes/dsh-session-format.md#s2-一次模型尝试一份结算结算里嵌着整条紧凑流
[S5]: ../../../../research/message-model-and-stream-sources/notes/dsh-session-format.md#s5-格式版本与迁移链
[P1]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p1-四种消息没有消息身份
[P2]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p2-内容块文本思考图工具调用
[P3]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p3-流事件每块-startdeltaend终止是-done-或-error
[P4]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p4-工具参数流中每一次-delta-都解析收尾时残缺也解析
[P5]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p5-流的结局靠实现自觉事件流类不强制
[P6]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p6-中止与出错部分内容留在消息里但组装时整条跳过
[P7]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p7-半条消息以完整消息的类型存在于上下文数组里
[P8]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p8-可回放的帧编码终止结算不在帧里
[P9]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p9-工具执行中的更新整份部分结果瞬态不落盘
[P10]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p10-应用层自定义消息与会话条目
[P11]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p11-图给不能看图的模型出门时换占位
[P12]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p12-可测零件
[M1]: ../../../../research/message-model-and-stream-sources/notes/minimal-runtime.md#m1-omne-harness-litellm-是-dsh-dsh-llm-的纯零件切片
[TR-status]: ../../../../research/model-request-transport-sources/research.md#pi-ai-的结果不带结构化-http-状态码错误文本里原样含上游响应体
[TR-diff]: ../../../../research/model-request-transport-sources/research.md#0851-到-0861-的破坏性变更落在-provider-面的-context-形状上经公开-streamsimple-入口传-context-的调用方不受直接影响
[TR-churn]: ../../../../research/model-request-transport-sources/research.md#fork-的维护面补丁打在编译产物上只覆盖一条-api-路径上游约两周一个-minor

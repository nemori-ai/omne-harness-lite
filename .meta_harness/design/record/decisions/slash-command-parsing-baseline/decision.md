# D-036：斜杠命令识别与解析的起点——按产品正文自研统一解析器

- **当前状态：已接受，一个起点方向。**
  **未接受**：任何契约（识别文法、解析结果、斜杠命令资产的数据形状都还不存在）、判定用例集、Q1–Q9 任何一项的技术选择；任何实现。
  **不在本决定接受范围**：同日产品负责人对 Q3、Q7、Q8 与三项产品未决的作答及两处补裁——那是产品正文修订，见[取代与影响](#取代与影响)。
- **来源提案**：[`proposals/slash-command-parsing-baseline`](../../proposals/slash-command-parsing-baseline/README.md)，HUB `panqiwei/assets-runtimes` 提交 `b12d927`——
  [必须保留的性质 N1–N12](../../proposals/slash-command-parsing-baseline/design.md#必须保留的性质)、
  [逐条性质对照](../../proposals/slash-command-parsing-baseline/alternatives.md#逐条性质对照)、
  [D 的组成](../../proposals/slash-command-parsing-baseline/alternatives.md#d-的组成借什么从哪借为什么只借这些)、
  [推荐与 Q1–Q9](../../proposals/slash-command-parsing-baseline/alternatives.md#推荐与仍待区分的事项)。
- **来源研究**：[slash-command-parsing-sources](../../../../research/slash-command-parsing-sources/README.md)（Codex `5c5308f`、Claude Code `2.1.280`、DSH `c291e796`、omne-next `6263fed`、pi `3390bd9`；对照的是 PF-002 rev 11 / PF-014 rev 3 / PF-016 rev 3，提案按当前 rev 重新对照）；
  [connector-and-slash-command-sources](../../../../research/connector-and-slash-command-sources/README.md) E-S1–E-S7、E-S11、E-S12。
- **需求与方法前提**：[PF-002](../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) rev 13 §4 Slash Command 与
  [decisions 2026-09-23 原话（一）（三）](../../../product/PF-002-assets-settings-and-permissions/decisions.md#2026-09-23--斜杠命令三种绑定目标mcp-的动作即工具条目连接件带身份鉴权工作区资产的权限取最严值)；
  [PF-014](../../../product/PF-014-inbound-intake-and-queueing/README.md) rev 4 §5.6、§5.10、§9.5；[PF-016](../../../product/PF-016-cli-tui-delivery-surface/README.md) rev 4 §5.4、§5.7、§6.5；
  [SYS-SPEC](../../../foundation/cross-system-constraints/requirements.md#sys-spec)。
- **实际接受依据**：2026-09-23，产品负责人（`panqiwei`）对 G1 七份复用提案逐项裁决，对本提案原话 **「D」**。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| 识别与解析链的起点：A omne-next 前缀分类器与 ADR 声明式语法、B Codex、C Claude Code、D 按产品正文自研；DSH 为排除路径 | **接受 D** | 自研一套统一解析器，识别文法、名字解析、参数解析、① ② 展开与记录、③ 分派与记录五片责任由本项目拥有；按[提案 D 的组成](../../proposals/slash-command-parsing-baseline/alternatives.md#d-的组成借什么从哪借为什么只借这些)借用：Codex 的识别边界、omne-next 的失败纪律与声明优先、Claude Code 的占位符与留痕形状——**借部件，不以任何一家为起点** | 文法与解析结果的契约、判定用例集（A1–A11 起步）都未写；提案的名字解析「交付面预判 + 受理面再判」接缝未经评审 |
| 待区分事项 Q1–Q9 | **不因本决定作技术选择** | — | Q1、Q2、Q4、Q5、Q6、Q9 是技术自由度，归契约起草（Q5 与 skill name 语法一并定、Q9 与 cli-tui D6／D7 一起定）；Q3、Q7、Q8 同日已由产品负责人作答，但作答是产品正文修订，见下节 |

## 理由与保留前提

**理由**（取自[提案推荐](../../proposals/slash-command-parsing-baseline/alternatives.md#推荐与仍待区分的事项)，产品负责人未另述理由）：
N1–N11 都已写进当前产品正文，A、B、C 各自与其中至少两条方向相反（开头至多一条、三种绑定目标、命令是独立资产、两种呈现形式一样识别、未知名不发送）；
逐条修正等于重写，修完剩下的部件正是 D 要借的。D 的代价（没有先例、自己拥有文法、判定用例与导入器）PF-002 §7 在立「单独一类资产」时已经标价并被接受，本决定没有新增它。

**保留前提：**

- **需求基线**：PF-002 rev 13、PF-014 rev 4、PF-016 rev 4。同日的产品作答落字后这几份会升 rev；落字若改动 N1–N12 的任何一条，回来复核本起点——按提案的判断，D 的结构对三项产品未决的任一答案都能表达。
- **判定用例集在三项产品未决落字前写不全**（提案原话）。产品负责人已作答，**但以正文落字为准**；落字前用例集不定稿。
- **会让选择改变的证据**沿用[提案](../../proposals/slash-command-parsing-baseline/alternatives.md#推荐与仍待区分的事项)：放开「一行多条」、把 ③ 改到另一个符号下；翻盘走新决定。

## 取代与影响

不取代任何决定。

**同日产品裁决的去向**：产品负责人 2026-09-23 对提案展开的 Q3、Q7、Q8 与三项产品未决逐一作答，随后就 Q7、Q8 补裁两处（裁决台账第 7a、7b 行）。
这六条改的是人看得到的产品规则，**是产品正文修订，不是对本提案的接受**；本决定不复述其答案，原话与读法以各 PF 下一次 rev 的正文落字和该 topic `decisions.md` 的拍板记录为准。

| 同日产品作答的事项 | 归哪份正文（下一次 rev） | 闭合条件 |
|---|---|---|
| Q3：② 型命令的参数放在哪 | [PF-002](../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) §4 Slash Command、[PF-014](../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走) §5.10 | 正文落字；**未落字** |
| Q7：参数与声明不符时（含 ① 型带声明时） | [PF-016](../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) §5.7（参数按声明）、PF-002 §4「自带的属性」 | 同上 |
| Q8：没有入口权限时报什么 | PF-016 §5.7（未知命令名明说不发送）、PF-002 §4 入口权限 | 同上 |
| 未决一：受理时认不出了怎么办（PF-014 §9.5 第二行）；台账读法认为作答连带回答了 PF-002「资产增删对进行中会话何时生效」 | [PF-014 §9.5](../../../product/PF-014-inbound-intake-and-queueing/design.md#95-斜杠命令受理时还有两处没说)、PF-002（资产增删的生效时机）、[PF-004](../../../product/PF-004-agent-definition-and-assembly/README.md)（装载时机） | 同上 |
| 未决二：③ 能否由组织或租户创作 | [PF-002 §九](../../../product/PF-002-assets-settings-and-permissions/design.md#九未决项) | 同上 |
| 未决三：保留名集合变大时已发布的同名 ① ② 型怎么办 | [PF-002 decisions §四](../../../product/PF-002-assets-settings-and-permissions/decisions.md#四已知的来源问题)、PF-002 §4「名字与撞名」 | 同上；保留名的具体分隔符等记法归规格 |

| 受影响拥有者/消费者 | 应更新的引用、契约、地图或映射 | 所需产物/责任与闭合条件 |
|---|---|---|
| 交付面呈现与受理契约、受理契约（PF-014 规格化）、斜杠命令资产的数据形状 | 起草时以本决定为起点，回链本决定与提案 | **都待立**；判定用例集先于任何实现，等上表产品落字后写全 |
| [cli-tui 提案](../../proposals/cli-tui/README.md) D7「斜杠命令与子命令共享同一份命令定义」 | 按[提案交接缺口](../../proposals/slash-command-parsing-baseline/design.md#交接缺口)建议收窄为只覆盖交付面动作与 ③ 流程 | 归 cli-tui 提案维护者；D7 本身仍是候选，本决定不接受它 |
| [skill 规格](../skill-spec-adoption/README.md)（D-034） | Q5 命令名字符集与 skill name 语法一并定 | 归契约起草 |
| [proposals 索引](../../proposals/README.md#当前主题) `slash-command-parsing-baseline` 行 | 「候选／接受边界」改为已由本决定接受 | **已完成**（与本决定同批） |

**明确不表示：**

- 任何契约被接受；识别文法、解析结果、斜杠命令资产的数据形状、判定用例集已经存在；
- 任何实现或导入器已经存在；
- Q1–Q9 的任何技术选择已作出；
- 同日的六条产品作答已被本决定接受或已落进产品正文——它们归 PF-002／PF-014／PF-016／PF-004 的下一次 rev；
- 提案里的作者推荐构成接受——接受依据只有产品负责人的原话「D」。

返回[本 topic 入口](README.md)。

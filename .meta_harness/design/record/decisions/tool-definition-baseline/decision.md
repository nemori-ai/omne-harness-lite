# D-031：工具定义数据契约的起点——按 PF-006 §5.3 自研，三源只作参考、可以照抄

- **当前状态：已接受，一个起点方向。**
  **未接受**：任何契约（工具定义数据契约还不存在）、字段清单、参数方言、返回形状；任何实现。
- **来源提案**：[`proposals/tool-definition-baseline`](../../proposals/tool-definition-baseline/README.md)，HUB `panqiwei/assets-runtimes` 提交 `b12d927`——
  [四个候选与作者推荐 D](../../proposals/tool-definition-baseline/alternatives.md#推荐与仍待区分的事项)、
  [十一条必须保留的条款 K-1～K-11](../../proposals/tool-definition-baseline/design.md#需要作出的选择)。
- **来源研究**：[tool-definition-shape-sources](../../../../research/tool-definition-shape-sources/research.md)（2026-09-23 静态阅读，24 行对照表；对照的是 PF-006 rev 14 / PF-002 rev 10，提案按 rev 16 / rev 13 重读了 `help` 与 MCP 两行）。
- **需求与方法前提**：[PF-006](../../../product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样) rev 16（§5.3 等）、
  [PF-002](../../../product/PF-002-assets-settings-and-permissions/README.md) rev 13、[PF-007](../../../product/PF-007-meta-capabilities/README.md) rev 16；
  [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)（工具协议归本项目自定）、
  [SYS-SPEC](../../../foundation/cross-system-constraints/requirements.md#sys-spec)（JSON Schema 定义数据契约）；
  根 `AGENTS.md` 研发品味「满足规格时优先复用成熟实现」。
- **实际接受依据**：2026-09-23，产品负责人（`panqiwei`）对 G1 七份复用提案逐项裁决，对本提案原话
  **「D，其他的只作为参考，可以『抄』」**。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| 工具定义数据契约以谁为起点：A 拓展 minimal-runtime、B fork DSH `core/tools`、C 移植 omne-next、D 按 PF-006 §5.3 自研 | **接受 D** | 契约起草者从产品正文与词条逐条写出 K-1～K-11，不拿任何一源的形状作底稿、再逐条剔除 | 字段清单未起草；D 与 A 的实际重合度未知（提案待区分 #1） |
| A、B、C 三源怎么用 | **只作参考，可以照抄**（原话「其他的只作为参考，可以『抄』」） | 三源的字段命名与结构可以照抄。提案的[借用清单](../../proposals/tool-definition-baseline/alternatives.md#候选与取舍)是作者已识别的可抄项；原话**没有**把可抄范围限在清单内，也**没有**要求清单逐项照搬——逐项取舍归契约起草者 | 每一项照抄进来的东西都要重新对到 K-1～K-11；提案指出的三源核心机制（A 的身份主键、B 的「定义即进程内运行时对象」、C 的来源进名字／类级帧声明／内建 `help`）与产品方向相反，**不随照抄带入** |
| 提案「仍待区分的事项」#1～#4 | **未因本决定闭合** | — | #1 重合度比对（契约起草者）；#2 参数 JSON Schema 方言（研究维护者）；#3 六项声明怎么落到 MCP 动作（契约起草者，不符回产品）；#4 `help`、MCP 两行按 rev 16 回源码重核（研究维护者） |

## 理由与保留前提

**理由**（取自[提案推荐](../../proposals/tool-definition-baseline/alternatives.md#推荐与仍待区分的事项)，产品负责人未另述理由）：
三源都要推翻各自的核心机制才能符合产品正文——A 推翻主键，B 推翻「定义是数据」，C 推翻三处核心并换语言；
推翻之后留下来的正是可照抄的那些字段结构。以某一源为起点，只是多背一份要逐条剔除的词汇。

**接受了的代价**：D 没有可继承的 schema、样例与校验测试，正确性全靠新写的规格、样例与校验证明；
「优先复用成熟实现」在这里落在字段与经验层——产品负责人用「可以『抄』」明示了这一层复用。

**保留前提：**

- **需求基线**是 PF-006 rev 16、PF-002 rev 13、PF-007 rev 16。产品再升 rev 并改到工具定义的形状、身份或声明项时，回来复核本起点是否仍成立。
- **照抄要登记来源**：DSH 是 MIT 许可；omne-next 仓库根[未见 `LICENSE`、许可未定](../../proposals/tool-definition-baseline/alternatives.md#候选与取舍)，照抄其代码或 schema 文本之前要先核许可；
  minimal-runtime 在实验分支、不在 main、[不是证据](../../proposals/tool-definition-baseline/alternatives.md#候选与取舍)——照抄它的结构不等于采信它的正确性。
- **与运行时一题的交界**：提案曾写「若运行时一题 fork DSH，数据定义与 DSH `ToolDefinition` 之间多一层适配」；
  同日 [D-032](../tool-execution-runtime-baseline/README.md) 接受运行时自研，这层适配**当前不出现**。若运行时一题将来改选 fork DSH，回来重看这一条。
- **会让起点改变的证据**沿用[提案](../../proposals/tool-definition-baseline/alternatives.md#会改变推荐的证据)：待区分 #1 显示 A 的结构改完身份后原样可用比例很高且测试能随之搬来——那时改以 A 起步要走**新决定**。

## 取代与影响

不取代任何决定。

| 受影响拥有者/消费者 | 应更新的引用、契约、地图或映射 | 所需产物/责任与闭合条件 |
|---|---|---|
| 工具定义数据契约（`spec/data/` 下，名字未定） | 起草时以本决定为起点，回链本决定与提案 | **未起草**。起草、spec-reviewer 评审、有权者接受各自另有记录，本决定不使它们自动完成 |
| [proposals 索引](../../proposals/README.md#当前主题) `tool-definition-baseline` 行 | 「候选／接受边界」改为已由本决定接受 | **已完成**（与本决定同批） |
| 研究 [tool-definition-shape-sources「采用与后续核对」](../../../../research/tool-definition-shape-sources/research.md#采用与后续核对) | 回链提案与本决定 | 归研究维护者；**未做** |
| 提案[交接缺口](../../proposals/tool-definition-baseline/design.md#交接缺口)：MCP 动作的六项声明、资产持有契约、参数方言 | 不变 | 各自 owner 照旧；资产持有契约未建立前，工具定义契约里持有键的引用要等它 |

**明确不表示：**

- 任何契约被接受，或工具定义数据契约已经存在；字段清单、参数方言、返回形状、`help` 的写法已定；
- 任何实现、schema 文件或测试已经存在；
- 提案「仍待区分的事项」四项已经做过，研究的缺口（`help`、MCP 两行按 rev 16 重核；DSH 其余工具包是否另有定义级声明）已经闭合；
- DSH `dsh-tools` 是否作为 [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel) 意义上的选定复用组件——本决定只说数据契约不以它为起点；
- 提案里的作者推荐或本决定之前的任何评审构成接受——接受依据只有产品负责人的原话。

返回[本 topic 入口](README.md)。

# D-034：Skill 规格形状的起点——采用 Agent Skills 开放格式、规则层自持，扩展声明走包内定义记录

- **当前状态：已接受，一个规格起点方向。**
  **未接受**：任何契约（Skill 包数据契约还不存在）、定义记录的路径与字段、键分类表的最终内容、任何一条具体的外部扩展；任何实现。
- **来源提案**：[`proposals/skill-spec-adoption`](../../proposals/skill-spec-adoption/README.md)，HUB `panqiwei/assets-runtimes` 提交 `b12d927`——
  [八条必要性质 P1–P8](../../proposals/skill-spec-adoption/alternatives.md#选择对象与必要约束)、
  [B 与键分四类](../../proposals/skill-spec-adoption/alternatives.md#b-采用-agent-skills-开放格式加本项目扩展)、
  [B 的扩展字段放哪](../../proposals/skill-spec-adoption/alternatives.md#b-的扩展字段放哪)、
  [推荐与会改变选择的证据](../../proposals/skill-spec-adoption/alternatives.md#推荐与仍待区分的事项)。
- **来源研究**：[skill-spec-sources](../../../../research/skill-spec-sources/research.md) 首轮（omne-next `6263fed5`、DSH `c291e796`、Claude Code `2.1.280` 与本机 122 份 `SKILL.md`）与
  [第二轮 rev 1–2](../../../../research/skill-spec-sources/changelog.md)（Agent Skills 开放格式 agentskills/agentskills `69ef37e`，规格无版本号；Codex `5c5308f`；依据报告 [round2](../../../../research/skill-spec-sources/reports/2026-09-23-round2-open-format-and-extensions.md)）。
- **需求与方法前提**：[PF-002](../../../product/PF-002-assets-settings-and-permissions/design.md#skill) rev 13、[PF-006](../../../product/PF-006-tools-and-skills/design.md#常驻) rev 16、
  [PF-007](../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能) rev 16、[PF-001](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) §6.7（提案读 rev 15）、
  [PF-003](../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动) rev 4 §6.7；
  主线两条自定（name 语法归规格、产品只要求同类别内唯一；调用面开关不进 `SKILL.md` 内容、走资产属性）；
  [SYS-SPEC](../../../foundation/cross-system-constraints/requirements.md#sys-spec)。
- **实际接受依据**：2026-09-23，产品负责人（`panqiwei`）对本提案原话
  **「B + 叠加参考或借鉴 omne-next 与我们的需求兼容的拓展、codex 与我们需求兼容的拓展」**；
  子路径补裁原话 **「走包内定义记录，也就是不放在 SKILL.md 的 frontmatter metadata」**。
  提案把「钉存开放格式原文」列为接受前必须补的一项；该项由研究第二轮 rev 1 补上后，产品负责人才就子路径作答。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| 规格形状起点：A 移植 `omne_skill_spec`、B 采用开放格式 + 本项目扩展、C fork DSH `skill/*`、D 自研最小规格 | **接受 B** | `SKILL.md`（YAML frontmatter + Markdown 正文）加可选资源目录作载体与核心字段；**规则层自持**——钉住开放格式的一个快照作基线，在其上写本项目的 JSON Schema 与规则表，上游改动经本项目显式升级才进来；键分**核心／本项目扩展／外部属性类／未知**四类处置，外部属性类与未知键不生效 | 规则表以哪个快照为基线由契约起草时写定——研究钉存的 `69ef37e` 是现成候选，本决定不钉版本；键分类表的最终内容待起草 |
| 内容类扩展声明放哪：B-1 frontmatter `metadata`、B-2a 资产属性、B-2b 包内定义记录 | **接受 B-2b**（原话「走包内定义记录，也就是不放在 SKILL.md 的 frontmatter metadata」） | 依赖声明、执行环境需求、设置项声明、正文变体这类**内容类扩展**放 `SKILL.md` 之外、包内保留路径的一份定义记录，与 `SKILL.md`、资源树同属一份资产版本的内容；**属性类**（调用面开关、预批准、谁可以用）照主线前提走资产属性，不在本项之内 | 保留路径的名字归规格；随之而来的义务（规范化摘要覆盖整个包、`Skills().read` 列资源时排除这份记录）待契约写定 |
| 本项目扩展的内容参考谁 | **叠加参考或借鉴 omne-next 与 Codex 各自与本项目需求兼容的扩展** | 方向：两家的扩展是参考源，「兼容」以 P1–P8 判。研究第二轮的 [42 行盘点](../../../../research/skill-spec-sources/reports/2026-09-23-round2-open-format-and-extensions.md)是现成输入 | **没有接受任何一条具体扩展**；逐条取舍归 Skill 包契约起草。研究已指出不能原样带入的几类：Codex 侧车 `agents/openai.yaml` 里的 `policy`（调用面开关随内容复制，与 P6 相抵）、`dependencies`（带连接端点的安装提示，不是能力依赖）；omne-next 版本快照保留上限 20（与 P5 相抵）；Claude Code `` !`cmd` `` 展开即执行（与 P4、P7 相抵） |

## 理由与保留前提

**理由**（取自[提案推荐](../../proposals/skill-spec-adoption/alternatives.md#推荐与仍待区分的事项)，产品负责人未另述理由）：
A 与 C 原样下各有必要性质不成立（A：P7 定界截断；C：P3、P5、P6）；B 与 D 都能兑现八条，B 复用开放格式已定义的核心、只自持规则层与扩展，D 要重建核心并双向转换；
B 唯一的「有前提」（P6）由键分类表兑现，这张表 D 也要写。B-2b 不依赖 `metadata` 值类型，把上游管辖与本项目扩展分在两份 Schema。

**提案「会改变选择的证据」按第二轮研究逐行核对：**

| 提案所列证据 | 第二轮研究的事实 | 结果 |
|---|---|---|
| 开放格式原文规定某个属性类键（如 `allowed-tools`）**必须**被宿主执行 → 转向 D | [`allowed-tools` 是实验性字段](../../../../research/skill-spec-sources/research.md#开放格式的-allowed-tools-是实验性字段没有要求宿主必须执行)：原文「Experimental. Support for this field may vary between agent implementations」，规格全文没有任何字段被规定为宿主必须执行，也没有宿主合规条款 | **未触发**：「外部属性类不生效」不构成不合规，B 成立 |
| 原文允许 `metadata` 放结构化值，且创作主要发生在直接改 `SKILL.md` → B-2b 转 B-1 | [`metadata` 值只许字符串](../../../../research/skill-spec-sources/research.md#开放格式规定-metadata-值只许字符串实现与生态实例多处不守)（PR #479 已把概览表补成字符串一边）；实现与生态多处不守 | **未触发**；产品负责人另行明裁 B-2b，两者同向 |
| 原文与本机实例在 name 语法或定界上有实质差异 → 不改 B，规则表以原文为基线、导入器补偏差 | [name 字符集表述含糊](../../../../research/skill-spec-sources/research.md#开放格式的-name-规则五条字符集表述自相含糊参考库接受-unicode-字母)（ASCII 小写与 Unicode 小写二选一）；[闭合定界行未要求独占一行](../../../../research/skill-spec-sources/research.md#开放格式没有规定闭合定界行必须独占一行参考库与-omne-next-core_v1-都会截断)；[未知顶层键未作规定](../../../../research/skill-spec-sources/research.md#开放格式对未知顶层键未作规定参考校验器拒收两家宿主静默忽略) | **触发，但按提案不改 B**：三处都要由本项目规则层自己写定，这正是「规则层自持」 |
| `omne_agent_capabilities` 通读后发现一套已验证的版本／发布／检索规格 | 第二轮只读到 domain 层：版本快照 frozen 且带 `content_hash`，但保留上限 20 | 不改格式选择（版本归资产版本线）；application 与 agentic 层仍未读 |

**保留前提：**

- **需求基线**：PF-002 rev 13、PF-006 rev 16、PF-007 rev 16、PF-001 §6.7（提案读的是 rev 15）、PF-003 rev 4 §6.7；主线两条自定。产品再改到 Skill 的身份、调用面或版本时回来复核。
- **键分类表要补**：研究 rev 2 指出提案的外部属性类清单未含 Claude Code 文档里的 `arguments`、`disallowed-tools`、`effort`、`context`、`agent`、`background`、`hooks`、`paths`、`shell` 与 Codex 侧车键——契约起草时补齐，**不改本选择**。
- **翻盘走新决定**：开放格式后续改动（研究列出的 issue #514、#350、#485 若合入）触及上表判断时，回来复核；改选 D 或 B-1 要走新决定。

## 取代与影响

不取代任何决定。

| 受影响拥有者/消费者 | 应更新的引用、契约、地图或映射 | 所需产物/责任与闭合条件 |
|---|---|---|
| Skill 包数据契约、导入器提供者设计、`Skills()` 的 `read`／`exec_script` 契约 | 起草时以本决定为起点，回链本决定与提案 | **都未起草**。起草、评审、接受各自另有记录 |
| 提案[证据义务](../../proposals/skill-spec-adoption/design.md#证据义务与受阻消费)第一行「开放格式原文未取证，挡 B 的接受」 | 提案正文不改；该行由研究 rev 1 的钉存事实闭合，本决定在此登记 | **已闭合**（研究 `9ab1e36`）；提案其余证据义务行（本机实例 name 合规率、Codex frontmatter 字段集等）照旧不挡选择 |
| 提案[交接缺口](../../proposals/skill-spec-adoption/design.md#交接缺口)：正文变体放哪、② 型参数与 Claude Code 正文特性、导入时是否同时生成 ② 型命令 | 不因本决定改动 | ② 型参数放哪同日另有产品裁决，归产品正文（见 [D-036](../slash-command-parsing-baseline/decision.md#取代与影响)）；其余归契约与导入器起草 |
| [proposals 索引](../../proposals/README.md#当前主题) `skill-spec-adoption` 行 | 「候选／接受边界」改为已由本决定接受 | **已完成**（与本决定同批） |

**明确不表示：**

- 任何契约被接受；Skill 包契约、定义记录的保留路径与字段、JSON Schema、规则表已经存在；
- 任何实现或导入器已经存在；
- omne-next 或 Codex 的任何一条具体扩展已被采纳——接受的只是「参考两家兼容扩展」的方向；
- 规则表的基线快照已钉为 `69ef37e`，或 name 字符集、定界行规则、未知键处置已定；
- 研究缺口已全部闭合：宿主是否真按文档执行 `allowed-tools` 等仍无探针，`omne_agent_capabilities` 的 application 与 agentic 层未读，研究「第二轮的未知」各行仍开着；
- 提案里的作者推荐构成接受——接受依据只有产品负责人的两段原话。

返回[本 topic 入口](README.md)。

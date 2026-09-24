# data.tool-definition v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.tool-definition, 1)`——
  `family = data`、`topic = tool-definition`、规范路径 `spec/data/tool-definition/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`（2026-09-23 起草，2026-09-24 整批对齐，同日按 PF-006 rev 19 修订，再按第一轮独立评审处置修订）——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-006 rev 19**、**PF-002 rev 20**、**PF-005 rev 5** 为准；
  只引而不据以立条款的：PF-007 rev 18、PF-009 rev 8、PF-012 rev 14
- **精确语义依赖**（逐项在 catalog 登记）：

  | 坐标 | 消费 clauses | 取它的什么 | 状态 |
  |---|---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1` | [S-1](../../content-blocks/v1/contract.md#s-1-七类块)、[S-2](../../content-blocks/v1/contract.md#s-2-块底座)、[S-6](../../content-blocks/v1/contract.md#s-6-模态由媒体类型判定)、[S-7](../../content-blocks/v1/contract.md#s-7-媒体类型的规范形式)、[S-10](../../content-blocks/v1/contract.md#s-10-语音块与图块)、[S-16](../../content-blocks/v1/contract.md#s-16-结果里不发起调用)、[S-17](../../content-blocks/v1/contract.md#s-17-六种收场)、[S-20](../../content-blocks/v1/contract.md#s-20-派生表示的产出者与能力标识)、[S-21](../../content-blocks/v1/contract.md#s-21-attachmentref)、[S-26](../../content-blocks/v1/contract.md#s-26-表示层拒绝值) | 块恰七类（`ToolResult` 的 `blocks` 取其中的块，S-1）；`$defs` 的 `ContentBlock`、`AttachmentRef`、`CapabilityId`、`Modality`、`MediaType`、`ExecutionOutcome`、`InlineBytes`；两条规则——「工具结果块里不得含工具调用块」（拒绝值 `call_in_result`）与「块的模态由媒体类型决定」 | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.asset-model · v1` | [S-2](../../asset-model/v1/contract.md#s-2-能力标识名的词法)、[S-10](../../asset-model/v1/contract.md#s-10-八类正文的外壳)、[S-12](../../asset-model/v1/contract.md#s-12-属性声明由正文推出)、[S-13](../../asset-model/v1/contract.md#s-13-设置项类别)、[S-15](../../asset-model/v1/contract.md#s-15-disabled-是保留项名)、[S-36](../../asset-model/v1/contract.md#s-36-usableby-是保留项名) | 能力标识名的词法；「正文的 `name` 与 `capability.name` 逐码点相等、不等即 `malformed`」（S-10，[S-2](#s-2-身份是-name) 据以写）；属性声明的形状与「由正文推出」的义务；设置项类别四值——`SettingCategory` `$ref` 它；两个保留项名 | 候选 |

  **只引名字，不复制定义。**`data.asset-model` 的 `tool` 壳 `$ref` 本契约的 `ToolDefinition`，那是结构上的前提，不是本契约对它的消费。
  **本契约不依赖 `data.offer-expiry`**（没有时间点值），**也不依赖 `data.identity-values`**（定义里没有归属身份，见 [S-2](#s-2-身份是-name)）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.tool-definition/v1#S-7`。
  缺口 `G-n`、性质 `P-n`、消费者核对场景 `CS-n`、`malformed` 的情形编号 `M1`～`M27`（[S-26](#s-26-表示层拒绝值与判定次序)）同此范围

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 「工具」指三样东西，定义是数据 | [PF-006 §5.2](../../../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同) | S-1、S-30 |
| 一份工具定义长什么样：两种范式 | [PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样) | S-3～S-7 |
| 多命令工具在模型面前只有紧凑的命令清单一种样子；带不带每个命令的完整参数是作者的权衡——带了用于校验与答用法、不进模型面前，没带则参数对不对由工具自己判；`help` 可选、带了须与 `inspect` 一致 | [PF-006 §5.3 那一小节](../../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)（rev 19） | S-5、S-7、S-8 |
| 工具说明与每个参数的说明必填；多命令工具每个命令那一行说明也必填 | [PF-006 §5.3 说明必填](../../../../product/PF-006-tools-and-skills/design.md#工具说明与每个参数的说明必填)（rev 19） | S-4、S-5、S-8 |
| 六项可选声明及各自的缺省 | [PF-006 §5.3 六项可选声明](../../../../product/PF-006-tools-and-skills/design.md#六项可选声明) | S-9、S-11 |
| 其中两项是设置项：形状与默认值由定义给 | [PF-006 §5.3 其中两项声明的是设置项](../../../../product/PF-006-tools-and-skills/design.md#其中两项声明的是设置项) | S-10～S-12 |
| 不在定义里的三样 | [PF-006 §5.3 不在定义里的三样](../../../../product/PF-006-tools-and-skills/design.md#不在定义里的三样) · [帧由协议约定，不由定义声明](../../../../product/PF-006-tools-and-skills/design.md#帧长什么样由一份协议约定不由工具定义声明) | S-29 |
| 返回值两种写法、一种模型；每次执行留一份账 | [PF-006 §5.4](../../../../product/PF-006-tools-and-skills/design.md#54-返回值两种写法一种模型) · [两种写法只剩一种](../../../../product/PF-006-tools-and-skills/design.md#两种写法到-agent-loop-那里只剩一种) · [每一次执行都留一份账](../../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账) | S-20、S-21、S-25、S-29 |
| 依赖：一串必需项的抽象名字 | [PF-006 §4 依赖](../../../../product/PF-006-tools-and-skills/design.md#依赖) · [只有且，只有必需](../../../../product/PF-006-tools-and-skills/design.md#只有且只有必需) · [§6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析) | S-9、S-19、S-24 |
| 替换件同形、只换说明 | [PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装) | S-6、S-8、S-27 |
| 后台许可与转后台阈值 | [PF-006 §6.6](../../../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度) | S-12 |
| 前台上限与并发上限是偏好类设置：定义给默认值、各层配值，不设就没有这一项限制 | [PF-006 §6.6 前台上限与并发上限](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限) | S-13 |
| 工具怎么提执行环境的要求 | [PF-006 §6.8](../../../../product/PF-006-tools-and-skills/design.md#68-工具怎么提执行环境的要求) | S-11 |
| 卸载的两条来路；系统不替作者写摘要 | [PF-006 §6.10](../../../../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度) · [两条来路，产物不同](../../../../product/PF-006-tools-and-skills/design.md#两条来路产物不同) · [§4 卸载](../../../../product/PF-006-tools-and-skills/design.md#卸载) | S-23 |
| 工具两端各要什么模态 | [PF-006 §6.11](../../../../product/PF-006-tools-and-skills/design.md#611-工具两端各要什么模态) | S-9、S-19、S-24 |
| MCP 接入点带来的动作 | [PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作) · [PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp) · [D-037](../../../../record/decisions/mcp-client-adoption/README.md) | S-2、S-15、S-17 |
| 身份是「类别 ＋ name」，其余归实现 | [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) | S-2 |
| Tool：多命令只占一个槽位、子命令是内部结构、设置（超时、并发、目标环境等）、执行权限三档、组合 Skill、可自带实现 | [PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool) | S-2、S-5、S-6、S-13、S-15、S-16、S-30 |
| 谁能组合谁 | [PF-002 §4 谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁) · [§6.3 组合的引用指向能力标识](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识) | S-16、S-17 |
| 设置项分四类；三方分工；项的目录由组装决定 | [PF-002 §5.2 设置项分四类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别) · [三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值) · [两个推论](../../../../product/PF-002-assets-settings-and-permissions/design.md#由此得到两个推论) | S-10～S-13 |
| 四种执行环境；设施 | [PF-005 §5.1](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境) · [PF-005 §4 设施](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#设施) · [§6.9 不降级](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级) | S-11 |
| 三档怎样落进放行四步（**只引**） | [PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步) | S-15 |
| `Tools().inspect`（**只引**） | [PF-007 §6.1](../../../../product/PF-007-meta-capabilities/design.md#61-tools通向任意非常驻工具) | S-8 |
| 卸载站在哪一步、原始结果不进日志（**只引**） | [PF-012 §5.10](../../../../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关) | S-23 |
| 块的两个标注；工具结果两边都感知得到（**只引**） | [PF-009 两个标注](../../../../product/PF-009-context-message-types/design.md#每个块带两个标注给人看吗给模型看吗) · [七种消息各自谁感知得到](../../../../product/PF-009-context-message-types/design.md#七种消息各自谁感知得到) | S-20 |
| 附件放在工具定义声明的那个存储里 | [领域对象：附件](../../../../domain_objects/objects.md#ul-attachment--附件) | S-24 |
| 起点：按 PF-006 §5.3 自研，三源只作参考 | [D-031](../../../../record/decisions/tool-definition-baseline/README.md) | 全文 |
| 产品负责人对形状草案的裁决：**Q5** 多命令工具的模型面是一份 schema、带 `command` 判别；**Q6** 设置与执行权限的默认值由定义给；**Q7**（备查）作者卸载却没写摘要时占位由运行时给 | [D-038 Q5 / Q6 / Q7](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) | S-6、S-7（Q5）；S-10、S-15（Q6）；S-23（Q7） |
| 命令 `input` 里不许有根相对 `$ref` 与 `$id` | 主线裁定，见 [D-040 §S5 S5-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s5tool-definition报回的) | S-7 |
| 设置项与权限项按推出规则产出资产的属性声明 | 主线裁定，见 [D-040 §块 A A3](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-a-形状shapes-draft-assets-v0md-a1a10)；规则的义务在 [`data.asset-model/v1#S-12`](../../asset-model/v1/contract.md#s-12-属性声明由正文推出) | S-10、S-31 |
| `name` 就是能力标识的名、不是第二身份 | [`data.asset-model/v1#S-10`](../../asset-model/v1/contract.md#s-10-八类正文的外壳)（正文的 `name` 与 `capability.name` 逐码点相等） | S-2 |
| MCP 来源的条目不按结果端模态判 | 主线裁定，见 [D-040 §五 K11](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)（取代 [D-040 §S19 S19-e](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的)「按桥的投影判」），与 `capability.mcp-bridge/v1#S-17` 一致 | S-24 |
| **工具定义必须能直接构造出各家模型供应商要求的工具 payload**：三家的模型面条目都是同一份三元组 `{name, description, 参数 schema}`、只差键名与外壳；参数 schema 顶层 `type: "object"`；每个参数带说明；Anthropic 的工具名正则不含 `:` | [研究 V-1～V-4](../../../../../research/tool-definition-shape-sources/evidence.md)，产品负责人 2026-09-24 要求（[D-039 U-24-1](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#凭据档案工具拓展件卡片-pf-013-rev-10pf-002-rev-1819pf-006-rev-19pf-012-rev-12pf-007-rev-17pf-008-rev-7pf-016-rev-6)；V 组取证钉在主检出 `tmp/sources/extracted/`，只对抓取当日的页面成立）；「说明必填」的产品正文是 [PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#工具说明与每个参数的说明必填)（rev 19） | S-4、S-6、S-7、S-18、S-26、[第七节](#七装配给与协议给)、G-1、G-12 |
| **多命令工具的模型面只支持 flat 形**：`command` 枚举带命令表说明、`args` 只说「是一个对象」，不生成 `oneOf` 判别联合；判定仍按所选命令的 `input` | 产品负责人裁定 2026-09-24（[D-039 U-24-2](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#凭据档案工具拓展件卡片-pf-013-rev-10pf-002-rev-1819pf-006-rev-19pf-012-rev-12pf-007-rev-17pf-008-rev-7pf-016-rev-6)），落在 [PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)（rev 19：模型面前只有命令清单一种样子）；D-038 Q5「一份 schema 带判别字段」的 flat 读法；对照 omne-next `multi_command.py` 默认 `dispatch_mode="flat"`（[研究 O-2](../../../../../research/tool-definition-shape-sources/evidence.md#o-2-多命令范式-basemulticommandtool)） | S-5、S-7、S-8、CS-1、G-3、G-12 |
| **MCP 来源定义的说明与参数 schema 由桥做最小规范化**（缺说明补占位、剥 `$schema`／`title`、`{"type": "object"}` 视为无参数） | 缺说明补占位是主线裁定，见 [D-040 §二「产品批二报回」⑥](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#二2026-09-24-用户在场期间主线随用户裁决所作的自定账本-二-原文标主线自定的行)，已记进 [PF-006 decisions §四「MCP 动作缺说明」](../../../../product/PF-006-tools-and-skills/decisions.md#四已知的来源问题)；规范化的其余两项由 `capability.mcp-bridge/v1#S-17` 定 | S-17 |
| **判参数时未知键一律拒**：`input` 顶层没写 `additionalProperties` 按 `false` 读，作者显式写 `true` 或一份 schema 才收；模型面不因此改写 | 主线裁定，见 [D-040 §六 N-1](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；依据 [研究 V-5](../../../../../research/tool-definition-shape-sources/evidence.md) 结论 ③（没有 inspect 时模型臆造参数名） | S-5、S-7 |
| 规格形式 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) | S-14、S-18、S-26～S-28 |
| 部署边界 | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | [第七节](#七装配给与协议给) |

> **没有产品行的条款**：[S-14](#s-14-时长的表示)、[S-18](#s-18-名字的表示与相等)、[S-26](#s-26-表示层拒绝值与判定次序)～[S-28](#s-28-判别式与枚举闭合) 由 SYS-SPEC 供给（表示、相等、校验与「表示层不等于判定」是规格形式的事）；
> [S-7](#s-7-多命令-input-的生成规则) 的次序（2026-09-24 的 flat 裁定沿用了它）、[S-20](#s-20-两种写法与等价规则) 的两个标注取值是**本契约的推导**，理由写在条款里。
> 「只占一个条目」另有 PF-002 §4 Tool 与 PF-006 §5.3 的正文依据；D-038 Q6 与 [PF-006 §6.6「定义给默认值」](../../../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)一致。
>
> **主线的规格层裁定**（不需问产品负责人的读法与形状），见 [D-040 §S5](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s5tool-definition报回的)：S-7 生成规则曾改为每命令一支的顶层 `oneOf`（S5-a，已被产品负责人 2026-09-24 的 flat 裁定取代，见上表）；`JsonSchema` 只要求是对象、合法性由实现校验（S5-b；S-4、S-26）；
> 有阈值而无后台许可即拒（S5-c；S-12）；`help` 是文本字段，由 `Tools().inspect` 呈现（S5-d；S-8）；无专名的形状错误逐条列为 `malformed` 的 M 条目（S5-e；S-26）。

## 一、目的与消费者

### 这份契约拥有什么

**两样东西：**

1. **工具定义的形状与含义**——一份定义长什么样、两种范式怎么区分、多命令工具的模型面 input 怎么生成、
   六项可选声明各是什么、其中哪几项是设置项（形状、类别与默认值）、执行权限的默认值、组合与来源。
2. **工具返回值的形状与含义**——两种写法、一种模型（`ToolResult`），以及卸载在返回值里怎么表达。

它是一份**数据契约**：没有操作、没有状态转移、没有提交点，**因此不需要插件**。
它有两条**纯派生**——模型面 input（[S-6](#s-6-模型面只有一个条目)、[S-7](#s-7-多命令-input-的生成规则)）与裸字符串的等价（[S-20](#s-20-两种写法与等价规则)）：
都只在**表示合法**的输入上求值（[S-26](#s-26-表示层拒绝值与判定次序)），在其上处处有定义，无状态、无失败分支、无缺席分支、无提交点。

**不拥有**：执行（派发、求值设置、落点匹配、收场判定——归工具执行运行时 `capability.tool-execution-runtime` v1，candidate）；
实现工件怎么装（提供者设计）；等待态、发帧、要不要卸载的判断（[S-29](#s-29-不在定义里的三样)）；
MCP 列举怎样生成定义（`capability.mcp-bridge` v1 的 S-17）；技能包（另一份契约）；每一次执行的账（`data.call-accounts`，只引）。

### 消费者

| 消费者 | 消费什么 |
|---|---|
| **工具执行运行时**（`capability.tool-execution-runtime` v1，candidate） | 按定义派发（[S-4](#s-4-单函数工具)～[S-7](#s-7-多命令-input-的生成规则)）、设置项的形状与类别（[S-10](#s-10-设置项声明)～[S-13](#s-13-超时与并发)）、依赖声明的组成（[S-19](#s-19-由定义得出的依赖声明)）、收返回值（[S-20](#s-20-两种写法与等价规则)～[S-25](#s-25-toolresult-不是收场)）、表示层拒绝（[S-26](#s-26-表示层拒绝值与判定次序)～[S-28](#s-28-判别式与枚举闭合)） |
| **agent 装配**（PF-004 的契约，尚未建立） | 模型面：一个条目、一份 input（[S-6](#s-6-模型面只有一个条目)、[S-7](#s-7-多命令-input-的生成规则)）；说明（[S-8](#s-8-说明与用法)）；组合（[S-16](#s-16-组合)） |
| **放行判断**（[PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步) 的落点：`capability.tool-admission` v1，candidate） | 执行权限的默认值（[S-15](#s-15-执行权限)） |
| **资产持有与配值**（PF-002 的契约：`data.asset-model` v1、`capability.asset-governance` v1、`capability.asset-evaluation` v1，均为 candidate） | 一个工具有哪几项设置、各自类别与默认值（[S-10](#s-10-设置项声明)～[S-13](#s-13-超时与并发)）；执行权限默认值（[S-15](#s-15-执行权限)） |
| **MCP 桥**（[D-037](../../../../record/decisions/mcp-client-adoption/README.md) 所说的桥接契约：`capability.mcp-bridge` v1，candidate） | 由列举结果生成的定义长什么样（[S-17](#s-17-来源)、[S-18](#s-18-名字的表示与相等)）；投影规则在那份契约的 S-17（原 [G-8](#十已知缺口)） |
| **`Tools().inspect`**（PF-007 的契约，尚未建立） | 用法说明与一致性义务（[S-8](#s-8-说明与用法)） |

## 二、含义与使用范围

**适用范围**：**一个部署之内**。第一版是单机，但下面每一条的含义在跨进程之后必须原样成立；
哪些结论由装配顺带给出、分布式后须由协议重新兑现，列在[第七节](#七装配给与协议给)。

### 三类东西，不要混读

| 类 | 是什么 | 在哪 |
|---|---|---|
| **定义** | 一个工具的身份与表示：`ToolDefinition` 及其成员 | [第三节](#三定义值身份与结构) |
| **返回值** | 工具函数交回来的东西：`ToolReturn`、`ToolResult`、`Offload` | [第四节](#四返回值) |
| **表示层拒绝值** | 形状不合时的十二个具名拒绝，**不是判定** | [第五节](#五表示与边界校验) |

### 与相近概念的差异

- **工具定义 ≠ [工具](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-tool--工具--tool)。**工具是那一类资产；定义是它在数据与治理层面的**一份表示**，同一个身份下可以有平台、组织、租户各一份。
- **工具定义 ≠ 动作空间里的条目 ≠ [工具执行](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)。**条目是构成、绑 agent runtime；执行是计算资源、绑会话。本契约只拥有第一样。
- **`ToolResult` ≠ [执行收场](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)。**前者是工具交回来的内容，后者是运行时对这一次执行的判定（[S-25](#s-25-toolresult-不是收场)）。
- **设置项的默认值 ≠ 它的生效值。**定义给默认值，各层配值，运行时求值（[S-10](#s-10-设置项声明)）。
- **执行权限的 `auto` ≠ [执行环境权限](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-execution-environment-permission--执行环境权限--execution-environment-permission)的 `auto_place` ≠ 会话运行模式的 `auto_permission`。**三者各管一维。
- **组合 ≠ 依赖。**[资产组合](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition)说由什么构成，[依赖声明](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)说还需要什么在场（[S-16](#s-16-组合)、[S-19](#s-19-由定义得出的依赖声明)）。

### 规格层的名字与词条

**有词条的，token 与词条的对应写在这里，消费者不必自己猜。**token 是交换表示，词条名是给人读的，**两者不得互相替代**。

| 规格层 token | 词条 / 产品正文的说法 |
|---|---|
| `BindingLayer = "host_machine"` | [宿主机 · Host Machine](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine) |
| `BindingLayer = "stateless_sandbox"` | [无状态沙箱 · Stateless Sandbox](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-stateless-sandbox--无状态沙箱--stateless-sandbox) |
| `BindingLayer = "session_sandbox"` | [会话级沙箱 · Session-Scoped Sandbox](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-sandbox--会话级沙箱--session-scoped-sandbox) |
| `BindingLayer = "tenant_sandbox"` | [租户级沙箱 · Tenant-Scoped Sandbox](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-tenant-sandbox--租户级沙箱--tenant-scoped-sandbox) |
| `SettingCategory`（`data.asset-model` 的）的 `preference` / `binding` / `placement_identity` / `governance` | [设置项类别](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)的偏好 / 绑定 / 落点与身份 / 治理 |
| `ExecutePermission.default` 的 `forbid` / `auto` / `ask` | [PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool) 执行权限三档的禁止 / 自动 / 问一下 |
| `ToolNeeds.inputModalities` / `outputModalities` 的取值 | [模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality)，形状归 `data.content-blocks` 的 `$defs/Modality` |

**没有词条的**：「范式」（单函数 / 多命令）、「绑定层」、「模型面」——三者都是产品正文里的说法，统一语言没有独立词条
（[UL-tool](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-tool--工具--tool) 只说「一个 tool 可以是多命令的」）。
本契约**用它们，不给它们下词条式定义**，已报主线。

## 三、定义：值、身份与结构

### S-1 工具定义是什么

**工具定义是一个工具在数据与治理层面的身份与表示**
（[UL-tool-definition](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)）：
叫什么、收什么参数、怎么说明，以及它的各项声明。**它是数据，长期存在**，谁持有它就归谁
（「工具」指的三样东西里的第一样，[PF-006 §5.2](../../../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)）。

它**不是运行时对象**：定义里没有进程内对象、闭包、注册代际、取消钩子，也没有代码（[S-30](#s-30-实现不在定义里)）；
读它的运行时**不回写它**。这使它可以被存储、复制、在跨进程时原样交换（[SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec)）。

### S-2 身份是 name

**作者写的定义（`origin.kind = authored`，[S-17](#s-17-来源)）身份是它的 `name`**：
它的[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)是「类别 `tool` ＋ `name`」。
**`name` 就是那个能力标识的 `name`，不是第二个身份**：定义作为资产被持有时，资产记录上的 `AssetDefinition.capability`（`data.asset-model/v1#S-10`）是身份的唯一家，`name` 必须与 `capability.name` 逐码点相等；
名字的词法按 [`data.asset-model/v1#S-2`](../../asset-model/v1/contract.md#s-2-能力标识名的词法)（本契约的 [S-18](#s-18-名字的表示与相等) 对作者写的定义的 `name` 从它）。
`name` 相等（[S-18](#s-18-名字的表示与相等)）的两份定义**是同一个工具的两份表示**——平台一份、组织一份、租户一份，彼此替代
（[PF-002 §4 身份是「类别 ＋ name」](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)）；
谁生效由层级求值决定，**不在本契约**。

**其余一切都不是身份**：`input`、`commands`（子命令集合）、`description`、`help`、四项依赖名、设置项与其默认值、
执行权限默认值、`composes`、由哪个包提供实现——**换一份表示，这些都可以全不一样**
（[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool) 的身份行）。
消费者**不得**用其中任何一个判断「这两份是不是同一个工具」，也**不得**把它们拼进身份键。

**定义里不带归属。**「哪一层的那一份」由[资产持有](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)给出，
不是定义的成员：定义里没有租户身份、组织身份，也没有版本号——[资产版本](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-version--资产版本--asset-version)归持有与版本选用。

**MCP 来源的定义（`origin.kind = mcp`）没有能力标识**：那些动作不是资产
（[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)、[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)）。
它的 `name` 只是动作空间里那个条目的名字；它指认的对端动作由 `(endpoint, remoteName)` 确定（[S-17](#s-17-来源)）。

### S-3 两种范式

**判别成员 `paradigm`，恰两值**：`single`（单函数：没有命令，全是参数）、`multi`（多命令：先选命令，再给那个命令的参数）。
作者挑一种（[PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)）。
没有第三种；未知取值拒绝，拒绝值 `paradigm_unknown`（[S-28](#s-28-判别式与枚举闭合)）。

### S-4 单函数工具

`paradigm = single` 的定义：

- **必带 `input`**：**就是这个工具的参数 schema**，原样即模型面的 input（[S-6](#s-6-模型面只有一个条目)）。
  **取值必须是 JSON Schema Draft 2020-12 的合法 schema，由实现校验，不由本 Schema 表达**：本契约的 Schema 只要求它是一个 JSON 对象、顶层带 `"type": "object"` 与对象 `properties`（`$defs/JsonSchema`；下面第 1 条硬要求）。
  因此布尔 schema（`true`、`false`）不收——它们合法，却不是对象。不是对象、或是对象却不合 Draft 2020-12，都是 `input_not_schema`（[S-26](#s-26-表示层拒绝值与判定次序) 第 5 行）。
- **不得带 `commands`**，带了即 `commands_forbidden`。

**参数 schema 的三条硬要求**（[研究 V-1～V-4](../../../../../research/tool-definition-shape-sources/evidence.md)，产品负责人 2026-09-24 要求，[D-039 U-24-1](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#凭据档案工具拓展件卡片-pf-013-rev-10pf-002-rev-1819pf-006-rev-19pf-012-rev-12pf-007-rev-17pf-008-rev-7pf-016-rev-6)）——`single` 的 `input`、`multi` 每个命令的 `input`（[S-5](#s-5-多命令工具)）、以及生成出的 `modelInput`（[S-7](#s-7-多命令-input-的生成规则)）都要满足（其中「schema 的位置」见列表之后）：

1. **顶层恰带 `"type": "object"` 与 `properties`**：`type` 的值就是字符串 `"object"`，`properties` 是一个对象、**可以为空对象**，`required` 可带可不带。
   不合 ⇒ `malformed`（M26）。依据：OpenAI 明写 `parameters` 顶层须 `type: "object"`（研究 V-1），Anthropic 的 `input_schema` 与它组装进系统提示的写法同（V-2）。
2. **每个位置上的 `properties` 的每一个成员 schema 都带非空的 `description`**——顶层的参数、嵌套对象的参数、数组 `items` 是对象时它的参数、对象形 `additionalProperties` 里的参数、`anyOf`／`oneOf` 各支里的参数，一概如此。
   缺了或为空串 ⇒ `parameter_description_missing`（[S-26](#s-26-表示层拒绝值与判定次序) 第 6 行）。依据：[PF-006 §5.3「工具说明与每个参数的说明，必填」](../../../../product/PF-006-tools-and-skills/design.md#工具说明与每个参数的说明必填)（rev 19）——缺了就不是一份完整的工具定义；两家都把参数说明当作模型用对工具的关键（研究 V-1「推荐」、V-2「最重要的因素」），写成必填代价为零（V-4 第 3 条）。
3. **只用可呈现子集里的关键字**：`type` `properties` `required` `description` `enum` `const` `items` `additionalProperties` `anyOf` `oneOf` `minimum` `maximum` `minLength` `maxLength` `pattern` `format` `default`。
   别的关键字——含任何 `$ref`、`$id`、`$defs`、`$schema`、`title`、`allOf`、`not`、`if`——⇒ `malformed`（M27）。这一份就是「**非 strict 模式下 OpenAI Chat Completions 与 Anthropic 都直接接受**」的子集（[G-12](#十已知缺口) 收窄到这里）。
   只在下面那份清单里的位置上数关键字：`properties` 下的成员名是参数名、`enum`／`const`／`default` 的值是数据，都不是关键字。

**schema 的位置**（第 2、3 条共用这一份封闭清单）：参数 schema 的根是一个位置；一个位置上的 schema 是 JSON 对象时，下列各处也是位置，依此递归——
它的 `properties` 的**每一个成员**、它的 `items`、它的 `additionalProperties`（**只在取值是对象时**）、它的 `anyOf` 与 `oneOf` 的**每一支**。**清单以外的地方都不是位置**，第 2、3 条都不走进去：
清单以外的关键字（`allOf`、`not`、`if`、`$defs` 等）下面的东西，由第 3 条对那个关键字本身报 M27，不再往里数说明或关键字。

**第 2 条与第 3 条同时违反时**：报 `parameter_description_missing`——它在 [S-26](#s-26-表示层拒绝值与判定次序) 的次序里排在 `malformed`（M27）之前。说明缺在清单以外的地方（例如 `allOf` 一支里）不算第 2 条违反，这份 schema 报 M27。

三条与「合法的 Draft 2020-12 schema」一样，是**表示层校验在 Schema 之外的那一步**（第 1 条的顶层两项 Schema 也管）；合在一起保证[第七节](#七装配给与协议给)那一句：**模型面条目投成任何一家的工具声明都不需要改写 schema**。

### S-5 多命令工具

`paradigm = multi` 的定义：

- **必带 `commands`**：一个**非空**映射，命令名 → 命令定义 `{ description, input, help? }`。缺或为空即 `commands_missing`。
  每个命令的 `description` 必填（说明这一个命令），`input` 是这个命令的参数 schema（要求同 [S-4](#s-4-单函数工具)，含那三条硬要求），`help` 可选（[S-8](#s-8-说明与用法)）。
- **不带 `input`**：多命令工具的模型面 input **由 `commands` 生成**（[S-7](#s-7-多命令-input-的生成规则)），**不是一个被存下的成员**。
  定义里再带一份 `input` 就有了两份权威，其中一份迟早与 `commands` 对不上；带了即 `malformed`（M13）。
- **命令是工具的内部结构，不是资产**（[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)）：
  命令没有自己的能力标识、持有、设置或权限，随工具一起被持有、配置与授权；命令名只在这个工具之内有意义。
- **定义里带多少，是作者的权衡**（[PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)）：
  只带命令清单、每个一句话，或带全部命令的完整参数，系统不替他选。**两种写法的模型面相同**（[S-7](#s-7-多命令-input-的生成规则)：模型面不展示任何命令的参数 schema；PF-006 rev 19「模型面前只有紧凑的命令清单一种样子」）；带多少只改变判定有多严、`Tools().inspect` 与 `help` 答得多细。
  **只带命令清单的写法**：各命令的 `input` 写 `{"type": "object", "properties": {}, "additionalProperties": true}`（收任何一个对象作参数——[S-4](#s-4-单函数工具) 第 1 条要它顶层是对象，`additionalProperties: true` 按下一条必须显式写）：交上来的参数系统据以判的只有「是一个对象」，**对不对由工具自己判**；`Tools().inspect` 答得出的只有命令清单（作者带了 `help` 的，还有那段文本）（PF-006 §5.3 那张表第一行）。
  只写 `{"type": "object", "properties": {}}` 的命令是**不收任何参数键**的命令，不是「只带命令清单」。
- **判参数时，`input` 顶层没写 `additionalProperties` 就按 `false` 读**（主线裁定 2026-09-24，见[设计依据](#设计依据)那一行）：一次调用的参数按 `input` 判——单函数工具是它的 `input`（[S-4](#s-4-单函数工具)），多命令工具是所选命令的 `commands[c].input`（[S-7](#s-7-多命令-input-的生成规则) 第 3 条）——时，顶层 `properties` 以外的键**一律不收**；
  作者在 `input` 顶层**显式**写了 `"additionalProperties": true` 才收下这些键，写的是一份 schema 就按那份 schema 判。这是本契约对 `input` 的读法，**不是 Draft 2020-12 的原义**（原义下没写即收）；判由执行运行时做（`capability.tool-execution-runtime/v1` 的 S-11，失败种类 `arguments_invalid`）。
  依据：[研究 V-5](../../../../../research/tool-definition-shape-sources/evidence.md) 结论 ③——没有 `Tools().inspect` 时模型会臆造参数名（`openai/gpt-5.6-sol` 猜了 `ignore_case`），静默收下那个键，它就据错误的结果作答。
  这与上一条「对不对由工具自己判」不冲突：这一条就是判的规则，作者想自己判，就显式写 `true`。
  **模型面不因此改写**（同一裁定）：单函数工具的 `parameters` 仍是作者的 `input` 原样（[S-6](#s-6-模型面只有一个条目)），不自动补 `additionalProperties: false`；**模型面允许而运行时拒的键，会以用法文本告知**——那一次调用收场 `failed{arguments_invalid}`，块上写明哪个键不收，并带这个工具（命令）的一行说明与参数表（`capability.tool-execution-runtime/v1` 的 S-11）。
  **只管顶层**：`properties` 成员里的对象 schema、`items` 里的对象 schema 按原义读（本契约的推导：裁定说的是 `input`，参数表也只列顶层）。

### S-6 模型面只有一个条目

**不论哪种范式，一份工具定义在模型面恰是一个条目。**
依据：[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)「整套命令在组装时只占一个槽位——命令多了不会让 agent 面前的工具条目变多」；
[PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)「多命令范式把一族动作压进一个槽位」；以及 D-038 Q5（一份 schema、带 `command` 判别成员）。

**这个条目的形状由本契约定死**（[研究 V-1～V-4](../../../../../research/tool-definition-shape-sources/evidence.md)，产品负责人 2026-09-24 要求，[D-039 U-24-1](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#凭据档案工具拓展件卡片-pf-013-rev-10pf-002-rev-1819pf-006-rev-19pf-012-rev-12pf-007-rev-17pf-008-rev-7pf-016-rev-6)；形状见 [D-040「产品负责人追加要求」TD-1](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#产品负责人-2026-09-24-追加要求工具定义须能构造供应商工具-payload已取证已发对齐波)）：`ModelToolEntry = { name, description, parameters }`，三样都必有——

```text
entry(d)       ≝  { name: modelName(d), description: d.description, parameters: modelInput(d) }
modelInput(d)  ≝  d.input                          若 d.paradigm = single
               ≝  generateMultiInput(d.commands)   若 d.paradigm = multi（S-7）
modelName(d)   ≝  d.name 里每一个 ":" 换成 "__"     （S-18 保证它可逆）
```

- **纯函数**：只读定义本身，**不读**设置的求值结果、可用性、执行环境或持有。对同一份定义求值，得到的 JSON 值相等。
- **三家的线上形状只是键名与外壳不同**（研究 V-1～V-3）：

  | 线上形式 | 条目怎样落 |
  |---|---|
  | OpenAI Responses | `{ "type": "function", "name": …, "description": …, "parameters": … }`；`strict` 本契约不给（[G-12](#十已知缺口)） |
  | OpenAI Chat Completions ／ OpenRouter | `{ "type": "function", "function": { "name": …, "description": …, "parameters": … } }` |
  | Anthropic | `{ "name": …, "description": …, "input_schema": … }` |

  因此投影是**纯键名映射**：三样原样放进那一家的键里，**不改写 schema、不再改名字**（名字已是 `modelName`）。映射本身由传输适配做；
  **本契约承诺的是「不需要改写 schema 就能映射」**——参数 schema 满足 [S-4](#s-4-单函数工具) 的三条硬要求，名字满足 [S-18](#s-18-名字的表示与相等)；这一句写进[第七节](#七装配给与协议给)。逐字投影见 [`examples.md` 第 11 节](examples.md#11-一份定义投成三家的线上形状)。
- **模型面名字有自己的 `$def`：`ModelToolName`**（`ModelToolEntry.name` 引它）——字符集 `A`～`Z`、`a`～`z`、`0`～`9`、`_`、`-`，1～128 个字符。
  **系统里流转的工具指认用的都是模型面名字**（主线裁定，见 [D-040 §五 K10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）：发给模型的工具清单、模型交回的调用块里的 `tool`（`data.content-blocks` 的完整工具调用）、放行判断拿来比较的定义名、会话资产注册表里 `tool` 类条目的查找键与 `effectivePermissions` 每一项的键、工具执行运行时查注册表用的名字（`call.tool` 原样），都是 `modelName(d)`（主线裁定，见 [D-040 §七 M8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。消费者 `$ref` 本契约的 `ModelToolName`，**不另写一份字符集**；与本契约互引会成环的 data 契约（`data.content-blocks` 的调用块 `tool`）按 [registry「互引成环的登记口径」](../../../../registry/README.md#covers) 逐字同写、以本契约为家。
- **回来的调用按逆转写对回定义**：模型交回的调用名 `m`，所指的定义名是 `m` 里每一个 `"__"` 换回 `":"`——[S-18](#s-18-名字的表示与相等) 的名字限制使这一步**唯一**。
  **逆转写只在一处做：工具执行运行时起执行者之前**（`capability.tool-execution-runtime` v1；同一裁定）。模型请求运行时的传输适配**不做**逆转写，调用块原样带模型面名字进日志；
  在逆转写之前比较两个名字，一律比模型面名字（`modelName` 是单射，比模型面名字与比定义名结论相同）。对齐义务见[验证入口](../verification.md#对齐义务)。
- **[替换件](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-stand-in--替换件--stand-in)与原件同形**：
  `modelName` 与 `modelInput` 与原件相同，**只换 `description`**（[PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)）。
  本契约只定它的形状：**这一条目此刻是不是替换件、为什么是，由会话资产注册表判**（[`capability.asset-registry/v1` S-8](../../../capabilities/asset-registry/v1/contract.md#s-8-当下可用性的三个取值)、[S-10](../../../capabilities/asset-registry/v1/contract.md#s-10-替换件同形只换说明)）；**替换件怎么造归执行运行时**（主线裁定，见 [D-040 §六 L10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）。两处都是指路，不是本契约的依赖。

### S-7 多命令 input 的生成规则

**`generateMultiInput(commands)` 恰是下面这个对象**——**flat 形**：一个 `command` 枚举、一个不展示参数的 `args`
（产品负责人裁定 2026-09-24，[D-039 U-24-2](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#凭据档案工具拓展件卡片-pf-013-rev-10pf-002-rev-1819pf-006-rev-19pf-012-rev-12pf-007-rev-17pf-008-rev-7pf-016-rev-6)，产品正文 [PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡) rev 19：模型面前只有「选哪个命令」「交给它的参数」两格；D-038 Q5「一份 schema 带判别字段」的 flat 读法；对照 omne-next `multi_command.py` 默认 `dispatch_mode="flat"`，[研究 O-2](../../../../../research/tool-definition-shape-sources/evidence.md#o-2-多命令范式-basemulticommandtool)）：

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "enum": ["n_1", "…", "n_k"],
      "description": "n_1 — commands[n_1].description\n…\nn_k — commands[n_k].description"
    },
    "args": {
      "type": "object",
      "description": "所选命令的参数；各命令的参数用法经 Tools().inspect 取得"
    }
  },
  "required": ["command"],
  "additionalProperties": false
}
```

1. **成员恰此**：生成出的对象恰含 `type`（值 `"object"`）、`properties`、`required`（值 `["command"]`）、`additionalProperties`（值 `false`）四个成员，不多带 `$schema`、`$id`、`title`、`description`；
   `properties` 恰含 `command`、`args` 两个成员；`command` 恰含 `type`（值 `"string"`）、`enum`、`description` 三个成员；
   **`args` 恰含 `type`（值 `"object"`）与 `description` 两个成员，不带 `properties`**——不论作者在 `commands[n].input` 里写了多少，模型面都**不展示任何一个命令的参数 schema**。
   `args` 的 `description` 逐字是上面那一句。
2. **命令表**：`enum` 恰是 `commands` 的全部键，**只来自 `commands`**——不为 `help` 文本（[S-8](#s-8-说明与用法)）或任何别的东西多加一个值；
   次序是 Unicode 码点升序。`command` 的 `description` 是命令表：第 i 行恰是 `n_i`、一个空格、`—`（U+2014）、一个空格、`commands[n_i].description` 原样，
   行序与 `enum` 相同，行间以一个 U+000A 相连、末行之后不带换行。文案格式**定死**，是 `commands` 的纯函数；命令说明原样放进去，本契约不改写它。
   **次序是本契约的推导**（此次裁定沿用）：映射在多数语言里无序，不定次序，两个实现会对同一份定义生成两份不同的 schema，
   [第七节](#七装配给与协议给)的「任何节点算出同一个值」就不成立。
3. **判定仍以 `commands[c].input` 为准**：作者写的完整参数 schema 用于判一次调用的参数、用于 `Tools().inspect` 与作者写的 `help` 文本给出的用法，**不用于模型面**。
   `modelInput` 只管得到「`command` 是一个命令名、`args` 是一个对象、没有别的成员」，**不替任何命令判参数**。
   判时 `commands[c].input` 顶层没写 `additionalProperties` 按 `false` 读（[S-5](#s-5-多命令工具) 末条）。
4. **`args` 缺席等价于 `{}`**：`{"command": c}` 与 `{"command": c, "args": {}}` 是同一次调用，按 `commands[c].input` 判 `{}`。
5. **命令 `input` 里不许有根相对的 `$ref`（以 `#` 开头）与 `$id`**（主线裁定，见 [D-040 §S5 S5-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s5tool-definition报回的)），违反即 `malformed`（M24）。
   flat 形不再把命令 `input` 嵌进 `modelInput`，**判定时的嵌入问题仍在**：命令 `input` 存在一份更大的定义里，按它自己作根解析还是按所在文档解析，
   根相对的 `$ref` 与 `$id` 会给出两种结果——**禁止是唯一不需要约定解析基准的读法**。它是表示层校验在 Schema 之外的那一步（与「是否合法的 Draft 2020-12 schema」同一步）。
   **可呈现子集（[S-4](#s-4-单函数工具) 第 3 条）不收任何 `$ref` 与 `$id`**，所以这一条如今被 M27 覆盖、对单函数工具同样成立；M24 留着编号与表述，两条重叠不改变报出的值。

**为什么只要 flat 形**（产品负责人裁定的理由）：多命令范式存在的目的，是把一族动作压进一个槽位、保持上下文紧凑
（[PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)）。
omne-next 另有 `typed_union`（按每个命令的参数合成判别联合、模型一次看到全部参数），是受 LangChain Tool 的严格类型校验所迫（[研究 O-2](../../../../../research/tool-definition-shape-sources/evidence.md#o-2-多命令范式-basemulticommandtool)）；
本项目自己做判定（第 3 条），不需要在模型面展示全部参数。
实测见[研究 V-5](../../../../../research/tool-definition-shape-sources/evidence.md)（四家真实请求都接受 flat 形；有 `Tools().inspect` 时模型先查用法再调用，没有时会猜参数名）。

**由此得到**（逐字核对见 [`examples.md` 第 9 节](examples.md#9-生成规则的逐字核对)）：

- **过 `modelInput` 的调用**：`{"command": c, "args": a}` 或 `{"command": c}` 过 `modelInput`，恰当 `c` 是 `commands` 的一个键、`a`（若带）是一个对象、且不带别的成员。
  `a` 过不过 `commands[c].input`，`modelInput` 不知道——那是第 3 条的判定。
- **生成结果自动满足 [S-4](#s-4-单函数工具) 的三条硬要求**，与命令 `input` 写了什么无关：顶层 `"type": "object"` 带 `properties`（第 1 条）；
  `command` 与 `args` 各带非空说明（第 2 条——命令说明非空由 [S-8](#s-8-说明与用法) 保证，命令表因此非空；`args` 不带 `properties`，没有更深的参数）；
  只用到 `type` `properties` `required` `additionalProperties` `enum` `description` 六个关键字（第 3 条）。
- **作者带多少不改变模型面**：只带命令清单的写法（[S-5](#s-5-多命令工具)）与带全部命令完整参数的写法，生成出的模型面相同；
  差别只在第 3 条的判定有多严、`Tools().inspect` 与 `help` 答得多细。

**消费者的义务**：判一次调用的参数，**以所选命令自己的 `commands[c].input` 为准**（`args` 缺席按 `{}` 判）——定义才是权威，`modelInput` 只呈现命令表。

### S-8 说明与用法

- **`description` 必填、非空**：模型面那个条目的说明（多命令工具是整个工具的说明）。每个命令各自的 `description` 必填，说明那一个命令——它就是模型面前命令清单里的那一行（[S-7](#s-7-多命令-input-的生成规则) 第 2 条）。
  依据 [PF-006 §5.3「工具说明与每个参数的说明，必填」](../../../../product/PF-006-tools-and-skills/design.md#工具说明与每个参数的说明必填)（rev 19）；参数的说明见 [S-4](#s-4-单函数工具) 第 2 条。
- **`help` 可选**——工具一层一份，多命令工具的每个命令还可以各带一份——**不强制**。
- **带了，就必须与 [`Tools().inspect`](../../../../product/PF-007-meta-capabilities/design.md#61-tools通向任意非常驻工具) 对这个工具（这个命令）给出的用法一致**：
  同一个工具的用法有两处说法，对不上 agent 就分不出该信哪个——**两处不一致是缺陷，不是风格差异**（[PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)）。
  一致性**不是 Schema 管得到的东西**，是给出 `inspect` 答案的那一方的义务；证据义务见[验证入口](../verification.md#证据义务)。
- **不带 `help`，`inspect` 照样答得出**；本契约不因缺 `help` 而拒绝任何定义。
- **`help` 就是一个文本字段**：产品正文说的「help 命令空间」由 `Tools().inspect` 呈现这个字段，它不是一个模型可调的命令——生成规则不因它往 `enum` 里多加一个值（[S-7](#s-7-多命令-input-的生成规则) 第 2 条），作者要一个可调的 `help` 命令就在 `commands` 里声明它。

### S-9 四项依赖名

`needs` 可选；四个成员各自可选：

| 成员 | 形状 | 指什么 | 不声明 |
|---|---|---|---|
| `externalServices` | `DependencyName` 数组，不重复 | 这个工具要连上的**外部服务**——产品意义上的外部依赖，**不是 Cordis service** | 不依赖外部服务 |
| `attachmentStorage` | 一个 `DependencyName` | 这个工具把[附件](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment)放进的那个**存储**。**这一项算不算被满足，连同「装配里有一个能从这个存储读出东西的工具」一起判**（[PF-006 §6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)） | 不产出附件 |
| `inputModalities` | `Modality` 数组，不重复 | 调用它需要有效模型**给得出**的模态 | 只要文本 |
| `outputModalities` | `Modality` 数组，不重复 | 它的结果里**会有**的模态 | 只有文本 |

- **不声明＝不需要**：这是 [PF-006 六项可选声明](../../../../product/PF-006-tools-and-skills/design.md#六项可选声明)表里写明的缺省，**不是本契约的猜测**——
  这几项声明的是「我需要什么」，少一个前提反而更容易可用。空数组与不声明同义。
- `text` 出现在两个模态数组里合法而多余：文本那一端恒被满足。两端各是依赖声明里的一项，各自的候选提供者不同
  （[PF-006 §6.11](../../../../product/PF-006-tools-and-skills/design.md#611-工具两端各要什么模态)，见 [S-19](#s-19-由定义得出的依赖声明)）。
- **它们是[依赖](../../../../product/PF-006-tools-and-skills/design.md#依赖)声明里的名字，不是设置**：谁满足它，看谁生效在那个名字上，**不靠哪一层配**，各层也改不了它们
  （[PF-006 其中两项声明的是设置项](../../../../product/PF-006-tools-and-skills/design.md#其中两项声明的是设置项)表第三行）。
- 声明不是免费的：每多一项，就多一个可能不被满足的前提（PF-006 §5.3）；**该声明的是它真的要的**。

### S-10 设置项声明

**一项设置在定义里写成 `{ category, default }`**（`SettingDeclaration`）：

- `category`：[设置项类别](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)，取 [`data.asset-model/v1#S-13`](../../asset-model/v1/contract.md#s-13-设置项类别) 的 `SettingCategory` 四值（[PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)），本契约 `$ref` 它、不另立一份；
  四值之外即 `setting_category_unknown`。
- `default`：作者给的默认值。**默认值由定义给**（D-038 Q6；[PF-006 §6.6](../../../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)「定义给默认值，持有它的各层可以改」）。

**定义声明的是设置项的形状与默认值，不是它最终的值**（[PF-006 其中两项声明的是设置项](../../../../product/PF-006-tools-and-skills/design.md#其中两项声明的是设置项)）。持有这个工具的各层按
[三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值)配值、运行时求值——**两者都不在本契约**。

**本版恰四项**：`targetEnvironment`（[S-11](#s-11-目标环境)）、`backgroundThreshold`（[S-12](#s-12-后台许可与转后台阈值)）、`timeout`、`concurrency`（[S-13](#s-13-超时与并发)）。
`settings` 不收别的成员（工具自定义设置项见 [G-14](#十已知缺口)）。

**每一项的类别由本契约定死，不由作者选**：`targetEnvironment` 恒为 `placement_identity`，另三项恒为 `preference`。
作者标了四值里的另一个即 `malformed`（M10）。**理由**：类别决定这项值能从哪些层来——落点与身份类，[工作区](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace)那一级配不了；
容许作者把目标环境标成偏好，一个仓库就能在不触发任何确认的情况下改掉这次执行落在哪里。
**仍要在数据里写出 `category`**，是因为 [PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)要求资产声明每一项时标类别：
配值与过滤的一方据此按项读类别，不必另持一张「哪类资产的哪项是什么类别」的表。

**没声明的设置项不存在**：定义里没有某一项，这个工具就没有这一项设置，各层无从为它配值——
「有哪些设置项」是装了哪些资产的函数（[PF-002 §5.2 两个推论](../../../../product/PF-002-assets-settings-and-permissions/design.md#由此得到两个推论)之一）。**这一句是本契约的推导。**

**`SettingDeclaration` 是资产属性声明在工具定义里的写法，不是另一种声明**：项名由 `settings` 的键给、种类恒为设置、取值域由本契约按项定死，
所以作者只写 `category` 与 `default`；资产的属性声明（`data.asset-model` 的 `AttributeDeclaration`）由 [S-31](#s-31-属性项的推出规则) 的推出规则从它得出。

### S-11 目标环境

**`settings.targetEnvironment` 声明「这个工具需要什么样的[执行环境](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-execution-environment--执行环境--execution-environment)」**
（[PF-006 §6.8](../../../../product/PF-006-tools-and-skills/design.md#68-工具怎么提执行环境的要求)）。
它的值 `TargetEnvironment = { bindingLayer, facilities }`：**绑定在哪一层 × 要哪几种设施**。

- **`bindingLayer`（绑定层，无词条）取值恰四个**，取自 [PF-005 §5.1 四种执行环境](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境)：
  `host_machine`、`stateless_sandbox`、`session_sandbox`、`tenant_sandbox`（与词条的对应见[上表](#规格层的名字与词条)）；四值之外即 `binding_layer_unknown`。
- **`facilities`**：[环境设施](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-environment-facility--环境设施--environment-facility)名的数组，不重复，**可以为空**（对设施没有要求）。
  设施一共有哪几种，[PF-005 明确不定清单](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#设施)，
  因此 `Facility` 是非空的自由字符串（[S-18](#s-18-名字的表示与相等)），名字集合见 [G-2](#十已知缺口)。
- **类别恒为 `placement_identity`**：持有这个工具的组织、租户可以在自己那一层配值，**工作区配不了**。
- **默认值是工具作者的判断**：他最清楚这个工具的执行是不是绝对安全。
- **不声明**：这次执行对执行环境没有特殊要求（[PF-006 六项可选声明](../../../../product/PF-006-tools-and-skills/design.md#六项可选声明)表），且这个工具没有「目标环境」这一项设置（[S-10](#s-10-设置项声明)）。
- **求值出来的那一份就是这次执行的要求**；满足不了，这个工具就不可用、走替换件；**绝不退一步给它一个不满足要求的环境**
  （PF-006 §6.8、[PF-005 §6.9](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)）。
  匹配与判定归执行运行时；**「满足」是恰等还是「至少」、与执行环境权限三态怎么交互，未定，[G-5](#十已知缺口)**。

### S-12 后台许可与转后台阈值

- **`allowBackground`：布尔，作者的许可**——他的代码有没有准备好在后台那种时序下被使用，只有他知道。
  **不声明＝不允许**（[PF-006 §6.6](../../../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)「不声明就是不能后台」）。
  **它不是设置**：没有任何一层能改它；人可以决定「现在切」，不能决定「它能不能切」。
- **`settings.backgroundThreshold`：前台跑超过多久自动转后台**，`Duration`，类别恒为 `preference`。
- **阈值不授予许可**：`allowBackground` 不为 `true` 的工具，**不论哪个触发源都不转后台**——
  三个触发源（阈值或前台上限到了、用户手动切、插队顺带）**都不绕开这条声明**，「发起时就在后台」同样不绕开（PF-006 §6.6）。
- **所以声明了阈值，就必须同时声明 `allowBackground: true`**；否则即 `malformed`（M15）。
  **理由**：没有许可的阈值永远用不上，声明一个永远用不上的值只会误导读定义与配值的人。
- `allowBackground` 为 `true` 而没声明阈值：这个工具**没有**「转后台阈值」这一项（[S-10](#s-10-设置项声明)），**不会因时长自动转后台**；
  手动切与插队顺带触发照常——前提都是这条许可。**这一句是本契约的推导。**

### S-13 超时与并发

- `settings.timeout`：`Duration`，类别恒为 `preference`。
- `settings.concurrency`：正整数（≥ 1），类别恒为 `preference`。
- 依据：[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)「设置：超时、并发、目标环境等」，
  以及 [PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)把「超时」「并发」列在偏好那一行的例子里；
  [PF-006 §6.6「前台上限与并发上限」](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限)：`timeout` 就是产品正文的**前台上限**，`concurrency` 就是**并发上限**，都是偏好类、定义给默认值、各层配值，**不设就没有这一项限制**。
- **本契约只定形状、类别与默认值的位置。**两项的语义——前台上限只数在前台跑的时间、到点许后台的转后台、不许的被中断；并发上限按同一会话同一工具计、超出的排队——
  是产品正文 PF-006 §6.6 那一小节给的，由执行运行时兑现（`capability.tool-execution-runtime/v1#S-43`、`#S-44`；原 [G-6](#十已知缺口) 关闭）。**零值**对前台上限意味着什么，由执行运行时那一条写（它的 S-44）。
- 不声明：这个工具没有这一项设置（[S-10](#s-10-设置项声明)）。运行时是否另有别的限制不在本契约。

### S-14 时长的表示

**`Duration` 是 ISO 8601 时长字符串，只用 `PT` 之后的时、分、秒三段**：`nH`、`nM`、`nS`，按此次序、至少一段，秒可带小数；非负；
**不给数值上限**——本契约不出现任何时长数值。例：`PT30S`、`PT1H30M`、`PT0.5S`。

- **不收年、月、周、日**：它们是日历单位，长度取决于从哪一天算起，两个实现会对 `P1M` 算出两个时长。两天写 `PT48H`。**这一条是本契约的推导。**
- **不收负号。**`PT0S` 合法；它对某一项设置意味着什么归那一项（[S-12](#s-12-后台许可与转后台阈值)、[S-13](#s-13-超时与并发)）。
- **相等按时长值比较，不按字面**：`PT60S` 与 `PT1M` 是同一个时长。

### S-15 执行权限

**`permissions.execute = { default }`，必填，没有缺省。**`default` 恰三档
（[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool) 执行权限「问一下 / 自动 / 禁止」）：

| token | 产品正文 |
|---|---|
| `forbid` | 禁止 |
| `auto` | 自动 |
| `ask` | 问一下 |

- 它是**执行权限这一项[权限](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-permission--权限--permission)的默认值**：
  各层按收窄合成；**合成结果三档各落在放行四步里的哪一处，归 [PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)，本契约只引**。
- **缺席即拒**：不带执行权限默认值的定义即 `malformed`（M3）；三档之外即 `permission_unknown`。
  **不得补成任何一档**——补成 `auto` 等于放行，补成 `forbid` 或 `ask` 等于替作者做了一次他没做的判断。
- `permissions` 本版只有 `execute` 一个成员（PF-002 §4 Tool 的权限行）；别的权限项见 [G-14](#十已知缺口)。
- **MCP 来源**：一个动作的执行权限就是那个条目的执行权限，配在接入点那份持有上（PF-006 §6.13、PF-002 §4 MCP）；
  桥生成定义时这个默认值取接入点正文的 `permissions.execute.default`（`capability.mcp-bridge/v1#S-17`；原 [G-8](#十已知缺口)）。

### S-16 组合

- **`composes.skills`**：技能名的数组，不重复，可选。意思是「光有我不够用，得配这份指引」（[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)）。
- 每一项是一个[技能](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill)的 name，
  **指向能力标识（类别 `skill` ＋ 这个 name），不指向某一份具体的技能资产**（[PF-002 §6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)）。
- **组合不是依赖**：`composes` 不进依赖声明、不参与可用性（[S-19](#s-19-由定义得出的依赖声明)）。
  它在装配时带来什么、组合图不得成环怎样检查（[PF-002 谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)），**归装配**。
- **MCP 来源的定义不得带 `composes`**：那些动作不是资产，不参与任何组合（同一张表的 MCP 行）；带了即 `malformed`（M14）。

### S-17 来源

**`origin` 必填，判别成员 `kind`，恰两种**：

- **`authored`**：作者写的定义（含随资产包一起来的）。
- **`mcp`**：由某个 [MCP](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) 接入点的列举结果生成——**对端的每一个动作一份定义**
  （[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)、[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)、[D-037](../../../../record/decisions/mcp-client-adoption/README.md)）。
  带 `endpoint`（那个接入点的能力标识，**类别必须是 `mcp`**，否则 `malformed`（M9））与 `remoteName`（那个动作在对端的名字）。

**MCP 来源的定义另有三条**：

1. **恒为单函数**：一个动作是一个条目、一份参数，不把接入点压成一个多命令工具（PF-006 §6.13）；是 `multi` 即 `malformed`（M14）。
2. **不是资产、没有能力标识**（[S-2](#s-2-身份是-name)），**不组合**（[S-16](#s-16-组合)）。
3. **`remoteName` 原样保留对端给的名字**，不被改写；`(endpoint, remoteName)` 指认对端那个动作。

`name` 怎样从 `(endpoint, remoteName)` 得出、六项声明与执行权限默认值怎么取，由 `capability.mcp-bridge` v1 S-17（`projectActions`）给出（原 G-8）；
两端模态怎样判见 [S-24](#s-24-结果与声明对得上)。未知的 `kind` 即 `tool_origin_unknown`。

**MCP 来源定义的 `description` 与 `input` 是桥投影的结果，不一定是对端原话**：对端缺说明、带 `$schema`／`title`、只写 `{"type": "object"}` 的，桥先做最小规范化再交出定义（`capability.mcp-bridge/v1#S-17`；缺说明补占位的依据见[设计依据](#设计依据)）。
**规范化只在桥里**：交到本契约的定义照常过表示层校验，本契约不因来源是 `mcp` 放宽任何一条（[S-4](#s-4-单函数工具) 的三条硬要求、[S-26](#s-26-表示层拒绝值与判定次序)）。

**`origin` 的形状在 Schema 里叫 `ToolSource`**（本契约的命名选择）：`data.asset-model` 的 `AssetOrigin`（`official`／`customized`）说的是资产记录的出处，与这里「定义由谁写、还是由 MCP 列举生成」是两件事，不共用一个名字；成员名 `origin` 不变。

### S-18 名字的表示与相等

适用于：`name`、命令名、`DependencyName`、`Facility`、`remoteName`、`composes.skills` 的每一项。

- **交换表示是非空字符串。**
- **相等是逐码点精确相等**：不做 Unicode 规范化、不折叠大小写、不裁剪空白。**理由**：依赖名要按「谁生效在那个名字上」匹配（[PF-006 §4 依赖](../../../../product/PF-006-tools-and-skills/design.md#依赖)），
  能力标识要按 name 判断替代——两个实现各带一套隐式等价，就会一个判满足、一个判不满足。**这一条是本契约的推导。**
- **不解析**：消费者不得从这些名字里读出结构（前缀、分隔符、来源）——来源在 `origin`，不在名字里。**`modelName` 的转写与逆转写不是解析**：它按字符整体换，不拆出任何成分（[S-6](#s-6-模型面只有一个条目)）。
- **`name` 的字符集与长度定死**（[研究 V-1～V-4](../../../../../research/tool-definition-shape-sources/evidence.md)，产品负责人 2026-09-24 要求，[D-040 TD-2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#产品负责人-2026-09-24-追加要求工具定义须能构造供应商工具-payload已取证已发对齐波)；[G-1](#十已知缺口) 收窄到其余几种名字）——两种来源的 `name` 都要满足：
  1. **只含 `A`～`Z`、`a`～`z`、`0`～`9`、`_`、`:`、`-`**；
  2. **不含 `__`、`_:`、`:_` 三种相邻**——违反 ⇒ `name_reserved_sequence`；
  3. **转写之后不超过 128 个字符**：`name` 的码点数加上其中 `:` 的个数 ≤ 128。

  违反第 1、3 条 ⇒ `malformed`（M25）。三条的 Schema 那一面是 `$defs/ToolName`（第 3 条里 `:` 多算的那一半在 Schema 之外）；`data.mcp-endpoint` 的动作条目名 `$ref` 它，不另写一份。**理由**：Anthropic 的工具名必须合 `^[a-zA-Z0-9_-]{1,128}$`（研究 V-2），而本项目的 `name` 允许 `:`——MCP 条目名「接入点:动作」（`data.mcp-endpoint/v1#S-11`）、斜杠命令的保留前缀 `omne-official:`。
  `modelName` 把 `:` 换成 `__`，恰落进那个字符集与长度；**第 2 条使逆转写唯一**：转写后每一段连续的 `_`，长 1 就是原来的 `_`，长 2m 就是原来 m 个 `:`，奇数长 ≥ 3 不会出现。
  **只禁 `__` 不够**：`a_:b` 与 `a:_b` 都转写成 `a___b`，回来的调用对不回唯一一份定义——第 2 条多禁的两种相邻就是为这个（规格层推导，已报主线）。
  这一条是 `data.asset-model/v1#S-2` 之内的收窄（那里允许「正文契约再收窄，不得放宽」）；MCP 条目名拼出来不合它的，就是拼不出（`capability.mcp-bridge` v1 S-17）。
- **其余几种名字**（命令名、依赖名、设施名、`remoteName`、技能名）的字符集与长度仍未定（[G-1](#十已知缺口)）；Schema 只要求非空。命令名不作为名字送进供应商请求——它是生成出的 schema 里 `enum` 的一个值与命令表的一行（[S-7](#s-7-多命令-input-的生成规则)）。

### S-19 由定义得出的依赖声明

**一个工具的[依赖声明](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)——「我要成立，必须在场的东西」那一串名字——由定义里的这几处合起来：**

| 来自哪 | 进声明的是 |
|---|---|
| `needs.externalServices` | 每个外部服务名一项 |
| `needs.attachmentStorage` | 那个存储一项，**连同「有工具读得出它」一起判** |
| `needs.inputModalities` / `needs.outputModalities` | 有效模型相应模态能力各一项——**调用端只有有效模型满足得了，结果端有效模型的输入能力或模态转换件都满足得了**（[PF-006 §6.11](../../../../product/PF-006-tools-and-skills/design.md#两端的差别在候选提供者不在规则)） |
| `settings.targetEnvironment` **求值后**的那一份 | 那个绑定层 × 那几种设施（[PF-006 §6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)、§6.8） |

- **只有且，只有必需**：一串名字全部都要在场，没有「或」，也没有「可选」（[PF-006 §4](../../../../product/PF-006-tools-and-skills/design.md#只有且只有必需)）；**没有「部分可用」**。
- **目标环境那一项用的是求值后的值，不是定义里的默认值**——各层配值会改它（[S-11](#s-11-目标环境)）。
- `composes` **不进**依赖声明（[S-16](#s-16-组合)）。
- **解析**（谁在场、谁可用、什么时候重算）**归执行运行时与装配**，不在本契约。
- **声明与实际必须对得上**（PF-006 §6.4）：声明只要 A、实际去用了 B，可用性算对了、跑起来是错的。这是作者的义务；
  返回值那一侧能对上的两处写在 [S-24](#s-24-结果与声明对得上)。

### S-31 属性项的推出规则

**`data.asset-model/v1#S-12` 要每一份正文契约给出一条推出规则 `声明(正文) → AttributeDeclaration[]`。作者写的工具定义的这一条是**（主线裁定，见 [D-040 §块 A A3](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-a-形状shapes-draft-assets-v0md-a1a10)）：

| `item` | `kind` | `category` | `domain` | `default` | 什么时候有这一条 |
|---|---|---|---|---|---|
| `targetEnvironment` | `setting` | `placement_identity` | `{ kind: "open", schema: { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v1/tool-definition.schema.json#/$defs/TargetEnvironment" } }` | `settings.targetEnvironment.default` | 声明了这一项 |
| `backgroundThreshold` | `setting` | `preference` | `{ kind: "open", schema: { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v1/tool-definition.schema.json#/$defs/Duration" } }` | `settings.backgroundThreshold.default` | 声明了这一项 |
| `timeout` | `setting` | `preference` | 同上 | `settings.timeout.default` | 声明了这一项 |
| `concurrency` | `setting` | `preference` | `{ kind: "open", schema: { "type": "integer", "minimum": 1 } }` | `settings.concurrency.default` | 声明了这一项 |
| `execute` | `permission` | —（权限项不带类别） | `{ kind: "enum", values: ["forbid", "auto", "ask"] }` | `permissions.execute.default` | 恒有 |

它满足 `data.asset-model/v1#S-12` 的四项要求：

1. **确定**：只读定义本身，同一份定义永远推出同一组声明；
2. **`item` 互不相同**：五个项名是定死的，`settings` 闭合（[S-10](#s-10-设置项声明)）；
3. **不产出 `disabled` 与 `usableBy`、不产出治理类的项**：两个保留项名由 `data.asset-model` 为每一类统一加上（[S-15](../../asset-model/v1/contract.md#s-15-disabled-是保留项名)、[S-36](../../asset-model/v1/contract.md#s-36-usableby-是保留项名)），表里没有它们；`settings` 里没有治理类可写，类别由本契约按项定死（M10）；
4. **每一条都合 `AttributeDeclaration` 的形状**：`category` 就是定义里写的那个（它必须等于表里那一个），`default` 合取值域由表示层校验兑现（M11、M12、`binding_layer_unknown`）。

- **只对作者写的定义推**：MCP 来源的定义不是资产（[S-2](#s-2-身份是-name)），它的执行权限是接入点那份持有上的逐动作项（`data.mcp-endpoint` 的 `execute:<对端动作名>`）。
- **`SettingDeclaration` 与 `AttributeDeclaration` 的对应就是这张表**：前者是后者在工具定义里的写法，项名与种类由位置给出、取值域由本契约定死；**不是第二种声明**。
  表里 `schema` 的写法恰如所列——本契约 Schema 里对应 `$defs` 的引用；那几个 `$defs` 改了，这里跟着改。

## 四、返回值

### S-20 两种写法与等价规则

**工具函数的返回值 `ToolReturn` 恰两种写法：一个字符串，或一个 `ToolResult`**（[PF-006 §5.4](../../../../product/PF-006-tools-and-skills/design.md#54-返回值两种写法一种模型)）。

**裸字符串等价于一个只含一个文本块的 `ToolResult`：**

```text
s  ≡  { content: [ { kind: "text", text: s, id: <运行时给>, visibility: { toHuman: true, toModel: true } } ] }
```

没有 `offload`，没有 `attachments`。

- **这条等价由接收返回值的运行时兑现**，在上报时（[PF-006「普通返回在上报的时候会被转成 ToolResult」](../../../../product/PF-006-tools-and-skills/design.md#两种写法到-agent-loop-那里只剩一种)）；此后系统只见 `ToolResult` 一种形状。
- 那个文本块的 `id` 由运行时按 `data.content-blocks` 定的唯一范围给出。**两个标注取「两边都给」是本契约的推导**：
  [PF-009 七种消息各自谁感知得到](../../../../product/PF-009-context-message-types/design.md#七种消息各自谁感知得到)的表里，工具的结果两边都感知得到；
  一个作者没法再表达更多的写法，不该落成比常态更窄的可见性。
- **字符串永远只是一段文本**：运行时不解析它，不把一个看起来像 JSON 的字符串当成 `ToolResult`。
  两种写法能力不对等是有意的——只有 `ToolResult` 能带卸载与附件（PF-006 §5.4）。

### S-21 ToolResult 的三样

| 成员 | 必填 | 是什么 |
|---|---|---|
| `content` | **是**（可为空数组） | **进消息的内容**：已经组织好的、给 agent 看的那部分；`data.content-blocks` 的 `ContentBlock` 数组 |
| `offload` | 否 | 这次要卸载的原始结果（[S-23](#s-23-卸载)） |
| `attachments` | 否 | [附件](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment)的地址，`AttachmentRef` 数组——附件本身已存进某个存储，agent 按址自己去取 |

- **空的 `content` 是合法的「这次没给出内容」**；它与「结果被卸载了」**必须分得开**（[PF-006 §6.10](../../../../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)）——
  被卸载的结果在消息里有一条占位（[S-23](#s-23-卸载)），空内容没有。
- `content` 与 `offload.summary` 里的块**遵守 `data.content-blocks` 对块的全部约束**（两个标注、模态与媒体类型、半截调用……），本契约不复述。
- 这些块的 `id` 由谁保证在最终那条消息内唯一，**未定，[G-10](#十已知缺口)**。

### S-22 结果内容里没有工具调用

**`content` 与 `offload.summary` 里不得有 `kind = "tool_call"` 的块**——完整的与半截的都算；有即 `result_call_in_content`。

**理由**：这两处的块会原样进工具结果块的 `blocks`，而 `data.content-blocks` 规定工具结果块里不得含工具调用块（其拒绝值 `call_in_result`）——
**结果里不发起调用**。本条把同一条规矩前移到工具交回返回值的那一刻，**拒在包成消息之前**，不让它走到那一层才被拒。

### S-23 卸载

**给出 `offload`，就是这次执行的作者声明要卸载**（[PF-006 §5.4](../../../../product/PF-006-tools-and-skills/design.md#54-返回值两种写法一种模型)、
[§6.10 第一条来路](../../../../product/PF-006-tools-and-skills/design.md#两条来路产物不同)；[结果卸载](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading)）。

| 成员 | 必填 | 是什么 |
|---|---|---|
| `raw` | **是** | [被卸载的原始结果](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-offloaded-result--被卸载的原始结果--offloaded-result)：**引用**（`AttachmentRef`，已经存进某个存储）或**内联**（`{ inline: <base64>, mediaType }`） |
| `summary` | 否；**给了就非空** | **工具作者自己写的摘要** |

- **内联形式必带媒体类型**：运行时要存它、agent 要分页取回它，都不该猜它是什么。**这一条是本契约的推导。**
- **进消息的是什么**：`content` 照常进消息；**`raw` 不进消息**——在它的位置上是一条**占位**，占位里是 `summary` 加上「原始结果有多大、怎么取回全文」
  （[PF-006 §4 卸载](../../../../product/PF-006-tools-and-skills/design.md#卸载)：卸载不是全卸载）。
  **`raw` 从来不进会话日志**（[PF-012 §5.10](../../../../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)，只引）。
- **`summary` 缺省时，占位由运行时给**（D-038 Q7）：**必须说明原始结果的大小（字节数）与取回途径；文案归实现**。
  运行时给的占位**不得是系统写的摘要**——系统不替工具作者写摘要（PF-006 §6.10）。
- `content` 与占位在消息里怎么排、[PF-006 §6.10](../../../../product/PF-006-tools-and-skills/design.md#两条来路产物不同)「他自己构建的摘要，也就是那条进消息的内容」这句与本版两个成员（`content`、`summary`）怎么对应，
  以及原始结果的大小取不到时占位怎么说——**未定，[G-11](#十已知缺口)**。
- **第二条来路**（系统兜底：单条超限时首尾保留的机械截断）**不经过 `ToolResult`**，归 agent-loop（PF-012 §5.10），本契约不定它。
- 卸载与前台/后台、等待态互不相干（PF-006 §6.10）；`ToolResult` 里没有任何成员表达后两者。

### S-24 结果与声明对得上

返回值一侧能对得上声明的有两处。**检查是接收返回值的运行时的义务；Schema 管不到——它看不到定义。**

1. **带 `attachments` 的结果，只能出自声明了 `needs.attachmentStorage` 的工具**（「不声明＝不产出附件」，[S-9](#s-9-四项依赖名)）；
   附件实际存在它声明的那个存储里（[领域对象：附件](../../../../domain_objects/objects.md#ul-attachment--附件)的宿主一行）。
   「存储」本身尚无定义，`AttachmentRef.storage` 与 `DependencyName` 怎么对应——[G-13](#十已知缺口)。
2. **`content`、`offload.summary` 里每一块、以及带媒体类型的 `raw`**，按 `data.content-blocks` 的「块的模态由媒体类型决定」得出的模态，
   **除文本外都必须在 `needs.outputModalities` 里**（「不声明＝只有文本」）；**没有模态的文件**（只是一个引用）不受此限。

3. **`origin.kind = mcp` 的定义不按结果端模态判**（主线裁定，见 [D-040 §五 K11](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)；与 `capability.mcp-bridge/v1#S-17` 一致）：对这样的定义，第 2 条不判违反，**不论它的 `needs.outputModalities` 写了什么、缺没缺席**。
   判据只看 `origin.kind`，数据层可判；理由：对端动作的结果能带什么模态，列举结果里通常没有可靠的声明，桥投不出时按「不声明＝只有文本」判会把每一个带图的 MCP 结果都判成「违反声明」。
   第 1 条对它照常成立（MCP 来源的定义不带 `needs.attachmentStorage`，结果就不得带 `attachments`）。

对不上是**违反声明**；这次执行因此落什么收场（或上交），**归执行运行时，[G-15](#十已知缺口)**。

### S-25 ToolResult 不是收场

**`ToolReturn` 是工具函数交回来的东西，不是一次执行的收场。**一次执行的收场是六种之一
（`data.content-blocks` 的 `ExecutionOutcome`，[UL-execution-outcome](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)），由运行时判定并带在工具结果块上。

- `ToolResult` 里**没有**收场、原因、耗时、落点、账——那些是运行时的事实；每一次执行的账归 `data.call-accounts` 与执行运行时（只引）。
- **工具作者怎样以一个正常返回表达「这次真的没成」（失败），本版没有落点——[G-9](#十已知缺口)**。
  在它裁决之前，消费者**不得**把某种内容的样子解读成失败（例如文本里写了 error），也**不得**自造一个成员。

## 五、表示与边界校验

- **规范表示**：[`tool-definition.schema.json`](tool-definition.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v1/tool-definition.schema.json`
- **定义项（21 项）**：`ToolDefinition`（按 `paradigm` 判别的 `oneOf`）、`SingleFunctionTool`、`MultiCommandTool`、`CommandDefinition`、`ToolName`、`ModelToolName`、`ModelToolEntry`、
  `ToolNeeds`、`ToolSettings`、`SettingDeclaration`、`TargetEnvironment`、`BindingLayer`、`Facility`、`Duration`、
  `ExecutePermission`、`ToolSource`、`DependencyName`、`ToolReturn`、`ToolResult`、`Offload`、`JsonSchema`。消费者 `$ref` 这些定义，**不复制一份同义类型**。
- **跨契约引用**：块、附件引用、能力标识、模态、媒体类型、内联字节 `$ref` 到 `data.content-blocks` v1 的 Schema；设置项类别 `$ref` 到 `data.asset-model` v1 的 `SettingCategory`。
  `JsonSchema` **不引用官方元 schema**：它只要求是一个顶层 `"type": "object"`、带对象 `properties` 的 JSON 对象；是否合法的 Draft 2020-12 schema、每个参数带说明、只用可呈现子集，由实现校验（[S-4](#s-4-单函数工具)）。
- **根模式不约束任何文档**：本文件是共享定义的登记处。
- **正反实例**：[`examples.md`](examples.md)，本版的规范工件。

### S-26 表示层拒绝值与判定次序

**表示层拒绝值是一个闭合集合，恰十二个，没有「其他」**：`malformed`、`paradigm_unknown`、`commands_missing`、`commands_forbidden`、`input_not_schema`、`parameter_description_missing`、
`binding_layer_unknown`、`setting_category_unknown`、`permission_unknown`、`tool_origin_unknown`、`name_reserved_sequence`、`result_call_in_content`（后两个新名 2026-09-24 加入：[研究 V-1～V-4](../../../../../research/tool-definition-shape-sources/evidence.md)，产品负责人 2026-09-24 要求）。

**`setting_category_unknown` 与 `tool_origin_unknown` 不与 `data.asset-model` 的值撞名**（主线裁定，见 [D-040 §五 K6](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）：
那边的 `category_unknown` 指资产类别、`origin_unknown` 指资产记录的来源（`AssetOrigin`），且[「同名的值同义」](../../asset-model/v1/contract.md#s-27-表示层拒绝值)；这里说的是设置项类别与工具定义的来源，是另两件事。
**「设置项类别不在四值里」在 `data.skill-package` 报同一个 `setting_category_unknown`**——同一错误从工具与技能两侧进来，报同一个值。

**一份输入命中多行时，报下表中最靠前的那一行**——两个实现对同一份坏输入必须给出同一个值。
**`malformed` 的来由逐条编为 `M1`～`M27`，这份清单就是它的全部来由**：一份输入不合 Schema、却对不上下表任何一行，是本契约的缺陷，不是第十三个值。
同属 `malformed` 的几条可以重叠，重叠不改变报出的值。

**表示层校验 = Schema 校验 ＋ Schema 之外的一步**：参数 schema 是否合法的 Draft 2020-12 schema、每个参数带说明、只用可呈现子集（[S-4](#s-4-单函数工具)），命令 `input` 里没有根相对 `$ref` 与 `$id`（M24），`name` 转写之后的长度（[S-18](#s-18-名字的表示与相等) 第 3 条）。
只跑 Schema 的实现会放过 `{"type": "object", "properties": {"q": {"type": "string"}}}` 这样少了参数说明的 schema。

**定义**（`$defs/ToolDefinition`）：

| 次序 | 拒绝值 | 条件 |
|---|---|---|
| 1 | `malformed` | **M1** 文档不是 JSON 对象；**M2** 缺 `paradigm` |
| 2 | `paradigm_unknown` | `paradigm` 在，但不是 `single`、`multi` 之一（含不是字符串） |
| 3 | `commands_forbidden` | `single` 带了 `commands` |
| 4 | `commands_missing` | `multi` 没带 `commands`，或带了空对象 |
| 5 | `input_not_schema` | `single` 的 `input` 或任一命令的 `input` 在，但不是 JSON 对象（布尔 schema 在此），或是对象却不合 Draft 2020-12（Schema 之外那一步） |
| 6 | `parameter_description_missing` | 参数 schema（`single` 的 `input` 或任一命令的 `input`）合 Draft 2020-12，但它某一处 `properties` 的某个成员没带 `description`，或 `description` 是空串（[S-4](#s-4-单函数工具) 第 2 条；Schema 之外那一步） |
| 7 | `binding_layer_unknown` | 目标环境默认值的 `bindingLayer` 在，但不在四值里 |
| 8 | `setting_category_unknown` | 某一项设置的 `category` 在，但不在四值里 |
| 9 | `permission_unknown` | `permissions.execute.default` 在，但不在三档里 |
| 10 | `tool_origin_unknown` | `origin.kind` 在，但不在两值里 |
| 11 | `name_reserved_sequence` | `name` 是非空字符串，却含 `__`、`_:` 或 `:_`（[S-18](#s-18-名字的表示与相等) 第 2 条） |
| 12 | `malformed` | 下列任一：**M3** 缺其余必填成员——`name`、`description`、`permissions`、`permissions.execute`、`permissions.execute.default`、`origin`、`origin.kind`、MCP 来源的 `endpoint` 或 `remoteName`、`single` 的 `input`、命令的 `description` 或 `input`、设置项的 `category` 或 `default`、目标环境默认值的 `bindingLayer` 或 `facilities`；**M4** 出现未登记的成员（M13 那一种除外）——定义本身、命令定义、`needs`、`settings`、设置项声明、目标环境默认值、`permissions`、`permissions.execute`、`composes`、`origin` 任一处；作者写的来源带了 `endpoint` 或 `remoteName`、声明等待态、发帧、卸载或实现的成员（[S-29](#s-29-不在定义里的三样)、[S-30](#s-30-实现不在定义里)）都在此；**M5** 成员或数组元素的 JSON 类型不对，含 `null`（`paradigm`、`input`、`bindingLayer`、`category`、`permissions.execute.default`、`origin.kind` 六处除外，它们归第 2、5、7～10 行）；**M6** 空串——`name`、`description`、`help`、命令名、命令的 `description` 与 `help`、依赖名、设施名、技能名、`remoteName`；**M7** `externalServices`、两组模态、`facilities`、`composes.skills` 有重复元素；**M8** 两组模态里有不是 `Modality` 的值（取值集归 `data.content-blocks`）；**M9** `origin.endpoint` 不是合法的能力标识，或它的类别不是 `mcp`（[S-17](#s-17-来源)）；**M10** 某项设置的 `category` 在四值之内，却不是该项定死的那一个（[S-10](#s-10-设置项声明)）；**M11** `backgroundThreshold` 或 `timeout` 的默认值不是合 [S-14](#s-14-时长的表示) 写法的字符串；**M12** `concurrency` 的默认值不是 ≥ 1 的整数（[S-13](#s-13-超时与并发)）；**M13** `multi` 带了 `input`（[S-5](#s-5-多命令工具)）；**M14** MCP 来源的定义是 `multi`（[S-17](#s-17-来源)），或带了 `composes`（[S-16](#s-16-组合)）；**M15** 声明了 `settings.backgroundThreshold`，`allowBackground` 却不为 `true`（[S-12](#s-12-后台许可与转后台阈值)）；**M24** 某个命令的 `input` 里（任意深处）有以 `#` 开头的 `$ref`，或有 `$id`（[S-7](#s-7-多命令-input-的生成规则)；Schema 之外那一步）；**M25** `name` 含 `A`～`Z`、`a`～`z`、`0`～`9`、`_`、`:`、`-` 以外的字符，或转写之后超过 128 个字符（[S-18](#s-18-名字的表示与相等) 第 1、3 条；`:` 算两个的那一半在 Schema 之外）；**M26** 参数 schema 的顶层不是 `"type": "object"`，或不带 `properties`，或 `properties` 不是对象（[S-4](#s-4-单函数工具) 第 1 条）；**M27** 参数 schema 在某个 schema 位置上用了可呈现子集以外的关键字（[S-4](#s-4-单函数工具) 第 3 条；Schema 之外那一步） |

**返回值**（`$defs/ToolReturn`）：

| 次序 | 拒绝值 | 条件 |
|---|---|---|
| 1 | `malformed` | **M16** 既不是字符串也不是 JSON 对象（含 `null`） |
| 2 | **`data.content-blocks` 的拒绝值** | `content` 或 `offload.summary` 里某一项**本身**不合那份契约对块的约束——块的权威在那里，按它的次序报；这一行的值不在本契约的十二个之内 |
| 3 | `result_call_in_content` | 块合法，但是工具调用块（完整或半截，[S-22](#s-22-结果内容里没有工具调用)） |
| 4 | `malformed` | 下列任一：**M17** 缺必填成员——`content`、`offload.raw`、内联 `raw` 的 `inline` 或 `mediaType`；**M18** `ToolResult`、`offload`、内联 `raw` 上出现未登记的成员（收场、原因、耗时、账都在此，[S-25](#s-25-toolresult-不是收场)）；**M19** `content`、`offload.summary`、`attachments` 不是数组，或 `offload` 不是对象；**M20** `offload.summary` 是空数组（[S-23](#s-23-卸载)）；**M21** `offload.raw` 既不合 `AttachmentRef`、也不合内联形式；**M22** 内联的 `inline` 是空串或不是 base64 字母表，或 `mediaType` 不合 `MediaType`（[S-23](#s-23-卸载)）；**M23** `attachments` 的某一项不合 `AttachmentRef` |

同一行里的多处（例如两个命令的 `input` 都不合法）报同一个值、报一次。**这些值在哪一个操作的失败集合里出现，归调用那个操作的消费者自己的契约**。

### S-27 表示层拒绝不是判定

**被表示层拒绝的定义，不是「这个工具不存在」，不是「不可用」，也不是「禁止执行」。**它不得被折成其中任何一种：

| 折成 | 为什么不行 |
|---|---|
| 可用性判定的「不可用」 | 会给一个**形状本身不合法**的东西造替换件——而替换件要与原件同形（[PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)），没有合法的「原件形状」可同 |
| 「没有这个工具」、从动作空间里静默略过 | 把「形状坏了」塌进「不可见」，正是 PF-006 §6.3 那条界线要挡的事：不可见的东西，连原因都查不出 |
| 执行权限的 `forbid` | 把一个作者错误变成一次权限判定 |

**被表示层拒绝的 `ToolReturn` 同理：它不是六种收场里的任何一种。**两种情形各自怎么收场，**归消费者，[G-15](#十已知缺口)**；本条只挡折叠。

**反过来：表示合法不表示任何资格或可用**——Schema 通过只说明形状合规。

### S-28 判别式与枚举闭合

`paradigm`、`bindingLayer`、`category`、`permissions.execute.default`、`origin.kind` 各是一个**闭合枚举**。
遇到未知取值**一律作非法输入拒绝**：**不得**映射到「最接近」的已知值、**不得**当作缺省、**不得**忽略该成员继续。

| 枚举 | 静默降级会变成什么 |
|---|---|
| `permissions.execute.default` | 一个未知档位被当成 `auto`——放行 |
| `category` | 一个落点类的项被当成偏好——工作区配得到它 |
| `bindingLayer` | 一个要求隔离的工具被「最接近」地放进一个更弱的环境——[降级满足](../../../../product/PF-006-tools-and-skills/design.md#68-工具怎么提执行环境的要求) |
| `origin.kind` | 一份外来生成的定义冒充作者写的——拿到它本不该有的能力标识 |
| `paradigm` | 模型面 input 按错的范式算出来 |

`Modality` 的闭合归 `data.content-blocks`。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 表达不了的那部分归谁 |
|---|---|---|
| [S-2](#s-2-身份是-name) 身份是 name | 管 `name` 非空、字符集、三种相邻与 128 的上界（[S-18](#s-18-名字的表示与相等)） | 「按 name 判替代、不用别的成员判」是用法约束，归各消费者 |
| [S-3](#s-3-两种范式)～[S-5](#s-5-多命令工具) 范式 | **管得到**：判别、`single` 必带 `input` 不带 `commands`、`multi` 必带非空 `commands` 不带 `input` | 拒绝值的**选择**（哪个名字）由 [S-26](#s-26-表示层拒绝值与判定次序) 的次序定，Schema 只说「不合」 |
| [S-4](#s-4-单函数工具)、[S-5](#s-5-多命令工具) 参数 schema | **管「是 JSON 对象、顶层 `"type": "object"`、带对象 `properties`」**（三条硬要求的第 1 条） | 是否合法的 Draft 2020-12 schema、每个参数带说明、只用可呈现子集——实现校验（[S-26](#s-26-表示层拒绝值与判定次序) 的 Schema 之外那一步）；`strict` 投影（[G-12](#十已知缺口)） |
| [S-6](#s-6-模型面只有一个条目)、[S-7](#s-7-多命令-input-的生成规则) 模型面与生成规则 | 管 `ModelToolEntry` 的形状（名字只含供应商收的字符）；**派生本身管不到**——它不是被存下的值 | 装配、传输适配与执行运行时；逐字核对见 `examples.md` 第 9、11 节 |
| [S-8](#s-8-说明与用法) `help` 与 `inspect` 一致 | **管不到** | 给出 `inspect` 答案的那一方；证据义务 V-3 |
| [S-9](#s-9-四项依赖名)～[S-15](#s-15-执行权限) 声明、设置、权限 | **管得到**：成员集合、类别定死、枚举、时长、并发下限、执行权限必填、有阈值必有许可（M15） | 各层配值与求值、依赖解析 |
| [S-12](#s-12-后台许可与转后台阈值)「没有许可不转后台」 | **管不到** | 执行运行时 |
| [S-16](#s-16-组合)、[S-17](#s-17-来源) 组合与来源 | 管得到：MCP 来源单函数、不组合、端点类别 | `name` 的生成、说明与参数 schema 的规范化（`capability.mcp-bridge/v1#S-17`）；撞名（`data.mcp-endpoint` 的 G-2）；组合图成环 |
| [S-18](#s-18-名字的表示与相等) 名字 | `name` 见 S-2 那一行；其余名字只管非空 | 逐码点相等、不解析是用法约束；`name` 转写后的长度在 Schema 之外 |
| [S-19](#s-19-由定义得出的依赖声明)、[S-24](#s-24-结果与声明对得上) 声明与实际 | **管不到**——Schema 看不到定义与结果的配对 | 执行运行时；证据义务 V-4 |
| [S-20](#s-20-两种写法与等价规则) 等价规则 | 只管两种写法 | 转换本身归接收返回值的运行时 |
| [S-22](#s-22-结果内容里没有工具调用) 结果里没有工具调用 | **管得到** | — |
| [S-23](#s-23-卸载) 卸载 | 管 `raw` 必填、两种形式、`summary` 非空 | 「`raw` 不进消息与日志」「占位不是系统摘要」归执行运行时 |
| [S-27](#s-27-表示层拒绝不是判定) 拒绝不折叠 | **管不到** | 各消费者 |
| [S-29](#s-29-不在定义里的三样)、[S-30](#s-30-实现不在定义里) 不在定义里的 | 管得到定义里**没有**那些成员（`additionalProperties: false`） | 「不查定义来决定帧与等待」是用法约束 |

**非法输入的含义**：Schema 校验失败，或 Schema 之外那一步判出参数 schema 不合法 ⇒ 这份输入**不是**一份工具定义（或一个工具返回值）⇒ 按 [S-26](#s-26-表示层拒绝值与判定次序) 给出拒绝值。
**校验失败不得降级为「按默认处理」或「尽力而为」。**

## 六、不在定义里的

### S-29 不在定义里的三样

**等待态、发帧、要不要卸载，都不在工具定义里**
（[PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#不在定义里的三样)）：定义里**没有**任何成员声明「我会不会等」「我发不发帧」「我的结果要不要卸载」，
Schema 的 `additionalProperties: false` 挡住这类成员。

**理由**：这三样都取决于**这一次跑成什么样**——同一个工具，查一条记录和导出整张表，没有理由给同一个答案；
发帧还多一条：[系统按实际收到什么解析](../../../../product/PF-006-tools-and-skills/design.md#帧长什么样由一份协议约定不由工具定义声明)，定义里那一格从头到尾不会被读一次。

**消费者的义务**：**不得**为了决定要不要解析帧、要不要等应答、要不要卸载而去读定义。要不要卸载，只看这一次的返回值有没有 `offload`（[S-23](#s-23-卸载)）与单条限额（PF-012 §5.10）。

**同一条理由也适用于报账**：一次执行花了多少是每一次执行里的事，定义里没有「我会不会产生费用」一格；账的形状归 `data.call-accounts`（只引）。

### S-30 实现不在定义里

**工具可以自带实现，一直到自带一份完整的实现 package**（[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)）——
**那是资产包里带着实现工件，不是定义记录里嵌代码**。定义里**没有**代码、模块路径、入口函数、包引用或装载方式。

定义与它可能自带的实现是**同一个身份下的一份表示**（[PF-006 §5.2](../../../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)）。
实现工件怎样随资产包到达、怎样装进运行时、装不进时走同名替换件——**归提供者设计与执行运行时**（PF-002：「产品这一层只定它允许自带」）。

## 七、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

> **本表只列跨部署形态会变或须写明「不变」的判定。**不在表里不等于不适用：本契约的条款在任何部署形态下一律成立。
> **这张表是契约的一部分**：装配给的那些，演化到分布式时不会自动成立。

| 判定 | 单机由谁给 | 分布式必须由协议重新兑现什么 |
|---|---|---|
| **`modelInput` 由定义算出**（[S-6](#s-6-模型面只有一个条目)、[S-7](#s-7-多命令-input-的生成规则)） | 纯函数 | **不变**——任何节点对同一份定义算出同一个值；[S-7](#s-7-多命令-input-的生成规则) 第 2 条的次序正是为此 |
| **名字相等**（[S-18](#s-18-名字的表示与相等)） | 值比较 | 不变 |
| **模型看到的条目与运行时据以校验、派发的定义是同一份** | 同一进程内同一份装配（一次执行尝试之内动作清单不变，[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)） | **须随调用携带足以指认那一份定义的东西**（资产版本，或 MCP 列举的那一版），接收方按那一份校验；否则一次中途换版会让参数按另一份 schema 被判 |
| **`help` 与 `inspect` 一致**（[S-8](#s-8-说明与用法)） | 两者读同一份定义 | 两处须读**同一版本**的定义 |
| **模型面条目投成任何一家的工具声明都不需要改写 schema；回来的调用名按逆转写唯一对回定义**（[S-6](#s-6-模型面只有一个条目)、[S-18](#s-18-名字的表示与相等)） | 本契约的表示层规则保证；键名映射由传输适配做，逆转写只由工具执行运行时在起执行者之前做（[S-6](#s-6-模型面只有一个条目)） | **不变**——条目与转写都是纯函数；在哪个节点做映射都只换键名与外壳、不碰 schema；逆转写不依赖任何会话状态 |
| **表示层校验**（[S-26](#s-26-表示层拒绝值与判定次序)） | 加载时校验一次 | **每个接收定义或返回值的边界各自重新校验**；不得因为发送方校验过就跳过 |
| **裸字符串的等价**（[S-20](#s-20-两种写法与等价规则)） | 接收返回值的那一处兑现 | 不变，但**只兑现一次**：跨进程传的一律是转换后的 `ToolResult`，接收方不得再按字符串解释 |

## 八、性质与消费者场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 作者写的定义身份只由 `name` 决定 | 不变量 | [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) | 各消费者的比较实现（[S-2](#s-2-身份是-name)） | 改了参数或说明之后被当成另一个工具；或两份同名定义各算各的 |
| P-2 | 模型面恒为一个条目、一份 input | 不变量 | [PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool) | 装配（[S-6](#s-6-模型面只有一个条目)） | 一个多命令工具在 agent 面前多出条目 |
| P-3 | 多命令工具的 input 是 `commands` 的纯函数，不另存 | 不变量 | [PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样) | Schema（`multi` 不带 `input`）＋[S-7](#s-7-多命令-input-的生成规则) | 模型看到的命令与 `commands` 对不上 |
| P-4 | 缺席的「需要」不增加前提；缺席的后台许可不放行 | 安全 | [PF-006 六项可选声明](../../../../product/PF-006-tools-and-skills/design.md#六项可选声明) | [S-9](#s-9-四项依赖名)、[S-12](#s-12-后台许可与转后台阈值) | 一个没声明许可的工具被转了后台 |
| P-5 | 转后台阈值不授予后台许可 | 安全 | [PF-006 §6.6](../../../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度) | Schema（有阈值必有许可，M15）＋执行运行时（没有许可不转后台，[S-12](#s-12-后台许可与转后台阈值)） | 一个没有许可的工具被手动切或随插队转了后台；或一份有阈值无许可的定义被收下 |
| P-6 | 每项设置的类别由契约定死，作者改不了 | 安全 | [PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别) | Schema（[S-10](#s-10-设置项声明)） | 工作区配到了某个工具的目标环境 |
| P-7 | 执行权限默认值必须显式给出，缺席不补 | 安全 | [PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool) | Schema ＋ 加载定义的一方（[S-15](#s-15-执行权限)） | 一份缺执行权限的定义被当作 `auto` 放行 |
| P-8 | 枚举闭合，未知取值不降级 | 安全 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) | [S-28](#s-28-判别式与枚举闭合) | 未知档位被当成 `auto` 或 `ask` |
| P-9 | 工具结果里不发起调用 | 安全 | `data.content-blocks` 的 `call_in_result` 规则 | Schema（[S-22](#s-22-结果内容里没有工具调用)） | 工具结果里出现一个会被当成模型调用的块 |
| P-10 | 原始结果不进消息，也不进会话日志 | 不变量 | [PF-006 §4 卸载](../../../../product/PF-006-tools-and-skills/design.md#卸载) · [PF-012 §5.10](../../../../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关) | 执行运行时（[S-23](#s-23-卸载)） | 会话日志里出现了 `raw` |
| P-11 | 系统不替作者写摘要 | 安全 | [PF-006 §6.10](../../../../product/PF-006-tools-and-skills/design.md#两条来路产物不同) | 执行运行时（[S-23](#s-23-卸载)） | 占位里出现系统生成的「摘要」 |
| P-12 | 表示层拒绝不折成可用性、存在性或权限判定 | 安全 | SYS-SPEC · [PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装) | 各消费者（[S-27](#s-27-表示层拒绝不是判定)） | 一份坏定义被装成替换件、被静默略过，或被当成 `forbid` |
| P-13 | MCP 来源的定义恒为单函数、不组合、不是资产 | 不变量 | [PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作) | Schema（[S-17](#s-17-来源)） | 一个接入点被压成多命令工具，或它的动作被当成资产去组合 |
| P-15 | 模型面条目投成任何一家的工具声明都不需要改写 schema；回来的调用名唯一对回一份定义 | 不变量 | [研究 V-1～V-4](../../../../../research/tool-definition-shape-sources/evidence.md)，产品负责人 2026-09-24 要求 | 表示层校验（[S-4](#s-4-单函数工具) 三条、[S-18](#s-18-名字的表示与相等)） | 传输适配为某一家改写了参数 schema、一家拒收这个工具，或两份定义转写成同一个名字 |
| P-14 | 帧、等待、卸载的判断不查定义 | 不变量 | [PF-006 不在定义里的三样](../../../../product/PF-006-tools-and-skills/design.md#不在定义里的三样) | 各消费者（[S-29](#s-29-不在定义里的三样)） | 运行时因为定义里「没有那一格」而丢弃收到的帧 |

**进展性质：本契约不拥有任何进展性质。**定义是数据，不会「最终成为」别的值。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约。本节是 `CS-1`～`CS-8` 的唯一定义处。

#### CS-1 派发一次多命令调用

**工具执行运行时**收到 `{"command": c, "args": a}`，依赖 [S-5](#s-5-多命令工具)、[S-7](#s-7-多命令-input-的生成规则)：
`c` 必须是 `commands` 的一个键；**按 `commands[c].input` 校验 `a`**（`args` 缺席按 `{}` 校验；定义是权威——`modelInput` 只保证 `c` 取自命令表、`a` 是对象，**不替它判参数**，[S-7](#s-7-多命令-input-的生成规则) 第 3、4 条）。得到要执行的那个命令与一份合格参数。
`c` 不在 `commands` 里时的收场归运行时，**但不得是「不可用」**——不可用只出自替换件（[PF-006 §5.5](../../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)）。

#### CS-2 呈现模型面那一个条目

**agent 装配**依赖 [S-6](#s-6-模型面只有一个条目)、[S-8](#s-8-说明与用法)、[S-18](#s-18-名字的表示与相等)：每份定义得到恰一个 `ModelToolEntry`（`modelName`、`description`、`modelInput`），传输适配只按键名把它放进那一家的外壳。
工具不可用时，替换件与原件的 `modelName`、`modelInput` 相同，只换 `description`。

#### CS-3 放行判断第②步

**放行判断**依赖 [S-15](#s-15-执行权限)：读到这个工具执行权限的默认值，与各层配值按收窄合成（合成不在本契约）。
缺执行权限的定义**在加载时就被表示层拒绝**（[S-26](#s-26-表示层拒绝值与判定次序)），走不到这一步，也不被当成任何一档（[S-27](#s-27-表示层拒绝不是判定)）。

#### CS-4 列出一个工具的设置项

**资产持有与配值**依赖 [S-10](#s-10-设置项声明)～[S-13](#s-13-超时与并发)：得到这个工具有哪几项设置、各自的类别与默认值；
`targetEnvironment` 是落点与身份类，**工作区那一级的值在加载时被滤掉**（过滤归 PF-002 那一侧）；定义里没有的项**不存在**，无从配值。

#### CS-5 由 MCP 列举生成定义

**MCP 桥**依赖 [S-17](#s-17-来源)、[S-18](#s-18-名字的表示与相等)、[S-15](#s-15-执行权限)、[S-4](#s-4-单函数工具)：对端每个动作一份单函数定义，`origin` 带 `endpoint` 与原样的 `remoteName`，不带 `composes`；
`name` 怎么起、说明与参数 schema 怎样规范化、六项声明与执行权限默认值怎么取，按 `capability.mcp-bridge/v1#S-17`（原 G-8 已关闭）；交出的定义照常过本契约的表示层校验。**本场景走得通。**

#### CS-6 回答一个工具的用法

**`Tools().inspect`** 依赖 [S-8](#s-8-说明与用法)：答案与定义里的 `help`（若有）一致；没有 `help` 照样答。
产品正文的「help 命令空间」就是它呈现的这个字段，不是一个可调的命令。

#### CS-7 算一个工具当下可不可用

**可用性解析**依赖 [S-9](#s-9-四项依赖名)、[S-11](#s-11-目标环境)、[S-19](#s-19-由定义得出的依赖声明)：得到依赖声明那一串名字；目标环境那一项用**求值后**的值；`composes` 不在其中。
「满足」的匹配语义**停在 [G-5](#十已知缺口)**。

#### CS-8 接住一次工具返回

**执行运行时**依赖 [S-20](#s-20-两种写法与等价规则)～[S-25](#s-25-toolresult-不是收场)：裸字符串按等价规则转成 `ToolResult`；带工具调用块的结果被拒（`result_call_in_content`）；
有 `offload` 时 `raw` 不进消息、占位带 `summary` 或运行时占位；附件与结果端模态对照声明。
「这次真的没成」怎么表达**停在 [G-9](#十已知缺口)**。

## 九、缺席与恢复

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是**值层面的缺席怎么读**：

| 缺席的是什么 | 读作 | 依据 |
|---|---|---|
| `name`、`description`、`paradigm`、`permissions`、`origin`；`single` 的 `input`；`multi` 的 `commands` | **表示层拒绝**，没有缺省 | [S-26](#s-26-表示层拒绝值与判定次序) |
| `needs` 或其中任一成员 | 不需要（外部服务 / 附件 / 调用端其他模态 / 结果端其他模态） | [S-9](#s-9-四项依赖名)，产品正文明写 |
| `allowBackground` | **不允许后台**；此时也不得声明阈值（M15） | [S-12](#s-12-后台许可与转后台阈值)，产品正文明写 |
| `settings` 或其中任一项 | 这个工具**没有这一项设置**；各层无从配值 | [S-10](#s-10-设置项声明) |
| `targetEnvironment` | 对执行环境没有特殊要求 | [S-11](#s-11-目标环境)，产品正文明写 |
| `backgroundThreshold`（而许可为真） | 不因时长自动转后台 | [S-12](#s-12-后台许可与转后台阈值) |
| `timeout`、`concurrency` | 这个工具没有这一项，**也就没有这一项限制**（PF-006 §6.6） | [S-13](#s-13-超时与并发) |
| `help` | 没有定义内的用法说明；`inspect` 照样答 | [S-8](#s-8-说明与用法) |
| `composes` | 不组合任何技能 | [S-16](#s-16-组合) |
| `ToolResult.offload` | 作者没声明卸载（系统兜底的截断另走一路） | [S-23](#s-23-卸载) |
| `offload.summary` | 占位由运行时给，只说大小与取回途径 | [S-23](#s-23-卸载) |
| `ToolResult.attachments` | 没有附件 | [S-21](#s-21-toolresult-的三样) |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

## 十、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决；消费者读到这里应当知道哪里在等裁决，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-1** | **收窄（2026-09-24）**：`name` 的字符集与长度已定（[S-18](#s-18-名字的表示与相等)，产品负责人 2026-09-24 要求，[D-039 U-24-1](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#凭据档案工具拓展件卡片-pf-013-rev-10pf-002-rev-1819pf-006-rev-19pf-012-rev-12pf-007-rev-17pf-008-rev-7pf-016-rev-6)）。**仍缺**命令名、依赖名、设施名、`remoteName`、技能名的字符集与长度——它们不作为名字送进供应商请求 | 需要拿这些名字做键的实现 | **主线**（规格层） |
| **G-2** | **设施名集合**：[PF-005 明确不定清单](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#设施)；工具声明的设施名与沙箱实现自报的设施名怎样对上 | 目标环境的匹配（[S-11](#s-11-目标环境)） | **PF-005 的 owner** 与执行运行时 |
| **G-3** | **已关闭**：原生成规则 `args: oneOf` 不绑定 `command`、命令 schema 相交时误拒、放不下命令的 `description`；2026-09-23 曾改为每个命令一支的顶层 `oneOf`，2026-09-24 产品负责人裁定改为 flat 形（[D-039 U-24-2](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#凭据档案工具拓展件卡片-pf-013-rev-10pf-002-rev-1819pf-006-rev-19pf-012-rev-12pf-007-rev-17pf-008-rev-7pf-016-rev-6)）——`args` 不展示任何命令的 schema，命令说明进 `command` 的命令表，三处毛病都不再有落脚处（[S-7](#s-7-多命令-input-的生成规则)） | — | — |
| **G-4** | **已关闭**（主线裁定，见 [D-040 §S5 S5-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s5tool-definition报回的)）：`help` 是文本字段，「help 命令空间」由 `Tools().inspect` 呈现该字段（[S-8](#s-8-说明与用法)） | — | — |
| **G-5** | **目标环境的匹配语义**（[S-11](#s-11-目标环境)）：绑定层是恰等还是「至少」（PF-006 [依赖表](../../../../product/PF-006-tools-and-skills/design.md#依赖)写过「至少绑定在会话上」）；与执行环境权限 `always-allow` / `auto_place` / `never-allow` 怎么交互 | 执行运行时算落点；可用性解析 | **执行运行时契约**，产品面问 **PF-005 / PF-006 的 owner** |
| **G-6** | **已关闭（2026-09-24，按 PF-006 rev 18/19）**：超时即前台上限、并发即并发上限，语义由 [PF-006 §6.6「前台上限与并发上限」](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限)给出、由 `capability.tool-execution-runtime/v1#S-43`、`#S-44` 兑现（[S-13](#s-13-超时与并发)） | — | — |
| **G-7** | **已关闭**（主线裁定，见 [D-040 §S5 S5-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s5tool-definition报回的)）：有阈值而无后台许可即拒，`malformed`（M15，[S-12](#s-12-后台许可与转后台阈值)） | — | — |
| G-8 | **已关闭（2026-09-24 整批对齐）**：MCP 来源定义的生成由 `capability.mcp-bridge` v1 S-17 给出（名字取 `data.mcp-endpoint/v1#S-11`）；MCP 来源的定义不按结果端模态判（[S-24](#s-24-结果与声明对得上) 第 3 条） | — | — |
| **G-9** | **工具作者怎样以正常返回表达「失败」**（[S-25](#s-25-toolresult-不是收场)）：`ToolResult` 不带收场；实现自己炸了按 PF-006 §5.5 是上交而不是失败 | 执行运行时判定收场；工具作者 | **主线**与**执行运行时契约** |
| **G-10** | **`ToolResult` 里块的 `id` 唯一范围**（[S-21](#s-21-toolresult-的三样)）：作者给的 `id` 只能在这份返回值里互不相同，却要在包成的那条消息里唯一 | 执行运行时包成工具结果块 | **主线**（与 `data.content-blocks`、`data.messages` 对齐） |
| **G-11** | **卸载的组合方式**（[S-23](#s-23-卸载)）：`content` 与占位怎么排；PF-006 §6.10「摘要，也就是那条进消息的内容」与本版两个成员怎么对应；原始结果大小取不到时占位怎么说 | 执行运行时构造占位 | **主线**，产品面问 **PF-006 的 owner** |
| **G-12** | **收窄（2026-09-24）**：本版保证的可呈现子集 = 非 strict 模式下 OpenAI Chat Completions 与 Anthropic 都直接接受的那一份——[S-4](#s-4-单函数工具) 的三条硬要求（顶层 object 带 `properties`、每个参数带说明、只用十七个关键字），任何 `$ref` 都不在其中（M27；根相对那一种原本就禁，M24）。**仍缺**：① `strict: true` 的附加要求（每个对象 `additionalProperties: false`、全部属性进 `required`、可空写成 `type` 数组）**本版不承诺**，留给传输适配作可选投影；② OpenRouter 是否按供应商转译工具定义、各家对关键字的其余限制，页面未写（研究 V-3） | 传输适配（`strict` 投影）；agent 装配 | **模型请求运行时一侧**与研究维护者 |
| **G-13** | **附件存储名与 `AttachmentRef.storage` 的对应**（[S-24](#s-24-结果与声明对得上)）：「存储」本身尚无定义 | 附件那一支的核对 | **PF-006 的 owner**（存储待裁） |
| **G-14** | **工具自定义的设置项与权限项**：PF-002 三方分工允许资产自定形状、Tool 行写「等」；本版 `settings` 与 `permissions` 闭合 | 需要自定义设置的工具作者 | **主线**；需要时出 v2 |
| **G-15** | **被表示层拒绝的定义与返回值怎么收场**（[S-27](#s-27-表示层拒绝不是判定)）；结果与声明对不上时落什么（[S-24](#s-24-结果与声明对得上)） | 装配与执行运行时 | **agent 装配**（PF-004 的契约）与**执行运行时契约** |

## 十一、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **不定义执行**：派发、参数校验的时机、设置求值、落点匹配、收场判定、前后台切换、等待、发帧、卸载的执行——归工具执行运行时。
- **不定义各层怎样配值、怎样求值**（覆盖与收窄）——归资产持有与配值；**不定义放行四步**——归 PF-007 那一侧。
- **不定义依赖怎样解析、可用性什么时候重算、替换件怎样构造**——归执行运行时与装配。
- **不定义 MCP 列举怎样变成定义**——归 MCP 桥接契约（`capability.mcp-bridge/v1#S-17`，原 G-8）。
- **不定义实现工件怎样随资产包到达、怎样装载**——归提供者设计（[S-30](#s-30-实现不在定义里)）。
- **不定义技能**、**不定义每一次执行的账**（`data.call-accounts`）、**不定义块、消息与到达语法**（`data.content-blocks` 等）。
- **不定义资产持有键、版本与归属**——定义里不带它们（[S-2](#s-2-身份是-name)）。
- **不做键名映射**：条目的三样由本契约定死（[S-6](#s-6-模型面只有一个条目)）；把它们放进某一家的键里、加不加 `type: "function"` 外壳、给不给 `strict`，归传输适配。本契约只承诺这一步不需要改写 schema。
- **不承诺任何已执行的验证**。证据义务与状态在[验证入口](../verification.md)；Schema 与实例文件存在不表示形状已被校验过。

## 十二、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。
起点见 [D-031](../../../../record/decisions/tool-definition-baseline/README.md)：按 PF-006 §5.3 自研，三个参考源只作参考、字段可照抄，**不继承任何一源的形状**。

**本版的规范工件**：本文件、[`tool-definition.schema.json`](tool-definition.schema.json)、[`examples.md`](examples.md)。

**不建 `formal/`。**理由：本契约没有状态转移，它的结构约束（判别、互斥成员、类别定死、MCP 来源的三条）都由 Schema 的条件直接表达，
在这里建模型只会产出一份与 Schema 同义的平行工件；它触发的义务是**形状校验、生成规则核对、规范场景与消费者走查**，登记在[验证入口](../verification.md)。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
`data.content-blocks` 定型、或[已知缺口](#十已知缺口)任一项被裁决而改变本契约语义或表示时，**候选期内原地改、在验证入口记影响；接受之后出 v2**。推荐版本不自动升级消费者。

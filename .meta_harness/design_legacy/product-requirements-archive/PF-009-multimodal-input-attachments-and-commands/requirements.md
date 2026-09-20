---
kind: product-feature
id: PF-009
primary_dimension: user
secondary_dimensions: [agent]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md
source_sha256: d8fc8858ac9609c3a9e0ad6eb56f10702f049efde8d03dd84b7b66bd183fdbed
source_anchor: "heading:# PF-009：多模态输入、附件与命令操作"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-009：多模态输入、附件与命令操作

[用户维度](../by-user.md) · [输入与命令来源核对](../../../research/legacy_backup/user-input-and-command-sources/research.md)

主维度：用户。副维度：智能体，关联收到的真实内容、手动装载的 Skill 与运行控制。

## 已确认要求

2026-09-12 用户明确：输入支持多模态信息和附件/文件；用户可以使用 keyboard
command 和 slash command，**对 Skill 的手动调用走 slash command**。
2026-09-15 用户复确认并扩展：产品要支持用户使用文本以外的模态信息作为请求的
一部分输入（C1 不变）；产品要支持用户使用快捷键的形式触发更丰富的交互流程
（C2、C7 从"发起获准控制"扩展为"触发显式绑定的交互流程"，见[变更记录](#变更记录)）。
C1/C2 记录直接要求；C3–C7 按已授权继承方向，补充来源中可明确映射的产品行为。
原系统多模态与语音输入为已接受当前要求，命令与快捷键为已承诺未来要求，均非
本项目已经实现的声明。

- **PF-009.C1：输入可包含多模态信息和文件。** 用户能在同一次输入中组合
  文本、图片、音频、视频及文件/附件，保留有意义的内容顺序和关联；纯文本仍是
  正常输入。具体格式及可消费程度按 C3/C4 的实际支持声明处理。
- **PF-009.C2：支持键盘命令与 slash command。** 用户能通过键位或组合键
  触发显式绑定的交互流程：绑定目标可以是获准的会话/运行控制，也可以是获准的
  命令、Skill 或其他交互入口（例如装载某个 slash command、打开命令目录、发起
  一段绑定的业务流程）；绑定明确可见，效果由被绑定目标自己的定义与准入决定。
  用户也能输入 slash command 调用所选命令。用户主动指定某个 Skill
  时使用 slash command；命令须能明确关联要使用的 Skill、参数和相关输入，
  不能只把命令文本原样交给模型猜测。手动入口不合并 Skill 与命令的定义身份，
  也不取消智能体按相应能力规则使用 Skill 的方式。
- **PF-009.C3：附件可持久引用，接纳边界可见。** 文件能上传并被输入引用，
  用户可读出当前格式、分档尺寸等准入限制，实际上传与接纳遵循同一规则及
  租户配额。引用已获受理后，附件可随历史刷新、运行时重建继续读取或下载；
  未引用上传可以按声明期限回收，不能回收仍承担有效历史引用的内容而留下悬空
  引用。读取、引用和下载均检查所属租户及用户权限，上传成功本身不是跨租户
  使用凭据。
- **PF-009.C4：用户能知道模型实际接收了什么。** 系统按目标 Agent 的声明
  区分内容“模型可读”和“仅对 Agent 可见”。图片、PDF 等直喂内容必须真实到达
  支持它们的模型，不能只传文件名却声称已读；工具消费类文件至少让 Agent 知道
  文件的格式、名称和尺寸。语音输入继承后续明确要求：可直接提交语音并以原生
  听觉形式送达能听的模型，保序、耐久、可重放；不支持时明确拒绝，不能静默
  转写成文字掩盖缺口。目标不支持的模态、格式或额度超限须在适用边界如实拒绝，
  下游能力失败也须明确暴露，不能丢块或伪报消费成功。
- **PF-009.C5：命令可按当前上下文发现，使用时核对当前权限。** 用户能查看
  与当前身份、租户、Agent/会话及客户端能力相符的命令、用法、参数和可用状态，
  并在本地搜索、补全。会话的命令集合对应其实际采用的定义版本，不能拿另一个
  版本的菜单冒充。目录与缓存只帮助发现，调用时仍检查当前权限与可用性；失效
  或撤销明确反馈，不泄漏用户无权发现的其它租户资产。
- **PF-009.C6：slash 解析与效果明确。** 对上下文装载型命令，仅输入开头的
  slash 触发解析；命令名明确限定，参数边界可判定，可按顺序组合有限数量的
  命令并保留后续自然语言。成功后，获准的 Skill/Prompt/上下文进入同一普通
  输入流程，继续遵守会话接纳、排队及授权。未知命令、错误参数或失效引用明确
  失败，不能自动降为聊天；用户有显式按普通文本发送前缀内容的途径。Official
  与获准 customized 命令遵循相同声明语义；自定义命令不能借语法提交任意代码
  或绕过能力准入。独立会话排队命令按自己的已确认效果处理，不能把“所有 slash
  都只是上下文装载”作为通用限制。
- **PF-009.C7：快捷键是明确目标的触发入口，设置可跨兼容客户端使用。** 键位
  绑定归用户账号设置，可以查看、修改并按平台能力呈现；控制类绑定作用于用户
  所观察的具体会话/运行，旧窗口不能误停后来启动的工作；命令或流程类绑定等价于
  用户显式发起该命令或流程，仍走其自身的受理、排队与授权。按键捕获与服务端
  准入分开，不能靠改绑定取得额外权限。受理和实际结果分别反馈；输入法、
  文本选择与系统保留按键不被无条件抢占，冲突明确显示，不擅自改键。无法使用
  快捷键时仍有等价显式入口。快捷键的效果只来自显式绑定，不被暗中解释成
  slash、宏或多步工作流。

## 可观察场景

| 场景 | 应有表现 |
|---|---|
| 用户提交“说明文字—截图—补充文字”和一个文件 | 顺序及附件关联保留；能区分模型读到了图片还是只知道文件存在 |
| 用户提交语音，之后刷新历史或运行时重建 | 语音仍可重放；支持的模型收到原始听觉输入，不支持时有明确结论 |
| 用户手动调用一个 Skill，并附带参数和自然语言任务 | slash 对应的 Skill 与参数可判定，获准上下文进入对应输入流程 |
| 用户输入未知命令，或本想发送以 `/` 开头的路径 | 前者明确失败；后者可显式作为普通文本发送，不靠失败时猜测意图 |
| 用户切换组织或命令在菜单显示后被撤销 | 使用时重新核对，不能借旧菜单或另一组织的资产执行 |
| 旧窗口的快捷键指向已结束的运行 | 不误作用于新的运行；界面显示真实控制结果 |

## 关联与待设计事项

[PF-006](../PF-006-user-settings-and-agent-definition-authorization/requirements.md) 拥有用户设置
和定义级授权，快捷键设置适用本项具体范围；
[PF-010](../PF-010-organization-personal-assets-and-permissions/requirements.md) 拥有资产类型与
组织/个人权益；[PF-003](../PF-003-tool-execution-observation-and-control/requirements.md)
拥有单个工具调用的控制，本项的会话/运行快捷键不能暗中改成另一种目标。
[PF-013](../PF-013-session-run-lifecycle-and-pending-input-control/requirements.md) 拥有会话/运行
生命周期、忙时追加、打断后处理及排队编辑/调序；本项的键盘与 slash 入口消费
这些已定义效果，待发多模态内容的具体可编辑范围仍需共同细化。
输入内容若用于回答 HITL，仍遵循
[PF-005](../PF-005-agent-initiated-human-input-and-approval/requirements.md) 的请求关联规则。

待设计：支持格式和容量、各客户端附件与录音交互、内容和引用契约、Skill 对应
命令的登记方式、参数语法与字面发送形式、键位和命令清单、快捷键可绑定的目标
类型清单及其与受理/排队/授权的衔接、排队命令的声明与控制目标。模型/工具多模态回复已在后续
[PF-022](../PF-022-multimodal-response-and-output/requirements.md) 明确；文件转写/抽帧等
派生处理与来源的 official `$` 系统命令另有范围。本项集中登记输入、键盘与
slash 要求，不撤回
[SYS-CONTINUITY](../../system/omne-next-continuity/requirements.md) 的整体继承方向。

目前的设计（[本包覆盖状态](README.md#设计覆盖状态)）尚未覆盖
完整多模态输入、附件耐久性和命令交互。本次不选定内容块 Schema、解析库、
上传后端或运行时框架；没有已接受业务规格需因此取代。

## 变更记录

| 日期 | 变化 | 依据与处置 |
|---|---|---|
| 2026-09-15 | C1 复确认，正文不变："产品要支持用户使用文本以外的模态信息作为请求的一部分输入" | 用户直接确认（本会话）。已接受契约 CD-03（迁移坐标：`spec/data/core-work/v1/contract.md`）、CT-01～CT-04（迁移坐标：`spec/capabilities/media-content/v1/contract.md`）、SE-04/SE-05（迁移坐标：`spec/capabilities/session/v1/contract.md`） 在 legacy 基线的接受记录中记为“已覆盖语义”；该历史判断不自动承接新基线。未闭合的是 CD/CT 的 JSON Schema、上传传输与客户端交互（提供者与应用装配）、"模型实际接收了什么"的读面（消息流评审 N4（旧提案可从 P0 来源修订恢复；新消息流候选仍待 E 线定稿）） |
| 2026-09-15 | C2、C7 扩展："产品要支持用户使用快捷键的形式触发更丰富的交互流程"。快捷键的绑定目标从"获准控制"扩展为"显式绑定的交互流程"（控制、命令、Skill、其他交互入口）；C7 标题由"控制"改"触发入口"，末句改为"效果只来自显式绑定" | 用户直接确认（本会话），超出 [来源清单](../../../research/legacy_backup/user-input-and-command-sources/research.md#来源与映射) 里键位源"首批动作只有 interrupt / resume / cancel / force_stop"的范围，属本项目新增要求。受影响消费者：command-input v1 IN-02（迁移坐标：`.meta_harness/design/spec/capabilities/command-input/v1/contract.md`）"绑定一个具名控制及精确目标"须在下一版扩为可绑定命令与流程（"不自动变成宏、slash 或脚本"仍成立，显式绑定不是自动）；session v1 SE-13 / SE-15（迁移坐标：`spec/capabilities/session/v1/contract.md`）"keyboard command 是即时控制，不入队"须改为"控制类绑定即时、命令类绑定按被绑定命令的受理与排队规则"；旧接受记录仍是历史事实，冲突部分在当前架构（迁移坐标：`.meta_harness/design/architecture/README.md#需求覆盖与缺口`）标为待处理 |


## 迁移依赖 gate

下表只解释上述变更记录中的旧规格坐标。目标版本号同为 `v1` 也属于新的 baseline 三元组，不能据路径或版本号推断等价。

| 历史引用三元组 | legacy current | 新目标三元组 | owner | 条款映射状态 | freeze 结果 |
|---|---|---|---|---|---|
| `(omne-harness-lite-legacy-spec, data.core-work, 1)`（CD-03） | `(omne-harness-lite-legacy-spec, data.core-work, 2)` | `(omne-harness-lite-design-2026-09-15, data.core-work, 1)` | S | legacy v1 的历史覆盖声明；旧→新 CD-03 映射、目标哈希及消费者复核待 owner 提交 | 阻断 PF-009 对该数据条款的覆盖冻结 |
| `(omne-harness-lite-legacy-spec, capability.media-content, 1)`（CT-01～CT-04） | `(omne-harness-lite-legacy-spec, capability.media-content, 2)` | `(omne-harness-lite-design-2026-09-15, capability.media-content, 1)` | M | legacy v1 的历史覆盖声明；旧→新 CT 条款映射、目标哈希及消费者复核待 owner 提交 | 阻断 PF-009 对媒体内容条款的覆盖冻结 |
| `(omne-harness-lite-legacy-spec, capability.session, 1)`（SE-04/SE-05、SE-13/SE-15） | `(omne-harness-lite-legacy-spec, capability.session, 2)` | `(omne-harness-lite-design-2026-09-15, capability.session, 1)` | L | legacy v1 的历史覆盖/冲突记录；新条款尚需同时处理快捷键扩展，不能按等价迁移默认承接 | 阻断 PF-009 对 Session 消费的冻结；语义变化仍需有权者接受 |

这些 gate 不撤销源接受记录的历史事实，也不声称 legacy current 已满足本轮新增要求。

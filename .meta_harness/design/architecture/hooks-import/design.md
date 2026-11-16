# 兼容 hook 翻译的设计

本设计的公开数据由实际定义它的拥有者发布，不为它单独建空包。新的产品政策由产品负责人决定。

## 导入操作

`importHostHooks(host, document, path, scope)` 四个参数全部必填。它**不要授权，不做 IO，不提交**。导入者声明的来源不等于可信来源。闭合的失败只有 `invalidInput`：`host`、`scope`、`path` 或格式不对，或者任意一个 matcher 坏了，整份拒绝，一条也不导出。同样的输入逐字产出同样的报告与 name。

取证版本：Claude Code 2.1.280；Codex 修订 `5c5308fc`。Codex 配置的逐字结构、解释器与部分失败的语义没有核过。本设计按与 Claude Code 同构的读法处理 Codex，这是前提，不是上游事实。

操作的行为：

- 每个 command handler 恰好产出一条报告，逻辑上重复的也不合并。按事件、组、handler 的原始顺序产出。
- name = `hooks.<host>.<sha256(path 的 UTF-8 字节)>.<event>.<组号>.<条号>`，组号与条号从 1 起。路径不做规范化。插入一条 handler 会让后面的序号变化，这个身份代价明确保留。
- 报告的项是闭合的 `imported`、`degraded`、`skipped`。`skipped` 只有 `non_loop_event` 与 `no_mapping` 两个原因。`defer` 不由导入报告产生，运行时才有。
- 带 `if` 的、`async` 的、非 command 的、事件不认识的、matcher 不支持的，以及没核过的 Claude Code `args` 或 shell 形式，都是 `no_mapping`。坏的 matcher 不是跳过，是整份 `invalidInput`。
- 声明按事件取干预力的上限。`unavailability` 的初值是 `skip`。落在可否决的 before 位置上的件，落地者可以把它改成 `veto`。不能把声明降档之后再容忍越档的输出。

## 工作区来源

工作区的兼容发现、原位读取、冲突与去重、什么时候采用，归[工作区产品正文](../../product/workspaces/design.md#j-ws05-明确复用同工作区的第三方资产)第 63 至 71 行。导入的命令型 hook 默认不启用，由获准租户在自己的设置里逐件打开，归[资产与规则的产品正文](../../product/assets-and-rules/design.md#workspace)第 75 行与[资产规格](../../../../packages/assets/SPEC.md#设置工作区与同层合并)第 140 行。本设计在它们之上只加两条：兼容发现缺省关闭，候选留在工作区层，不复制成租户持有。打开来源**不授予命令执行权**。

## 兼容执行的责任

这一节不增加公开操作。

- 输入按位置、情形与 matcher 筛选。Stop 的续跑标记从可信的日志事实读，不读进程里的计数。读工具动作历史只接受日志里完整的、已核对的前缀，是纯投影，不授权。读历史不能另造第二份 Session 或 Run 记录的权威。
- 子进程要解析这一次真实的租户与会话环境，取得当前的宿主准入，明确给出工作目录与白名单里的环境变量，不继承全部宿主环境变量。执行用执行环境的落点、租约与命令端口，保留落点隔离，外部作用不自动重放，请求停止与实际停止分开。
- 起不来（还没开始）走声明的 `unavailability`。启动之后普通的超时、退出码既不是 0 也不是 2、坏 JSON、坏输出，是**固定的非阻断错误，处置 `ignore`**，必须在日志里记 `skipped: errored`、`output: observed` 与具名的成因，坏的原文不能泄漏。只有环境启动之后被撤除、或判断不了开始了没有这类失联，才适用干预力默认的错误政策，可以是 `fails_closed_on_error`。解释器不存在是起不来；脚本不存在但解释器已经起来（退出码 127）是非阻断错误。fail-closed 不泛化到别的失败。
- 退出码 0、退出码 2 与 JSON 的优先关系按事件映射。`allow` 只是 `observed`，不是放行。改资产的输出被忽略。`systemMessage` 这类界面字段不当系统提示。注入是一条带来源拓展件身份的 SystemReminder。终态的 stop 落为 `cancelled`。hook 不能代人回答，也不能代答 MCP 卡片，不另造宿主的续跑上限。
- `ask` 加 `updatedInput` 时放进 `proposedRewrite`。人的四档答案借用卡片样式，**不写权限**，照样走独立的工具准入。允许之后，改写逐值等于 `proposedRewrite`。否决、没有答复或自由文本都不解释成允许。回放只读日志和人的答复，不重跑脚本，因为脚本有外部副作用。Codex 不支持 `ask`，收到就按错误处理。超出干预力的输出记 `output_not_allowed_for_power`，只观察的件按 `ignore` 处置。
- 完整的事件映射见[方言映射](verification/dialects.md)，不能只留五个常见 hook。Claude Code 映射的事件有 UserPromptSubmit、PreToolUse、PermissionRequest、PostToolUse、PostToolUseFailure、PostToolBatch、Stop、StopFailure、PreCompact、PostCompact 与 SessionStart 的 compact 部分；Codex 有 UserPromptSubmit、PreToolUse、PermissionRequest、PostToolUse、Stop、PreCompact、PostCompact、SessionStart 的 compact 部分与 Interrupt。其余事件各自是 `non_loop_event` 或 `no_mapping`。退出码 2、`continue: false`、阻断反馈、改写与额外上下文在不同事件之间不等价，不能用一个统一分支抹平。
- 前提核清之前，`no_mapping` 的保护条件保留。

## 未决

下列未决闭合之前，依赖它的那部分不按本设计实现。

| 未决 | 问题与读法 | 做到这一程时要定 |
| --- | --- | --- |
| 工作区来源的干预力上限 | [Agent 规格](../../../../packages/agent/SPEC.md#扩展与卡片)第 256 行说来源为工作区的扩展上限是只观察，[资产与规则的产品正文](../../product/assets-and-rules/design.md#workspace)第 73 行说工作区的 Loop Extension 只观察，第 204 行说命令型 hook 启用之后仍按 Loop Extension 只观察执行。本设计让兼容候选留在工作区层，又按事件给出可否决、可改写的上限。读法一：工作区来源的兼容件一律只观察，方言表的否决与改写只在收进租户层之后才生效。读法二：租户逐件启用的命令型 hook 例外，按方言表的上限。 | 读法一要改场景第 2 至 4 节的预期干预力，或给场景加「已收进租户层」的前提 |
| Codex 与 Claude Code 的未核事实 | Codex 是否与 Claude Code 同构；Claude Code 的 exec form 与 shell 形式。 | 核过之后更新方言映射与 `no_mapping` 的保护条件 |
| 报告留痕 | 来源与哈希的留痕在资产里没有对应字段。路径要不要规范化、不同配置的次序、越过上限的落地怎样拒绝，没定。 | 留痕的字段与它的拥有者，以及这三条规则 |
| 工作目录与环境变量白名单 | 子进程的工作目录与 `hookEnvAllowlist` 没定。 | 两者的来源与缺省 |
| 拓展的成本 | 没有 Run 的拓展调用，成本记在哪里，没定。 | 记账的拥有者 |
| 逐件启用的表示 | 产品正文定了由租户逐件启用，工作区候选与逐件命令启用这一事实怎样表示，没定。 | 启用事实的形状与写面 |
| 复用 DeepSeek Harness 分支的候选 | 这个候选的许可与改动量没有核过，不能当作已实现的复用。 | 核许可与改动量，再决定复不复用 |

验证义务见[验证](verification/README.md)。

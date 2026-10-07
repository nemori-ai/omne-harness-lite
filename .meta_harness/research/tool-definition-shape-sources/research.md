# 三个参考源的工具定义形状，对得上多少产品条款

- 调查对象与日期：DeepSeek Harness `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`）；
  omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`（`langchain-core 1.6.1` / `langgraph 1.2.11`）；
  本仓库 `feat/minimal-runtime@d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`（未进 main，只作形状参考）。2026-09-23 取证。
- 消费者：本程的 proposal「工具定义基线」（待出现）。
- 最近核对：2026-09-23 / 上述三个版本；产品正文 PF-006 rev 14、PF-002 rev 10、PF-007 rev 16。
- 当前结论：**三源都没有一份形状能不改就承载 PF-006 §5.3。**参数、说明、等待态不进定义这几项三源都能承载；
  「身份＝类别＋name、同名替代」「用法走 `inspect` 不配 `help`」「发帧不进定义」三条，至少一源的既有机制方向相反；
  外部服务与附件存储两项声明三源都没有定义级字段。各源的优势恰好互补：omne-next 有后台声明与多命令框架，
  minimal-runtime 有数据化的命令表、模态与设施声明，DSH 有最完整的注册、呈现与执行管线。

## 问题与区分条件

对照的是本项目产品正文里「一份工具定义长什么样」的全部条款——
[PF-006 §5.3](../../design/product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)（rev 14）连同它引用的
[§4 常驻/依赖/替换件](../../design/product/PF-006-tools-and-skills/design.md#常驻)、
[§5.4 返回值](../../design/product/PF-006-tools-and-skills/design.md#54-返回值两种写法一种模型)、
[§6.4](../../design/product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)、
[§6.6](../../design/product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)、
[§6.8](../../design/product/PF-006-tools-and-skills/design.md#68-工具怎么提执行环境的要求)、
[§6.11](../../design/product/PF-006-tools-and-skills/design.md#611-工具两端各要什么模态)；
[PF-002 的身份](../../design/product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)、
[Tool](../../design/product/PF-002-assets-settings-and-permissions/design.md#tool)、
[MCP](../../design/product/PF-002-assets-settings-and-permissions/design.md#mcp)（rev 10）；
[PF-007 的多命令范式](../../design/product/PF-007-meta-capabilities/design.md#多命令范式)与
[`Tools()`](../../design/product/PF-007-meta-capabilities/design.md#61-tools通向任意非常驻工具)（rev 16）。

每一格回答一个问题：**这一源现成的形状，拿来承载这条条款，要付多大改动。**格子取四个值：

| 取值 | 含义 |
|---|---|
| **可直接承载** | 现成字段或机制与条款同向，照用即可 |
| **需改** | 有对应的东西，但位置、语义或默认值要改 |
| **不可承载** | 该源的既有机制与条款**方向相反**；要承载就得推翻这个机制本身 |
| **未覆盖** | 读过下表所列位置，没有对应物（读数缺口，不是构造反例证明不存在） |

## 证据入口

记录编号指向 [evidence.md](evidence.md)：`P-*` 是产品正文，`D-*` 是 DSH，`O-*` 是 omne-next，`M-*` 是 minimal-runtime。
逐格的理由与问题一至六的逐条回答在 [当轮报告](reports/2026-09-23-tool-definition-shape.md)。

## 对照表：PF 条款 × 三源

| # | 产品条款 | DSH `c291e796` | omne-next `6263fed5` | minimal-runtime `d79484d` |
|---|---|---|---|---|
| 1 | 身份＝类别＋name（P-2） | 需改：按注册名、单一命名空间、无类别（D-2） | 需改：name 可被配置改写、toolset 加前缀、合并标识退到 class_name（O-6） | **不可承载**：身份是 `ownerTenantId＋definitionId＋version`（M-1、M-3） |
| 2 | 同名即替代，平台/组织/租户各一份（P-1 §5.2、P-2） | 需改：只在 agent scope 链上遮蔽，同层重名抛错（D-2） | 需改：仅装载期配置 Last-Write-Wins（O-6） | **不可承载**：按 registration/generation 换代，旧 manifest 未准入调用 `stale_binding`（M-3） |
| 3 | 参数 schema | 可直接承载（D-1） | 可直接承载（O-1） | 需改：只挂在命令上，强制 object 根＋`additionalProperties:false`（M-1） |
| 4 | 说明 | 可直接承载（D-1） | 可直接承载（O-1） | 可直接承载（M-1） |
| 5 | 返回：定义含「返回什么」＋§5.4 两种写法 | 需改：`output{schema,render}` 必填；`ToolResult` 无原始结果/附件地址（D-1） | 需改：`content`/`content_and_artifact` 与两种写法同构，但无返回形状声明（O-1） | 需改：每命令 `outputSchema` 必填，无「普通返回」（M-1） |
| 6 | 单函数范式 | 可直接承载（D-1） | 可直接承载（O-1） | 需改：实现侧必须有命令表，`single` 投影只在契约与分支文档（M-1、M-2） |
| 7 | 多命令，整套一个槽位 | 需改：无框架，逐工具扁平枚举或拆成多个顶层工具（D-4） | 可直接承载（O-2） | 可直接承载（M-2） |
| 8 | 带多少由作者定，系统不折中 | 未覆盖（D-4） | 可直接承载：`flat` / `typed_union` 按类选（O-2） | 需改：`oneOf` 超预算由系统回落 `compact`（M-2） |
| 9 | 用法走 `Tools().inspect`，不配 `help` | 未覆盖：无取用法入口（D-3、D-4） | **不可承载**：内置 `help`＋默认开启的读帮助门（O-2） | **不可承载**：`help` 是保留元命令（M-2） |
| 10 | 子命令是内部结构，随 tool 持有、配置、授权 | 未覆盖（D-4） | 可直接承载（O-2） | 可直接承载（M-1） |
| 11 | 声明依赖的外部服务 | 需改：插件级 Cordis `inject`，不在定义里（D-6） | 未覆盖（O-7） | 未覆盖（M-1） |
| 12 | 声明附件存储，连同「有工具读得出」 | 需改：以挂载 `attachments` 为注册条件，无可读性判断（D-6） | 未覆盖（O-1、O-7） | 未覆盖：`media.outputs` 只报模态（M-1） |
| 13 | 执行环境＝绑定层＋设施，不降级 | 未覆盖：由装配的 `ctx.shell`/`ctx.fs` 决定（D-6） | 未覆盖：实现侧 mixin（O-7） | 需改：`environmentCapabilities` 只有设施名单，无绑定层（M-1） |
| 14 | 调用端模态 | 未覆盖（D-1） | 未覆盖（O-7） | 需改：`media.inputs` 在数据契约，实现切片拒收（M-1） |
| 15 | 结果端模态，可被转换件满足 | 需改：执行体内按路由模型拒绝、以错误返回（D-6） | 未覆盖（O-7） | 需改：`media.outputs` 在数据契约，实现切片拒收（M-1、M-2） |
| 16 | 能否后台＋自动转后台阈值；不声明＝不许 | 需改：调用参数＋插件配置，无阈值（D-7） | 可直接承载（O-4） | 需改：契约有 `supported`/`onLimit:detach`，实现只收 `unsupported`（M-1） |
| 17 | 依赖用抽象名字，只有必需 | 需改：服务名是抽象名，但与可选服务、现探混在插件里（D-6） | 未覆盖（O-7） | 需改：`requiredSkills` 指具体版本（M-1） |
| 18 | 可自带实现，直到完整 package | 需改（D-8） | 需改（O-7） | 需改（M-3） |
| 19 | 装不进或依赖不满足 → 同形替换件 | 需改：默认「不注册」，保持 schema 的做法由个别工具自写（D-6） | 未覆盖（O-7） | 需改：有 `unavailable` 状态，无「同形只换说明」（M-3） |
| 20 | 等待态不进定义 | 可直接承载（D-1） | 可直接承载（O-1） | 可直接承载（M-1） |
| 21 | 发帧不进定义，按收到的解析 | 可直接承载：定义无帧字段（但也无发帧原语）（D-1） | **不可承载**：类级声明，未声明即丢弃（O-5） | **不可承载**：`frames[]` 声明，无声明即无帧（M-1） |
| 22 | 卸载由每次返回声明 | 需改：由 spill 策略插件决定（D-1） | 需改：`artifact` 通道按次返回，无摘要＋卸载语义（O-1） | 未覆盖（M-1） |
| 23 | 常驻标记在引用条目上；不占槽位仍可经代理调用 | 需改：呈现按 agent 整体切换，受限即不可调（D-3） | 需改：`defer_loading` 写在工具实例上（O-3） | 未覆盖（M-1） |
| 24 | MCP：接入点 name 是身份，动作不是资产，与多命令同形 | 需改：每个 MCP 动作一个顶层名字（D-5） | 未覆盖：v0.1 未实现（O-7） | 未覆盖（M-1） |

「未覆盖」格读过的位置：DSH 读 `packages/core/tools/src/*`、`docs/tool-catalog.md` 全表、`mcp-client`、`tool-fs`；
omne-next 读 `agentic/tool/*` 全部模块、`omne_agent_toolkits/registry/*`、`sandbox/mixin.py`，并 grep 模态关键词；
minimal-runtime 读 `host.ts` 类型与校验、`work-data` 的 `Command`/`ToolDefinition`、`design.md` 全文。

## 当前结论

### 三源的工具定义都没有「外部服务」与「附件存储」两项定义级声明

PF-006 §5.3 六项可选声明的前两项，三源里都找不到放在工具定义上的字段。
DSH 有最接近的东西，但位置不同：依赖写在承载工具的 Cordis 插件上（`inject`），
缺了的默认后果是这个工具**不注册**（`read_image` 以挂载 `attachments` 为注册条件）。
DSH 也没有「附件存储要连同有工具读得出一起判」的检查。
omne-next 与 minimal-runtime 的定义里没有这两类名字；minimal-runtime 的 `media.outputs` 只报结果里有哪些模态，
存储归另一能力。

- 适用范围：三源在所列版本的工具定义层；不涉及各源在装配层、执行层是否另有实现。
- 代价与不适用：DSH 的插件级依赖有它的长处——Cordis 服务名本身就是抽象名，谁提供谁满足，而且依赖一消失插件就自动撤下，生命周期不用另写。它的代价是粒度：一个插件注册的全部工具共用一组依赖；依赖缺了就「不装」，与[同名替换件](../../design/product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)（rev 14）方向相反。
- 撞上这条事实会怎样：拿任一源当基线，前两项声明都得新增字段与解析逻辑；照搬 DSH 的插件级 `inject` 表达，缺依赖的工具会从动作空间消失，而不是作为可见但不可用的条目留在原位。
- 来源：D-6、O-1、O-7、M-1、P-1
- 最近核对：2026-09-23 / `c291e796`、`6263fed5`、`d79484d`

### DSH 的工具定义是进程内运行时对象，模型只看得到三个字段

`ToolDefinition` 继承 `ToolSchema{name, description, parameters}`，在同一个对象上带上必填的 `output{schema, render}`、
必填的 `execute` 闭包，以及 `timeoutMs`、`isConcurrencySafe`、`finalizeContent`、`presentCall/presentResult`。
投影给模型的只有前三个字段。定义与实现是同一个 JS 对象，不是可以脱离进程持久化的数据。

- 适用范围：`@deepseek-ai/dsh-tools@0.1.5-rc.2`。
- 代价与不适用：长处是管线完整——参数先校验，然后依次走审批、守卫、around 包装、结果改写、终局观察，执行与取消语义都写清楚了；输出 schema 强制执行，结果形状可验证。代价：「普通函数返回当字符串用」也得写一层 `output{schema:{type:'string'}, render}`；`ToolResult` 只有 `content/isError/meta`，放不下 §5.4 的「要卸载的原始结果」和「附件地址」；`timeoutMs` 只声明、不强制（上游已知局限）。
- 撞上这条事实会怎样：把 DSH 的 `ToolDefinition` 直接当数据契约，会撞上本项目「不把 Cordis 运行时对象当数据契约」的约束——`execute` 与 `render` 是函数，序列化不了。
- 来源：D-1、D-8
- 最近核对：2026-09-23 / `c291e796`

### DSH 把「不呈现」与「不可调用」绑在一起

受限（`restrict`）的工具在那个 scope 的视图里不存在，调用得 `UNKNOWN_TOOL`；上游推荐的渐进披露做法就是换一条
scoped restrict，「让呈现、查找与执行保持对齐」。PTC 模式倒是让工具经 `run_code` 间接可调，但切换按 agent 整体进行，
不能按工具，而且 SDK 声明仍逐个写进 system prompt。

- 适用范围：`dsh-tools` 注册表与 PTC 模式。
- 代价与不适用：长处是「模型看到的」与「真能执行的」永远一致，不会出现模型调了一个它不该知道的工具。代价：PF-006 [三层正交](../../design/product/PF-006-tools-and-skills/design.md#三层能做什么--怎么够得着--现在做不做得了)（rev 14）要求「不占槽位」的工具仍在动作空间、经代理可调，DSH 的呈现开关同时就是执行开关，承载这一条要在注册表外另立一层。
- 撞上这条事实会怎样：用 `restrict` 实现「非常驻」，`Tools().execute` 调这些工具会得 `UNKNOWN_TOOL`，这个结局不在六种收场里。
- 来源：D-3
- 最近核对：2026-09-23 / `c291e796`

### 三源的身份键都不是「类别＋name」，其中 minimal-runtime 与之方向相反

- DSH：一个没有类别维度的命名空间，按注册名解析；同层重名抛错，同名替代只在 agent scope 链上以遮蔽发生；
  MCP 工具的名字是 `mcp__<server>__<raw>`，名字不合法时追加 `(server, raw)` 身份的 SHA-256 前 12 位。
- omne-next：名字可被 `ToolConfig.name` 覆盖，toolset 会把名字改成 `{toolset}__{name}`；
  配置合并按「标识」Last-Write-Wins，没配 `name` 的条目，标识依次退到 `class_name`、`function`、`ref` 末段、对象 id。
- minimal-runtime：身份是 `DefinitionRef{ownerTenantId, definitionId}`＋`version`，`toolKey` 不是身份；
  manifest 冻结 `registrationId、Schema digest、generation` 等，调用只按原 manifest 解析，绝不按 `toolKey` 找当前实现。

三源都**没有**把 schema 哈希当身份：DSH 的哈希由身份派生，minimal-runtime 的 Schema digest 只是 manifest 上的绑定钉。

- 适用范围：三源所列版本的注册与合并逻辑。
- 代价与不适用：minimal-runtime 这套有它的长处——已准入的调用钉在原实现闭包上，替换不会改写执行中的调用，对执行中的替换是强保证。代价：身份里含所有者租户，平台、组织、租户三份天然是三个身份，「组织新建同类同名资产即替代 official」（PF-002 rev 10）在这个键上表达不出。DSH 与 omne-next 的前缀方案把「来源」编进名字，同一动作换一个来源，名字就变了。
- 撞上这条事实会怎样：沿用 DSH 的单一命名空间，一个普通工具与一个 MCP 前缀名或别类资产撞名时注册直接抛错，而 PF-002 要求「类别不同，名字撞了也不相干」；沿用 omne-next 的合并标识，两份 `name` 相同、`class_name` 不同却都没显式配 `name` 的条目，合并时不会互相替代，会同时装进去。
- 来源：D-2、D-5、O-6、M-1、M-3、P-2
- 最近核对：2026-09-23 / 三源所列版本

### omne-next 与 minimal-runtime 都给多命令工具配 `help`，与「用法走 `inspect`」方向相反

omne-next 的 `BaseMultiCommandTool` 由 `__init_subclass__` 自动注册 `help`；`register_command` 默认 `requires_help_ack=True`，
调用方不带 `i_have_read_command_help=True` 就回 `HOLD`。minimal-runtime 把 `help` 列为保留元命令，贡献里出现 `help` 即拒。
DSH 没有多命令框架，也没有取用法的入口。

两个框架也都支持 PF-006 的其他多命令要求。omne-next 的 `dispatch_mode` 让作者在 `flat`（只露命令名）与
`typed_union`（一次给出全部参数）之间按类选，正对「带多少归作者」；minimal-runtime 一个工具只占一个 manifest alias。
但 minimal-runtime 分支文档写明「`oneOf` 超出预算回落 `compact`」，由系统替作者降级；
它的实现也没有派生 `oneOf` 投影。

- 适用范围：`multi_command.py` @ `6263fed5`；`host.ts`/`design.md`/分支 `schema.md` @ `d79484d`。
- 代价与不适用：omne-next 的读帮助门有它的用处——保证模型读过用法才动手，把「猜着调」挡在执行之前。代价：每个命令第一次用多一趟往返，而且门控字段 `i_have_read_command_help`、`i_have_read_skill` 占用了参数名空间。ADR-C013（门控协议）文件头仍是 Proposed，ADR-C014（基类统一）是 Accepted。
- 撞上这条事实会怎样：[PF-006 §5.3](../../design/product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)（rev 14）只保留 `inspect` 一条取用法的路，理由是「多一个 help，就多一处会和 inspect 说得不一样的地方」；以这两个框架为基线，就得拆掉 `help` 或让它与 `inspect` 共用一份来源。
- 来源：O-2、M-2、D-4、P-1、P-3
- 最近核对：2026-09-23 / `6263fed5`、`d79484d`、`c291e796`

### DSH 没有多命令抽象，同族动作占多个槽位

DSH 的同族动作走两种做法。一种拆成多个顶层工具：`terminal_*` 六个、`job_*` 三个、`session_*` 五个。
另一种是单个工具用一个枚举字段选操作：`str_replace_editor` 的 `command`、`lsp` 的 `operation`；
它把所有命令的参数并进同一张 `properties`，各命令需要哪些参数只写在说明文字里。
PTC 的 `run_code` 是呈现传输，SDK 里每个工具仍是独立绑定，不是多命令。

- 适用范围：`c291e796` 发行的工具包（以生成目录为准）。
- 代价与不适用：扁平枚举的长处是不需要任何框架，参数校验也照常走 JSON Schema。代价：各命令的必填关系机器校验不了；一族动作拆成多个工具时，吃掉的正是 [PF-007 §5.4](../../design/product/PF-007-meta-capabilities/design.md#54-十三个槽位是预算的地板也是它的天花板意义)（rev 16）要守的槽位预算。
- 来源：D-4
- 最近核对：2026-09-23 / `c291e796`

### 「能否后台」只有 omne-next 在定义上声明，且默认方向与 PF-006 一致

omne-next 的 `ToolDetachability` 分四级全序 `NEVER < ON_DEMAND < AUTO < ALWAYS`。**未声明读作 `never`**，
原话是「silence means always attached」。`AUTO` 级必须给 `default_threshold_seconds`，
正对应 PF-006「前台跑多久自动转后台」。minimal-runtime 的数据契约有 `background.mode: supported | unsupported`
与 `foreground.onLimit: detach`，但字段必填、没有隐式默认，实现切片也只接受 `unsupported`。
DSH 没有定义级声明：能否后台看工具 schema 里有没有 `run_in_background` 参数，外加插件配置
`enableRunInBackground`（默认 true）；没有自动转后台阈值。

默认方向一并记下。PF-006 前五项「不声明＝不需要」、后台「不声明＝不许」，三源里的对应如下：
- omne-next：`detachability` 未声明读作 `never`；`allowed_callers` 未声明只许 `DIRECT`；`progress_profile` 未声明时发的帧被丢弃。三者都是「不声明＝不许」。
- DSH：`isConcurrencySafe` 未声明即独占，也是「不许」方向；其余声明不存在。
- minimal-runtime：`environmentCapabilities` 空数组即无要求，`media` 缺省即只有文本，属于「不需要」方向；`frames` 缺省即无帧，属于「不许」方向。

- 适用范围：`detachability.py` @ `6263fed5`；`work-data`/`host.ts` @ `d79484d`；DSH 生成目录与全仓 grep。
- 代价与不适用：omne-next 这套的额外代价是 `ON_DEMAND` 及以上必须给 `redrive_basis`（`IDEMPOTENT` / `EXTERNAL_HOST`），多出一项 PF-006 没要求的作者断言；它的进程内 fire-and-track 后台实现已在 0.8.0 弃用，现在只剩声明词汇，执行归 harness。DSH 的做法让模型逐次决定要不要后台，灵活，但作者没有地方声明「本工具不许后台」，只能不暴露那个参数。
- 来源：O-3、O-4、O-5、D-1、D-7、M-1、P-1
- 最近核对：2026-09-23 / 三源所列版本

### 两端模态与执行环境：minimal-runtime 的数据契约最接近，但它自己的实现切片不收

minimal-runtime 的 `work-data` `Command` 把两端模态都做成声明：`media.inputs[{param, kinds, formats?, maxBytes?}]`
管调用端，`media.outputs[{kinds}]` 管结果端。分支文档规定，模型读不了的结果模态改成「文本描述＋引用」，
与 PF-006 的转换件同向。执行环境是 `environmentCapabilities: string[]` 设施名单。但 `host.ts` 的贡献校验不允许
`media` 键（还有 `frames`、`foreground`），同一分支的契约与实现在这里分叉。
DSH 只在 `read_image` 的执行体里按路由模型的 `inputModalities` 拒绝，schema 不随路由变，以错误返回。
omne-next 在工具层未找到任何模态或环境声明。

- 适用范围：`d79484d` 的 `work-data` 与 `host.ts`；`c291e796` 的 `tool-fs`；`6263fed5` 的 `agentic/tool` 与 `omne_agent_toolkits`。
- 代价与不适用：`environmentCapabilities` 只有设施一维，没有 PF-006 §6.8 的「绑定在哪一层」；`requiredSkills` 指具体 `DefinitionVersion` 而不是抽象名字，一换版本依赖就失配。DSH 的执行期检查不需要任何声明、实现最简单；代价是换到不支持图像的模型后，工具仍在 schema 里，调了才失败，而且失败以错误到达，不是「不可用」收场。
- 来源：M-1、M-2、D-6、O-7、P-1
- 最近核对：2026-09-23 / 三源所列版本

### omne-next 与 minimal-runtime 都把帧声明进定义，与 PF-006「按收到的解析」方向相反

omne-next 用类级 `progress_profile` 声明工具会不会发帧、帧怎样累积；未声明的工具发帧，得到的是显式的 no-op 加一条警告。
minimal-runtime 契约用 `frames[{kind, payloadSchema, recordLevel, …}]` 声明，「无声明即无帧」。
DSH 的定义里没有帧字段，但 `ToolRunContext` 也没有发帧原语，只有 `deferContext` 与 `concludeTurn`。

- 适用范围：`progress.py` @ `6263fed5`（ADR-128 在 accepted 目录）；`work-data` @ `d79484d`；`index.ts` @ `c291e796`。
- 代价与不适用：声明先行的长处是消费端能提前准备渲染与存储级别（`recordLevel: critical|durable|transient`），审计也能核对声明的与实际发出的对不对得上。代价正是 [PF-006 发帧](../../design/product/PF-006-tools-and-skills/design.md#帧长什么样由一份协议约定不由工具定义声明)（rev 14）列出的那几样：定义里多一格；要在运行时核对声明与实际；「先吐日志、最后给汇总面板」这条路要预先声明才走得通。
- 撞上这条事实会怎样：沿用 omne-next 的做法，一个没声明 profile 的工具发出的帧会被丢弃、不报错，用户界面上看不到它的进度，而工具本身照常成功。
- 来源：O-5、M-1、D-1、P-1
- 最近核对：2026-09-23 / 三源所列版本

### 三源都有「定义带实现」的先例，但没有一源按「随资产携带完整 package」装载

- DSH：`execute` 是定义对象上的闭包；工具以 Cordis 插件 npm 包的形式预先装在部署里。
  `dsh-tool-cordis` 可以让模型在 `node:vm` 里挂进程内临时插件并注册新工具，但作者笔记写明它不落盘、重启即失、
  「bash-equivalent trust, not a security boundary」，而且不在任何发行树。
- omne-next：工具是 Python 类；`omne_agent_toolkits` 按模块路径 `importlib` 从同一环境导入，要求实现事先已装好。
- minimal-runtime：定义是数据，带 `implementationArtifact`、`providerId`、`providerProtocol` 引用；
  设计明写「装载可信实际制品，不能下载用户任意 JS」，handler 不得携带可绕门调用的裸 `execute`。

- 适用范围：三源所列版本。
- 代价与不适用：minimal-runtime 的做法把实现与定义解耦、把可执行的东西限定为受信制品，安全边界最清楚；代价是 [PF-002](../../design/product/PF-002-assets-settings-and-permissions/design.md#tool)（rev 10）「一直到自带一份完整的实现 package」里，用户或 agent 自带的包要么得先成为受信制品，要么走替换件。DSH 的临时插件证明进程内热挂可行，但它自己声明不是安全边界，不能在多租户下直接照用。omne-next 的 importlib 只能装运行环境里已经有的代码。
- 来源：D-8、O-7、M-3、P-2
- 最近核对：2026-09-23 / 三源所列版本

### 各源作为基线的外部代价

- **DSH**：MIT。`dsh-tools` peer 依赖九个 DSH 包；Cordis 是 vendored 的 `@deepseek-ai/cordis` 4.0.2，
  而本项目 D-025 接受的是 4.0.4，两版差异未读。
  同一 commit 内已有文档与代码的漂移：README 说 `ToolDefinition` 在 `types.ts`，实际在 `index.ts`；
  作者笔记说 cordis 工具是三件，生成目录列了七件。
- **omne-next**：Python。定义形状建在 LangChain `BaseTool`（`langchain-core 1.6.1`）与 Pydantic 上，
  注入依赖 LangGraph `ToolRuntime`（`langgraph 1.2.11`）。翻译成 TS 要重写形状本身，不是改语法；
  仓库根未找到 `LICENSE` 文件，许可本轮未确定。
- **minimal-runtime**：不在 main，是实验分支。依赖 `@deepseek-ai/cordis` 4.0.2 与八个 workspace 包，`host.ts` 3619 行。
  它的设计引用的是已退役谱系的候选契约：README/design 自述 Run 与 Inbound 的 record-only 片段以
  `owner_publication_required` 失败闭合，owner publication 仍是集成义务，catalog/冻结同步仍是发布 gap。
  终态身份不一致时，`host.ts` 只记一条诊断后返回、不结算。

- 适用范围：所列版本的清单文件与自述文档。
- 代价与不适用：本条讲的就是代价。三源各自的长处——DSH 管线完整，omne-next 的声明词汇与本项目产品方向最贴近，minimal-runtime 已按数据化与多租户写好——分列在上面各条。
- 来源：D-8、D-9、O-1、O-7、M-4、M-5
- 最近核对：2026-09-23 / 三源所列版本

## 对照中发现的产品正文张力（只报告，不改正文）

| 位置 | 张力 |
|---|---|
| [PF-007 §4 多命令范式](../../design/product/PF-007-meta-capabilities/design.md#多命令范式)（rev 16，`design.md:120`，另见 `233`、`625`、`641`）对 [PF-006 §5.3](../../design/product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)（rev 14，`design.md:395-400`、`956`） | PF-007 写「每扇门都自带一个 `help`」，十三扇门全是多命令工具；PF-006 写「不给多命令工具再配一个自己的 `help` 命令」。两处在现行 rev 里直接冲突 |
| [PF-006 §6.11](../../design/product/PF-006-tools-and-skills/design.md#它同时决定了换模型之后哪些工具还在)（rev 14，`design.md:886`）对 [§4 三层正交](../../design/product/PF-006-tools-and-skills/design.md#三层能做什么--怎么够得着--现在做不做得了)（`95-96`）与 [§6.3](../../design/product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)（`586-589`） | §6.11 说换模型后「动作空间可能变小」；§4 与 §6.3 说可用性不改变动作空间、不可用时动作空间不变 |
| [PF-006 §6.6](../../design/product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)（`679-680`）对 §5.3 六项声明表（`411`）；[PF-002 Tool](../../design/product/PF-002-assets-settings-and-permissions/design.md#tool)（rev 10，`133`）对 [PF-006 §6.8](../../design/product/PF-006-tools-and-skills/design.md#68-工具怎么提执行环境的要求) | 自动转后台阈值既列为定义里的声明，又说「多久是它的一项设置」，家在哪没说死；PF-002 把「目标环境」列为 Tool 的**设置**，PF-006 把执行环境**要求**列为定义声明，两者什么关系没写 |
| [PF-002 Tool](../../design/product/PF-002-assets-settings-and-permissions/design.md#tool)（`117-118`）与 UL-tool-definition 对 [PF-006 §5.3/§5.4](../../design/product/PF-006-tools-and-skills/design.md#54-返回值两种写法一种模型) | 定义被说成含「返回什么」，但 §5.3 没说返回形状在定义里要不要声明（例如作为可校验的 schema）；§5.4 只讲运行时两种返回写法 |
| [PF-002 MCP](../../design/product/PF-002-assets-settings-and-permissions/design.md#mcp)（`138-146`） | 只说 MCP 与「多命令 tool 与它的子命令」同形（持有、配置、授权随接入点）；一个接入点的动作占一个槽位还是各占一个、§5.3 的六项声明怎么落到对端给的动作上，产品正文没写 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| `@deepseek-ai/cordis` 4.0.2 → 4.0.4 对 `inject`/`Service`/scope 的影响 | 读 4.0.4 源码与 4.0.2 对比，或跑 D-025 的 probe | 以 DSH `dsh-tools` 为 fork 起点的任何提案 | D-025 的 probe 责任人 |
| minimal-runtime 工具参数实际走 Ajv 还是 DSH 子集校验 | 从 `host.ts` 的 `prepareProposalBatch` 追到参数校验调用 | 只影响把它当形状参考时的 schema 方言判断 | 本 topic 下一轮 |
| minimal-runtime「终态端口身份对不上」的原始记录 | 找派发者手里的原始出处；README/design 未见原句，只有 `host.ts:1299-1305` 的诊断路径 | 评估 minimal-runtime 执行链可否复用 | 派发者 |
| omne-next 许可 | 查组织层许可或仓库外声明 | Python→TS 翻译时能否逐行移植 | 产品负责人 |
| DSH 其余工具包是否另有定义级依赖或模态声明 | 逐个读 `packages/*/tool-*` 源码（本轮只读了 `tool-fs`、`mcp-client`，其余以生成目录为准） | 第 11–15 行 DSH 格 | 本 topic 下一轮 |
| omne-next 测试与 minimal-runtime 测试是否全绿 | 在各自环境跑相关测试 | 本轮所有行为观察都来自静态阅读 | 需要时再跑 |

## 采用与后续核对

尚无消费者。本程的 proposal「工具定义基线」出现后回来补链接。
三源任一换版本时，grep [evidence.md](evidence.md) 的版本 token 定位需要重核的记录，按[演进事件词](../README.md#演进事件词)记。

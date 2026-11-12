# Files 与 Shell 作者行为

## 范围与依据

本包按 #421 修订 6 的 C-TOOLS 实施输入实现 Files 与 Shell 根作者。产品含义归 [Meta Capability](../../../.meta_harness/design/product/meta-capabilities/design.md)。多命令作者与普通文本返回采用 [Tool 契约](../tool-contract/SPEC.md)，设施采用 [Execution 契约](../../execution/execution-environment-contract/SPEC.md)。本包负责参数、操作映射和结果文本。宿主授权、真实文件系统、PTY、持久化与 Cordis 装配由消费者提供。

## 结果与不变量

### 命令与参数

全部命令使用 declared 参数。实现、参数校验、公开 schema 与 help 使用同一张[命令表](src/commands.ts)。未知字段、重复 JSON 键、错误类型及不完整输入均不进入执行者。Files 的 open 与 Shell 的后台标志在本次交付中明确返回 unsupported，且不启动设施。

Files 与 Shell 用 `wrapped` 编码登记，对模型各是一个工具（D-94）。作者描述只写用途与固定事实，命令菜单由声明一侧加入。描述不含运维构造值，例如 shell 可执行文件或工作区根，所以发行清单能固定定义摘要。

- 每个工具的规则作为定义的 `guide` 登记。help 用 `name` 选一个命令，`name` 的取值限于命令名。help 的答复是首行 `done <工具> help[ <命令>]`，后接 tool-contract 的 `commandGuide`：带 `name` 时是该命令的完整 guide，不带时是工具的 guide。出错的调用读到的是同一段文本。命令没有名为 `command` 的字段，所以 `flat` 编码对这两个工具也成立。
- 参数无效时，命令编解码器只答原因，例如 `invalid-field:mode`。该命令的 guide 由工具宿主附上（D-104）。未知的 help 主题也由参数解析拒绝，不作为成功结果返回。执行表缺少某个命令是缺陷，抛出错误。
- Files 的 write 接受 `parents`：为真时先以 `mkdir {parents: true}` 建出缺失的父目录。目录已存在时设施答 `conflict`，写入照常进行，其他失败原样返回。它与 mkdir 走同一放置与授权检查。
- Shell 的 info 除平台事实外，写出一次性脚本的调用 `shell=[可执行文件, …参数前缀]` 与起始目录 `cwd`（D-96 的放置部分）。之后是收纳强度一行 `process_containment=<sealed|none|undeclared>`，取自命令设施的 `containment`，设施没有声明时写 `undeclared`，不写成 `sealed`。再之后是终端列表，然后是保留进程：每个保留进程一行 `retained_process=<引用> state=<running|stopping> processes=<数|unknown> origin=<原调用> handed_over_at=<ISO 8601 UTC>`。列表为空时写 `retained_processes=none`。环境没有命令保留扩展时写 `retained_processes=unavailable`；`list` 没有答 `done` 时写 `retained_processes=unavailable reason=<原因>`。读不到不写成 `none`。info 不写保留进程的上界：契约的 `list` 不带上界，满额时一次性执行的 `residue` 行写原因 `capacity`。
- Shell 的 guide 写明进程寿命的四条规则：一次性执行留在后台的进程（例如 `cmd &`）在调用返回后作为保留进程继续运行，info 列出它们，它们在自己退出、被显式停止或执行环境关闭其保留范围时结束，不能保留时被停止，`residue` 行写明原因；`run_in_background` 现在不支持，一次性执行一直等到主进程退出、输出安静；终端里的后台任务随终端存在，`close_session` 停止终端里的全部进程；要长期运行、不受本工具管理的服务交给宿主自己的服务管理器，那是命令自己的外部效果。guide 不说「会话结束时停止」：会话归档时谁封闭保留范围、现在接没接上，见 [harness-server 的 `releaseScope` 接线](../../../apps/harness-server/SPEC.md#releasescope-wiring)。

### 精确编辑与批次

edit 要求非空原文恰好出现一次。它读完整原字节，以 UTF-8 解码，在内存修改，然后以读取的 expectedVersion 替换。中文、BOM、CRLF 与无末尾换行的未编辑内容保持原样。非法 UTF-8 拒绝编辑。

patch 先读取全部目标并针对原文计算所有范围。重复或重叠范围、不同路径指向同一对象、缺失或多处匹配均拒绝，尚未提交任何目标。全部预检通过后只调用一次 commitBatch。多文件提交不保证同时可见。返回包含计划 diff、原批次身份与已确认发布路径。unknown 不表示全批落盘，也不触发自动重发。原批次恢复由宿主继续承担。

### 文件观察

list 使用 FileEntry.name，不解析对象令牌。任一条目缺少有效名称时，整个列表返回 unavailable，不补造名称、不静默丢条目、不交出部分列表。read、list 与 find 保留版本和分页事实。write 和 edit 转交设施返回的 writeEffect，区分创建、原位修改与替换为新对象；未报告时明确标为 unreported，不猜测效果。find 显式区分 name 与 content。info 返回 stat 确认的类型、大小与时间，并读取至多 min(4096,resultMaxBytes) 字节作为二进制样本。样本观察不证明整份文件是文本。版本变化时不把样本归到旧 stat。

### 文件路径解析

本节按 R2-D290 定。执行环境的 `FileRequest` 没有工作目录字段，所以由 Files 作者解析相对路径。

- Files 的构造值可带 `cwd`，即工作区根。它与 Shell 的 `cwd` 同源，由运维者层给出。`cwd` 必须是绝对路径，否则构造失败。
- 路径风格取 `cwd` 自己的写法：盘符或 UNC 开头按 Windows，`/` 开头按 POSIX。不取运行作者的进程平台。
- 有 `cwd` 时，相对路径在调用设施之前解析成绝对路径。`.` 就是 `cwd`。适用的路径有 `path`、`move` 与 `copy` 的 `target`、`patch` 每一项的 `path`。末尾的分隔符保留。
- 绝对路径不变。Windows 风格下带盘符的相对路径（如 `C:a`）也不变。
- 解析只换字符串，不授予访问。解析后越出工作区的路径照常交给设施，由宿主的守卫与设施按现有规则答复，例如 `notAuthorized`。作者不另加放行，也不另加拒绝。
- 结果文本的头部保留模型给的路径。解析改变了路径时，另带 `resolved_path`。
- 没有 `cwd` 时，相对路径原样交给设施。设施以 `invalidInput` 拒绝时，结果文本末尾加一行说明：需要绝对路径。
- 工具说明与参数说明写明：相对路径按工作区根解析。

限制：声称 `filesystem-root` 的落点要求相对授予根的路径，绝对路径答 `invalidInput`。这种落点上不配置 `cwd`，相对路径原样交给落点。

### Shell 路由与控制

没有 terminal 参数时，execute 调用 command.start，使用显式配置的可执行文件、参数前缀、初始 cwd 与 env。结局 `completed` 带处置报告时，结局行之后写一行：`residue=none`、`residue=retained process=<引用> processes=<数|unknown>`、`residue=stopping reason=<原因>` 或 `residue=unknown`。`stopping` 不写成已停，`unknown` 不写成 `none`。结局没有处置报告（终端段、不做处置的提供者、`failed`）时没有这一行。处置的含义归[执行环境契约的「一次性命令留下的进程」](../../execution/execution-environment-contract/SPEC.md#一次性命令留下的进程)。create_session 声明 Session 保留；带 terminal 的 execute 与 close_session 先由本次获取 attach，再调用对应设施。缺保留或附着能力时明确 unsupported，不创建替代终端，也不回退为一次性执行。terminal 的持续状态归提供者，作者不保存会话表。单次 cwd 与 env 覆盖只转发到本次调用。

terminal 的 completed 表示前台段结束，不证明持久 shell 退出或业务成功。各平台按同一哨兵规则归属字节，退出码按该平台 shell 的规则求得（Windows 的规则见 [host-local 的 Windows 终端](../../execution/execution-environment-host-local/SPEC.md#windows-终端未接受)）。help 说明 completed 的这一含义，未知退出码不显示为成功。

执行前已取消时不启动。启动后中断只请求当前 ProcessHandle.stop('forced')。未确认停止保留 unconfirmed。作者继续排空唯一输出读者并等待原终局。流或终局异常返回 unknown。停止未确认且提供者仍不终结时，作者可能继续等待，不能声称进程已结束。

### 文本上界

resultMaxBytes 必填，且是正安全整数。它限制作者返回字符串的 UTF-8 字节数，包括文本内的状态、元数据、diff 与截断标记。ToolResult 外层封装由 Tool 拥有。能容纳标记的预算保留首尾，并标出被省略的字节范围。过小预算只保留截断标记能放下的前缀，不能承诺完整帮助或完整状态文本。

Shell 为各输出流分别增量解码，连续块拆开的中文不会损坏。设施 observedOffset 的空洞与 discardedBytes 分别显示。终端段的结局带段间字节（`OutputSummary.between`，观察字节数大于 0）时，结局行另起一行写它的观察字节数与丢弃字节数，正文在段输出之前单列 `between_segments` 一节。段间字节是上一段结束之后终端收到的字节，不是本段脚本写的。工具自身的截断另有标记。文本窗口与空洞窗口使用有界内存，达到文本预算后仍继续读取输出。

## 所有权、失败与生命周期

环境门面只接受路径、字节与操作参数。每次请求的新 requestId、当前 access/origin/binding，以及授权对象 named 均由宿主填写。门面类型不授予权限。对象身份、句柄代与版本保留为观察事实。

设施的 done、rejected、unknown、unresolved 分别保留。done 只确认原请求的一项效果。输出失败、停止或 disposer 不回滚外部效果。文件句柄与终端的最终释放由原获取拥有者承担。根作者不缓存租约、权限或跨调用终端状态。

## 组合与验证

[成员测试](tests/README.md)通过公开根作者、真实 executeTool 与 createIndependentToolScope 运行。定向设施和 Execution 的内存/脚本替身只证明作者映射。取消时独立包装器不再交出返回值，因此停止文本另以真实作用域上下文核对。真实后端、跨获取 terminal 保留/附着、生产 Cordis 贡献及完整 ToolResult 交付仍由父线组合验证。

## TodoItems 作者

TodoItems 采用 [Session Todo 契约](../../session/session-contract/SPEC.md)的绑定业务投影。公开窄口与 JSON DTO 归 [todo-items-port.ts](src/todo-items-port.ts)。作者不依赖 Session 包，不持有身份、操作派生、授权或存储状态。宿主逐次核验访问，并将原调用身份绑定到业务方法。

- TodoItems 采用 wrapped 单声明，只有 help、add、remove、mark_complete、list。参数只含业务字段，未知字段拒绝。help 无需绑定。缺少绑定明确答 unavailable。
- add 保留原文，拒绝空白及超过 4096 UTF-8 字节的文本。list 的 limit 为 1..100，默认 50。after 只能是完整游标对象或 null，缺省读首页。Session 继续拥有游标修订、租户、资格与条目位置的验证。
- 构造值只有必填的 resultMaxBytes，必须为正安全整数。environment 为 null，仅有文本输入输出，不支持后台或 programmatic 返回。运维值不进入定义。
- 非 help 输出为完整 JSON，保留 receipt、item、page、next 和全部可达失败字段。recovered 描述原操作的结果，不证明当前条目状态。commit-unknown 保留原 operation，不证明未提交，不自动生成新的 add。
- 输出超过预算时返回完整 unavailable，并提示减小 list limit。它不表示 mutation 未提交。预算连失败文本都无法容纳时，输出校验明确失败。作者不截断 JSON 或游标，不保存超大结果缓存。UTF-8 解码使用 fatal 模式。
- 1 MiB 是部署初始预算。控制字符经过 JSON 转义会扩大字节数，所以该预算不保证容纳每一种合法的 100 项页面。
- attachTodoItems 复用传入的同一 context 对象，以 WeakMap 登记。必须在产生新 context 的 Tools 附着之后调用。finish 先清除 Todo，再委托原 finish，重复调用返回同一 Promise。清理失败仍不恢复访问，也不撤销已提交效果。

[Todo 作者测试](tests/todo-items.spec.ts)通过真实 commandArguments、参数解码、executeTool、输出校验和 codec 检查业务映射。Tools 组合使用真实 attachToolsCapability。绑定业务方法使用定向替身，未覆盖完整应用、SQL、真实 Agent 或自动 Runtime Context 投影。

## Ask 作者

Ask 是检查点作者，按 [Tool 契约](../tool-contract/SPEC.md)「恢复型执行者按段执行」分段执行。产品含义归 [Meta Capability 的 Ask](../../../.meta_harness/design/product/meta-capabilities/design.md)。卡片字段归 [HITL 协议](../../human-intervention/human-intervention/docs/protocol.md)的 Question 行，答复的解释归同一协议的「入口、来源与答复的解释」。命令表、参数校验、卡片、等待协议与检查点状态归 [ask-protocol.ts](src/ask-protocol.ts)。执行者归 [ask.ts](src/ask.ts)。

### 命令与参数

两条命令都用 declared 参数。未知字段、错误类型与不合规的文本都由参数编解码器拒绝，原因形如 `invalid-field:questions[0].title`。文本必须是合法的 Unicode，不能全是空白。长度按 Unicode 码点计数，文本上界与 HITL 的 Question 相同。问题数与选项数是 Ask 自己的界，比 HITL 的通用上界窄：一次打断问得太多，人答不过来；只有一个选项不算选择，自由作答与跳过由 HITL 保证。

- ask 一次带 1 到 7 个问题，每个问题成为一张 question 卡。问题有标题（至多 256）、描述（至多 4096）和 2 到 4 个文本选项。选项有 `label`（至多 256，同一问题内不能重复）与 `description`（至多 4096），可另带 `diagram`。
- 图解只辅助比较，不替代选项文本。HITL 的卡片没有图解字段，所以图解接在选项说明之后，中间空一行。两者合计至多 4096。
- request_approval 只请示一个动作，成为一张 approval 卡。参数是 `action`（动作及其对象，至多 256，作为卡片标题）、`reason`、`impact`、`reversibility` 与 `fallback`（各至多 1000）。卡片说明按这个顺序列出后四项。选项固定为 `approve`「同意」与 `reject`「不同意」，模型不能给选项。
- 卡片身份由位置决定。question 卡依次是 `q1`、`q2`……，选项依次是 `o1`、`o2`……。approval 卡是 `approval`。
- 每张卡带固定的 `declineConsequence`。question 卡是「跳过此题，不作答」。approval 卡是「不作准驳，这个动作不会执行」。
- 整批请求的 JSON 至多 192 KiB。HITL 登记命令的上界是 256 KiB，余量留给来源、显示上下文与信封。超过时原因是 `request-too-large`。

### 段

- initial 段再核一次参数，因为执行者不能假定调用方用了同一个编解码器。不合规时返回 `invalid`，不产生等待。
- 参数合规时，initial 段返回 suspended。`state` 是 UTF-8 JSON，记下命令与题目：卡片身份、标题、选项身份与标签。`wait` 是 Ask 等待，`key` 是命令名，`contract` 是 `askWaitContract`，`request` 是 `{questions: [卡片]}`，按出卡顺序排列。`closedResult` 是等待被控制关闭时的结果文字：ask 为 `No selection was made: the question was closed before the person answered.`，request_approval 为 `No approval was obtained: the request was closed before the person decided. Do not perform the action.`。叫停、归档、中断与插队在人作答之前解除等待时，模型读到的是这一句。
- initial 段不输出过程，也不等人。段上下文只有过程输出与取消信号。
- 等待协议的种类是 ask，`expiry` 是 `forbidden`。答复值是 `{answers}`，按卡片顺序，每项是 `selection`（`optionId`）、`text`（至多 8192）或 `no-answer`。全部跳过时 Tool 的决定是 no-answer，不带答复值。Tool 的决定协议另有 declined，同样不带答复值，本发行没有产出它的决策方。打断不产生决定，调用给出的是 `closedResult`。
- resume 段的输入是已提交的检查点与该等待的 ToolDecision。它不再等人：读回题目，把决定投影成结果文字，调用随之完成。检查点读不出时返回 `invalid`（`ask-state-unreadable`）；答复与题目对不上（卡片数、顺序、身份不同，或选中的选项不属于该题）时返回 `invalid`（`ask-response-mismatch`），不猜。投影归 [ask-result.ts](src/ask-result.ts)。
- 结果按卡片顺序每题一行，文本一律用 JSON 字符串字面量加引号：选中为 `Q1 <标题>: selected "<label>"`，自由作答为 `Q2 <标题>: the person wrote: "<文本>"`，跳过为 `Q3 <标题>: no answer (the person skipped this question)`。全部跳过为 `The person did not answer any question.`，declined 为 `The person declined to reply.`。request_approval 的结果是 `Approved: <action>`、`Not approved: <action>`、`No decision. The person wrote: "<文本>". This is not permission.` 或 `No decision: the person did not approve or reject. This is not permission.`。

### 给模型的文字

工具说明、命令摘要、用法指南与参数说明归 [ask.ts](src/ask.ts) 与 [ask-protocol.ts](src/ask-protocol.ts)。它们按产品正文 meta-ask 的「问题与请示的内容」「减少无效打断」写，要点是：只在被卡住、并且确属人来决定时才问；问题自包含并点名所问的对象；推荐项放第一位并在 label 末尾加 `(Recommended)`；不让模型加「其他」选项；跳过不是许可，只有明确的同意才许可动作。不提供多选与短标题，因为 HITL 的答复一次只选一个选项，卡片已有标题。

### 命令工具

`askToolModule` 的 `createAuthor` 给出 wrapped 编码的命令工具，命令只有 ask 与 request_approval。两条命令共用 `askExecutor`，都声明 `askWaitContract`，所以宿主按段运行它们。工具没有执行环境、附件与设置。运维者构造值只有必填的 `resultMaxBytes`：resume 段投影出的结果文本超过这个 UTF-8 字节数时，结果检查拒绝它。未知字段与缺字段都拒绝构造。

### 尚未完成

- help 命令尚未实现。

[Ask 作者测试](tests/ask.spec.ts)经公开入口运行参数编解码器、initial 段与命令工具的登记。请求与答复的形状用真实的 schema-provider 按等待协议声明的 JSON Schema 核对。测试不经过 Tool 账本、宿主或 HITL。

## W3 操作返回声明

具体作者行为保持各节责任。每条操作从其现有声明表生成返回结构、程序协议与正文格式，help/inspect 和注册定义共用该源。Tools 及各多命令工具保持 wrapped 编码，常驻/非常驻边界不变。

作者捕获或返回字符串的 resultMaxBytes 与 Tool 的模型正文内联上限分别生效。作者已经截断或设施已经丢弃的输出不能被 runtime 卸载补回。截断须继续如实说明；W3 不顺带重做 Shell 的捕获和后台机制。普通完整返回由 runtime 判断是否卸载，结构化作者可使用同调用 writer 提供完整正文和符合预算的摘要。

TodoItems 的业务分页仍由 Session 拥有。正文卸载不改 list 游标，也不让工具读取 Session 实例或要求模型提供身份。返回 schema 与失败分支必须包含实际可达结果，不能只描述成功值。

## Web 作者

Web 采用[元能力产品](../../../.meta_harness/design/product/meta-capabilities/design.md#meta-web)的 Web 规则。公开窄口 `WebAccess`、`WebFailure`、`SearchHit`、`FetchedPage` 与 `attachWebAccess` 归 [web-port.ts](src/web-port.ts)。作者不认识搜索供应商、HTTP 客户端、凭据或租户：它从每次调用附着的端口取结果，只负责参数、结果文本与失败文本。

- Web 采用 wrapped 单声明，只有 help、search、fetch。参数由 [web-protocol.ts](src/web-protocol.ts) 的命令表声明与校验；未知字段、空白 `query`、非正整数 `limit` 与空 `url` 都是参数错误，不进入端口。help 无需附着。缺少附着时 search 与 fetch 明确答 `unavailable`。
- 构造值只有必填的 `resultMaxBytes` 与 `maxSearchResults`，都是正安全整数。environment 为 null，只有文本输入输出，不支持后台。定义不随构造值变化，发行清单能固定它的摘要。
- search 不带 `limit` 时取 5 条与 `maxSearchResults` 的较小者；`limit` 超过 `maxSearchResults` 时按上限取。零条结果是成功，文本写 `results=0` 与 `no results`。有结果时每条写标题、`url=`、可选 `published=` 与摘录，整段放在外部数据标记 `[external data begins …]` 与 `[external data ends]` 之间。
- fetch 成功时首行写 `done Web fetch url=<最终网址> media_type=<媒体类型> truncated=<true|false>`，正文放在同一对外部数据标记之间。提供者按字节上限截断时 `truncated=true` 并多一行说明。
- 失败是一行 `<kind> reason=<原因>`，kind 是 `WebFailure` 的闭集：`unconfigured`、`denied`、`quota-exhausted`、`rate-limited`、`upstream`（带 `status=`）、`invalid-url`、`redirect-limit`、`timeout`、`too-large`、`not-text`（带 `media_type=`）、`network`、`unavailable`。`unconfigured` 的原因写明要配置 Web 的设置项 `exa.apiKey`。失败文本不带外部数据标记。
- 每次返回的文本由 `bounded()` 限制在 `resultMaxBytes` 以内，截断时保留首尾并写 `[tool truncated bytes …]` 标记；标记本身计入预算。
- `attachWebAccess` 复用传入的同一 context，以 WeakMap 登记，必须在产生新 context 的 Tools 附着之后调用。finish 先撤除访问，再委托原 finish，重复调用返回同一 Promise。
- Web 声明一项设置 `exa.apiKey`（路径 `['exa', 'apiKey']`，类别 `binding`，`sensitive: true`，schema 为非空字符串，没有默认值）。它的呈现写明这是 Exa 搜索的 API key、缺少时 search 不可用、清除后 search 不可用而 fetch 不受影响，采用时点 `next-read`。作者只声明，不读值：值的取用经 Tool 的凭据端口由宿主完成。

[Web 作者测试](tests/web.spec.ts)通过真实 commandArguments、参数解码、executeTool、输出校验与 codec 核对结果文本与失败行；`WebAccess` 是脚本化替身。它不证明网络、Exa 或凭据行为，这些归 [tool-host-local 的 Web 提供者](../tool-host-local/SPEC.md#web-提供者web-子路径)。

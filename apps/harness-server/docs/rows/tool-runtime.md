# Tool 运行时组、执行环境三行与 Tool 请求供给者

本页说明发行树里 Tool 的执行一侧怎样接线。它覆盖五个 Tool 行、执行环境的三行、两个入口对象，以及交给
`agent-host` 行的可信 Tool 请求供给者。系统责任归[应用装配](../../../../docs/architecture/runtime/application-assembly.md#插件树)。
工厂与参数的契约归 L-TOOL 的 [tool-host-local](../../../../packages/tool/tool-host-local/docs/cordis.md#阶段装配与换代)。
发行内置作者的来源与登记见[发行内置 Tool](tool-release.md)。本页依据 Reduce 裁定 R2-D14、R2-D36、R2-D66、
R2-D79、R2-D84 与 Tool B 段简报。

## 原调用资格查询

`tool-records` 在自己的 fiber 发布 `toolInvocationQualification`。Governance 按调用读取它，核对调用的原来源。这个查询复用实际 bundle 的来源、身份、记录仓及转发输入，不调用目标准入，也不执行工具。

目标准入可以调用此查询，不会再次进入目标准入。来源查询只返回原拥有者观察，不授予许可。行关闭后，保留的旧引用返回 unavailable；跨越关闭才完成的读取也不能交回成功。Tool 原来源的持久事实仍由 Tool 拥有，应用没有新增来源表。

## 一个 bundle，五行

`createLocalToolRuntimePlugins` 每次运行只调用一次。它返回 records、instanceHost、instances、environments、
executor、runtime 六个插件和 `authorExecution`。五行装同一个 bundle 的插件，各在自己的 fiber：

| 行 | 装什么 | 提供 | 静态 inject |
| --- | --- | --- | --- |
| `tool-records` | records 插件；在受信存储子树内建 SQL 记录仓、正文存储与带条件提交，以及 Ask 等待的决策方 | `toolCommands`、`toolReads`、`toolStartAuthority`、`toolStartFence`（同提供者组 `tool-start`）；受信原来源查询 `toolInvocationQualification` | `storage`、`tenantDomainLookup`、`tenantDomains`、`tenantDomainScannerPrincipal`、`telemetry` |
| `tool-runtime` | 门面插件 | `toolRuntime` | `toolCommands`、`toolReads` |
| `tool-executor` | 实例宿主装在行 fiber，长期执行宿主装在子 fiber。行体承载，业务阶段 | `toolInstanceHost` | `toolCommands`、`toolClock`（子 fiber 另 inject `toolInstanceHost`） |
| `tool-instances` | 实例目录 | `toolInstances` | `toolPublicationAuthority` |
| `tool-environments` | 环境适配；本行建执行域的 schema-provider，行撤除时关闭 | `toolEnvironments` | `executionEnvironment`（`caller: 'integrator'`） |

整组的运维者配置只在 `tool-records` 行，因为 bundle 建一次就要全部数值。字段见
[配置模块](../../src/rows/tool-runtime/config.ts)：`filesRoot`（与 `execution-host` 行相同）、
`combinationVersion`（与 `session-storage` 行相同）、
`configuration`（`ToolConfiguration` 的全部字段）、`capacity` 与观察者的三项上限。发行层的配置是空对象，缺任何一项
本行装载失败。同一次运行里换配置再建 bundle 也失败，不悄悄沿用旧配置。

其余四行等 `tool-records` 建好 bundle 再装。`tool-records` 不装时，它们停在装载中，进程不答就绪。

业务停止时，`tool-executor` 关闭 bundle：执行宿主退役，作者执行不再接新。期限内完成答 `settled`，超时答
`incomplete`。`tool-runtime` 不带关闭阶段，门面不持有在途工作。

正文校验的词汇采用和预算归[发行入口](../../src/entry/tool-body-schemas.ts)。当前仅接受
`tool-body-json-schema-static@1`的精确采用身份，使用schema-provider的静态JSON Schema子集；不表示支持所有JSON Schema构造。
入口采用provider示例的初始预算：32个快照、32层、256个构造节点、50ms失败退避、3次尝试。这些值不是测量所得的容量建议，快照数也不是编译内存的字节上限。
Tool固定每次调用的schema定义及正文解析限制，入口适配只给出验证结论，不改写正文或data。
正常业务停服先排空Tool执行，之后撤除记录行并关闭schema域。强制撤除不声明在途保管已完成；它撤销新校验入口，已有持久责任仍由原调用恢复机制承接。

Tool 记录仓的 `tool` 参加者与迁移并入会话存储组合，与会话日志同一事务域、同一次登记。组合版本因此从
`session-composite/2` 换到 `session-composite/3`。开发环境清存储根（R2-D98）。

## 生命周期观察

记录行和 `tool-body-sweep` 行都把确认的 Tool 提交投影到既有 telemetry 行。事件为 `omne.tool.material.lifecycle`，语义与限制见[应用规格](../../SPEC.md#tool-生命周期遥测)和[Tool 规格](../../../../packages/tool/tool/SPEC.md#生命周期提交观察)。业务恢复沿耐久事实，不依赖事件是否成功输出。

## bundle 的输入

每项输入只取已核来源，缺席时由窄代理答 `unavailable`：

- 记录仓、正文存储、带条件提交：逐次读 `tool-records` 行交来的 SQL 端口。
- 正文 schema：`tool-records` 行按入口预算创建独立的正文校验域，撤除时清空窄端口并关闭提供者。bundle每次检查现取端口，缺席返回unavailable。它不借用`tool-environments`的环境声明校验实例，也不把schema-provider或Cordis对象交给Tool领域。
- 资格：`authorization` 行已有的 `createToolAccessGuard`，底下是 identity 的参考准入核验。
- 控制主体投影：主体经 `principalVerifier` 核验，是会话工作主体才投影。其余答 `denied`。会话工作主体的判定只有
  [session-work.ts](../../src/rows/tool-runtime/session-work.ts) 一份，请求供给者用同一份：`kind` 是
  `acting-for-tenant`，签发组件是 `sessionWorkPrincipals`，工作拥有者是 `session`，租户可编码且与请求的租户相同。
- 会话工作主体重签：入口对象 `toolClock` 安装时，把入口自己的 `sessionWorkPrincipals` 受信读口交给共享状态。
  `tool-records` 的可见集合不变。
- 来源资格：调用方是本租户的会话工作主体，consumer 是 Agent 的动作位置（`@omne-harness/agent`，`action`）。
- 并发范围：每个 run 一个范围（[scope.ts](../../src/rows/tool-runtime/scope.ts)）。请求供给者用 `runToolScope`
  按租户与 consumer 的 owner、work 给出范围与授予证据；`grants` 用同一文件的 `runScopeGrants`，只认按调用的租户
  与 `scope.key` 重算后相符的授予。所以两个 run 互不排队，同一个 key 在别的租户下被拒绝。范围预算是 Agent 写入
  请求的 `toolConcurrency`。
- 启动许可需求：发行清单里的官方 Shell、Files，调用方是本租户的会话工作主体时不需要另取许可。其余答
  `unavailable`。
- 环境：只有宿主机落点。需求经执行域的 schema-provider 校验 environment 声明并取值。绑定的 origin 由调用与
  准备操作铸出。设施守卫与对象命名都核主体、origin 与文件根。守卫核请求里的每个路径：`cwd`、`path`、`move` 与
  `copy` 的 `target.path`、`commitBatch` 的每个 `entries[].path`。带了这些字段但值不是路径时答 `notAuthorized`。
  守卫判断时，一个路径两条都满足才在文件根内（R2-D374、R2-D376）：
  - 位置：不跟随任何链接，路径按段落在根下。这个判断就是 Windows 文件后端用的那一个（宿主提供者根入口的
    `hostSegmentsBelowRoot`）。Windows 上根的某段写法不同（8.3 短名与长名、大小写）时，按父目录下目录项的卷序号与
    文件索引比较。`\\?\`、`\\.\`、UNC、别的盘符（含 `subst`）与 `..` 不在根下。经根外的联接指进根内的路径也不在
    根下。
  - 对象：路径解析后的真实位置也在根的真实路径内。最近的存在者取系统给出的真实路径，再接上还不存在的段。
    `cwd` 解析到链接的目标，所以经根内的联接走出根的 `cwd` 被拒。文件路径的最后一段是链接时按链接所在的位置判断，
    对链接的操作由文件设施决定。查不了真实路径时按根外处理。

  判断只用于放行，请求里的路径不变。这是判断时的保证，见已知限制「判断与执行之间链接可以被改指」。
  冷获取的原清理答 `pending`，责任保留。

- 按调用的表：调用见证、origin 表与账本视图都按调用存。表项只随调用的终态 `settled` 释放：记录仓提交了
  `settled` 状态，或记录仓读到调用已是 `settled`（提交答 `unknown` 但实际已落盘时由之后的读补上），三张表删掉这个调用。
  取消与被拒绝启动的调用也以 `settled` 终局收场，所以同样释放。表的大小随在途调用数变化，不随累计调用数增长。

## 结果读回预算

[tool-read-budget.ts](../../src/entry/tool-read-budget.ts)拥有本发行的读回参数预算。Tool bundle 将同一值作为 `readResultArguments` 传入结果准备，Tools capability 将它作为 reader 的 `arguments`。运维者配置不重复声明此值，模型参数不能覆盖它。原工具调用的准入预算保持独立。

更新这个发行预算时，应用须保留尚未到期的旧引用可读性，或完成相应迁移，不能只验证新调用。该值是装配数据，不发布为 Cordis 服务，不增加依赖获取或撤除动作。

## 执行环境三行

| 行 | 装什么 |
| --- | --- |
| `execution-environment` | `ExecutionEnvironmentRegistry`，提供 `executionEnvironment`。授权、可信作用域绑定与恢复授权逐次从装载上下文现取 |
| `execution-files` | `files` 设施声明 |
| `execution-command` | `command` 设施声明，加 Shell 要的持久终端（`terminal`）设施声明。插件树没有单独的终端行，两个声明同生同灭 |

宿主提供者在 `execution-host` 工厂行，见[宿主文件工厂](execution-host.md)。

可信作用域绑定的 Scope 归属读 `session-ad03` 的 `sessionScopeLookup`（R2-D14）；它没答出时（冷启动后它对会话下一次提交之前的作用域答
unknown），读 `session-storage` 行的受信 `sessionScopeOwners`，再经受信 `sessionPrincipalBindings` 核对归属。两者都缺席时答 `unavailable`。

## 两个入口对象

- `toolClock`：`createLocalToolClock` 构成，与 bundle 用同一个实例，按运行的根共享。
- `toolPublicationAuthority`：实例发布的同步核验。执行的租户合法、实例与代次与句柄一致，而且记录仓读到过这个
  原调用的这次执行与这份来源证据，才答允许。其余答 `denied`。见证只在本进程内。

## 可信 Tool 请求供给者

[`releaseToolRequestsOf(ctx)`](../../src/entry/tool-requests.ts) 是 `agent-host` 行
`createAgentHostRow({ toolRequestsOf })` 要的形状：给一个上下文，返回 `describe` 与 `prepare` 两个面。它不是服务键，
不进配置。每次调用经 `ctx` 现取六个来源：

| 字段             | 来源                                                                                                                                                                                    | 缺席或不符                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 主体             | `principalVerifier` 核验，必须是这个租户的会话工作主体                                                                                                                                  | 核验器缺席答 `unavailable`；其余答 `denied`                                                                      |
| 定义与可用性     | `toolCatalog.inspect`；声明名就是工具名，多命令工具的命令用 `selectCommandText` 从生效参数选出；没点名已知命令的调用由 `describe` 答 `answered`，正文是原因加工具的 guide（R2-D399），`prepare` 对它答 `unavailable`；消费者是发行清单确认的文本消费者                                                                    | 目录缺席、不在发行清单、不是官方层、不可用都答 `unavailable`；`prepare` 时定义与 `describe` 不同答 `unavailable` |
| `requesterScope` | 会话快照 `contextScopes` 的最新一条，未结束；会话以 `coordinator` 调用方类读（Session 的 `readWork` 只接受 `coordinator` 与 `maintainer`；来源代 Agent 做 Tool 消费，属 `coordinator`） | 读不到、没有作用域、已结束都答 `unavailable`                                                                     |
| 作用域归属       | 入口对象 `executionScopeBinding`                                                                                                                                                        | 缺席或不明答 `unavailable`；未绑定或绑到别的租户答 `denied`                                                      |
| 设置采用         | 发行清单里这个作者的固定设置采用                                                                                                                                                        | 发行快照不可用答 `unavailable`                                                                                   |
| 元能力命令的可用性 | 本发行的元能力宿主（[meta-capabilities.ts](../../src/entry/meta-capabilities.ts)）：Ask 的 `ask` 要会话的 `humanInteraction`，`request_approval` 要 `requestApproval`。两个值是 Session 翻译好的协作投影，经 Runtime Context 的 `sessionInteractionBinding` 以 `coordinator` 读（[published-view.ts](../../src/rows/session-ad03/published-view.ts)），宿主不认识模式词。`request_approval` 另读权限一侧翻译好的询问处理（`sessionInquiryBinding` 的 `policy.onAsk`）：为 `deny`（权限模式 `never`）时会话不向人问批准，命令不可用；协作一侧已经关掉时不再读它。`describe` 与 `prepare` 各现读一次；其余工具与命令不读 | 值为 false 时调用不运行，`describe` 答 `answered`，正文是命令名与原因，`prepare` 答 `unavailable`；读不到答 `unavailable` |

其余字段固定：`workspace` 为 `null`，`resources` 为空，前台执行，不加请求级的并发与时限，`context` 是本供给者的采用。

## Ask 等待的决策方（Tool 与 HITL 的组合）

Tool 的检查点作者（发行里只有 Ask）暂停后，等待由 HITL 保管。组合承担者是 `src/rows/tool-hitl/` 的决策方，它实现
Tool 的 `ToolDecisionBridge`，Tool 运行时组的 bundle 经 `decisions` 输入逐次读它。没有新行，也没有新服务键：

- `tool-records` 行在受信存储子树里建 HITL 宿主（[host.ts](../../src/rows/tool-hitl/host.ts)）与决策方
  （[bridge.ts](../../src/rows/tool-hitl/bridge.ts)），交给按运行的共享状态（[holder.ts](../../src/rows/tool-hitl/holder.ts)），
  行撤除时关闭并收回。HITL 的应用按租户事务域建，与会话组合同一个事务域与组合。
- HITL 的参加者与 Session 的只读守卫 `session.run-live` 并入会话组合（[composite.ts](../../src/rows/session-storage/composite.ts)，
  组合版本当时升到 `session-composite/6`；Tool 记录仓加了待办标记表后为 `/7`），材料并入存储目录（[catalog.ts](../../src/rows/storage/catalog.ts)）。来源带会话与 Run 时，
  登记与答复在同一笔提交里核对会话未归档、该 Run 仍在进行。
- 入口对象 `toolClock` 交来 identity 的保留读口 `standingReservations`，以及只签决策方主体（组件 `toolDecisions`）的窄签发
  （[principals.ts](../../src/entry/principals.ts) 的 `toolDecisionsIssuerOf`）。
- `governance` 行的封口目的端按保留的拥有者与目的端分路：HITL 的保留（拥有者 `human-intervention`，目的端
  `harness.hitl`）交给 HITL 宿主，其余照旧。
- 检查点作者暂停时，段的状态与等待的请求原文由 Tool 账本保存；恢复时由 Tool 的推进协程把状态与答复交给绑定。本组装配不为它们另接端口。

ensure 从原调用的恢复读取里取等待的请求原文（`waitRequest`），核对它的规范摘要等于等待的请求证据的摘要，再从原调用取会话与
Run，最后做 HITL 的准备与登记。调用只保存最近一个等待的请求原文；原文不属于这个等待时答 `invalid`。两个 HITL 操作的身份都由 call + wait 派生，重送认回原结果。登记被原工作守卫拒绝时答 `conflict`：Tool 把它当确定的
拒绝，不换身份重试。inspectOperation 先在调用的等待待办里找到这个操作，再按待办的 `action` 认回原操作：

- `ensure`：重建同一登记，向 HITL 查原登记。committed 给出与 ensure 相同的证据。
- `invalidate`：以同一派生身份与待办的终局证据重建失效命令，向 HITL 查原失效。committed 给出与 invalidate 成功时相同的
  回执。

两种都是：HITL 已封口的操作答 excluded，其余答 unknown。认回只读，不写 HITL。

答复与恢复：

- inspect 重建登记命令并按原操作认回登记，再读请求。全部卡片都有决定时，决定证据是请求与全部 DecisionRef 的摘要，不含
  修订，所以接手改变修订之后 Tool 按原操作重送 acceptDecision 仍是同一输入。还有卡待答或已失效时答 null。
- resolve 核对证据仍是这批决定，然后在 HITL 接手：以 call + wait 派生的身份 `bindReceiver`（期望代次 `0`），逐卡
  `consumeDecision` 并以回执 `acknowledgeDelivery`，卡片的交接随之为 accepted。之后按登记的卡片顺序给出整批答复，答复值是
  json-text 的 JsonValue 树：至少一题有答复时为 answer，跳过的卡为 no-answer；全部跳过时为 no-answer。resolve 没有自己的
  操作身份，接手回包未知与 HITL 的拒绝都答 unavailable，Tool 不据此接受决定。
- invalidate 以派生身份调 `invalidateWait`。原因随等待的关闭原因：控制关闭的等待记 `cancelled`，原执行自己终局的记 `origin-terminal`。Tool 让暂停中的调用
  收场时写失效待办（Tool SPEC 第 32 条），推进协程经 invalidate 执行它：尚未答的卡变 `invalidated`，之后的答复得到卡片
  已失效；已答未接手的卡保持 `decided`。失效回包未知时，Tool 以同一操作调 inspectOperation 认回，不再发一次。
- 唤醒：宿主的每个租户应用经 `withDecided` 包一层，答复成为有效决定之后，[wake.ts](../../src/rows/tool-hitl/wake.ts) 读这张卡
  的来源，来源是 Tool 调用时请实例宿主 `schedule` 原调用。唤醒只是提示。等人的调用已经离开执行器的内存表，提示排入的
  那次运行按账本把它认回；提示丢了，执行器周期性再开的恢复扫描按待办标记找回它，所以丢了唤醒不丢事实
  （[等人的调用休眠](../../../../packages/tool/tool-host-local/SPEC.md#等人的调用休眠)）。

谁能读、谁能答不在这里定：读者与答复者由注入的受众函数（`holder.audience`）给出，发行注入 `hitlCardAudience`。HITL 的对外
入口在 `server-entry` 行（[hitl.ts](../../src/rows/server-entry/hitl.ts)）。还没有事务域的租户由宿主的 `qualify` 按 HITL local 的
同一条资格规则判断读者，再答空页或拒绝。

### 暂停内容与存储命令上限

Tool 把暂停调用的三样东西各用一笔提交写进调用域：等待的请求原文、检查点状态、答复。Tool 契约给了三者的上界（`WAIT_REQUEST_MAX_BYTES`、`CHECKPOINT_STATE_MAX_BYTES`、`WAIT_RESPONSE_MAX_BYTES`）。存储行的命令上限 `maxCommandBytes` 是运维值，两者的关系在配置边界核对（`src/rows/tool-runtime/suspension-bound.ts` 的 `checkSuspensionCommandBound`，与 `checkToolsReplyBudget` 同处调用）：`storage` 行与 `tool-records` 行都是发行导出时，`maxCommandBytes` 小于 `SUSPENSION_COMMAND_BYTES`（1048576）启动失败，退出码 2。这个数是三样里按存放形式算最大的那一个的两倍：请求原文是规范 JSON 文本，作为记录里的字符串至多两倍；状态是 base64 文本；另一半留给同一笔提交里的其余记录。有了这条关系，记录仓不会因为大小确定拒绝这三笔提交，所以账本没有为「暂停被记录仓拒绝」另设终局。用例在 `tests/rows/tool-runtime/suspension-bound.spec.ts` 与 `tests/local/operator-defaults.spec.ts`。

## 具名缺件与已知限制

- **consumer 指名的执行是否属于这个会话不核对**：来源资格只核主体与 consumer 的拥有者和用途。跨租户仍被拒。
- **设施依赖只核装配在场**：见[发行内置 Tool](tool-release.md#具名缺件与已知限制)。
- **文件根两行相等不核对**：`tool-records` 与 `execution-host` 的 `filesRoot` 不同时，命名与提供者打开的对象对不上，
  调用答冲突或不可用。
- **判断与执行之间链接可以被改指**：守卫的结论只在判断时成立。判断之后、命令启动或文件操作之前，工作区里的联接或
  符号链接可以被改指到根外。Shell 本身不是沙箱：同一会话的命令本来就能改动工作区里的链接，也能读写根外。隔离归 M2
  之后的 Shell 沙箱专题（R2-D337）。文件操作由文件后端在打开时逐段再核，不依赖守卫的结论。
- **多级链接两条判断都能通过**（R2-D378）：路径从根内出根、再经链接回到根内时，「位置在根内」与「对象在根内」两条判断
  都能通过。结果与加入这两条判断之前的基线一致，守卫没有因此放宽。
- **链接根不受支持**（R2-D378）：Windows 上经 `--operator` 直接把文件根配成联接或符号链接时，守卫放行，文件后端拒绝，以后端的
  拒绝为准，不会越出根。文件根要用真实路径配置，见 [Windows 文件后端](../../../../packages/execution/execution-environment-host-local/docs/windows-files.md)。
- **调用见证只在本进程**：进程重启后，先由记录仓读回再见证。见证不到就不发布实例。已结清的调用不见证。
- **结清后 origin 失效**：调用结清后，同一 origin 的设施请求与对象命名都不授权。调用一直不结清时，它的表项留到
  进程结束。契约不为未收场的调用设超时（Ask 无超时，名额与等待不因时间释放），这里也不自设超时回收。
- **bundle 每次运行只建一次**：实例宿主与执行宿主不能在同一次运行里重装，重装时成员抛出，行 `FAILED`。
- **冷获取的原清理不在本波**：答 `pending`，责任保留。
- **决策方答 unavailable 后同一进程只查原操作**：Tool 驱动在本进程记下回包不明的登记，之后只调 inspectOperation。登记在写
  HITL 之前就答了 unavailable（例如还没有受众）时，HITL 查不到原操作，本进程一直答 unknown，直到重启后再 ensure。
- **归档之后被取消的执行收不了尾**（切片 09 观察，交回 Session 与 Agent）：归档向 Agent 发取消，暂停中的 Ask 以
  `interrupted` 收场，卡片以 `cancelled` 关闭，名额释放。但会话已归档之后，Agent 的终结提交一直不被接受（F3 反复对账），
  执行不结束，Agent 宿主的执行槽不释放，这时停服的退出码为 5。归档在本发行里没有公开入口。叫停（`cancel-run`）不受影响：
  调用与卡片收场之后执行以 cancelled 结束，停服退出码为 0。
- **公开入口不能中断单个工具调用**：`stop-call` 对 Tool 目标一律答 `unsupported`（接入域的规则）。所以「只结束这次 Ask、
  Run 继续、模型读到 Ask 为等待被关闭预写的结果」这条路径在发行里走不到，由 Tool 与 Agent 的契约测试验证。
- **被取消的执行在调用收场之后还要收尾**：这段时间里停服，Agent 宿主把它记为未交接，退出码为 5。
- **Run 进行中受理的输入**（切片 13 独立验收发现，交回 Session）：Run 还没有结束时（包括 Ask 在等人时）向同一会话再送输入，
  输入被受理并进入会话历史，不会被当作卡片的答复。但这个 Run 之后不会结束：把 Run 进行中受理的输入交给本 Run 的那条链
  还没有建成。Session 成员没有实现「续入」（见 [session SPEC「实现现状」](../../../../packages/session/session/SPEC.md#实现现状)），
  Agent 运行时收输入的入口 `input.submit` 也只答不可用；而有未交入的输入时 Session 不让 Run 收场。Agent 每个对账间隔重试一次终结，每次写一批执行记录，不记告警。这时停服，Agent 宿主把执行记为
  未交接，退出码为 5。它与 Ask 无关，任何进行中的 Run 都一样；卡片等人只是让这段时间变长。

## 持续验证

- [决策方](../../tests/rows/tool-hitl/bridge.spec.ts)：两侧替身；登记的来源、受众与准备，证据不符或缺受众时不写 HITL，守卫拒绝读成 `conflict`，原操作查询的三种答复；inspect 的批次就绪与证据稳定，resolve 的接手、卡片顺序与 JsonValue 树，证据不符时不接手，invalidate 的派生身份；失效的认回按原失效操作查询，回执与 invalidate 相同，未提交答 excluded，登记的认回不受影响。
- [唤醒](../../tests/rows/tool-hitl/wake.spec.ts)：只有 decided 唤醒，只唤醒 Tool 来源，唤醒失败不改变答复的结果。
- [无事务域租户的资格](../../tests/rows/tool-hitl/host-qualify.spec.ts)：核验主体、租户一致与成员资格。
- [答复与恢复在发行树上](../../tests/rows/tool-hitl/release-reply.spec.ts)：从会话入口与待办池各答一次，三种答复在 question 与 approval 上的结果文字，两个入口并发只一方成立，CLI 的列卡、读卡与答复。
- [Ask 在发行树上出卡](../../tests/rows/tool-hitl/release-ask.spec.ts)：ask 与 request_approval 各一次，调用暂停、条目停泊，按会话与按池列出同一组卡；Run 在登记前结束时 `session.run-live` 拒绝登记，不出卡。共用支架在 [release-tree.ts](../../tests/support/release-tree.ts)。
- [等人时的隔离与一批两个 Ask](../../tests/rows/tool-hitl/release-isolation.spec.ts)：一个会话的 Ask 等人时另一个会话照常跑完；等人期间送进同一会话的输入不被当作答复，Ask 以卡片的答复恢复一次（之后 Run 不结束，见已知限制「Run 进行中受理的输入」）；模型一次给出两个 Ask 调用时两张卡都列出、两个调用都停泊，只答一张时模型读不到结果，两张都答了 Run 才结束，结果按调用次序排列。
- [等人时停服与重启后接续](../../tests/rows/tool-hitl/release-restart.spec.ts)：Ask 暂停、条目停泊时停服，Agent 把等待中的执行交接出去，停服退出码为 0。重启后 Session 的启动扫描按部署的租户枚举找回这个 Run，取得新的推进资格并请 Agent 恢复；人答复后调用恢复一次，Agent 在新挂接下收下结果，Run 结束，再次停服退出码为 0。另有两条：答复已在 HITL 成立而 Tool 在这一次服务里没看到，重启后接手一次；卡片登记没有落地就停服，重启后登记一次、只有一张卡。进程被强杀、来不及交接时不在此列（接管未实现）。
- [手测说明里的命令](../../tests/rows/tool-hitl/release-walkthrough.spec.ts)：照 [hitl-walkthrough.md](../hitl-walkthrough.md) 的次序用 `omne` 走一遍：两个入口列到同一张卡，读卡，选项与跳过两种答复，重复提交得到 `already-decided`，从诊断取 Run 的标识后 `cancel-run`，卡片进入失效列表，迟到的答复得到 `invalidated`。
- [回包丢失在发行树上](../../tests/rows/tool-hitl/release-cancel.spec.ts)：真实登记之后回包换成未知，Tool 经 inspectOperation 按原登记认回，不再登记，只有一张卡；答复之后调用恢复一次并收场，条目删除，Run 结束，停服退出码为 0。叫停与归档的发行树场景见上一节的已知限制。

- [请求供给者](../../tests/entry/tool-requests.spec.ts)：完整请求经 Tool 公开判定通过；核验器、目录、作用域绑定、
  会话作用域、发行快照任一缺席或不符时答 `unavailable` 或 `denied`；跨租户被拒。
  Ask 的两条命令按会话的人机交互各自判定：关闭时答原因、不运行，`prepare` 再判一次；读不到答 `unavailable`；其他工具不读它。
- [请求供给者读会话](../../tests/entry/tool-requests-session.spec.ts)：在真实 `session-provider` 行与真实存储上，
  供给者的会话读口以 `coordinator` 调用方类读到会话快照；`reader` 调用方类被 Session 拒绝（`denied readWork`）。
- [进程内组合](../../tests/rows/tool-runtime/composition.spec.ts)：真实 SQLite、真实五行与执行四行、真实入口对象，
  Shell 执行一次、Files 写读各一次，读回原结果，三次结果都交到原消费者；外租户的同一调用被拒。用发行的会话归属读口和会话
  工作主体，Shell 与 Files 同样执行（G-OWNERSHIP，R2-D192）。替身见文件头。加上 `tool-body-sweep` 行后，一次没人读的
  卸载 Shell 正文在期限到后由清扫回收：正文条目变 `reclaimed`，正文读口答 `not-found expired`，租户域里没有正文块、清单
  和到期行；命令自己写的文件仍在。
- [首装](../../tests/rows/tool-host/preload.spec.ts)：发行行装好后两个作者在 `toolBindings` 里 live；不首装时登记表为空；
  缺运维者构造值时不装，日志写明作者与原因；首装的 access 是登记者本身；读快照时抛出只记日志，不成为未处理的拒绝。
- [首装与常驻规划](../../tests/rows/tool-host/residents-preload.spec.ts)：首装成功时，create 用的采用规划器给出
  Files、Shell 两个常驻；首装失败或还没开始时答 `unavailable`。
- [来源资格](../../tests/rows/tool-runtime/access.spec.ts)、[发布核验](../../tests/entry/tool-publication-authority.spec.ts)、
  [文件根与路径守卫](../../tests/rows/tool-runtime/within-root.spec.ts)：外租户、别的签发组件、别的 consumer、
  没见证的发布、根外的 `target.path` 与 `entries[].path` 都被拒。
- [同一目录的不同写法](../../tests/rows/tool-runtime/path-alias.spec.ts)（Windows 真实文件系统）：根用短名时长名的子目录
  可作 `cwd` 与文件路径，反过来也一样，大小写不同也一样；根外目录的长名与短名、`..` 越界、根内指向根外的联接、
  根外指向根内的联接、`\\?\`、`\\.\`、UNC 与别的盘符都被拒；根是联接时，守卫以真实路径作根与以联接本身作根，对根本身与
  根下文件的判断都成立。这只说明守卫的判断。文件根要用真实路径配置，以联接本身作根时后端拒绝（见已知限制）。[进程内组合](../../tests/rows/tool-runtime/composition.spec.ts)的 Windows 用例用短名的文件根，以
  长名执行 Shell 与 Files；根外的 `cwd` 与根外指向根内的联接作 `cwd` 都答 `notAuthorized`，命令没有读到根外的字节。
  本机取不到与长名不同的短名时，这些用例跳过，不算通过。[本地 serve](../../tests/local/serve-local.spec.ts)：工作区
  是联接时，运维者层的文件根与 Shell、Files 的 `cwd` 是它的真实路径。
- 进程内组合的第二条用例：N 次调用结清后，见证、origin 表与账本视图都是空的。
- [按调用表的释放](../../tests/rows/tool-runtime/holder-release.spec.ts)：未结清的调用读多次仍留着；提交 `settled` 即释放；提交答 `unknown` 但已落盘，之后读到 `settled` 即释放；读到已结清的记录不再见证。
- [发行树](../../tests/serve.spec.ts)：发行树里这九行是真件，42 个真实行、6 个替身行。

这些用例不证明 Agent 推进、模型调用或 Session 日志里的 Tool 结果，那些由 SC4 与联调 C1 验收。

启动时的目标政策由 `admittedTargetAccess` 适配。它通过原 ToolLedgerStore 读取原 call，核对 tenant/call/request 后将原 admission 交给共享 target policy；首次来源准入则由 `withTargetAdmissionPolicy` 交入原 operation。两者共享政策，定位原 admission 的责任分开。没有原记录或来源不可用时，不拿启动操作补造准入。

## W3 正文保管的生产配置

本行的 holder 生成一份正文许可密钥与一个参与者时钟（`bodyPermitKey`、`bodyClock`）。Tool 账本与 `tool-body-sweep` 行共用它们。账本的正文存储是 `createSqlToolBodyStore`，与记录仓使用同一 `storage` 与租户目录。holder 的晚绑定代理（`lateBodyStore`）每次取得当前的正文存储，SQL 依赖未就绪时答 `unavailable`。

运维层必须显式给出 `offloading` 的全部字段，形状见 [config.ts](../../src/rows/tool-runtime/config.ts)。其中许可时长 W（`permitMs`）、时钟偏差 ε（`clockSkewMs`）与孤儿宽限期 G（`orphanGraceMs`）是部署参数。Tool 在构造账本时核 G 与最长保留毫秒数都大于 W + 2ε，不满足就拒绝启动。工具只能收紧正文和期限上限，模型参数不能覆盖这些值。示例值与验收值不冒充通用默认。

`tool-body-sweep` 行调度 Tool 的清扫（`createToolSweep`）。它每隔 `intervalMs` 走一步，每步为一个租户清扫最多 `limit` 个到期正文，一轮访问租户目录列出的每个租户。回收由 Tool 运行时执行：先删除正文字节，再在账本记录 `reclaimed`，见[清扫与回收](../../../../packages/tool/tool-contract/SPEC.md#清扫与回收)。清扫读同一参与者时钟。停止时不再开始新的一步，并等待在途的一步结束；超过期限时答 `incomplete`。定时器与 disposer 都不是回收授权，只有到期索引给出回收对象。

telemetry 只记录有界的阶段、数量、字节数、延迟与错误类别，不记录正文、程序 data、秘密或文件路径。admitted/dropped 不构成存储确认；观测关闭不得改变提交、交付或清理结果。

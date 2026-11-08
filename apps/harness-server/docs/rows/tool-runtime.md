# Tool 运行时组、执行环境三行与 Tool 请求供给者

本页说明发行树里 Tool 的执行一侧怎样接线。它覆盖五个 Tool 行、执行环境的三行、两个入口对象，以及交给
`agent-host` 行的可信 Tool 请求供给者。系统责任归[应用装配](../../../../docs/architecture/runtime/application-assembly.md#插件树)。
工厂与参数的契约归 L-TOOL 的 [tool-host-local](../../../../packages/tool/tool-host-local/docs/cordis.md#阶段装配与换代)。
发行内置作者的来源与登记见[发行内置 Tool](tool-release.md)。本页依据 Reduce 裁定 R2-D14、R2-D36、R2-D66、
R2-D79、R2-D84 与 Tool B 段简报。

## 一个 bundle，五行

`createLocalToolRuntimePlugins` 每次运行只调用一次。它返回 records、instanceHost、instances、environments、
executor、runtime 六个插件和 `authorExecution`。五行装同一个 bundle 的插件，各在自己的 fiber：

| 行                  | 装什么                                                             | 提供                                                                                           | 静态 inject                                                          |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `tool-records`      | records 插件；在受信存储子树内建 SQL 记录仓、输出保管与守护提交    | `toolCommands`、`toolReads`、`toolStartAuthority`、`toolStartFence`（同提供者组 `tool-start`） | `storage`、`tenantDomainLookup`、`telemetry` |
| `tool-runtime`      | 门面插件                                                           | `toolRuntime`                                                                                  | `toolCommands`、`toolReads`                                          |
| `tool-executor`     | 实例宿主装在行 fiber，长期执行宿主装在子 fiber。行体承载，业务阶段 | `toolInstanceHost`                                                                             | `toolCommands`、`toolClock`（子 fiber 另 inject `toolInstanceHost`） |
| `tool-instances`    | 实例目录                                                           | `toolInstances`                                                                                | `toolPublicationAuthority`                                           |
| `tool-environments` | 环境适配；本行建执行域的 schema-provider，行撤除时关闭             | `toolEnvironments`                                                                             | `executionEnvironment`（`caller: 'integrator'`）                     |

整组的运维者配置只在 `tool-records` 行，因为 bundle 建一次就要全部数值。字段见
[配置模块](../../src/rows/tool-runtime/config.ts)：`filesRoot`（与 `execution-host` 行相同）、
`combinationVersion`（与 `session-storage` 行相同）、`maxCommandBytes`（与 `storage` 行相同）、`maxChunkBytes`、
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

记录行和独立材料维护行都把确认的 Tool 提交投影到既有 telemetry 行。事件为 `omne.tool.material.lifecycle`，语义与限制见[应用规格](../../SPEC.md#tool-生命周期遥测)和[Tool 规格](../../../../packages/tool/tool/SPEC.md#生命周期提交观察)。业务恢复沿耐久事实，不依赖事件是否成功输出。

## bundle 的输入

每项输入只取已核来源，缺席时由窄代理答 `unavailable`：

- 记录仓、输出保管、守护提交：逐次读 `tool-records` 行交来的 SQL 端口。
- 正文 schema：`tool-records` 行按入口预算创建独立的正文校验域，撤除时清空窄端口并关闭提供者。bundle每次检查现取端口，缺席返回unavailable。它不借用`tool-environments`的环境声明校验实例，也不把schema-provider或Cordis对象交给Tool领域。
- 资格：`authorization` 行已有的 `createToolAccessGuard`，底下是 identity 的参考准入核验。
- 控制主体投影：主体经 `principalVerifier` 核验，是会话工作主体才投影。其余答 `denied`。会话工作主体的判定只有
  [session-work.ts](../../src/rows/tool-runtime/session-work.ts) 一份，请求供给者用同一份：`kind` 是
  `acting-for-tenant`，签发组件是 `sessionWorkPrincipals`，工作拥有者是 `session`，租户可编码且与请求的租户相同。
- 会话工作主体重签：入口对象 `toolClock` 安装时，把入口自己的 `sessionWorkPrincipals` 受信读口交给共享状态。
  `tool-records` 的可见集合不变。
- 来源资格：调用方是本租户的会话工作主体，consumer 是 Agent 的动作位置（`@omne-harness/agent`，`action`）。
- 并发作用域：发行唯一的作用域（[scope.ts](../../src/rows/tool-runtime/scope.ts)），授予核验器与请求供给者
  取同一个值。
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

| 行                      | 装什么                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `execution-environment` | `ExecutionEnvironmentRegistry`，提供 `executionEnvironment`。授权、可信作用域绑定与恢复授权逐次从装载上下文现取 |
| `execution-files`       | `files` 设施声明                                                                                                |
| `execution-command`     | `command` 设施声明，加 Shell 要的持久终端（`terminal`）设施声明。插件树没有单独的终端行，两个声明同生同灭       |

宿主提供者在 `execution-host` 工厂行，见[宿主文件工厂](execution-host.md)。

可信作用域绑定的 Scope 归属读 `session-ad03` 的 `sessionScopeLookup`（R2-D14），再经受信
`sessionPrincipalBindings` 核对归属。查找缺席时答 `unavailable`。

## 两个入口对象

- `toolClock`：`createLocalToolClock` 构成，与 bundle 用同一个实例，按运行的根共享。
- `toolPublicationAuthority`：实例发布的同步核验。执行的租户合法、实例与代次与句柄一致，而且记录仓读到过这个
  原调用的这次执行与这份来源证据，才答允许。其余答 `denied`。见证只在本进程内。

## 可信 Tool 请求供给者

[`releaseToolRequestsOf(ctx)`](../../src/entry/tool-requests.ts) 是 `agent-host` 行
`createAgentHostRow({ toolRequestsOf })` 要的形状：给一个上下文，返回 `describe` 与 `prepare` 两个面。它不是服务键，
不进配置。每次调用经 `ctx` 现取五个来源：

| 字段             | 来源                                                                                                                                                                                    | 缺席或不符                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 主体             | `principalVerifier` 核验，必须是这个租户的会话工作主体                                                                                                                                  | 核验器缺席答 `unavailable`；其余答 `denied`                                                                      |
| 定义与可用性     | `toolCatalog.inspect`；声明名就是工具名，多命令工具的命令用 `selectCommandText` 从生效参数选出；没点名已知命令的调用由 `describe` 答 `answered`，正文是原因加工具的 guide（R2-D399），`prepare` 对它答 `unavailable`；消费者是发行清单确认的文本消费者                                                                    | 目录缺席、不在发行清单、不是官方层、不可用都答 `unavailable`；`prepare` 时定义与 `describe` 不同答 `unavailable` |
| `requesterScope` | 会话快照 `contextScopes` 的最新一条，未结束；会话以 `coordinator` 调用方类读（Session 的 `readWork` 只接受 `coordinator` 与 `maintainer`；来源代 Agent 做 Tool 消费，属 `coordinator`） | 读不到、没有作用域、已结束都答 `unavailable`                                                                     |
| 作用域归属       | 入口对象 `executionScopeBinding`                                                                                                                                                        | 缺席或不明答 `unavailable`；未绑定或绑到别的租户答 `denied`                                                      |
| 设置采用         | 发行清单里这个作者的固定设置采用                                                                                                                                                        | 发行快照不可用答 `unavailable`                                                                                   |

其余字段固定：`workspace` 为 `null`，`resources` 为空，前台执行，不加请求级的并发与时限，`context` 是本供给者的采用。

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

## 持续验证

- [请求供给者](../../tests/entry/tool-requests.spec.ts)：完整请求经 Tool 公开判定通过；核验器、目录、作用域绑定、
  会话作用域、发行快照任一缺席或不符时答 `unavailable` 或 `denied`；跨租户被拒。
- [请求供给者读会话](../../tests/entry/tool-requests-session.spec.ts)：在真实 `session-provider` 行与真实存储上，
  供给者的会话读口以 `coordinator` 调用方类读到会话快照；`reader` 调用方类被 Session 拒绝（`denied readWork`）。
- [进程内组合](../../tests/rows/tool-runtime/composition.spec.ts)：真实 SQLite、真实五行与执行四行、真实入口对象，
  Shell 执行一次、Files 写读各一次，读回原结果，三次结果都交到原消费者；外租户的同一调用被拒。用发行的会话归属读口和会话
  工作主体，Shell 与 Files 同样执行（G-OWNERSHIP，R2-D192）。替身见文件头。
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

## W3 正文保管的生产配置

本节登记待实施的 W3 装配要求，不宣布当前发行已支持。实际 custody、正文读口与维护分面来自同一受信装配，维护驱动在长期宿主只安装一次。前台请求与清理共享资源时须有明确的扫描批量、并发及退避上限，不能随会话数量无限增加后台扫描。

运维层必须显式给出有限正值的正文内联字节数、最长保留毫秒数、页预算、页租约、正文及 JSON 校验上限、writer 缓冲和清理节奏。工具只能收紧正文和期限上限，模型参数不能覆盖这些值。缺失配置拒绝启用；示例值与验收值不冒充通用默认。

恢复按原材料、代次和操作认回，关闭与提供者缺席不丢清理待办。telemetry 只记录有界的阶段、数量、字节数、延迟与错误类别，不记录正文、程序 data、秘密或文件路径。admitted/dropped 不构成存储确认；观测关闭不得改变提交、交付或清理结果。

W3-A 的 bundle 将 Tool 材料保管实现与 SQL byte provider 组合，替代当前 content:null。holder 的晚绑定代理每次取得当前可用的提供者；撤除按本代条件执行，旧 disposer 不清除后继。已经进入的 IO 沿原 operation 结算或认回，不因依赖撤除假称已取消。保留原 adoption 的恢复路由，不能把旧引用交给另一个空仓。

材料时间独立采用 [host-local 的材料时间工厂](../../../../packages/tool/tool-host-local/SPEC.md#w3-材料时间源)，不直接使用既有 ToolClock.now 的墙钟。Tool 在原 call 域持久核水位，holder 重建不清掉它。维护子插件依赖就绪后启动有界扫描，fiber effect 关闭新扫描并排空或保留在途未知；再次就绪先扫原待办。定时器与 disposer 都不是删除授权，精确协议归 [M01–M05](../../../../packages/tool/tool-contract/docs/material-protocol.md)。

## 历史格式启动检查与显式升级

`tool-records` 静态依赖 `tenantDomains`、入口签发的 `tenantDomainScannerPrincipal`、`toolHistoryUpgraderPrincipal` 和 `systemActionAuthorization`。SQL、目录与这些依赖撤除时，本行随依赖撤除。启动检查结束且原依赖仍有效后，才创建共享 bundle 和发布服务。

运维者必须给 `history: {mode: "verify", interpretations: []}` 或显式 `upgrade`。本地默认层选择 verify。解释项为 `{tenant, call, values}`，tenant 使用 legal-identity 编码文本，call 使用 ToolCallId；同一地址不得重复。values 使用 Tool 的 HistoricalTextInterpretation，应用不猜编码或重新解释历史工具定义。

verify 分页检查所有历史调用，再独立检查 host 整个交付域。旧格式、未完结迁移、孤立或未知记录均拒绝启动，不写转换。upgrade 只在没有未完成计划且 preview 已就绪时创建新操作；已有计划继续使用原操作、源指纹和解释。清理完成后压缩宿主副本，再重新检查当前格式。每次尝试有 ledgerCommitAttempts 上限；结果未知时停止本次启动，重启沿已保存计划继续。abandoning 只接续放弃，不在同一次启动中改成重新转换。

升级前必须停止旧服务并排空旧写者。数据库锁不证明其他进程已停写。本行每次 SQL 请求前后及发布前核对原依赖。撤除不会撤销已经受理的写入，原 Tool journal 与 host 记录继续拥有其恢复责任。原生文件、程序消费副本和外部副作用不由升级启动行删除。

# Tool 运行时组、执行环境三行与 Tool 请求供给者

本页说明发行树里 Tool 的执行一侧怎样接线。它覆盖五个 Tool 行、执行环境的三行、两个入口对象，以及交给
`agent-host` 行的可信 Tool 请求供给者。系统责任归[应用装配](../../../../docs/architecture/runtime/application-assembly.md#插件树)。
工厂与参数的契约归 L-TOOL 的 [tool-host-local](../../../../packages/tool/tool-host-local/docs/cordis.md#阶段装配与换代)。
发行内置作者的来源与登记见[发行内置 Tool](tool-release.md)。本页依据 Reduce 裁定 R2-D14、R2-D36、R2-D66、
R2-D79、R2-D84 与 Tool B 段简报。

## 一个 bundle，五行

`createLocalToolRuntimePlugins` 每次运行只调用一次。它返回 records、instanceHost、instances、environments、
executor、runtime 六个插件和 `authorExecution`。五行装同一个 bundle 的插件，各在自己的 fiber：

| 行 | 装什么 | 提供 | 静态 inject |
| --- | --- | --- | --- |
| `tool-records` | records 插件；在受信存储子树内建 SQL 记录仓、输出保管与守护提交 | `toolCommands`、`toolReads`、`toolStartAuthority`、`toolStartFence`（同提供者组 `tool-start`） | `storage`、`tenantDomainLookup` |
| `tool-runtime` | 门面插件 | `toolRuntime` | `toolCommands`、`toolReads` |
| `tool-executor` | 实例宿主装在行 fiber，长期执行宿主装在子 fiber。行体承载，业务阶段 | `toolInstanceHost` | `toolCommands`、`toolClock`（子 fiber 另 inject `toolInstanceHost`） |
| `tool-instances` | 实例目录 | `toolInstances` | `toolPublicationAuthority` |
| `tool-environments` | 环境适配；本行建执行域的 schema-provider，行撤除时关闭 | `toolEnvironments` | `executionEnvironment`（`caller: 'integrator'`） |

整组的运维者配置只在 `tool-records` 行，因为 bundle 建一次就要全部数值。字段见
[配置模块](../../src/rows/tool-runtime/config.ts)：`filesRoot`（与 `execution-host` 行相同）、
`combinationVersion`（与 `session-storage` 行相同）、`maxCommandBytes`（与 `storage` 行相同）、`maxChunkBytes`、
`configuration`（`ToolConfiguration` 的全部字段）、`capacity` 与观察者的三项上限。发行层的配置是空对象，缺任何一项
本行装载失败。同一次运行里换配置再建 bundle 也失败，不悄悄沿用旧配置。

其余四行等 `tool-records` 建好 bundle 再装。`tool-records` 不装时，它们停在装载中，进程不答就绪。

业务停止时，`tool-executor` 关闭 bundle：执行宿主退役，作者执行不再接新。期限内完成答 `settled`，超时答
`incomplete`。`tool-runtime` 不带关闭阶段，门面不持有在途工作。

Tool 记录仓的 `tool` 参加者与迁移并入会话存储组合，与会话日志同一事务域、同一次登记。组合版本因此从
`session-composite/2` 换到 `session-composite/3`。开发环境清存储根（R2-D98）。

## bundle 的输入

每项输入只取已核来源，缺席时由窄代理答 `unavailable`：

- 记录仓、输出保管、守护提交：逐次读 `tool-records` 行交来的 SQL 端口。
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
  冷获取的原清理答 `pending`，责任保留。
- 按调用的表：调用见证、origin 表与账本视图都按调用存。记录仓提交了调用的 `settled` 状态后，三张表删掉这个调用。
  表的大小随在途调用数变化，不随累计调用数增长。

## 执行环境三行

| 行 | 装什么 |
| --- | --- |
| `execution-environment` | `ExecutionEnvironmentRegistry`，提供 `executionEnvironment`。授权、可信作用域绑定与恢复授权逐次从装载上下文现取 |
| `execution-files` | `files` 设施声明 |
| `execution-command` | `command` 设施声明，加 Shell 要的持久终端（`terminal`）设施声明。插件树没有单独的终端行，两个声明同生同灭 |

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

| 字段 | 来源 | 缺席或不符 |
| --- | --- | --- |
| 主体 | `principalVerifier` 核验，必须是这个租户的会话工作主体 | 核验器缺席答 `unavailable`；其余答 `denied` |
| 定义与可用性 | `toolCatalog.inspect`；模型看到的名字按 request-context 的声明规则拆成工具名与命令；消费者是发行清单确认的文本消费者 | 目录缺席、不在发行清单、不是官方层、不可用都答 `unavailable`；`prepare` 时定义与 `describe` 不同答 `unavailable` |
| `requesterScope` | 会话快照 `contextScopes` 的最新一条，未结束；会话以 `coordinator` 调用方类读（Session 的 `readWork` 只接受 `coordinator` 与 `maintainer`；来源代 Agent 做 Tool 消费，属 `coordinator`） | 读不到、没有作用域、已结束都答 `unavailable` |
| 作用域归属 | 入口对象 `executionScopeBinding` | 缺席或不明答 `unavailable`；未绑定或绑到别的租户答 `denied` |
| 设置采用 | 发行清单里这个作者的固定设置采用 | 发行快照不可用答 `unavailable` |

其余字段固定：`workspace` 为 `null`，`resources` 为空，前台执行，不加请求级的并发与时限，`context` 是本供给者的采用。

## 具名缺件与已知限制

- **consumer 指名的执行是否属于这个会话不核对**：来源资格只核主体与 consumer 的拥有者和用途。跨租户仍被拒。
- **设施依赖只核装配在场**：见[发行内置 Tool](tool-release.md#具名缺件与已知限制)。
- **文件根两行相等不核对**：`tool-records` 与 `execution-host` 的 `filesRoot` 不同时，命名与提供者打开的对象对不上，
  调用答冲突或不可用。
- **调用见证只在本进程**：进程重启后，先由记录仓读回再见证。见证不到就不发布实例。已结清的调用不见证。
- **结清后 origin 失效**：调用结清后，同一 origin 的设施请求与对象命名都不授权。调用一直不结清时，它的表项留到
  进程结束。
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
- 进程内组合的第二条用例：N 次调用结清后，见证、origin 表与账本视图都是空的。
- [发行树](../../tests/serve.spec.ts)：发行树里这九行是真件，42 个真实行、6 个替身行。

这些用例不证明 Agent 推进、模型调用或 Session 日志里的 Tool 结果，那些由 SC4 与联调 C1 验收。

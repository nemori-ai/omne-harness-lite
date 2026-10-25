# 应用装配：单机首条租户路径

本页拥有单机首条租户路径的应用装配责任：进程里装哪些成员、每个成员以插件树的哪一行进入、装配入口提供哪些运行时对象、替身与真件在哪里切换，以及只能由应用装配承担的桥接。首条租户路径是：外部调用者创建租户、登录、发出第一次请求，收到第一条 Agent 纯消息回复，再读到历史。工具宿主、执行环境宿主与工具调用不在这条路径上。

插件树的格式与层叠归 [IC-15、IC-16](../cordis-integration-conventions.md)；共同宿主与配置归 [Cordis 集成](runtime-contract-integration.md#配置与插件树)；采用协调与重装归[定义求值与装配交接](../../domains/assembly-and-handoff/README.md)。本页不发布可运行的插件树。每一行的插件由表中所列的成员或后继卡提供，未提供时该行写明缺口。

## 进程与装配入口

首条租户路径是一个单机进程。进程由一个私有应用成员承载，它是本页所说的应用装配。应用成员的名字和目录由实现卡用包模板生成，不由本页的叙述授予。

装配入口按下面的次序启动进程：

1. 读取发行层与运维者层，按行 id 层叠出最终插件树；指向不存在的行 id 时启动失败（IC-16）。
2. 用 `provide` 提供运行时对象（见[运行时对象](#运行时对象)）。运行时对象不进插件树。
3. 按插件树装载各行插件，插件经 `inject` 取得它需要的服务。
4. 全部必需行就绪后，服务端接入开始在会话位置与治理位置接收消息。

## 插件树

下表是发行层。行 id 是对运维者的稳定承诺；改名或删一行要写进应用成员的当前说明与发行说明。「现状」写本页写定时轨道上的事实。

| 行 id | 成员与插件 | 提供 | 依赖 | 配置（可序列化） | 现状 |
| --- | --- | --- | --- | --- | --- |
| `identity` | `@omne-harness/identity` 的提供者插件 | 注册激活、签发登录、识别登录；当前资格读口 `TenantStandingSource` | 运行时对象：主体权威、时钟、登录存储 | 登录期限与空闲期限 | 操作契约与 `./testing` 替身已入轨（#745）；持久提供者与插件由 M2 identity 提供者卡交付 |
| `authorization` | 应用成员自己的授权适配插件 | 供 Session 身份桥与 Model 访问核对使用的准入裁定 | `identity` 行；运行时对象：主体核验器 | 角色映射的选择 | authorization 只提供 `decideAdmission` 与 `AdmissionCheck`；适配插件归应用装配（[CP-15c D-06](https://github.com/nemori-ai/omne-harness-lite/issues/677#issuecomment-6392857872)） |
| `session-storage` | `@omne-harness/session-storage-sql` 的提供者插件 | `SessionTransactionPort` | 运行时对象：存储句柄；[事务域目录](#租户到事务域的目录) | 目录规则、存储路径 | 规格已入轨，源码为模板；真实存储随 #540、#280 |
| `session-bridges` | `@omne-harness/session-adapters` 的提供者插件 | Session 的身份桥、证据桥、Context 输入、`AgentDrivePort` 等端口 | `authorization`、`agent-host`、`request-context`、`runtime-context` 行 | 无 | 规格已入轨，源码为模板；随 Session 实现卡 |
| `session-provider` | `@omne-harness/session-cordis` 的插件 | `SessionService`（四个面），含协调器与调度器 | `session-storage`、`session-bridges` 行；运行时对象：`SessionInternalPrincipals`、时钟 | 历史页大小上界 | 服务键尚未定义（`session-cordis-contract` 为模板）；随 Session 实现卡 |
| `agent-host` | `@omne-harness/agent-host-local` 的宿主插件 | Agent 宿主与 Journal | `model-host`、`request-context` 行 | 无 | 宿主插件尚未实现；Journal 随 #502 |
| `agent-instances` | `@omne-harness/agent-cordis-contract` 的 `agentInstancesPlugin` | Agent 实例目录 | `agent-host` 行 | 无 | 插件已入轨 |
| `model-host` | `@omne-harness/model-host-local` 的宿主插件 | Model 运行时与凭据服务 | 运行时对象：凭据解析 | 供应商与凭据引用 | `LocalCredentialPlugin` 已入轨；其余宿主插件随 Model 后继卡 |
| `model-provider` | `@omne-harness/pi-ai-openai` 的适配 | OpenAI 兼容的发送 | `model-host` 行 | 端点与模型名 | 适配源码已入轨；插件行由 Model 后继卡登记 |
| `request-context` | `@omne-harness/request-context-cordis` 的插件 | `requestContext` | `model-host`、`session-provider` 行 | 压缩策略选择 | 契约与实现已入轨（#676）；插件随后继卡 |
| `runtime-context` | `@omne-harness/runtime-context-cordis` 的插件 | `runtimeContext` | 无 | 无 | 契约已入轨；插件随 #678 之后的后继卡 |
| `server-entry` | `@omne-harness/server-entry` 的插件 | 治理位置与会话位置的接入 | `identity`、`authorization`、`session-provider` 行；运行时对象：签发者 | 两个位置的承载地址 | 源码为模板；会话一组编解码随 #685，接入实现随 M2 卡 |

发行层不含 `tool-host`、`tool-instances` 与执行环境的行。首条租户路径的 Agent 定义不选入任何工具。

运维者层只替换配置、停用或插入行，不改发行层的行 id。首条租户路径预期的运维者配置是：两个位置的承载地址、存储路径、供应商端点与凭据引用、历史页大小上界、读历史的条目种类清单。

## 运行时对象

下列对象由装配入口 `provide`，不进插件树：

| 对象 | 使用者 | 要求 |
| --- | --- | --- |
| identity 的主体权威（签发者与核验器） | 签发者只给 `server-entry`；核验器给 `authorization` 与需要核验主体的行 | 签发者只交给装配授权的系统部件（[ID-16](../../../packages/identity/identity/SPEC.md#id-16-首批公开形状主体与资格事实)） |
| `SessionInternalPrincipals` | `session-provider` | 由应用装配的维护拥有者签发，Session 身份桥核实 |
| 时钟 | `identity`、`session-provider` | 不用系统时间补缺席的时钟 |
| 存储句柄 | `session-storage`、`identity` | 一个进程一份句柄集合 |
| 凭据解析 | `model-host` | 只交凭据引用，不交秘密副本 |

## 桥接责任

下列桥接只能由应用装配承担，因为它们连接两个互不依赖的成员：

| 桥接 | 输入 | 输出 | 失败时 |
| --- | --- | --- | --- |
| 授权适配 | 准入输入；identity 的核验器与 `TenantStandingSource` | `AdmissionDecision` | 读口或核验器不可答时是 `unavailable`，不改写成已知无权 |
| 签发者安装 | identity 的主体权威 | `server-entry` 持有的签发者 | 未安装时服务端接入对会话操作返回 `basis-unavailable` |
| 登录门的证据 | 首条普通输入的 `origin`（`owner` 为 `login-entry`） | 证据桥交给 `startRun` 的登录确认 | `origin` 不是登录入口证据时不给确认，Session 返回 `login-required` |
| 定义名映射 | 公开消息的定义名 | 定义候选、执行类型与入口契约的采用；`requiredIdentities`；租户默认设置的来源 | 定义名不在映射内时服务端接入返回 `invalid` |

登录门与定义名映射的公开一侧见[公开接入与宿主](runtime-contract-handoff.md#318-公开接入与宿主)。

## 租户到事务域的目录

存储只把事务域绑定当作不透明分区键的守卫，不枚举也不解释绑定。目录由应用装配配置：

- 目录是一条规则：默认事务域，加上可选的按租户覆盖。首条租户路径只用默认事务域，所以运行时新建的租户不需要改配置。
- 装配入口启动时，以及服务端接入第一次为某个租户组成 `Access` 时，按 identity 的租户事实核对该租户存在；不存在时不分配绑定。
- 扫描与恢复的维护者以系统作用域读目录，不用 `Access`。

## 替身与真件

切换在插件树的行上完成：同一行换一个插件或换一份配置。M1 首次联合验收（G1）不经插件树，由 CS 在进程内直接组合各成员的公开导出与 `./testing` 替身。

| 能力 | G1 | 首条租户路径的真件 | 切换的行 |
| --- | --- | --- | --- |
| 注册、登录与识别 | identity 的 `./testing` 替身（#745） | identity 持久提供者 | `identity` |
| 准入 | `decideAdmission` 与替身读口 | 授权适配插件与 identity 真实读口 | `authorization` |
| 会话操作 | 各契约成员的 `./testing` 替身 | Session 实现、存储与适配 | `session-storage`、`session-bridges`、`session-provider` |
| 模型调用 | model-contract 的脚本化提供者 | `pi-ai-openai` 经 `model-host` | `model-host`、`model-provider` |
| 公开接入 | public-contract 的纯函数与进程内环回 | `server-entry` 经 HTTP | `server-entry` |

替身只证明契约形状与判断次序，不证明持久性、跨进程主体来源或真实供应商行为。

## CS 的终位

CS 是私有验证应用 `apps/m2-contract-skeleton`，用于 M1 首次联合验收的 G1。它永久归联调线维护，只消费公开导出与 `./testing` 替身，不成为本页所说的应用装配，也不被别的成员依赖。当首条租户路径的应用成员经插件树完成同样的端到端验收（创建租户、登录、首次请求、纯消息回复、读历史）后，CS 按删除替代实现的政策退出。

## 后继实现的环境与证据入口

后继实现卡在派发前，须在卡上固定下列环境与证据入口：

| 后继 | 归属 | 环境 | 证据入口 |
| --- | --- | --- | --- |
| Session 实现、适配与 Cordis 服务键 | Session 实现卡 | 单进程，`session-storage` 行用 SQLite | Session 契约套件对真实提供者运行；插件树能打印出三行 Session 行 |
| Agent Journal 与宿主插件 | #502 | 同进程，`agent-host` 行 | Journal 提供者以（租户，execution）为键的跨租户拒绝用例 |
| SQL 存储契约 | #687 | SQLite，经配置可换 PostgreSQL | 存储契约套件 |
| 真实存储 | #540、#280 | SQLite Worker | 崩溃与查询未知的认回用例 |
| identity 持久提供者 | M2 identity 提供者卡 | 同进程，`identity` 行 | identity 操作契约套件对持久提供者运行 |
| 服务端接入与会话编解码 | #685 与 M2 接入卡 | HTTP 两个位置 | 公开契约的结果表逐行用例 |

## 不在本页

- reload 冻结判定与工具驻留桥接：[#753](https://github.com/nemori-ai/omne-harness-lite/issues/753)。
- 采用协调契约：[#688](https://github.com/nemori-ai/omne-harness-lite/issues/688)。
- 工具、执行环境与 MCP 的装配。

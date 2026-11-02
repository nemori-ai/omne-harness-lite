# Session 通用实现的构造入口

本页是本成员的公开边界：导出入口、谁可以调用、工厂的参数与返回值，以及失败行为在哪里定义。四个面的操作、端口接口与失败种类归[会话契约](../../session-contract/docs/public-api.md)，本页不另写它们的签名。机制行为归本成员的 [SPEC](../SPEC.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/session` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | [session-cordis](../../session-cordis/README.md)，以及不装配 Cordis 的独立宿主 |

本成员只有根入口，没有 `./cordis` 入口。根入口不导入 Cordis（[Cordis 说明](cordis.md)）。

### 现有导出

根入口 [src/index.ts](../src/index.ts) 有下列导出。[public-entry.spec.ts](../tests/public-entry.spec.ts) 断言运行时导出只有 `createSessionInstance` 与 `defaultSchedulingPolicy`。精确签名以源码为准，本页不保留第二套手写签名。导出的形状仍是候选，尚未技术接受。

| 导出 | 种类 | 源码 |
| --- | --- | --- |
| `createSessionInstance` | 函数 | [instance.ts](../src/instance.ts) |
| `SessionInstance`、`MaintenanceHandle` | 类型 | [instance.ts](../src/instance.ts)、[scan.ts](../src/scan.ts) |
| `SessionDependencies`、`Current`、`BeforeAdmitSlot` | 类型 | [dependencies.ts](../src/dependencies.ts) |
| `SchedulingPolicy`、`SessionConfiguration` | 类型 | [policy.ts](../src/policy.ts) |
| `defaultSchedulingPolicy` | 常量 | [policy.ts](../src/policy.ts) |

### 随实现进入的导出

本页原先列出的候选导出都已进入 `src/`，移到上表。

## 参数与依赖

工厂有两个参数。`SessionDependencies` 是外部注入的能力，`SessionConfiguration` 是静态配置。租户、会话、原操作身份与每次操作的输入仍是每次调用的参数，不从这两个参数推导（[资源与替换](../SPEC.md#资源与替换)）。

### 依赖

形状见 [dependencies.ts](../src/dependencies.ts)。成员类型取自 session-contract。租户类型取 `WorkSnapshot['tenant']`，与 session-contract 用同一个 legal-identity 类型。

依赖按契约的[端口表](../../session-contract/SPEC.md#构造依赖端口与出站端口)分成三类，缺席时的表现由契约规定：

| 类 | 字段 | 怎样传入 | 缺席或失败时 |
| --- | --- | --- | --- |
| 启动条件 | `accessCheck`、`transactions`（委派入口）、`workPrincipals`、`principals` | 直接传入实现与主体 | 任一缺席时不构造实例。经 Cordis 时服务停在 `PENDING`，见 [session-cordis](../../session-cordis/README.md) |
| 按命令必需 | `identity`、`evidence`、`clock`、`idle`、`context` | 传入完整接口。宿主在底层能力缺席时让方法返回 `unavailable`，`owner` 为该端口 | 只有需要它的操作返回 `unavailable`；不用系统时间或空材料补默认 |
| 按调用现取 | `directory`、`notifier`、`agentDrive`、`scopeRelease`、`admission` | 传入现取函数，每次调用前取一次 | `directory` 缺席时 `pending`、`references` 与 `releasedScopes` 返回 `unavailable`；通知缺席只记诊断；出站端口缺席时调用不发出，任务保留，由调度器重放；`admission` 取不到时 `accept` 返回 `unavailable`；只有装配声明没有命令域与 hooks 时才是空列表，`accept` 不经槽 |

公开面在面操作开头按 [当前操作访问裁定](../../session-contract/SPEC.md#当前操作的访问裁定) 检查一次，经委派视图读写，不缓存 allowed（[SPEC CP-01](../SPEC.md#cp-access)、[委派入口](../../session-contract/docs/access-check.md#委派入口)）。拒绝、不可用或抛错不继续执行。视图不再检查，存储只核租户键与绑定的裁定证据。`pending`、`references` 与 `releasedScopes` 不经视图，由公开事务端口检查一次。访问检查类型与独立脚本替身已由 [session-contract](../../session-contract/docs/access-check.md) 导出，Service 与键已由 [session-cordis-contract](../../session-cordis-contract/docs/public-api.md) 导出。事务 commit 的显式 access、工厂必需 accessCheck 与实际读写 check 已在 session-contract 与 session-adapters 的内存替身接入（见[访问检查](../../session-contract/docs/access-check.md)）。本成员在每次面操作开头调用一次 `check`，成员测试对内存替身对与真实 SQL 提供者对核对计次（[access.spec.ts](../tests/access.spec.ts)、[conformance-sql.spec.ts](../tests/conformance-sql.spec.ts)）。经 Cordis 的生产注入归 session-cordis，尚未接入。生产运行尚未验证。

协调器、调度器与恢复对已成立会话的每次面操作（提交命令与读取）都经 `workPrincipals.forSession` 取得该会话的主体。actor 的取值、失败处置与 `principals` 适用的两处系统维护见 [SPEC CP-01](../SPEC.md#cp-access)。两者都由应用装配签发，身份桥核实它们的可信来源，本成员不铸造主体。

`BeforeAdmitSlot` 的输入与输出取自 [EX-1](../SPEC.md#ex-1) 的表：输入是原提交、来源与会话当前值，输出是放行（可能已展开的内容与该槽的结论）或拦截（原因与留痕材料）。前一个槽放行的 `submission` 是后一个槽的输入。槽的结论与留痕以 `GuardCommand` 表示，作为参加者材料进入 `accept`，`participant` 为该槽的拥有者。槽的语义与公开入口归命令域与 hooks 的拥有者，尚未定义。定义之前 session-adapters 不登记槽，`admission` 取不到，`accept` 返回 `unavailable`；只有装配声明 `admission: 'none'` 时才返回空列表。本成员现在只接受空列表。槽列表取不到或不为空时，普通输入的 `accept` 返回 `unavailable`，`owner` 为 `sessionAdmission`。理由见 SPEC 的[实现现状](../SPEC.md#实现现状)。

### 配置

形状与初值见 [policy.ts](../src/policy.ts)。工厂用同一文件里的核对函数检查装配交来的配置。

每个字段的含义、覆盖的机制与初值归 SPEC 的 [SchedulingPolicy](../SPEC.md#schedulingpolicy) 表，本页不重复。`defaultSchedulingPolicy` 只是那张表的初值，装配可以整体或逐字段替换。替换只改变间隔、上限与退避，不改变任何命令的结局集合（[SR-3](../SPEC.md#sr-1)）。`preEvaluation.prewarm` 的类型是字面量 `false`：Agent 宿主创建实例的入口（[P-7](../../session-contract/SPEC.md#具名前提与明确缺项)）定义之前，配置无法打开预热。入口定义之后，这个字段改为 `boolean`。

### 工厂与实例

形状见 [instance.ts](../src/instance.ts)。`MaintenanceHandle` 在 [scan.ts](../src/scan.ts)。

| 成员 | 用途 | 依据 |
| --- | --- | --- |
| `facesFor` | 给一个调用方类返回四个面。面上的每个操作先核对调用方类在该操作允许的范围内，再走命令处理器。session-cordis 以 intercept 配置里的调用方类调用它；独立宿主为每类调用方各取一份 | [四个面与公开操作](../../session-contract/SPEC.md#四个面与公开操作)、[CP-01](../SPEC.md#cp-01) |
| `committed` | 把通知总线上的提交通知交给调度器。本实例自己的提交在本地直接唤醒，不依赖这个入口 | [S1](../SPEC.md#s1)、[S2](../SPEC.md#s2)、[C5](../SPEC.md#c5)、[EC-11](../../session-contract/SPEC.md#ec-11) |
| `changed` | 把来源拥有者的变化通知与作用域变更计数交给 S7 | [S7](../SPEC.md#s7) |
| `maintain` | 为一个租户启动恢复扫描者，并立即做一次启动扫描。释放句柄停止该租户的扫描 | [S3](../SPEC.md#s3) |
| `close` | 按 SPEC 的停止顺序停止实例 | [资源与替换](../SPEC.md#资源与替换) |

S5 与 S6 的计时、S2 的等待都经 `clock.waitUntil`，不用进程的系统时间。

## 行为与失败

工厂必须兑现会话契约的[运行契约](../../session-contract/SPEC.md#运行契约候选)与本成员 SPEC 的全部机制。下表只给失败行为的位置。

| 情形 | 表现 | 依据 |
| --- | --- | --- |
| 四个面的操作失败 | 返回契约的 `SessionFailure`。`commit-unknown` 原样交给调用方，不改写为成功或失败 | [四个面与公开操作](../../session-contract/SPEC.md#四个面与公开操作) |
| 调用方类不在操作允许的范围内 | 返回 `denied`，`action` 为该操作名。这项核对是一致性检查，不替代资格核对 | 契约 [VC-O05](../../session-contract/SPEC.md#候选的持续验证义务) |
| 配置不合法：负数、零上限、空退避序列或非有限数 | 工厂抛出错误并指出字段，不构造实例。经 Cordis 时，配置先由 session-cordis 用 Standard Schema 校验 | [SR-3](../SPEC.md#sr-1) |
| 共享事务域不成立 | 事务端口的读与提交返回 `unavailable`，`owner` 为存储参加者；`maintain` 返回同一失败，不启动该租户的协调与调度 | 契约 [P-1](../../session-contract/SPEC.md#具名前提与明确缺项) |
| 同一实例对同一租户第二次 `maintain` | 返回已有的句柄，不建第二个扫描者。跨进程的每租户一个扫描者由装配兑现 | [S3](../SPEC.md#s3) |
| `close` 之后的调用 | 四个面返回 `unavailable`，`owner` 为 `session`；`committed`、`changed` 被忽略 | [资源与替换](../SPEC.md#资源与替换) |

`close` 先停止调度器接受新的触发，再等在途命令跑完或返回未知，协调器在当前命令结束后停止，最后释放时钟等待与缓存。`close` 不回滚已提交的事实，不补发未发出的出站调用，不发通知，也不取消任何 Model、Tool、Agent 执行或子会话。依赖丢失不能报告为业务成功。

### 尚未闭合的输入

- 预求值请求：S7 对尚未提交的 `startRun` 命令调用证据桥 `SessionEvidenceBridge.prepare` 取得候选采用材料，按采用变更计数缓存（[构造依赖端口](../../session-contract/SPEC.md#身份桥证据桥与-context-输入)）。契约不为预求值另设出站端口；缓存不是采用依据，新 Run 入口经同一桥重新核对。
- 受理拓展点：`BeforeAdmitSlot` 的形状取自 SPEC 的 EX-1 表。命令域与 hooks 的公开入口定义之后，本形状随之修订。

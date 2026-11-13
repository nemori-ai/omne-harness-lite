# `session-access` 行

本页是 `session-access` 行的行规格。行的代码在 `src/rows/session-access/`。行用 `defineRow` 声明，没有关闭阶段。依据是 [RFC-0015](../../../../docs/rfcs/RFC-0015-access-dynamic-registration.md) 第 5、7、8 节，以及[装配页](../../../../docs/architecture/runtime/application-assembly.md)的 `session-access` 行。处理函数与帧来源的行为归 [`@omne-harness/session-access` 的 SPEC](../../../../packages/session/session-access/SPEC.md)。

## 这一行做什么

行装上会话的接入插件。插件把 `session/v1` 的贡献挂上 `server-entry` 行提供的 `accessRegistry`，新地址随即开放这个协议，可用性推一帧。不装这一行，`session/v1` 不开放（RFC-0015 I-15）。

| 项 | 内容 |
| --- | --- |
| 行 id 与实现 | `session-access`，`real` |
| 导出名 | `sessionAccessRow`（`src/rows/session-access/index.ts`） |
| 提供 | 无 |
| 必需（`inject`） | `accessRegistry`；`principalIssuer`（受信） |
| 按调用现取 | `session`（`caller: 'intake'` 取管理与工作面，`'reader'` 取历史面）；`sessionObservation`；`definitionMappings`（受信）；`identityOperations` |
| 阶段 | 无 |

清单与 `src/s0/stubs.ts` 的同一行相同。

## 依赖怎样接线

| 成员端口 | 来源 | 说明 |
| --- | --- | --- |
| `principals`（`TargetTenantPrincipals`） | 身份的 `createAccessIdentity` 的 `actFor`。行在加载时构造它，依赖是按调用读的 `identityOperations`、`identityGovernance` 与受信的 `principalIssuer`，和 `server-entry` 行构造入口那一份的做法相同 | `issued` 得到主体；`denied`、`basis-unavailable` 原样交回。身份端口只缓存一个系统主体，没有要两行共享的状态，所以两行各构造一份 |
| `facts`（`PrincipalFacts`） | 身份为登录签发的代租户主体 | 租户取主体的租户，账号取租户的账号，登录取主体的工作（`identity-login` 名下）。别的主体答「说不出」，处理函数答 `basis-unavailable` |
| `definitions` | 每次调用时 `ctx.get('definitionMappings')`，经 `definitionResolverOf` | 受信名，本行列在受信表里。服务不在树里时，「建会话」答 `basis-unavailable` |
| `prepareCreation` | `modesInitialization` | 与入口会话位置相同：把装配的模式初始化交给 Session |

## 配置

| 键 | 初值 | 说明 |
| --- | --- | --- |
| `defaultDefinition` | 无 | 不给定义名的「建会话」用它。缺席时这样的调用答 `invalid`。发行给 `coding` |
| `maxPageBytes` | 1048576 | 读历史首页 `pageBytes` 的上界 |
| `historyKinds` | 运维者层 `LOCAL_HISTORY_KINDS` | 读历史给出的条目种类 |

## 验证

`tests/rows/session-access/mount.spec.ts`：行的声明与桩表相同；慢层在发行树上装起这一行，可用性的快照里出现 `session/v1`，发行自己的登录不给定义名经新地址建会话，答 `succeeded`。

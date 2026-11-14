# @omne-harness/session-access 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `src/` 的公开定义。

## 范围与依据

本包是会话领域的接入插件：把 `session/v1`（[`@omne-harness/session-protocol`](../session-protocol/SPEC.md)）的贡献挂上接入的登记表。依据是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md) 第 5 节「领域的接入插件怎么写」、第 7 节「目标租户放在消息体里」与「派生标识用的文本不改」、第 8 节「会话观察」。处理函数从入口会话位置（`packages/access/server-entry/src/session.ts`）搬来，业务规则与结果的映射不变；`list-sessions` 是新加的，依据第 8 节「列出会话」，见 [SA-7](#sa-7)。

## 结果与不变量

<a id="sa-1"></a>**SA-1 主体。** 只有 `create-session` 用管道给的行事主体。另外七个操作（含 `list-sessions`）与观察 `observe-session` 在消息体里带目标租户，处理函数把登录与目标租户交给 `TargetTenantPrincipals.actingFor` 换主体。它答 `denied` 或 `basis-unavailable` 时，处理函数原样答出，不调会话；它抛出时答 `basis-unavailable`。

<a id="sa-2"></a>**SA-2 派生标识。** 会话标识、输入标识、三种操作身份与登录入口来源的派生和入口逐字节相同，派生文本 `session-public/1:session`、`session-public/1:input` 不改。派生要的租户、账号与登录由 `PrincipalFacts` 从主体读出；读不出时答 `basis-unavailable`。

<a id="sa-3"></a>**SA-3 定义名。** `create-session` 不给定义名时用配置的 `defaultDefinition`；没有配置时答 `invalid`。定义名不在部署映射里答 `invalid`；映射里的定义缺初始模型选择答 `basis-unavailable`。两种情况都不调会话。

<a id="sa-4"></a>**SA-4 结果的映射。** 会话失败按入口会话位置的表映射：`limited`（带资源与上限）、`denied`、`invalid`、`conflict`、`archived`、`frozen`、`unsupported` 原名；`commit-unknown` 答 `unknown`；其余答 `basis-unavailable`。映射出的结果不在该操作的契约结果集里时答 `basis-unavailable`。提交类调用在调用开始后抛出答 `unknown`，只读类抛出答 `basis-unavailable`。`send-input` 的映射结果是 `basis-unavailable` 或 `unknown` 时不交给调用，请求留在队列里再受理，见 [SA-8](#sa-8)。`stop-call` 对 Tool 目标只保留会话的 `denied` 与不可用，其余答 `unsupported`。

<a id="sa-5"></a>**SA-5 帧来源。** 会话观察 `open` 的 `opened`、`denied`、`unavailable` 对应 `succeeded`、`denied`、`basis-unavailable`。五种帧逐字段写成契约的帧。`refresh-exhausted` 原样结束。会话观察在信号中止之后结束而不带原因；这时观察中枢已经结束了这次观察，不再读原因，帧来源以 `unavailable` 结束。帧来源被关闭时关闭会话观察的帧。

<a id="sa-6"></a>**SA-6 现取。** 会话服务、会话观察、部署映射与会话目录在每次调用时现取。取不到时，需要它的调用答 `basis-unavailable`，协议不撤下（RFC-0015 I-5）。`send-input` 例外：会话服务取不到时请求在队列里等，见 [SA-8](#sa-8)。

<a id="sa-7"></a>**SA-7 列出会话。** `list-sessions` 的处理函数不碰会话的四个面，经本包自己声明的端口 `SessionListing` 列出：`list({ principal, tenant, after, limit, includeArchived })` 答 `{ ok: { items, next, completeness } }` 或 `{ refused: 'invalid' | 'denied' | 'basis-unavailable' }`。应用的装配把会话服务的会话目录面适配给它。成功体的 `sessions` 由 `items` 逐项逐字段写成，`next`、`completeness` 原样。`limit` 不给用配置的 `defaultListLimit`，大于 `maxListLimit` 答 `invalid`（默认都是 50，默认值不得大于上界，由装配的配置核对）；`includeArchived` 不给是 `false`；`cursor` 原样作 `after`。全化表，从上到下取第一个适用的格：

| 情形                                   | 答                               | 调端口 |
| -------------------------------------- | -------------------------------- | ------ |
| 身份答 `denied` 或 `basis-unavailable` | 原样                             | 否     |
| 身份抛出                               | `basis-unavailable`              | 否     |
| 端口此刻不在                           | `basis-unavailable`              | 否     |
| `limit` 大于 `maxListLimit`            | `invalid`                        | 否     |
| 端口抛出                               | `basis-unavailable`              | 是     |
| 端口拒绝 `invalid`（`cursor` 不合法）  | `invalid`                        | 是     |
| 端口拒绝 `denied`                      | `denied`，和会话不存在看不出区别 | 是     |
| 端口拒绝 `basis-unavailable`           | `basis-unavailable`              | 是     |
| 端口给出一页                           | `succeeded`                      | 是     |

端口只读，不提交，所以抛出是 `basis-unavailable`，不是 `unknown`。

<a id="sa-8"></a>**SA-8 发消息经请求队列。** `send-input` 不直接调会话。请求先进它所在会话的队列，排空者受理之后调用才作答。队列是什么、它的全化表与不变式归包组的[请求队列](../SPEC.md#请求队列)；本条写这个包怎样做。

`send-input` 的处理函数按这个次序走，取第一个适用的格：

| 情形                                                       | 答                                              | 入队 |
| ---------------------------------------------------------- | ----------------------------------------------- | ---- |
| 消息解不出来，或者不是用户消息                             | `protocol-rejected`                             | 否   |
| 身份答 `denied` 或 `basis-unavailable`，或者抛出           | 同 SA-1                                         | 否   |
| 主体读不出登录                                             | `basis-unavailable`                             | 否   |
| 本会话的队列里已有同标识的请求，内容相同                   | 等那一条的结局，答同一个答复                    | 否   |
| 本会话的队列里已有同标识的请求，内容不同                   | `conflict`                                      | 否   |
| 本会话的队列已满（配置的 `requestQueueLimit`）             | `limited`，资源 `pending-inputs`，上限是这个值  | 否   |
| 日志文件写不进去                                           | `basis-unavailable`，不留半条                   | 否   |
| 其余                                                       | 等这条请求的结局                                | 是   |

入队的记录落盘之后，排空者才会取它。排空者每个会话一条车道，同一时刻一个会话至多一次受理在途。它在这几个时刻取队头：一条请求入队之后，上一条离开之后，退避到点之后，插件装上时队列里已有请求。没有定时轮询。

受理一条请求：用队列里存的租户与登录调 `TargetTenantPrincipals.resume` 换主体，取此刻的会话面，调会话的 `accept`，结果按 SA-4 映射。`resume` 只由排空者调用，入参只来自队列。

| 受理的答复                                                   | 排空者做什么                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| `succeeded`、`invalid`、`archived`、`frozen`、`limited`、`conflict`、`denied` | 记下这条请求离开队列，把答复交给等着的调用，接着取下一条       |
| `basis-unavailable`、`unknown`，或者受理抛出                 | 请求留在队头。等一个退避间隔，用同一个标识再受理               |

`basis-unavailable` 包括：`resume` 答它或者抛出，会话此刻不在树上，会话答 `unavailable` 或 `quarantined`，会话的失败不在 `send-input` 的契约结果集里。退避的间隔取配置的 `requestRetryDelaysMs`，依次用，用到最后一个就一直用最后一个。有请求离开队头之后从头算。

记「离开」失败时，答复照样交给调用。这条请求留在文件里，下次装上时再受理一次，由会话认回。

`query-send-input` 先换主体，被拒就原样答。请求在队列里答 `unknown`，会话此刻不在树上时也一样。请求不在队列里，问会话的 `queryOperation`，映射不变。

调用被中止时处理函数不作答，由入口答 `unknown`。请求留在队列里，照常受理。

## 所有权、失败与生命周期

插件只依赖登记表。挂上随插件的作用域，插件卸载即撤下。会话按调用方类读：管理与工作面用 `intake`，历史面与会话目录面用 `reader`，前者与入口会话位置相同。观察的订阅与计时归会话观察，取消归观察中枢。

插件持有的状态只有请求队列。装配经 `journal` 给插件一个打开了的 `RequestJournal`，插件用它建排空者。插件卸载时停排空，再关日志：不再取队头，退避的计时全部取消，在途的那一次受理不取消。还在等的调用由入口照中止的规矩作答。队列里的请求留在日志里，下次装上时接着受理。

本包自带 `RequestJournal` 的文件实现 `openRequestJournal(file)`：

- 记录两种，一行一条 JSON：入队（租户、会话、请求标识、输入标识、消息的 JSON 文本、登录、序号）与离开（租户、会话、请求标识）。写进文件的只有这些点名的字段。
- 打开时读整份文件，重放成还在队列里的请求。最后一行不完整就丢掉这一行。重放后把文件重写成只含还在队列里的请求：写临时文件，落盘，改名。文件只在打开时收缩，运行当中只增长。
- 追加一行并落盘之后才算成。同时到的几条合成一次落盘，先后不变。
- 追加失败时答不成，并把文件截回这次追加之前的长度。截不回去时日志不再接受追加。
- 关闭时等在途的追加落盘。关闭开始之后的追加答不成。

## 组合与验证

| 条款 | 用例                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SA-1 | `tests/operations.spec.ts` 各操作「another account」「identity refuses」；`tests/observe-session.spec.ts`                                                                                               |
| SA-2 | `tests/derivation.spec.ts`（与入口的函数比字节）；`tests/operations.spec.ts` 的派生断言                                                                                                                 |
| SA-3 | `tests/operations.spec.ts`「create-session」                                                                                                                                                            |
| SA-4 | `tests/operations.spec.ts` 各「maps the Session failure」                                                                                                                                               |
| SA-5 | `tests/observe-session.spec.ts`；`tests/frames.spec-d.ts`（帧种类与结束原因的集合相同）                                                                                                                 |
| SA-6 | `tests/operations.spec.ts`「not on the tree」；`tests/cordis-entry.spec.ts`（真实 Cordis 上的调用方类与卸载会话）                                                                                       |
| SA-7 | `tests/operations.spec.ts`「list-sessions」；`tests/cordis-entry.spec.ts`（挂上的三栏、会话目录按 `reader` 现取）；应用里的适配与配置在 `apps/harness-server/tests/rows/session-access/listing.spec.ts` |

| SA-8 | `tests/request-queue.spec.ts`（全化表的判定）；`tests/request-journal.spec.ts`（真实文件上的日志）；`tests/request-drain.spec.ts`（车道、退避、停）；`tests/send-input-queue.spec.ts`（处理函数经队列到会话替身）；`tests/cordis-entry.spec.ts`（真实 Cordis 上的装上与卸载）；应用里的配置与出厂值在 `apps/harness-server/tests/rows/session-access/listing.spec.ts` 与 `apps/harness-server/tests/local/operator-defaults.spec.ts` |

用例里的会话是替身（`tests/fixtures/session-double.ts`，抄自入口的用例），身份的两个端口也是替身。除 `tests/request-journal.spec.ts` 与 `tests/send-input-queue.spec.ts` 的一条用例用真实文件之外，日志是内存替身（`tests/fixtures/journal-double.ts`）。端到端（真登录、建会话、发输入）在应用的行用例与集成之后跑。

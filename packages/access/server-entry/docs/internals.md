# 服务端接入内部设计

行为以[成员行为规格](../SPEC.md)为准。结果含义以公开契约为准。承载以公开契约的[承载绑定](../../public-contract/docs/http-binding.md)为准。本页写实现怎样组织，不另写规则。

## 接缝

接入把字节读成公开消息，再把已通过协议检查的请求交给 identity 的公开入口与 Session 的面。它不持有登录表，也不把存储对象放进响应。

公开契约不依赖本成员。本成员向邻居声明自己需要的端口，不认识它们的实现：

| 端口                                    | 文件                 | 说明                                                                                                                                                                                                    |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdentityOperations`、`PrincipalIssuer` | identity 的公开类型  | 注册激活、签发登录、识别登录；签发本成员的系统主体与代租户行事主体                                                                                                                                      |
| `IdentityGovernance`                    | identity 的公开类型  | 18 个治理操作与成功业务访问的报告。可选，与 `IdentityOperations` 共用记录                                                                                                                               |
| `ModelCredentialCustody`                | `src/model-credentials.ts` | 3 个模型凭据操作。可选；缺席时这 3 个操作答 `stage-not-provided`。端口拥有准入：本成员只交出登录的代租户行事主体与行事租户 |
| `SessionIngressFaces`                   | `src/faces.ts`       | Session 四个面中本成员实际调用的子集：`management.create`、`work.accept`、`work.queryOperation`、`work.cancelRun`、`work.stopCall`、`history.begin`、`history.next`。真实 `SessionService` 按结构满足它 |
| `DefinitionResolver`                    | `src/faces.ts`       | 定义名到 `SessionCreation` 采用字段的解析函数。映射数据归 `definition-mappings`，装配注入函数                                                                                                           |
| `DiagnosticSink`                        | `src/diagnostics.ts` | 结构化诊断。事件只有 code、path 与 operation，没有正文、证明、凭据、主体或依赖的错误文本                                                                                                                |
| `AgentFinishReader`、`ModelCallInspector`、`ModelAttemptReader`、`ToolCallReader` | `src/session-view/sources.ts` | 会话诊断投影的四个读端口：Agent 的 `readFinish`、Model 的 `inspect` 与 `ModelDiagnostics`、Tool 的 `lookup` 与 `account`。都可选；缺席是 `unsupported` 缺口 |

本成员不调用 authorization。会话操作的资格由 Session 面在访问裁定里判断（handoff「登录到 Access」第 3 点）。治理操作的资格由 identity 在提交时判断（identity ID-18）。模型凭据操作的资格由 `modelCredentials` 端口判断。

## 模块

| 文件                | 责任                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `http.ts`           | `createServerEntry`：只绑 `127.0.0.1` 的监听、承载页第 1 到第 5 步、按路径读取请求体并计数、分派到两个位置、写出答复、`stop`                     |
| `governance.ts`     | 治理位置：声明不提供的 14 个操作的常量；`register-and-activate` 与 `issue-login` 交 identity；18 个治理操作的第 4、6 步与到治理端口的映射；3 个模型凭据操作的第 4、6 步、代租户行事主体与到 `modelCredentials` 的映射 |
| `session.ts`        | 会话位置：读取分派、八个操作的判断次序第 2 到第 6 步、Session 结果到公开 `outcome` 的映射；`read-session-diagnostics` 的配置核对、游标开封与封印、公开正文的组装 |
| `session-view/`     | 会话诊断投影。`project.ts` 是纯投影：条目到 Run 骨架，各来源的答复到一个 Run 的视图与缺口；`sources.ts` 是来源适配：端口类型、失败种类到缺口原因的映射、抛错到 `unavailable`；`cursor.ts` 用本实例随机密钥封印续页游标；`index.ts` 是编排：按页读 Session、收集 Run、向来源扇出、合成页。它不认识 HTTP、Cordis 或 CLI |
| `identity-steps.ts` | 登录识别，账号关系核对，签发代租户行事主体，成功业务访问的报告。系统主体在首次需要时签发一次并保留                                               |
| `derivation.ts`     | 会话标识、输入标识、三族操作身份与登录入口证据的派生                                                                                             |
| `observation.ts`    | 观察消息的手写读写、本实例的观察记录、取消与替换、连接关闭即取消、每轮的登录重核与按登录结束                                                     |
| `sse.ts`            | 一个 SSE 响应的串行写入者：确认事件、帧与心跳经同一个队列写出                                                                                    |
| `session-codec.ts`  | 会话位置的编码：公开契约的编码函数写出每一条响应，编码失败是本成员故障                                                                           |
| `status.ts`         | `outcome` 到状态码的表。键类型是公开契约能编码的全部 `outcome`，少一行类型检查就变红                                                             |
| `config.ts`         | 配置形状与检查。初值归装配，本成员不写死                                                                                                         |

## 答复的三种形状

位置处理函数向 HTTP 层交回 `Answer`（`src/answers.ts`）：

- `json`：状态码只由 `outcome` 决定；`close` 为真时带 `Connection: close`。
- `no-answer`：本成员没有可信答复。HTTP 层写空正文的 500 并关闭连接。它只用于本成员自身的故障、定义映射抛错、编码失败，以及治理位置 identity 抛错。治理端口被拒绝时，`create-organization` 答带响应体的 `unknown`，不用 `no-answer`。
- `sse`：第一条事件是确认。只有 `succeeded` 的观察带 `attach`，HTTP 层在确认事件入队之后调用它登记观察；其余结果写完第一条事件就结束响应。

## 依赖抛错的两类

`session.ts` 用两个包装区分调用类别。`commitCall` 包 `create`、`accept`、`cancelRun`、`stopCall`：抛错答 `unknown`，状态 500 带响应体。`readCall` 包 `queryOperation`、`history.begin`、`history.next` 与整个诊断投影：Session 抛错答 `basis-unavailable`。投影内 Agent、Model、Tool 端口的抛错不到达 `readCall`：`sources.ts` 把它们收成 `unavailable` 缺口，页照常返回。identity 的登录识别与签发者抛错也是 `basis-unavailable`，在 `identity-steps.ts`。

Session 失败种类在该操作公开结果集之外时（例如 `login-required`），映射为 `basis-unavailable`。`unsupported` 按契约表映射为 `unsupported`，不看 `producer` 的种类；它只在 `stop-call` 的结果集里。编码函数会拒绝不在该操作结果集里的 `outcome`，这时答复是 `no-answer`。

## 会话路径的读取次序

`handleSession` 先用 json-text 严格读取一次。根是对象、版本是 `session-public/1`、操作名是两个观察操作之一时，走手写读取；其他情况把原字节交给 `readSessionRequest`。所以非观察请求被严格读取两次，这是承载页写明的已知限制。`send-input` 的 `message` 在 `readSessionRequest` 之后、登录识别之前经 message 包的 `judgeMessage` 完整解码。

## 本阶段的观察范围

本阶段的观察只做 M2 需要的心跳与关闭语义：

- 建立：判断次序第 1、2、4 步，然后以观察者自己的 `Access` 对该会话做一次 `history.begin` 作为读取资格核对，最后认领名额。名额的判断与计数在同一个同步步骤里完成（`ObservationRegistry.claim`），所以两个一起通过资格核对的请求不会都越过 `perLogin` 或 `perInstance`。达到上界时答 `basis-unavailable`。
- 认领与附着：`claim` 先占名额并返回 `ObservationClaim`，HTTP 层把确认事件入队之后再 `attach` 已打开的流。两步之间没有 `await`，但别的请求的 `cancel-observation`、同键再次建立或 `stop` 可能在微任务间隙到达。这时记录已经离开活动集，`ended` 帧在流附着时写出，确认仍在它之前。`stop()` 的 `endAll` 只等已附着的流写完；尚未附着的认领由 HTTP 层的在途计数兜住，它的响应写完之后 `stop()` 才关闭连接。
- 客户端在确认写出之前断开：`SseStream` 在构造时核对响应是否已销毁或已结束，已经关闭就直接进入关闭态。附着到它的登记立即释放名额，不 arm 心跳，`finished` 立即落定，`stop()` 不会等一个永不结束的流。
- 确认之后，流上只有心跳与 `ended` 帧。本阶段不定位 Model 调用登记，不查询 `current`，不发 `state`、`refreshing`、`snapshot`、`delta`、`gap`。刷新策略与资源上界中的 `interval`、`backoff`、`maxAttempts`、`deadline`、`currentTimeout`、`frameQueueBytes`、`locatePages` 本阶段没有消费者，不在配置里。
- 建立成功后，接入报告一次成功业务访问。报告在流附着、`onClose` 登记之后开始，接入不等它结束。会话位置的报告由 `JsonAnswer.afterWrite` 在 HTTP 层写出答复之后开始。所以报告永不结束时，答复、名额释放与 `stop()` 都不受影响。
- 登录重核：本阶段没有定位与刷新，一轮就是一个心跳间隔 `heartbeatIntervalMs`。附着之后，每个观察有自己的计时器，到期后用建立时的登录证明调用一次 `recognizeLogin`。同一观察的重核串行，结束之后到达的结果被丢弃。这样做的代价是心跳间隔同时决定了登录失效被发现的时延。观察接上 #746 的刷新循环之后，重核改在每轮刷新之前，周期改由刷新策略决定。
- `ended` 的原因：`observer-cancelled`（`cancel-observation`）、`observer-replaced`（同一登录同一会话同一 `observationId` 再次建立）、`denied`（本实例撤销该登录，或重核答 `invalid`）、`unavailable`（`stop`，或重核答 `basis-unavailable`）。
- 连接关闭即取消：观察记录从活动集移除，保留 `cancelRetentionMs`，供 `cancel-observation` 重放得到 `ended`。
- 观察记录只在本实例内存里。它是可丢弃的观察状态，不是权限缓存。

重附着、刷新与生产者观察的完整组合归 [#746 的设计](#观察接入的责任选择)，运行证据归联调。

## 已知固定值

下面三个值写在代码里，不在 `ServerEntryConfig` 里。它们不改变对外行为，本阶段没有要调它们的装配。要调时把它们移进配置，不在调用点改数字。

| 值                              | 位置                        | 作用                                                                                      |
| ------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| `headersTimeout: 60_000`        | `http.ts` 的 `createServer` | 请求头在 60 秒内没到齐，宿主关闭连接                                                      |
| `requestTimeout: 0`             | `http.ts` 的 `createServer` | 不限整个请求的时长，SSE 观察流可以长期保持                                                |
| `ELIGIBILITY_PAGE_BYTES = 4096` | `observation.ts`            | 建立观察时资格核对那次 `history.begin` 的 `pageBytes`，取它与 `maxPageBytes` 中较小的一个 |

## 验证与维护

改处理次序时只改本成员规格，并核对它没有改写公开契约的结果含义。

| 用例文件                             | 覆盖                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `tests/http-layer.spec.ts`           | 监听地址、路径、方法、Host、Content-Type、请求体上限、空正文 500、stop                                                         |
| `tests/governance.spec.ts`           | 注册激活、签发登录与 `loginId`、四个阶段操作、声明不提供的 14 个操作不识别登录、协议拒绝、identity 抛错                         |
| `tests/governance-operations.spec.ts` | 18 个治理操作的结果映射与状态码、第 4 与第 6 步先于端口、`denied` 与 `not-visible` 逐字节相同、端口的两类拒绝、诊断无秘密      |
| `tests/model-credentials.spec.ts`    | 3 个模型凭据操作的第 4、6 步、交给端口的主体与租户、跨租户 `denied` 逐字节相同且不披露对方绑定、端口各结果的映射、端口抛错、没有端口时 `stage-not-provided`、秘密不进响应与诊断 |
| `tests/business-access.spec.ts`      | 只有会话位置的 `succeeded` 与建立成功的观察报告业务访问；报告失败不改答复；只刷新报告的那份登录                                |
| `tests/observation-login.spec.ts`    | 撤销立刻结束该登录的观察、到期在下一轮结束、不可判定时 `ended(unavailable)`、其他登录的取消得到 `not-found` 且不调用 Session    |
| `tests/session-operations.spec.ts`   | 七个既有操作、判断次序逐步、denied 逐字节相同、两类依赖抛错                                                                    |
| `tests/session-view.spec.ts`         | 纯投影对四个来源的替身：Run 骨架只来自 Session、两个分支的解析、结构化原因、每种缺口、截断与不披露、分页与 Run 过滤、自由文本不进视图、不调用写口 |
| `tests/session-diagnostics-operation.spec.ts` | `read-session-diagnostics` 的判断次序、`denied` 与 `read-history` 逐字节相同、页上界、未配置、游标篡改与续页重核资格、端口缺席、只读 |
| `tests/derivation.spec.ts`           | 每族只改一个字段身份就变；`messageId` 不进身份                                                                                 |
| `tests/observation.spec.ts`          | 确认先于帧、心跳、取消、替换、连接关闭、确认前断开后名额释放与 `stop()` 返回、并发建立只放行一个、手写读取的每条封闭规则、stop |
| `tests/sse-stream.spec.ts`           | 串行写入者在客户端已断开的响应上构造：立即关闭、不写字节、`finished` 落定                                                      |
| `tests/observation-registry.spec.ts` | 登记在自己的接口上：认领与附着之间到达的取消在确认之后写出 `ended` 帧；已关闭的流附着后名额释放、`endAll` 落定                 |
| `tests/secrets.spec.ts`              | 响应、诊断与错误文本里没有登录证明、凭据与签发者，带正控                                                                       |
| `tests/status.spec.ts`               | 状态码表与承载页逐项相同                                                                                                       |

用例经 `tests/support/harness.ts` 起真实回环 HTTP，用 identity 的 `./testing` 参考替身（`inProcessIdentity`：共用记录的操作端口与治理端口、可控时钟与记录库故障开关）、进程内主体权威与 `tests/support/session-double.ts` 的 Session 面替身。替身保持 Session 自己写明的判定顺序，它不证明真实 Session、持久 identity 或跨进程主体来源。

## 观察接入的责任选择

[行为规格的 #746 设计](../SPEC.md#观察脱离与重附着746)把观察组合放在服务端接入。它已承担公开请求到内部能力的转换，能够在登录与租户边界下，组合日志读取、目标查询与生产者观察。组合只需要公开值和端口，不要求 Agent 实例仍存活，也不让 Model 认识会话或公开连接。

Session 也能定位自己的日志，但由它承担观察重附着会把公开观察者的连接、刷新和生产者订阅带入工作治理。Agent 具有首次调用上下文，但由它承担会让重附着依赖可被重装配的实例，与无 Agent 重附着的要求冲突。因此本设计不增加独立转发能力，由接入承担必要组合，Session 与 Agent 保留原责任。

| 事实或决定                         | 轴与拥有者                            | 接入的处置                                                                 |
| ---------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| 谁在观察、代哪个租户行事           | 身份与主体签发，identity 与获授权接入 | 消费登录识别，按已有关系签发主体，显式传 Access                            |
| 哪些日志已提交、调用引用来自哪里   | 工作事实，Session                     | 只读公开日志中的稳定引用，不维护第二份业务事实                             |
| 是否可读日志、调用与生产者内容     | 授权，各实际受保护端口                | 保持各边界核权与失败，引用不作凭据                                         |
| 调用当前状态和发布目标             | 调用与发布，Model                     | 按 current 的同边界结果选目标，不推断业务结局                              |
| 怎样取得快照与增量                 | 内容观察，生产者                      | 消费原观察端口，不补造 replay 或跨 ref cursor                              |
| 何时刷新、忽略旧响应并释放观察资源 | 观察组合，server-entry                | 有界刷新，隔离迟到响应，脱离时取消本地观察                                 |
| 公开订阅形状与连接寿命             | 公开协议，public-contract             | 消费[会话观察](../../public-contract/SPEC.md#会话观察)，不在本成员新增协议 |
| Agent 的推进与业务调用寿命         | 推进归 Agent，调用归 Model 或 Tool    | 观察不控制工作，Agent 不在重附着链路                                       |

实现时，接入只需为每次观察保留当前选择、查询先后关系及本地资源所有权。这些都是可丢弃的观察状态，不能成为调用事实或权限缓存。旧 ref 失效、新 ref 快照失败与刷新耗尽分别保留原失败和最后已确认事实，不能把任一局部成功记成整条观察已恢复。策略与资源规则见[刷新策略与资源](../SPEC.md#刷新策略与资源)。

本设计已由 PanQiWei [接受](https://github.com/nemori-ai/omne-harness-lite/issues/746#issuecomment-6443957269)。它不证明网络恢复、跨进程观察连续或撤权后的运行行为。

## 观察对象与刷新策略的取舍

刷新策略是部署配置的对象，不是代码常量。间隔、退避、次数与期限随部署的负载和网络条件变化，接入只持有默认初值。默认初值不是契约承诺。

观察对象选「会话最新登记的、用途为 `main` 的 Model 调用，并随新登记切换」，不选「一次调用」。用户要看的是这个会话现在在输出什么。多轮带工具的会话会连续产生新调用，跟随由接入的刷新循环完成，客户端不需要反复重新连接。代价是定位成本进入刷新循环，接入用翻页预算限定这一成本。

另有两种语义未采用。第一种是观察一次指定调用，请求带调用登记条目的 `entryId`。它要求客户端先读日志，并在每次新调用时重新建立观察。第二种是只观察建立时的最新一次调用，之后由客户端重新连接。它把跟随责任交给客户端，每次切换都多一次连接。

观察没有跨连接的续接游标。Model `current` 不提供可达性租约，旧引用失效后不能沿用旧 cursor，新目标必须从新快照开始。所以重新连接总是重新定位并取新快照。

观察视图引用三个已有对象：会话日志、一次模型调用，以及记录条目。定位读的是会话日志里的[调用登记](../../../session/session-contract/docs/object-model/session-log-events.md#e-调用与结果)条目。观察本身不是对象，不新增对象条目。既有不变量不变：Session 的[读取规则](../../../session/session-contract/SPEC.md#日志读取投影及恢复)，`current` 为 null 不是终局，以及接入不发起、取消、重试或重发业务调用。

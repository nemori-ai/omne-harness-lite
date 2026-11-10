# 服务端接入行为规格

本页拥有治理位置与会话位置的入口职责。消息字段和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。路径、方法、状态码、请求体上限和 SSE 格式只归[承载绑定表](../public-contract/docs/http-binding.md#承载绑定表)。观察接入的组合责任见[观察脱离与重附着](#观察脱离与重附着746)。各小节的采用依据见该节开头。

下列条款由 #978 波 1 设计点 DP-2 采用，依据是 DP-2 决策记录（评论 6561904972）与 R1-D27（评论 6562041248）：本段第一段对会话位置和承载页的引用、「[位置与操作范围](#位置与操作范围)」整节（含各小节）、「[验证](#验证)」一节中会话位置与 HTTP 层的验证义务。其余条款保持各自原有的采用状态。「[会话诊断投影](#会话诊断投影)」小节，「会话位置」一节里写 `read-session-diagnostics` 的句子与表格内容，以及「[依赖](#依赖)」「[验证](#验证)」中会话诊断投影的条款，不在 DP-2 的采用范围内：它们由 [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md) revision 2 的本地范围另行采用。

「[治理位置](#治理位置)」「[成功业务访问的报告](#成功业务访问的报告)」「[登录失效时结束观察](#登录失效时结束观察)」三个小节，以及「[服务端的 HTTP 层责任](#服务端的-http-层责任)」与「[验证](#验证)」中治理端口的条款，按 Reduce 的 R2-D203、R2-D204 与身份治理交付规格的 F2、F3、C4、C5 修订。

## 入口职责

服务端接入接受已经完成传输保护的字节。传输保护失败时，调用者没有可信答复，对外是 `unknown`，不是 `basis-unavailable`，也不是业务结果。远程字节流必须具备保密和完整。传输路线沿[技术基础的共同技术选择](../../../docs/architecture/technical-foundations.md#共同技术选择)：HTTP JSON 控制与查询，fetch SSE 单向观察。公开操作、认证、端点与订阅语义由公开契约拥有。本页不选定具体保护协议。

接入用公开契约指定的严格 JSON 读取这些字节。读取失败是 `protocol-rejected`。它不挑选重复的 `protocolVersion`。

接入按公开契约的判定次序处理。前一步已经给出终端结果时，不再做后面的步骤。版本不是 `governance-public/1` 时是 `protocol-rejected`。版本是 `governance-public/1` 时，`disable-subject`、`restore-subject`、`end-subject` 和 `reopen-after-media-loss` 在封闭字段和登录核验之前返回 `stage-not-provided`。

必填登录证明的缺失、空字符串、未签发、已撤销，以及不是本部署签发的证明，交给 identity。对外是同一份 `denied`。时间或权威记录不可得时，identity 返回 `basis-unavailable`。接入不改写这两个结果，也不另持一份登录表。

发起者只取证明核验出的账号。请求体里的账号、组织和租户是目标。治理操作交给 identity 的治理入口。只有 `judge-admission` 交给 authorization，本部署不提供它。接入不把存储对象放进公开响应。

## 位置与操作范围

接入有两个位置。治理位置读写 `governance-public/1`，会话位置读写 `session-public/1`。接入按请求路径选择位置和读取函数，不按消息里的版本文本分派。路径、方法、内容类型、状态码与请求体上限在[承载绑定表](../public-contract/docs/http-binding.md#承载绑定表)。本页不复制那张表。

两个位置的 HTTP 层先于公开契约的判断次序。HTTP 层的步骤和次序见[请求与响应规则](../public-contract/docs/http-binding.md#请求与响应规则)。HTTP 层的失败不调用 identity、authorization 和 Session。

状态码不替代消息里的 `outcome`。接入只由 `outcome` 决定状态码，映射见[状态码映射](../public-contract/docs/http-binding.md#状态码映射)。同一个 `outcome` 总是得到同一个状态码和同样形状的响应体。

### 治理位置

接入按公开契约的[判断次序](../public-contract/SPEC.md#判断次序)处理治理消息。治理位置的操作分四组：

- `register-and-activate` 和 `issue-login`：接入把消息交给 identity 的公开入口，不核验登录证明。`issue-login` 成功时，响应带新登录的 `loginId`。
- 18 个治理操作：`create-organization`、`query-create-organization`、`issue-member-invitation`、`accept-member-invitation`、`reject-member-invitation`、`withdraw-member-invitation`、`query-invitation`、`query-received-invitations`、`query-issued-invitations`、`query-own-memberships`、`query-organization-members`、`leave-organization`、`remove-member`、`change-member-role`、`switch-current-tenant`、`query-current-tenant`、`revoke-login`、`query-own-valid-logins`。接入把它们交给 identity 的治理端口（identity ID-18）。
- 4 个设置操作：`list-settings`、`set-setting`、`describe-setting`、`clear-setting`。接入把它们交给装配给的 `settings` 端口，规则见[设置项](#设置项)。
- 部署声明不提供的 14 个操作：`public-health`、`replace-credential`、`query-organization`、隶属的 8 个操作、`judge-admission`、`submit-authorization-expression` 与 `withdraw-authorization-expression`。声明是成员常量 `NOT_PROVIDED_GOVERNANCE_OPERATIONS`（`src/governance.ts`）。规则见公开契约的[部署声明不提供的操作](../public-contract/SPEC.md#部署声明不提供的操作)：请求通过第 3 步的封闭字段检查之后，接入答 `stage-not-provided`，`body` 为空，不识别登录，也不读取账号库。

识别登录不是公开操作。它是两个位置判断次序里的内部步骤。

#### 设置项

本节兑现公开契约的[设置项](../public-contract/SPEC.md#设置项)。接入只做登录与行事租户的步骤，资格、声明与保管归 `settings` 端口。端口类型 `SettingsGovernance` 由本成员声明（`src/settings.ts`），只有管理语义：列出、写入、查看与清除，不取用秘密。

1. 装配没有给 `settings` 端口时，这 4 个操作按[部署声明不提供的操作](../public-contract/SPEC.md#部署声明不提供的操作)处理：通过第 3 步之后答 `stage-not-provided`，不识别登录，也不读取账号库。
2. 第 4 步：把 `loginProof` 交给 identity 的登录识别，`denied` 与 `basis-unavailable` 原样对外。
3. 第 6 步：`actingTenant` 不等于识别出的当前选择时答 `denied`，不调用端口。这一份 `denied` 与其他原因的 `denied` 除 `messageId` 外逐字节相同，不披露对方租户有没有配置。`body` 没有目标租户字段，带上它是 `protocol-rejected`。
4. 用签发者为行事租户签发代租户行事主体，`work.owner` 是 `identity-login`，规则同会话位置的第 4 步。账号不等答 `denied`，签发失败答 `basis-unavailable`。
5. 把主体与行事租户，以及请求里的 `asset`、`item` 和 `secret` 交给端口。`list-settings` 省略 `asset` 时，端口收到的输入也没有 `asset`。端口的结果按公开契约对外表示。接入只把成功体的字段写进响应：`set-setting` 只写 `configuredAt`，`describe-setting` 写端口给出的两层 `own` 与 `official`。端口给出的状态或条目不合公开契约时，编码失败，接入写出响应体为空的状态 500，记诊断 `encode.fault`。
6. 端口拒绝（Promise 被拒绝）时，`set-setting` 与 `clear-setting` 答 `unknown`，因为写入可能已经发生。`list-settings` 与 `describe-setting` 答 `basis-unavailable`。接入记诊断 `settings.fault`，诊断只带操作名。

秘密只在 `set-setting` 的请求里。接入把它原样交给端口，不写进响应、诊断或错误文本。这 4 个操作不报告成功业务访问。

接入对 18 个治理操作的职责如下。

| 步骤                | 接入的职责                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1 至 3 协议读取     | 用 `readGovernanceRequest` 读取。不合规是 `protocol-rejected`。声明不提供的操作在这之后答 `stage-not-provided` |
| 4 登录识别          | 把 `loginProof` 交给 identity 的登录识别。接入不改写 `denied` 与 `basis-unavailable`，也不另持登录表           |
| 6 行事租户          | 要求行事租户的操作：核对 `actingTenant` 等于识别出的当前选择。不等是 `denied`，响应不含实际选择                |
| 7、8 业务判断与提交 | 把识别出的登录原样交给治理端口。identity 在提交时再核对登录有效、选择未变，并判断资格。结果按公开契约对外表示  |

补充规则如下。

- `issue-member-invitation` 的 `duration` 是线上文本，接入用 `parseDuration` 读取。读不出 SI 秒时长时，结果是 `denied`，不建立邀请。这一步在第 6 步之后。
- `query-own-valid-logins` 的端口给出空名单时，结果是 `basis-unavailable`，没有登录数组。
- `revoke-login` 答 `succeeded` 或 `no-change` 时，目标登录已经失效。接入按[登录失效时结束观察](#登录失效时结束观察)结束它在本实例上的观察。
- 治理端口是必需依赖，必须与 `identity` 用同一份记录，撤销与切换才对登录识别生效（R2-D235 S1）。装配按调用现取治理服务时，服务缺席由端口答 `basis-unavailable`，18 个治理操作原样对外答 `basis-unavailable`。
- 治理位置的 `denied` 在各个原因下，响应除 `messageId` 外逐字节相同。原因包括登录缺失、空、无效或已失效，行事租户不符，以及 identity 的业务拒绝。`not-visible` 不区分对象不存在、属于其他账号与看不见。
- 治理操作不报告成功业务访问，所以不刷新空闲计时。

### 成功业务访问的报告

接入为下面两类成功调用 identity 治理端口的 `reportBusinessAccess({ login })`，`login` 是这次请求识别出的登录：

- 会话位置的 7 个操作答 `succeeded`。编码失败时没有答复，不报告。
- `observe-session` 建立成功，即认领到名额之后。

其他请求都不报告：失败的请求、治理操作、`cancel-observation`、声明不提供的操作和仅完成识别的请求。

接入先写出答复，再报告。`observe-session` 在流附着、连接关闭的监听登记之后再报告。接入不等报告结束，也不给报告设时限。报告永不结束时，答复照常写出，名额照常释放，`stop()` 照常结束。报告答 `basis-unavailable` 或 Promise 被拒绝时，接入记诊断 `identity.fault`，答复不变。

先写答复的代价是一个竞态：调用者收到答复后立刻发出的下一次请求，可能先于这次刷新到达 identity。空闲期限以分钟计，所以这个竞态只在空闲截止时刻前的极短时间内有影响。

### 登录失效时结束观察

观察记录绑定建立它的登录。登录失效后，接入在两种时机结束这份登录的观察，原帧流发 `ended(denied)`：

1. 本实例上的 `revoke-login` 答 `succeeded` 或 `no-change` 时，接入立刻结束目标登录在本实例上的全部观察。
2. 每一轮，接入用建立时的登录证明再识别一次登录。空闲期限或最长期限已到、登录已在别处撤销时，识别答 `invalid`，接入结束该观察。识别答 `basis-unavailable` 或抛出时，接入发 `ended(unavailable)`。

本阶段的观察不定位，也不刷新，所以一轮是一个心跳间隔 `heartbeatIntervalMs`。同一观察的登录重核串行执行。观察结束后到达的重核结果不改变任何东西。与撤销并发建立的观察，最迟在下一轮结束。

### 会话位置

会话位置提供公开契约的八个会话操作和两个观察操作。接入按公开契约的[会话判断次序](../public-contract/SPEC.md#会话判断次序)处理会话操作。下表写接入在每一步的职责。操作 `read-session-diagnostics` 的组合规则另见[会话诊断投影](#会话诊断投影)。

| 步骤             | 接入的职责                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 协议读取       | 按承载页的[会话路径的读取分派](../public-contract/docs/http-binding.md#会话路径的读取分派)读取。两个观察操作按承载页的手写读取规则，其他操作用 `readSessionRequest`。另按 message 包完整解码 `message`。任一不合规是 `protocol-rejected`，Session 不被调用                                                                                                                                                                                            |
| 2 登录识别       | 把 `loginProof` 交给 identity 的登录识别，得到账号、登录和当前租户。接入不改写 `denied` 与 `basis-unavailable`，也不另持登录表                                                                                                                                                                                                                                                                                                                        |
| 3 行事租户       | 只对 `create-session`：核对 `actingTenant` 等于该登录的当前选择，不等是 `denied`，响应不含实际选择                                                                                                                                                                                                                                                                                                                                                    |
| 4 目标租户与主体 | 目标租户的账号等于识别出的账号时，用签发者签发代租户行事主体，规则见[登录到 Access](../../../docs/architecture/runtime/runtime-contract-handoff.md#登录到-access)。账号不等是 `denied`。签发者未安装或签发失败是 `basis-unavailable`                                                                                                                                                                                                                  |
| 5 部署范围       | 用 `definitionMappings` 解析 `definition`。定义名不在映射内，或 `pageBytes` 超出部署上界，是 `invalid`。`create-session` 的映射条目没有 `initialModelSelection` 时，是 `basis-unavailable`，不调用 Session，记诊断 `session.definition-incomplete`。`read-session-diagnostics`：部署没有配置投影（`diagnosticsKinds`、`maxRuns`、`maxCallsPerRun`）时是 `basis-unavailable`，不调用 Session；游标不是本实例为该租户与会话签发的，是 `invalid` |
| 6 Session 判断   | 按[操作到 Session 的映射](../../../docs/architecture/runtime/runtime-contract-handoff.md#操作到-session-的映射)调用 Session 的面。结果按公开契约的映射表对外表示。`read-session-diagnostics`先读 Session 历史，再读其他来源；其他来源的拒绝不改变 `outcome`                                                                                                                                                                                   |

补充规则如下。

- `cancel-run` 和 `stop-call` 调用 Session 的 `cancelRun` 与 `stopCall`，调用方类是 `intake`。它们没有行事租户，第 3 步不适用。
- `stop-call` 的 `producer.kind` 为 `tool` 时，接入在 Session 的访问裁定之后、会话存在核对之前答 `unsupported`。接入不写任何记录。该结果与会话是否存在、`controlId` 是否用过无关。
- 接入从识别出的登录和请求标识派生 `SessionOperationId`，规则见[SessionOperationId 的派生规则](#sessionoperationid-的派生规则)。客户端不填它。
- `initialModelSelection` 对公开创建是必需项：客户端不填它，公开操作也没有切换模型的入口。缺它的会话永远读不到当前模型选择，Run 无法启动。接入因此不创建这样的会话，缺口属于部署配置，不属于调用者的消息，所以答 `basis-unavailable`，不答 `invalid`。
- `definitionMappings` 的选择是部署装配的配置。接入只读取已装配的映射，不自己选择。同一份映射数据交给 Agent 采用和 Session 采用来源。
- 映射条目可带可选的 `residentCapabilities`，列出该定义的会话在 `create` 时纳入的常驻工具能力名，形状是 Session 采用点输入的 `capabilities`。接入不读这一项，也不在创建里声明常驻工具。常驻工具的材料由 Session 采用来源按这一项从部署的工具来源解出，解不出时创建失败。没有这一项的条目不纳入常驻工具。
- 会话位置的 `denied` 不披露会话是否存在。接入对所有 `denied` 原因给出逐字节相同的响应，见[denied 的一致性](../public-contract/docs/http-binding.md#denied-的一致性)。
- 观察操作的建立点、帧与取消沿公开契约的[会话观察](../public-contract/SPEC.md#会话观察)。承载格式见[SSE 观察](../public-contract/docs/http-binding.md#sse-观察)。观察消息的读写见承载页的[观察消息的手写读写](../public-contract/docs/http-binding.md#观察消息的手写读写)。

### 会话诊断投影

本节按 RFC-0013 revision 2 的本地范围采用。设计依据是 [RFC-0013 的 A 线](../../../docs/rfcs/RFC-0013-engineering-telemetry.md#a-线会话日志诊断投影)。它的裁定 DA1（组合承担者是本成员的 `session-view/` 模块）与 DA5（操作名 `read-session-diagnostics`）按 RFC revision 2 的接续采用记录执行。线上形状归公开契约的[会话诊断页](../public-contract/SPEC.md#会话诊断页)。

接入是这个投影的组合承担者。投影只读：它不创建 Session、Run 或调用，不重新执行任何动作，不消耗派生额度，也不缓存跨请求的结果。它只经各拥有者的公开读口取数，不读存储内部。

来源与读取路径：

| 来源    | 读口                                                                                     | 端口                                   | 取什么                                               |
| ------- | ---------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Session | `history.begin`，`reader` 类，反向，种类取 `diagnosticsKinds`；页内续读用 `history.next` | `session.history`，必需                | Run 的骨架、调用登记、控制、终态与消息计数           |
| Agent   | `readFinish`                                                                             | `agentJournal`，可选；读口本身也可选   | 以 `failed` 或 `cancelled` 终结的 Run 的结束候选     |
| Model   | `inspect`，然后 `list`，再 `dispatches`                                                  | `modelCalls`、`modelDiagnostics`，可选 | `call.bound` 的 Model 引用解析到的调用、它的派发诊断与每次派发的账目 |
| Tool    | `lookup`、`account` 与 `readDiagnostics`                                                 | `toolQueries`，可选                    | `call.bound` 的 Tool 引用的状态、账目与诊断页第一页  |

组合规则：

1. Run 的骨架只来自 Session。接入从最新一条反向读历史，按 `run.started` 划分 Run：两个 `run.started` 之间的条目属于较新的那个 Run。`run` 为 null 时每页至多 `maxRuns` 个 Run；给了 `run` 时只投影那个 Run，扫到它就停。
2. 每个 Run 至多 `maxCallsPerRun` 次调用进入扇出，按日志顺序取前面的。超出的只计数，并记缺口 `truncated`，`subject` 是 Run。一次 Tool 调用可以有两条 `call.bound`：先是没有生产者的 `tool-intent` 登记，再是关联登记。投影把它们算作同一个调用，只计一次：以带生产者的那条为准，位置取首次登记的位置。所以这样的调用不会被多计，也不会提前触发 `truncated`。
3. Model 分支先 `inspect`。解析到调用才 `list` 它的派发，一次最多 64 条；还有下一页时记缺口 `truncated`；`coverage` 为 `expired-prefix` 时记缺口 `retention-expired`。`not-accepted` 写成 `unknown`，原因 `not-accepted`。`list` 给出至少一条派发时，再读同一调用的 `dispatches`，按派发标识把记录对到诊断条目上，给每次派发写 `account`：记录的 `account` 为 null 时写 `unknown`，原因 `not-recorded`；诊断条目的派发在记录里找不到时写 `unknown`，原因 `not-found`；`dispatches` 读失败时每次派发都写 `unknown` 带该读的原因，并只记一条缺口，对象是该调用引用。没有派发条目时不读 `dispatches`。Tool 分支的 `lookup`、`account` 与 `readDiagnostics` 各自独立；一个的缺口不影响另一个。`readDiagnostics` 只读第一页（`after` 为 null）：条目只取 `operation`、`phase`、`code`，不带证据；`next` 不为 null 时不读下一页，记缺口 `truncated`；读失败时 `diagnostics` 写 `unknown` 带原因并记缺口。
   Session 骨架另有两类计数：`run.attempt-started`、`run.attempt-released`（按载荷 `reason` 分计五种）与 `run.attempt-exited` 计入 `attempts`；`call.execution-fact` 按载荷 `fact.kind` 计数。`reason` 不在五种之内，或没有 `fact.kind` 的条目不计。

   一条 `call.execution-fact` 的归属只用这条条目自身的字段，按下面的次序找它指向的调用：

   - 先取载荷顶层的 `consumption`。观察路径这样写。
   - 顶层没有时，取 `fact.consumption`。`release` 事实这样写。
   - 两处都没有、且条目带 `fact.producer` 时，取生产者。接收路径的 `execution` 事实只带生产者。

   条目有消费标识时，它等于某次进入扇出的调用的消费标识，事实就计入该调用的 `facts`。这时不再按生产者找。条目只有生产者时，某次进入扇出的调用在 `call.bound` 登记的生产者（`registration.binding.producer`，或旧形状的 `binding.producer`）的 `kind` 与 `call` 都与它相同，事实就计入该调用的 `facts`；有几次调用相同时取日志中最先登记的那次。其余事实计入 Run 的 `facts`。计数与条目在日志中的先后无关。
4. 只对 `failed` 或 `cancelled` 的 Run 读 Agent 的 `readFinish`。`completed` 的 Run 的 `structured` 是 `none`。读到的结束候选只取闭合字段；`node-failed` 取原候选的 `node`、`category` 和 `failureKind`，不取异常原文；没有候选时是 `unknown`，原因 `not-recorded`。
5. 每个来源的拒绝、不可用、不支持、找不到都成为缺口，带来源、对象与原因；对应的值写 `unknown` 并带同一原因。端口缺席或 `readFinish` 缺席是 `unsupported`。端口抛出异常是 `unavailable`，页照常返回。同一（来源、对象、原因）只记一条。 来源失败到缺口原因的映射：`denied`、`unavailable`、`unsupported` 照原名；`invalid` 出在引用字段上时是 `not-found`，出在其他字段（例如 limit、租户）上时是 `unavailable`；`not-settled` 是 `not-recorded`；其余失败种类（容量、冲突、提交未知、过期游标等）是 `unavailable`。只有 `modelCalls` 没有 `modelDiagnostics` 时，派发的缺口是 `unsupported`。
6. 投影不跨来源推断：Session 没有登记的调用不出现；Model 或 Tool 的空答复不说明调用不存在。
7. 部署不披露的种类（`PROJECTED_KINDS` 中不在 `diagnosticsKinds` 里的）记缺口 `not-disclosed`，`subject` 是种类名。接入只向 Session 请求披露的种类。
8. `fault.diagnostic`、消息正文、工具参数、账目的 `place` 与任何供应商错误原文都不进视图。公开契约的编码把这些字段挡在页外。

分页与游标：

- 首页用 `begin`，`from` 为 null。续页用 `begin`，`from` 是上一页停下的那个 `run.started` 的条目标识，反向不含它自己。
- 游标由本实例用随机密钥封印，绑定租户文本、会话、`run` 过滤、`pageBytes` 与本页的 `basis.upper`。被篡改、另一会话、另一实例签发或不是本实例形状的游标都是 `invalid`。接入不按猜测的位置继续。
- 续页重新经 Session 核资格。撤权后续页是 `denied`，与首页一样逐字节相同。
- `exhausted` 为真表示没有更多 Run 可读；给了 `run` 时扫到那个 Run 或读完历史都是真。`scannedThrough` 是停下的 `run.started` 条目标识，或 Session 最后一页的 `scannedThrough`。
- 时刻只在载荷带发生时间时显示。Session 的历史载荷不带发生时间，所以在 RFC-0013 DA7 采用之前，`started.at` 恒为 `unknown`。`timing` 的三项按 Model 诊断原样给出。
- 续页的 `basis.upper` 是游标里封存的首页上界，不是续页这次读到的当前上界。续页向更早的位置读，读不到首页上界之后追加的条目，所以整轮遍历的依据是首页的上界（Session 契约 SL10「固定读取上界」）。续页签发的下一个游标封存同一个上界。新的首页读当前上界。

授权：取数按调用方的租户。Session 的资格判断先于一切，`denied` 不披露会话是否存在。Agent、Model 与 Tool 各自核资格，它们的 `denied` 只成为缺口。

读取时点：各来源在不同的时刻读取。`basis.upper` 只说明 Session 历史部分依据的修订；Agent、Model 与 Tool 在读完 Session 历史之后各自读取，没有共同的读取边界。所以同一页里可以出现 Session 显示 Run 已终结、而 Model 派发仍是 `pending` 的组合。读者把每个来源的值当作该来源被读取时的状态，不当作同一时间点的快照。

下图是一页的读取次序。每个读口的失败只在自己那一支成为缺口。

```mermaid
flowchart TD
  H["Session 历史<br/>history.begin / next，reader 类"] --> R["按 run.started 划分 Run"]
  R --> CB["每个 Run 的 call.bound<br/>同一调用合并，至多 maxCallsPerRun 次"]
  CB -->|Model 引用| MI["Model inspect"]
  MI -->|解析到调用| ML["Model list：派发诊断"]
  CB -->|Tool 引用| TL["Tool lookup、account 与 readDiagnostics"]
  R -->|failed 或 cancelled| AF["Agent readFinish"]
  MI --> P["SessionDiagnosticsPage：视图值与缺口"]
  ML --> P
  TL --> P
  AF --> P
  R --> P
```

已知限制：

- Model 读面按部署显式采用的租户只读资格返回；未授权、不支持或不可用仍形成缺口。应用的资格映射和登录返回检查归 [server-entry 行](../../../apps/harness-server/docs/rows/server-entry.md)。
- Agent 已保存 `node-failed` 结束候选并完成原责任收尾时，投影读取其节点、分类与失败种类。原责任尚未得到可靠终态时，`terminal` 仍为 `null`；投影不据遥测日志推断业务结束。

### SessionOperationId 的派生规则

本节是 `SessionOperationId` 派生规则的现行源。公开契约的[控制标识与重试](../public-contract/SPEC.md#控制标识与重试)把派生规则分给服务端接入，本节兑现它。摘要算法、族的文本和字段编码归 Session 的 [`deriveIngressOperation`](../../session/session-contract/docs/public-api.md)。接入调用它，不另写算法。

1. 派生是确定性的。同一业务意图在崩溃前后得到同一个身份。
2. 需要操作身份的操作各属于一个族，族与字段取法如下表。字段按表中的次序传入。

| 族      | 适用操作                                 | 字段                                      |
| ------- | ---------------------------------------- | ----------------------------------------- |
| create  | `create-session`、`query-create-session` | 租户文本、`createCallId`                  |
| accept  | `send-input`、`query-send-input`         | 租户文本、会话文本、`acceptId`            |
| control | `cancel-run`、`stop-call`                | 登录文本、租户文本、会话文本、`controlId` |

3. create 与 accept 的字段取法同[派生身份](../../../docs/architecture/runtime/runtime-contract-handoff.md#派生身份)已有的两行。control 一行待 Reduce 并入那张表。并入后，本表删去这一行，只引用那张表。登录文本是识别出的登录的 loginStateCodec 文本。
4. control 含登录文本，因为不同登录不共享中断回执。create 与 accept 不含登录文本，因为租户文本已经含账号。
5. `messageId` 不进入任何身份。换新的 `messageId` 或重连不产生新身份。
6. `cancel-run` 和 `stop-call` 共用 control 族，所以共用 `controlId` 的唯一范围。同一登录在同一会话里，同一 `controlId` 跨两个操作复用，由 Session 得到 `conflict`。
7. `body` 中出现 `login` 或 `operation` 一类字段时，公开契约已经规定为 `protocol-rejected`。客户端不能填写身份。

碰撞测试分两层。接入的碰撞测试归接入，见[验证](#验证)：每个族只改一个字段，身份就变。摘要算法本身的碰撞测试归 Session，已在 Session 的 `deriveIngressOperation` 测试中。

### 服务端的 HTTP 层责任

下面的规则属于服务端自己，不是两端共用的承载保证。

- 监听地址只能是 `127.0.0.1`，使用明文 HTTP/1.1。部署配置给出其他地址时，服务启动失败并报配置错误。`0.0.0.0`、`::`、主机名和其他网卡地址都属于其他地址。接入不静默改写地址。
- 监听端口是部署配置，名字是 `listenPort`。初值归装配配置。
- 接入不发 CORS 头。`OPTIONS` 请求按承载页[请求与响应规则](../public-contract/docs/http-binding.md#请求与响应规则)的第 2 步得到 405。
- 接入的日志和诊断不记录请求体和响应体。登录证明、凭据和签发者不出现在任何输出里。
- M2 不提供 TLS，见承载页的[已知限制](../public-contract/docs/http-binding.md#已知限制)。

依赖抛出异常或不可达时，对外结果按调用的类别决定。接入不把它们写成接入自身的故障。

- 读取类依赖：identity 的登录识别、签发者，以及 Session 的读取类调用（`queryOperation`、日志读取与历史页读取）。它们抛出异常或不可达时，结果是 `basis-unavailable`，状态 503。读取没有提交任何效果，所以「现在不能得出允许」成立。
- Session 的提交类调用：`create`、`accept`、`cancelRun` 与 `stopCall`。调用开始之后抛出异常或不可达时，结果是 `unknown`，状态 500，带 `unknown` 的响应体。提交可能已经发生，所以接入不答 `basis-unavailable`。依据是公开契约：只有存储提交之前来源不可读才是 `basis-unavailable`（[Session 结果与线上结果](../public-contract/SPEC.md#session-结果与线上结果)），`commit-unknown` 映射为 `unknown`（[结果](../public-contract/SPEC.md#结果)）。调用者用原标识原样再送，或用查询操作认回。
- 治理位置的 `register-and-activate` 与 `issue-login`：identity 的公开入口抛出异常或不可达时，签发或激活可能已经提交。公开契约[结果闭合与关联](../public-contract/SPEC.md#结果闭合与关联)给这两个操作的结果集没有线上 `unknown`，丢失回执只是调用者本地未知。所以接入不构造业务结果，写出响应体为空的状态 500，并关闭连接。
- 治理位置的 18 个治理操作：治理端口的 Promise 被拒绝时，结果对接入未知（identity ID-18）。`create-organization` 的结果集有线上 `unknown`，接入答 `unknown`，状态 500，带响应体。其余 17 个操作的结果集没有线上 `unknown`，接入写出响应体为空的状态 500，并关闭连接。接入不答 `basis-unavailable`。

响应体为空的状态 500 表示接入没有可信答复。它只用于接入自身的故障和上面治理位置的两种情况。接入写出它之后关闭连接。接入不把这类情况写成 `denied`、`succeeded` 或 `basis-unavailable`。`unknown` 的状态 500 带响应体，不属于这一条。

## 依赖

服务端接入的依赖边以公开契约的[三个成员](../public-contract/SPEC.md#三个成员)为唯一来源。

公开契约不依赖服务端接入。SDK 不依赖服务端接入。

[会话诊断投影](#会话诊断投影)让本成员以只读方式消费 agent-contract、model-contract 与 tool-contract 的类型与读口。`DIR-ACCESS-MODEL` 与 `DIR-ACCESS-TOOL` 只约束公开契约、SDK 与 stream-arrival，不约束本成员。公开契约仍不依赖这三个成员：诊断页的形状在公开契约里以自己的词声明。

## 设计签名

下面的类型和函数是设计形状。本包不导出它们。它们不是已经可安装的调用。共同消息和 `outcome` 只引用公开契约。

```ts
type GovernanceEntry = {
  receive(protectedBytes: Uint8Array): Promise<unknown>
}
```

`receive` 的输入是已经完成传输保护的字节。返回值是公开契约的响应。传输保护失败时，调用者没有这份响应，对外保持 `unknown`。

```ts
function receiveRevoke(entry: GovernanceEntry, protectedBytes: Uint8Array): Promise<unknown> {
  return entry.receive(protectedBytes)
}
```

接入先按公开契约做严格 JSON 读取。读取失败时返回 `protocol-rejected`，没有业务效果。协议检查通过后，接入把登录证明交给 identity 的登录识别，把通过第 6 步的请求交给 identity 的治理端口。它们返回的 `denied` 和 `basis-unavailable` 原样成为响应的 `outcome`。接入不改写这两个结果，也不把存储对象放进响应。

## 验证

入口不另写结果含义。入口在坏 JSON 上没有业务效果。版本不是 `governance-public/1` 时是 `protocol-rejected`。版本是 `governance-public/1` 时，`disable-subject`、`restore-subject`、`end-subject` 和 `reopen-after-media-loss` 不核验登录。登录证明的结果不被入口改写。下列输入的结果以公开契约为准。

- 字段表要求登录证明时，缺失或空字符串只有 `denied`。字段表禁止该字段时，出现该字段是 `protocol-rejected`。
- 留存期内的接续在激活完成时是 `succeeded`。已经激活后再注册是 `not-loginable`。
- 陌生账号接受邀请是 `not-visible`。过期且有权看见的邀请返回已有的过期终结。看不见时是 `not-visible`。
- `query-current-tenant` 不带行事租户。
- `issue-login` 的 `basis-unavailable` 不来自凭据已匹配的分支。
- 版本是 `governance-public/1` 时，`disable-subject`、`restore-subject`、`end-subject` 和 `reopen-after-media-loss` 在坏正文和坏证明下都是 `stage-not-provided`。版本不是 `governance-public/1` 时是 `protocol-rejected`。

治理位置另有下列验证义务。

- 18 个治理操作的每种端口结果映射到公开契约的 `outcome`、`body` 与状态码。
- 声明不提供的 14 个操作答 `stage-not-provided`，登录识别没有被调用。负控：治理操作用同一份证明时，登录识别被调用。
- 4 个设置操作把登录识别出的主体与行事租户交给端口。端口缺席时答 `stage-not-provided`，登录识别没有被调用。端口拒绝时，写入答 `unknown`，读取答 `basis-unavailable`。响应与诊断里没有 `set-setting` 的秘密。
- 治理位置的 `denied` 在各个原因下，响应除 `messageId` 外逐字节相同。属于其他账号的目标与不存在的目标得到相同的 `not-visible`。
- 登录识别抛出时是状态 503 和 `basis-unavailable`。`create-organization` 的端口被拒绝时是带响应体的 `unknown`，其余操作是空响应体的状态 500 并关闭连接。
- 诊断里没有登录证明、凭据、登录标识与登录的 `loginId`。
- 只有会话位置的 `succeeded` 与建立成功的观察报告成功业务访问。报告失败不改变答复。
- `revoke-login` 成功时，目标登录的观察立刻得到 `ended(denied)`。登录到期后，观察在下一轮得到 `ended(denied)`。
- 其他登录用同一 `observationId` 的 `cancel-observation` 答 `succeeded` 与 `state: not-found`，不结束原观察，也不调用 Session。

会话位置与 HTTP 层另有下列验证义务。实现闭包用测试兑现它们。

- 状态码映射覆盖公开契约的全部 `outcome`，少一个就变红。
- 会话位置的 `denied` 在各个原因下，响应除 `messageId` 外逐字节相同。
- 超限的请求体得到 413 和该位置的 `protocol-rejected`，没有业务调用。
- 配置了非回环监听地址时，启动失败。
- Tool 目标的 `stop-call` 得到 `unsupported`，会话存在与否都一样，没有记录写入。
- 负控：让 identity 的登录识别抛出异常，响应是状态 503 和 `basis-unavailable`，不是状态 500。
- 负控：让 Session 的 `accept` 在调用开始后抛出异常，`send-input` 的响应是状态 500 和带响应体的 `unknown`，不是 503 和 `basis-unavailable`。
- `OPTIONS` 请求得到 405，不调用任何成员。
- 会话路径上一份大于治理路径上限、不大于会话路径上限的 `create-session` 进入公开契约的判断次序，不得到 413。
- 两个观察操作的手写读取拒绝每一条封闭规则的违例，结果是 `protocol-rejected`，Session 不被调用。
- 接入的碰撞测试：每个会话族只改一个字段，`SessionOperationId` 就变。只换 `messageId`，它不变。

会话诊断投影另有下列验证义务。纯投影用各来源的替身验证；操作层用 HTTP 层替身验证。

- Run 骨架只来自 Session；`call.bound` 的 Model 分支与 Tool 分支各自解析。
- `model-refused` 的结构化原因是 `{ kind: 'model-refused', failure: 'capacity' }` 一类的闭合字段；`no-reply` 带 `cause` 与 `upstreamStatus`。Model 替身放行读取时，它与同一调用的派发结局一致。
- 一次 Tool 调用的 `tool-intent` 登记与关联登记合成一个调用，只计一次，不触发 `truncated`。
- 来源答 `unsupported`、`unavailable`、`denied` 或抛出异常时，生成对应缺口，其他来源的结果不受影响。
- `readFinish` 缺席时结构化原因为 `unknown`，原因 `unsupported`。
- 超过 `maxCallsPerRun` 的调用计数正确并记 `truncated`；不披露的种类记 `not-disclosed`。
- `fault.diagnostic`、消息正文、工具参数不出现在视图里。
- 判断次序与 `read-history` 一致；`denied` 与 `read-history` 的 `denied` 逐字节相同；`pageBytes` 越界是 `invalid`；篡改过的游标是 `invalid`；续页重新核 Session 资格。
- 操作前后，Session、Model、Tool 替身的写计数不变。

## 观察脱离与重附着（#746）

本节的「组合责任与输入边界」「重附着与脱离」「失败交接与未覆盖」三个小节是 [#746 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/746) 的技术设计，已由 PanQiWei [接受](https://github.com/nemori-ai/omne-harness-lite/issues/746#issuecomment-6443957269)。「[刷新策略与资源](#刷新策略与资源)」小节的依据见该小节开头。本节不增加导出接口或运行实现。观察的公开操作、帧与连接生命周期归公开契约的[会话观察](../public-contract/SPEC.md#会话观察)。

### 组合责任与输入边界

服务端接入承担观察的脱离与重附着组合。它消费 Session 的公开日志读面、Model 的 `current` 与内容观察端口，不读取它们的内部状态。Session 拥有已提交日志事实，Model 拥有调用状态与当前观察目标。Agent 不参与这条重附着路径，也不签发观察资格。调用、结果保管与业务控制仍由原拥有者承担。

接入从已授权读取的会话日志取得稳定 `ModelInvocationRef`。日志中的稳定调用引用是重附着的事实依据。会话日志不保存瞬时流引用。首次挂接与重附着都经稳定调用引用查询 `current`。读取路径见 Session 的[稳定调用引用的读取](../../session/session-contract/SPEC.md#稳定调用引用的读取)。公开日志读面在能力上不提供这条读取路径时，接入停止该组合并交接 Session 拥有者，不从 Agent 实例、私有存储或旧流目录补造引用。读面提供这条路径、但运行时暂时没有所需登记时，接入按[刷新策略](#刷新策略)第 1 种触发刷新，不停止该组合。

登录识别、主体签发与目标租户的关系沿[登录到 Access](../../../docs/architecture/runtime/runtime-contract-handoff.md#登录到-access)。接入只在登录识别与账号关系核对成功后取得代租户行事主体，不接受请求体自报主体。接入为每个参与边界提供该观察者自己的显式 `Access`，不借用 Agent 或生产者的主体。会话归属、调用引用和流引用的租户须一致。持有任一种引用都不授予权限。

Session 日志读路径核其读取资格。Model `current` 核当前 facts/read 资格与引用。生产者观察端口核其观察资格及租户。接入不以某一步成功代替其他边界核权，也不以登录识别时的允许结果维持持续许可。等待后的受保护输出须遵守原端口重核规则。撤权、核权依据不可用与读取失败保持各边界原含义，不转换为观察成功或成功的 null。

### 重附着与脱离

1. 接入在当前登录与租户边界下读取日志中的稳定调用引用，携带自己的 `Access` 查询 Model `current`。定位或读取失败按原失败交回，不猜调用是否存在或执行。
2. 接入使用同一确认边界给出的 `CallState` 与当前目标。`current` 为 null 时，只呈现这份调用状态，不观察不存在的 ref。null 不表示未执行、终局或永久无目标。
3. 目标非 null 时，接入向该 ref 的生产者观察端口取得快照，再消费增量。快照与订阅衔接沿原观察端口的保证，不采用先普通读取再普通订阅来补造连续性。成功只表示取得有权读取的快照并建立该目标的观察，不表示业务工作完成。
4. 查询不提供可达性租约。旧 ref 失效时结束旧观察，再从稳定调用引用查询 `current`。目标改变后从新 ref 的快照开始，不能沿用旧 cursor、旧快照基线或把旧观察偷偷转向后继。
5. 接入串行查询，或只应用最新已发查询的响应。观察路径采用串行，见[在途读取的取消与迟到隔离](#在途读取的取消与迟到隔离)。切换目标或脱离后，迟到的旧查询、快照与增量不能覆盖当前观察。接入释放它们占用的本地观察资源。
6. 接入拥有有界刷新策略及其计时、在途读取与观察资源。null 窗口或 ref 失效后按该策略再查，不能无界忙轮询。刷新边界耗尽或依赖持续不可用时，明确交回尚未建立或维持观察的事实，不能改写调用结局。策略参数与资源上界见[刷新策略与资源](#刷新策略与资源)，对外表示见公开契约的[会话观察](../public-contract/SPEC.md#会话观察)。
7. 观察者主动脱离、连接结束或登录撤销时，接入停止该观察的刷新，取消本地等待并释放订阅、计时与队列资源。取消能力不足或清理失败须保留诊断，不声称已经清理。迟到的受保护输出不得继续披露。重新进入观察须重新经过各边界核权。

观察取消只结束观察。上述全部步骤都不得发起、取消、重试或重发 Model 或 Tool 业务调用，不触发 Session 推进，不改变结果保管或 ACK。目录为空、null、断线与观察失败均不能成为重发原调用的依据。

### 刷新策略与资源

本小节由 [#839](https://github.com/nemori-ai/omne-harness-lite/issues/839#issuecomment-6444555742) 按 [#746 接受评论](https://github.com/nemori-ai/omne-harness-lite/issues/746#issuecomment-6443957269)的委托由 reduce 拍定，待 PanQiWei 复核。本小节是接入的策略与资源规则，不是公开协议规则。帧、取消与连接生命周期归公开契约的[会话观察](../public-contract/SPEC.md#会话观察)，各来源结果的对外表示见公开契约的[来源与对外表示](../public-contract/SPEC.md#来源与对外表示)。

#### 刷新策略

刷新策略是部署配置的对象。下列数值都只是默认初值，不是契约承诺。

```text
ObservationRefreshPolicy {
  interval:       等待多久再定位或再查询一次（默认初值 1000 ms，下限初值 100 ms。下限不能低于不可配置的底线 100 ms）
  backoff:        每次空结果后间隔的放大系数（默认初值 1.5，间隔上限初值为 interval 的 30 倍）
  maxAttempts:    没有取得新目标时最多刷新几次（默认初值 60。null 表示不设次数上界，只受 deadline 约束）
  deadline:       刷新等待的累计时长上界，观察期间不计（默认初值 30 分钟）
  currentTimeout: 每次 current 读取的本地等待上界（默认初值 5 s）
}
```

- 策略对象由部署装配提供，接入不写死数值。没有配置时，接入使用默认初值。
- 配置值越出下限或上限时，接入把它钳到边界内，并记诊断 `observation.policy-clamped`。
- `interval` 的下限有一条不可配置的底线 100 ms。部署配置的下限与 `interval` 初值都不能低于这条底线，低于时接入同样钳制并记诊断。
- `deadline` 只累计刷新等待的时长。观察期间（有目标且流未结束）不计入。尝试计数只计连续没有取得新内容的尝试：取得新目标，或重新观察后收到新的快照或增量时，尝试计数与 `deadline` 计时都归零。
- `maxAttempts` 与 `deadline` 两条上界先到者为准。默认初值下，间隔在第 10 次尝试前后到达上限 30 s，60 次尝试的等待共约 27 分钟，与 `deadline` 初值 30 分钟相近，两条上界大致同时到达。
- 工具可能运行很久，期间没有模型流。上界耗尽后，调用者重新建立观察即可，已落盘的内容不丢失。

刷新在下列四种情况下触发：

1. 定位没有得到用途为 `main` 的 Model 调用登记。翻页预算耗尽、Session 读取 `unavailable` 与接入自己的游标 `invalid` 也属于这一种。生产者观察的迭代器抛出，或没有交来 `ended` 就结束时，接入视为目标不可用，也按这一种处理。
2. `current` 没有给出新目标：返回 null、`unavailable` 或 `invalid(reference, not-accepted)`，或返回同一个已关闭的流引用。
3. 目标流结束：生产者交来 `ended(source-closed)`、`ended(stale-stream)`、`ended(producer-ended)`、stream-arrival 以后新增的结束原因，或 `buffer` 以外的 `gap`。
4. 生产者观察中断，但目标仍有效：生产者交来 `ended(capacity)`、`ended(unavailable)` 或 `gap(buffer)`。这一种不重新定位，只重新观察同一流引用并取新快照。它计为一次尝试，先按同一退避间隔等待，再重新观察。重新观察后收到新的快照或增量时，尝试计数归零，所以一条仍在交付的长流不会因多次中断而耗尽上界。接入不做无等待的循环。

- 第 1 至 3 种的每轮刷新包括重新定位稳定调用引用与查询 `current`。
- 新目标按流引用判定。重新定位得到同一个已关闭的流引用时，接入把它当作空结果，按退避继续，不发 `snapshot`，也不将尝试计数归零。
- 目标有效且生产者仍在交付帧时，接入不刷新。
- 每轮刷新前，接入向调用者发一次 `refreshing` 帧。上界耗尽时，接入发 `ended(refresh-exhausted)`，明确交回尚未建立或维持观察的事实，不改写调用结局。
- 建立成功后的第一条帧是 `state` 或 `ended`。`state` 先于一切 `snapshot`、`delta`、`gap`、`refreshing`。首次查询被拒、建立后立即取消或替换、撤权时，第一条帧也可以是 `ended`。连接在首帧之前关闭时，可以没有帧。
- 首帧之后，接入只在调用阶段变化或目标有无变化时发 `state` 帧。

每个观察的状态与转换如下。转换上标出接入发出的帧。

```mermaid
stateDiagram-v2
  state "定位" as locate
  state "查询 current" as query
  state "观察中" as observing
  state "重新观察同一目标" as reobserve
  state "等待下一轮" as waiting
  state "已结束" as ended
  [*] --> locate: 建立成功
  locate --> query: 得到 main 登记
  locate --> waiting: 没有登记，首轮发 state，之后发 refreshing
  query --> observing: 新目标：目标有无或阶段变化时发 state，再发 snapshot，计数与 deadline 归零
  query --> waiting: 没有新目标，阶段或目标有无变化时发 state，再发 refreshing
  query --> ended: current 拒绝或其他 invalid，发 ended
  observing --> observing: 生产者 delta，发 delta
  observing --> waiting: 目标流结束，发 refreshing
  observing --> reobserve: 生产者观察中断，发 refreshing
  reobserve --> observing: 间隔到期，取得同一目标的新快照，发 snapshot
  reobserve --> ended: 次数或 deadline 耗尽，发 ended(refresh-exhausted)
  waiting --> locate: 间隔到期
  waiting --> ended: 次数或 deadline 耗尽，发 ended(refresh-exhausted)
  observing --> ended: 撤权、取消、替换或帧队列超界，发对应的 ended
  ended --> [*]
```

任一状态遇到取消、替换、撤权或连接关闭都进入已结束。连接关闭时发不出 `ended` 帧。

#### 在途读取的取消与迟到隔离

- `current` 没有 signal。接入对每次 `current` 读取设本地等待上界 `currentTimeout`，它是[刷新策略](#刷新策略)对象的一个字段。超时只放弃等待，不证明底层读取已停止。接入记诊断 `observation.current-timeout`，并把这次超时计为一次空结果。它不向调用者声称成功或失败。
- 观察路径采用串行，不采用「只应用最新已发查询的响应」。接入对同一观察的定位与 `current` 读取串行执行。上一轮未返回时不发下一轮，超时视为已返回。
- 切换目标或观察结束后到达的旧快照与旧增量，接入丢弃它们，并记诊断 `observation.late-discarded`。
- 生产者观察使用 `StreamObserver.observe({ ref, access, signal })`。`signal` 是接入的本地取消。观察结束或目标切换时，接入中止该 signal 并释放迭代器。中止不取消原调用。

#### 资源上界

资源上界也是部署配置的对象。下列数值都只是默认初值。

```text
ObservationResourceLimits {
  perLogin:          每个登录同时最多几个观察（默认初值 4）
  perInstance:       每个部署实例同时最多几个观察（默认初值 1000）
  frameQueueBytes:   每个观察的本地帧队列字节上界（默认初值 1 MiB）
  locatePages:       每轮刷新的定位最多读几页 call.bound（默认初值 4）
  cancelRetention:   观察结束后观察记录的保留期（默认初值 60 s）
}
```

- 达到 `perLogin` 或 `perInstance` 时，`observe-session` 返回 `basis-unavailable`。计数时，同一登录下同一会话中同一 `observationId` 的旧观察不计入，建立成功时它被替换。
- 调用者消费过慢而超出 `frameQueueBytes` 时，接入发 `ended(capacity)`。接入不丢弃中间帧冒充连续。
- 定位读满 `locatePages` 页仍未见用途为 `main` 的 Model 登记时，按没有稳定引用处理。本版不建索引。
- 观察结束后，接入在 `cancelRetention` 内保留观察记录，供 `cancel-observation` 重放得到 `ended`。保留期过后得到 `not-found`。
- 清理失败时，接入记诊断 `observation.cleanup-failed` 并计数，不声称已经清理。

### 失败交接与未覆盖

Model `current` 的 denied、invalid、unavailable 保持[原失败与读取顺序](../../model/model-contract/SPEC.md#current-的失败与读取顺序)，不得折成成功 null。生产者拒绝、快照失败、流结束与连接丢失按原观察和传输边界交回。流结束只结束该次观察，调用结局仍取权威调用状态。传输中没有可信答复时，调用者不能据此声称观察或业务成功。

Session 公开日志读面的引用定位、分页与读取资格见[稳定调用引用的读取](../../session/session-contract/SPEC.md#稳定调用引用的读取)。公开观察消息、取消表达、连接生命周期与传输恢复规则见公开契约的[会话观察](../public-contract/SPEC.md#会话观察)。实际刷新、撤权、迟到响应隔离与资源清理的实现及验证由接入实现卡（待立）承担。观察连续的组合运行证据归 [#790](https://github.com/nemori-ai/omne-harness-lite/issues/790) H3。宿主身份、启停及归属等、模型选择分责与旧实例数据调查归 [#803](https://github.com/nemori-ai/omne-harness-lite/issues/803)。

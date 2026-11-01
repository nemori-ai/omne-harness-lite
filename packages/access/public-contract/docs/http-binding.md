# HTTP JSON 与 SSE 承载绑定

状态：候选（#978 的设计点 DP-2），等待 Reduce 批复。批复前，实现闭包不按本页写代码。

本页是两端共用的承载页，由 public-contract 拥有。它写公开契约两个位置的 HTTP 承载：路径、方法、内容类型、状态码与 `outcome` 的对应、请求体上限、SSE 事件格式与心跳，以及两端各自遵守的客户端规则。字段、`outcome` 的含义、判断次序和帧的含义归[公开契约](../SPEC.md)。传输路线沿[技术基础](../../../../docs/architecture/technical-foundations.md#共同技术选择)：HTTP JSON 控制与查询，fetch SSE 单向观察。

服务端接入的[行为规格](../../server-entry/SPEC.md)、[SDK 规格](../../sdk/SPEC.md)和 [CLI 规格](../../../../apps/cli/SPEC.md)都引用本页的[承载绑定表](#承载绑定表)。它们不复制这张表，也不复述本页的规则。

## 责任与范围

本页回答三件事。

1. 每个公开操作经哪个路径、方法和内容类型到达服务端，服务端怎样回写，请求体上限和 SSE 事件格式是什么。
2. 状态码怎样对应 `outcome`，调用者怎样读响应。
3. `SessionOperationId` 怎样从请求派生。

本页不做下面的事。

- 不重新定义公开契约的字段和 `outcome`。
- 不规定登录证明的密码学形式，也不选定传输保护协议。本页选定 HTTP 承载，不选定保护协议。
- 不规定哪个部署提供哪些操作，不规定服务端的监听地址、日志和内部故障处理。这些归[服务端接入规格](../../server-entry/SPEC.md#位置与操作范围)。
- 不规定 SDK 或 CLI 自己的行为。它们各自的规格引用本页。

## 传输与位置

本页的承载是 HTTP/1.1。M2 不提供 TLS，服务只在本机回环地址上提供，见[已知限制](#已知限制)。

- 公开契约有两个位置。治理位置读写 `governance-public/1`，会话位置读写 `session-public/1`。会话观察的两个操作属于会话位置。
- 每个位置对应一个固定路径。服务端按路径选择读取函数，不按消息里的版本文本分派。
- 登录证明在消息体里，不在 HTTP 头里。服务端不读 `Authorization` 头，也不设置 Cookie。

## 承载绑定表

本表是两个位置全部操作的承载映射。每个操作名与公开契约一致。每一行的方法都是 POST，请求内容类型都是 `application/json`。状态码见[状态码映射](#状态码映射)，上限类见[请求体上限](#请求体上限)。

| 位置 | 操作 | 路径 | 方法 | 请求内容类型 | 响应内容类型 | 请求体上限 |
| --- | --- | --- | --- | --- | --- | --- |
| 治理 | `register-and-activate`、`issue-login`、`public-health` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `revoke-login`、`replace-credential`、`query-own-valid-logins` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `create-organization`、`query-create-organization`、`switch-current-tenant`、`query-current-tenant`、`query-own-memberships`、`query-organization`、`query-organization-members`、`leave-organization`、`remove-member`、`change-member-role` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `issue-member-invitation`、`accept-member-invitation`、`reject-member-invitation`、`withdraw-member-invitation`、`query-invitation`、`query-received-invitations`、`query-issued-invitations` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `open-affiliation-request`、`accept-affiliation-request`、`reject-affiliation-request`、`withdraw-affiliation-request`、`release-affiliation`、`query-received-affiliation-requests`、`query-issued-affiliation-requests`、`query-affiliation-request` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `judge-admission`、`submit-authorization-expression`、`withdraw-authorization-expression` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `disable-subject`、`restore-subject`、`end-subject`、`reopen-after-media-loss` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 会话 | `create-session`、`query-create-session`、`query-send-input`、`read-history`、`cancel-run`、`stop-call`、`cancel-observation` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 会话 | `send-input` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | input |
| 会话 | `observe-session` | `/session-public/1` | POST | `application/json` | `text/event-stream; charset=utf-8`，见[SSE 观察](#sse-观察) | small |

M2 的部署在治理位置只提供 `register-and-activate` 和 `issue-login`。其余治理操作在本表里有同样的承载，部署的作答规则见[治理位置的操作范围](#治理位置的操作范围)。

## 请求与响应规则

服务端按下面的次序处理一个 HTTP 请求。前一步给出终结时，不做后面的步骤。

1. 路径不是两个固定路径之一，或带有非空查询串：状态 404，响应体为空，不处理消息。
2. 方法不是 POST：状态 405，带 `Allow: POST`，响应体为空，不处理消息。
3. `Host` 头的主机名不是 `127.0.0.1` 或 `localhost`：状态 421，响应体为空，不处理消息。这一步防止 DNS 重绑定页面借用本机服务。
4. `Content-Type` 的媒体类型不是 `application/json`，或带有 `utf-8` 以外的 `charset`：状态 415，响应是该位置的 `protocol-rejected`。
5. 请求体超过[请求体上限](#请求体上限)：状态 413，响应是该位置的 `protocol-rejected`，并关闭连接。
6. 把字节交给公开契约的读取函数，进入公开契约的判断次序。

第 1 步到第 5 步在读消息之前发生，状态码由这几步决定。第 6 步之后，状态码只由 `outcome` 决定，见[状态码映射](#状态码映射)。

其他规则如下。

- 一个请求体恰好是一条公开消息。
- 响应体是公开契约的编码函数给出的字节。服务端不手写 JSON。
- 所有响应带 `Cache-Control: no-store`。
- 该位置的 `protocol-rejected` 指：`protocolVersion` 是该位置的版本，没有 `messageId`，`body` 是空对象。第 6 步之前服务端不读消息，所以这些响应不带 `messageId`。
- 服务端不按 `Accept` 头选择响应类型。
- 服务端没有读出 `operation` 时，不能判断消息是不是 `observe-session`。第 1 步到第 5 步的失败因此都是 JSON 响应。
- 状态 500 且响应体为空，表示服务端接入自身出了故障。调用者没有可信答复。何时给出 500 归[服务端接入规格](../../server-entry/SPEC.md#服务端的-http-层责任)。

## 状态码映射

第 6 步之后，状态码只由 `outcome` 决定，与对象是否存在无关。同一个 `outcome` 总是得到同一个状态码、同一组响应头和同样形状的响应体。状态码因此不泄露公开契约要求隐藏的事实。

下表列出公开契约的全部 `outcome`。

| outcome | 状态码 | 说明 |
| --- | --- | --- |
| `succeeded` | 200 | 成功条件成立 |
| `no-change` | 200 | 核验通过，目标状态没有新变化 |
| `not-committed` | 200 | 查询已得确定答复，原操作没有提交 |
| `need-decision` | 202 | 本部署没有产生这个结果的操作，保留给以后 |
| `protocol-rejected` | 400 | 消息层的读取失败 |
| `invalid` | 422 | 消息合乎协议，内容不被接受 |
| `uniform-auth-failure` | 401 | 登录未签发 |
| `denied` | 403 | 见下文的「denied 的一致性」 |
| `not-loginable` | 403 | 这次没有报告账号可登录 |
| `not-visible` | 404 | 与目标不存在使用同一表现 |
| `not-found` | 404 | 已授权会话里没有这个 Run 或调用 |
| `conflict` | 409 | 调用标识对应的内容与已提交的不同，或预期状态已变 |
| `archived` | 409 | 会话已归档 |
| `frozen` | 409 | 会话已冻结 |
| `unsupported` | 501 | 当前契约版本不受理，原样再送也不会成功 |
| `stage-not-provided` | 501 | 本部署不提供该操作 |
| `basis-unavailable` | 503 | 现在不能得出允许 |
| `unknown` | 500 | 提交结果尚未认回 |

不同的 `outcome` 可以共用一个状态码。调用者不能由状态码推出 `outcome`。第 4 步和第 5 步的 413 与 415 不属于本表，它们的响应体是 `protocol-rejected`。

### denied 的一致性

下面这些情况在会话位置都得到 `denied`，状态 403，响应体除 `messageId` 外逐字节相同：登录缺失、空、无效或不是本部署签发、行事租户不符、目标租户的账号不是识别出的账号、主体在该租户下没有资格、会话不存在、会话属于其他租户。响应不加入原因，不加入额外的头，也不按对象是否存在改变状态码。

`stop-call` 的 Tool 目标在访问裁定之后得到 501 和 `unsupported`。无论会话是否存在，无论该 `controlId` 是否用过，结果都相同。

## 请求体上限

请求体上限分两类。数值是部署配置，名字与约束见[名字与约束](#名字与约束)。

| 类 | 适用操作 |
| --- | --- |
| small | 除 `send-input` 外的全部操作 |
| input | `send-input` |

- 服务端按实际读到的字节计数。它不信任 `Content-Length`。`Content-Length` 已经大于上限时，服务端不读请求体，直接拒绝。
- 超限时，服务端停止读取，返回状态 413 和该位置的 `protocol-rejected`，然后关闭连接。没有业务效果，也没有其他成员被调用。
- 响应不说明命中了哪一类上限。
- 同一类的 json-text `maxBytes` 取同一个数值。json-text 的其余五项预算由接入配置给出。
- 超限的 `observe-session` 得到 JSON 响应，不是 SSE。

## SSE 观察

本节写 `observe-session` 的承载。帧的字段、先后和含义归公开契约的[会话观察](../SPEC.md#会话观察)。

### 响应类型

服务端对请求体做严格 JSON 读取。根对象的 `protocolVersion` 恰为 `session-public/1`，并且 `operation` 恰为 `observe-session` 时，响应是 SSE。其他情况的响应都是 JSON。

- SSE 响应的状态码由第一条事件的 `outcome` 按[状态码映射](#状态码映射)决定。响应头和第一条事件一起发出。
- 请求体通过 JSON 读取，但字段不合规时，第一条事件是 `protocol-rejected`。公开契约的判断次序第 1 步决定这个结果。
- 严格读取失败、内容类型错误或超限时，响应是 JSON，见[请求与响应规则](#请求与响应规则)。

### 事件格式

- 每条公开消息是一个 SSE 事件。事件只有 `data` 字段。`data` 是该消息的 JSON 文本，写在一行里，后接一个空行。
- 第一条事件是 `observe-session` 的确认响应。之后的事件是 `observation-frame` 消息。
- 服务端不写 `event`、`id` 和 `retry` 字段。观察没有跨连接的续接游标。
- 确认响应不是 `succeeded` 时，服务端发完这条事件后结束响应，没有帧。
- 服务端发出 `ended` 帧后结束响应。

### 心跳

- 确认事件发出后，服务端在连续 `heartbeatIntervalMs` 毫秒没有写出任何字节时，写一条注释行加一个空行。注释行的文本是 `: heartbeat`。
- 心跳不是帧。它没有 `seq`，不占帧队列字节，也不改变帧的先后。
- 心跳和帧经同一个串行写入者写出。心跳不会出现在一个事件的字节之间。
- 心跳的写入失败说明连接已经断开。服务端按公开契约的[连接生命周期](../SPEC.md#连接生命周期与传输恢复)处理。

连接关闭、重连和观察取消的语义归公开契约的[观察的取消](../SPEC.md#观察的取消)与[连接生命周期](../SPEC.md#连接生命周期与传输恢复)。在 SSE 上，取消观察使用另一个连接上的 `cancel-observation`，响应是普通 JSON。

## 会话中断操作

`cancel-run` 和 `stop-call` 使用会话位置的同一个路径和 JSON 响应，见[承载绑定表](#承载绑定表)。判断次序和结果归公开契约的[会话中断操作](../SPEC.md#会话中断操作)。Tool 目标的 `stop-call` 得到状态 501 和 `unsupported`，依据是 #784 评论 6554505364。

## 治理位置的操作范围

M2 的治理位置只有两个公开操作：`register-and-activate` 和 `issue-login`。

- 两个操作都不带登录证明，也不带行事租户。
- `issue-login` 的成功响应含 `loginProof`。它只在这一次响应里出现。
- 识别登录不是公开操作，没有路径。会话位置的每个需要登录证明的操作，在判断次序里调用 identity 的登录识别。这是服务端接入的内部步骤。

其余治理操作按 D-10 答「本部署不提供」，结果是 `stage-not-provided`，状态 501。过渡期的偏离、拥有者与闭合条件见[服务端接入规格](../../server-entry/SPEC.md#治理位置的偏离)。

## 客户端规则

两端的客户端遵守下面的规则。SDK 与 CLI 的规格引用本节，不复述。

- 调用者只读响应体里的 `outcome`。调用者不用状态码决定业务含义，也不用状态码决定是否再送。
- 调用者按响应的 `Content-Type` 选择读取方式，不按自己的预期选择。
- 调用者没有收到可信答复时，保持本地 `unknown`。连接重置、超时、状态 500 且没有可读的匹配消息，都属于这种情况。这就是传输失败的对外结果。它不是 `basis-unavailable`。
- 再送只按公开契约的[未知、重复、重试、缓存和列表](../SPEC.md#未知重复重试缓存和列表)规则。`unsupported` 不是可重试的成功，客户端不再送同一请求。
- 客户端忽略心跳注释行，不把它交给调用者。
- 客户端不自动重连。连接断开后，客户端不自动发出任何公开操作。重连是调用者发起的新 `observe-session`，不重发原 Model 或 Tool 调用。
- 观察的取消只结束观察，不是业务控制。业务控制只有[会话中断操作](#会话中断操作)。

## SessionOperationId 的派生规则

会话操作的 `SessionOperationId` 不由客户端填写。服务端接入从识别出的登录和请求标识派生它，用 [Session 的 `deriveIngressOperation`](../../../session/session-contract/docs/public-api.md)。请求体出现 `login` 或 `operation` 一类字段时，公开契约已经规定为 `protocol-rejected`。

本页只写规则。族的文本、摘要形式和字段编码归 `deriveIngressOperation`。算法的碰撞测试归 Session。

1. 派生是确定性的。同一业务意图在崩溃前后得到同一个身份。
2. 每个操作属于一个族，族与字段取法如下表。字段按表中的次序传入。

| 族 | 适用操作 | 字段 |
| --- | --- | --- |
| create | `create-session`、`query-create-session` | 租户文本、`createCallId` |
| accept | `send-input`、`query-send-input` | 租户文本、会话文本、`acceptId` |
| control | `cancel-run`、`stop-call` | 登录文本、租户文本、会话文本、`controlId` |

3. create 与 accept 的字段取法同[派生身份](../../../../docs/architecture/runtime/runtime-contract-handoff.md#派生身份)已有的两行。control 一行待 Reduce 并入那张表，并入后本表删去这一行，只引用。登录文本是识别出的登录的 loginStateCodec 文本。
4. control 含登录文本，因为不同登录不共享中断回执。create 与 accept 不含登录文本，因为租户文本已经含账号。
5. `messageId` 不进入任何身份。换新的 `messageId` 或重连不产生新身份。
6. `cancel-run` 和 `stop-call` 共用 control 族，所以共用 `controlId` 的唯一范围。同一登录在同一会话里，同一 `controlId` 跨两个操作复用，由 Session 得到 `conflict`。

## 名字与约束

本页只定名字与约束。初值归装配配置，本页不写初值。

| 名字 | 含义 | 约束 |
| --- | --- | --- |
| 治理路径 | 治理位置的路径 | 固定为 `/governance-public/1` |
| 会话路径 | 会话位置的路径 | 固定为 `/session-public/1` |
| `maxBodyBytes.small` | small 类请求体上限 | 正整数字节 |
| `maxBodyBytes.input` | input 类请求体上限 | 正整数字节，不小于 `maxBodyBytes.small` |
| `heartbeatIntervalMs` | 心跳间隔 | 正整数毫秒 |

监听端口和监听地址是服务端部署配置，名字与约束归[服务端接入规格](../../server-entry/SPEC.md#服务端的-http-层责任)。

## 拥有者与取舍

本页放在 public-contract 的 `docs/http-binding.md`。选择它的理由是：本页写的是两端共用的承载保证和客户端规则。[分层与依赖](../../../../docs/architecture/layers-and-dependencies.md)要求 SDK 和服务端适配依赖同一契约。[成员文档要求](../../../../docs/member-documentation.md)要求提供者的文档不另写公共保证。

被否方案如下。

| 方案 | 否决原因 | 反例 |
| --- | --- | --- |
| 放在 server-entry | 现行正文把端点与订阅语义分给 public-contract。放在服务端，SDK 的线上行为由同级实现者的文档支配 | 观察客户端的重连规则要改时，得改服务端成员的页 |
| 放在 SDK 内 | SDK 只是客户端，不决定服务端接受什么 | 服务端改路径而 SDK 页面未改，两边各自「正确」 |
| 在三份规格里各写一份 | 三份会漂移 | 本卡之前，三份规格对会话位置都是零命中，说明没有一处承担它 |
| 每个操作一个路径 | `operation` 字段已经在消息里。路径再写一次，会出现两者不一致的情形，要多一条规则处理。公开契约本来就建议按位置分设路径 | 路径写 `cancel-run`，消息写 `stop-call`，服务端必须选一个 |
| 为观察另设路径 | 公开契约规定观察与会话操作使用同一承载位置 | 客户端要为同一会话位置维护两个地址 |

本页是 Markdown 正文，不进 API 快照，所以加入它是 public-contract 的可加改动。[公开契约规格](../SPEC.md)里「不选定承载协议」一类的句子相应改为：选定 HTTP 承载，不选定保护协议。这一项随 DP-2 交 Reduce 批复。

## 已知限制

- 明文传输。服务端只绑回环地址，所以登录证明和凭据不离开本机。同一台机器上有权限抓取回环流量的进程能读到它们。远程访问和 TLS 不在 M2。
- 没有健康检查操作。`public-health` 本部署答 `stage-not-provided`。判断服务是否在线只能连接端口。
- 多实例部署的粘性路由由部署另行给出，见公开契约的[协议给与装配给](../SPEC.md#协议给与装配给)。
- 客户端对 SSE 的空闲检测没有规定。客户端只能靠连接断开发现问题。
- 公开契约的观察消息函数尚未提供。接入先按公开契约手写读取。
- HTTP 层的限流、压缩和 HTTP/2 不在 M2。

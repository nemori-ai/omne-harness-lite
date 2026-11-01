# HTTP JSON 与 SSE 承载绑定

状态：已采用。依据是 #978 的 DP-2 决策记录（评论 6561904972）与 R1-D27（评论 6562041248）。

本页是两端共用的承载页，由 public-contract 拥有。它写公开契约两个位置的 HTTP 承载：路径、方法、内容类型、状态码与 `outcome` 的对应、请求体上限、观察消息的读写、SSE 事件格式与心跳，以及客户端规则。字段、`outcome` 的含义、判断次序和帧的含义归[公开契约](../SPEC.md)。传输路线沿[技术基础](../../../../docs/architecture/technical-foundations.md#共同技术选择)：HTTP JSON 控制与查询，fetch SSE 单向观察。

服务端接入的[行为规格](../../server-entry/SPEC.md)、[SDK 规格](../../sdk/SPEC.md)和 [CLI 规格](../../../../apps/cli/SPEC.md)都引用本页的[承载绑定表](#承载绑定表)。它们不复制这张表，也不复述本页的规则。

## 责任与范围

本页回答三件事。

1. 每个公开操作经哪个路径、方法和内容类型到达服务端，服务端怎样回写，请求体上限和 SSE 事件格式是什么。
2. 状态码怎样对应 `outcome`，调用者怎样读响应。
3. 公开契约的编解码函数不覆盖观察消息时，两端怎样读写这些消息。

本页不做下面的事。

- 不重新定义公开契约的字段和 `outcome`。
- 不规定登录证明的密码学形式，也不选定传输保护协议。本页选定 HTTP 承载，不选定保护协议。
- 不规定哪个部署提供哪些操作。M2 部署的操作范围归服务端接入规格的[位置与操作范围](../../server-entry/SPEC.md#位置与操作范围)。
- 不规定服务端的监听地址、日志、内部故障处理和 `SessionOperationId` 的派生。它们归[服务端接入规格](../../server-entry/SPEC.md)。
- 不规定 SDK 或 CLI 自己的行为。它们各自的规格引用本页。

## 传输与位置

本页的承载是 HTTP/1.1。M2 不提供 TLS，服务只在本机回环地址上提供，见[已知限制](#已知限制)。

- 公开契约有两个位置。治理位置读写 `governance-public/1`，会话位置读写 `session-public/1`。会话观察的两个操作属于会话位置。
- 每个位置对应一个固定路径。服务端按路径选择读取方式，不按消息里的版本文本分派。
- 登录证明在消息体里，不在 HTTP 头里。服务端不读 `Authorization` 头，也不设置 Cookie。

## 承载绑定表

本表是两个位置全部操作的承载映射。每个操作名与公开契约一致。每一行的方法都是 POST，请求内容类型都是 `application/json`。状态码见[状态码映射](#状态码映射)。请求体上限按路径取值，见[请求体上限](#请求体上限)。

| 位置 | 操作 | 路径 | 方法 | 请求内容类型 | 响应内容类型 | 请求体上限 |
| --- | --- | --- | --- | --- | --- | --- |
| 治理 | `register-and-activate`、`issue-login`、`public-health` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `revoke-login`、`replace-credential`、`query-own-valid-logins` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `create-organization`、`query-create-organization`、`switch-current-tenant`、`query-current-tenant`、`query-own-memberships`、`query-organization`、`query-organization-members`、`leave-organization`、`remove-member`、`change-member-role` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `issue-member-invitation`、`accept-member-invitation`、`reject-member-invitation`、`withdraw-member-invitation`、`query-invitation`、`query-received-invitations`、`query-issued-invitations` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `open-affiliation-request`、`accept-affiliation-request`、`reject-affiliation-request`、`withdraw-affiliation-request`、`release-affiliation`、`query-received-affiliation-requests`、`query-issued-affiliation-requests`、`query-affiliation-request` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `judge-admission`、`submit-authorization-expression`、`withdraw-authorization-expression` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 治理 | `disable-subject`、`restore-subject`、`end-subject`、`reopen-after-media-loss` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small |
| 会话 | `create-session`、`query-create-session`、`send-input`、`query-send-input`、`read-history`、`cancel-run`、`stop-call`、`cancel-observation` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | input |
| 会话 | `observe-session` | `/session-public/1` | POST | `application/json` | `text/event-stream; charset=utf-8`，见[SSE 观察](#sse-观察) | input |

本表给每个操作同样的承载，与部署是否提供该操作无关。

## 请求与响应规则

服务端按下面的次序处理一个 HTTP 请求。前一步给出终结时，不做后面的步骤。

1. 路径不是两个固定路径之一，或带有非空查询串：状态 404，响应体为空，不处理消息。
2. 方法不是 POST：状态 405，带 `Allow: POST`，响应体为空，不处理消息。`OPTIONS` 也在这一步得到 405。
3. `Host` 头不合规：状态 421，响应体为空，不处理消息。这一步防止 DNS 重绑定页面借用本机服务。比较规则见[头的比较](#头的比较)。
4. `Content-Type` 头不合规：状态 415，响应是该位置的 `protocol-rejected`。比较规则见[头的比较](#头的比较)。
5. 请求体超过该路径的[请求体上限](#请求体上限)：状态 413，响应是该位置的 `protocol-rejected`，并关闭连接。
6. 读取消息。治理路径把字节交给 `readGovernanceRequest`。会话路径按[会话路径的读取分派](#会话路径的读取分派)选择读取方式。然后进入公开契约的判断次序。

第 1 步到第 5 步在读消息之前发生，状态码由这几步决定。第 6 步之后，状态码只由 `outcome` 决定，见[状态码映射](#状态码映射)。

其他规则如下。

- 一个请求体恰好是一条公开消息。
- 响应体是公开契约的编码函数给出的字节。服务端不手写 JSON。唯一的例外见[观察消息的手写读写](#观察消息的手写读写)。
- 所有响应带 `Cache-Control: no-store`。
- 该位置的 `protocol-rejected` 指：`protocolVersion` 是该位置的版本，没有 `messageId`，`body` 是空对象。第 6 步之前服务端不读消息，所以第 4 步和第 5 步的响应不带 `messageId`。
- 服务端不按 `Accept` 头选择响应类型。
- 服务端在第 6 步之前不知道消息是不是 `observe-session`。所以第 1 步到第 5 步的失败都不是 SSE 响应。
- 状态 500 且响应体为空，表示服务端接入没有可信答复。何时给出它归[服务端接入规格](../../server-entry/SPEC.md#服务端的-http-层责任)。

### 头的比较

- `Host`：请求恰有一个 `Host` 头。去掉端口部分后，主机名按 ASCII 不区分大小写，等于 `127.0.0.1` 或 `localhost`。端口不比较。`Host` 头缺失、重复，或主机名不符，都是第 3 步的失败。
- `Content-Type`：请求恰有一个 `Content-Type` 头。媒体类型按 ASCII 不区分大小写，等于 `application/json`。头可以不带参数。头带参数时，只能带一个 `charset` 参数，它的值按 ASCII 不区分大小写等于 `utf-8`，可以加双引号。头缺失、重复、媒体类型不符、带其他参数或带其他 `charset`，都是第 4 步的失败。

## 状态码映射

第 6 步之后，状态码只由 `outcome` 决定，与对象是否存在无关。同一个 `outcome` 总是得到同一个状态码、同一组响应头和同样形状的响应体。状态码因此不泄露公开契约要求隐藏的事实。

下表列出公开契约的全部 `outcome`。各 `outcome` 的含义只归公开契约的[对外结果](../SPEC.md#对外结果)与会话的[结果](../SPEC.md#结果)。

| outcome | 状态码 |
| --- | --- |
| `succeeded` | 200 |
| `no-change` | 200 |
| `not-committed` | 200 |
| `need-decision` | 202 |
| `protocol-rejected` | 400 |
| `invalid` | 422 |
| `uniform-auth-failure` | 401 |
| `denied` | 403 |
| `not-loginable` | 403 |
| `not-visible` | 404 |
| `not-found` | 404 |
| `conflict` | 409 |
| `archived` | 409 |
| `frozen` | 409 |
| `unsupported` | 501 |
| `stage-not-provided` | 501 |
| `basis-unavailable` | 503 |
| `unknown` | 500 |

- 不同的 `outcome` 可以共用一个状态码。调用者不能由状态码推出 `outcome`。
- 第 4 步和第 5 步的 415 与 413 不属于本表。它们的响应体是 `protocol-rejected`。
- `unknown` 的状态 500 带响应体，响应体是一条可读的公开消息。它与没有响应体的 500 不同，见[请求与响应规则](#请求与响应规则)的最后一条。

### denied 的一致性

下面这些情况在会话位置都得到 `denied`，状态 403，响应体除 `messageId` 外逐字节相同：登录缺失、空、无效或不是本部署签发、行事租户不符、目标租户的账号不是识别出的账号、主体在该租户下没有资格、会话不存在、会话属于其他租户。响应不加入原因，不加入额外的头，也不按对象是否存在改变状态码。

`stop-call` 的 Tool 目标在访问裁定之后得到 501 和 `unsupported`。无论会话是否存在，无论该 `controlId` 是否用过，结果都相同。

## 请求体上限

每个路径有一个请求体上限。数值是部署配置，名字与约束见[名字与约束](#名字与约束)。

| 路径 | 上限的名字 |
| --- | --- |
| 治理路径 | `maxBodyBytes.small` |
| 会话路径 | `maxBodyBytes.input` |

- 服务端在第 5 步按请求路径选择上限。这时服务端还没有读消息，所以不按操作选择上限。会话路径上的全部操作都用 input 上限。读出 `operation` 之后，服务端不再按操作收紧上限。
- 第 6 步的 json-text `maxBytes` 取该路径的上限。json-text 的其余五项预算由接入配置给出。
- 服务端按实际读到的字节计数。它不信任 `Content-Length`。`Content-Length` 已经大于上限时，服务端不读请求体，直接拒绝。
- 超限时，服务端停止读取，返回状态 413 和该位置的 `protocol-rejected`，然后关闭连接。没有业务效果，也没有其他成员被调用。
- 超限的 `observe-session` 得到 JSON 响应，不是 SSE。

## 观察消息的手写读写

公开契约现行的四个会话函数不读写会话观察的消息，见公开契约[会话编解码函数](../SPEC.md#会话编解码函数)中「现行四个会话函数」一段。在公开契约提供观察消息的函数之前，两端按本节手写读写下面三类消息：

- `observe-session` 与 `cancel-observation` 的请求。
- `observe-session` 与 `cancel-observation` 的响应。`observe-session` 的响应就是 SSE 上的确认事件。
- `observation-frame` 消息。

本节是两条规则的例外：第 6 步「交给公开契约的读取函数」，以及「服务端不手写 JSON」。例外只覆盖上面三类消息。收口条件：公开契约那一段所说的观察消息函数（由接入实现卡提供，卡待立）连同 `api/` 快照与测试入轨。入轨后，两端改用这些函数，本节删去。

### 会话路径的读取分派

1. 服务端用 json-text 严格读取请求体，预算同第 6 步。
2. 读取成功，根是对象，根的 `protocolVersion` 恰为字符串 `session-public/1`，并且根的 `operation` 恰为 `observe-session` 或 `cancel-observation` 时，服务端按[手写读取的封闭规则](#手写读取的封闭规则)读取这条消息。
3. 其他情况，服务端把原字节交给 `readSessionRequest`。严格读取失败时的拒绝和 `messageId` 补扫都由它给出。

### 手写读取的封闭规则

服务端按下面的规则读取两个观察请求。规则与公开契约的[共同消息](../SPEC.md#共同消息)和[操作与信封](../SPEC.md#操作与信封)一致。任一条不满足时，结果是 `protocol-rejected`，Session 不被调用。

- 根对象只能有 `protocolVersion`、`messageId`、`operation`、`loginProof` 和 `body` 五个键。`actingTenant` 是禁止字段。其他键都被拒绝。
- `messageId` 必须出现，并且是字符串。空字符串也合规。
- `loginProof` 可以缺失。它出现时必须是字符串。缺失和空字符串不在这里拒绝，它们在会话判断次序第 2 步得到 `denied`。
- `body` 是对象，恰有 `tenant`、`session` 和 `observationId` 三个键。
- `tenant` 按公开契约[本地值与线上表示](../SPEC.md#本地值与线上表示)的租户文本规则读取。内层的预算规则也按那里。
- `session` 是 64 个小写十六进制字符。
- `observationId` 是非空字符串。

拒绝的响应用公开契约 `encodeSessionResponse` 的共同拒绝重载编码。`messageId` 是字符串时，响应写这个 `messageId`。`observe-session` 的拒绝在 SSE 上是第一条事件，见[响应类型](#响应类型)。

### 手写编码的封闭规则

服务端手写编码下面三种消息。客户端按同一组规则读取它们。任一条不满足时，客户端把这条消息当作读不出。

- 编码方式：服务端构造 json-text 值树，用 json-text 的 `writeJsonText` 写出。服务端不拼接 JSON 字符串。
- `observe-session` 的响应：根对象恰有 `protocolVersion`、`messageId`、`outcome` 和 `body` 四个键。`protocolVersion` 是 `session-public/1`，`messageId` 是原请求的 `messageId`。`outcome` 是 `succeeded`、`denied` 或 `basis-unavailable`。`succeeded` 的 `body` 恰有 `observationId`，值是原值。其他结果的 `body` 是空对象。依据是公开契约的[响应与帧](../SPEC.md#响应与帧)。
- `cancel-observation` 的响应：根对象的四个键和 `outcome` 的取值同上。`succeeded` 的 `body` 恰有 `observationId` 与 `state`，`state` 是 `ended` 或 `not-found`。其他结果的 `body` 是空对象。依据是公开契约的[观察的取消](../SPEC.md#观察的取消)。
- `observation-frame`：根对象恰有 `protocolVersion`、`messageId`、`operation` 和 `body` 四个键，没有 `outcome`。`messageId` 是原 `observe-session` 请求的 `messageId`。`operation` 是 `observation-frame`。`body` 恰有 `observationId`、`seq` 和 `frame`。`seq` 是匹配 `^[1-9][0-9]*$` 的文本。
- `frame` 按 `frame.kind` 恰有公开契约帧种类表列出的字段：`state` 另有 `phase` 与 `target`，`snapshot` 与 `delta` 另有 `projection` 与 `value`，`gap` 与 `ended` 另有 `reason`，`refreshing` 没有其他字段。字段取值按公开契约的[响应与帧](../SPEC.md#响应与帧)。`phase` 按开放文本核对，它是 null 或非空字符串。
- `model-output-v1` 的 JSON 投影入轨之前，服务端不发 `snapshot` 与 `delta`，依据同上节末段。

`protocol-rejected` 的响应不属于手写编码，见上一节。

## SSE 观察

本节写 `observe-session` 的承载。帧的字段、先后和含义归公开契约的[会话观察](../SPEC.md#会话观察)。

### 响应类型

在会话路径上，读取分派把消息交给手写读取，并且根的 `operation` 是 `observe-session` 时，响应是 SSE。其他情况的响应都是 JSON。

- SSE 响应的状态码由第一条事件的 `outcome` 按[状态码映射](#状态码映射)决定。响应头和第一条事件一起发出。
- 手写读取拒绝这条消息时，第一条事件是 `protocol-rejected`，状态 400。
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

## 客户端规则

两端的客户端遵守下面的规则。SDK 与 CLI 的规格引用本节，不复述。

- 调用者只读响应体里的 `outcome`。调用者不用状态码决定业务含义，也不用状态码决定是否再送。
- 调用者按响应的 `Content-Type` 选择读取方式，不按自己的预期选择。
- 调用者没有收到可信答复时，保持本地 `unknown`。连接重置、超时、状态 500 且没有可读的匹配消息，都属于这种情况。这就是传输失败的对外结果。它不是 `basis-unavailable`。
- 再送只按公开契约的[未知、重复、重试、缓存和列表](../SPEC.md#未知重复重试缓存和列表)规则。`unsupported` 不是可重试的成功，客户端不再送同一请求。
- 客户端忽略心跳注释行，不把它交给调用者。
- 已经建立的观察连接断开后，客户端不自动重连，也不自动发出任何公开操作。重连是调用者发起的新 `observe-session`，不重发原 Model 或 Tool 调用。请求字节没有写出时的零字节再送不属于这一条，它按上一条的再送规则。
- 观察的取消只结束观察，不是业务控制。业务控制只有[会话中断操作](#会话中断操作)。

## 名字与约束

本页只定名字与约束。初值归装配配置，本页不写初值。

| 名字 | 含义 | 约束 |
| --- | --- | --- |
| 治理路径 | 治理位置的路径 | 固定为 `/governance-public/1` |
| 会话路径 | 会话位置的路径 | 固定为 `/session-public/1` |
| `maxBodyBytes.small` | 治理路径的请求体上限 | 正整数字节 |
| `maxBodyBytes.input` | 会话路径的请求体上限 | 正整数字节 |
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
| 会话路径按操作分上限 | 第 5 步还没有读出 `operation`，选不了上限。预读 `operation` 会让严格读取多出一个读取者 | 一份约 20 KiB 的 `create-session` 在不同实现里得到 413、`protocol-rejected` 或被受理 |

本页是 Markdown 正文，不进 API 快照，所以加入它是 public-contract 的可加改动。[公开契约规格](../SPEC.md)里「不选定承载协议」一类的句子相应改为：选定 HTTP 承载，不选定保护协议。这一项随 DP-2 交 Reduce 批复。

## 已知限制

- 明文传输。服务端只绑回环地址，所以登录证明和凭据不离开本机。同一台机器上有权限抓取回环流量的进程能读到它们。远程访问和 TLS 不在 M2。
- 会话路径上的全部请求都受 input 上限约束。所以 `send-input` 以外的会话请求最多可以到 input 上限，不受更小的上限保护。
- 会话路径上不是观察的请求被严格读取两次：一次在读取分派里，一次在 `readSessionRequest` 里。
- 观察消息由两端手写读写，见[观察消息的手写读写](#观察消息的手写读写)。收口条件写在该节。
- 判断服务是否在线只能连接端口。M2 部署不提供 `public-health`，见服务端接入规格的[治理位置的偏离](../../server-entry/SPEC.md#治理位置的偏离)。
- 多实例部署的粘性路由由部署另行给出，见公开契约的[协议给与装配给](../SPEC.md#协议给与装配给)。
- 客户端对 SSE 的空闲检测没有规定。客户端只能靠连接断开发现问题。
- HTTP 层的限流、压缩和 HTTP/2 不在 M2。

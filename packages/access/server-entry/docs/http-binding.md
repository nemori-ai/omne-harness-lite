# HTTP JSON 与 SSE 承载绑定

状态：候选（#978 的设计点 DP-2），等待 Reduce 批复。批复前，实现闭包不按本页写代码。

本页拥有公开契约两个位置的 HTTP 承载：路径、方法、内容类型、状态码与 `outcome` 的对应、请求体上限、SSE 事件格式与心跳。本页只写承载映射。字段、`outcome` 的含义、判断次序和帧的含义归[公开契约](../../public-contract/SPEC.md)。传输路线沿[技术基础](../../../../docs/architecture/technical-foundations.md#共同技术选择)：HTTP JSON 控制与查询，fetch SSE 单向观察。

服务端接入的[行为规格](../SPEC.md)、[SDK 规格](../../sdk/SPEC.md)和 [CLI 规格](../../../../apps/cli/SPEC.md)都引用本页的[承载绑定表](#承载绑定表)。它们不复制这张表。

## 责任与范围

本页回答三件事。

1. 每个公开操作经哪个路径、方法和内容类型到达服务端，服务端怎样回写，以及请求体上限和 SSE 事件格式。
2. 状态码怎样对应 `outcome`，传输失败怎样对外表现。
3. `SessionOperationId` 的派生规则。

本页不做下面的事。

- 不重新定义公开契约的字段和 `outcome`。
- 不规定登录证明的密码学形式。
- 不规定远程部署的传输保护。M2 只在本机回环地址上提供服务。见[已知限制](#已知限制)。
- 不改公开契约。绑定需要公开契约的可加改动时，列在[可加改动清单](#可加改动清单)，另立卡。

## 传输与位置

M2 的服务端只在 `127.0.0.1` 上监听，使用明文 HTTP/1.1。

- 监听地址只能是 `127.0.0.1`。部署配置给出其他地址时，服务端启动失败并报配置错误。`0.0.0.0`、`::`、主机名和其他网卡地址都属于其他地址。服务端不静默改写地址。
- 端口是部署配置，初值见[名字与默认值](#名字与默认值)。
- 公开契约有两个位置。治理位置读写 `governance-public/1`，会话位置读写 `session-public/1`。会话观察的两个操作属于会话位置。
- 每个位置对应一个固定路径。服务端按路径选择读取函数，不按消息里的版本文本分派。
- 登录证明在消息体里，不在 HTTP 头里。服务端不读 `Authorization` 头，也不设置 Cookie。
- 服务端不发 CORS 头，也不应答 `OPTIONS`。浏览器页面因此不能跨源读取响应。
- 服务端日志和诊断不记录请求体和响应体。登录证明、凭据和签发者不出现在任何输出里。

## 承载绑定表

本表是两个位置全部操作的承载映射。每个操作名与公开契约一致。状态码列的「映射表」指[状态码映射](#状态码映射)。超限结果列的写法见[请求体上限](#请求体上限)。

| 位置 | 操作 | 路径 | 方法 | 请求内容类型 | 响应内容类型 | 请求体上限 | 状态码 | 超限结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 治理 | `register-and-activate`、`issue-login` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表 | 413 加 `protocol-rejected` |
| 治理 | `public-health` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表，本部署恒为 501 | 413 加 `protocol-rejected` |
| 治理 | `revoke-login`、`replace-credential`、`query-own-valid-logins` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表，本部署恒为 501 | 413 加 `protocol-rejected` |
| 治理 | `create-organization`、`query-create-organization`、`switch-current-tenant`、`query-current-tenant`、`query-own-memberships`、`query-organization`、`query-organization-members`、`leave-organization`、`remove-member`、`change-member-role` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表，本部署恒为 501 | 413 加 `protocol-rejected` |
| 治理 | `issue-member-invitation`、`accept-member-invitation`、`reject-member-invitation`、`withdraw-member-invitation`、`query-invitation`、`query-received-invitations`、`query-issued-invitations` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表，本部署恒为 501 | 413 加 `protocol-rejected` |
| 治理 | `open-affiliation-request`、`accept-affiliation-request`、`reject-affiliation-request`、`withdraw-affiliation-request`、`release-affiliation`、`query-received-affiliation-requests`、`query-issued-affiliation-requests`、`query-affiliation-request` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表，本部署恒为 501 | 413 加 `protocol-rejected` |
| 治理 | `judge-admission`、`submit-authorization-expression`、`withdraw-authorization-expression` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表，本部署恒为 501 | 413 加 `protocol-rejected` |
| 治理 | `disable-subject`、`restore-subject`、`end-subject`、`reopen-after-media-loss` | `/governance-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表，恒为 501 | 413 加 `protocol-rejected` |
| 会话 | `create-session` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表 | 413 加 `protocol-rejected` |
| 会话 | `query-create-session` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表 | 413 加 `protocol-rejected` |
| 会话 | `send-input` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | input | 映射表 | 413 加 `protocol-rejected` |
| 会话 | `query-send-input` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表 | 413 加 `protocol-rejected` |
| 会话 | `read-history` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表 | 413 加 `protocol-rejected` |
| 会话 | `cancel-run` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表 | 413 加 `protocol-rejected` |
| 会话 | `stop-call` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表，Tool 目标恒为 501 | 413 加 `protocol-rejected` |
| 会话 | `observe-session` | `/session-public/1` | POST | `application/json` | `text/event-stream; charset=utf-8`，见[SSE 观察](#sse-观察) | small | 映射表，按确认事件的 `outcome` | 413 加 `protocol-rejected`，响应为 JSON |
| 会话 | `cancel-observation` | `/session-public/1` | POST | `application/json` | `application/json; charset=utf-8` | small | 映射表 | 413 加 `protocol-rejected` |

本部署在治理位置只提供 `register-and-activate` 和 `issue-login`。其余治理操作的规则见[治理位置](#治理位置)。会话位置的九个操作全部提供。

## 请求与响应规则

服务端按下面的次序处理一个 HTTP 请求。前一步给出终结时，不做后面的步骤。

1. 路径不是两个固定路径之一，或带有非空查询串：状态 404，响应体为空，不处理消息。
2. 方法不是 POST：状态 405，带 `Allow: POST`，响应体为空，不处理消息。
3. `Host` 头的主机名不是 `127.0.0.1` 或 `localhost`：状态 421，响应体为空，不处理消息。这一步防止 DNS 重绑定页面借用本机服务。
4. `Content-Type` 的媒体类型不是 `application/json`，或带有 `utf-8` 以外的 `charset`：状态 415，响应为该位置的 `protocol-rejected`。
5. 请求体超过[请求体上限](#请求体上限)：状态 413，响应为该位置的 `protocol-rejected`，并关闭连接。
6. 把字节交给公开契约的读取函数，进入公开契约的判断次序。

其他规则如下。

- 一个请求体恰好是一条公开消息。
- 响应体是公开契约的编码函数给出的字节。服务端不手写 JSON。
- 所有响应带 `Cache-Control: no-store`。
- 该位置的 `protocol-rejected` 指：`protocolVersion` 是该位置的版本，没有 `messageId`，`body` 是空对象。第 6 步之前服务端不读消息，所以这些响应不带 `messageId`。
- 服务端不按 `Accept` 头选择响应类型。
- 服务端没有读出 `operation` 时，不能判断消息是不是 `observe-session`。第 1 步到第 5 步的失败因此都是 JSON 响应。
- 服务端内部出现意外故障时，状态 500，响应体为空，并关闭连接。服务端不把这类故障写成 `denied`、`succeeded` 或 `basis-unavailable`。已知的依赖不可用仍按公开契约写 `basis-unavailable`。
- 调用者没有收到可信答复时，按公开契约保持本地 `unknown`。连接重置、超时、状态 500 且没有可读的匹配消息，都属于这种情况。这就是传输失败的对外结果。它不是 `basis-unavailable`。

调用者只读响应体里的 `outcome`。调用者不用状态码决定业务含义，也不用状态码决定是否再送。再送只按公开契约的[未知、重复、重试、缓存和列表](../../public-contract/SPEC.md#未知重复重试缓存和列表)规则。

## 状态码映射

状态码只由 `outcome` 决定，与对象是否存在无关。同一个 `outcome` 总是得到同一个状态码、同一组响应头和同样形状的响应体。状态码因此不泄露公开契约要求隐藏的事实。

下表列出公开契约的全部 `outcome`。

| outcome | 状态码 | 说明 |
| --- | --- | --- |
| `succeeded` | 200 | 成功条件成立 |
| `no-change` | 200 | 核验通过，目标状态没有新变化 |
| `not-committed` | 200 | 查询已得确定答复，原操作没有提交 |
| `need-decision` | 202 | 本部署没有产生这个结果的操作，保留给以后 |
| `protocol-rejected` | 400 | 超限为 413，内容类型不符为 415 |
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

不同的 `outcome` 可以共用一个状态码。调用者不能由状态码推出 `outcome`。

### denied 的一致性

下面这些情况在会话位置都得到 `denied`，状态 403，响应体除 `messageId` 外逐字节相同：登录缺失、空、无效或不是本部署签发、行事租户不符、目标租户的账号不是识别出的账号、主体在该租户下没有资格、会话不存在、会话属于其他租户。服务端不在响应里加入原因，不加入额外的头，也不按对象是否存在改变状态码。

`stop-call` 的 Tool 目标在访问裁定之后得到 501 和 `unsupported`。无论会话是否存在，无论该 `controlId` 是否用过，结果都相同。

## 请求体上限

请求体上限分两类。数值是部署配置，初值见[名字与默认值](#名字与默认值)。

| 类 | 适用操作 | 初值 |
| --- | --- | --- |
| small | 除 `send-input` 外的全部操作 | 16 KiB |
| input | `send-input` | 1 MiB |

- 服务端按实际读到的字节计数。它不信任 `Content-Length`。`Content-Length` 已经大于上限时，服务端不读请求体，直接拒绝。
- 超限时，服务端停止读取，返回状态 413 和该位置的 `protocol-rejected`，然后关闭连接。没有业务效果，也没有其他成员被调用。
- 响应不说明命中了哪一类上限。
- 同一类的 json-text `maxBytes` 取同一个数值。json-text 的其余五项预算由接入配置给出，本页不定数值。
- 超限的 `observe-session` 得到 JSON 响应，不是 SSE。

## SSE 观察

本节写 `observe-session` 的承载。帧的字段、先后和含义归公开契约的[会话观察](../../public-contract/SPEC.md#会话观察)。

### 响应类型

服务端对请求体做严格 JSON 读取。根对象的 `protocolVersion` 恰为 `session-public/1`，并且 `operation` 恰为 `observe-session` 时，响应是 SSE。其他情况的响应都是 JSON。

- SSE 响应的状态码由第一条事件的 `outcome` 按[状态码映射](#状态码映射)决定。响应头和第一条事件一起发出。
- 请求体通过 JSON 读取，但字段不合规时，第一条事件是 `protocol-rejected`。公开契约的判断次序第 1 步决定这个结果。
- 严格读取失败、内容类型错误或超限时，响应是 JSON，见[请求与响应规则](#请求与响应规则)。
- 调用者按响应的 `Content-Type` 选择读取方式，不按自己的预期选择。

### 事件格式

- 每条公开消息是一个 SSE 事件。事件只有 `data` 字段。`data` 是该消息的 JSON 文本，写在一行里，后接一个空行。
- 第一条事件是 `observe-session` 的确认响应。之后的事件是 `observation-frame` 消息。
- 服务端不写 `event`、`id` 和 `retry` 字段。观察没有跨连接的续接游标。
- 确认响应不是 `succeeded` 时，服务端发完这条事件后结束响应，没有帧。
- 服务端发出 `ended` 帧后结束响应。
- 一个 SSE 响应就是一次观察。

### 心跳

- 确认事件发出后，服务端在连续 `heartbeatIntervalMs` 毫秒没有写出任何字节时，写一条注释行加一个空行。注释行的文本是 `: heartbeat`。
- 心跳不是帧。它没有 `seq`，不占帧队列字节，也不改变帧的先后。
- 间隔是部署配置。初值见[名字与默认值](#名字与默认值)。
- 客户端忽略心跳，不把它交给调用者。
- 心跳的写入失败说明连接已经断开。服务端按下一节处理。

### 连接关闭与重连

- 连接关闭等价于取消。客户端中止请求，或服务端发现连接断开时，服务端释放本地观察资源。这时发不出 `ended` 帧。
- 取消观察使用另一个连接上的 `cancel-observation`，响应是普通 JSON。
- 重连是新的 `observe-session` 请求，使用同一个 `observationId`。客户端不自动重连。
- 连接断开后，客户端不自动发出任何其他公开操作。服务端也不因连接事件调用 Model 或 Tool。重连不重发原 Model 或 Tool 调用。
- 观察的取消只结束观察。它不是业务控制。业务控制只有[会话中断操作](#会话中断操作)。

## 会话中断操作

`cancel-run` 和 `stop-call` 使用会话位置的同一个路径和 JSON 响应，见[承载绑定表](#承载绑定表)。

- `controlId` 重试时保持不变。重试使用新的 `messageId`。传输适配不据此产生新的中断意图。
- 判断次序和结果沿公开契约的[会话中断操作](../../public-contract/SPEC.md#会话中断操作)。
- Tool 目标的 `stop-call` 在访问裁定之后，会话存在核对之前，得到状态 501 和 `unsupported`。服务端不写任何记录。依据是 #784 评论 6554505364。
- `unsupported` 不是可重试的成功。客户端不再送同一请求。

## 治理位置

M2 的治理位置只有两个公开操作：`register-and-activate` 和 `issue-login`。

- 两个操作都不带登录证明，也不带行事租户。
- `issue-login` 的成功响应含 `loginProof`。它只在这一次响应里出现。服务端不记录它，客户端不把它写进输出。
- 识别登录不是公开操作，没有路径。会话位置的每个需要登录证明的操作，在判断次序里调用 identity 的登录识别。这是服务端接入的内部步骤。

其余治理操作按 D-10 答「本部署不提供」，不核验登录，不读取账号库。

- 本部署不提供的治理操作共 36 个，即公开契约中除上述两个以外的全部治理操作。`public-health` 也在其中。其中 `disable-subject`、`restore-subject`、`end-subject` 和 `reopen-after-media-loss` 已经由公开契约规定得到 `stage-not-provided`。
- 另外 32 个操作使用同一结果：`stage-not-provided`，空 `body`，状态 501。判断位置与那四个操作相同。服务端在版本检查之后，在封闭字段检查和登录核验之前返回。忽略其余字段。
- 操作名不是治理操作时，仍是 `protocol-rejected`。

核对结论：`stage-not-provided` 的含义足够。它的含义是「本阶段不提供该操作」，调用者不能由它推出主体是否存在。M2 的服务端不需要新的 `outcome`，也不需要改公开契约就能实现这条规则。服务端自己读出 `operation`，再用编码函数的共同拒绝重载写响应。该重载本来就能编码 `stage-not-provided`。

不足之处只在客户端读取一侧和文字的完整性，见[可加改动清单](#可加改动清单)。M2 的 SDK 和 CLI 不发送这 32 个操作，所以这些不足不挡 M2。

### 可加改动清单

下面三项是对公开契约的可加改动。它们不在本卡实现。另立卡，契约变更取 additive。

| 编号 | 改动 | 原因 | 是否挡 M2 |
| --- | --- | --- | --- |
| PC-1 | 治理位置每个正常操作的允许结果集合增加 `stage-not-provided` | `readGovernanceResponse` 现在对正常操作拒绝这个结果，客户端读不出这 32 个操作的答复 | 否 |
| PC-2 | 公开契约的「本阶段不提供的操作」一节写明：部署可以声明自己不提供的治理操作，这些操作得到 `stage-not-provided`，位置与现有四个操作相同 | 现在只有四个固定操作名 | 否 |
| PC-3 | `readGovernanceRequest` 接受一个「本部署不提供」的操作集合，命中时在封闭字段检查之前返回 `stage-not-provided` | 现在服务端要自己先读 `operation` | 否 |

## SessionOperationId 的派生规则

会话操作的 `SessionOperationId` 不由客户端填写。服务端接入从识别出的登录和请求标识派生它。请求体出现 `login` 或 `operation` 一类字段时，公开契约已经规定为 `protocol-rejected`。

本页只写规则。派生算法由服务端接入实现，并带碰撞测试。

规则如下。

1. 派生函数是确定性的。同一业务意图在崩溃前后得到同一个身份。
2. 每个身份取一个字符串数组的 SHA-256。数组按不带 replacer 与缩进的 `JSON.stringify` 编成文本。摘要输入是该文本的 UTF-8 字节。输出写成小写十六进制。
3. 身份分三族，每族由数组的第一个元素区分。

| 族 | 适用操作 | 数组 |
| --- | --- | --- |
| 创建 | `create-session`、`query-create-session` | `["session-public/1:create", 租户文本, createCallId]` |
| 受理 | `send-input`、`query-send-input` | `["session-public/1:accept", 租户文本, 会话文本, acceptId]` |
| 控制 | `cancel-run`、`stop-call` | `["session-public/1:control", 登录文本, 租户文本, 会话文本, controlId]` |

4. 创建族和受理族沿[派生身份](../../../../docs/architecture/runtime/runtime-contract-handoff.md#派生身份)已有的两行。控制族是本页新增的一行。登录文本是识别出的登录的 loginStateCodec 文本。租户文本和会话文本的含义同派生身份一节。
5. 控制族含登录文本，因为不同登录不共享中断回执。创建族和受理族不含登录文本，因为租户文本已经含账号。
6. 三族互不相交，原因有两个。第一个元素互不相同，并且和会话标识、`InputId` 的前缀也互不相同。数组长度也不全相同。JSON 数组的文本编码在元素边界上没有歧义。
7. `messageId` 不进入任何身份。换新的 `messageId` 或重连不产生新身份。
8. `cancel-run` 和 `stop-call` 共用控制族，所以共用 `controlId` 的唯一范围。同一登录在同一会话里，同一 `controlId` 跨两个操作复用，由 Session 得到 `conflict`。

实现闭包的碰撞测试至少包含下面几项。

- 三族的元素尾部相同时，摘要仍互不相同。
- 元素含引号、逗号、方括号和 `","` 的对抗输入，不让两个不同的数组得到同一文本。
- 登录不同、其余相同时，控制族身份不同。
- 会话不同、其余相同时，控制族和受理族身份不同。
- `messageId` 变化时，身份不变。
- 同一登录、同一会话、同一 `controlId` 的 `cancel-run` 与 `stop-call` 得到同一个身份。

Session 候选稿把控制族前缀写成 `session-public/1-control`。本页统一为冒号写法，与派生身份一节已有的写法一致。前缀只是区分族的文本，Session 一侧不解释它。

## 名字与默认值

本页集中列出本页给出的名字。实现和装配只从这里取值。

| 名字 | 含义 | 初值 |
| --- | --- | --- |
| 监听地址 | 服务端监听的地址 | 只能是 `127.0.0.1`，其他值使启动失败 |
| `listenPort` | 监听端口 | 8787。CLI 的默认服务地址使用同一端口 |
| 治理路径 | 治理位置的路径 | `/governance-public/1` |
| 会话路径 | 会话位置的路径 | `/session-public/1` |
| `maxBodyBytes.small` | small 类请求体上限 | 16384 字节 |
| `maxBodyBytes.input` | input 类请求体上限 | 1048576 字节 |
| `heartbeatIntervalMs` | 心跳间隔 | 15000 毫秒 |

初值由装配写进配置的默认值。装配行改变初值时，同时改本页。

## 拥有者与取舍

绑定正文放在 server-entry 的 `docs/http-binding.md`。SDK 和 CLI 的规格引用它。选择它的理由是：服务端决定自己接受什么路径、方法和上限，客户端遵守服务端。

被否方案如下。

| 方案 | 否决原因 | 反例 |
| --- | --- | --- |
| 在 public-contract 新增承载页 | public-contract 是只读的纯编解码成员，明确不选定承载协议。传输变化会迫使它改版并产生 API 快照的破坏性记录 | 以后加 TLS 或另一种承载时，每次传输调整都要走契约变更 |
| 放在 SDK 内 | SDK 只是客户端，不决定服务端接受什么 | 服务端改路径而 SDK 页面未改，两边各自「正确」 |
| 在三份规格里各写一份 | 三份会漂移 | 本卡之前，三份规格对会话位置都是零命中，说明没有一处承担它 |
| 每个操作一个路径 | `operation` 字段已经在消息里。路径再写一次，会出现两者不一致的情形，要多一条规则处理。公开契约本来就建议按位置分设路径 | 路径写 `cancel-run`，消息写 `stop-call`，服务端必须选一个 |
| 为观察另设路径 | 公开契约规定观察与会话操作使用同一承载位置 | 客户端要为同一会话位置维护两个地址 |

重新评估的触发条件：出现第二个服务端实现，或需要远程部署的传输保护时，把本页的传输无关部分移到 public-contract。

## 已知限制

- 明文传输。服务端只绑回环地址，所以登录证明和凭据不离开本机。同一台机器上有权限抓取回环流量的进程能读到它们。远程访问和 TLS 不在 M2。
- 没有健康检查操作。`public-health` 本部署答 `stage-not-provided`。判断服务是否在线只能连接端口。
- 多实例部署的粘性路由由部署另行给出，见公开契约的[协议给与装配给](../../public-contract/SPEC.md#协议给与装配给)。
- 客户端对 SSE 的空闲检测没有规定。客户端只能靠连接断开发现问题。
- SDK 的观察客户端不在 M2 波 1，见 [SDK 规格](../../sdk/SPEC.md)。
- 公开契约的观察消息函数尚未提供。接入先按公开契约手写读取。
- HTTP 层的限流、压缩和 HTTP/2 不在 M2。

## 给实现闭包的接入点

服务端接入的实现闭包（R7）：

- 按[请求与响应规则](#请求与响应规则)的次序实现 HTTP 层。
- 状态码映射用一张覆盖全部 `outcome` 的表，并带测试：少一个 `outcome` 就变红。
- 按[SessionOperationId 的派生规则](#sessionoperationid-的派生规则)实现派生函数和碰撞测试。
- 监听地址检查：配置了非回环地址时启动失败，有负控。
- 对 `denied` 的各个原因，断言响应除 `messageId` 外逐字节相同。
- 不改公开契约、SDK 和 CLI。

SDK 与 CLI 的实现闭包（R8）：

- 按[承载绑定表](#承载绑定表)实现 HTTP 传输适配。SDK 的规格写明适配的位置和「没有发出」的判定。
- CLI 通过 SDK 发请求，不导入 server-entry。

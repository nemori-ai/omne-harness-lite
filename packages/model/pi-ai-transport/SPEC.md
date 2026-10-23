# @omne-harness/pi-ai-transport 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包交付七部分：

1. 根入口导出的三段传输：工厂 `createPiTransport` 与配置类型 `PiTransportConfig`、`PiRoute`、`PiCredentialSlot`、`PiTransportLimits`。工厂返回的 `ModelTransport` 兑现 `prepare → materialize → start`。
2. 根入口导出的网络资源：工厂 `createNetworkResources` 与类型 `NetworkConfig`、`NetworkResources`、`ProxyConfig`、`DiagnosticObserver`。装配创建并拥有网络资源，再把它交给 `createPiTransport`。`NetworkResources` 是不透明句柄，包外只能调用它的 `close()`。行为见[“网络资源”](#网络资源)与[“代理”](#代理)。
3. 根入口导出的五个家族贡献接口类型：`PiProtocolFrame`、`PiResponseDecoder`、`PiMaterializedMedia`、`PiFamilyBinding` 与 `PiFamilyContributions`。形状与家族作者须遵守的行为归[组架构“pi 家族贡献的取得协议”](../docs/architecture.md#pi-家族贡献的取得协议)，本文件不重复这些条款。
4. 根入口导出的家族表：`defineFamily`、`composeFamilies`、`recordAdoption`、`replayFormatsOf` 与类型 `PiModelRecordHead`、`PiFamilySpec`、`PiFamily`、`PiReplayFormats`。行为见[“家族表”](#家族表)。
5. 子入口 `./chat-completions` 导出的网关引擎：运行时值 `bindChatCompletions`、校准算术 `calibratedAmount` 与两家共用的计量规则，以及记录词表、四个家族 hook、计量接缝与解码器限额的类型。行为见[“网关引擎：请求”](#网关引擎请求)、[“校准算术”](#校准算术)、[“共用计量规则”](#共用计量规则)与[“网关引擎：流解释”](#网关引擎流解释)。
6. 子入口 `./testing` 导出的家族测试助手：`checkChatCompletionsFixtures`、`checkAdoptionFingerprints`、`appendAdoptionFingerprints` 与夹具格式的常量和类型。它读写文件，只供家族包的测试与脚本使用。行为见[“家族测试助手”](#家族测试助手)。
7. 包内传输机制：连接容量、HTTP 交换、SSE 分帧、协议帧与诊断隔离。这些机制不经入口导出（依据 [#461 的决定评论](https://github.com/nemori-ai/omne-harness-lite/issues/461#issuecomment-6311010561)）。本文件对它们的条款约束同包的调用代码，即网络资源与三段传输。

本文件兑现以下已接受的上层条款：

- [组架构“迁移与接受条件”](../docs/architecture.md#迁移与接受条件)：容量在 materialize 阶段预约，预约不自行过期，start 同步发起实际请求，不在内部等待队列。
- [组架构“pi 家族贡献的取得协议”](../docs/architecture.md#pi-家族贡献的取得协议)：公共传输禁用隐式 HTTP 重试与自动重定向，一次 start 对应一次物理发出。HTTP/SSE 分帧由公共传输处理。协议 end-marker 与传输 EOF 分开。
- [model-contract“独立执行与提供者操作”](../model-contract/SPEC.md#独立执行与提供者操作)：`prepare` 不发送；`materialize` 固定 payload，不发送；`start` 在调用时立即发送；重复 materialize 或 start 不再发送；close 幂等。
- [model-contract“资格、共同提交与实际发送”](../model-contract/SPEC.md#资格共同提交与实际发送)：发送点 S 之后请求不可撤回。秘密只在本次发送资源内存在。
- [迁移清单](../docs/migration.md#pi-ai-transportsrc)中标为 2.1 的行：封存件各文件的去向。

本包当前不提供以下能力。本文件对它们不作承诺：

- 家族本身。家族由独立的家族包提供，现有 `@omne-harness/pi-ai-openai` 与 `@omne-harness/pi-ai-anthropic`。本包只提供家族表、网关引擎与测试助手。
- 凭据解析与真实供应商请求。归 2.6。
- 媒体读取。materialize 遇到模型可见的内容引用时拒绝，见“三段传输”。媒体读取器的注入与读取归阶段四 4.4。引擎只编码内联图片。
- 家族对错误体的解释，例如输入超限。所有请求都经 OpenRouter，错误体格式属于网关，本包保持“交换结果”中的映射。
- 按优先级与等待方式分配名额。这是未实现的方向，记录在[内部架构](docs/architecture.md#未实现的优化方向按优先级与等待方式分配连接席位)。

## 结果与不变量

### 三段传输

#### 构造

`createPiTransport(config)` 返回 `{ transport, close }`。`transport` 是 `ModelTransport`。

- `config.network` 是装配创建并拥有的网络资源。多个传输可以共享同一网络资源。传输不创建也不关闭它。
- `config.families` 是家族贡献，`config.credential` 是凭据槽。两者都由装配注入。
- `config.routes` 按 `supplier.recipient` 查找路由。本包只查对象自身的属性，不查原型链。每个路由给出完整的 endpoint（`url`）与协议的 end-marker 文本（`endMarker`，协议没有 end-marker 时为 `null`）。
- `config.limits` 给出 `connectTimeoutMs`、`maxErrorBodyBytes`、`maxEventBytes` 与单个事件 JSON 的 `json` 限额。本包不设默认值。

下列情况下，`createPiTransport` 同步抛出 `RangeError`。消息只写字段名与规则，不含 URL：

- 路由的 `url` 不能解析，或不是 `https:`，或含用户名、密码、查询串或片段；
- 路由的 `endMarker` 既不是字符串也不是 `null`；
- `connectTimeoutMs` 既不是 `null` 也不是 1 到 2147483647 之间的整数；
- `maxErrorBodyBytes`、`maxEventBytes` 或 `json` 的任一限额不是正的安全整数；
- `families` 或 `credential` 不是对象，或 `families.acquire`、`credential.read` 不是函数；
- `network` 不是 `createNetworkResources` 返回的句柄，含结构相同的其他对象。

#### prepare

`prepare(request, supplier, dispatch)` 不发送，不读取媒体，不预约容量。

- `supplier.recipient` 没有路由时，返回 `unsupported`，`field` 为 `supplier.recipient`。本包不调用家族贡献。
- `request.suppliers` 中没有与 `supplier` 完全相等的一项（采用的四项、接收方、型号与凭据都相等）时，返回 `invalid`，`field` 为 `supplier`，`reason` 为 `not-in-request`。本包不调用家族贡献。
- 本包取 `request.declarations` 中与该供应商同序的一项作为这次发出的回放声明，并保存 `dispatch.resent` 的副本。两者在 materialize 时交给 `encode`。
- 本包调用 `families.acquire(supplier, signal)` 取得家族绑定。家族返回的失败原样返回。`signal` 在外层 `close()` 时中止。
- 外层 `close()` 开始之后，`prepare` 返回 `unavailable`（`dependency` 为 `pi-transport`）。`close()` 开始时仍在进行的 acquire 之后取得的绑定，本包立即释放。
- 每个成功的 prepare 拥有一个家族绑定，直到它关闭。

#### materialize

`materialize(signal)` 按下列顺序执行，不发送：

1. 按 FIFO 预约一个容量名额。等待没有时限，只在下列情况下结束：`signal` 取消、prepared 关闭、网络资源关闭。等待结束时返回 `unavailable`，`dependency` 为 `connection-capacity`，`diagnostic` 为 `cancelled` 或 `network-closed`。
2. 扫描固定请求中模型可见（`visibility.toModel`）且带 `ref` 的内容块，顺序是 `system`，然后 `messages`。发现一个时返回 `unsupported`，`field` 是该块的路径（例如 `/system/0` 或 `/messages/1/blocks/0`），`adapter` 是家族绑定的采用。本包不丢弃这个引用。
3. 调用家族的 `encode({ request, media: [], declaration, resent })`。`declaration` 与 `resent` 是 prepare 保存的值。家族返回的失败原样返回。本包保存家族返回的 `diagnostics`，交给事实流。
4. 把 `body` 序列化为不含空白的 JSON 文本，再编码为 UTF-8 字节。
5. 计算这些字节的 SHA-256，用 64 个小写十六进制数字表示。
6. 形成回执：`supplier` 是 `supplier.adoption`，`representation` 是 `request.representation`，`payloadDigest` 是第 5 步的摘要。绑定的 `replayFormat` 不是 `null` 时，回执带 `replayFormat`，值与绑定的相同。绑定的 `replayFormat` 是 `null` 时，回执没有这一项。回执冻结，重复读取得到同一个对象。

- 第 1 步之后的任何失败，含抛出的异常，都先归还名额，再返回或抛出。
- 同一 prepared 只能 materialize 一次。第二次调用返回 `invalid`（`field` 为 `materialize`，`reason` 为 `repeated`），不预约容量。prepared 关闭之后调用，返回 `unavailable`（`dependency` 为 `pi-transport`，`diagnostic` 为 `prepared-closed`）。
- materialize 进行中 prepared 开始关闭时，materialize 返回同一个 `unavailable`，不交出 materialized。物化成功时，该 materialized 归关闭所有，由关闭归还名额。
- 成功时，materialized 持有名额与编码后的字节，直到 start 消费名额或 close 归还名额。

#### start

`start(signal)` 是同步函数。它返回事实流之前，已经决定是否发送：

1. `signal` 已中止，或网络资源已开始关闭时，本包不读凭据，不发送，归还名额。流只给出 `interrupted`（`stop: 'confirmed'`）。所以网络资源关闭先于缺少凭据：两者同时成立时，流给出 `interrupted`。
2. 本包调用 `credential.read()` 一次。返回 `undefined` 时，本包不发送，归还名额。流只给出 `failed`，`cause` 为 `credential`，`upstreamStatus` 为 `null`，`diagnostic` 为 `credential-not-provided`。`start` 不抛出。
3. 本包组装请求头：`authorization: Bearer <凭据>`、`content-type: application/json`、`accept: text/event-stream`，然后调用 `startExchange`。`start` 返回时，请求已经交给 Node 并已调用 `end(body)`。
4. `startExchange` 拒绝时，名额已归还，本包不发送。`cancelled` 与 `resources-closed` 给出 `interrupted`（`stop: 'confirmed'`）。`invalid-header` 只能来自凭据，给出 `failed`，`cause` 为 `credential`，`diagnostic` 为 `credential-not-a-header-value`。其他拒绝原因是本包的缺陷，`start` 抛出 `Error`。

- 同一 materialized 只能 start 一次。start 之后、任何关闭之前再次调用 start，本包返回立即结束的空流，不读凭据，不发送。
- materialized 的 `close()`、派生它的 prepared 的 `close()` 或外层 `close()` 之后调用 start，本包不读凭据，不发送。流只给出 `interrupted`（`stop: 'confirmed'`），与网络资源关闭之后的 start 相同。此规则也适用于 start、关闭、再 start 的顺序：关闭之后的任何 start 都给出 `interrupted`，不给出空流。
- 秘密只在 `start` 的同步调用中经过本包。本包不保存它，不把它写入事实、诊断或异常消息。凭据槽中的秘密与 `supplier.credential` 的对应关系由调用方保证。

#### 事实流

发送之后，事实流按下列顺序处理响应：SSE 分帧，协议帧（end-marker 取路由的 `endMarker`，JSON 限额取 `limits.json`），家族解码器。流以恰好一个 `ended` 结束，`ended` 之后没有事实。

读取在协议结束时停止。协议结束的时刻按路由的 `endMarker` 确定：

- `endMarker` 不是 `null`：end-marker 帧交给解码器之后，协议结束。本包不等待响应体结束，不解码 end-marker 之后的字节或事件。读到 end-marker 帧时 Node 已收到完整响应体，连接留在连接池中。其他情况下，本包停止交换。
- `endMarker` 是 `null`，或响应体在 end-marker 之前结束：响应体结束时，协议结束。

协议结束之后，本包调用解码器的 `end()`，给出它的事实，再给出 `ended`。

请求发出之后，本包先把 `encode` 返回的每条诊断按次序作为 `diagnostic` 事实给出，再处理响应。交换以 HTTP 错误或连接失败结束时也是如此，因为请求已经交给 Node。请求没有发出时（见“start”第 1、2、4 步与关闭之后的 start），流不含这些诊断。

- 解码器给出的 `ended` 由本包保留，到协议结束且解码器 `end()` 成功之后才作为最后一个事实给出。解码器在 `ended` 之后给出的其他事实照常先给出。
- 解码器给出第二个 `ended` 时，流以 `failed` 结束，`cause` 为 `upstream-protocol`，`diagnostic` 为 `decoder-ended-twice`。
- 读取 2xx 响应体时失败（响应体断开、SSE 分帧失败、协议帧失败、解码器拒绝某帧、取消或关闭），本包仍调用解码器的 `end()` 一次。`end()` 成功时，本包给出它的事实，但不给出它的 `ended`，再给出失败的 `ended`。终止仍按下表取那次失败。所以已收场的响应在失败之前收到的用量仍进入账目（见“网关引擎：流解释”的“账目”）。`end()` 失败时，本包不给出它的事实，终止不变。
- 流给出 `ended` 之前，交换已物理停止，名额已归还。
- 本包读入 end-marker 所在的响应字节之后，协议结束优先。之后到达的取消或关闭不改变终止：流以解码器的终止结束（例如 `completed`），不以 `interrupted` 结束。end-marker 与之前的事件在同一次读入中到达、读者在给出第一个事实之后才取消时，也是如此。
- 本包读入 end-marker 所在的响应字节之前，取消或关闭给出 `interrupted`（`stop: 'confirmed'`）。

终止按下表确定。`upstreamStatus` 只含状态码。响应头与错误体不进入 fault：

| 交换的结果 | 终止 | `diagnostic` |
| --- | --- | --- |
| 2xx，协议结束（end-marker 到达，或没有 end-marker 时响应体正常结束），解码器 `end()` 成功并给出过 `ended` | 解码器的 `ended` | 解码器给出 |
| 同上，但解码器没有给出 `ended` | `failed`，`upstream-protocol` | `no-termination` |
| HTTP 401、403 | `failed`，`credential`，带状态码 | `http-<状态码>` |
| HTTP 429、5xx | `failed`，`upstream-unavailable`，带状态码 | `http-<状态码>` |
| 其他 4xx | `failed`，`input-rejected`，带状态码 | `http-<状态码>` |
| 3xx 与其他状态 | `failed`，`upstream-protocol`，带状态码。本包不跟随重定向 | `http-<状态码>` |
| 连接失败，含代理拒绝 | `failed`，`upstream-unavailable`，状态码为 `null` | `connect-failed` |
| 连接超时 | `failed`，`upstream-unavailable`，状态码为 `null` | `connect-timeout` |
| 响应体在末尾之前被对方断开 | `failed`，`stream-lost` | `response-body-lost` |
| SSE 分帧失败 | `failed`，`upstream-protocol` | `sse-<原因>` |
| 协议帧失败 | `failed`，`upstream-protocol` | `frame-<原因>` |
| 解码器对某帧或 `end()` 返回 `ModelFault` | `failed`，该 fault | 解码器给出 |
| 本包读入 end-marker 所在的响应字节之前，`signal` 中止、materialized 或 prepared 的 `close()`、外层 `close()`、网络资源关闭 | `interrupted`，`stop: 'confirmed'`，在物理停止之后。读入之后到达的取消或关闭不改变终止，终止取解码器的 `ended` | 无 |

- 读者提前结束事实流时，本包停止交换并等待物理停止。读者在第一次 `next()` 之前结束时也是如此。
- 停止只停止本地工作。已发出的请求不能撤回，`interrupted` 不表示供应商没有收到请求。

#### 关闭

- `materialized.close()`：未 start 时归还名额。已 start 时停止交换，并在交换物理停止之后完成。幂等，重复调用返回同一个 Promise。
- `prepared.close()`：先结束仍在进行的 materialize（它返回 `unavailable`），再关闭由它派生的 materialized，然后释放家族绑定。幂等。
- 外层 `close()`：先拒绝新的 prepare，中止在途的 acquire，再关闭本传输派生且仍打开的每个 prepared，等待它们的交换物理停止、家族绑定释放。某个 prepared 的关闭失败时（例如家族的 `release()` 拒绝），外层 `close()` 仍等待其他 prepared 的关闭结束，再以第一个失败拒绝。它不关闭网络资源。幂等，重复调用返回同一个 Promise。
- 装配在所有传输关闭之后关闭网络资源。网络资源先关闭时，等待中的 materialize 返回 `unavailable`（`network-closed`），之后的 start 给出 `interrupted`，在途交换以 `interrupted` 结束。

### 连接容量

`createConnectionCapacity(maximum)` 创建一个容量。`maximum` 必须是正的安全整数，否则函数同步抛出 `RangeError`。

- 容量同时授予的预约不超过 `maximum` 个。`reserve(signal)` 按调用顺序（FIFO）授予预约。
- 下列情况下，`reserve` 以 `undefined` 结束，不占用名额：
  - 调用时信号已取消，或容量已关闭；
  - 等待中信号取消；
  - 等待中容量关闭。
- 被取消的等待者离开队列。授予或取消之后，等待者的监听器离开信号。
- 预约不过期。授予之后信号再取消，预约仍是 `held`。预约一直占用名额，直到名额被归还。
- 预约有三种状态：`held`、`consumed` 与 `released`。只有 `held` 能变成 `consumed`。
- `consume()` 只成功一次，返回一个座位。之后再调用时，它返回当前状态（`consumed` 或 `released`）作为拒绝，不抛出异常。
- 预约本身的 `release()` 只在预约为 `held` 时归还名额。`consume()` 之后，预约的 `release()` 不起作用，只有返回的座位能归还名额。
- 预约与座位的 `release()` 都幂等。一个名额只归还一次，只放行一个等待者。
- `close()` 让全部等待者以 `undefined` 结束，并拒绝之后的预约。关闭之前授予的预约仍可消费和归还。

### 发起交换

`startExchange(resources, input, signal)` 同步返回 `started` 或 `refused`。

- 返回 `started` 时，本包已把请求交给 Node 的 `https.request`，并已调用 `end(body)`。函数不返回惰性对象，不在内部等待容量或其他 Promise。
- 结果、停止与响应体都经返回的交换句柄取得：结果与物理关闭用 Promise，响应体用异步迭代。
- 一次交换只对应一次物理发出。本包不重试，不跟随重定向。3xx 响应是 HTTP 错误。
- 请求方法是 POST。本包按调用方给出的值发送请求头，只另加 `content-length`，其值是 `body` 的字节数。
- 地址必须是 `URL` 对象，协议是 `https:`，不含用户名、密码、查询串与片段。

拒绝原因是封闭集合。本包按下表顺序检查，报告第一个成立的原因：

| 原因 | 条件 |
| --- | --- |
| `resources-closed` | 网络资源已开始关闭 |
| `cancelled` | 信号在发起前已取消 |
| `invalid-url` | 地址不符合上述要求 |
| `invalid-header` | `headers` 不是对象（例如 `null`、字符串或数组），或头名不是 HTTP token，或头值不是字符串，或头值含可打印 ASCII（0x20 至 0x7E）以外的字符 |
| `invalid-body` | `body` 不是 `Uint8Array` |
| `invalid-limit` | `maxErrorBodyBytes` 不是正的安全整数，或 `connectTimeoutMs` 既不是 `null` 也不是 1 到 2147483647 之间的整数 |
| `reservation-unusable` | 预约不是本资源的容量授予的，或已消费，或已归还 |

- 拒绝时，本包不建立任何网络连接，也不向连接池登记任何请求。
- 凡是未发起的交换，本包都归还仍为 `held` 的预约。本包只归还本资源的容量授予的预约。已消费的预约属于另一个交换，其他容量的预约与冒充预约的对象不归本包，本包都不改动。
- 容量给自己授予的每个预约打不可伪造的归属标记。复制预约的方法或属性得到的对象没有这个标记。
- `cancelled` 表示请求没有发出。发出之后的取消由结果 `stopped` 表示。调用方据此区分“未发出”与“已发出后取消”。
- 发起时出现拒绝原因以外的同步异常时，本包先归还仍为 `held` 的预约，再原样抛出该异常。`signal` 不是 `AbortSignal` 时，该异常是 `TypeError`。归还本身因输入或资源有缺陷而失败时（例如读取 `input.reservation` 抛出，或 `resources` 不是对象），本包仍抛出原异常，不用归还时的异常替换它。

### 交换结果

`result` 只确定一次，取下列四种之一：

| 结果 | 含义 | 确定的时刻 |
| --- | --- | --- |
| `ok` | 2xx 响应，带状态码、响应头与只能认领一次的响应体 | 收到响应头时 |
| `http-error` | 2xx 以外的状态，含 3xx，带状态码、响应头与错误体 | 交换物理关闭时 |
| `connect-failed` | 收到响应之前连接已关闭，且没有停止。`timeout` 说明是否由连接超时引起 | 交换物理关闭时 |
| `stopped` | 取消信号或 `stop()` 胜出。`responded` 说明停止之前是否已收到响应 | 交换物理关闭时 |

- 停止在物理关闭完成之前胜出。`http-error` 或 `connect-failed` 尚未确定时调用停止，结果变成 `stopped`。
- `ok` 在收到响应头时已经确定。之后的停止不改变 `ok`，只结束响应体。
- `result` 只在 Node 契约以外的情况下拒绝：响应没有状态码，或错误体的块不是字节。拒绝之前，本包同样物理关闭交换并归还名额。

### 响应体

- 2xx 响应体只能认领一次。第二次 `claim()` 返回 `undefined`。
- 调用方必须读完响应体，或停止交换。否则响应、连接与名额一直被占用。
- 读者提前结束迭代时，本包销毁响应，交换随之物理关闭。读者在第一次 `next()` 之前调用 `return()` 或 `throw()` 时也是如此。
- 响应体在到达末尾之前结束时，读者的迭代以下列两种错误之一结束。读者按错误类型区分，不依赖 Node 的错误码：
  - `ResponseBodyStoppedError`：本地停止在先，即 `stop()`、取消信号或网络资源的 `close()`。
  - `ResponseBodyReadError`：没有本地停止，连接被对方关闭或重置。`cause` 是 Node 报告的错误。
- 响应体的块不是字节时，读者的迭代以普通的 `Error` 结束。这是缺陷。

### 错误体

非 2xx 响应的错误体有三种状态：

- `complete`：读到流末尾，总字节数不超过 `maxErrorBodyBytes`。总字节数正好等于上限时也是 `complete`。
- `too-large`：累计字节数超过上限。本包丢弃已读的全部字节，并关闭连接。
- `read-failed`：读取中流出错，例如连接中断。本包不返回部分字节。

### 连接超时与连接池

- `connectTimeoutMs` 从交换发起时开始计时，到请求取得已连接的套接字时结束。`null` 表示不设连接超时。上限是 2147483647，即 Node 定时器接受的最大延迟。结束的时刻按连接的种类确定：
  - 新建的直连：TLS 握手完成时。计时覆盖 TCP 连接与 TLS 握手。
  - 经代理新建的连接：连接池把套接字交给请求时。连接池在 CONNECT、隧道与经隧道的 TLS 握手都完成之后才交出套接字，所以计时覆盖这三步。
  - 复用的连接：连接池把套接字交给请求时，即发起后的下一个 tick。
- 连接超时后，本包销毁请求。结果是 `connect-failed`，`timeout` 为 `true`。
- 同时进行的交换数只由容量限制。连接池不设套接字上限：没有每个接收方的上限（`maxSockets`），也没有总上限（`maxTotalSockets`）。连接池只负责复用连接与关闭空闲连接。
- 本包不用 `maxSockets` 对齐容量，原因是两者的计数时刻不同。本包在请求与响应关闭时归还名额，等待者随即发起。Node 对不保留的套接字（例如服务端声明 `Keep-Alive: timeout=1`，或套接字已不可写）在请求关闭时销毁它，但要到该套接字自己的 `close` 事件到达时才把它移出连接池的计数，这是事件循环的下一轮。套接字上限等于容量时，这一轮之内发起的请求会进入等待队列，尽管它持有名额。
- 连接池没有套接字上限，所以持有名额的请求不在连接池中排队。
- 连接池关闭空闲时间超过 `idleConnectionTimeoutMs` 的连接。
- `maxConnections` 限制同时进行的交换数，不限制物理连接数。下列连接不占名额，连接数因此可以超过 `maxConnections`：
  - 空闲连接。
  - 交换已停止、但直连仍在握手的连接。例如交换在发起的同一 tick 内停止，连接池收回仍在握手的套接字。这种连接按 `idleConnectionTimeoutMs` 结束，不按 `connectTimeoutMs` 结束。经代理正在建立的连接不属于这一种，见“代理”。
  - 正在关闭、尚未移出连接池的套接字。它们让物理连接数短暂超过容量。

### 代理

`NetworkConfig.proxy` 可选。不配置时，每个交换都直连接收方。本包不读取 `HTTPS_PROXY`、`NO_PROXY` 等环境变量。环境到配置的映射由调用方在边界完成。

配置了代理时：

- 本包把 `url` 经 `URL` 规范化后的形式（`href`）作为 `HTTPS_PROXY`、把 `bypass` 以逗号连接作为 `NO_PROXY`，交给 Node 连接池的 `proxyEnv` 选项。本包只设这两个大写键。规范化去掉首尾空白与 URL 中的制表符、回车和换行，并把协议改为小写。所以 `URL` 接受的每个代理 URL 都经代理生效：Node 直接读取原文时，会对回车或换行抛出含完整 URL 的错误，并对大写协议或前导空白静默直连。
- 主机命中 `bypass` 的交换直连。`bypass` 的写法按 Node 的 `NO_PROXY`：主机、`.后缀`、`*.后缀`、IP、IP 范围或 `主机:端口`。
- 其他交换先连接代理，发送 CONNECT，在代理回复 200 之后经隧道与接收方完成 TLS 握手。代理看到接收方的主机与端口，看不到请求内容。

经代理的交换按下表确定结果。本包不区分代理的失败与接收方的失败，也不报告代理回复的状态码：

| 情况 | 结果 |
| --- | --- |
| 代理以 200 以外的状态拒绝 CONNECT | `connect-failed`，`timeout` 为 `false` |
| 代理不可达，或代理在隧道建立之前关闭连接 | `connect-failed`，`timeout` 为 `false` |
| 隧道建立之后 TLS 握手失败 | `connect-failed`，`timeout` 为 `false` |
| 取得已连接的套接字之前到达 `connectTimeoutMs` | `connect-failed`，`timeout` 为 `true` |
| 取得已连接的套接字之前停止 | `stopped`，`responded` 为 `false` |

- 停止交换时，本包同时结束为该交换经代理正在建立的连接。停止的来源可以是 `stop()`、取消信号、连接超时或网络资源的 `close()`。所以交换的物理关闭不等 Node 自己的隧道超时，也不等经隧道停滞的 TLS 握手。Node 的隧道超时取 `idleConnectionTimeoutMs`，不属于本包的契约。
- 代理拒绝 CONNECT 之后又重置连接时，进程不崩溃，交换照常以 `connect-failed` 结束。
- 代理 URL 是秘密，见“秘密与对外事实”。

### SSE 分帧

`readSseEvents(body, maxEventBytes)` 把字节块的异步迭代转为每个事件的 data 文本。`maxEventBytes` 必须是正的安全整数，否则函数同步抛出 `RangeError`。

- 字节块的切点不改变结果。多字节 UTF-8 字符与 CR、LF、CRLF 换行跨越块边界时，结果相同。
- 本包只取 `data` 字段。多条 `data` 行以 LF 连接。冒号之后的一个空格被去掉。
- 没有冒号的 `data` 行，值为空字符串。
- 本包忽略注释、`event`、`id`、`retry` 与其他字段。没有 `data` 行的事件不产出。

单事件字节上限按下列规则计数：

- 一个事件内所有行的 UTF-8 字节都计入，含注释、其他字段与换行符。
- 结束事件的空行的换行符也计入。
- CR 之后紧跟的 LF 不计入。
- 每个事件分别计数，上限不作用于整条流。
- 计数超过上限时失败。计数正好等于上限时通过。

失败原因是封闭集合，由 `SseProtocolError` 的 `reason` 报告：

| 原因 | 条件 |
| --- | --- |
| `non-byte` | 块不是 `Uint8Array`。Node 的 `Buffer` 等子类可以使用 |
| `invalid-utf8` | UTF-8 解码器报错，含流末尾被截断的多字节字符 |
| `event-too-large` | 单个事件的计数超过上限 |
| `unterminated` | 流在事件中途结束：最后一行没有换行，或已有 `data` 行而没有结束事件的空行 |

- 只有解码器自身的错误映射为 `invalid-utf8`。字节源抛出的其他错误原样传出。
- 失败时本包结束对字节源的迭代，字节源随之关闭。
- 读者提前结束事件迭代时，本包结束对字节源的迭代。读者在第一个事件之前结束时也是如此。读者在结束尚未完成时调用 `next()`，`next()` 等结束完成后返回 done，字节源只结束一次。字节源的结束失败时，读者的 `return()` 或 `throw()` 以该失败拒绝，事件迭代仍已结束，之后的 `next()` 返回 done。

### 协议帧

`readProtocolFrames(events, { endMarker, json })` 把事件 data 文本转为 `Outcome<PiProtocolFrame, FrameFailure>` 的序列。

- data 文本等于配置的 `endMarker` 时，本包产出 `end-marker` 帧。`endMarker` 为 `null` 表示协议没有 end-marker。
- end-marker 之后再出现任何事件（含第二个 end-marker）时，本包产出一次 `event-after-end` 失败，然后结束。
- 其他 data 文本由 `@omne-harness/json-text` 的 `readJsonText` 按调用方给出的 `JsonLimits` 无损解析。大整数保留原文词法。
- data 文本不是一个合法 JSON 文档，或超出限额时，本包产出一次 `invalid-json` 失败，然后结束。
- 失败之后，本包结束对事件源的迭代。SSE 层的异常原样穿过帧层。
- 读者提前结束帧迭代时，本包结束对事件源的迭代。读者在第一帧之前结束时也是如此。因此读者提前结束 `readProtocolFrames(readSseEvents(body))` 时，`body` 随之关闭。读者在结束尚未完成时调用 `next()`，`next()` 等结束完成后返回 done，事件源只结束一次。事件源的结束失败时，读者的 `return()` 或 `throw()` 以该失败拒绝，帧迭代仍已结束，之后的 `next()` 返回 done。
- 事件结束只结束帧序列，不产出终局帧。终局是否合法由家族 decoder 判断。

### 诊断隔离

`createDiagnosticSink(observer, { maxPending })` 隔离调用方的诊断观察者。`maxPending` 必须是正的安全整数，否则函数同步抛出 `RangeError`。

- 诊断事件只含种类与级别，不含 URL、头或体。观察者收到的是冻结的副本。
- 当前的事件种类是封闭集合：

  | 种类 | 级别 | 时刻 |
  | --- | --- | --- |
  | `exchange-started` | `info` | 交换发起之后 |
  | `connect-failed` | `error` | 收到响应之前连接关闭或连接超时 |
  | `error-body-too-large` | `error` | 错误体超过上限 |
  | `exchange-stopped` | `info` | 交换物理关闭时，不论结果 |

- 观察者同步抛出时，计为 `failed`。读取返回值的 `then` 抛出时，也计为 `failed`。
- 观察者返回 thenable 时，计为 `pending`，直到它完成。它拒绝时，再计为 `failed`。
- `pending` 达到 `maxPending` 时，本包丢弃新事件，计为 `dropped`。
- 观察者的任何行为都不改变交换结果，也不阻止后续事件的投递。
- `counters()` 返回冻结的 `{ failed, pending, dropped }` 快照。网络资源没有配置观察者时，计数保持为零。
- 事件词表的扩展、对外查询与保留不在本包当前范围。

### 家族表

家族表把供应商的精确采用解析到一个家族包的一条记录，再由这个家族给出绑定。家族表不认识线格式与厂商。

#### 记录与采用

- 记录是纯 JSON 数据。记录头 `PiModelRecordHead` 有 `name`、`revision`、`route`（`recipient` 与 `model`）与 `status`（`current` 或 `frozen`）。家族的记录类型扩展记录头。
- `recordAdoption(owner, record)` 返回 `{ owner, name, revision, digest }`。`digest` 是整条记录的规范 JSON 的 SHA-256，写成 64 位小写十六进制。摘要不写进记录。记录中的线数据与规则名都在摘要内，所以改动它们就改变采用。
- 规范 JSON 的写法：没有空白；对象的键按 UTF-16 码元排序；字符串与有限数按 `JSON.stringify` 的写法；`true`、`false` 与 `null` 原样写出。对这些值，这个写法与 RFC 8785（JCS）相同。tokenizer-tiktoken 的规范 JSON 是同一规则的子集。
- 记录含函数、`undefined`、symbol、bigint、非有限数、数组空位、访问器、非普通对象、symbol 键或环时，记录不是纯数据，`recordAdoption` 抛出 `RangeError`，消息写明路径与原因。
- pi 家族的采用约定：`owner` 是家族包名，例如 `@omne-harness/pi-ai-openai`。`name` 不解析，只做精确比较。这个约定只属于 pi 家族，不改 model-contract 的 `Adoption`。

#### 声明与组合

`defineFamily({ owner, records, acquire })` 只做计算，不创建 tokenizer、连接或模型实例。它返回不透明的 `PiFamily`。下列情况下，它同步抛出 `RangeError`：

- `owner` 不是非空字符串，或 `acquire` 不是函数，或 `records` 不是数组；
- 某条记录不是纯数据，或记录头缺项、为空或 `status` 不在两值之内；
- 两条记录的 `(name, revision)` 相同；
- 两条 `current` 记录的 `route` 相同。

`defineFamily` 保存每条记录的冻结副本，并只把副本交给家族的 `acquire`。调用方之后改动自己的对象，不改变采用。

`composeFamilies(families)` 返回唯一的 `PiFamilyContributions`，交给 `createPiTransport`。下列情况下，它同步抛出 `RangeError`：某个值不是 `defineFamily` 的返回值；两个家族的 `owner` 相同；两个家族声明同一采用。

#### 取得

`acquire(supplier, signal)` 按 `supplier.adoption` 的全部四项精确查表：

| 情况 | 结果 |
| --- | --- |
| 四项采用查不到 | `unavailable`，`dependency` 为采用里的 `owner`，`diagnostic` 为 `adoption-not-installed`。不调用任何家族 |
| 查到，`supplier.recipient` 与记录不符 | `invalid`，`field` 为 `supplier.recipient`，`reason` 为 `route-mismatch` |
| 查到，`supplier.model` 与记录不符 | `invalid`，`field` 为 `supplier.model`，`reason` 为 `route-mismatch` |
| 调用家族之前 `signal` 已中止 | `unavailable`，`diagnostic` 为 `cancelled`。不调用家族 |
| 查到且一致 | 用记录的冻结副本调用该家族的 `acquire(record, supplier, signal)`。家族的失败原样返回 |
| 家族返回的绑定的 `supplier` 或 `adoption` 与请求不符 | 先释放该绑定，再返回 `unavailable`，`diagnostic` 为 `binding-mismatch` |
| 家族返回绑定时 `signal` 已中止 | 先释放该绑定，再返回 `unavailable`，`diagnostic` 为 `cancelled` |

后两行的 `dependency` 为家族的 `owner`。释放失败时，`acquire` 以该失败拒绝。家族表不解析名字，不按前缀匹配，不取最新修订，不把供应商转给别的家族。

#### 回放格式查询

`replayFormatsOf(families, adoption)` 只读返回该采用对应记录的 `replay.formats`（`produces` 与 `accepts`）。没有家族声明该采用，或记录没有 `replay.formats` 时，它返回 `null`。

Model runtime 不读家族表。家族在绑定的 `replayFormat` 中给出这次发出产出的格式，传输把它写入物化回执（见[materialize](#materialize) 第 6 步）。Model runtime 收场时从发出记录的回执读取它。

### 网关引擎：请求

网关引擎实现 OpenRouter chat completions 协议，供家族包产生绑定。引擎不认识任何厂商：厂商差异只能是记录中的线数据，或四个 hook 之一。`src/chat-completions/` 的源码不得出现厂商名或型号家族名，一项测试强制这一点。

#### 绑定

`bindChatCompletions({ record, supplier, hooks, meter, limits, release })` 返回完整的 `PiFamilyBinding`：

- `adoption` 是 `recordAdoption(supplier.adoption.owner, record)`。它必须等于 `supplier.adoption`。
- `replayFormat` 是记录的 `replay.formats.produces`。
- `counting` 是 `meter.instance.basis`，`meter` 是 `meter.instance`。它实现 `CalibratedInputMeter`：`measureCalibrated` 接收准备租约交来的 `MeterCalibration`，`measure` 是同一算法加空校准（没有锚点、没有来源）。
- `rules.plan`、`tools`、`encode` 都是纯计算，不读环境、秘密、网络或文件。
- `createDecoder()` 每次返回一个新的解码器，按 `limits` 限制缓冲，见“网关引擎：流解释”。
- `release` 包一层家族的 `release`：第一次调用调用它，之后每次调用返回第一次的 Promise。

下列情况下，`bindChatCompletions` 同步抛出 `RangeError`。这些是家族包的缺陷：

- 记录的采用不等于 `supplier.adoption`，或记录的 `route` 与供应商不符；
- 计量器的 `basis.supplier.adoption` 不是记录的采用；
- 记录的回放声明不合格，或 `replay.formats.accepts` 不含 `produces`；
- `wire.usageTail.maxFrames` 不是非负整数；
- 某个受支持参数的默认值超出记录自己的范围或映射；
- 某个网关字段有两个写入方，或扩展与 `wire.fixed` 写入词表以外的字段。写入方是参数表、扩展表与 `wire.fixed`；
- `limits.maxReasoningText` 或 `limits.toolArguments` 的某项不是正整数。

#### 记录的线数据

引擎读取的线数据全部必填，引擎没有默认值。新的变化点只能作为 `wire` 的新必填字段加入。

- `serving.order` 写入请求体的 `provider.order`。`serving.reports` 供解码器核对流中报告的服务方。
- `wire.roles.instruction` 是系统指令的角色。`wire.roles.reminder` 是 system reminder 的角色。压缩摘要的角色是 `user`。
- `wire.content` 为 `compact` 时，只有一个文本部件的内容写成字符串，其他内容写成部件数组。为 `parts` 时，所有内容都写成部件数组。
- `wire.cache`、`wire.image`、`wire.fixed` 见下文“请求体”。`wire.usageTail` 归解码器。
- `parameters` 按契约 `Parameter` 的全部 kind（`extension` 除外）给出规则：`unsupported`，或 `supported` 加取值范围（`accept`）、默认值（`default`）与网关字段（`wire`）。`reasoning-effort` 按值映射，可以映射为 `unsupported`。
- `extensions` 按 `definition` 采用的全部四项匹配扩展参数，匹配到时写入规则的网关字段。
- `replay.declaration` 是本记录的官方回放声明，只供官方档案使用。plan 与 encode 不读它。`replay.formats` 是回放格式。

网关字段是闭合词表 `GatewayParam`：`temperature`、`top_p`、`frequency_penalty`、`presence_penalty`、`max_tokens`、`seed`、`stop`、`reasoning.effort` 与 `store`。新增字段要修改引擎。`reasoning.effort` 的值是 `minimal`、`low`、`medium`、`high`、`xhigh` 与 `max`。

按项目约定，引擎不关闭推理（见[模型组架构](../docs/architecture.md#厂商适配的内聚范围)）。词表没有 `reasoning.enabled`，推理强度没有 `none`。记录把 `reasoning-effort` 的 `none` 映射为 `unsupported`。引擎不给出 `reasoning-disabled` 诊断。

#### plan

`rules.plan({ profile, supplier, assembled })` 按下列顺序进行，第一个失败即返回：

1. 核对供应商。`supplier` 不是本绑定的供应商时，返回 `invalid`（`field` 为 `supplier`，`reason` 为 `not-this-binding`）。`profile.definition.suppliers` 中没有采用相等的一项时，返回 `invalid`（`reason` 为 `not-in-profile`）。
2. 展开回放声明。引擎用 `judgeReplayDeclaration` 展开档案中该供应商的声明，投影使用展开后的值。这就是该档案的请求为这个供应商固定的声明。档案中的声明不合格时，返回 `judgeReplayDeclaration` 的 `invalid`。档案的声明可以与记录的官方声明不同。
3. 规划参数，按请求中的顺序：
   - 同一 kind 或同一扩展出现两次：`invalid`，`reason` 为 `repeated`；
   - 显式参数的 kind 不受支持，或 `reasoning-effort` 的值映射为 `unsupported`：`unsupported`，`field` 为 kind，`adapter` 为记录采用；
   - 显式值超出记录范围：`invalid`，`reason` 为 `out-of-range`；
   - `max-output-tokens` 的显式值或默认值大于 `context.output.provided`：`invalid`，`field` 为 `max-output-tokens`，`reason` 为 `above-output-limit`；
   - 扩展参数匹配不到：`unsupported`，`field` 为 `extension`。值不符合网关字段的类型：`invalid`，`field` 为 `extension`，`reason` 为 `value`；
   - 省略的受支持 kind 有 `send` 默认值时，记为 `origin: 'default'`，来源为记录采用。默认值为 `absent` 时不记录也不写出。
   - 显式参数记为 `origin: 'explicit'`，`requested` 为请求值，来源为 `assembled.source`。
   参数采用先按 `temperature`、`top-p`、`max-output-tokens`、`stop`、`reasoning-effort`、`seed`、`frequency-penalty`、`presence-penalty` 的顺序列出，再按请求顺序列出扩展参数。
4. 投影。引擎做一次投影，投影的失败（见下文“投影”）在这一步返回。最后一个用过工具的 assistant 消息不可续接时，参数采用不变：请求保持请求的推理强度。
5. 调用 `hooks.check({ applied, messages, treatments })`。它只校验，不改写。它的失败原样返回。
6. 形成表示。引擎用第 4 步的投影与参数写出请求体，再调用 `meter.represent(view)`。写出请求体的失败（见下文“请求体”）在这一步返回。返回的采用必须等于 `assembled.representation`，不等时返回 `unsupported`（`field` 为 `representation`）。表示为 `materialized`，`media` 为空，`requestBytes` 是请求体的字节数，`units` 是家族 `represent` 从投影的 `ProjectedTurn.message` 写出的消息侧表：与 `tokenInput` 的消息单元逐项对齐，前置指令为 `null`。侧表不改变计数字节。

plan 不返回诊断。

#### encode

`encode({ request, media, declaration, resent })` 与 plan 使用同一投影与同一请求体写法，所以计量看到的就是发出的形状。`declaration` 是请求为本供应商固定的回放声明，`resent` 是这次发出须视为不可续接的消息。引擎不再使用记录的官方声明。

按下列顺序进行，第一个失败即返回：

1. `media` 非空时返回 `unsupported`（`field` 为 `media`）。
2. 投影。
3. 调用 `hooks.check`。参数取 `request.parameterAdoptions` 中 `supplier` 等于本绑定采用的各项的 `applied`。
4. 写出参数。某项不能按记录写出时，返回 plan 会返回的同一失败。两项写入同一个网关字段时，返回 `invalid`，`field` 为 `parameterAdoptions`，`reason` 为 `repeated`。例如两个供应商只有凭据不同，所以采用相同，请求中两者的参数采用都交给这个绑定。encode 对经判定的请求不抛出异常。
5. 写出请求体，调用 `meter.represent`。表示采用必须等于 `request.representation`。
6. 返回请求体、表示与诊断。诊断是投影中每条略去推理续接状态部件的消息一条 `replay-omitted`（消息身份、`scope`、`format` 与部件个数），按消息次序。诊断不含载荷或正文。

#### 投影

投影把系统指令、消息与工具声明映射为网关消息。失败的 `field` 是安全路径：`/system/<i>`、`/messages/<i>/blocks/<j>`、`/messages/<i>`、`/tools/<k>/<hook 的字段>` 或 `toolChoice`。

- `visibility.toModel` 为假的块不写出。空文本块照原样写成文本部件：引擎不删除它，也不改写历史（组架构“不得悄悄删工具、改历史”）。`tool_internal` 消息不写出。所有块都对模型不可见的 user、reminder 与压缩消息不写出。
- 系统指令只含文本。模型可见的非文本块返回 `unsupported`。
- 图片：`wire.image` 为 `null`，或媒体类型不在 `wire.image.mediaTypes` 中时，返回 `unsupported`。图片写成 `image_url` 部件，`url` 为 data URL，`detail` 取记录值。内容引用、语音与文件返回 `unsupported`。
- assistant 消息：文本写成部件；完整调用写成函数调用，参数是值树的 JSON 文本；未解析的调用写原文；未完成的调用返回 `invalid`（`reason` 为 `incomplete-tool-call`）。没有文本部件时，`compact` 写空字符串，`parts` 写空数组。没有文本部件、调用与回放成员的 assistant 消息不写出。
- 工具消息：角色为 `tool`，`tool_call_id` 为规范化的调用 id，内容是结果中的文本。结果中的图片不写进工具消息。连续的一串工具消息的全部图片在这串之后写成一条 user 消息。引擎不写占位文本，不插入桥接的 assistant 消息。
- 工具调用 id：符合 `^[A-Za-z0-9_-]{1,64}$` 时保留，否则为 `call_` 加该 id 的 SHA-256 base64url 的前 32 个字符。
- 孤立的调用（之后没有对应结果）返回 `invalid`，`reason` 为 `orphan-tool-call`。没有对应调用的结果返回 `invalid`，`reason` 为 `orphan-tool-result`。
- 工具：`{ type: 'function', function: { name, description, parameters } }`，`parameters` 经 `hooks.toolSchema`。`binding.tools.convertToModelPayload` 给出同一形式。
- `tool_choice`：没有工具时，`none` 与 `auto` 不写出，`required` 或指名返回 `invalid`（`reason` 为 `no-tools`）。指名的工具不在工具中时返回 `invalid`（`reason` 为 `unknown-tool`）。

回放按 model-contract 的 `projectReplay` 投影。`declaration` 在 plan 中是档案声明展开后的值，在 encode 中是 encode 的输入。`formats` 取记录的 `replay.formats.accepts`。请求关闭回放时 `off` 为真。`resent` 在 plan 中为空，在 encode 中是 encode 的输入：

- 可续接的消息：`replay.at` 指出的模型可见部件与原生 `thinking` 交给 `hooks.reasoning.replay`，`source` 为 `continuable`。它返回 `details` 时写 `reasoning_details`，返回 `plain` 时写 `reasoning`，返回 `none` 时不写回放成员。
- 不可续接的消息：不写推理续接状态部件。`thinking` 按 `foreignThinking` 处理：`omit` 不写，`text` 作为文本部件写入，`adapter` 交给 `hooks.reasoning.replay`，部件为空，`source` 为 `foreign`。`text` 写入的思考在交给计量器的投影中也是文本块，不是思考块，所以计量器计入它（model-contract“推理回放”的计量：计量器与编码器对同一供应商使用同一投影）。
- 需要写回放而 `hooks.reasoning` 为 `null` 时，返回 `unsupported`，`field` 为该消息的路径。所以 `foreignThinking` 为 `adapter`、外来消息有 `thinking`、而家族没有推理编解码器时，结果是 `unsupported`。家族的编解码器也可以对它没有写法的输入返回 `unsupported`。
- encode 把 `projectReplay` 返回的 `diagnostics` 写成 `replay-omitted` 诊断。

#### 请求体

请求体是排序键的无损 JSON（`json-text` 值树）：

- `model` 为记录的 `route.model`；
- `provider` 为 `{ order: serving.order, allow_fallbacks: false, require_parameters: true }`；
- `stream` 为 `true`。引擎不写用量开关（`stream_options` 或 `usage`）；
- `messages`、`tools`（有工具时）与 `tool_choice`（见上文）；
- 已规划参数按记录映射写入，再加 `wire.fixed`。带点的字段嵌套一层，例如 `reasoning.effort` 写成 `{"reasoning":{"effort":…}}`；
- `wire.cache` 为 `last-message` 时，最后一条消息的最后一个非空文本部件加 `cache_control: { type: 'ephemeral', ttl }`。字符串内容先改写成一个文本部件。空文本部件不是位置。最后一条是只有图片的 user 消息时，标记加在它的最后一张图片上。图片与空文本混排的消息不是只有图片的消息。没有可放位置时返回 `unsupported`，`field` 为 `no-cache-target`，例如最后一条 user 消息是空文本加图片，或图片加空文本。

`requestBytes` 是传输序列化请求体（`writeJsonText` 的 UTF-8 字节）的字节数。

#### 校准算术

`calibratedAmount(input)` 是两个家族计量器共用的纯函数，实现 [model-contract“可选校准”](../model-contract/SPEC.md#可选校准及不可解释的历史)的算术。家族给出：token 输入（`messages` 成员列出消息单元的对象）、表示的 `units` 侧表、每个单元是否带推理状态、用家族 tokenizer 计数一个 token 输入的函数、给定单元在文本之外的追加 token（图片规则）、推理单元没有来源时的具名诊断、不可用的 `dependency`，以及余量百分比。方法沿用封存件 `input-meters/marginal.ts`（完整包络差）与 `input-meters/output-history.ts`（每个完整输出组记一次 O）。

- **完整计量。**带推理状态的单元不分词，改记 `calibration.outputs` 中该消息的 O；其余单元照常计数。没有被替换的单元时，计数的就是 token 输入本身，字节不变。任一需要 O 的单元没有条目时返回 `unavailable`，诊断为家族给出的具名诊断；条目为扣留时诊断为扣留原因。先查来源，再计数，再算追加 token。结果整体为估算，余量按整体算。
- **锚点命中。**`units` 把消息单元分成前缀（消息在 `anchor.covered` 中）与新增；`null` 单元归入包络。新增部分 = `count({...包络, messages: 新增的非推理单元})` − `count({...包络, messages: []})` ＋ Σ 新增推理单元的 O ＋ 新增非推理单元的追加 token。包络去掉 `tools` 与 `tool_choice`。前缀中的推理单元不需要来源。结果 = `anchor.inputTotal`（不加余量）＋ 新增部分；余量只按新增部分算。新增部分的包络差为负时不命中，原因为 `continuation-shrank`，按完整计量回答。
- **拒绝。**`tokenInput` 不是带 `messages` 数组的对象：`invalid`，`field` 为 `tokenInput`；`units` 与单元数不等：`invalid`，`field` 为 `representation.units`，`reason` 为 `length`；有锚点而没有 `units`：同字段，`reason` 为 `missing`；`anchor.inputTotal` 或某个 O 不是十进制整数：`invalid`，`field` 为 `calibration.anchor` 或 `calibration.outputs`。推理标志与单元数不对齐、余量百分比不是非负十进制整数是家族缺陷，同步抛出。

返回 `amount`（锚点加估算部分）、`margin`（只按估算部分）、`anchor`（`hit`、`continuation-shrank` 的 `miss`，或没有锚点时的 `null`）与 `substituted`（是否有单元被 O 替换）。方法名按[共用计量规则](#共用计量规则)由这两项得出。

#### 共用计量规则

两个家族计量器在校准算术之外共用以下纯函数与常量。家族只给出自己的值：计量器采用、输出组方法名与每个单元的追加 token。

- **空校准。**`NO_CALIBRATION` 是冻结的空校准（没有锚点，没有 O）。家族的 `measure(input)` 用它调用 `measureCalibrated`。
- **方法名。**`calibratedMethod({ meter, outputGroup, amount })` 从计量器采用开始。`amount.substituted` 为真时，名字加 `+<outputGroup>`。`amount.anchor` 为 `hit` 时，名字再加 `+continuation-anchored/1`（`ANCHORED_METHOD`）。两者都有时，输出组方法在前。`continuation-shrank` 的不命中不加后缀。`owner`、`revision` 与 `digest` 不变。没有后缀时返回计量器采用本身。
- **输入摘要。**`calibratedDigest({ measure, calibration })` 是以下字段的 JSON 文本的 SHA-256 十六进制：`profile`、`supplier`、`context`、`limits`、`parameters`，以及表示的 `adoption`、`tokenInput` 的无损 JSON 文本与 `media`。校准有锚点或有 O 条目时，摘要也纳入整个校准，所以换锚点或换 O 就是换输入。空校准不进入摘要，所以普通计量的摘要与没有校准时相同。表示的 `units` 侧表不进入摘要。
- **追加 token。**`unitExtras(perUnit)` 给出校准算术的 `extra`。每次调用都重新调用 `perUnit`，再对所给单元的追加 token 求和。没有条目的单元加零。`perUnit` 失败时，`extra` 返回同一失败。

### 网关引擎：流解释

解码器是一个阶段联合（`streaming`、`finished`、`faulted`、`ended`）加一个纯归约步：每个数据帧先在边界读成具名的 chunk，再由归约步从当前阶段与 chunk 得到下一阶段与事实。归约步不导出。每次 dispatch 一个解码器，解码器之间不共享状态。映射遵循 [model-contract“供应商解释与流状态归约”](../model-contract/SPEC.md#供应商解释与流状态归约)。

#### 限额

绑定输入 `limits` 来自家族配置，不属于记录，所以不进入采用摘要。

- `toolArguments`：一次工具调用的参数文本，包括名字到达之前缓存的部分，UTF-8 字节数不得超过 `maxBytes`。封口时按全部预算解码。
- `maxReasoningText`：已缓存的全部 `reasoning_details` 片段中字符串成员的 UTF-16 长度之和的上限。

超过限额时，解码器以 `upstream-protocol` 失败，诊断为 `tool-arguments-over-limit` 或 `reasoning-over-buffer-limit`。

#### chunk 的形状

- chunk 必须是对象，否则为 `chunk-not-object`。
- `choices` 至多一项。两项及以上为 `multiple-choices`。
- delta 的 `images` 或 `audio` 有内容时为 `unsupported-delta-member`。本引擎不解码这些输出。
- 其他成员的类型不符时，诊断写明成员组，例如 `delta-shape`、`tool-call-shape`、`reasoning-detail-shape`、`finish-shape`、`serving-shape`、`usage-shape`。
- 本引擎忽略未知成员，例如 `id`、`created`、`service_tier` 与 `native_finish_reason`。
- 空字符串与 `null` 等同于没有该成员。

#### 映射

| 上游 | 事实 |
| --- | --- |
| `delta.content`、`delta.refusal` | 同一个文本块：第一次给 `block-open`（`text`，`append`），之后给 `block-delta`。拒绝不决定终止 |
| 可见推理 | 一个思考块，开块与填充同上。每个响应只用第一个非空来源：`delta.reasoning`，其次 `reasoning_details` 中 `reasoning.text` 项的 `text`，再次 `reasoning.summary` 项的 `summary`。等于 `[REDACTED]` 的文本不是可见文本，也不决定来源 |
| `reasoning_details` 片段 | 缓存。片段与上一项拼接要同时满足三个条件：两者类型相同且是 `reasoning.text` 或 `reasoning.summary`；两者的头部相同；两者的身份相同。头部是除可见文本成员（`text` 或 `summary`）以外的全部成员，`reasoning.text` 另外除去 `signature`。头部按排序键的无损 JSON 文本比较，所以 `id`、`index`、`format` 与未知成员都必须相同。身份相同是指两者都没有 `id`（缺失或 `null`），或两者的 `id` 是同一个非空字符串。`id` 为空串的片段不拼接。`reasoning.text` 另有签名规则：任一侧有签名时，没有 `id` 的两项还必须都有 `index`；签名可以单独在最后一个片段到达，这个片段没有 `text`；未签名的项采用第一个签名；之后只有签名相同的片段可以拼接，其他片段（含未签名的片段）开始新项；空签名或非字符串签名不拼接。上一项没有 `signature` 成员而片段的 `signature` 是 `null` 时，拼接后的项带 `signature: null`。其他片段（含 `reasoning.encrypted`）各成一项 |
| `delta.tool_calls` 片段 | 按 `index` 区分调用。名字到达之前缓存参数文本；名字到达时给 `block-open`（`tool-arguments`）与缓存文本的一个 `block-delta`，之后每段参数文本一个 `block-delta`。同一调用的 `id` 或名字改变为 `tool-call-id-changed` 或 `tool-name-changed` |
| `finish_reason` 为 `stop`、`tool_calls`、`length` | 按块序号封全部开着的块，再封推理续接状态部件。终止为 `completed`，`reason` 分别为 `stop`、`tool-suggestions`、`limit`。`length` 也封文本、思考与推理，但工具参数块保持开着：参数可能被截断，不能成为可执行的调用 |
| `stop` 或 `tool_calls` 时没有内容 | 内容是文本块、思考块或有名字的工具调用。推理续接状态部件不是内容。没有内容时不封块，终止为 `failed`，`cause` 为 `upstream-protocol`，诊断为 `finish-without-content`。`tool_calls` 时有内容但没有工具调用，同样不封块，诊断为 `finish-without-tool-call`。原因：契约只在至少一个有效块合法封口后把 `stop` 与 `tool-suggestions` 映射为 finish（model-contract“供应商解释与流状态归约”）。`length` 不受这条限制。尾帧与账目照常 |
| 其他 `finish_reason`（例如 `content_filter`） | 不封块。终止为 `failed`，`cause` 为 `input-rejected`，诊断为 `finish-reason-<值>`。值不是 64 个字符以内的小写字母与下划线时，诊断为 `finish-reason-other` |
| finish 时仍有没有名字的调用 | `upstream-protocol`，`tool-call-without-name` |
| finish 之后的尾帧 | 至多 `wire.usageTail.maxFrames` 帧。尾帧可以只含 usage，也可以重复同一个 `finish_reason` 且 delta 为空。超出帧数为 `usage-tail-too-long`，含内容为 `content-after-finish`，`finish_reason` 不同为 `finish-changed` |
| `usage` | 在任一帧到达时读成 `GatewayUsage` 并保留最后一份。不是十进制整数的计数为 `null`。见下文“账目” |
| 第一帧的 `model` 与 `provider` | 固定服务方。缺任一项为 `serving-not-reported`。`provider` 不在 `serving.reports` 中为 `provider-not-pinned`。之后的帧报告不同的值为 `provider-changed` 或 `model-changed` |
| 带内 `error` | 失败。`code` 是整数时，`cause` 按 HTTP 状态映射（与“交换结果”相同），`upstreamStatus` 为该整数；否则 `cause` 为 `unclassified`。诊断为 `in-band-error`。错误正文不进入事实或诊断 |
| 结束标记 | 不给事实。`end()` 给出终止 |
| 没有 finish 就结束（响应体结束或结束标记） | `end()` 以 `stream-lost` 失败，诊断为 `ended-without-finish` |

#### 封口

- 文本块与思考块封为 `text` 与 `thinking`，内容是累计值。块的身份是 `b<序号>`，可见性对人与模型都可见。
- 工具参数块封为 `tool_call`：`callId` 是上游的调用 `id`，`name` 是上游的名字，`arguments` 是参数文本按 `limits.toolArguments` 解码的值。空参数文本是空对象。没有 `id` 为 `tool-call-without-id`，不能解码为 `tool-arguments-invalid`。
- 记录有推理编解码器且缓存了推理项时，解码器把全部拼接后的项交给 `hooks.reasoning.seal` 一次。hook 失败时，解码器以该 fault 失败。hook 给出的每个载荷在新的序号上整块封为推理续接状态部件，不先开块：可见性对人不可见、对模型可见，`pairs` 指向思考块（没有思考块时为空）。空载荷不产生部件。长度超过 message 成员 `REASONING_STATE_PAYLOAD_MAX_LENGTH`（1048576）的载荷不产生部件，解码器在原位置给出一条 `diagnostic` 事实：`reasoning-state-dropped`，`reason` 为 `payload-too-long`，`length` 为载荷长度。

#### 失败与阶段

- 归约步的失败让 `accept` 返回该 `ModelFault`。阶段为 `streaming` 时，阶段进入 `ended`。阶段为 `finished` 时，阶段进入 `faulted`，`faulted` 保留收场时的服务方与已收的 usage。传输随即停止读取，以该 fault 结束事实流。
- `finished` 阶段的 `end()` 给出账目与唯一的 `ended`，阶段进入 `ended`。
- `faulted` 阶段的 `accept` 以 `upstream-protocol`（`frame-after-end`）失败，阶段不变。`end()` 给出账目，再给出以该 fault 失败的 `ended`，阶段进入 `ended`。
- `ended` 阶段的 `accept` 以 `upstream-protocol`（`frame-after-end`）失败，`end()` 以 `decoder-already-ended` 失败。
- 事实流的唯一 `ended` 仍由传输守护（见“事实流”）。解码器不另做检查。

#### 账目

`finished` 与 `faulted` 阶段的 `end()` 先调用 `hooks.usage` 一次，再给出事实。收场值是什么都如此，含被拒的收场（例如 `content_filter`）。参数是保留的最后一份 usage；响应没有报告 usage 时，参数的四个计数都是 `null`，`raw` 为空。hook 失败时，解码器以该 fault 失败，不给出账目。

hook 成功时，`end()` 按下列次序给出事实：

1. 一个 `account` 事实，`event` 为 `usage`，值是账目报告 `CallAccountReport`：
   - `usage` 是 hook 返回的 `items`；
   - `cost`：usage 的 `cost` 成员是非负 JSON 数时，为一项 `known`，`unit` 为 `openrouter-credit`，`source` 为 `billable`。没有指数的词法照原样。有指数的词法改写成精确的普通十进制词法：只移动小数点，不经浮点数，例如 `2.25e-7` 写成 `0.000000225`。改写后超过 512 个字符时为 `unknown`。该成员是负数或不是数时，为一项同单位、同来源的 `unknown`。没有该成员或为 `null` 时，为空。网关的 `cost` 以额度计，不是货币，所以单位不是 `USD`。网关按该成员扣除额度，所以来源是 `billable`，不是 `supplier`；
   - `trimmed` 为 `{ state: 'unknown', unit: 'token' }`；
   - `place` 为 `openrouter/<第一帧报告的 provider>`；
   - `duration` 为 `{ state: 'unknown' }`，解码器不计时；
   - `revision` 为 `'1'`。
2. hook 返回的每条 `usage-inconsistent` 诊断，各一个 `diagnostic` 事实。
3. `ended`。`faulted` 阶段的 `ended` 以该阶段保留的 fault 失败。

报告不含调用身份与迟到标记，保存方补上它们。

已收场的响应在之后失败时，账目照样给出。用量取失败之前保留的最后一份，缺失值为未知（model-contract“[供应商解释与流状态归约](../model-contract/SPEC.md#供应商解释与流状态归约)”：坏帧、取消或传输异常时，保留已经取得的用量）。这些失败是：收场之后解码器拒绝的帧（例如 `usage-tail-too-long`、`content-after-finish`、`finish-changed`、带内错误与 chunk 形状错误），以及事实流中的响应体断开、SSE 分帧失败、协议帧失败、取消与关闭。

在收场之前失败的流（带内错误、协议错误、断流）没有账目。

### 家族测试助手

子入口 `./testing` 读写文件，只供家族包的测试与脚本使用。

#### 夹具检查

`checkChatCompletionsFixtures(family, root)` 以家族的记录表为唯一清单，`current` 与 `frozen` 记录都检查。每条记录的夹具目录是 `<root>/<name>/<revision>/`，两段各自经 `encodeURIComponent` 编码，所以名字中的 `/` 写成 `%2F`。目录中有三个文件：

- `request.json`：恰好两个成员的对象。`request` 是一个 `FixedModelRequest` 的普通 JSON，经契约的 `judgeFixedModelRequest` 读入。它的供应商采用必须是该记录的采用，参数采用只取这个供应商的项。`body` 是期望的请求体。检查把 `request` 交给 `encode`（媒体为空），把结果与 `body` 按排序键无损 JSON 比较。
- `stream.sse`：一个响应体的 SSE 字节，以 `data: [DONE]` 结束。
- `facts.json`：期望的事实数组，最后一项是 `ended`。事实按 `JSON.stringify` 写出：块与工具参数中的 JSON 值是 `json-text` 值树。检查让绑定的新解码器经与发送相同的主体解码（含唯一 `ended` 的守护与终止映射）回放 `stream.sse`，再按值比较。

绑定由 `composeFamilies([family])` 以工厂凭据的供应商取得，检查之后释放。回放的 SSE 与 JSON 预算取文件大小，所以限额不会截断夹具。

结果 `problems` 每项一行，报告：缺目录或缺文件；`request.json` 不合格或契约拒绝其请求；取得或编码失败；请求体不等；事实不等；根下或名字目录下不对应任何记录的目录。

#### 采用指纹

`tests/fixtures/adoptions.json` 由家族包提交。文件是 JSON 数组，每行一项 `{"name", "revision", "digest"}`，形式由 `renderFingerprints` 给出。

- `checkAdoptionFingerprints(family, file)` 双向核对：缺文件、文件不是给定形式、重复行、记录没有行、行的摘要与记录不同、行不对应任何记录，各报一项。
- `appendAdoptionFingerprints(family, file)` 为没有行的记录在已有行之后追加新行，返回新行。文件不存在时新建。文件不是给定形式，或某条记录已有摘要不同的行时，抛出 `RangeError`，不写文件：记录改动必须加新修订，不改已有行。不对应记录的行保留，由检查报告。

## 所有权、失败与生命周期

### 名额与交换

- 预约归容量。`consume()` 之后，名额归交换，由交换持有的座位归还。
- 交换在下列各项都结束之后才归还名额：
  - 请求物理关闭；
  - 收到响应时，响应物理关闭；
  - 有错误体时，错误体读取结束。
- `stopped` 完成时，请求与响应已关闭，错误体已读取结束，名额已归还，交换已离开在途登记，信号上的监听器已移除。
- `stop()` 只请求本地物理停止，并且幂等。已发出的请求不能撤回。停止不表示供应商没有收到请求。
- 取消信号与 `stop()` 的效果相同。

### 调用方责任

- 创建网络资源的调用方负责调用 `close()`。
- 持有预约的调用方负责归还预约，或把它交给一次交换。
- 认领 2xx 响应体的读者负责读完它，或停止交换。
- 调用方在发起时把凭据放进请求头。本包不解析、保存或记录凭据。
- 三段传输的调用方在调用 `start` 之前把本次发送的秘密写入凭据槽，在 `start` 返回之后立即清空凭据槽。凭据槽由所有发送共用，本包只在 `start` 的同步调用中读取它。秘密与 `supplier.credential` 的对应关系由调用方保证。

### 秘密与对外事实

- 凭据由调用方在发起时放进请求头。本包只校验头部字符集，不解析、保存或记录凭据。
- 响应头与错误体只在包内交给家族解释。本包不把它们写入任何对外事实或诊断。
- 对外失败的 `diagnostic` 是安全的短文本，不含秘密、URL、响应头或错误体。下列两方形成它：
  - 本包形成交换、协议与凭据槽的诊断：`http-<状态码>`、`connect-failed`、`connect-timeout`、`response-body-lost`、`sse-<原因>`、`frame-<原因>`、`no-termination`、`decoder-ended-twice`、`credential-not-provided` 与 `credential-not-a-header-value`。materialize 与 prepare 的失败另用 `cancelled`、`network-closed`、`transport-closed` 与 `prepared-closed`。
  - 网关引擎的解码器形成“网关引擎：流解释”中列出的诊断。它们只含固定的词与上游的整数错误码，不含上游正文。
  - 家族形成解码器 fault 与家族返回的失败中的诊断。本包原样给出它们。
- 家族实现者与同包调用代码必须遵守同一约束：原样的请求头、响应头与错误体不得写入对外事实或诊断。
- 代理 URL 可能含凭据。本包按秘密对待它：抛出的消息、结果与诊断都不含它。Node 的隧道错误消息含代理地址，本包不传出这些消息，连接失败只表达为 `connect-failed`。

### 网络资源

`createNetworkResources(config)` 组合容量、连接池、在途登记与诊断隔离。`maxConnections`、`idleConnectionTimeoutMs` 与 `diagnostics.maxPending` 必须是正的安全整数，`idleConnectionTimeoutMs` 还不能超过 2147483647，否则函数同步抛出 `RangeError`。所有限额都来自调用方，本包不设默认值。

配置了 `proxy` 时，下列情况下函数同样同步抛出 `RangeError`：

- `url` 不能解析为 URL，或协议不是 `http:` 与 `https:`；
- `bypass` 不是数组，或某一项不是字符串、为空、含逗号或含空白；
- 当前 Node 低于 24.5.0。24.5.0 之前的 24.x 不支持 `proxyEnv`，会静默忽略它而直连，所以本包拒绝构造。

这些消息只写字段名与规则，不含 URL 的任何部分。

`close()` 按下列顺序执行：

1. 关闭容量。等待中的预约以 `undefined` 结束，之后的预约被拒绝。
2. 停止每个在途交换。经代理正在建立的连接随交换一起结束。
3. 销毁连接池，含池中的空闲连接。
4. 等待每个在途交换的 `stopped` 完成。

- 第 4 步完成之后，`close()` 返回的 Promise 才完成。
- `close()` 幂等。重复调用返回同一个 Promise。
- 第一次调用 `close()` 之后，`startExchange` 以 `resources-closed` 拒绝。

### 缺陷与异常

- 四种结果、七种拒绝原因、三种错误体状态、两种响应体读取错误与 SSE、帧的失败原因覆盖 Node 契约内的全部情况。
- 本包只在调用方违反配置规则，或在 Node 契约以外的情况下拒绝 `result` 或抛出异常：
  - 配置不符合规则：`createPiTransport` 同步抛出 `RangeError`（规则见“构造”），`createNetworkResources` 同步抛出 `RangeError`（规则见“网络资源”）。
  - `startExchange` 以 `invalid-url`、`invalid-body`、`invalid-limit` 或 `reservation-unusable` 拒绝一次已校验的发送：`start` 抛出 `Error`，名额已归还。这是本包的缺陷。
  - 家族的 `createDecoder()` 或凭据槽的 `read()` 抛出：`start` 先归还名额，再原样抛出该异常。
  - `signal` 不是 `AbortSignal`：`startExchange` 抛出 `TypeError`，名额已归还。
  - 响应没有状态码，或错误体的块不是字节：`result` 拒绝。
  - 响应体的块不是字节：读者的迭代以普通的 `Error` 结束。
- 家族表与网关引擎的装配缺陷同步抛出 `RangeError`：`recordAdoption`、`defineFamily` 与 `composeFamilies` 的条件见“家族表”，`bindChatCompletions` 的条件见“网关引擎：请求”。
- 网关字段在一次请求中被写入两次时，引擎抛出 `Error`。绑定时的字段检查使这只能来自本包的缺陷。
- 本包不把未知异常转为普通失败，未知异常原样传出。

## 组合与验证

本包消费以下承诺：

- `@omne-harness/operation-result` 的 `Outcome`。
- `@omne-harness/json-text` 的 `readJsonText`、`writeJsonText`、`JsonLimits` 与 `JsonValue`。
- `@omne-harness/model-contract` 的类型：五个接口类型引用的类型，三段传输实现的 `ModelTransport`、`PreparedTransport`、`MaterializedTransport` 与它们的结果类型，以及网关引擎读写的请求、档案、参数、计量与回放类型。消息、用量项等共享类型经这些类型取得，本包不另行依赖 message 或 call-account。
- `@omne-harness/model-contract` 的运行时值 `projectReplay` 与 `judgeReplayDeclaration`，供网关引擎投影回放与展开回放声明。
- `@omne-harness/content-block` 的类型，供五个接口类型引用，以及运行时值 `judgeBlockIdentity`，供解码器形成块的身份。
- Node 内置的 `https`、`http`、`net`、`crypto` 与 `stream`（只用类型）。测试入口另用 `fs/promises`、`path` 与 `util`。
- Node 24.5.0 起 `https.Agent` 的 `proxyEnv` 选项与内置的 CONNECT 隧道。

运行依赖只允许上述四个 workspace 成员与 Node 内置模块。本包不依赖 `@omne-harness/model`、Session、旧消息包或封存目录。

持续验证在 [tests](tests/index.md)。快层用真实的 `AbortController` 与字节流，慢层用真实的本地 HTTPS 服务与本地 CONNECT 代理：

| 义务 | 测试 | 层 |
| --- | --- | --- |
| 构造的配置校验（含不是句柄的 `network`）、prepare 的路由查找、请求不含该供应商时的拒绝与家族绑定、materialize 期间开始的 prepared 关闭、prepared 与外层的关闭（含 release 失败时等待全部关闭） | [transport.spec.ts](tests/transport.spec.ts) | 快 |
| materialize：回执（绑定的 `replayFormat` 有值与为 `null` 两种情形）、交给家族的输入（含同序的声明与再发略去集合）、内容引用拒绝、encode 失败、重复调用、容量等待、取消与关闭归还名额 | [materialize.spec.ts](tests/materialize.spec.ts) | 快 |
| 不发送的 start：无凭据、凭据不能写入请求头、信号已中止、网络资源已关闭（先于凭据检查）、关闭之前的重复 start、三种关闭之后的 start、start 与关闭之后再 start、凭据只在同步调用中读取一次、不发送时没有编码诊断 | [start.spec.ts](tests/start.spec.ts) | 快 |
| 失败映射表的每一行 | [termination.spec.ts](tests/termination.spec.ts) | 快 |
| 发送的 start：同步发出（包内计数与服务端一致）、请求头与请求体、编码诊断在发出之后先于响应事实（含 HTTP 失败）、解码器的终止排在最后、在 end-marker 处结束读取（响应不结束时也是如此，之后的事件不解码，响应随 end-marker 结束时连接留在连接池）、失败映射表各行对真实响应、流中取消与关闭在物理停止之后以 `interrupted` 结束、读入 end-marker 之后的取消保留解码器的终止、读者提前结束、外层关闭、真实发送下的容量等待与取消、close 归还名额 | [transport-exchange.spec.ts](tests/transport-exchange.spec.ts) | 慢 |
| model-contract 符合性套件 transport 组的六条义务 | [conformance.spec.ts](tests/conformance.spec.ts) | 慢 |
| 连接容量 | [capacity.spec.ts](tests/capacity.spec.ts) | 快 |
| 诊断隔离 | [diagnostics.spec.ts](tests/diagnostics.spec.ts)；交换中的隔离见 [http.spec.ts](tests/http.spec.ts) | 快；慢 |
| SSE 分帧 | [sse.spec.ts](tests/sse.spec.ts) | 快 |
| 协议帧 | [frames.spec.ts](tests/frames.spec.ts) | 快 |
| 拒绝发起与配置校验，含预约归属、计时上限、拒绝时不触网、连接池没有套接字上限，以及同步异常时原异常不被归还掩盖 | [http-refusals.spec.ts](tests/http-refusals.spec.ts) | 快 |
| 读者提前结束时关闭来源，含第一个事件或第一帧之前 | [sse.spec.ts](tests/sse.spec.ts)、[frames.spec.ts](tests/frames.spec.ts)；对真实响应见 [http.spec.ts](tests/http.spec.ts) | 快；慢 |
| 提前结束的包装本身：`return()`、`throw()` 与 `asyncDispose` 关闭来源，启动后不重复关闭，来源关闭失败时生成器仍完成 | [iteration.spec.ts](tests/iteration.spec.ts) | 快 |
| 同步发起、停止、2xx、响应体读取错误的类型、非 2xx、错误体、连接超时与计时器清除、关闭后的清理 | [http.spec.ts](tests/http.spec.ts) | 慢 |
| 网络资源关闭与连接池，含同一接收方连续发起不受连接池影响、容量是唯一的并发上限、多接收方不排队 | [network.spec.ts](tests/network.spec.ts) | 慢 |
| 代理配置校验与 Node 版本守卫，含构造时任何消息都不含 URL（URL 含换行、回车或制表符时也不报错） | [proxy-config.spec.ts](tests/proxy-config.spec.ts) | 快 |
| 经代理的交换：隧道成功、直连项、大写协议与前导空白的 URL 仍经代理、拒绝后重置不崩溃、代理不可达、代理未回复即关闭、CONNECT 与隧道内 TLS 的连接超时、建立中的停止与关闭、取消不影响连接池已持有的套接字、代理 URL 不进入结果与诊断 | [proxy.spec.ts](tests/proxy.spec.ts) | 慢 |
| 经真实代理到 OpenRouter 的一次流式请求读到 end-marker。只在 `OMNE_LIVE_TESTS=1` 时运行 | [live/openrouter.spec.ts](tests/live/openrouter.spec.ts) | 慢；未设开关时跳过 |
| 根入口与子入口的运行时值，引擎内部不可经包导出访问，类型形状，含网络资源是不透明句柄 | [public-entry.spec.ts](tests/public-entry.spec.ts)、[public-entry.spec-d.ts](tests/public-entry.spec-d.ts) | 快 |
| 公开消费例与反例：只经根入口对本地 HTTPS 服务发送一次，内容引用得到 `unsupported` | [examples.spec.ts](tests/examples.spec.ts) 运行 [examples/local-send.ts](examples/local-send.ts) | 慢 |
| 家族表：规范 JSON 摘要与键序无关，改动线数据即改变摘要，不纯的记录、重复的 `(name, revision)`、同一路由的两条 `current`、重复 owner 与非 `defineFamily` 值的拒绝，冻结副本；取得的未安装、摘要漂移、其他修订、路由不符、家族失败原样返回、绑定的供应商或采用不符时释放、取消前不调用家族、取消后释放；回放格式查询 | [family-table.spec.ts](tests/family-table.spec.ts) | 快 |
| 网关引擎 plan：投影使用档案的声明（可与记录声明不同），档案声明不合格，默认、显式、不支持、越界、输出上限与扩展参数的各分支，`hooks.check` 的输入与失败，计量表示与 encode 一致，表示采用不符 | [chat-completions-plan.spec.ts](tests/chat-completions-plan.spec.ts) | 快 |
| 校准算术：没有校准时计数 token 输入本身且余量按整体；推理单元按来源的 O 替换，没有条目与每种扣留原因各为具名不可用；追加 token 只加在计数的单元上；锚点命中时只计新增部分、包络去掉工具、锚点不加余量；前缀中的推理单元不需要来源；全部覆盖时估算为零；包络差为负为 `continuation-shrank` 并退回完整计量；侧表不对齐、有锚点无侧表、锚点合计不是整数与 token 输入不是 schema 的拒绝 | [chat-completions-calibration.spec.ts](tests/chat-completions-calibration.spec.ts) | 快 |
| 共用计量规则：方法名的两个后缀、顺序与不命中不加后缀，采用的其他成员不变；空校准不进入摘要，锚点、O 与扣留各自改变摘要，`units` 不进入摘要；追加 token 的求和、缺项为零、每次调用重新取值与失败透传；空校准冻结 | [chat-completions-measurement.spec.ts](tests/chat-completions-measurement.spec.ts) | 快 |
| 网关引擎 encode：请求体快照，不写用量开关，只写本供应商的参数，同一字段的两项参数为 `invalid`，`requestBytes`，角色与两种内容形式，图片的拒绝，调用 id 规范化，工具结果图片，孤立的调用与结果，工具与 `tool_choice`，schema hook 的拒绝，缓存放置的各种情况（含图片与空文本混排的拒绝），空文本照原样写出，网关推理强度 `max`，回放使用请求的声明而不是记录声明、续接、略去、再发略去、`text` 与 `adapter` 处理（`text` 交给计量器的是文本块）、经判定的关闭回放与缺少编解码器，`replay-omitted` 诊断；绑定的采用、计量来源、只释放一次、记录缺陷的拒绝（含写入 `reasoning.enabled` 的固定值），以及经家族表取得引擎绑定 | [chat-completions-encode.spec.ts](tests/chat-completions-encode.spec.ts) | 快 |
| 网关引擎流解释：文本通道与拒绝，可见推理的来源选择与 `[REDACTED]`，推理片段的拼接与签名，封存部件、配对、空载荷、超长载荷的 `reasoning-state-dropped` 诊断、hook 失败，推理缓冲上限；工具片段的缓存与开块、空参数、没有名字、参数上限、不能解码、没有 id、改名；三种完成与 `length` 的封块、没有内容或没有工具调用的收场、其他 finish 与诊断的裁剪；尾帧的接受、帧数上限、内容与不同 finish；服务方的固定、未钉住、未报告与变化；带内错误的映射与不回显；结束标记、没有 finish 的结束、结束后的拒绝、每次 dispatch 的独立状态；chunk 形状；按真实网关流的形状手写的两段合成流；账目报告（最后一份 usage、费用的三种情况与指数形式、没有 usage、被拒收场、用量诊断的次序、hook 失败、收场之前失败的流没有账目）；收场之后失败的账目（响应体断开、取消、坏帧、尾帧被拒，保留的用量与未知用量，`faulted` 阶段的 `end()`）；绑定限额的校验。每个回放都核对恰好一个 `ended` 且在最后 | [chat-completions-decode.spec.ts](tests/chat-completions-decode.spec.ts) | 快 |
| 费用的普通十进制词法：普通词法照原样，指数形式的改写，负数、非 JSON 数与超长结果 | [chat-completions-decimal.spec.ts](tests/chat-completions-decimal.spec.ts) | 快 |
| 测试入口：夹具全部相符，名字中的 `/`，缺目录与缺文件，多余目录，请求体与事实不等，`request.json` 不合格；指纹的生成、检查、只追加、原地改动记录的检查失败与生成拒绝、不对应记录的行、非给定形式的文件 | [testing-helpers.spec.ts](tests/testing-helpers.spec.ts) | 快 |
| 引擎源码不含厂商名或型号家族名 | [chat-completions-vendor-words.spec.ts](tests/chat-completions-vendor-words.spec.ts) | 快 |
| 依赖方向 | [dependencies.spec.ts](tests/dependencies.spec.ts) | 快 |

未覆盖：

- 真实供应商、真实代理与公网 TLS 不在持续验证中。慢层只证明本地 HTTPS 服务与本地 CONNECT 代理上的行为。`test:live` 只在手动设置开关时运行，turbo 运行它时总是跳过。
- `https:` 协议的代理。本包只校验它的配置，没有运行验证。
- Model 发送路径（`SendResource`）与本传输的组合。慢层只用脚本化的提供者与本包的测试家族运行符合性套件。
- 真实凭据（2.6）下的三段传输。本包的测试只用测试记录与 hook 替身驱动网关引擎。两个家族包在自己的测试中经家族表与夹具检查驱动引擎。两个真实家族经三段传输与本地 HTTPS 服务的发送，以及对它们的符合性套件 transport 组，在 `pi-ai-anthropic` 的慢层用例 `two-families.spec.ts` 中，不在本包。解码器在本包的输入是手写的合成流，形状仿照真实网关流，不是真实样本。
- 网关引擎请求体被真实网关接受。空的工具结果写空内容、没有文本的 assistant 消息写空内容，这两种写法不在持续验证中。两个家族包的示例发出这两种写法，只在手动运行时有证据。
- 消息中模型可见的内容引用。快层只用 `system` 中的引用核对 materialize 的拒绝；构造消息需要本包不依赖的 `@omne-harness/message`。
- 在途响应长时间没有数据时，连接池空闲超时的效果。
- 多个进程或多个网络资源共享名额。容量是单个进程内的对象。

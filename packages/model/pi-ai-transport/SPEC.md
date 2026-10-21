# @omne-harness/pi-ai-transport 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包当前交付两部分：

1. 根入口导出的五个家族贡献接口类型：`PiProtocolFrame`、`PiResponseDecoder`、`PiMaterializedMedia`、`PiFamilyBinding` 与 `PiFamilyContributions`。形状与家族作者须遵守的行为归[组架构“pi 家族贡献的取得协议”](../docs/architecture.md#pi-家族贡献的取得协议)，本文件不重复这些条款。
2. 包内传输机制：连接容量、HTTP 交换、SSE 分帧、协议帧、网络资源（含可选的 HTTPS 代理）与诊断隔离。这些机制不经根入口导出（依据 [#461 的决定评论](https://github.com/nemori-ai/omne-harness-lite/issues/461#issuecomment-6311010561)）。本文件对它们的条款约束同包的调用代码。首个调用方是[阶段二](https://github.com/nemori-ai/omne-harness-lite/issues/446)子任务 2.2 的 `ModelTransport` 实现。

本文件兑现以下已接受的上层条款：

- [组架构“迁移与接受条件”](../docs/architecture.md#迁移与接受条件)：容量在 materialize 阶段预约，预约不自行过期，start 同步发起实际请求，不在内部等待队列。
- [组架构“pi 家族贡献的取得协议”](../docs/architecture.md#pi-家族贡献的取得协议)：公共传输禁用隐式 HTTP 重试与自动重定向，一次 start 对应一次物理发出。HTTP/SSE 分帧由公共传输处理。协议 end-marker 与传输 EOF 分开。
- [model-contract“资格、共同提交与实际发送”](../model-contract/SPEC.md#资格共同提交与实际发送)：发送点 S 之后请求不可撤回。秘密只在本次发送资源内存在。
- [迁移清单](../docs/migration.md#pi-ai-transportsrc)中标为 2.1 的行：封存件各文件的去向。

本包当前不提供以下能力。本文件对它们不作承诺：

- `ModelTransport`、`PreparedTransport` 与 `MaterializedTransport` 的实现，即 `prepare → materialize → start` 三段语义。归阶段二 2.2。
- 请求规划、固定绑定，以及帧到 `TransportFact` 与 `TransportTermination` 的映射。归 2.3。
- 任何家族实现、凭据解析与真实供应商请求。归 2.5 与 2.6。
- 按优先级与等待方式分配名额。这是未实现的方向，记录在[内部架构](docs/architecture.md#未实现的优化方向按优先级与等待方式分配连接席位)。

## 结果与不变量

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
- 返回 `started` 之前，本包同步核对请求没有进入连接池的等待队列（Node 公开的 `agent.requests`）。网络资源创建的连接池没有套接字上限，不让请求排队。请求进入等待队列只在配置被绕过等缺陷下出现。此时本包销毁该请求，把它移出等待队列（队列空时删除该键），归还名额，然后抛出 `ExchangeQueuedError`。该请求不写出任何字节。连接池之后也不为它建立连接，网络资源 `close()` 之后同样不建立。
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
- 持有名额的请求因此不进入连接池的等待队列。进入等待队列是缺陷，见“发起交换”。
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

### 秘密与对外事实

- 凭据由调用方在发起时放进请求头。本包只校验头部字符集，不解析、保存或记录凭据。
- 响应头与错误体只在包内交给家族解释。本包不把它们写入任何对外事实或诊断。
- 对外失败只由家族形成的安全诊断表达。
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
- 本包只在 Node 契约以外的情况下拒绝 `result` 或抛出异常：
  - 请求进入连接池的等待队列：`startExchange` 抛出 `ExchangeQueuedError`。抛出之前，请求已销毁并移出队列，名额已归还。
  - `signal` 不是 `AbortSignal`：`startExchange` 抛出 `TypeError`，名额已归还。
  - 响应没有状态码，或错误体的块不是字节：`result` 拒绝。
  - 响应体的块不是字节：读者的迭代以普通的 `Error` 结束。
- 本包不把未知异常转为普通失败，未知异常原样传出。

## 组合与验证

本包消费以下承诺：

- `@omne-harness/operation-result` 的 `Outcome`。
- `@omne-harness/json-text` 的 `readJsonText`、`JsonLimits` 与 `JsonValue`。
- `@omne-harness/model-contract` 与 `@omne-harness/content-block` 的类型，只供五个接口类型引用。
- Node 内置的 `https`、`http`、`net` 与 `stream`（只用类型）。
- Node 24.5.0 起 `https.Agent` 的 `proxyEnv` 选项与内置的 CONNECT 隧道。

运行依赖只允许上述四个 workspace 成员与 Node 内置模块。本包不依赖 `@omne-harness/model`、Session、旧消息包或封存目录。

持续验证在 [tests](tests/index.md)。快层用真实的 `AbortController` 与字节流，慢层用真实的本地 HTTPS 服务与本地 CONNECT 代理：

| 义务 | 测试 | 层 |
| --- | --- | --- |
| 连接容量 | [capacity.spec.ts](tests/capacity.spec.ts) | 快 |
| 诊断隔离 | [diagnostics.spec.ts](tests/diagnostics.spec.ts)；交换中的隔离见 [http.spec.ts](tests/http.spec.ts) | 快；慢 |
| SSE 分帧 | [sse.spec.ts](tests/sse.spec.ts) | 快 |
| 协议帧 | [frames.spec.ts](tests/frames.spec.ts) | 快 |
| 拒绝发起与配置校验，含预约归属、计时上限、拒绝时不触网，以及同步异常时原异常不被归还掩盖 | [http-refusals.spec.ts](tests/http-refusals.spec.ts) | 快 |
| 读者提前结束时关闭来源，含第一个事件或第一帧之前 | [sse.spec.ts](tests/sse.spec.ts)、[frames.spec.ts](tests/frames.spec.ts)；对真实响应见 [http.spec.ts](tests/http.spec.ts) | 快；慢 |
| 提前结束的包装本身：`return()`、`throw()` 与 `asyncDispose` 关闭来源，启动后不重复关闭，来源关闭失败时生成器仍完成 | [iteration.spec.ts](tests/iteration.spec.ts) | 快 |
| 同步发起、停止、2xx、响应体读取错误的类型、非 2xx、错误体、连接超时与计时器清除、关闭后的清理 | [http.spec.ts](tests/http.spec.ts) | 慢 |
| 网络资源关闭与连接池，含同一接收方连续发起不受连接池影响、容量是唯一的并发上限、多接收方不排队与排队即缺陷 | [network.spec.ts](tests/network.spec.ts) | 慢 |
| 代理配置校验与 Node 版本守卫，含构造时任何消息都不含 URL（URL 含换行、回车或制表符时也不报错） | [proxy-config.spec.ts](tests/proxy-config.spec.ts) | 快 |
| 经代理的交换：隧道成功、直连项、大写协议与前导空白的 URL 仍经代理、拒绝后重置不崩溃、代理不可达、代理未回复即关闭、CONNECT 与隧道内 TLS 的连接超时、建立中的停止与关闭、取消不影响连接池已持有的套接字、代理 URL 不进入结果与诊断 | [proxy.spec.ts](tests/proxy.spec.ts) | 慢 |
| 经真实代理到 OpenRouter 的一次流式请求读到 end-marker。只在 `OMNE_LIVE_TESTS=1` 时运行 | [live/openrouter.spec.ts](tests/live/openrouter.spec.ts) | 慢；未设开关时跳过 |
| 根入口与类型形状 | [public-entry.spec.ts](tests/public-entry.spec.ts)、[public-entry.spec-d.ts](tests/public-entry.spec-d.ts) | 快 |
| 依赖方向 | [dependencies.spec.ts](tests/dependencies.spec.ts) | 快 |

未覆盖：

- 真实供应商、真实代理与公网 TLS 不在持续验证中。慢层只证明本地 HTTPS 服务与本地 CONNECT 代理上的行为。`test:live` 只在手动设置开关时运行，turbo 运行它时总是跳过。
- `https:` 协议的代理。本包只校验它的配置，没有运行验证。
- 发送围栏内的调用与 `ModelTransport` 的组合。本包没有实现 `ModelTransport`。
- 在途响应长时间没有数据时，连接池空闲超时的效果。
- 多个进程或多个网络资源共享名额。容量是单个进程内的对象。

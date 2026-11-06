# 对象模型

本文件描述本包内部对象的职责、身份、状态、关联、组合、继承与生命周期，配类图。它不强迫实现改成 class；纯函数或值包写实际模型与不适用项。

## 对象与关系

```text
McpTransportFactory（factory.ts 的对象字面量）
  └─ open() ──创建──► Session ─────实现──► McpTransport（契约）
                         │ 拥有 1
                         ▼
                       Line（接口，line.ts）
                        ├── StdioLine   拥有 writer、stdout reader、stderr reader、退出窗口计时
                        └── HttpLine    拥有 AbortController 集合、endpoint、共用流 reader
                       Session 拥有 0..n Pending（请求号 → 上下文、AbortController、answered/settle、departed/depart、observe?、相；相 sent 带它的交换：尚无、应答流的 abort 或探测计时的取消）
                       Session 持有 TransportMaterial（代际、instructionsByteLimit、credential?、target?）
                       Session 持有 SessionOptions（clientInfo、versions（非空元组）、probeTimeoutMs、fetchMetadata、schedule、reportDefect）
AsyncQueue<LineEvent>：线路向会话投递事件的队列（线路拥有，会话迭代）

createMcpPlugin(parts)（cordis.ts）──definePlugin──► 插件对象 { name: 'mcp', Config, apply }
  apply(ctx, config) 每次装载创建：
    四个端口适配器（AdoptionView、UseEligibility、CredentialUse、ProcessLanding 的对象字面量，各持有 ctx）
    McpServices（createMcp 交出；连接表、在途表、任务表归 @omne-harness/mcp）
    HostActionDiscovery ─继承─► ActionDiscoveryService（mcp-cordis-contract）
    HostActionInvoker   ─继承─► ActionInvokerService
    HostEndpointStatus  ─继承─► EndpointStatusService
    撤除函数（ctx.effect 登记，标签 mcp.closeAll）
```

| 对象               | 职责                                                                                                                                              | 身份                                   | 状态                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Session`          | 兑现 T1–T9：组成请求、归类事件、从契约的决策层取结论、取消与关闭、授权发现                                                                        | 材料的代际（`generation`）             | `connection`、`closed`、`closing`、`dead`、`pending`、`teardown`                                                                                                                                          |
| `Connection`       | 连接模式：判别联合                                                                                                                                | 无                                     | `modern`（带协商出的版本）／`legacy`（带版本与旧 Streamable HTTP 的可选会话号）／`legacy-sse`（带版本）                                                                                                   |
| `Pending`          | 一个在途请求。在途表里有它才算在途                                                                                                                | 请求号 `r<n>`                          | `phase`（判别联合：`authorizing`；`sent`，带它的交换：尚无、应答流的 `abort`、探测计时的取消；`discovery`，带拒绝应答的头与发现的进度）、`answered`（结算，只兑现一次）、`departed`（出发点，只兑现一次） |
| `Answered`（内部） | 一个请求的结算：契约的 `WireAnswer`（`result`、`error`、`no-answer`、`not-sent`、`legacy-peer`、`legacy-http`）与 HTTP 应答的头                   | 无                                     | 值                                                                                                                                                                                                        |
| `StdioLine`        | 按行读写一个进程句柄的管道，报告 stdout 结束与退出                                                                                                | 句柄                                   | `stdoutEndedAt`、`exitedAt`、`announced`、`writable`、`closing`、`closed`                                                                                                                                 |
| `HttpLine`         | 每消息一次 POST；旧 HTTP+SSE 模式的 GET 流与 endpoint                                                                                             | 连接目标                               | `endpoint`、`controllers`、`closed`                                                                                                                                                                       |
| `Exchange`         | 一次出站的结果（值）                                                                                                                              | 无                                     | `unsent` / `sent` / `status` / `stream` / `aborted`                                                                                                                                                       |
| `LineEvent`        | 共用流上的一件事（值）                                                                                                                            | 无                                     | `line` / `ended` / `broken`                                                                                                                                                                               |
| `GetOpened`        | 回退的 GET 得到的事实（值），2xx 时带 `enter`、`discard`                                                                                          | 无                                     | `stream` / `status` / `unsent` / `unavailable`                                                                                                                                                            |
| `Scheduler`        | 计时端口：起一次计时，返回取消函数；工厂给缺省实现                                                                                                | 无                                     | 无                                                                                                                                                                                                        |
| 端口适配器         | 每次端口调用从装载的 `ctx` 现取对应的端口服务，取到就原样转发，取不到答该端口的 `unknown`（SPEC [端口缺席](../SPEC.md#port-absent)）              | 无                                     | 只持有装载的 `ctx`，不缓存端口                                                                                                                                                                            |
| 三个服务子类       | `HostActionDiscovery`、`HostActionInvoker`、`HostEndpointStatus`：继承定义成员的抽象类，在键上提供服务，把每个方法原样转给 `createMcp` 交出的服务 | 服务键（Cordis 登记在装载的 fiber 上） | 只持有被转发的服务                                                                                                                                                                                        |
| 撤除函数           | fiber 卸载时等 `closeAll`，对停止未确认的条目写警告（SPEC [Cordis 插件](../SPEC.md#cordis-plugin)）                                               | 标签 `mcp.closeAll`                    | 无                                                                                                                                                                                                        |

继承只在 Cordis 插件：三个服务子类继承 mcp-cordis-contract 的抽象 `Service`。传输一侧没有继承层次：`Line` 是接口，两条线路是互不相关的实现；会话与线路之间没有共享可变状态，只有 `Exchange`、`LineEvent`、`GetOpened` 的值与 `abort()`、`enter()`、`discard()`。

## 生命周期

- `createLocalTransportFactory(options)` 核对选项后返回工厂；工厂无状态，可以打开任意多个传输。
- `open` 创建线路（stdio：起读取并落定已成立的观察；HTTP：无 I/O），再创建 `Session`；`Session` 的构造起事件泵（`pump`），从 `line.events` 读到线路关闭。
- `Pending` 在授权之前登记，相从 `authorizing` 到 `sent`，401 或带 `insufficient_scope` 的 403 之后进入 `discovery`；在结算时移出；结算与出发点各只兑现一次。`call` 的 `signal`、现代 HTTP 的 `cancelRequest` 与 `close()` 调用 `stop`：中止它的 `AbortController`，并按所处的相当场结算（SPEC [取消](../SPEC.md#所有权失败与生命周期)与关闭）。后台工作流在每个等待点返回之后先核这一项仍在途，否则丢弃结果。
- 会话的 `close()` 先结算全部在途请求，再中止一切 `fetch`、回退的 GET 与元数据取回，最后只等线路的 `close()`：线路释放读写端、结束事件队列。stdio 线路一律中止 stdin 写端，不等缓冲排空，等两个读循环结束后才返回（SPEC [H6](../SPEC.md#h6)）；第二次调用得到同一次关闭。事件泵随队列结束退出。`close()` 可以重复调用，每次得到同一次关闭的结果。
- 进程句柄的进程不归传输：线路从不调用 `stop()`；凭据句柄的 `release()` 也不归传输。
- Cordis 插件的对象随装载它的 fiber 生灭：`apply` 创建适配器、服务与三个子类并登记撤除函数；fiber 卸载时 Cordis 撤回三个服务键，撤除函数经 `@omne-harness/mcp` 的 `closeAll` 关闭连接、请落点交出的进程句柄 `stop()`、释放凭据句柄（[mcp 的 MC-10](../../mcp/SPEC.md#mc-10)）。

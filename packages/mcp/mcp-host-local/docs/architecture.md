# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

```text
index.ts ──► factory.ts ──► options.ts            （RangeError）
                │            session.ts ──► line.ts（端口类型）
                │               │  ▲
                ├──► stdio-line.ts │           limits.ts、queue.ts
                ├──► http-line.ts ─┘           body.ts（eventsource-parser/stream）
                └──► authorization.ts ──► body.ts（元数据取回）
session.ts ──► 契约根：classifyWireEvent、readPeerMessage 与 T8 的决策层
```

| 模块               | 持有的状态与资源                                                                                                                                                                                                                               | 依赖                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `factory.ts`       | 无状态；按 `material.kind` 建线路并包成会话；给缺省的计时端口                                                                                                                                                                                  | `session`、两条线路、`authorization`、`options`、契约根                           |
| `session.ts`       | 在途请求表（每项 `Pending`：相、`AbortController`、授权标记、自己的结算与出发点、探测计时的取消函数、应答流）、连接模式（现代、旧修订、旧 HTTP+SSE 的判别联合，带协商出的版本与旧会话号）、`closed`、关闭的 promise、`dead`、`teardown` 控制器 | 契约根（`classifyWireEvent`、`readPeerMessage`、决策层与协议函数）、`line` 的类型 |
| `line.ts`          | 只有类型：`Line`、`Outbound`、`Exchange`、`LineEvent`、`GetOpened`、`FirstEvent`、`AnswerHeaders`                                                                                                                                              | —                                                                                 |
| `stdio-line.ts`    | stdin 的 writer、stdout 与 stderr 的 reader、stdout 结束与退出的时刻、退出窗口的计时、`writable`、未完成写的计数 `writes`、`closing`、`closed`                                                                                                 | 契约根的 `PROCESS_EXIT_WINDOW_MS`、`limits`、`queue`                              |
| `http-line.ts`     | 在途 `AbortController` 集合、旧 HTTP+SSE 的 endpoint、共用流的 reader、`closed`                                                                                                                                                                | `eventsource-parser/stream`、`body`、`limits`、`queue`                            |
| `authorization.ts` | 无状态；一个地址一次 GET                                                                                                                                                                                                                       | `json-text`、`body`、`limits`                                                     |
| `body.ts`          | 无状态；有字节上界地读出整个 HTTP 正文                                                                                                                                                                                                         | `limits`                                                                          |
| `limits.ts`        | 常量 `BYTE_LIMIT`                                                                                                                                                                                                                              | —                                                                                 |
| `queue.ts`         | 线路事件的队列                                                                                                                                                                                                                                 | —                                                                                 |

依赖方向：`index` → `factory` → `session` 与线路；线路不认识会话，会话只认识 `Line` 的类型。产品源码不导入契约的 `./testing`，不导入任何 `@modelcontextprotocol/*` 包。

## 关键机制与理由

- **会话与线路分开（SPEC H1、H2）。** 线路只报告 `Exchange`（一次出站的结果）、`LineEvent`（共用流上发生的事）与 `GetOpened`（回退的 GET 得到什么）。会话把它们翻成契约的 `WireEvent`，交给 `classifyWireEvent`，再交给契约的决策层得出结论。理由：一条规则只有一份实现，T8 的决策放在契约根，脚本化传输与本包共用；两条线路的差异只在字节怎样来去。分开之后，T8 的全表可以在内存线路上验证一次（`tests/session.spec.ts`），真实线路只需验证它们如实报告。代价：stdio 上一行对每个在途请求各归类一次，在途数小时可以忽略。
- **会话只经注入的端口产生效果（SPEC H14）。** 会话的效果只经线路、凭据句柄、`fetchMetadata` 与计时端口 `schedule`。理由：测试可以排定每一次答复与计时触发的次序，并发的次序因此可以穷举。
- **一个请求一次结算（契约 T5）。** 在途表的每一项只兑现一次；应答、流断开、进程退出、探测时限、取消、`signal`、`close()` 谁先到谁定。请求在授权与写出之前登记，工作流在每个等待点返回之后先核这一项是否仍在途。`close()` 先结算再关线路，所以线路关闭引起的 `aborted` 不会被读成流断开。
- **调用方等结算，不等工作流（SPEC 自定 10）。** 授权、组成与写出、拒绝报告与元数据取回、答复对端、通知，是会话拥有的后台工作，经 `work` 一个入口启动。调用方只等它那一项的结算（`call` 另等出发点）。`signal` 与 `close()` 当场按相结算，所以凭据句柄、元数据取回、线路或对端挂起都不让调用方等。理由：把调用方的等待挂在某个端口上，等于让那个端口决定调用方的寿命；结算由会话自己兑现，端口只能晚到并被丢弃。`call` 以外的操作没有 `signal`，只由 `close()` 放开（契约 [T5](../../mcp-contract/SPEC.md#port-transport)）。
- **再发只在读类（SPEC H5）。** 契约的 `concludeAnswer` 给结论加「再发」标记（条件在契约 [T8](../../mcp-contract/SPEC.md#t8) D15、O05），契约的 `withOneResend` 按标记再发一次；`request()` 经它用新的请求号并重新授权。写类与调用从不经 `request()`：效果未知时由调用方决定。
- **探测时限只在 stdio（SPEC H11）。** HTTP 上没有探测时限：没有应答时只由 `close()` 放开（契约 [T8](../../mcp-contract/SPEC.md#t8) D14、I05、O04）；`call` 另可由它的 `signal` 放开（C03）。stdio 上旧对端对 `server/discover` 可能永不作答，时限到了走旧一路；迟到的应答因为请求已不在途而丢弃。
- **退出窗口（SPEC H12，契约 [T8](../../mcp-contract/SPEC.md#t8) 进程退出）。** 窗口的规则在契约。理由：进程先退出时继续读 stdout，让「答完就退出」的进程不丢应答。退出的观察直接挂在句柄的 promise 上，先于任何在它之后 `await` 它的调用方。
- **字节上界（SPEC H8）。** stdio 的每一行与 HTTP 的 2xx 正文都以 16 MiB 为界，越界是流断开。错误状态的正文越界时读成空正文，按「纯」归类。理由：与契约 `classifyWireEvent` 的 JSON 上界同值；SDK 的 10 MiB 上界更严，本包不比它严。
- **旧 HTTP+SSE 是 HTTP 线路的一种模式（SPEC H9）。** 它与 Streamable HTTP 共用 POST、头、凭据、授权发现与状态分类，只多一条 GET 流与一个 endpoint；做成第三条线路会重复这些。回退是否成立是契约 T3 的规则：线路只交出 GET 的事实，会话判定。会话把模式写进 `WireContext.mode`，让契约把 POST 的「2xx 而没有应答」归为 `waiting`。
- **`fetch` 直接用（SPEC「与 SDK 的复用关系」）。** SDK 的两个 HTTP 传输类在 401/403、非 400 的错误正文与读不懂的 2xx 消息上都丢失契约要交出的事实，只能在 `fetch` 钩子里自己读应答；读了之后那两个类没有剩余价值。每次交换一个 `AbortController`，它随调用方的 `signal` 与关闭中止，交换结束时移除监听；`redirect: 'manual'`；不设超时。
- **`open` 不发请求（SPEC H3）。** 持有者在时限到期后释放凭据句柄；`open` 不调用句柄、答复前再核 `signal`，于是没有它授权过的传输还会调用它。
- **边界与重新判断的条件。** 本包按 SDK 2.4.0 的行为对照；SDK 改变探测、回退或头的规则时，重跑 `tests/probes/` 的探针并重核 SPEC 的复用表。`fetch` 的实现换成非 undici 时，重核 H10 的错误码集合。契约 T8 加行时，决策层在契约里随之变，`tests/session.spec.ts` 自动覆盖新行。

## 验证与维护

| 保证                             | 验证资源                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| H1、H4、H5、H9、H11、H14（会话） | `tests/session.spec.ts`：T8 全表在内存线路上、SSE 模式、探测时限、对端请求、契约类别、出站词形、关闭与凭据 |
| H2、H6、H8、H12（stdio 线路）    | `tests/lines.spec.ts`、`tests/stdio.spec.ts`、`tests/conformance.spec.ts`（stdio 材料）                    |
| H2、H9、H10、H13（HTTP 线路）    | `tests/lines.spec.ts`、`tests/http.spec.ts`、`tests/conformance.spec.ts`（Streamable HTTP 材料）           |
| H3（工厂）                       | `tests/public-entry.spec.ts`                                                                               |
| 复用表的证据                     | `tests/probes/` 的探针                                                                                     |

设计变化时同步：`src/line.ts` 改了端口 → 两条线路、`tests/memory-line.ts`；契约的决策层改了导出 → `session.ts` 与本页「关键机制」；SDK 升级 → 重跑 `tests/probes/` 的探针，重核 SPEC 复用表的 `文件:行` 与 `tests/fixtures/sdk/`。

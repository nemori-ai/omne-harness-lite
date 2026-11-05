# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

```text
index.ts ──► factory.ts ──► options.ts            （RangeError）
                │            session.ts ──► line.ts（端口类型）
                │               │  ▲           message.ts、limits.ts
                ├──► stdio-line.ts │           queue.ts
                ├──► http-line.ts ─┘           （eventsource-parser/stream）
                └──► authorization.ts         （元数据取回）
```

| 模块               | 持有的状态与资源                                                                                                | 依赖                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `factory.ts`       | 无状态；按 `material.kind` 建线路并包成会话                                                                     | `session`、两条线路、`authorization`、`options`、契约根            |
| `session.ts`       | 在途请求表、协商版本、旧一路标记、旧会话号、SSE 模式标记、`closed`/`dead`、每请求的 `AbortController`、探测计时 | 契约根（`classifyWireEvent` 与协议函数）、`line` 的类型、`message` |
| `line.ts`          | 只有类型：`Line`、`Outbound`、`Exchange`、`LineEvent`、`SseEntry`                                               | —                                                                  |
| `stdio-line.ts`    | stdin 的 writer、stdout/stderr 的 reader、stdout 结束与退出的时刻、退出窗口的计时、`writable`/`closed`          | 契约根的 `PROCESS_EXIT_WINDOW_MS`、`limits`、`queue`               |
| `http-line.ts`     | 在途 `AbortController` 集合、旧 HTTP+SSE 的 endpoint、共用流的 reader、`closed`                                 | `eventsource-parser/stream`、`limits`、`queue`                     |
| `authorization.ts` | 无状态；一个地址一次 GET                                                                                        | `json-text`、`limits`                                              |
| `message.ts`       | 无状态；解析对端的消息、写本侧的消息、取 `id`                                                                   | `json-text`、`limits`                                              |
| `queue.ts`         | 线路事件的队列                                                                                                  | —                                                                  |

依赖方向：`index` → `factory` → `session`/线路；线路不认识会话，会话只认识 `Line` 的类型。产品源码不导入契约的 `./testing`，不导入任何 `@modelcontextprotocol/*` 包。

## 关键机制与理由

- **会话与线路分开（SPEC H1、H2）。** 线路只报告 `Exchange`（一次出站的结果）与 `LineEvent`（共用流上发生的事），会话把它们翻成契约的 `WireEvent` 并交给契约的 `classifyWireEvent`。理由：契约要求一条规则只有一份实现，而两条线路的差异只在字节怎样来去；分开之后 T8 的全表可以在内存线路上验证一次（`tests/session.spec.ts`），真实线路只需验证它们如实报告。代价：会话对每个在途请求各归类一次（stdio 上一行对多个在途请求），在途数小时可忽略。
- **一个请求一次结算。** `Pending.deferred` 只兑现一次；应答、流断开、进程退出、探测时限、取消、`signal`、`close()` 谁先到谁定。`close()` 先结算再关线路，所以线路关闭引起的 `aborted` 不会被读成流断开。
- **再发只在读类（SPEC H5）。** `request()` 在 Streamable HTTP、非 SSE 模式、读类方法、第一次结论是流断开时再调一次 `once()`；新的请求号、重新授权。写类与调用从不再发：效果未知时由调用方决定。
- **探测时限只在 stdio（SPEC H11）。** HTTP 上对端总有 HTTP 层的答复或连接失败，不需要本地时限；stdio 上旧对端对 `server/discover` 可能永不作答，时限到了走旧一路，迟到的应答因请求已不在途而按无关的行丢弃。
- **退出窗口（SPEC H12）。** stdout 结束与进程退出几乎同时发生时，谁先到都等另一方最多 `PROCESS_EXIT_WINDOW_MS`，再把两个时刻交给契约归类；进程先退出时继续读 stdout，让「答完就退出」的进程不丢应答。退出的观察直接挂在句柄的 promise 上，先于任何在它之后 `await` 它的调用方。
- **字节上界（SPEC H8）。** stdio 的行缓冲与 HTTP 的正文都以 16 MiB 为界；跨块到达的行在换行到达时精确量字节，越界即宣告流断开。理由：与契约 `classifyWireEvent` 的 JSON 上界同值，SDK 的 10 MiB 上界更严，本包不比它严。
- **旧 HTTP+SSE 是 HTTP 线路的一种模式（SPEC H9）。** 它与 Streamable HTTP 共用 POST、头、凭据、授权发现与状态分类，只多一条 GET 流与一个 endpoint；做成第三条线路会重复这些。会话把模式写进 `WireContext.mode`，让契约把 POST 的「2xx 而没有应答」归为 `waiting`。
- **`fetch` 直接用（SPEC「与 SDK 的复用关系」）。** SDK 的两个 HTTP 传输类在 401/403、非 400 的错误正文与读不懂的 2xx 消息上都丢失契约要交出的事实，只能在 `fetch` 钩子里自己读应答；读了之后那两个类没有剩余价值。每请求一个 `AbortController`，`redirect: 'manual'`，不设超时。
- **`open` 不发请求（SPEC H3）。** 持有者在时限到期后释放凭据句柄；`open` 不调用句柄、答复前再核 `signal`，于是没有它授权过的传输还会调用它。
- **边界与重新判断的条件。** 本包按 2.4.0 的 SDK 行为对照；SDK 改变探测、回退或头的规则时重核 SPEC 的复用表。`fetch` 的实现换成非 undici 时重核 H10 的错误码集合。契约 T8 加行时会话的 `conclude`/`answerWireOf` 随之加分支，`tests/session.spec.ts` 自动覆盖新行。

## 验证与维护

| 保证                          | 验证资源                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| H1、H4、H5、H9、H11（会话）   | `tests/session.spec.ts`：T8 全表在内存线路上、SSE 模式、探测时限、对端请求、T5/T9 |
| H2、H6、H8、H12（stdio 线路） | `tests/stdio.spec.ts`、`tests/conformance.spec.ts`（stdio 材料）                  |
| H2、H9、H10、H13（HTTP 线路） | `tests/http.spec.ts`、`tests/conformance.spec.ts`（Streamable HTTP 材料）         |
| H3（工厂）                    | `tests/public-entry.spec.ts`                                                      |

设计变化时同步：`src/line.ts` 改了端口 → 两条线路、`tests/memory-line.ts`；契约 T8 改了行 → `session.ts` 与本页「关键机制」；SDK 升级 → SPEC 复用表的 `文件:行` 与 `tests/fixtures/sdk/`。

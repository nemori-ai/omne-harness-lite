# tests

本目录维护本包的单元与契约测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 与 `*.spec-d.ts` 测试文件，`support/` 下的测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

测试名描述被测对象的可观察行为。`describe` 块对应 [SPEC.md](../SPEC.md) 的小节，SPEC“组合与验证”的表把每项义务对应到测试文件。测试分两层：

- 快层：容量、诊断隔离、SSE 分帧、协议帧、提前结束的包装、发起前的拒绝、配置校验、根入口与依赖方向。它们用真实的 `AbortController`、真实的字节流与 Node 可读流，不建立网络连接。拒绝用例同步核对连接池没有套接字也没有排队的请求。
- 慢层：文件头标有 `@module-tag slow` 的 [http.spec.ts](http.spec.ts) 与 [network.spec.ts](network.spec.ts)。它们对真实的本地 HTTPS 服务发起交换，并等待真实的连接超时、空闲超时与套接字关闭。连接池的用例让服务端声明 `Keep-Alive: timeout=1`，使 Node 不保留套接字，以此核对同一接收方的下一次发起不受连接池影响，以及容量是唯一的并发上限。排队即缺陷的用例改小真实连接池的 `agent.maxSockets`，模拟配置被绕过。连接计时器的清除经 `process.getActiveResourcesInfo()` 的计时器数核对。

http.spec.ts 用 vitest 的模块替身把 `node:https` 的 `request` 换成一个委托真实函数并记录每个请求的包装，用于在 `startExchange` 返回后同步核对请求已经写出。其他行为都经真实的 Node `https`。

慢层的夹具在 [support/https-server.ts](support/https-server.ts)：

- 证书：测试用 openssl 子进程生成自签证书，适用于 `127.0.0.1` 与 `localhost`，有效期一天。证书放在经 `realpathSync` 取得物理路径的私有临时目录，测试结束时删除。子进程收到的环境变量去掉了继承的 `BASELINE`。
- 本地 HTTPS 服务：记录收到的方法、路径、头与体，由每个用例决定怎样响应。
- 黑洞监听：接受 TCP 连接但从不完成 TLS 握手，用于连接超时。

[support/exchange.ts](support/exchange.ts) 提供交换的输入、预约与观察工具，含清理断言与连接池队列的读取。其中的限额只是本套测试的初值，不是本包的默认值。[support/sources.ts](support/sources.ts) 提供记录读者行为的字节源，供分帧层的提前结束用例使用。

这些测试只证明本地 HTTPS 服务上的行为，不证明真实供应商、代理、公网 TLS 或 `ModelTransport` 的组合。完整的覆盖与未覆盖见 [SPEC“组合与验证”](../SPEC.md#组合与验证)。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。在仓库根运行：

```sh
pnpm turbo run test --filter=@omne-harness/pi-ai-transport
pnpm turbo run test:fast --filter=@omne-harness/pi-ai-transport
pnpm turbo run test:slow --filter=@omne-harness/pi-ai-transport
```

慢层需要 PATH 中有 `openssl`。

## 本包事实

测试通过不代替规格或验收。本目录没有固定输入文件，原因见 [fixtures](fixtures/README.md)。

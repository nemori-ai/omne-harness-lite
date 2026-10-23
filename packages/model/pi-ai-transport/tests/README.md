# tests

本目录维护本包的单元与契约测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 与 `*.spec-d.ts` 测试文件，`support/` 下的测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

测试名描述被测对象的可观察行为。`describe` 块对应 [SPEC.md](../SPEC.md) 的小节，SPEC“组合与验证”的表把每项义务对应到测试文件。测试分两层：

- 快层：家族表、网关引擎（plan、encode、绑定、流解释与源码厂商名扫描）、测试入口（夹具检查与采用指纹，用经 `realpathSync` 取得物理路径的临时目录）、容量、诊断隔离、SSE 分帧、协议帧、提前结束的包装、发起前的拒绝、配置校验（含代理配置与 Node 版本守卫）、三段传输中不发送的部分（构造、prepare、materialize、不发送的 start 与失败映射表）、根入口与依赖方向。它们用真实的 `AbortController`、真实的字节流与 Node 可读流，不建立网络连接。拒绝用例同步核对 Node 没有建立请求，连接池也没有套接字。网络资源的配置用例核对连接池没有套接字上限。
- 慢层：文件头标有 `@module-tag slow` 的 [http.spec.ts](http.spec.ts)、[network.spec.ts](network.spec.ts)、[proxy.spec.ts](proxy.spec.ts)、[transport-exchange.spec.ts](transport-exchange.spec.ts)、[conformance.spec.ts](conformance.spec.ts)、[examples.spec.ts](examples.spec.ts) 与 [live/openrouter.spec.ts](live/openrouter.spec.ts)。前五个对真实的本地 HTTPS 服务发起交换，并等待真实的连接超时、空闲超时与套接字关闭。examples.spec.ts 在 Node 子进程中运行[公开示例](../examples/README.md)。示例自己启动本地 HTTPS 服务。子进程收到的环境变量去掉了继承的 `BASELINE`。连接池的用例让服务端声明 `Keep-Alive: timeout=1`，使 Node 不保留套接字，以此核对同一接收方的下一次发起不受连接池影响，以及容量是唯一的并发上限。连接计时器的清除经 `process.getActiveResourcesInfo()` 的计时器数核对。

http.spec.ts 与 http-refusals.spec.ts 用 vitest 的模块替身把 `node:https` 的 `request` 换成一个委托真实函数并记录每个请求的包装。http.spec.ts 用它在 `startExchange` 返回后同步核对请求已经写出。http-refusals.spec.ts 用它核对拒绝时 Node 没有建立请求。其他行为都经真实的 Node `https`。

慢层的夹具在 [support/https-server.ts](support/https-server.ts)：

- 证书：测试用 openssl 子进程生成自签证书，适用于 `127.0.0.1` 与 `localhost`，有效期一天。证书放在经 `realpathSync` 取得物理路径的私有临时目录，测试结束时删除。子进程收到的环境变量去掉了继承的 `BASELINE`。
- 本地 HTTPS 服务：记录收到的方法、路径、头与体，由每个用例决定怎样响应。
- 黑洞监听：接受 TCP 连接但从不完成 TLS 握手，用于连接超时。

[support/connect-proxy.ts](support/connect-proxy.ts) 是本地 `http:` CONNECT 代理，用 `http.createServer` 的 `connect` 事件实现，记录每个 CONNECT 的目标。它有四种模式：

- `tunnel`：连接目标，回复 200，双向转发字节。代理不终止 TLS。
- `refuse-then-reset`：回复 403，50 毫秒后重置连接。这是 Node 缺陷的回归用例：没有连接池的规避时，重置使测试运行报告未处理的 `ECONNRESET`。
- `silent`：保持连接，从不回复。
- `close`：不回复，直接关闭连接。

proxy.spec.ts 的连接池空闲时限是 60 秒。停止、关闭与连接超时的用例要求交换在 1 秒左右之内结束，所以结束不可能来自 Node 的隧道超时。这些用例同时锁住 Node 把请求选项传到 `createConnection` 的行为，原因见[内部架构“经代理建立连接”](../docs/architecture.md#经代理建立连接)。一个用例让交换在它的套接字回到连接池的同一 tick 停止，下一个交换复用这个套接字：它核对取消只作用于连接池尚未持有的套接字。

代理 URL 不外泄的保证分两处。构造时的保证在 proxy-config.spec.ts：URL 含换行、回车或制表符时构造也不报错，Node 含完整 URL 的错误消息不会出现。proxy.spec.ts 的秘密用例只核对 Node 运行时的错误消息不进入结果与诊断。

[live/openrouter.spec.ts](live/openrouter.spec.ts) 是真实网络用例，由 `pnpm --filter @omne-harness/pi-ai-transport run test:live` 运行。它只在 `OMNE_LIVE_TESTS=1` 时运行，否则在用例体内用 `ctx.skip()` 跳过。它不用 `skipIf`：慢层的预解析会丢弃整个文件，即使设了开关。用例在测试边界把 `HTTPS_PROXY` 与 `NO_PROXY` 映射为代理配置，凭据头只写占位值 `Bearer placeholder`，由代理替换为真实凭据。设了开关而没有 `HTTPS_PROXY` 时，用例失败。用例不读取也不输出任何密钥。

网关引擎的用例经 `bindChatCompletions` 驱动引擎，替身只有家族的部分。[support/chat-record.ts](support/chat-record.ts) 给出一条测试记录、四个 hook 的替身与计量器替身。替身记录 `check` 与回放 hook 的输入，并可以让 `check` 失败或让计量器给出另一个表示采用。请求、消息与档案经 model-contract 的 `judgeFixedModelRequest` 与 `decodeRevision` 构造，所以消息身份与块身份是真实的品牌值。契约判定目前不接受请求的 `replay` 键，关闭回放的请求由测试在判定之后加上这个键。[family-table.spec.ts](family-table.spec.ts) 的测试家族在内存中返回绑定，并记录 `acquire` 的输入与 `release` 的次数。

[chat-completions-calibration.spec.ts](chat-completions-calibration.spec.ts) 直接调用 `calibratedAmount`。计数函数是确定性的替身（文本长度，或在 `continuation-shrank` 用例里一个真实文本不会给出的非单调计数），消息身份经 `judgeFixedModelRequest` 取得。每个期望数字都在用例里按同一替身算出，所以用例检查的是算术把什么交给计数、把什么换成 O，不是 tokenizer。

[chat-completions-measurement.spec.ts](chat-completions-measurement.spec.ts) 直接调用共用的计量规则。计量输入由 [support/chat-record.ts](support/chat-record.ts) 的测试记录、档案与经判定的请求构造。摘要用例把空校准的摘要与不带校准成员的同一组字段的 SHA-256 比较，所以空校准改变摘要时用例失败。共用计量器 `createCalibratedMeter` 的用例用按 UTF-16 码元计数的替身 tokenizer，核对四种拒绝、按家族要求计数原文或其 NFKC 形式、只在校准带锚点时报告锚点判决、输入上限的两种来源与本供应商的上游限额、每种档案限额的精确检查，以及 tokenizer 失败与推理单元标记的交接。两家的真实 tokenizer 与图片规则由家族包覆盖。

[chat-completions-decode.spec.ts](chat-completions-decode.spec.ts) 把手写的 SSE 文本交给 `src/testing/fixtures.ts` 的 `replayStream`。它与发送使用同一个主体解码 `decodeBody`，所以每个用例都经唯一 `ended` 的守护与终止映射，并核对恰好一个 `ended` 且在最后。推理 hook 的 `seal` 替身记录收到的推理项，并给出用例指定的载荷或失败。两个用例按真实网关流的形状手写：带 `reasoning.summary` 与 `reasoning.encrypted` 的流，以及签名单独到达的 `reasoning.text` 流，两者都先发一帧不带 usage 的 finish，再发一帧带 usage 的同一 finish。这些流不是真实样本的副本。解码器的限额 `LIMITS` 在 [support/chat-record.ts](support/chat-record.ts)，只是本套测试的初值。

[testing-helpers.spec.ts](testing-helpers.spec.ts) 用两条测试记录组成一个小家族，在临时目录中写出与引擎一致的夹具，再逐项破坏它们，核对 `checkChatCompletionsFixtures` 的报告与指纹的生成和检查。

三段传输的用例只替身本地无法运行的部分：家族。[support/test-family.ts](support/test-family.ts) 是测试家族，编码与解码都是纯函数，协议写在文件头。它记录 acquire、release 与 encode 的输入，并可以让 acquire 或 encode 失败。包内用例用内部工厂 `openNetwork` 建立网络资源。它返回包内资源，其中的 `handle` 是根入口 `createNetworkResources` 返回的同一种不透明句柄。[support/transport.ts](support/transport.ts) 在给定的网络资源上构造传输，并计数发送：它包装网络资源在途登记的 `add`。每个交换在把请求交给 Node 的同一个同步调用中登记，所以 `start` 返回时计数已经准确，不依赖服务端的异步计数。慢层的用例同时核对包内计数与服务端收到的请求数一致。

[conformance.spec.ts](conformance.spec.ts) 用 model-contract 的 `createScriptedConformanceSubject` 提供提供者，把真实传输挂在 `transport` 上，对本地 HTTPS 服务运行 `checkModelProviderConformance`，断言 transport 组的六条义务都是 `pass`。其他义务属于脚本化的提供者，本包不对它们断言。

[support/exchange.ts](support/exchange.ts) 提供交换的输入、预约与观察工具，含清理断言。其中的限额只是本套测试的初值，不是本包的默认值。[support/sources.ts](support/sources.ts) 提供记录读者行为的字节源，供分帧层的提前结束用例使用。

持续运行的测试只证明本地 HTTPS 服务与本地 CONNECT 代理上的行为，不证明真实供应商、真实代理、`https:` 协议的代理、公网 TLS，或 Model 发送路径与本传输的组合。本包的测试不用真实家族。两个真实家族经本传输与本地 HTTPS 服务的联调在 `pi-ai-anthropic` 的 `two-families.spec.ts` 中。`test:live` 的证据只来自手动运行。完整的覆盖与未覆盖见 [SPEC“组合与验证”](../SPEC.md#组合与验证)。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。在仓库根运行：

```sh
pnpm turbo run test --filter=@omne-harness/pi-ai-transport
pnpm turbo run test:fast --filter=@omne-harness/pi-ai-transport
pnpm turbo run test:slow --filter=@omne-harness/pi-ai-transport
OMNE_LIVE_TESTS=1 pnpm --filter @omne-harness/pi-ai-transport run test:live
```

慢层需要 PATH 中有 `openssl`。最后一条命令发出真实请求，会产生少量费用。

## 本包事实

测试通过不代替规格或验收。本目录没有固定输入文件，原因见 [fixtures](fixtures/README.md)。

- `test:live` 没有单独的 Vitest 配置。包模板没有这个配置的位置，加上它会使模板扫描的结构检查失败。所以 `test` 与 `test:slow` 也收录 `tests/live/`。未设开关时用例跳过。turbo 的严格模式滤掉未声明的环境变量，所以经 turbo 运行时它总是跳过。快层不收录它。
- 慢层用例在 Node 26.12.0 上通过。代理缺陷与建连取消的事实按同一版本的 Node 源码核对。

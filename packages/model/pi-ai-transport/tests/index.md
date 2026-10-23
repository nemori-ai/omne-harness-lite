# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试分层、真实依赖与替身
- [capacity.spec.ts](capacity.spec.ts)：连接容量的 FIFO、取消、关闭、消费、归还与预约归属（快层）
- [diagnostics.spec.ts](diagnostics.spec.ts)：诊断观察者的隔离与计数（快层）
- [sse.spec.ts](sse.spec.ts)：任意切点下的 SSE 分帧、四种失败原因与读者提前结束（快层）
- [frames.spec.ts](frames.spec.ts)：无损 JSON 帧、end-marker、失败与读者提前结束（快层）
- [iteration.spec.ts](iteration.spec.ts)：提前结束的包装：`return()`、`throw()` 与 `asyncDispose` 关闭来源，启动后不重复关闭，来源关闭失败时生成器仍完成，关闭期间到达的调用不启动生成器也不重复关闭（快层）
- [http-refusals.spec.ts](http-refusals.spec.ts)：发起前的拒绝原因、拒绝时不触网、同步异常时原异常不被归还掩盖，与网络资源的配置校验（快层）
- [http.spec.ts](http.spec.ts)：同步发起、停止、2xx 与非 2xx、响应体读取错误的类型、读者提前结束、错误体、连接超时与计时器清除、关闭后的清理与诊断隔离（慢层）
- [proxy-config.spec.ts](proxy-config.spec.ts)：代理配置的校验、构造时任何消息都不含 URL，与 Node 版本守卫（快层）
- [proxy.spec.ts](proxy.spec.ts)：经本地 CONNECT 代理的交换：隧道成功、直连项、URL 规范化、连接超时的结束时刻、代理拒绝后重置、不可达、未回复即关闭、不回复、隧道内 TLS 失败与停滞、建立中的停止与关闭、取消不影响连接池已持有的套接字、代理 URL 不进入结果与诊断（慢层）
- [live/openrouter.spec.ts](live/openrouter.spec.ts)：经真实代理向 OpenRouter 发一次流式请求，只在 `OMNE_LIVE_TESTS=1` 时运行（慢层，`test:live`）
- [network.spec.ts](network.spec.ts)：网络资源的关闭排空、连接池、同一接收方连续发起、容量是唯一的并发上限、多接收方不排队（慢层）
- [transport.spec.ts](transport.spec.ts)：三段传输的配置校验（含不是由网络资源工厂建立的 `network`）、prepare 的路由查找与家族绑定、materialize 期间开始的 prepared 关闭、prepared 与外层的关闭（含 release 失败时外层关闭等待全部关闭结束）（快层）
- [materialize.spec.ts](materialize.spec.ts)：materialize 的回执、内容引用拒绝、encode 失败、重复调用、容量等待、取消与关闭归还名额（快层）
- [start.spec.ts](start.spec.ts)：不发送的 start：无凭据、凭据不能写入请求头、信号已中止、网络资源已关闭（先于凭据检查）、关闭之前的重复 start、三种关闭之后的 start、start 与关闭之后再 start（快层）
- [termination.spec.ts](termination.spec.ts)：失败映射表的每一行（快层）
- [transport-exchange.spec.ts](transport-exchange.spec.ts)：发送的 start：同步发出、在结束标记处结束读取、失败映射表各行对真实响应、流中取消与关闭、读入结束标记之后的取消保留解码器的终止、读者提前结束、真实发送下的容量等待与归还（慢层）
- [conformance.spec.ts](conformance.spec.ts)：model-contract 符合性套件 transport 组的六条义务（慢层）
- [family-table.spec.ts](family-table.spec.ts)：家族表：规范 JSON 摘要、记录纯度、重复与路由冲突、冻结副本、取得的失败映射、绑定不符与取消时的释放、回放格式查询（快层）
- [chat-completions-plan.spec.ts](chat-completions-plan.spec.ts)：网关引擎的 `rules.plan`：回放声明比对、参数规划各分支、`check` 与表示（快层）
- [chat-completions-calibration.spec.ts](chat-completions-calibration.spec.ts)：两家共用的校准算术：完整计量与 O 替换、具名不可用、锚点的包络差与只按估算部分的余量、`continuation-shrank` 与拒绝（快层）
- [chat-completions-measurement.spec.ts](chat-completions-measurement.spec.ts)：两家共用的计量规则与计量器：方法名的后缀拼接、`inputDigest` 的校准条件、单元追加 token 的求和、空校准，以及共用计量器的拒绝、计数形式与锚点判决（快层）
- [chat-completions-encode.spec.ts](chat-completions-encode.spec.ts)：网关引擎的 `encode` 与绑定：请求体、角色与内容、工具调用与结果、缓存放置、回放、释放与记录缺陷（快层）
- [chat-completions-decimal.spec.ts](chat-completions-decimal.spec.ts)：费用词法：普通词法照原样，指数形式移动小数点，负数、非 JSON 数与超长结果为 `null`（快层）
- [chat-completions-decode.spec.ts](chat-completions-decode.spec.ts)：网关引擎的流解释：流解释表逐行、限额、chunk 形状与两段仿照真实网关流的合成流，每次回放恰好一个 `ended`（快层）
- [testing-helpers.spec.ts](testing-helpers.spec.ts)：测试入口：夹具检查的各项报告与采用指纹的生成和检查（快层）
- [chat-completions-vendor-words.spec.ts](chat-completions-vendor-words.spec.ts)：引擎源码不含厂商名或型号家族名（快层）
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的运行时导出（两个工厂与家族表的四个函数），子入口 `./chat-completions` 导出 `bindChatCompletions`、`calibratedAmount`、`createCalibratedMeter` 与共用计量规则，子入口 `./testing` 的七个运行时值，引擎内部不可经包导出访问，网络资源句柄在运行时只显示 `close`，家族类型形状与组架构一致
- [public-entry.spec-d.ts](public-entry.spec-d.ts)：五个家族类型、三段传输工厂、网络资源工厂与它们的配置类型的编译期用例，以及网络资源是不透明句柄
- [dependencies.spec.ts](dependencies.spec.ts)：运行依赖与导入方向
- [examples.spec.ts](examples.spec.ts)：在子进程中运行公开示例并核对输出（慢层）
- [support/https-server.ts](support/https-server.ts)：自签证书、本地 HTTPS 服务与黑洞监听
- [support/connect-proxy.ts](support/connect-proxy.ts)：本地 CONNECT 代理：隧道、403 后重置、不回复与未回复即关闭四种模式，记录 CONNECT 目标
- [support/exchange.ts](support/exchange.ts)：交换的输入、预约、观察工具与清理断言
- [support/test-family.ts](support/test-family.ts)：测试家族、测试协议与测试用的请求、供应商和限额
- [support/transport.ts](support/transport.ts)：在给定网络资源上构造传输、发送计数、事实流收集与名额探测
- [support/sources.ts](support/sources.ts)：记录读者行为的字节源
- [support/chat-record.ts](support/chat-record.ts)：网关引擎的测试记录、解码器限额、hook 与计量器替身，以及经契约判定构造请求、档案与组装输入的工具
- [fixtures/](fixtures/index.md)：测试固定输入（不适用）

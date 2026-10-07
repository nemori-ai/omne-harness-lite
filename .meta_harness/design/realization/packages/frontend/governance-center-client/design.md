# 无秘密公开 health 的客户端传输

本节点补齐已接受传输在客户端一侧的实现，保持 `composition.governance-center-entry` 语义身份。既有契约足以定义发什么与怎么判答复，不新增一个同义健康检查能力。原型所在机制与生产实现分开。

## 实现路径与候选

已有项目 Node24/TypeScript 工具链下，比较：A 使用 `node:https` 的 HTTP/1.1 成帧，加显式 TLS 核验/有界收集/精确结果解析；B `node:tls` 上自行维护全部 HTTP 状态行/头/长度解析；C fetch/Undici 加自有 dispatcher。A 复用成熟解析器，现有隔离探针覆盖其关键行为；B 多一套安全敏感成帧实现；C 对握手后才发送、SPKI替代、重定向及隐式行为仍需更深适配。D-038在独立节点评审后接受 A，不假定探针接受了选型。

不需要长驻插件实例或新服务维度：这是一次调用自己取得并关闭连接的协议消费函数，没有共享状态/后台循环。调用者若处于 Cordis effect 中，向操作传入该 effect 拥有的 AbortSignal 并等待操作收场；本模块不自行建立 root Context、fiber、Agent 或后台进程。

## 契约到公开操作

公共入口 `readPublicHealth(options)`：参数只含 HTTPS URL、信任材料和可选 AbortSignal/总超时；**不接受任意请求体、密码、登录出示物、任意路由或请求头**。域语义类型来自冻结 EC1 Schema `PublicHealthReply`，本包实现其验证器，不依赖中心包私有源码或改变 Schema。

| 契约责任 | 兑现方式 | 证据义务 |
|---|---|---|
| EC1 S-18；HT1 S-9 | 固定 POST体只带公开 health operation；显式 Content-Length，Connection: close，不发送认证材料 | 真中心与合成对端核字节 |
| D-029；HT1 S-4 | 默认系统 CA 或显式 CA 字节 + 主机名；显式 SPKI SHA256 替代；TLS至少1.3；只在 secureConnect 并核验后 end(body) | 错误CA/主机名/pin时接收应用字节数为0；TLS1.2拒绝 |
| HT1 S-5 | 禁用连接池，每个调用一连接一请求，无自动重试/重定向 | 每次连接和请求计数 |
| HT1 S-17 | Node HTTP解析器读完整HTTP/1.1；要求合法 Content-Length且无Transfer-Encoding；精确18字节 version-mismatch先于状态分类；其他需200及本请求对应形状 | 非200版本值、残缺/畸形/超界/其他路由结果 |
| EC1 S-27；HT1 S-15 | 公开health恰三字段，reachable=true，centerId按EC1的32位小写hex，version非空字符串 | Schema正负例；不把reachable解释为治理就绪 |
| EC1 S-36 | 超时、断连、取消和对端异常明确问不到；不返回伪造health | 各故障独立场景 |

实现入口为 `packages/frontend/governance-center-client/src/index.ts`，消费者仅通过包exports使用。

本包结果是编程接口对已接受线上结果与运输故障的分类，不是新线上信封或CLI输出契约。分为 health（含原三字段）、entry-answer（四种已知字符串）与 unavailable（安全的具名原因）。其中精确 version-mismatch按HT1跨状态识别；另三种入口字符串仅在200完整JSON时按HT1分类，不能当作健康成功。其他值必须符合本次公开health形状。程序配置非法时在建连接前抛具名配置错误，不伪装网络失败。

## 依赖、信任与作用域

URL 必须 HTTPS，拒绝 userinfo/query/fragment；只直连，不读取环境代理、不追随重定向。端口/路径由已校验 URL 取得，默认路径 `/`；路径没有授权含义。只接受系统CA、调用者交入的CA字节、或64位hex SPKI SHA256之一；不提供 insecure。每次调用在第一处 await 前复制CA材料/固定pin和URL，不在请求途中重读文件。

本层不做首次人类信任确认，不替用户接受新pin；调用者必须先给已接受材料。也不保存centerId或宣称health与未来业务两连接之间原子身份绑定。这些责任仍归完整客户端契约/应用。

默认总期限10秒，可由调用者给1～120000毫秒正整数；从建请求前开始计时，覆盖连接、握手、响应读取；Node事件循环可能延迟处理，不宣称硬实时。响应头16KiB、体64KiB上限；超过只报问不到，不说服务端值无效。`PublicHealthReply.version`规格未限长，本提供者接收限额是资源保护范围，不缩小规格允许值集。

## 状态、并发、失败与资源配对

一次调用拥有唯一 ClientRequest、socket、timeout和可选abort订阅；无跨调用缓存、连接复用、自动重试和登录状态。调用之间不分享可变信任输入或解析buffer。

开始前已取消则不建连接。运行期间取消/到期关闭本调用请求和socket；complete/error/abort的竞态只完成一次。归还结果前撤掉定时器和外部signal订阅，并销毁当前请求；等待其关闭事件确认本调用不再持有该网络资源。晚到error只能清理不能覆盖已定结果。不能以destroy调用本身假装已close；失败初始化也走同一清理。DNS解析由Node系统解析器负责，取消不会取消已经进入系统解析器的工作，不把它宣传为已停止远端系统工作；请求销毁后晚到解析不能建立可发送的本调用。

超时和故障只返回具名原因/安全错误码，不透传证书全文、URL、HTTP body或底层异常文本。公开health无业务写，不需要假设取消会撤销远端效果；未来加入治理写时必须扩展调用结果未知模型，不能沿用本增量宣称写已取消。

## 未决与消费者

本节点已由D-038限定采用，首个受限增量已实现。完整CLI命令/退出码、本地状态、秘密输入、新生产路由和TUI不在本增量内；消费这些能力仍需对应精确契约。发布给CLI的首次正式API需要运行时/类型检查与真中心集成证据，不以本文件中的拟议函数名声称实现就位。

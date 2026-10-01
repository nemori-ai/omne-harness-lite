# D-091：模型传输响应资源边界的部分技术采用

2026-09-27，主线依用户对 model-request-runtime 实施、按已接受 spec／realization 施工及主调度／验收的授权，**部分技术采用** [`pi-ai-transport` v5 响应头投影 rev2](../../../realization/packages/model/pi-ai-transport/v5-headers-design.md)，设计原字节 SHA-256 `11f8bf455260889d25c51c512d119b0a3063d95610474f582dcc735f3b3fd1c7`。来源选择为 [header-handoff rev1](../../proposals/model-request-adaptation/header-handoff.md) 与已接受 [D-090](../model-headers-v5-adoption/decision.md) 的表示 A／交接 A；本次不重新决定 MR5／RT5 语义或产品政策。

接受的提供者结构是：`sendRequest` 的成功 `R` 在实际 JavaScript 公共可达图中仅含 `stop()` 与 `stopped`，由包内私有记录拥有原 `IncomingMessage`、`ClientRequest`、同次 plan 与单 reader 权；`readStream` 凭真实句柄身份和同次 plan 独占消费。`stop()` 实际返回 `undefined`，`stopped` 不交原始资源；WeakMap 不承担连接停止、监听解除或 lease 排空。已采得并按 S-20 处理的头值将来只从同次 `SendResult.rawHeaders` 交接，旧 `R.headers`／`TransportFailure.headers`／`StreamEnd.headers` 不成为第二权威。此选择允许先实施并验证**不透明 R 与停止返回值的安全修复**；任何公开 `rawHeaders` 实际出值仍须经过下一段的政策门。

**未接受为完整可实施保证**的是 [RT5 G-6](../../../spec/capabilities/model-request-runtime/v5/contract.md#十二已知缺口) 三项政策生产取值与匹配语义：`credential_fragment_min_length`、`credential_header_names`、`credential_patterns`；它们归 transport／runtime 提供者设计与安全评审，不能由当前测试值、空列表或隐式默认填上。相应的 PH-G2 未闭，故尚不放行真实响应头从 transport 公共面输出，也不声称 S-20 完成。PH-G1 runtime 公共类型、PH-G3 invoke 接线、PH-G4 codec／全部写方、PH-V1～V9 与 PH-J1/J2 的真实验证各归原 owner。原产品请求、费用、停止、历史记录及 37 官方模型认证均不由此决定提升。

独立架构评审先在 rev1 发现 PH-AR1：即使脱敏 `rawHeaders`，公开 `response.stream.headers` 仍泄漏原始值；当前源码 `stop: () => req.destroy()` 还会在运行时返回 `ClientRequest`。rev2 明确真实句柄和返回值边界后，同一 reviewer 对修订及受影响边界复评**未发现阻断**，并确认 PH-V9 的真实 JavaScript 反射／方法返回／包导出与行为负控能检出旧泄漏；评审未运行源码、TLS、负控或形式工具。候选三文件 SHA-256 分别为 README `128d439780750cd1a744d66a90123043ea6ec45160f2fc7c67ed8027748a5729`、设计 `11f8bf455260889d25c51c512d119b0a3063d95610474f582dcc735f3b3fd1c7`、验证 `3919d7e71d6ef31cdc48484406e1dfb561883539d763b495ccaec69b02dca951`；评审归因摘要不冒充运行证据或人的最终交付签收。

本决定只取代该节点旧设计在新 RT5 采用链上把头留在 `R`／reader 终局的提供者路径；D-076／D-082 已接受的其它传输责任及旧制品实测范围保留。节点新增绑定 0，spec／registry 不升版。后续要完整实施 v5 headers，先为 G-6 补精确 provider／装配政策和安全评审，再实施与独立验证实际 TLS→send→invoke→append/reopen；结构接受本身不表示源码已经修复。人的总体交付接受未发生。

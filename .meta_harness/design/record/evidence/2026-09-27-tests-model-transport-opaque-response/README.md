# Transport 不透明响应资源：实际实现与有限技术签收

2026-09-27。持续消费者为 `pi-ai-transport` 的公开发送/读取闭包和后续 MR5/RT5 消费者。主调度依据 [D-091 的部分技术采用](../../decisions/model-transport-response-resource-adoption/decision.md) 技术签收真实不透明 `RawResponse`、私有网络资源、同 plan 单 reader 及 `stop()` 实际返回 undefined 的结构切片。源码 `300309fd` 已并入 HUB `2fd302ce`；其依据是 transport [v5 headers rev2](../../../realization/packages/model/pi-ai-transport/v5-headers-design.md) SHA `11f8bf455260889d25c51c512d119b0a3063d95610474f582dcc735f3b3fd1c7` 的精确限定采用，不是完整响应头设计放行。

作者 [原报告](author-report.md)记录 build/typecheck、178 项 transport 测试、实际制品的两次本机 TLS 请求、双语重要代码及两个行为负控。主调度逐项核对源码、patch 与原档案后，在 HUB 重跑 build/typecheck、transport178/runtime147、全局格式和源码规则，均 exit 0。

[独立报告](independent-report.md)判定该派发切片 **Pass**。真实本机 TLS 响应到达但正文仍挂起时，实际公开 JS 句柄冻结且无原型，反射仅见 `stop/stopped`，无法取得 stream/request/socket/headers。两次 stop 均实际返回 undefined，stopped 实际兑现 undefined，已注册的真实 socket close 事件到达后连接数为 0；发送仅一次。完整 SSE 到达后延期读仍取得完整正文；伪造/复制句柄、不同 plan、竞争及再次 reader 均拒绝。实际 root/plugin 导出和五个未公开路径拒绝符合边界。

独立两个完整隔离 transport 源码副本分别恢复 stream 和表达式 stop，真实编译 exit 0；同一公开 JS/TLS oracle 分别 exit 1，命中 `OPAQUE_OWN_KEYS` 与 `STOP_RETURNS_UNDEFINED`。第一次正向测量 PID192555 的 cleanup 时点错误保留；仅增加已注册的实际 close 等待，原零连接断言不变，唯一修正运行 PID192776 exit 0。原失败、测量差异、负控编译与执行的全部原始输出保全，未修改产品以适应测量。

[证据归档](evidence.tar.gz)保全 294 成员：作者原关闭归档和清单，以及独立真实制品、精确源码/设计输入、oracle、两个编译变异、配置、原始 PID/命令/stdout/stderr/退出码和报告。主调度已逐成员回读核对 [成员清单](members.json)与 [归档哈希](archive.sha256)。独立 `SHA256.json` 原 SHA 为 `3b1e65bd895dd01910ef85fea10207a8c573ef23eaee9794c9ac48ab1794d9dd`。报告里的原绝对路径用于追溯，恢复时使用归档 `author/` 和 `independent/` 路径；本机证书/密钥仅为合成 TLS 夹具。

制品范围是一个实际 transport tarball 加明确构建的工作树公开依赖，不称独立传递制品闭包。成功响应仍不公开 rawHeaders；旧失败 headers 沿用已有范围。本次不签收 G6/S-20 完整政策、H 交接、完整 PH-V9、附件留存、append/reopen、租户认证、十三操作、真实 OpenRouter/vendor/cache 或 37 认证；新增付费 0，形式执行 0。

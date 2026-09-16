# Model Execution 提供者映射验证边界

来源 `packages/model/llm/README.md` 及其 package 测试只能支持：纯消息/请求配置、stream assembly、错误归一和来源标记；没有网络出口或状态 host。
当前没有候选 host/plugin 的实现、真实 Cordis 注册/换代、OpenRouter 或字节后端组合测试。
后续符合性至少验证 tenant/主体隔离、同批准入、发出前墓碑、崩溃窗口、迟到认回、重复回执、
unknown 保留、换代排空及可观测关联；不得复用 legacy 运行日志作为新坐标证据。

Round-3 静态验收须把 `closing/outcome_unresolved` 与 durable business `unknown` 分开，验证 late-result
CAS 门失败保持 current revision（无 current 时仍为空）且不产生业务输出，并验证旧代最后一个
`source.generation.changed` marker 与 E 控制帧映射。上述仍是候选义务，不是实现或形式证据。

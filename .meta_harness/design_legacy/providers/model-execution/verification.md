# Model Execution 提供者映射验证边界

来源 `packages/model/llm/README.md` 及其 package 测试只能支持：纯消息/请求配置、stream assembly、错误归一和来源标记；没有网络出口或状态 host。
当前没有候选 host/plugin 的完整实现、真实 Cordis 注册/换代或字节后端组合测试。
实施线固定提交 `f0bb020` 的 OpenRouter 传输探针已分别取得真实两轮工具调用与
`/generation` 费用核对：第一轮响应给唯一 `read_file(input.txt)`，本地读取测试文件，
第二轮以原 tool-call ID 回传结果并取得匹配文本；两个响应的 SSE 实际费用分别与
OpenRouter 账务查询一致。后续隔离探针通过产品 `LocalExecutionHost + LocalFileToolPlugin`
完成同一次真实文件读取，得到 succeeded/quiescent/cleanup done/effect none。
这些结果证明一个模型/工具 wire 往返及 LE 的正常路径，
不证明耐久 Run/Tools Admission、共同 DispatchGuard、CC-06 恢复或 CLI 全链符合性。
这项证据属于另一个实施分支，尚未因本文引用就成为本设计目标的已采用实现。

固定 `pi-ai@0.85.1` 的离线受控 SSE 与两次真实 OpenRouter 短请求表明，其路由和
工具流可工作，但未修改的解析结果将实际服务商折为 `openrouter`，将费用只报告为
目录估算；一组真实请求的估算恰与实际金额相等，仍未保留费用来源。实施调研与
来源限制见[自包含研究包](../../research/pi-ai-openrouter-transport/README.md)；[D-019](../../decisions/pi-ai-openrouter-transport/decision.md)
已选定 fork 方向，替换前仍须以固定版本和真实响应覆盖路由/BYOK/缓存/折扣、工具往返、响应 ID、
usage 来源、断流/错误/abort、无隐藏重试与私有 replay；费用缺席时标 unknown，
不能由目录估算推断真实扣费。候选小 fork 只证明解析点可修改，未完成类型和故障验证。
后续符合性至少验证 tenant/主体隔离、同批准入、发出前墓碑、崩溃窗口、迟到认回、重复回执、
unknown 保留、换代排空及可观测关联；不得复用 legacy 运行日志作为新坐标证据。

Round-3 静态验收须把 `closing/outcome_unresolved` 与 durable business `unknown` 分开，验证 late-result
CAS 门失败保持 current revision（无 current 时仍为空）且不产生业务输出，并验证旧代最后一个
`source.generation.changed` marker 与 E 控制帧映射。上述仍是候选义务，不是实现或形式证据。

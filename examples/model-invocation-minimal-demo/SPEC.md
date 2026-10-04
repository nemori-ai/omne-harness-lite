# Model invocation demo 的工具驱动行为

采用依据：2026-10-04 已采用的 Tool Runtime r10 与动作接缝 ar3。应用拥有 tool-driver/1 数据及其投影；共享消费类型归 core/tool-admission。实现进度与验证另记，本页不声明全部兑现。

TD-1：tool-driver/1 的形状归 schema/tool-driver.schema.json 和公开源码类型。固定校验图在构建时生成，首次使用时加载并由模块缓存。普通 JSON 先复制再检查；工具定义、调用块、消息、报告仍由各自公开判定器检查。未知成员、所属版本、键或 shell 冲突不能被当成其他领域记录跳过。

TD-2：稳定键是 tool-driver/1/ 加规范 JSON 字符串数组。attempt 使用 ExactDecimal.toCanonicalString()，不经浮点转换。run_started 和 run_ended 不带 shell.run/attempt；其他记录的 shell 与值同源。readKeys 恰含 dedupeKey 和 tool-driver/1/all。原键同值认回，异值不能覆盖。

TD-3：同一入站只启动一个 Run，同一会话只有一个未终结 Run。采用引用原 Run，尝试序号严格增加；采用和真实 attempt_started 消息同批追加。工具表、权限键集与报告一致，context 来自实际读取。真实模型回复须与原模型响应和调用记录相连，同一 callId 不能属于不同批次。

TD-4：整批完成逐项覆盖原模型调用顺序，包括不可解析项。有效 gate 下解析项必须有真实正式链；缺件 gate 只保留已确认前缀，其他项形成正式缺席拒绝。任一 asked 未结束，不写完成事实或交部分 token。no_such_entry 必须由原工具表缺项支持。后续可解释改参不倒写旧完成；核验返回 arguments_changed。

TD-5：拒绝意图与执行意图的首次路由在同一物理代、同一尾上互斥。拒绝确认与经过真实消息协议的 ToolMessage 同批追加，不建立执行账。Run 终结有真实依据，不能与工具终局同批追加；late 由各终局提交所读的同一前缀确定。

TD-6：Run reader 与 ToolActionHistory 复用同一日志投影，不维护独立 activeRun 真相。完整前缀须逐项可解释；缓存不得跨物理代或尾复用。unknown 只按原完整批次认回，部分成员、缺席或异值不能解除未知责任；旧写者未隔离前不得恢复未最终动作。

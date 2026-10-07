# Model invocation demo 的工具驱动行为

采用依据：2026-10-04 已采用的 Tool Runtime r10 与动作接缝 ar3。应用拥有 tool-driver/1 数据及其投影；共享消费类型归 core/tool-admission。实现进度与验证另记，本页不声明全部兑现。

TD-1：tool-driver/1 的形状归 schema/tool-driver.schema.json 和公开源码类型。固定校验图在构建时生成，首次使用时加载并由模块缓存。普通 JSON 先复制再检查；工具定义、调用块、消息、报告仍由各自公开判定器检查。未知成员、所属版本、键或 shell 冲突不能被当成其他领域记录跳过。

TD-2：稳定键是 tool-driver/1/ 加规范 JSON 字符串数组。attempt 使用 ExactDecimal.toCanonicalString()，不经浮点转换。run_started 和 run_ended 不带 shell.run/attempt；其他记录的 shell 与值同源。readKeys 恰含 dedupeKey 和 tool-driver/1/all。原键同值认回，异值不能覆盖。

TD-3：同一入站只启动一个 Run，同一会话只有一个未终结 Run。采用引用原 Run，尝试序号严格增加；采用和真实 attempt_started Session 事实同批追加。工具表、权限键集与报告一致，context 来自实际读取。真实模型回复须与原模型响应和调用记录相连，同一 callId 不能属于不同批次。

TD-4：整批完成逐项覆盖原模型调用顺序，包括不可解析项。有效 gate 下解析项必须有真实正式链；缺件 gate 只保留已确认前缀，其他项形成正式缺席拒绝。任一 asked 未结束，不写完成事实或交部分 token。no_such_entry 必须由原工具表缺项支持。后续可解释改参不倒写旧完成；核验返回 arguments_changed。

TD-5：拒绝意图与执行意图的首次路由在同一物理代、同一尾上互斥。拒绝确认与经过真实消息协议的 ToolMessage 同批追加，不建立执行账。Run 终结有真实依据，不能与工具终局同批追加；late 由各终局提交所读的同一前缀确定。

TD-6：Run reader 与 ToolActionHistory 复用同一日志投影，不维护独立 activeRun 真相。完整前缀须逐项可解释；缓存不得跨物理代或尾复用。unknown 只按原完整批次认回，部分成员、缺席或异值不能解除未知责任；旧写者未隔离前不得恢复未最终动作。


TD-7：共同投影逐条使用模型、runner、context、driver 和工具日志拥有者的判定器。未知或多重归属使前缀不可用。pending 表示真实批次尚未完成判断，route.none 表示尚无处置意图，notFound 表示完整可解释前缀中没有该调用；这些状态都不代替 unavailable。旧尝试的已接纳执行可以继续收场，其 late 由终局之前的实际 Run/attempt 事实确定；新意图只准在原 Run 的当前尝试接纳。

TD-8：模型 RunHistoryReader 使用调用者已持有的 SettlementPrefix 和同一投影，在读取前后核验原绑定及物理 owner 代。它不重新读一个较新的尾，也不保存独立的活动 Run 表。日志投影不授予操作权限，准入提供者仍须在实际 IO 前后复核当前 tool.submit 权限。

TD-9：动作 host 从当前受权的完整日志取得原模型批次、采用报告和工具表；请求中的同名数据不构成来源证明。物理 owner 更换不改变原动作锚。当前 Run 已结束时不能取得活动来源，尝试换代返回 attemptSuperseded。读取前后以及动作输出的能力核验都复核 run.advance；当前 grants 由可信装配提供，保持不透明对象身份。

TD-10：驱动写侧持有一个 coordinator 借用，按同一完整前缀检查候选批次，再使用 tailEquals 追加。尝试采用／开始消息、拒绝确认／实际消息分别整批提交；不能只写一个成员。整批动作完成持久确认前不向执行侧交出任何准入定位值。未知批次未认回时，该借用拒绝后续业务提交且不能报告排空完成。关闭立即拒绝新调用，并等待已接纳的实际操作与未知责任；释放失败保持可重试，不重新开放入口。

TD-11：demo 的工具模式从真实用户入站启动 Run，采用实际 registry 的工具表与权限报告。context 注册由 coordinator 查询，内容使用 model consumer 的受权绑定读取。工具执行必须引用该 Run/attempt 中已持久化的模型回复，不能由调用者传入同形消息代替。

TD-12：同一模型批次的全部 primary return 确认后，才执行 after_action(batch) 并提交 continuation_requested。它引用该批次的实际链与完整结论键；锚包含租户、会话、Run、规范化 attempt 与原 assistant 消息身份。普通数字和精确数字对象不得生成不同锚。同一原回复只有一个续答事实与稳定 model creation key。该事实不代替模型运行时拥有的请求创建记录；模型请求仍使用自身的幂等创建协议。

TD-13：每次模型请求使用各自的 observer grant，固定实际 call/dispatch 身份。工具续答不能复用前一请求已固定身份的 grant，也不能放宽原 grant 的校验。原接收者停止未确认时，应用保留其释放责任。模型失败时，Run 的 failed 终结必须引用实际持久化的失败响应；不能因调用返回 unavailable 就宣称 Run 结束。

TD-14：启动枚举实际持有的全部会话，恢复每个已有终局且未确认的交付义务，不能只扫描当前 demo 会话或有观察者的执行。A 的原结果资源、原后置链与结论，以及 B/C 的完整批次均须可核验；任一义务不能完成时不开业务入口。维护权限由应用私有闭包持有，只用于原执行的 after_action(each) 和工具 before_persist_message。撤权或尝试换代不取消已有结果义务；维护路径不能准入新动作、执行批次续答、推进 Run 或模型重试。结论提交保留原 tenant/session/Run/attempt 与实际物理 owner 代，不能以新尝试替换元数据。冷恢复不重跑工具作者或丢失连续性的后置贡献。完成 C 不等于模型已续答。

TD-15：管理装配关闭先停止实际工具作者，再等待 driver、delivery 和设施排空，最后放行工具依赖关闭。消费者排空前，工具子树不能释放其结果、环境及日志借用。原 close 未确认时保留原控制和依赖，单次应用 close 可以报告未完成；之后显式 close 只重试同实例。实际 close 持续 pending 时仍等待，不以超时报告静止。受信关闭控制在等待恢复前交给应用私有闭包，不依赖卸载后重新查询 Service。独立撤除官方贡献或动态准入能力不能停止稳定承载行及已准入作者。

未知的消息结算协调器按原 Session 保留。恢复入口先关闭新业务准入，再只认回该 Session 的原完整批次并排空原协调器，然后停止模型容器。其他 Session 的协调器不受此次恢复影响；读失败、异源或原批次未决定时仍保留责任，不重发 HTTP。

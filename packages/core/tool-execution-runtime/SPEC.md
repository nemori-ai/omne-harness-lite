# tool-execution-runtime 行为契约

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 设计并实施第二阶段。公开形状归 `src/index.ts`；本页只约束类型不能保证的行为。分阶段兑现范围由实际验证证据报告，不以本页存在宣称全部实现。

TE-1 执行身份为 tenant/session/callId。先核验租户再认回；同身份同实际输入不重复执行，不同实际输入拒绝。

TE-2 持久意图确认后才能启动。一个执行身份至多启动一次；重交、消费者重建、提供者恢复都不重做外部动作。

TE-3 观察句柄可以有多个或为零。release 只结束该观察者；原执行、Run 等待关系与环境资源不因此改变。stop 是另一次受权控制操作。

TE-4 终局首胜，后到结果不改写。中断先确认终局，再发送停止；逻辑中断、物理停止和外部作用分别记实。

TE-5 终局、账及耐久交付义务同一提交。late 从构造该提交的同一完整前缀计算。后置处理不能更改终局；确认消息追加后才算送达。

TE-6 waitIndex 只匹配当前等待。旧应答、重复应答、到点与停止竞争不能恢复另一等待；无期限的等待不擅自增加期限。

TE-7 首次调用固定资产版本、实际实现、参数和采用依据。贡献撤除关闭新采用；实际资源未失效的旧执行继续。失效后失败，不调用另一个实现续做。

TE-8 恢复覆盖所有持有未完责任的会话。已有终局只续交付；连续性丧失的非终局异常收场，包括未启动的 queued。恢复完成前拒绝新执行。

TE-9 前后台没有执行状态或执行模式。工具自身等待事实可供上层决定是否推进；切后台不能改变执行身份、重新获取环境或释放未收场执行的并发额度。

TE-10 裸 invokeTool 不承诺持久唯一性、租户隔离或恢复。runtime 必须在调用它前完成相应准入、身份和持久化责任。

TE-11 工具普通返回 `isError: true` 是业务失败，省略或 false 为普通成功；字符串始终按普通成功归一。该字段由 tool-definition 的类型、Schema、判定与规范化共同拥有，不从结果文本猜测。实现异常、形状拒绝、未启动失败分别分类。

TE-12 原始结果、帧和费用分别判定。工具帧只能指向本调用、符合既有 arrival-events 的工具约束，并通过单一串行装配通道；观察发送失败不把业务成功改成失败。费用报告接受后不得因进程崩溃丢失，同一项身份不同值拒绝。

TE-13 收场之后新到费用沿当前已接受规则只留诊断，不冒充有效补账或 manual 来源。若后续交付要支持自动晚报进入有效费用，须先接续 call-accounts 的来源集合；该能力不是本期账目卡的默认承诺。

TE-14 emit 只收本执行 open/fill/close 事件，同步返回接纳或丢弃且不抛出。宿主封装身份、计 trim、终结流。事件监听失败不改变执行；快照可查询，不承诺逐帧可靠送达。

TE-15 waitIndex 与进入等待同批确认；answer、截止与 stop 首胜。答复值不合法继续等待，判定器无法判定则按 schema_unsupported 解除并收失败。重复同值同来源 answer 可认回，旧 index 或异值不能解除当前等待；来源由受权入口证明。未知回执不能自行换 index 或恢复工具。

TE-16 工具恢复不重建调用栈；非终局等待按连续性丧失收场。观察者 release 使自己的未决读取明确 ownerStopped，不影响执行或其他观察者。原提供者退出使所有旧句柄不可继续使用，新 owner 就绪后凭持久 ref 重新 acquire。

TE-17 精确实现登记不得覆盖；撤除只关闭新采用，旧 lease 不重绑。实际资源失效须显式失败。每次 submit 一次执行，批次次序属于上层；runtime 仍负责逐会话同工具并发额度。

RS-1（core/tool-execution-runtime）结果引用只定位不授权。原文和附件字节先耐久再引用，未知写认回，同 itemKey 异内容拒绝。已存原文无默认过期，归档与 Run 结束不删除。

RS-2（core/tool-execution-runtime）readResult 只读已确认终局的原结果；after_action 仅改消息投影，不能改原文、终局或账。声明存储须能由装配中的读取工具读取，否则产出工具不可用。

TE-18（core/tool-execution-runtime；RC 同用）全局通知不得携带会话身份、调用引用、等待请求、结果、账或数量；这里只提供无参数唤醒。任何内容查询仍需当前受权绑定。低级日志／存储借用只交受信协调 owner，普通工具与用户不取得任意日志读写面。

RS-3（core/tool-execution-runtime）维护读取只接受独立 RecoveryAccess，并逐次验证当前维护 owner、显式 ref 及已确认终局的既有交付义务。readDeliveryBytes 只准读取该结果实际持有的原文／附件引用；不能从任意已知引用读取。它不授予普通查询或新写权，原用户撤权不阻断既有交付，输出不发给已撤权用户。

TE-19（core/tool-execution-runtime）after_action(each) 的 subject.result 仅在 completed 或 failed{business_failure,implementation_error,result_rejected} 时提供；其余终局及前台后台占位均缺席，不允许改写运行时产生的用法或中断说明。business_failure 是新增的正常作者返回失败，与其余作者结果同样可做消息投影。DeliveryBasis.result 必有只表示待交付投影存在，不表示该结果可交给 hook 改写。

TE-20（core/tool-execution-runtime）同一 tenant/session/callId 的执行接纳与拒绝处置互斥。submit 须从完整前缀确认本批 before_action 已完成且本调用没有正式拒绝（包括官方件缺席的全拒）；未完成回 admissionMissing，正式拒绝回 callConflict。免 token 仅免 allow 凭据，不免这一守卫；仅最终仍为 notExecutable 的项可走该路径。还须确认无 action_denial_intended/action_denied 或其他路由的首次返回，免 token 提交同受约束；有拒绝路由返回 callConflict。仅同路由同实际输入可认回。守卫与 execution_intended 使用同代同尾提交；尾冲突重读并重判，未知回执不换路线。


TE-21 工具日志的公开 codec 拥有 `tool-runtime/1` 载荷、稳定键及 shell 对应关系。进入判定前复制严格 JSON，不运行调用者的 getter。未知所属版本、键、读键、租户或原 Run/attempt 冲突均拒绝。固定 Schema 在构建时生成，首次判定才加载并使用原生模块缓存；日志解码不编译作者的参数或应答 Schema。

TE-22 `projectToolJournal` 只解释工具领域的有序事实，不替代完整会话前缀判定。意图先于启动；真实执行结果须有启动事实；终局首胜。等待序号逐次增加，应答只能解除当次等待；许可须引用已计划资源且先于终局。交付 ready 须引用已存在终局，确认须对应 ready 的原调用与 outcome；消息审查可以继续修改待交付投影，不能倒写 ready 或终局；物理停止观察可以晚于终局。跨领域采用、准入、消息和 late 的一致性由完整前缀消费者共同核对。检查通过不证明各记录曾在同一次物理追加中发布，该责任仍归写入者及故障验证。

TE-23 runtime 提供给工具的每次成功 context 读取，都先确认 `execution_context_read`，再返回该次实际值。readIndex 从 1 连续增加；同次采用的 key 不重复。采用记录只追加，不替换先前读值；终局之后不能新增采用。回执未知或存储不可用时不把值交给工具。采用记录不改变执行阶段，也不以缓存值冒充当前读取。


TE-24 管理启动仅借用原 RecoveryAccess，不把权限或关闭控制放入 JSON、工具能力、runtime context 或模型输入。创建原实例后、等待其 ready 前，提供者须把原 ToolRuntimeCloseControl 经 retainClose 交给受信宿主。retainClose 正常返回表示宿主已经持有该原控制，并持有到原责任完成。同一控制重复交付可认回；不同控制与原控制冲突时须同步抛出，不覆盖原控制，也不假报成功。宿主无法持有时须同步抛出。交付抛出使管理 ready 拒绝，不能继续发布业务 runtime；原已登记的提供者仍负责实际实例及关闭，不表示可丢弃。控制不替代租户／会话授权。

TE-25 原实例管理关闭开始前，closeAttempt 与 retryClose 都固定等待第一次原关闭尝试，不主动停止实例，也不因第一次失败再自动启动第二次。关闭已经开始时，closeAttempt 固定观察调用当时最近已发起的尝试；以后重试不改变该次观察。retryClose 在有在途尝试时加入该次，在最近尝试失败且没有在途尝试时发起一次同实例重试；并发请求合并为同一在途尝试。closed 后两个操作均认回 closed，且不再调用根 close。closed 只表示原实例 close 成功。原 close 拒绝返回 retained，不能推断业务或物理工作已静止；管理 OwnedWork.close 保持 pending，下层仍须保有。原 close 真正 pending 时也继续 pending，不以超时假完成。控制指向原纯闭包，Service 撤除不改变应用已持有控制的责任或寿命；不能创建 successor、重新执行作者或开放业务准入。

ToolRuntimeCloseAttempt 和 ToolRuntimeCloseControl 直接引用 assembly-lifecycle 纯根的共享类型，行为见该包的保有协议。此依赖只复用关闭控制定义，不要求工具纯根加载 Cordis、注入协调器或取得整代关闭权。工具的私有恢复权限和业务准入仍归本页。

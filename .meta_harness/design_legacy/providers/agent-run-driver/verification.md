# Run 驱动器提供者验证边界

来源固定为 `packages/agent/run-driver/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `f62acaa5049d3e18967e71344eff58798bc671f966e649f58e0f7ac42283a682`）。目标设计；没有目标 RunDriver host/plugin 源码，现有 agent loop 不能当作符合性证明。
本轮只验证来源可恢复、设计树可解析及契约映射；没有把旧 review、日志或文档状态提升成
新 v1 的实现证据。实现验收至少覆盖真实装载/撤除、准备后撤权、重复与冲突、取消/超时、
迟到结果、崩溃恢复、旧代句柄以及资源排空。

Round-2 另验：驱动器只消费 issued/closed、Step 与 M attempt 读面，不写 attempt 镜像；gate_restored+wait.released 同批；旧 epoch 提交拒绝且审计归 OB/DR；resume/reacquire 不重复 created。

新结构链另验：fold 拒绝同 epoch 第二条 closed；open epoch 的普通终态使用
completed/failed/cancelled/superseded，已关闭 epoch 的终态只认回原事实；崩溃接管 open epoch 使用
reacquired 后才发行新 epoch。Driver 只能请求/消费 Run owner preparation；resume/reacquire 必须发行 successor，
terminationIntent 拒绝，operation lookup 只认 committed 结果。`settled(unknown)` 不关闭 execution exposure。

恢复/发布场景须覆盖 Session root 成功但 Run root 失败时仍不可见；旧 generation ack 无效；已安装完整
baseline 后原 operation 可消费但原 blocked completion 不改，旧外部 attempt 不重复执行。

L/M 联合验收还需固定 `omneModelExecution` 的实际 registration/generation：M 缺席拒新 attempt，旧 attempt 的 inspect、费用及 unknown 仍由原 M owner 收口；`awaitQuiescent` 在无 prepare/监听但存在未移交后代或无法确认的 start 时必须 blocked，独立 owner 可追溯接管后才成功。RD-18 场景须观察 waiting Run 取入 text 与下个 Step 同批、Run/epoch 不新建，command/trigger 不进入此路径。

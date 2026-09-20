# Run 状态提供者验证边界

来源固定为 `packages/session/run/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `38126d213f825dd45d11a767d1c94724df891f6f80dc70b588671f5ccf42ac9f`）。目标设计，尚无 Run provider 源码；不得把文档接受或邻包 primitives 当成实现。
本轮只验证来源可恢复、设计树可解析及契约映射；没有把旧 review、日志或文档状态提升成
新 v1 的实现证据。实现验收至少覆盖真实装载/撤除、准备后撤权、重复与冲突、取消/超时、
迟到结果、崩溃恢复、旧代句柄以及资源排空。

Round-2 另验：封闭事件词表拒绝 lifecycle.settled/attempt.recorded/gate.returned/late_fact；首次 created+issued、Yield reacquire、interrupt resume、issued receipt lookup、stale epoch reject；execution exposure/derived barrier 不被 settled unknown 或恢复清空。

新结构链另验：每个 issued epoch 至多一条 closed；后继 issue 或 terminal 前必须关闭，普通
completed/failed/direct cancel/superseded 分别使用同名 reason；interrupt/force_stop 已关闭的 epoch 在后来
terminal 不重复关闭；崩溃接管或 resume 遇 open epoch 时先 `closed{reacquired}` 再 issued。验证 effect-free
prepare、CC submit owner guard、stale整批拒绝、consumer-authored Run fact mutation、Yield→SessionForceStop、
terminal↔control、force-stop↔reacquire/resume、operation receipt loss；terminationIntent 必须硬拒 successor。

DR/CC 协调验证还须固定首次 `created + epoch.issued + state.changed` 共享 revision=1，expectedRunRevision=1
接受、=3 冲突；跨流 prepare 顺序不影响 canonical envelope/eventId，prepare correlation 不能冒充最终事实身份。
恢复不能仅凭 Run fold 公布可用性，必须与 Session 等 required owner roots 在精确 watermark 同代安装，
并由新代 lookup 而非重发事实消解旧 blocked publication。
还须注入单 Run root 已 fold、Session/M 等任一 required root 未能共同安装的窗口：`omneRun` 的读面和提交面都不可暴露该局部根，修复后只在同 domain/watermark/generation 的联合发布点开放。

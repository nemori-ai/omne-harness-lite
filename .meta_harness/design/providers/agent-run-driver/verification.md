# Run 驱动器提供者验证边界

来源固定为 `packages/agent/run-driver/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `f62acaa5049d3e18967e71344eff58798bc671f966e649f58e0f7ac42283a682`）。目标设计；没有目标 RunDriver host/plugin 源码，现有 agent loop 不能当作符合性证明。
本轮只验证来源可恢复、设计树可解析及契约映射；没有把旧 review、日志或文档状态提升成
新 v1 的实现证据。实现验收至少覆盖真实装载/撤除、准备后撤权、重复与冲突、取消/超时、
迟到结果、崩溃恢复、旧代句柄以及资源排空。

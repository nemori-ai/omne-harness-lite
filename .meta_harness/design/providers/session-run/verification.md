# Run 状态提供者验证边界

来源固定为 `packages/session/run/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `38126d213f825dd45d11a767d1c94724df891f6f80dc70b588671f5ccf42ac9f`）。目标设计，尚无 Run provider 源码；不得把文档接受或邻包 primitives 当成实现。
本轮只验证来源可恢复、设计树可解析及契约映射；没有把旧 review、日志或文档状态提升成
新 v1 的实现证据。实现验收至少覆盖真实装载/撤除、准备后撤权、重复与冲突、取消/超时、
迟到结果、崩溃恢复、旧代句柄以及资源排空。

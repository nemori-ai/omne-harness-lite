# 工具状态提供者验证边界

来源固定为 `packages/tools/tools/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `315d8301babc15ddecc565aa93fa7386f75e3fc0c7e0cb4c991bd74e22b2cb0b`）。基础 tools fork 有 schema/definition 源码和测试；完整 ToolHost、调用状态、frames、links 与恢复许可尚未实现。
本轮只验证来源可恢复、设计树可解析及契约映射；没有把旧 review、日志或文档状态提升成
新 v1 的实现证据。实现验收至少覆盖真实装载/撤除、准备后撤权、重复与冲突、取消/超时、
迟到结果、崩溃恢复、旧代句柄以及资源排空。

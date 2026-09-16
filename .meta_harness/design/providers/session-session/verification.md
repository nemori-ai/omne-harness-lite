# Session 状态提供者验证边界

来源固定为 `packages/session/session/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `1660d823fa3e3419cd420ca9a92b33c3a4a357f06558735471763da89d3d6eeb`）。基础 Session fork 有实际源码和测试，但完整 queue/inbound/scheduler/links 仍是目标设计。
本轮只验证来源可恢复、设计树可解析及契约映射；没有把旧 review、日志或文档状态提升成
新 v1 的实现证据。实现验收至少覆盖真实装载/撤除、准备后撤权、重复与冲突、取消/超时、
迟到结果、崩溃恢复、旧代句柄以及资源排空。

# 人类决定提供者验证边界

来源固定为 `packages/governance/human-decisions/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `ab96a20a35d2b50a77afa82a112c0a0d88e025c12b1f22bb71eea4bf1d5c3dd8`）。目标接口尚未实现/编译；只保留接口、状态、门与撤除协议作为后续实现输入。
本轮只验证来源可恢复、设计树可解析及契约映射；没有把旧 review、日志或文档状态提升成
新 v1 的实现证据。实现验收至少覆盖真实装载/撤除、准备后撤权、重复与冲突、取消/超时、
迟到结果、崩溃恢复、旧代句柄以及资源排空。

当前来源只覆盖 `system_approval` 的 provider 协议；HD v1 中 question、
agent_approval、内建 `human` 工具的 start/requestStop/answer、受信程序化作答者
尚无完整目标 provider 映射，不能以旧 T0-H 或通用池测试冒充覆盖。未来验证须
区分 Session.owner 作答与合法 system grantor、同一请求在 Session/池两个入口
的唯一 outcome、`human` 调用与请求同批结算、confirm 下程序化 approve 拒绝。
旧 `core-journal/1`/`core-operation/1` 原件只作来源；目标记录版本/codec、坏前缀
拒绝与可写恢复须按 DR 的实际采用协议另验，不把旧格式测试算作本 baseline PASS。

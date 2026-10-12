# 通知协作设计候选

本页保存尚待技术采用的设计，不表示实现、产品接受或阶段承诺。完整必要行为见[notification/notification SPEC](../notification/SPEC.md)，产品范围见[产品正文](../../../.meta_harness/design/product/notifications/design.md)。

## 验证分工和未决

定义拥有者维护 INV-NO01–INV-NO18 及 V-NO01–V-NO18。提供者证明目标持久可取回、资格及外部副作用边界；通知协调证明可靠受理、同一请求及恢复；源方证明事件选择和整体终态；应用证明当前权限与如实呈现；装配证明依赖换代和资源释放。模拟或 Mermaid 不证明这些组合性质。Q-NO02–Q-NO04 隔离形状和机制，未扩大为全域行为待定。

## 本组工程分解与公开依赖

成员承接发送/查询、可靠保管、目标交付与原请求恢复。源业务提供内容、目标及实际事件，身份/授权提供发送和披露条件，目标提供者给出持久可取回证据，交付面依当前资格呈现。通知不依赖源内部数据库或源执行实现。 本组只具名一个文档成员，不创建额外服务、统一 SPEC 或源码依赖。具体公开形状及提供者尚待采用。

## 机制与流程导航

- [责任与公开消费](../../../docs/domains/notifications/architecture.md#责任与公开消费)。
- [身份和状态维度](../notification/docs/internals.md#身份和状态维度)。
- [受理、持久事实与交接](../notification/docs/internals.md#受理持久事实与交接)。
- [并发、取消和恢复](../notification/docs/internals.md#并发取消和恢复)。
- [可替换提供者与 Cordis 投影](../notification/docs/internals.md#可替换提供者与-cordis-投影)。
- [F-NO01 独立发送与可靠承接](../notification/docs/key-flows.md#f-no01-独立发送与可靠承接)。
- [F-NO02 当前权限下查询与取回](../notification/docs/key-flows.md#f-no02-当前权限下查询与取回)。
- [F-NO03 源事件与整体结算](../../../docs/domains/notifications/key-flows.md#f-no03-源事件与整体结算)。
- [F-NO04 未知核对与安全恢复](../notification/docs/key-flows.md#f-no04-未知核对与安全恢复)。
- [F-NO05 发送前取消与晚到结果](../../../docs/domains/notifications/key-flows.md#f-no05-发送前取消与晚到结果)。
- [F-NO06 配置换代、停止与交接](../notification/docs/key-flows.md#f-no06-配置换代停止与交接)。

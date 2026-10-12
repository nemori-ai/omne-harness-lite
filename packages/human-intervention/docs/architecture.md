# 人在回路协作设计候选

本页保存尚待技术采用的设计，不表示实现、产品接受或阶段承诺。完整必要行为见[human-intervention/human-intervention SPEC](../human-intervention/SPEC.md)，产品范围见[产品正文](../../../.meta_harness/design/product/human-intervention/design.md)。

## 技术采用与验证分工

Q-HI02–Q-HI05 分别承接公开数据/资格接口、一致提交、拓展恢复协议及提示/披露组合。独立领域接口不直接依赖 Cordis 业务含义；装配才沿已有 IC 守住唯一服务定义、公开纯入口、依赖和撤除责任。需不可信代码时消费正式安全和环境合同，不把普通插件当隔离。

HITL 验证关联、一次有效处理和披露；原 Tool/Run 验证批次、消费及控制；授权验证允许值/资格/效果；存储验证耐久与交接；环境验证实际限制；通知验证交付。共同 V-HI01–V-HI20 由真实组合运行，重点包括竞争、保存失败、响应丢失、撤权及换代。图示和导航检查不证明这些行为已实现。

## 本组工程分解与公开依赖

原 Tool/Run 提供请求与等待位置，身份/授权与设置提供当前资格及合法授权事实；交付面只呈现有权内容，正式通知承接实际形成的提示。HITL 不依赖消费者内部存储，也不接管原执行。 本组只具名一个文档成员，不创建额外服务、统一 SPEC 或源码依赖。具体公开形状及提供者尚待采用。

## 机制与流程导航

- [责任边界与事实拥有者](../../../docs/domains/human-intervention/architecture.md#责任边界与事实拥有者)。
- [身份、采用依据与状态](../human-intervention/docs/internals.md#身份采用依据与状态)。
- [创建、答复和继续的组合](../human-intervention/docs/internals.md#创建答复和继续的组合)。
- [并发、控制及资格变化](../human-intervention/docs/internals.md#并发控制及资格变化)。
- [恢复、撤除和资源责任](../human-intervention/docs/internals.md#恢复撤除和资源责任)。
- [F-HI01 问询和请示回原工具](../../../docs/domains/human-intervention/key-flows.md#f-hi01-问询和请示回原工具)。
- [F-HI02 系统准入及拓展轮次](../../../docs/domains/human-intervention/key-flows.md#f-hi02-系统准入及拓展轮次)。
- [F-HI03 两个入口竞争同一决定](../human-intervention/docs/key-flows.md#f-hi03-两个入口竞争同一决定)。
- [F-HI04 等待中消息与插队](../../../docs/domains/human-intervention/key-flows.md#f-hi04-等待中消息与插队)。
- [F-HI05 终局、归档与迟到](../../../docs/domains/human-intervention/key-flows.md#f-hi05-终局归档与迟到)。
- [F-HI06 恢复与拓展件换代](../../../docs/domains/human-intervention/key-flows.md#f-hi06-恢复与拓展件换代)。
- [F-HI07 呈现等待和交通知](../../../docs/domains/human-intervention/key-flows.md#f-hi07-呈现等待和交通知)。

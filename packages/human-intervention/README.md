# 人在回路能力组

本组已有workspace草稿成员，公开入口为空导出，没有运行服务。领域行为与协议候选不等于实现。正式目录不是接受依据。

## 责任与范围

本组承接[人在回路领域责任](../../docs/domains/human-intervention/README.md)中的具名能力。完整产品范围归[产品正文](../../.meta_harness/design/product/human-intervention/design.md)，具体行为归成员，外部协作仍由各原拥有者承担。

## 成员与依赖

| 文档目标 | 责任及状态 |
| --- | --- |
| [human-intervention](human-intervention/README.md) | 原候选具名成员；已有workspace草稿，尚无公开运行服务；[SPEC](human-intervention/SPEC.md)及[内部设计](human-intervention/docs/internals.md)尚待技术采用 |

本组为单成员目标组，成员拆分或新增适配不得仅从目录推定。独立消费从成员行为及未来公开定义开始；Cordis 消费另核对已采用集成约定，不以 runtime 对象充当数据契约。

## 关键协作

成员承接本域行为，各相邻事实仍由原业务、资格、存储及实际执行拥有者维护。工程分解与外部依赖见[组架构](docs/architecture.md)。精确机制见[成员内部设计](human-intervention/docs/internals.md)。原调用、提交、恢复和撤除按原身份衔接，不能因通知或 disposer 声称业务完成。

## 组合验证

完整验证义务见[成员 SPEC](human-intervention/SPEC.md#持续验证义务)。本组只有单成员目标，没有独立组内多成员协议；与相邻能力的组合仍需真实协调者验证，目录、源 SHA 和图语法不能代替实际隔离、同提交、故障与恢复证据。实施、公开形状和可复跑验证入口尚未建立。

## 维护

组维护者负责工程分解、成员导航、允许依赖与组合验证。具名人员及 provider 采用尚待确认。成员维护者负责行为、内部机制与消费者；变更须同步产品条件、相关事实拥有者及登记。新建真实包仍须遵循[成员文档规范](../../docs/member-documentation.md)，不能把文档迁移当作实施授权。

## 公共协议与验证入口

[公共协议](human-intervention/docs/protocol.md)、[函数与并发模型](human-intervention/docs/formal-model.md)、[权限组合](human-intervention/docs/permission-composition.md)及[可执行守护](human-intervention/verification/README.md)形成已于2026-11-06由用户验收的HJ0技术采用。模型通过不证明运行时已实现。

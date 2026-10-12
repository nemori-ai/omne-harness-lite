# 资产与规则能力组

本组只有目标成员文档，没有真实 workspace 成员、源码、package.json 或可调用运行入口。公开形状、提供者与技术采用仍待确认，正式落位不证明支持。

## 责任与范围

共同资产、设置和权限分别拥有自己的治理与求值。产品沿[资产正文](../../.meta_harness/design/product/assets-and-rules/design.md)，业务角色沿[领域责任](../../docs/domains/assets-and-rules/README.md)，工程关系见[组架构](docs/architecture.md)。各类别继续拥有专有内容和完整业务，不因共同接入获得专有实现支持。

## 成员与依赖

| 目标成员 | 入口及行为 |
| --- | --- |
| assets | [入口](assets/README.md)、[SPEC](assets/SPEC.md)；定义、版本、持有、来源及长期流转 |
| settings | [入口](settings/README.md)、[SPEC](settings/SPEC.md)；声明、配值及有效设置 |
| permissions | [入口](permissions/README.md)、[SPEC](permissions/SPEC.md)；权限配值、允许上界及合法挑选 |

settings、permissions 消费 assets 持有、来源及类别形状，assets 候选消费 permissions 使用资格。该事实协作不授予私有提供者互相导入或统一存储。identity 提供可信身份，assembly 协调选入与清单，各成员通过公开输入和明确协调协议交接。

## 关键协作

[组流程](docs/key-flows.md)维护工作区读取、三个成员求值与组合展开的逻辑交接。[assets 机制](assets/docs/internals.md)持定义、候选及流转流程，[settings](settings/docs/internals.md)持设置机制，[permissions](permissions/docs/internals.md)持权限及准入依据机制。跨域恢复与执行效果见[领域流程](../../docs/domains/assets-and-rules/key-flows.md)。独立调用消费明确数据和契约，系统提供者按 IC 约定装配，不传活体 Context 代替数据。

## 组合验证

成员与实际协调者验证持有和配值共同有效、三类不同求值、来源竞争、秘密不迁移、替换不逃权限界、完整清单采用与历史输入不改。阶段内须验证公共操作及实际来源，未选流转的邀约、复制和提升验证在对应能力开展时展开。可复跑资源随真实成员或协调者，尚无本次运行证据。[机制缺项](assets/docs/internals.md#asset-m01-完成与来源协议)不能靠图完整消除。

## 维护

成员维护者同步行为、内部设计、消费者及验证，组维护者同步依赖和协作。具名维护人未确定；真实成员建立前核对[成员规范](../../docs/member-documentation.md)、已接受承诺与模板支持。九项阶段支持只按产品原表，未选能力不能关闭适用隔离、权限、耐久与真实性。组根不设统一 SPEC。

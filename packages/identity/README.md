# 身份与授权能力组

本组维护身份与授权的工程分解。`scrypt` 是已创建的 workspace 成员，提供有界口令派生与校验。identity 与 authorization 已有首批公开形状：两种主体的签发与核验、具名资格、准入裁定、许可引用与消费事实；登录、账号、成员关系与持久台账的提供者仍待设计。本组操作规格的正式落位不表示那些规格已经技术接受。

合法身份与时间点的已采用纯值归[共同纯表示](../common/README.md)。identity 消费这些纯值，并拥有存在、成员关系和登录事实。authorization 拥有授权决定。`legal-identity` 另发布行事作用域 `ActingScope` 与契约成员共用的 `Access<P>`。

## 责任与范围

[领域责任](../../docs/domains/identity-and-authorization/README.md)拥有业务分工，[产品](../../.meta_harness/design/product/identity-and-authorization/design.md)拥有规则和阶段。[组架构](docs/architecture.md)维护成员关系与共同完成交接，不设合并 SPEC。

## 成员与依赖

| 目标成员 | 责任与入口 |
| --- | --- |
| identity | [入口](identity/README.md)；主体、治理、认证、登录及当前租户的 [SPEC](identity/SPEC.md)。首批公开形状见 ID-16 |
| authorization | [入口](authorization/README.md)；表达、范围、准入、撤回与消费的 [SPEC](authorization/SPEC.md)。首批公开形状见 AU-11 |
| scrypt | [入口](scrypt/README_ZH.md)；有界派生、校验与关闭的 [SPEC](scrypt/SPEC.md) |

identity 依赖 `legal-identity` 与 `operation-result`，不依赖 Session、HITL、工具或模型业务生命周期。authorization 依赖 identity，消费合法权限及原操作公开事实，不访问其私有实现。共享定义只由实际公开契约维护。

## 关键协作

[组协作](docs/key-flows.md)维护可信身份到动作准入的交接；成员精确流程分别在 [identity](identity/docs/internals.md) 和 [authorization](authorization/docs/internals.md)。跨域撤回与读取见[领域流程](../../docs/domains/identity-and-authorization/key-flows.md)。两个成员独立消费同一行为契约，Cordis 提供者按 IC 约定管理装配与退出责任。

## 组合验证

identity 与 authorization 维护各自 SPEC 的验证义务，实际原操作承担消费与资源提交一致性，接入承担来源核验。两成员的契约测试用进程内权威、内存成员表与内存台账证明首批形状够用：撤权后再核拒绝、不可用不放行、许可消费后不再放行，以及四个消费端口的适配。共同身份创建、关系竞争及恢复由组维护者联同成员验证。持久存储、登录流程与性能尺度尚缺，T01 至 T06 见[后续义务](docs/architecture.md#后续技术义务)，图和候选通过不表示真实组合通过。

## 维护

成员维护者修改公开行为、机制及验证；组维护者同步依赖、导航及共同交接。具名维护人尚未确定，不授予实施。创建真实成员前按[成员规范](../../docs/member-documentation.md)核对接受、消费者和模板支持。0.0.0 -> 0.1.0 的 CAP-ID01 至 12 完整支持与 CAP-ID13 至 15 仅创建保持，不从本组摘要缩减。

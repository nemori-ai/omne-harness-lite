# 会话与工作能力组

本组只有 session 目标文档，没有真实 workspace 成员、package.json、源码或可运行入口。正式维护位置不授予技术接受或实现支持，公开形状仍待形成。

## 责任与范围

本组承接 Session、Run、attempt、受理、推进资格、消费、模式与模型选择、归档及恢复的工程责任。[产品](../../.meta_harness/design/product/sessions-and-work/design.md)拥有规则和全部十七项阶段承诺，[领域责任](../../docs/domains/sessions-and-work/README.md)拥有跨域分工，[组架构](docs/architecture.md)维护邻接关系。

## 成员与依赖

[session 入口](session/README.md)定位完整 [SPEC](session/SPEC.md)和[内部设计](session/docs/internals.md)。单成员不自动成为一组运行实例；提交存储是其提供者边界，不仅因存储机制新增业务成员。Agent、Model、Tool、HITL、Context、assembly、身份与设置通过公开契约参与，各自事实和生命周期保持原拥有者。

## 关键协作

[成员流程](session/docs/key-flows.md)持九组精确治理与交接路径。[事件目录](session/docs/session-log-events.md)持完整原生事实语义，[状态转移](session/docs/session-state-transitions.md)持守卫与纯批次归约，[内部设计](session/docs/internals.md#session-log-的事件模型)持数据结构、共同提交、分页和恢复。组不复制成员算法或第二份状态机。独立消费需明确输入与资格，Cordis 提供者按 IC 约定装配，Context 不成为持久契约。

## 组合验证

session 与实际邻接协调者验证可靠受理、唯一推进、调用围栏、两条合法消费确认路径、当前资格、控制传播、级联和在途耐久。行为义务见 SPEC，持续资源须由实际成员或协调者形成。暂无本次运行证据，[SW-M01](session/docs/internals.md#sw-m01-技术兑现义务)保留精确公开格式、提供者、协议及规模缺项；伪代码与文件存在不证明十七项已支持。

## 维护

session 维护者同步行为、状态解释、机制、消费者和验证，组维护者同步邻接与组合责任。具名维护人未确定，新成员须有独立已接受责任及真实消费者。创建真实包前核对[成员规范](../../docs/member-documentation.md)和模板，组根不设统一 SPEC。产品与阶段变化由产品拥有者决定，缺技术不缩减已定承诺。

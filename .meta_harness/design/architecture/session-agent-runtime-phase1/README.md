# Session 与 Agent Runtime 第一期架构设计

版本1，2026-10-06。状态：候选，待限定接受；不是实现状态。方向授权与产品规则已明确，新增技术承诺仍由评审和接受入口接续。

| 阅读问题 | 正文拥有者 |
|---|---|
| 责任、包边界与迁移 | [边界](boundaries.md) |
| 同提交、受理、attempt、原调用、取消与恢复 | [持久动作链](durability.md) |
| 模型消息派生、前缀缓存、复杂度和Run进度 | [投影组合](projections.md) |
| Cordis接缝、会话装配、换代与事件 | [集成](cordis.md) |
| 验证义务、探针范围、未来协议 | [验证](verification.md) |
| 当前候选接口与共用规则 | [候选承诺](contracts/README.md) |

规则源：PF-012 rev24、PF-010 rev8、PF-014 rev13、PF-015 rev21及其正文中的限定采用范围；现行统一语言／对象清单；[系统约束](../../foundation/cross-system-constraints/requirements.md)；[架构维护](../README.md)；[IC](../../realization/cordis-integration-conventions.md)。
存储、模型／工具、拓展runner、runtime context的未迁承诺按其真实入口继续有效；本设计不靠删除历史材料改变接受状态。

本设计覆盖第一期15卡需要的完整责任链；近期实现切片是ST-015-01。第二期协作、消息转换、连接件和运行中其他业务命令只留接缝与明确排除，不定义未知产品政策。
核心能力公开函数可独立取用，runtime只是一种消费者。复用Cordis官方4.0.4，不复用DSH agent原语。

候选模块在本专题 contracts 中存放一次，明确为待接受设计，不能作为已接受公开接口消费。进入实际实现后将其采用正文移动到真实成员的公开类型／SPEC及必要验证槽，同时逐项切换消费者，不建立空包或兼容双轨。

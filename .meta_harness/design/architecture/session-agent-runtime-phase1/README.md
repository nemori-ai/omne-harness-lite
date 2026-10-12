# Session 与 Agent Runtime 第一期架构设计

版本1。第一期完整协调与装配设计仍为候选；负责人已授权实施F0限定地基。F0公开日志、消息投影、纯Loop和协调接口的当前承诺由对应成员维护，实际实现仍须完成交付验收；该授权不表示完整Session提供者、十五张故事卡或本设计其余部分已接受或交付。

| 阅读问题 | 正文拥有者 |
|---|---|
| 责任、包边界与迁移 | [边界](boundaries.md) |
| 同提交、受理、attempt、原调用、取消与恢复 | [持久动作链](durability.md) |
| 模型消息派生、前缀缓存、复杂度和Run进度 | [投影组合](projections.md) |
| Cordis接缝、会话装配、换代与事件 | [集成](cordis.md) |
| 验证义务、探针范围、未来协议 | [验证](verification.md) |
| 当前协调接口与共用规则 | `packages/core/session-runtime/README.md`（F0真实workspace成员；完整提供者留C01） |

规则源：PF-012 rev24、PF-010 rev8、PF-014 rev13、PF-015 rev21及其正文中的限定采用范围；现行统一语言／对象清单；[系统约束](../../../../docs/requirements.md)；[架构维护](../README.md)；[IC](../../../../docs/architecture/cordis-integration-conventions.md)。
存储、模型／工具、拓展runner、runtime context的未迁承诺按其真实入口继续有效；本设计不靠删除历史材料改变接受状态。

本设计覆盖第一期15卡需要的完整责任链；近期实现切片是ST-015-01。第二期协作、消息转换、连接件和运行中其他业务命令只留接缝与明确排除，不定义未知产品政策。
核心能力公开函数可独立取用，runtime只是一种消费者。复用Cordis官方4.0.4，不复用DSH agent原语。

F0成员按负责人授权已从设计槽建立为真实workspace成员。完整Session提供者尚未建立；其设计接缝与相称验证义务随core/session-runtime保存，不创建缺manifest的提供者目录。未获授权部分保持候选。消费者须逐项迁移并验证，不建立兼容双轨。过程记录只留本工作树tmp。

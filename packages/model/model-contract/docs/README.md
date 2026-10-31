# Model 领域契约文档职责

[SPEC](../SPEC.md)拥有非类型行为，[public-api](public-api.md)维护精确声明，并由一致检查与源码逐名对照。源码导出、设计接受与验证是不同事实。

新增[结果推送与保存](../SPEC.md#结果推送与保存)及[公共内容观察与当前目标](../SPEC.md#公共内容观察与当前目标)已采用，尚未成为可调用的接收、观察或 current 能力。[交付边界](../SPEC.md#推送与公共观察的交付边界)区分纯值、身份依赖声明与真实提供者迁移。公开页继续只导航实际声明。

- [包边界与依赖](architecture.md)。
- [协作流程](flows.md)。
- [对象职责](object-model.md)。
- [公开声明](public-api.md)。
- [消费者与使用](context.md)。
- [Cordis 定义与集成](cordis.md)。

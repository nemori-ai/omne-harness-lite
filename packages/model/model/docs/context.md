# Model 实现的消费与构造

本包面向选择默认领域算法的独立程序及运行宿主，当前源码为空。普通调用者消费 [model-contract](../../model-contract/docs/context.md) 并取得注入的操作能力，不必安装本实现。

独立程序以固定请求、显式传输和 signal 调用 executeModel。宿主将 Commands、发送围栏、重试策略、实例宿主和时钟注入 createModelRuntime，并显式传入配置。精确构造形状归 [public-api](public-api.md)，独立执行及配置行为归 [SPEC](../SPEC.md)。

本实现不自动安装全部厂商、tokenizer 或 Cordis。应用选择所需适配器并拥有资源；单机框架装配设计暂见 [cordis](cordis.md)，目标 model-host-local 尚未初始化。

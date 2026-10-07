# 插件装载效应与清理责任的来源核对

本页记录官方机制事实及其与组件责任的区别，不声称已验证所有插件。

## 官方来源与观察

2026-09-14 核对 DeepSeek 官方仓库修订
`c291e7961a515f6d7af9304e7fd1d257929aef26`：

- [Fiber 文档](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/fiber.md)
  说明一个 Fiber 对应一次插件应用；`ctx.effect()` 登记效应及 disposer，显式清理
  或 Fiber 卸载会触发这些清理。其文档描述反向调用及异步等待，并说明返回的
  disposer 重复调用不再次执行同一清理。
- [Context 文档](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/context.md)
  说明服务注册属于当前 Fiber，提供的 disposer 或卸载会撤除该注册。
- [Primer](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-primer.md)
  将受管注册和清理作为插件作者需要掌握的基本原则。

这里限定于固定源码修订的文档；不能以文档身份代替项目实际采用发行物的验证。
异步清理顺序和异常处理须按实际机制核对，不能由“逆序调用”推断所有异步清理依次完成。

## 项目设计上的推论与范围

据此，应把装载建立的贡献、注册和资源与其撤除责任共同设计，并说明部分装载
失败、在途使用、清理失败和重装后的可观察结果。这是本项目的设计要求，不是
宣称框架自动替任意插件生成正确逆操作。

局部逆操作应撤除本次实例拥有的贡献，并保持其它合法贡献；恢复整个系统的旧
快照会抹掉期间发生的独立变化，不能作为通用卸载策略。持久事实、独立工作和
外部发送是否可撤销，要由业务契约与所有权决定；释放连接或撤除入口不等于撤销
它们已经产生的效果。具体指导归 handbook 的[生命周期正文](../../skills/harness-design-handbook/canonical/references/architecture/runtime/lifecycle.md)。

文档事实不验证产品装卸、泄漏检测、外部补偿或并发行为，
不将理论可逆性、框架清理机制和真实业务恢复混为一种证据。

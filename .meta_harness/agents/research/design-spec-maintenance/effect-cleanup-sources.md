# 插件装载效应与清理责任的来源核对

用户在本轮维护任务中补充：插件设计应系统性考量装载/卸载的效用与逆效用。本页
记录官方机制依据及其与项目设计义务的区别，不声称已验证所有插件。

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

这里核对的是固定源码修订的文档。项目当前包声明使用官方 Cordis 4.0.2；本次
没有运行该发行物的新增实验，也不以源码文档身份代替实际包验证。已有
[映射说明](../../architecture-guide/reference/cordis-mapping.md#必须补足的契约)
还指出异步清理顺序和异常处理需要按实际机制核对，不能由“逆序调用”推断所有
异步清理依次完成。

## 项目设计上的推论与范围

据此，应把装载建立的贡献、注册和资源与其撤除责任共同设计，并说明部分装载
失败、在途使用、清理失败和重装后的可观察结果。这是本项目的设计要求，不是
宣称框架自动替任意插件生成正确逆操作。

局部逆操作应撤除本次实例拥有的贡献，并保持其它合法贡献；恢复整个系统的旧
快照会抹掉期间发生的独立变化，不能作为通用卸载策略。持久事实、独立工作和
外部发送是否可撤销，要由业务契约与所有权决定；释放连接或撤除入口不等于撤销
它们已经产生的效果。具体指导进入[生命周期正文](../../architecture-guide/runtime/lifecycle.md)。

本次仅核对文档并形成维护指导；未执行产品装卸、泄漏检测、外部补偿或并发测试，
不将理论可逆性、框架清理机制和真实业务恢复混为一种证据。

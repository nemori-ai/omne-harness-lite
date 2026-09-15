# Cordis 生命周期与工具组合来源核对

日期：2026-09-13。范围：用户要求重新从 Cordis 的依赖、效用和逆效用撤回理解
工具系统，补充原 DSH 复用评估。本记录是来源事实，候选应用见
[工具架构](../proposals/tool-system/README.md)，不接受具体架构或依赖版本。

检查版本：DeepSeek 官方 `deepseek-harness` 提交
`c291e7961a515f6d7af9304e7fd1d257929aef26`。读取官方文档并核对该提交本地
源码快照；本轮没有执行 Cordis 测试或运行探针。部分 raw 文档在线读取失败时
使用前期已核对的同提交快照，不用其它版本补齐语义。

## 文档契约与源码观察

| 结论 | 证据与边界 |
|---|---|
| 必需服务依赖持续追踪；消失时消费者卸载，恢复时重新加载 | [Services 教程](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/03-services.md)。不是一次性启动排序；显式永久 dispose 的消费者不因此复活 |
| 插件实例拥有受管 effect；事件监听、子插件及服务注册可随其卸载撤回 | [Lifecycle 教程](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md)。自行取得的定时器/连接等也须登记清理，不自动追踪任意逃逸任务 |
| effect 的返回 disposer 可主动结束该效用，或由拥有者卸载触发；重复调用不重复执行清理 | [Fiber API](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/fiber.md)。拥有者是运行实例，不是数据定义或业务对象 ID |
| required service 的提供者变化驱动消费者代次转换，loaded store 保存当次依赖 | [fiber.ts 的 `_refresh/_reload/_unload`](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L597)；[reflect.ts 的 provide/notify](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/reflect.ts#L277)。这是服务实现依赖，未定义工具条目或 skill 内容之间的产品关系 |
| 清理有等待语义，但多个顶层异步清理可以并发；失败不会自动变成完整业务失败回执 | [Lifecycle 教程](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md)与 [fiber.ts](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L675)。源码的 `_unload` 汇合并记录异常；业务顺序与成功判据仍需显式表达 |
| effect 建立过程也受所有者纳管，源码处理初始化与卸载重入 | [fiber.ts effect](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L418)。应用自行建立资源后才登记清理，仍可能越过该保护 |
| DSH 工具与提示词注册已经采用受管贡献，且两类贡献各自存在 | [Into the harness](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/07-into-the-harness.md)与 [system-prompt](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/system-prompt/README.md)。限制工具不自动删除独立静态提示词，关联指引需由提供者显式求值或撤回 |
| 条目注册可绑定调用者作用域及其清理身份 | [ScopedLayers.effect](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/scope/src/store.ts#L218)。删除自己的一项贡献不等于恢复整个注册表的旧快照，作用域可见性也不等于租户授权 |

## 对本次设计的约束与推论

需要将能力的静态定义、激活实例、受管贡献和实际调用区分。tool–skill 依赖
必须影响相关组合的激活、失效与效用撤回；skill 可见内容只是其中一种贡献。
其它依赖如工具到执行器、提示词到变量提供者、调用到资源，也要定义相应响应。
这是本项目的设计推论，不声称 Cordis 自带同名产品协议。

逆效用只能撤回它拥有的受控贡献；撤掉 Schema、提示词、路径挂载和监听器，
不等于擦除已保存定义、撤回发出的模型请求或逆转外部动作。共享贡献需要逐
所有者释放，依赖者不能把共享提供者当作自己的子实例随意销毁。

若后台工作必须跨会话实例销毁继续，其实际执行资源不能是那个会话 Fiber 的
普通子效果。若旧调用必须排空，其依赖提供者也不能先被一次普通 HMR 卸掉。
这些要求需要调整真实所有权和装配结构，不能只在数据层保留引用或增加状态字段。

Cordis 官方包的实际采用版本仍待固定，需核对以上观察与其发布产物一致；本
记录的源码提交不等于已经采用的包版本。未运行验证的部分不作实现保证。

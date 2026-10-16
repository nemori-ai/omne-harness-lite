# Tool 源码

本目录拥有本成员的公开类型、运行时校验和内部实现。

- [index.ts](index.ts) 是根入口 `.`。它导出资产正文端口 `toolBodyContract`（实现在 [contract.ts](contract.ts)）、全部公开类型、品牌身份解码函数、默认结果政策和契约函数。
- 公开类型按主题分模块：[identity.ts](identity.ts)、[definitions.ts](definitions.ts)、[results.ts](results.ts)、[operations.ts](operations.ts)、[author-context.ts](author-context.ts)、[execution.ts](execution.ts)、[ports.ts](ports.ts)、[authoring.ts](authoring.ts)、[records.ts](records.ts)、[custody.ts](custody.ts)、[program.ts](program.ts)。每个模块的职责见 [public-api](../docs/public-api.md)。
- [result-policy.ts](result-policy.ts) 给出默认结果政策的规则集、采用和判定。[adoption.ts](adoption.ts) 按规则集计算可复算的采用摘要，不从根入口导出。
- 契约函数按领域知识分模块：[judge-definition.ts](judge-definition.ts) 判定定义，[judge-state.ts](judge-state.ts) 判定状态，[catalog.ts](catalog.ts) 给出呈现与可用性，[registration.ts](registration.ts) 构造操作与作者注册，[wait-contract.ts](wait-contract.ts) 固定等待协议，[parameter-codec.ts](parameter-codec.ts) 给出默认参数 codec，[result-rendering.ts](result-rendering.ts) 渲染作者返回，[result-projection.ts](result-projection.ts) 投影模型消息块。
- 内部模块不从根入口导出。[shape.ts](shape.ts) 是封闭形状检查的组合件，只读自身数据属性并返回冻结副本。[json-tree.ts](json-tree.ts) 检查 json-text 树并计算其 JSON 文本字节数。[value-shapes.ts](value-shapes.ts) 给出采用、证据、消费位置、schema 身份和内容引用的共用形状。内容引用的规则取自 `@omne-harness/content-block`，本成员不另存一份。
- 操作句柄和作者注册把作者能力放在模块私有 symbol 下。`readToolOperation` 和 `readToolRegistration` 读取它们，只在本成员内部使用，不从根入口导出。
- [cordis.ts](cordis.ts) 是 `./cordis` 入口。它导出 18 个服务定义类、取自各类 `static provide` 的服务键、`Context` 增补和 `tool/call-changed` 事件增补。`ToolInstancesService` 是具体注册表服务，登记与查询在实现前返回具名失败。
- 根入口不导入 `@deepseek-ai/cordis`，也不导入 `cordis.ts`。`cordis.ts` 不导入提供者成员。

独立执行函数和 runtime 尚未实现。后续实现须依据 [SPEC](../SPEC.md) 的已接受范围和 [public-api](../docs/public-api.md) 中尚未实现的函数签名，不能按源码便利改变承诺。文档导航见 [index](index.md)。

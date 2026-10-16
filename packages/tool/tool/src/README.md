# Tool 源码

本目录拥有本成员的公开类型、运行时校验和内部实现。

- [index.ts](index.ts) 是根入口 `.`。它导出资产正文端口 `toolBodyContract`（实现在 [contract.ts](contract.ts)）、全部公开类型、品牌身份解码函数和默认结果政策的身份。
- 公开类型按主题分模块：[identity.ts](identity.ts)、[definitions.ts](definitions.ts)、[results.ts](results.ts)、[operations.ts](operations.ts)、[author-context.ts](author-context.ts)、[execution.ts](execution.ts)、[ports.ts](ports.ts)、[authoring.ts](authoring.ts)、[records.ts](records.ts)、[custody.ts](custody.ts)、[program.ts](program.ts)。每个模块的职责见 [public-api](../docs/public-api.md)。
- [result-policy.ts](result-policy.ts) 给出默认结果政策的规则集与采用。[adoption.ts](adoption.ts) 按规则集计算可复算的采用摘要，不从根入口导出。
- [cordis.ts](cordis.ts) 是 `./cordis` 入口。它导出 18 个服务定义类、取自各类 `static provide` 的服务键、`Context` 增补和 `tool/call-changed` 事件增补。`ToolInstancesService` 是具体注册表服务，登记与查询在实现前返回具名失败。
- 根入口不导入 `@deepseek-ai/cordis`，也不导入 `cordis.ts`。`cordis.ts` 不导入提供者成员。

运行函数和 runtime 尚未实现。后续实现须依据 [SPEC](../SPEC.md) 的已接受范围和 [public-api](../docs/public-api.md) 中尚未实现的函数签名，不能按源码便利改变承诺。文档导航见 [index](index.md)。

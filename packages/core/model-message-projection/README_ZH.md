# @omne-harness-lite/model-message-projection

[English](README.md)

从会话日志的固定已提交前缀计算模型可读消息视图，并提供有界增量缓存。

用 `projectMessages` 与 `materializeMessages` 计算固定视图。创建缓存必须显式给出容量和全部当前外部来源键。不可变段共享未变化前缀；事实事件不成为模型消息。

用 `createModalityProjection` 为固定租户与Session计算模型选择所需的历史模态集合。输入是ModelRuntime实际拥有的完整前缀。压缩不移除历史模态要求，同尾部查询复用结果；取得完整前缀的成本单独计算。

公开类型与函数由本包维护。[薄规格](SPEC.md)约束类型表达不出的行为。[公共入口测试](tests/projection.spec.ts)提供可运行示例。实现完成、交付评审与接受分别核定。

按[开发指南](../../../docs/development.md)准备环境，先构建依赖。

```sh
pnpm --filter @omne-harness-lite/model-message-projection run build
pnpm --filter @omne-harness-lite/model-message-projection run typecheck
pnpm --filter @omne-harness-lite/model-message-projection run test
```

PACKAGE_TEMPLATE_DRAFT

本成员导出 `toolBodyContract`，作为已接受的资产类别端口。执行、等待和结果保管仍按本页其余章节，那些行为尚未在这个入口实现。

# tool 文档目标

本成员的协作契约已技术接受，精确范围见 [SPEC](SPEC.md)。其余候选、生产实现及运行验证的状态分别保留。

## 责任与使用

本成员沿[SPEC](SPEC.md)承担完整行为。独立消费通过未来公开入口及显式依赖，不要求启动Cordis；系统集成通过同包Cordis适配满足共同IC、合法身份及业务交接。公开形状、导出、安装闭包、配置、资源限额和提供者尚待设计，不虚构命令。

## 契约与设计

- [行为入口](SPEC.md)与原专题共同保持完整承诺。
- [内部设计](docs/internals.md)解释机制、依赖与未决。
- [原具名专题 definition-and-invocation.md](docs/definition-and-invocation.md)保持唯一行为正文。
- [原具名专题 wait-control-and-recovery.md](docs/wait-control-and-recovery.md)保持唯一行为正文。
- [原具名专题 results-and-retention.md](docs/results-and-retention.md)保持唯一行为正文。

## 验证与维护

SPEC及专题维护持续验证义务；实际测试、模型、提供者和装配证据尚缺。修改时同步公开消费者和组导航；未决按[产品第四块](../../../.meta_harness/design/product/tool-execution/design.md#未决问题与待定事项)及技术拥有者闭合。
默认测试责任是单元和契约。命令是 `pnpm --filter @omne-harness/tool test`。`tests/public-entry.spec.ts` 核对公开导出。集成测试和端到端测试不适用：本卡只交付正文端口，不交付存储或执行旅程。

## #342 主干运行契约候选

[操作与必要协议](docs/runtime-contract.md)、[消费及失败场景](docs/runtime-examples.md)、[Cordis集成设计](docs/runtime-integration.md)共同构成待技术接受的主干候选。签名尚未成为生产导出，当前已接受范围仍以上文状态为准。共同对象、装配与后继验证从[运行架构入口](../../../docs/architecture/runtime/README.md#342-主干契约候选)展开。

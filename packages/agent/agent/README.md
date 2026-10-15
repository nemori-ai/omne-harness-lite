PACKAGE_TEMPLATE_DRAFT

本成员导出 `judgeAgentDefinition` 与 `judgeLoopExtensions`。二者判断声明数据。导入它们不启动 runtime，也不加载可执行扩展。`definition.md` 的其余候选仍然待接受。

# agent 文档目标

本成员的协作契约已技术接受，精确范围见 [SPEC](SPEC.md)。其余候选、生产实现及运行验证的状态分别保留。

## 责任与使用

调用方从包入口调用 `judgeAgentDefinition` 或 `judgeLoopExtensions`。成功结果带声明数据。`judgeLoopExtensions` 按提交顺序返回，一项非法则整批拒绝并带 `index`。拒绝结果的 `reason` 是 `malformed`、`duplicate-capability`、`unknown-attribute`、`unknown-position`、`unknown-power`、`dimension-missing`、`dimension-not-allowed`、`power-above-ceiling`、`executable` 或 `checker-failed`。一批扩展被拒绝时还有 `index`。容器本身不合法时 `index` 为 0。某一项不合法时 `index` 是该项序号。

这些限额作用于一次判断的整份输入，也作用于一批扩展的整份输入。深度不超过 20。单个对象成员不超过 80。JSON 值个数不超过 200，容器计入，键不计入，第 201 个值拒绝。字符串不超过 10000。数字的 JSON 文本不超过 100。字节数是这一次判断的整份 JSON 文本的 UTF-8 长度，不超过 100000。超过限额得到 `malformed`。一批扩展因整份文本超过限额被拒绝时，`index` 为 0。不把校验器故障说成坏输入。

成功的 attribute 只保留 `item`。公开入口是 `judgeAgentDefinition` 与 `judgeLoopExtensions`。本包依赖 `@omne-harness/schema-provider` 做静态校验，不依赖装配包或资产包。一次 `judgeLoopExtensions` 调用共用一个执行域，同一静态 Schema 不逐项重建。测试命令是本目录的 `pnpm test`。

## 契约与设计

- [行为入口](SPEC.md)与原专题共同保持完整承诺。
- [内部设计](docs/internals.md)解释机制、依赖与未决。
- [原具名专题 extensions.md](extensions.md)保持唯一行为正文。
- [原具名专题 definition.md](definition.md)保持唯一行为正文。
- [原具名专题 loop.md](loop.md)保持唯一行为正文。

## 验证与维护

`tests/public-entry.spec.ts` 从包入口调用判断函数，覆盖合法声明、拒绝和依赖闭包。集成测试和端到端测试不适用。本包没有存储、应用服务或关键用户旅程。

## #342 主干运行契约候选

[操作与必要协议](docs/runtime-contract.md)、[消费及失败场景](docs/runtime-examples.md)、[Cordis集成设计](docs/runtime-integration.md)共同构成待技术接受的主干候选。签名尚未成为生产导出，当前已接受范围仍以上文状态为准。共同对象、装配与后继验证从[运行架构入口](../../../docs/architecture/runtime/README.md#342-主干契约候选)展开。

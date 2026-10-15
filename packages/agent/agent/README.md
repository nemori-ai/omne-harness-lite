PACKAGE_TEMPLATE_DRAFT

本成员导出 `judgeAgentDefinition` 与 `judgeLoopExtensions`。二者判断声明数据。导入它们不启动 runtime，也不加载可执行扩展。`definition.md` 的其余候选仍然待接受。

# agent 文档目标

本成员的协作契约已技术接受，精确范围见 [SPEC](SPEC.md)。其余候选、生产实现及运行验证的状态分别保留。

## 责任与使用

调用方从包入口调用 `judgeAgentDefinition` 或 `judgeLoopExtensions`。成功结果带声明数据。`judgeLoopExtensions` 按提交顺序返回，一项非法则整批拒绝并带 `index`。拒绝结果的 `reason` 是 `malformed`、`duplicate-capability`、`unknown-attribute`、`unknown-position`、`unknown-power`、`dimension-missing`、`dimension-not-allowed`、`power-above-ceiling`、`executable` 或 `checker-failed`。成功的 attribute 只保留 `item`。公开入口是 `judgeAgentDefinition` 与 `judgeLoopExtensions`。本包依赖 `@omne-harness/schema-provider` 做静态校验，不依赖装配包或资产包。测试命令是本目录的 `pnpm test`。

## 契约与设计

- [行为入口](SPEC.md)与原专题共同保持完整承诺。
- [内部设计](docs/internals.md)解释机制、依赖与未决。
- [原具名专题 extensions.md](extensions.md)保持唯一行为正文。
- [原具名专题 definition.md](definition.md)保持唯一行为正文。
- [原具名专题 loop.md](loop.md)保持唯一行为正文。

## 验证与维护

`tests/public-entry.spec.ts` 从包入口调用判断函数，覆盖合法声明、拒绝和依赖闭包。集成测试和端到端测试不适用。本包没有存储、应用服务或关键用户旅程。

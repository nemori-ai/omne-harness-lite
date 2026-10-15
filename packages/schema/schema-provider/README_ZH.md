# @omne-harness/schema-provider

[English](README.md)

本包校验一份 `JsonRead`，并在本执行域内缓存编译结果。公开类型在 `src/index.ts`。类型不能表达的行为在 [SPEC.md](SPEC.md)。内部模块在 [docs/architecture.md](docs/architecture.md)。

根入口导出公开函数。检查逻辑尚未兑现 [SPEC.md](SPEC.md) 的条款。

## 职责与状态

本包是 Schema 提供者。范围见[技术基础](../../../docs/architecture/technical-foundations.md#schema提供者的检查与准入)。

它不读取文本，不拥有业务形状，不校验 Cordis 插件配置。根入口不导入 Cordis。

## 使用

执行域创建一次提供者，并把同一个对象交给本域的调用方。预算每个字段都必填，本包不提供默认数字。

```ts
import { readJsonText } from "@omne-harness/json-text"
import {
  createSchemaProvider,
  defineSchema,
  validate,
  zodDefinition,
} from "@omne-harness/schema-provider"

const provider = createSchemaProvider({
  maxSnapshots: 32,
  maxConstructDepth: 32,
  maxConstructNodes: 256,
  failureBackoffMs: 50,
  maxAttempts: 3,
})

const chatMessage = defineSchema({
  id: "chat.message",
  load: async () =>
    zodDefinition({
      revision: "3",
      numbers: "exact-or-reject",
      schema: chatMessageZod,
    }),
})

const read = readJsonText(text, limits)
const verdict = await validate(provider, chatMessage, read)
```

`lease` 按住同一份快照，供多次同步 `check`。形状拥有者发布新修订时调用 `refresh`。执行域停止新准入时调用 `close`。

## 契约

公开形状以根入口为准。结果、拒绝、取消和槽位见 [SPEC.md](SPEC.md)。

`valid.value` 是投影后的值。本包丢弃引擎输出。调用方只依据 `SchemaIssue.code` 和 `path`，不解析说明文字。

## 设计

一个执行域对应一个 `SchemaProvider`。每个形状 id 一个槽。槽保存当前快照、至多一个在途任务、失败记录，以及仍有租约的旧快照。模块划分见 [docs/architecture.md](docs/architecture.md)。

## 配置与运行

`SchemaBudget` 由执行域传入。`maxSnapshots` 按份计数，不是字节。没有完整编译内存上界时，动态 Schema 不开放。

本包要求 Node.js `>=24.18.0 <25`，与模板和 `@omne-harness/json-text` 的 engines 一致。调用方提供时钟看不到的时间。退避由下一次调用读取，包内没有定时器。

## 验证

`pnpm test` 先构建再跑 vitest。现有测试核对导出名称。

准入拒绝、`revision-conflict`、槽位耗尽时保留有租约的快照，以及同一次首次使用只编译一次，由后续行为测试覆盖。本包不拥有端到端旅程，也不实现存储服务，因此没有集成测试和端到端测试。

## 维护

改变公开结果或拒绝原因时，同时改 `SPEC.md`、根入口和测试。业务形状的字段变更留在形状拥有者。不要把插件配置校验或文本格式化挪进本包。

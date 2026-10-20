# @omne-harness/schema-provider

[English](README.md)

本包校验一份 `JsonRead`，并在本执行域内缓存编译结果。公开类型在 `src/index.ts`。类型不能表达的行为在 [SPEC.md](SPEC.md)。内部模块在 [docs/architecture.md](docs/architecture.md)。

根入口已实现 [SPEC.md](SPEC.md) 的静态校验、准入、缓存与租约行为。动态档仍关闭，快照个数不构成编译内存上界。

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

本包要求 Node.js `>=24`，与模板和 `@omne-harness/json-text` 的 engines 一致。调用方提供时钟看不到的时间。退避由下一次调用读取，包内没有定时器。

## 验证

turbo 先构建再跑 vitest：`pnpm turbo run test --filter=@omne-harness/schema-provider`。本目录里的 `pnpm test` 只跑 vitest，不构建。测试调用公开导出。它们观察 `load` 的调用次数，以及返回的 `kind`、`reason`、`path`、`issues`、`value` 和 `superseded`。

测试覆盖这些行为：

- 根入口导出公开函数名。
- 严格对象返回 `valid` 和投影后的值。`.default` 返回 `refused`，原因是 `unsupported-construct`。失败的 `JsonRead` 返回 `unreadable`，并带上原来的失败。
- 同一个 id 的两次重叠首次检查只调用一次 `load`。取消其中一个调用方，该调用返回 `cancelled`。另一个检查使用共享快照。
- 编译失败在 `failureBackoffMs` 结束前返回 `unavailable`，原因是 `compile-failed`。达到 `maxAttempts` 后，结果是 `refused`，原因是 `attempts-exhausted`。
- `close` 之后的 `validate` 返回 `refused`，原因是 `closed`。再次 `close` 仍是关闭。已经加入的检查按加入时的快照做完。
- `exact-or-reject` 在整数不能成为 JavaScript 数字时返回 `precision`。精确整数保持为该数字。`lexeme` 把源词法交给检查器，`valid.value` 仍是该词法。
- `lease` 检查准入时的修订。`refresh` 之后，新的 `validate` 使用新修订，`superseded` 为真，未释放的 `check` 仍返回旧修订。
- `maxSnapshots` 只够已握住的快照时，新形状返回 `refused`，原因是 `budget-exhausted`。未释放的 `check` 仍然成功。
- 无环 JSON Schema 返回 `valid` 或 `invalid`，`path` 为 `compiled`。有环 JSON Schema 返回 `refused`，原因是 `runtime-path-closed`。Ajv 关闭 coercion、default 和 remove。
- 校验失败只使用 `type`、`empty`、`precision`、`constraint` 或 `unrecognized-key`。每条问题只有 `path` 和 `code`。

本包不拥有端到端旅程，也不实现存储服务，因此没有集成测试和端到端测试。

## 维护

改变公开结果或拒绝原因时，同时改 `SPEC.md`、根入口和测试。业务形状的字段变更留在形状拥有者。不要把插件配置校验或文本格式化挪进本包。

# @omne-harness-lite/content-blocks

[English](README.md)

不可变多模态内容块与严格无损 JSON 边界。在校验文本、思考、媒体、工具调用及工具结果时，保留精确数字原文与不透明传输载荷。

## Workspace 使用

这是实验阶段的私有 workspace 包，目前未发布到 npm。在仓库检出中按[开发指南](../../../docs/development.md)准备环境并构建 workspace，消费成员声明 `"@omne-harness-lite/content-blocks": "workspace:*"`，示例直接导入的其他包也应声明为直接依赖。通过公开包入口导入，不穿透兄弟包的 `src/`。

## 公开 API

| 入口／API                                              | 用途                                                  |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `judgeContentBlock`                                    | 完整块判定，按固定顺序返回具名拒绝                    |
| `contentBlockFromRepresentation`                       | 校验形状后恢复传输表示，不替代完整判定                |
| `readJsonStrict`、`writeJsonLossless`、`copyJsonValue` | 检查重复成员的 JSON 读取、精确写入与拥有的冻结副本    |
| `LosslessNumber`、数字谓词与 `jsonNumberSource`        | 精确数字表示与显式原文读取                            |
| `toOpaqueJson`、`readOpaqueJson`                       | 仅供传输适配的不透明包装／读取边界                    |
| 块类型、相等及媒体类型助手                             | 七类块、标识、附件与模态                              |
| `validate`、`schemaId`；`./schema`、`./schema/v2`      | 当前 v3 与保留的 v2 Schema 资源                       |
| `./schema-runtime`                                     | 独立运行时、可复用资源准备及精确校验器 |

## 使用示例

每个 TypeScript 示例独立完整，使用构建后的公开导出。

### 无损往返 JSON 并拒绝重复成员

```ts
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'

const source = '{"large":9007199254740993,"price":1.10,"huge":1e400,"zero":-0}'
const read = readJsonStrict(source)
if ('failed' in read) throw new Error(read.failed)
console.log(writeJsonLossless(read.ok) === source) // true
console.log(readJsonStrict('{"x":1,"\u0078":2}')) // { failed: 'duplicate_member' }
```

### 接收内容块并保留不透明载荷

```ts
import {
  judgeContentBlock,
  toOpaqueJson,
  writeJsonLossless,
  LosslessNumber,
} from '@omne-harness-lite/content-blocks'

const result = judgeContentBlock({
  kind: 'thinking',
  id: 'b_1',
  visibility: { toHuman: false, toModel: true },
  text: 'Considering the request',
  opaque: toOpaqueJson({ vendor: 'token', n: new LosslessNumber('1.10') }),
})
if ('rejected' in result) throw new Error(result.rejected)
console.log(Object.isFrozen(result.ok)) // true
console.log(writeJsonLossless(result.ok)) // includes "opaque":{"vendor":"token","n":1.10}
console.log(judgeContentBlock({ kind: 'text', id: 'b_2', text: 'Hello' }))
// { rejected: 'visibility_missing' }
```

传输适配可包装或读取不透明数据。其他消费者保持该值完整，不按其内容分支。

### 用独立编译器检查精确数字边界

```ts
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'

const runtime = createSchemaRuntime([])
const validator = runtime.compile({
  type: 'integer',
  minimum: new LosslessNumber('9007199254740993'),
})
console.log(validator.validate(new LosslessNumber('9007199254740992'))) // false
console.log(validator.validate(new LosslessNumber('9007199254740993'))) // true
console.log(validator.validate(new LosslessNumber('1.00000000000000000001'))) // false
```

## 边界与失败处理

`judgeContentBlock` 先复制本模块支持的 JSON 表示（包括真正的 `LosslessNumber` 和 `OpaqueJson` 的表示恢复）；非 JSON 的 JavaScript 值直接返回 `malformed`。复制不会求值普通 getter 或 `toJSON`，但不保证 Proxy trap 不执行用户代码。只有复制成功的 JSON 值才依次检查 `kind_unknown`、`visibility_missing`、`incomplete_call_visible`、`call_in_result`、`modality_mismatch`，其余形状／跨成员约束归 `malformed`。成功时返回自己拥有的深冻结副本。`contentBlockFromRepresentation` 校验完整内置 Schema 并恢复品牌，但不执行额外判定谓词；非法表示前提会抛 `TypeError`。

`JsonNumber` 是 `number | LosslessNumber`。严格读取器把普通安全整数字面量保留为 number；小数、指数、不安全整数与负零由 `LosslessNumber` 保留原文。不能用 `Number(source)` 判断精确边界或相等。写入器对非 JSON 值抛 `TypeError`，不会省略它们；复制器拒绝 getter、环与其他非 JSON 属性。不透明 JSON 不构成内容检查许可，复制其交换表示也不会保留领域品牌。

内置 `validate` 只检查形状，数字投影仅适用于这份固定 Schema；不能把投影用于任意数值约束，也不能把包装器直接交给普通 Ajv。`createSchemaRuntime` 由调用方持有，只解析显式提供的固定资源，不远程加载或异步校验。本包不解析 `rawArguments`、执行工具、取附件、持久化块、建立跨消息块标识唯一性或授权可见性。`./schema/v2` 只保留旧资源，不提供 v2 行为兼容。实际 JSON source／raw-number API 要求 Node `>=24.18.0 <25`。

`createSchemaRuntimeFactory(resources, options)` 一次准备固定资源的快照。调用返回的工厂时，每次创建独立编译器。多个短生命周期的作者 Schema 编译器使用相同固定资源时，可复用这一步准备工作。作者 Schema 注册和校验结果不共享。资源校验及重复标识错误在创建工厂时报告。

内联 base64 校验支持解码后 4 MiB 及更大的媒体值，不依赖随输入增长的正则回溯栈。固定校验器和默认 `createSchemaRuntime` 编译器保持公开 Schema 的语言不变（含 padding 与严格串尾检查）；不解码图片、不引入模型字节上限，也没有新增用户配置。消费者仍负责各自声明的输入限制。显式传入的 `patternFactory` 保留 native RegExp 行为，其模式执行仍由调用方负责。

## 开发

```sh
pnpm --filter @omne-harness-lite/content-blocks run build
pnpm --filter @omne-harness-lite/content-blocks run typecheck
pnpm --filter @omne-harness-lite/content-blocks run test
```

先构建 workspace 依赖。这些检查覆盖本包；组合行为需针对实际消费者与提供者验证。

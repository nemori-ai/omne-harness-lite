# @omne-harness-lite/messages

[English](README.md)

纯不可变消息与模型调用记录校验，以及基于显式日志前缀的可读性、配对与压缩名单判定。为消费者提供消息值和谓词，不拥有会话日志或运行时。

## Workspace 使用

这是实验阶段的私有 workspace 包，目前未发布到 npm。在仓库检出中按[开发指南](../../../docs/development.md)准备环境并构建 workspace，消费成员声明 `"@omne-harness-lite/messages": "workspace:*"`，示例直接导入的其他包也应声明为直接依赖。通过公开包入口导入，不穿透兄弟包的 `src/`。

## 公开 API

| 公开 API                                                                  | 用途                                     |
| ------------------------------------------------------------------------- | ---------------------------------------- |
| `judgeMessage`、`judgeMessageText`、`judgeMessageInLog`                   | 单消息准入、严格 JSON 接收与前向引用检查 |
| `judgeModelInvocationRecord`、`judgeModelInvocationRecordText`            | 接收五类调用记录，与消息分开             |
| `isReadable`、`judgePairing`、`judgeCompactionList`                       | 依赖前缀的判定，外部输入显式传入         |
| `brandMessage`、`brandRecord`、`isWireMessage`、`isWireRecord`、`Wire<T>` | 只检查形状的传输恢复与交换类型           |
| 消息／记录类型、`LogPrefixView`                                           | 七类消息与调用方拥有的有序前缀           |
| `validate`、`schemaId`；`./schema`                                        | 当前 MS6 的形状校验                      |
| `./schema/v2`、`./schema/v3`                                              | 当前规范传递引用所需的精确资源           |

## 使用示例

每个 TypeScript 示例独立完整，使用构建后的公开导出。

### 通过严格 JSON 接收消息

```ts
import { judgeMessageText } from '@omne-harness-lite/messages'

const result = judgeMessageText(
  JSON.stringify({
    id: 'message_1',
    type: 'user',
    createdAt: '2026-09-26T10:00:00Z',
    blocks: [
      { kind: 'text', id: 'block_1', visibility: { toHuman: true, toModel: true }, text: 'Hello' },
    ],
  }),
)
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.ok.type, Object.isFrozen(result.ok)) // user true
console.log(judgeMessageText('{"type":"user","type":"user"}')) // { rejected: 'malformed' }
```

### 基于完整前缀检查压缩名单

```ts
import {
  isReadable,
  judgeCompactionList,
  judgeMessage,
  judgeMessageInLog,
  judgePairing,
  type LogPrefixView,
} from '@omne-harness-lite/messages'

const user = judgeMessage({
  id: 'message_1',
  type: 'user',
  createdAt: '2026-09-26T10:00:00Z',
  blocks: [
    {
      kind: 'text',
      id: 'block_1',
      visibility: { toHuman: true, toModel: true },
      text: 'Long request',
    },
  ],
})
if ('rejected' in user || user.ok.type !== 'user') throw new Error('invalid user message')
const prefix: LogPrefixView = [user.ok]
const ref = { messageId: user.ok.id, blockId: user.ok.blocks[0]!.id }
const compact = judgeMessageInLog(
  {
    id: 'message_2',
    type: 'compaction',
    createdAt: '2026-09-26T10:01:00Z',
    blocks: [
      {
        kind: 'text',
        id: 'block_2',
        visibility: { toHuman: true, toModel: true },
        text: 'Request summary',
      },
    ],
    silenced: [ref],
  },
  prefix,
)
if ('rejected' in compact || compact.ok.type !== 'compaction') throw new Error('invalid compaction')
console.log(judgePairing(compact.ok, prefix)) // { undetermined: 'compaction_list' }
console.log(
  judgeCompactionList(compact.ok, prefix, {
    pendingCardBlocks: [],
    lastModelRequestPrefixLength: 1,
  }),
)
// { valid: true }
console.log(isReadable(ref, prefix)) // true
console.log(isReadable(ref, [...prefix, compact.ok])) // false
```

此例传入的前缀与外部输入描述完整示例日志。在自己的日志事务中追加之前，应检查所有必需结果。

### 单独校验调用记录

```ts
import { judgeModelInvocationRecord } from '@omne-harness-lite/messages'

const opened = judgeModelInvocationRecord({
  kind: 'model_call_opened',
  call: 'model_call_1',
  dispatch: 1,
  firstTokenAt: '2026-09-26T10:00:00Z',
})
if ('rejected' in opened) throw new Error(opened.rejected)
console.log(opened.ok.kind) // model_call_opened
```

「已出门」记录携带完整档案快照。记录接收者检查形状和绑定；档案写入方必须先完整判定来源档案，再复制快照。

```ts
import { judgeModelInvocationRecord } from '@omne-harness-lite/messages'

const adaptation = {
  implementation: { name: 'example-family', revision: '1' },
  definition: { modelId: 'vendor/chat', revision: '1' },
  configuration: { revision: '1', values: {} },
}
const dispatched = judgeModelInvocationRecord({
  kind: 'model_call_dispatched',
  call: 'model_call_1',
  dispatch: 1,
  provider: 'provider-a',
  response: 'response_1',
  profile: { origin: 'official', routeName: 'vendor/chat' },
  profileSnapshot: {
    providers: ['provider-a'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 4096,
    maxOutputTokens: 1024,
    inputConstraints: {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
    adaptation,
    updatedAt: '2026-09-28T00:00:00Z',
  },
  adaptation,
  parameters: {},
  selectedBy: 'session',
  credentialScope: { layer: 'factory' },
})
if ('rejected' in dispatched) throw new Error(dispatched.rejected)
console.log(dispatched.ok.kind) // model_call_dispatched
```

## 边界与失败处理

判定成功返回自己拥有的冻结值；拒绝不修补输入。文本判定使用无损 JSON 接收，把语法或重复成员失败映射为 `malformed`。具名消息／块谓词先于其余形状校验。`brandMessage`／`brandRecord` 在完整 Schema 校验后恢复品牌，但不执行额外单值与日志规则；非法表示前提抛 `TypeError`。

`LogPrefixView` 必须完整、有序、已校验且一致。`createdAt` 不是排序键。`judgeMessageInLog` 检查表示与前向引用，不追加，也不证明配对。`judgePairing` 检查唯一与调用／结果关系，但非空压缩名单仍须另调 `judgeCompactionList`；后者仅在消息／前向引用准入通过后调用。缺少待答卡块或最近请求输入时可能返回 `undetermined`，不能据此允许追加。

消息本身不携带租户归属。会话路由、授权、原子追加、持久化、记录序列一致性及翻译成模型提供者请求归消费者。`tool_internal` 内容必须对模型不可见，也不进入出站请求。`./schema/v2` 是保留资源，不提供 v2 行为兼容。要求 Node `>=24.18.0 <25`。

## 开发

```sh
pnpm --filter @omne-harness-lite/messages run build
pnpm --filter @omne-harness-lite/messages run typecheck
pnpm --filter @omne-harness-lite/messages run test
```

先构建 workspace 依赖。这些检查覆盖本包；组合行为需针对实际消费者与提供者验证。

默认入口与 Schema 采用 `data.messages/v6`。「已出门」记录须带完整的 `profileSnapshot.inputConstraints` 和 `profileSnapshot.upstreamInputLimits`。`brandRecord` 与 `validate` 只检查形状；`judgeModelInvocationRecord` 还检查完整绑定与实际参数处置。快照接收者不重新运行档案写入方的跨字段上限比较。旧形状在当前入口明确拒绝，不改写数据。`./schema/v2` 和 `./schema/v3` 仅供当前规范传递依赖引用，不提供旧执行 codec。

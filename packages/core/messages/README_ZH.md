# @omne-harness-lite/messages

[English](README.md)

纯不可变消息与模型调用记录校验，以及基于显式日志前缀的可读性、配对与压缩名单判定。为消费者提供消息值和谓词，不拥有会话日志或运行时。

## Workspace 使用

这是实验阶段的私有 workspace 包，目前未发布到 npm。在仓库检出中按[开发指南](../../../docs/development.md)准备环境并构建 workspace，消费成员声明 `"@omne-harness-lite/messages": "workspace:*"`，示例直接导入的其他包也应声明为直接依赖。通过公开包入口导入，不穿透兄弟包的 `src/`。

## 公开 API

| 公开 API                                                                  | 用途                                     |
| ------------------------------------------------------------------------- | ---------------------------------------- |
| `judgeMessage`、`judgeMessageText`、`judgeMessageInLog`                   | 单消息准入、严格 JSON 接收与前向引用检查 |
| `judgeModelInvocationRecord`、`judgeModelInvocationRecordText`            | 接收八类调用记录，与消息分开             |
| `createModelCallSemanticDigest`、`judgeModelCallSemanticDigest` | 创建和核对按角色隔离的无损 SHA-256 值摘要 |
| `judgeModelCallCreatedPayload`、`judgeModelCallCreatedPayloadText` | 创建内容内在关系与严格文本判定 |
| `judgeModelReplyMessage` | 原回复优先的持久消息关系判定 |
| `isReadable`、`judgePairing`、`judgeCompactionList`                       | 依赖前缀的判定，外部输入显式传入         |
| `brandMessage`、`brandRecord`、`isWireMessage`、`isWireRecord`、`Wire<T>` | 只检查形状的传输恢复与交换类型           |
| 消息／记录类型、`LogPrefixView`                                           | 七类消息与调用方拥有的有序前缀           |
| `validate`、`schemaId`；`./schema`                                        | 当前 MS8 的形状校验                      |
| `./schema/v2`、`./schema/v3`、`./schema/v6`                               | 当前规范传递引用所需的精确资源           |

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

默认入口与 Schema 采用 `data.messages/v9`。[SPEC.md](SPEC.md)限定已采用的 F0 差异：Attempt 事件由 Session fact 拥有，作为 Message 来源时明确拒绝。其余 MS8 行为继续有效。「已出门」记录须带完整的 `profileSnapshot.inputConstraints` 和 `profileSnapshot.upstreamInputLimits`。`brandRecord` 与 `validate` 只检查形状；`judgeModelInvocationRecord` 还检查完整绑定、实际参数处置，以及 ACK 见证的响应与目标一致。快照接收者不重新运行档案写入方的跨字段上限比较。旧形状在当前入口明确拒绝，不改写数据。`./schema/v2`、`./schema/v3` 和 `./schema/v6` 仅供当前规范传递依赖引用，不提供旧执行 codec。

## MS8 创建内容、回复与 ACK 值

当前根入口用九份资源编译全部53个公开定义：MS9、CB3、CB2、OE1、CA4、IV1、MP5、MP6、TD3。图沿实际引用的定义递归；依赖文件里未触达的定义不会扩大本包图。创建值（`CallKey`、`CreationKey`、`ModelCallPayloadRef`、`ModelCallCreationInput`、`ModelCallCreatedPayload`）及 ACK 摘要、见证与记录由本包拥有。`model_call_created`、`model_call_reply_ready`、`model_call_acknowledged` 是技术记录，不属于 Message 或 OutboundMessage。ACK 释放清单只列可释放的模型自有副本；形状准入不证明来源、权限或实际删除。`./schema/v6` 保留精确消费者所需的原 MS6 资源，不提供旧执行入口。采用与验证依据见 ACK 决定、[MS8 契约](../../../.meta_harness/design/spec/data/messages/v8/contract.md)及[提供者映射](../../../.meta_harness/design/realization/packages/core/messages/v8-acknowledgement-design.md)。

### 核对自行保存的完整值

```ts
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { createModelCallSemanticDigest, judgeModelCallSemanticDigest } from '@omne-harness-lite/messages'

const saved = readJsonStrict('{"route":{"provider":"example"},"count":9007199254740993}')
if ('failed' in saved) throw new Error(saved.failed)
const role = 'model-call-retained-result-semantic-sha256/v1'
const created = createModelCallSemanticDigest(role, saved.ok)
if ('rejected' in created) throw new Error(created.rejected)
const checked = judgeModelCallSemanticDigest(role, saved.ok, created.ok)
if ('rejected' in checked) throw new Error(checked.rejected)
console.log(checked.ok.role === role) // true
```

此函数只核严格 JSON 值，不证明任意值来自真实 ready。运行时在 ACK 或后继处分前还要核原来源与当前资格。语义摘要与覆盖原存储 UTF-8 字节的 `ModelCallPayloadRef.digest` 不可互换。

### 接收被拒绝创建的原输入

```ts
import { judgeModelCallCreatedPayloadText } from '@omne-harness-lite/messages'

const result = judgeModelCallCreatedPayloadText(JSON.stringify({
  kind: 'created', status: 'rejected',
  ref: { session: 'session_1', callId: 'call_1' }, creationKey: 'create_1',
  origin: { tenant: { organization: 'organization_1', account: 'account_1' }, session: 'session_1' },
  input: {
    target: 'example/model', messages: [], tools: [],
    basis: {
      routeName: 'example/model', profile: { origin: 'official', routeName: 'example/model' },
      selectedBy: 'session', selected: 'example/model',
    },
    sourceVersions: { report: 'immutable-report-version-1', context: 'immutable-context-version-1' },
  },
  cause: 'credential_unavailable',
}))
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.ok.status) // rejected
```

`judgeModelCallCreatedPayload` 接收显式值；文本入口严格拒绝重复键并保留精确数字。它核内在会话关系、消息与 accepted 绑定关系，不取回来源版本、不验证凭据、原字节摘要或已提交记录。

### 判定首次成对派生

```ts
import { judgeModelReplyMessage } from '@omne-harness-lite/messages'

const original = {
  id: 'reply_1', type: 'assistant', response: 'response_1', ending: 'complete',
  createdAt: '2026-09-29T10:00:00Z',
  blocks: [{
    id: 'image_1', kind: 'image', visibility: { toHuman: true, toModel: true },
    mediaType: 'image/png', data: { inline: 'eA==' },
  }],
}
const image = original.blocks[0]
if (image === undefined) throw new Error('missing original image')
const persisted = { ...original, blocks: [{
  ...image,
  renderings: [{ producedBy: 'system', blocks: [{
    id: 'description_1', kind: 'text', visibility: { toHuman: true, toModel: true }, text: 'A description',
  }] }],
  transcript: 'A description',
}] }
const result = judgeModelReplyMessage(original, persisted)
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.ok.response, !Object.is(result.ok, persisted)) // response_1 true
console.log(judgeModelReplyMessage(original, { ...persisted, response: 'other' })) // { rejected: 'malformed' }
```

`judgeModelReplyMessage` 先判原回复，再判持久消息，最后判两值关系。成功返回拥有自己的持久消息副本。每个原成员与原块位置都须保持相等，包括已有派生及 opaque。只有原本同时缺少两个派生成员的合格媒体块可新增合法 renderings/transcript 对。本函数不执行转换，也不授予写权：最终写方仍须核真实可信转换来源、当前资格和消息/final原子原批。自报 `producedBy: 'system'` 只证明表示。

当前资源注册与验证根按已接受的[公开定义闭包revision 2](../../../.meta_harness/design/realization/packages/core/messages/public-definition-resource-closure-followup.md)和D110闭包决定执行。MS2/MS3/MS6资源继续供真正的外部消费者使用，不提供旧执行codec；LC/AE后继迁移与runtime耐久行为由各自owner承担。

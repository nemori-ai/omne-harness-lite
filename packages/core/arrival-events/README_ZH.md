# @omne-harness-lite/arrival-events

[English](README.md)

到达信封的纯校验与单块填充归约。模型响应流和工具执行帧使用同一套数据词汇；本包不提供传输或可靠投递机制。

失败原因类型来自 `@omne-harness-lite/loop-extension` 当前公开入口。

## Workspace 使用

这是实验阶段的私有 workspace 包，目前未发布到 npm。在仓库检出中按[开发指南](../../../docs/development.md)准备环境并构建 workspace，消费成员声明 `"@omne-harness-lite/arrival-events": "workspace:*"`，示例直接导入的其他包也应声明为直接依赖。通过公开包入口导入，不穿透兄弟包的 `src/`。

## 公开 API

| 公开 API                                               | 用途                                                    |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `judgeArrivalEnvelope`、`judgeArrivalEnvelopeText`     | 固定顺序的表示判定；可传调用方拥有的 `openBlock` 视图   |
| `reduceFills`                                          | 按生产次序归约属于一个块的合法填充                      |
| `isStandardBase64`                                     | 检查非空标准 Base64 的规范填充与尾部位                  |
| 到达／事件／开块／归约类型                             | `open`、`fill`、`close`、`trim`、`account`、`finish` 值 |
| `validate`、`schemaId`、`SCHEMA_DEF_NAMES`；`./schema` | 形状校验与 v2 Schema                                    |

Schema 图使用 arrival-events v2 所引用的精确 `call-accounts/schema/v2` 资源，
不随 call-accounts 根 Schema 的版本升级而改变。

## 使用示例

每个 TypeScript 示例独立完整，使用构建后的公开导出。

### 校验模型与工具信封

```ts
import { judgeArrivalEnvelope, judgeArrivalEnvelopeText } from '@omne-harness-lite/arrival-events'

console.log(
  judgeArrivalEnvelope({
    target: { kind: 'model_call', callId: 'model_call_1', dispatch: 1 },
    event: {
      t: 'open',
      index: 0,
      id: 'block_1',
      kind: 'text',
      fill: 'append',
      visibility: { toHuman: true, toModel: true },
    },
  }),
) // { ok: true }
console.log(
  judgeArrivalEnvelopeText(
    JSON.stringify({
      target: { kind: 'tool_execution', callId: 'call_1' },
      event: {
        t: 'open',
        index: 0,
        id: 'block_2',
        kind: 'text',
        fill: 'append',
        visibility: { toHuman: true, toModel: false },
      },
    }),
  ),
) // { ok: true }
console.log(
  judgeArrivalEnvelope({
    target: { kind: 'model_call', callId: 'model_call_1', dispatch: 1 },
    event: {
      t: 'open',
      index: 1,
      id: 'block_3',
      kind: 'image',
      fill: 'append',
      visibility: { toHuman: true, toModel: true },
    },
  }),
) // { rejected: 'fill_kind_not_appendable' }
```

### 归约文本、参数原文与解码后的音频字节

```ts
import { isStandardBase64, reduceFills } from '@omne-harness-lite/arrival-events'

console.log(reduceFills({ kind: 'text', fill: 'append' }, ['Hello, ', 'Ada'])) // Hello, Ada
console.log(reduceFills({ kind: 'tool_call', fill: 'append' }, ['{"x":', '1}'])) // {"x":1}
console.log(reduceFills({ kind: 'voice', fill: 'append' }, ['AQ==', 'Ag=='])) // AQI=
console.log(reduceFills({ kind: 'text', fill: 'replace' }, ['old', 'new'])) // new
console.log(reduceFills({ kind: 'text', fill: 'append' }, [])) // undefined
console.log(isStandardBase64('AQ==')) // true
console.log(isStandardBase64('AR==')) // false: nonzero unused tail bits
```

## 边界与失败处理

判定只检查表示，不检查事件序列。`{ ok: true }` 不能证明索引已打开、单调或可以封口；这些检查由 [stream-assembly](../stream-assembly/README_ZH.md) 等序列消费者承担。可选的 `openBlock(index)` 须返回合法、不可变且此刻仍开的视图；缺席或已封口时返回 `undefined`。只有替换形状和工具帧语音填充谓词借用该视图；视图缺失不能证明这两项上下文条件成立。

工具帧必须 `toModel: false`，禁止内联媒体字节；工具流没有 `account`、`max_tokens` 收尾或收尾错误。当前版本拒绝呈现提示。模型目标带 `callId` 与 `dispatch`，工具目标带 `callId`；两者都不携带会话或租户路由。

`reduceFills` 的前提是合法模式，以及按生产次序属于一个块的合法载荷。违反前提会抛 `TypeError`；零次填返回 `undefined`。音频连接解码后的字节，不连接 Base64 字符串。工具参数始终是原文字符串，此处不解析。文本接收把语法或嵌套重复成员映射为 `malformed`，并保留精确数字。序列、封口／归约一致性、节流、砍的记账、路由、授权与有序且不重不漏的投递归调用方。数据被拒本身不会终结执行。

## 开发

```sh
pnpm --filter @omne-harness-lite/arrival-events run build
pnpm --filter @omne-harness-lite/arrival-events run typecheck
pnpm --filter @omne-harness-lite/arrival-events run test
```

先构建 workspace 依赖。这些检查覆盖本包；组合行为需针对实际消费者与提供者验证。

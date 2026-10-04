# @omne-harness-lite/call-accounts

[English](README.md)

模型响应、工具执行及后续费用补账的纯数据准入与精确十进制求值。汇总分别保留已知金额和未知笔数，不查询服务，也不修改原记录。

## Workspace 使用

这是实验阶段的私有 workspace 包，目前未发布到 npm。在仓库检出中按[开发指南](../../../docs/development.md)准备环境并构建 workspace，消费成员声明 `"@omne-harness-lite/call-accounts": "workspace:*"`，示例直接导入的其他包也应声明为直接依赖。通过公开包入口导入，不穿透兄弟包的 `src/`。

## 公开 API

| 公开 API                                           | 用途                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| `judgeAccountValue`、`validate`；`./schema`        | 完整账值判定、形状校验与 v4 Schema                                       |
| `ExactDecimal`                                     | 精确的 `from`、`add`、`compare`、`isInteger`、`toString`、`toJsonNumber` |
| `prepareAccountGroup`、`AccountGroup`、`summarize` | 先准入完整自有账组，再投影权威费用                                       |
| `effectiveCost`                                    | 对一个显式模型／工具目标应用只属于它的补账                               |
| `summarizeUsage`                                   | 汇总四项模型 token，分别给出已知和与未知笔数                             |
| 账数据类型                                         | `Usage`、`Cost`、`ToolCallAccount`、`CostCorrection`、砍／帧值与归属标识 |

## 使用示例

每个 TypeScript 示例独立完整，使用构建后的公开导出。

### 不经浮点舍入相加十进制金额

```ts
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'

const total = ExactDecimal.from(new LosslessNumber('0.1')).add(
  ExactDecimal.from(new LosslessNumber('0.2')),
)
console.log(total.compare(ExactDecimal.from(new LosslessNumber('0.3')))) // 0
console.log(writeJsonLossless({ cost_usd: total.toJsonNumber() })) // {"cost_usd":0.3}
console.log(judgeAccountValue('Cost', { cost_usd: 'unknown', source: 'upstream_usage' }))
// { rejected: 'unknown_with_source' }
```

### 准入账组并应用后续补账

```ts
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { effectiveCost, prepareAccountGroup, summarize } from '@omne-harness-lite/call-accounts'

const cost = { cost_usd: new LosslessNumber('0.1'), source: 'upstream_usage' } as const
const usage = {
  input_tokens: 10,
  output_tokens: 2,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  source: 'upstream',
} as const
const corrections = [
  {
    sessionLog: 'session_1',
    correction: {
      target: { kind: 'model_response', responseId: 'response_1' },
      cost_usd: new LosslessNumber('0.3'),
      obtainedVia: 'manual',
      at: '2026-09-26T12:00:00Z',
    },
  },
] as const
const admitted = prepareAccountGroup({
  models: [{ responseId: 'response_1', cost, usage }],
  tools: [],
  corrections,
})
if ('rejected' in admitted) throw new Error(admitted.rejected)
const summary = summarize(admitted.ok)
if ('failed' in summary) throw new Error(summary.failed)
console.log(summary.knownSum.toString(), summary.unknownCount) // 0.3 0
const effective = effectiveCost(
  { kind: 'model_response', responseId: 'response_1', cost },
  corrections,
)
if ('ok' in effective)
  console.log(effective.ok.source) // later_correction
else throw new Error('cost evaluation failed')
```

### 汇总模型用量，未知不当零

```ts
import { summarizeUsage } from '@omne-harness-lite/call-accounts'

const summary = summarizeUsage([
  {
    responseId: 'response_1',
    usage: {
      input_tokens: 10,
      output_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      source: 'upstream',
    },
  },
  {
    responseId: 'response_2',
    usage: {
      input_tokens: 'unknown',
      output_tokens: 'unknown',
      cache_read_tokens: 'unknown',
      cache_write_tokens: 'unknown',
      source: 'none',
    },
  },
])
if ('rejected' in summary || 'failed' in summary) throw new Error('usage evaluation failed')
console.log(summary.input_tokens.knownSum.toString()) // 10
console.log(summary.input_tokens.unknownCount) // 1
```

## 边界与失败处理

准入拒绝按 `correction_without_target`、`malformed`、`negative_amount`、`unknown_with_source`、`total_not_unknown` 的次序返回。单独 `validate` 不能证明跨字段合法。求值区分非法输入与 `duplicate_account`、`orphan_correction`、`correction_tie`；这些是本地求值器失败名，不是完整运行时读 API。同一精确时刻存在不同金额即为平局，即使之后还有更晚补账也一样。

费用汇总计入权威模型费用与工具自己的费用。工具的 `model_call` 项是镜像；完整准入后，投影排除镜像、工具 `total_usd` 与工具用量。最新且无歧义的补账替换目标的有效金额，不改原记录。`effectiveCost` 要求只传属于该目标的补账；工具目标匹配还使用调用方显式提供的会话日志键。

`'unknown'` 是显式值，不是零，也不是缺席。`ExactDecimal` 对传入的数字表示进行运算，不能恢复到达边界前已被 JavaScript number 丢掉的精度。精确小数应使用 `LosslessNumber` 或严格 JSON 读取器。`summarizeUsage` 只接收模型 `ResponseId + Usage`，汇总四项 token，不能证明完整账组合法。归组完整性、会话／租户归属、落盘、幂等及之后的每一道数字传输边界归调用方。

## 开发

```sh
pnpm --filter @omne-harness-lite/call-accounts run build
pnpm --filter @omne-harness-lite/call-accounts run typecheck
pnpm --filter @omne-harness-lite/call-accounts run test
```

先构建 workspace 依赖。这些检查覆盖本包；组合行为需针对实际消费者与提供者验证。

默认公开入口与 `./schema` 采用 `data.call-accounts/v4`。当前 loop-extension 的依赖图仍引用规范 CA2，故 `./schema/v2` 保留其原字节，但没有旧版执行入口。实际读面须在同一已授权 Session 来源前缀中按 ResponseId 只选一笔原账：先选已确认 final，其次选 ACK 原账见证，否则取完整 ready；来源矛盾必须拒绝。`summarize` 不查询日志、不按 CallKey 去重，也不代选来源；把同响应的两笔账交入会得到 `duplicate_account`。见证不是第二笔费用。补账仍指原 ResponseId，ACK 与释放后 unknown 仍是 unknown。未知授权或必需来源缺失由读面明确收口，不能省略或填零。

### 导入当前与精确依赖 Schema

```ts
import assert from 'node:assert/strict'
import current from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import pinned from '@omne-harness-lite/call-accounts/schema/v2' with { type: 'json' }
import { schemaId } from '@omne-harness-lite/call-accounts'

assert.equal(schemaId, current.$id)
assert.ok(current.$id.includes('/call-accounts/v4/'))
assert.ok(pinned.$id.includes('/call-accounts/v2/'))
assert.deepEqual(current.$defs, pinned.$defs)
```

采用依据与映射：[ACK 决定](../../../.meta_harness/design/record/decisions/model-runtime-reference-lifecycle-adoption/ack-contracts-decision.md)、[CA4](../../../.meta_harness/design/spec/data/call-accounts/v4/contract.md)、[提供者](../../../.meta_harness/design/realization/packages/core/call-accounts/v4-acknowledgement-design.md)。本包验证导航：[显式输入](tests/v3.spec.ts)与[规范实例](tests/examples.spec.ts)；真实来源选择、权限和持久恢复由组合验证承担。

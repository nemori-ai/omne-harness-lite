# @omne-harness-lite/offer-expiry

根入口保持纯定义。`./cordis` 公开共享 Service 与唯一服务键，行为见[集成承诺](SPEC.md)。

[English](README.md)

时间值与邀约状态的纯求值。解析正时长，构造只读的 `OfferTiming` 值，并根据显式提供的时刻、终结记录与目标存在性推导当前状态。

## Workspace 使用

这是实验阶段的私有 workspace 包，目前未发布到 npm。在仓库检出中按[开发指南](../../../docs/development.md)准备环境并构建 workspace，消费成员声明 `"@omne-harness-lite/offer-expiry": "workspace:*"`，示例直接导入的其他包也应声明为直接依赖。通过公开包入口导入，不穿透兄弟包的 `src/`。

## 公开 API

| 公开 API                                          | 用途                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `Instant`、`Duration`、时刻转换与比较函数         | 品牌化整数毫秒与 RFC 3339 交换字符串                                   |
| `parseOfferTtl`、`timingFrom`、`parseOfferTiming` | 正时长与先发出、后到期的时间值                                         |
| `deriveState`、`acceptable`、状态常量及类型       | 派生状态与统一的可接受谓词                                             |
| `Clock`                                           | `now(): Instant \| 'unavailable'` 接口；不提供时钟实现                 |
| `validate`、`schemaId`；`./schema`、`./schema/v1` | 当前 v2 Schema 与保留的 v1 Schema 资源                                 |
| `compareRfc3339Instants`                          | 原始 RFC 3339 字符串的精确条件排序；静态非法返回 `Parsed.invalidInput` |
| `./testing`                                       | 测试用 `testClock` 与 `TestClock`                                      |

## 使用示例

每个 TypeScript 示例独立完整，使用构建后的公开导出。

### 构造时间值并判断截止边界

```ts
import {
  acceptable,
  deriveState,
  instantFromRfc3339,
  instantToRfc3339,
  parseOfferTtl,
  timingFrom,
} from '@omne-harness-lite/offer-expiry'

const issued = instantFromRfc3339('2026-09-26T10:00:00Z')
const ttl = parseOfferTtl('PT1H')
if (!('ok' in issued) || !('ok' in ttl)) throw new Error('invalid timing input')
const timing = timingFrom(issued.ok, ttl.ok)
if (timing === 'unavailable' || !('ok' in timing)) throw new Error('timing construction failed')
const state = deriveState({
  timing: timing.ok,
  settled: null,
  now: timing.ok.expiresAt,
  target: 'exists',
})
console.log(instantToRfc3339(timing.ok.expiresAt)) // 2026-09-26T11:00:00.000Z
console.log(state) // pending: equality at the deadline is still acceptable
if (state !== 'unavailable') console.log(acceptable(state)) // true
```

### 保留终结结果并传播不可用输入

```ts
import { deriveState, parseOfferTiming } from '@omne-harness-lite/offer-expiry'

const parsed = parseOfferTiming({
  issuedAt: '2026-09-26T10:00:00Z',
  expiresAt: '2026-09-26T11:00:00Z',
})
if (!('ok' in parsed)) throw new Error(parsed.invalidInput)
console.log(
  deriveState({
    timing: parsed.ok,
    settled: 'declined',
    now: 'unavailable',
    target: 'unavailable',
  }),
)
// declined
console.log(deriveState({ timing: parsed.ok, settled: null, now: 'unavailable', target: 'absent' }))
// unavailable
console.log(
  deriveState({ timing: parsed.ok, settled: null, now: parsed.ok.issuedAt, target: 'absent' }),
)
// expired
```

### 精确比较原始 RFC 3339 字符串

`compareRfc3339Instants(left: unknown, right: unknown)` 返回 `@omne-harness-lite/identity-values` 的 `Parsed<-1 | 0 | 1>`。原始 RFC 3339 字符串需要任意小数位与异偏移的精确排序时使用此入口；已有整数毫秒运算仍使用 `Instant` 和 `compareInstants`。两个入口均不改写原字符串，时点相同不代表载荷字符串全值相同。

新函数对静态可判非法的表示、日历字段与偏移返回固定且不回显输入的 `invalidInput`。合法四位本地年对应的 UTC 时点即使跨出该年范围也能比较。函数同步执行，无时钟或 IO，按输入长度扫描，不设固定小数精度，也不跨调用缓存输入。

排序保证以前后两值确为合法 RFC 3339 时点为前提。`:60` 静态位置须归一化到 UTC 月末最后一分钟，保留在下一分钟的 `:00` 之前；`ok` **不认证**实际闰秒公告。调用方须先确认真实正／负闰秒合法性与时间来源，再用排序结果接收业务数据。只检查形状的 Schema 校验也不能承担此责任。

```ts
import {
  compareInstants,
  compareRfc3339Instants,
  instantFromRfc3339,
} from '@omne-harness-lite/offer-expiry'

const left = '2026-09-27T00:00:00.0004Z'
const right = '2026-09-27T00:00:00.0003Z'
const exact = compareRfc3339Instants(left, right)
if (!('ok' in exact)) throw new Error(exact.invalidInput)
console.log(exact.ok) // 1: every fractional digit participates
const a = instantFromRfc3339(left)
const b = instantFromRfc3339(right)
if (!('ok' in a) || !('ok' in b)) throw new Error('invalid millisecond input')
console.log(compareInstants(a.ok, b.ok)) // 0: existing millisecond quantization
const same = compareRfc3339Instants('2026-09-27T08:00:00.0004+08:00', left)
if (!('ok' in same)) throw new Error(same.invalidInput)
console.log(same.ok) // 0: equal instants; original strings remain different
console.log(left, right) // original input strings are unchanged
```

## 边界与失败处理

当前状态为 `pending`、`accepted`、`withdrawn`、`declined`、`expired`。只持久化终结值 `SettledState`（`accepted`、`withdrawn`、`declined`），读取时推导 `pending` 与 `expired`。求值次序是终结记录、不可用输入、严格的 `now > expiresAt` 或目标不存在，最后才是 pending。目标不可用不等于目标不存在。

本包不提供时钟、定时器、清理任务或存储事务。消费者须使用一致时间源，并在写入效果的事务内重新判断可接受性。`parseOfferTtl` 接受正的安全整数毫秒或 `P7D`、`PT1H30M`、`P2W` 等固定 ISO 时长；拒绝年、月、零、缺失输入与非法形式。默认值归调用方。

`Instant` 精度为毫秒，RFC 3339 的亚毫秒部分会舍入，不能当作任意精度时间类型。`timingFrom` 在加法超出安全范围时返回 `'unavailable'`。无法落在四位年 RFC 3339 表示范围的格式化会抛 `RangeError`。只检查形状的 `validate` 不能替代 `parseOfferTiming` 的跨字段校验。`./schema/v1` 保留的是 v1 资源，不是完整 v1 行为 API；`./testing` 只供测试。

## 开发

```sh
pnpm --filter @omne-harness-lite/offer-expiry run build
pnpm --filter @omne-harness-lite/offer-expiry run typecheck
pnpm --filter @omne-harness-lite/offer-expiry run test
```

先构建 workspace 依赖。这些检查覆盖本包；组合行为需针对实际消费者与提供者验证。

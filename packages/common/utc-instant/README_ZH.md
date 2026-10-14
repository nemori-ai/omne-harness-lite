# @omne-harness/utc-instant

[English](README.md)

UTC 时间点与 SI 秒时长的纯值，带唯一的比较函数和一份内嵌的 IERS 闰秒表。

## 职责与状态

本成员拥有 UTC 时间点、SI 秒时长、`compareInstants`，以及判定哪一个秒 60 存在的闰秒表。位置 `packages/common/utc-instant` 是共同组说明里已经采用的目标。Issue #244 实现本成员。

已经实现的是：时间点的解析、编码和精确比较，时长的解析和编码，以及带来源、版本和失效日的闰秒表。比较不调用 `Date` 或 `Number`。`src` 里的源码不使用 `Date`、`Number`、`parseInt` 或 `parseFloat`。

本包不提供时钟。墙钟、单调钟和业务时钟是三个读取端口，由各自的拥有者在本包之外实现。本包没有读取当前时间的函数，也没有以 `Date.now` 为默认值的参数。本包也不提供时长比较、加减、时区和业务期限。这些归各自的拥有者。

## 使用

```ts
import {
  compareInstants,
  encodeDuration,
  encodeInstant,
  parseDuration,
  parseInstant,
} from '@omne-harness/utc-instant'

const leap = parseInstant('2016-12-31T23:59:60Z')
const next = parseInstant('2017-01-01T00:00:00Z')
if (leap.ok && next.ok) compareInstants(leap.value, next.value) // -1

const later = parseInstant('2026-10-14T12:00:00.5005Z')
const earlier = parseInstant('2026-10-14T12:00:00.500Z')
if (later.ok && earlier.ok) {
  compareInstants(later.value, earlier.value) // 1
  encodeInstant(earlier.value) // '2026-10-14T12:00:00.500Z'
}

const timeout = parseDuration('PT1.0000000000000001S')
if (timeout.ok) encodeDuration(timeout.value) // 'PT1.0000000000000001S'
parseDuration('P1D') // { ok: false, failure: { kind: 'calendar-unit' } }
```

每个解析函数返回 `{ ok: true, value }` 或 `{ ok: false, failure }`。只有解析函数能得到 `Instant` 或 `Duration`。对每一个被接受的文本，`encodeInstant(parseInstant(text).value)` 都返回 `text`。时长也遵守同一条规律。`0.5` 与 `0.500` 比较相等，各自保留原来的文本。

本包没有依赖，也没有 Cordis 入口。`exports` 只有 `.` 一项。其中 `source` 条件指向 `src/index.ts`，`types` 和 `import` 条件指向 `dist`。`files` 只发布 `dist`。`build` 先删除 `dist` 再运行 `tsc`。`tsconfig.build.json` 打开 `erasableSyntaxOnly`。

## 契约

行为拥有者是共同组说明和已接受的 #221 决定。本节列出调用方能看到的失败。精确形状以导出的 TypeScript 类型为准。

| 函数 | 失败 `kind` | 条件 |
| --- | --- | --- |
| `parseInstant` | `syntax` | 文本不是 `YYYY-MM-DDTHH:MM:SS[.数字]Z`。`T` 和 `Z` 必须大写。 |
| `parseInstant` | `offset` | 文本以 `+00:00` 这类数字偏移结尾。只接受 `Z`。 |
| `parseInstant` | `range` | 日历字段不可能成立，例如 `2026-02-29` 或 `24:00:00`。`23:59` 以外的秒 60 也是 `range`。 |
| `parseInstant` | `leap-second` | 表没有在那一天插入秒 60（`detail: 'not-inserted'`），或表删除了那一天的秒 59（`detail: 'deleted'`）。 |
| `parseInstant` | `leap-data-expired` | 秒 60 不在表中，并且该时间点不早于表的失效日。 |
| `parseDuration` | `syntax` | 文本不是 `PT<数字>[.<数字>]S` 或 `-PT<数字>[.<数字>]S`。重复的秒单位，例如 `PT5S5S`，是 `syntax`，不是 `calendar-unit`。 |
| `parseDuration` | `calendar-unit` | 文本使用了秒以外的单位，例如 `P1D`、`PT1M` 或 `PT1H`。 |
| `readLeapSecondData` | `syntax` | 某一行不符合 IERS 格式，或 `#$` 行、`#@` 行缺失或重复。 |
| `readLeapSecondData` | `step` | 第一行数据不是 NTP `2272060800` 偏移 `10`，数据行没有向后推进，某一行不在零点，或 TAI-UTC 的变化超过一秒。 |

闰秒规则：

- 只有表列为正闰秒插入的那一天，秒 60 才能解析。已列入的插入在表失效后仍然有效。
- `leap-seconds.list` 的第一行数据必须是 1972-01-01 的起始偏差 10，不是一次插入。从更晚处开始的表是截断表，按 `step` 失败。之后每一个 `+1` 行在前一天插入 `23:59:60`。行尾可以是 LF 或 CRLF。
- `-1` 行删除前一天的 `23:59:59`。内嵌表没有删除。测试用标明为测试数据的表覆盖这条规则。
- 表失效后，普通时间点仍然可以解析，包括月末的 `23:59:59`。

`parseInstant(text, table)` 用 `table` 代替内嵌的 `leapSecondData`。表由 `readLeapSecondData(text, source)` 得到。`leapSecondData.source` 是字符串。`leapSecondData.version` 和 `leapSecondData.expires` 是 `Instant`，用 `compareInstants` 比较。

`Instant`、`Duration` 和 `LeapSecondData` 是不透明的值。它们的 `toJSON` 和 `toString` 方法抛出 `TypeError`，所以 `JSON.stringify` 不会把它们写成 `{}`，`String(value)` 和模板字符串也不会写成 `[object Object]`。需要文本时用编码函数。`encodeInstant`、`compareInstants` 和 `encodeDuration` 收到不是解析函数产生的值时，抛出 `TypeError`。`new value.constructor(...)` 同样抛出 `TypeError`，因为构造函数要求只有模块自己持有的标记。

## 设计

| 模块 | 职责 |
| --- | --- |
| `src/index.ts` | 重新导出七个运行时名字，以及类型 `Instant`、`Duration`、`LeapSecondData`、`InstantFailure`、`InstantParse`、`DurationFailure`、`DurationParse` 和 `LeapSecondDataRead`。 |
| `src/instant.ts` | 拥有 `Instant` 和 `LeapSecondData`，负责解析、编码、比较，并组装 `leapSecondData`。 |
| `src/duration.ts` | 拥有 `Duration` 及其解析和编码。 |
| `src/leap-seconds.ts` | 读取 IERS 格式，返回带民用文本的普通数据。它不导入 `instant.ts`。 |
| `src/leap-seconds.generated.ts` | 保存 `resources/leap-seconds.list` 的文本，由 `scripts/embed-leap-seconds.mjs` 写出。 |

`Instant` 用两个私有字段保存两个字符串。第一个是定宽的民用文本 `YYYY-MM-DDTHH:MM:SS`。第二个是原样的小数数字。`compareInstants` 先按字符串次序比较民用文本，再逐位比较小数，缺少的位按 `0` 读。因此秒 60 排在次日零点之前。

`Duration` 用一个私有字段保存被接受的原文。`LeapSecondData` 保存来源、版本与失效时间点，以及插入日和删除日的集合。

生成模块让闰秒表进入 `dist`。本包运行时不读文件系统，也不访问网络。

## 配置与运行

本包不读环境变量，也不等待任何时钟。内嵌表是本成员拥有的资源：

| 项 | 值 |
| --- | --- |
| 来源 | [IERS `leap-seconds.list`](https://hpiers.obspm.fr/iers/bul/bulc/ntp/leap-seconds.list)。它与 [IANA 副本](https://data.iana.org/time-zones/tzdb/leap-seconds.list)逐字节相同。 |
| 版本，`#$` 行 | `3992312697`，即 `2026-07-06T07:44:57Z` |
| 失效日，`#@` 行 | `4023129600`，即 `2027-06-28T00:00:00Z` |

本包没有时钟，所以不判断表现在是否过期。需要知道的调用方，用自己拥有的时钟读数与 `leapSecondData.expires` 比较。

## 验证

适用的测试是单元测试，以及从公开入口 `@omne-harness/utc-instant` 做的契约测试。期望值是字面量，测试不用 `Date` 或 `Number` 计算它们。集成测试和端到端旅程不适用，因为本包没有存储、服务或用户旅程。

| 测试文件 | 核对内容 |
| --- | --- |
| `tests/public-entry.spec.ts` | 运行时导出的精确集合。 |
| `tests/public-types.spec-d.ts` | 失败类型和结果类型从包入口导出。 |
| `tests/instant.spec.ts` | 时间点文法、失败、往返、比较和不透明值。 |
| `tests/duration.spec.ts` | 时长文法、`calendar-unit`、往返和不透明值。 |
| `tests/leap-seconds.spec.ts` | 秒 60、失效边界、调用方提供的表、删除和读表失败。 |
| `tests/leap-seconds-resource.spec.ts` | 内嵌文本等于 `resources/leap-seconds.list`，并且文件符合它自带的 `#h` SHA-1 哈希。 |
| `tests/consumption.spec.ts` | 消费者只通过包名往返一个时间点和一个时长。 |

在本目录运行 `pnpm test` 和 `pnpm build`。`pnpm test` 先构建，测试导入的是 `dist`。

未覆盖：`readLeapSecondData` 不核对调用方文件的 `#h` 哈希。只有测试核对内嵌文件的哈希。本包不证明持久时钟或物理时钟正确。

## 维护

已点名的消费者是 `packages/identity/identity` 和 `packages/tool/tool`，二者仍是空草稿。业务期限、租约恢复和时钟端口留在各自的拥有者。`compareInstants` 或失败名字变化时，#244 和这些消费者一起改。

更新闰秒表：

1. 从 IERS 来源下载当前文件到 `resources/leap-seconds.list`。不要编辑文件内容。
2. 在本目录运行 `pnpm run leap-seconds:embed`。
3. 更新 `tests/leap-seconds.spec.ts` 和两份 README 里内嵌表的版本与失效日字面量。包从文件推导这两个时间点，`src/instant.ts` 里没有要改的数字副本。
4. 运行 `pnpm test` 和 `pnpm build`。

# XML 格式化

`@omne-harness-lite/xml-format` 把数据对象按声明式 schema 渲染为面向模型的 XML
文本。schema 是数据而不是基类：任何暴露所声明字段的普通对象、类实例或 `Map`
都能渲染。转义、缩进和标签闭合由本包负责，数据本身无法伪造或破坏外层标签，
适合系统提醒、工具结果和外部输入等信封。

来源：`omne-next` 提交 `6263fed545e4`（2026-09-12）的
`omne_core_v1/libs/omne_core_v1/omne_core_v1/data_model/xml_format/`。
与 [unix-format](../unix-format/README.md) 并列，后者产出纯文本。

## 用法

```ts
import { formatXml, type XmlSchema } from '@omne-harness-lite/xml-format'

const reminder: XmlSchema = {
  tag: 'system_reminder',
  requiredFields: {
    reminderType: { presentation: 'attr', xmlName: 'type' },
    asOf: { presentation: 'attr', xmlName: 'as_of', includeWhen: 'not_nullish' },
    body: { presentation: 'content' },
  },
  optionalFields: {
    debug: { includeWhen: 'not_empty' },
  },
}

formatXml({ reminderType: 'broadcast', asOf: '2026-07-27T08:00:00+00:00', body: 'observed' }, reminder)
// <system_reminder type="broadcast" as_of="2026-07-27T08:00:00+00:00">
//   observed
// </system_reminder>
```

公开入口只有 `formatXml(value, schema, options?)`、类型 `XmlSchema` /
`FieldSpec` / `FormattingOptions`、接口 `XmlFormattable`（`toXml(options?)`）和
`isXmlFormattable`，以及 `escapeXmlContent`、`escapeXmlAttribute`、`isXmlName`、
`resolveFormattingOptions`、`applyFieldOverride`。需要让对象自渲染时，在类里实现
`toXml` 并在其中调用 `formatXml(this, schema, options)`；嵌套值若实现了
`XmlFormattable`，其输出原样嵌入，不再包一层元素。

`FieldSpec` 的 `presentation` 取 `attr` / `element` / `content`（默认
`element`）；`includeWhen` 取 `always` / `not_nullish` / `not_empty`（默认
`always`）；`xmlName` 覆盖名称，默认取字段路径最后一段且不做大小写转换；
`attrs` 给元素附加属性；`itemTag` 与 `itemFields` 控制数组项。字段路径可用点号
读取嵌套属性或 `Map` 键，缺失路径视为 `undefined`。

`FormattingOptions`：`indentSize`（0 到 8，默认 2）、`omitRootTag`、
`extraFields`（选择 `optionalFields`，按声明顺序渲染）、`fieldOverrides`（改
presentation）、`manualAttributes`（追加到根元素）、`formatDate`（默认
`toISOString`）。未声明的 `extraFields` 或 `fieldOverrides` 名称、越界的
`indentSize`、非法的标签或属性名都会抛错，而不是静默产出损坏的标记。

## 渲染规则

| 值 | 文本 |
|---|---|
| `null` / `undefined` | 空串；`includeWhen` 决定是否出现 |
| 布尔 | `true` / `false` |
| `Date` | `options.formatDate`，默认 UTC ISO 文本 |
| 数字、bigint、字符串 | `String(value)` |
| 标量数组 | 逗号加空格连接；设置 `itemTag` 时每项包成 `<itemTag>…</itemTag>` |
| 对象数组 | 每项一个 `itemTag` 元素（默认 `item`）；短标量作属性、其余作子元素，`itemFields` 可指定；项若实现 `XmlFormattable` 则调用 `toXml` |
| 实现 `XmlFormattable` 的对象 | `toXml` 输出原样嵌入 |
| `Map` 或普通对象 | 每行 `key: value`，数组值逗号连接；作为对象数组项的属性时压成 `key: value; key2: value2` |

元素总是三行形态 `<name>` / 缩进内容 / `</name>`；没有子元素也没有内容时根元素
自闭合，空串内容视为无内容。`omitRootTag` 只返回子元素与内容，不缩进、不带根
属性。嵌套对象的 `toXml` 只收到 `indentSize` 与 `formatDate`，不继承父级的字段
选择、覆盖和手工属性。

## 与来源实现的差异

| 来源 | 本包 | 原因 |
|---|---|---|
| `XMLFormatMixin` 类变量 `__xml_tag__` 等 | `XmlSchema` 数据加 `formatXml` 函数 | TS 无 Pydantic/mixin 惯例；schema 与数据分离更直接 |
| `include_when` 的 `not_none` / `not_default` | `not_nullish`；无 `not_default` | 来源里 `not_default` 只是 `not_none` 的别名，不再承诺不存在的语义 |
| `FormattingOptions.timezone` / `include_timestamps` | `formatDate` 钩子；无 `include_timestamps` | JS 无内建时区转换；`include_timestamps` 在来源 mixin 中从未被读取 |
| `RuntimeFieldOverride.include`、`FieldSpec.nested_fields` | 未移植 | 来源声明但未实现 |
| 复杂列表以 `BaseModel` 判定，`dict` 列表按 `str()` 连接 | 任何非 `Date` 对象项都按对象项渲染 | TS 没有 model 与 dict 之分 |
| TimeWindow-like（`start` / `end`）特判 | 未移植 | 属于来源数据模型的泄漏；需要时由该类型自行实现 `toXml` |
| 嵌套 `to_xml` 收到父级完整 options | 只传 `indentSize` 与 `formatDate` | 父级的字段选择与手工属性不属于子对象 |
| `extra_fields` 为集合，渲染顺序随哈希 | 按 `optionalFields` 声明顺序 | 相同输入应产出相同字节 |
| 未知字段名、非法名称静默忽略 | 抛错 | 错误尽早暴露 |
| `ContextBlockXMLTransformer` / `ContextAssemblyProtocol` | 未移植 | 它们编排 omne_core 的上下文块模型（category/kind/created_at 与命名空间分组），本项目尚无该模型；待上下文装配设计明确后再按需引入 |

## 开发与证据

在仓库根按[开发指南](../../../docs/development.md)安装依赖后，从本叶子执行
`pnpm run build`、`pnpm run typecheck` 与 `pnpm test`；测试通过包名消费构建产物，
不使用源码 alias。本包没有运行依赖，也不发布到 npm；来源记录见
[provenance](provenance.json)。

与 Python 原实现的逐字节差分基线固定在
[evidence/differential](evidence/differential/README.md)，由
`tests/differential.spec.ts` 随 `pnpm test` 持续核对；上表所列差异之外的行为
均与原实现相同。

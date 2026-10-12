# @omne-harness-lite/xml-format

[English](README.md)

用于模型可读文本的声明式 XML 格式化。选取对象或 `Map` 的字段，将它们放入属性、子元素或正文，得到一个字符串。没有运行时依赖，可独立于 Cordis 使用。

本包当前是私有、尚未发布的 ESM workspace 成员。构建检出后，从 workspace 消费者通过公开包名导入；目前没有可用的 npm 发布版本。Node 与 pnpm 工具链见[开发指南](../../../docs/development.md)。

## 公开 API

| 用途         | 导出                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 字段渲染     | `formatXml`, `XmlSchema`, `FieldSpec`, `FieldSpecs`, `FieldPresentation`, `IncludeWhen`                                                                              |
| 渲染选项     | `FormattingOptions`, `ResolvedFormattingOptions`, `RuntimeFieldOverride`, `resolveFormattingOptions`, `applyFieldOverride`, `DEFAULT_INDENT_SIZE`, `MAX_INDENT_SIZE` |
| 转义与名称   | `escapeXmlContent`, `escapeXmlAttribute`, `isXmlName`                                                                                                                |
| 可信渲染钩子 | `XmlFormattable`, `isXmlFormattable`                                                                                                                                 |

## 选择字段并转义文本

```ts
import assert from 'node:assert/strict'
import { formatXml, type XmlSchema } from '@omne-harness-lite/xml-format'

const schema: XmlSchema = {
  tag: 'note',
  requiredFields: {
    id: { presentation: 'attr' },
    title: { presentation: 'element' },
  },
  optionalFields: {
    priority: { presentation: 'attr', includeWhen: 'not_nullish' },
  },
}
const xml = formatXml(
  { id: 'n"1', title: 'Tea & <biscuits>', priority: 0, internal: 'omitted' },
  schema,
  { extraFields: ['priority'] },
)
assert.equal(
  xml,
  '<note id="n&quot;1" priority="0">\n  <title>\n    Tea &amp; &lt;biscuits&gt;\n  </title>\n</note>',
)
console.log(xml)
```

schema 是渲染说明，不是数据校验 schema。先按声明顺序渲染 requiredFields，再按声明顺序渲染选中的 optionalFields。`always` 将 null 或 undefined 渲染为空文本；`not_nullish` 跳过这两类值；`not_empty` 还跳过空字符串和空集合。零与 `false` 会保留。`metadata.kind` 这样的点分路径逐段读取属性或 `Map` 键。

## 渲染数组与日期

```ts
import assert from 'node:assert/strict'
import { formatXml, type XmlSchema } from '@omne-harness-lite/xml-format'

const schema: XmlSchema = {
  tag: 'report',
  requiredFields: {
    asOf: { presentation: 'attr', xmlName: 'as_of' },
    tags: { itemTag: 'tag' },
  },
}
const xml = formatXml(
  {
    asOf: new Date('2026-09-26T12:00:00Z'),
    tags: ['ready', 'R&D'],
  },
  schema,
)
assert.ok(xml.includes('as_of="2026-09-26T12:00:00.000Z"'))
assert.ok(xml.includes('<tag>R&amp;D</tag>'))
console.log(xml)
```

不指定 `itemTag` 时，标量数组以 `, ` 连接。对象数组使用 `itemTag`（默认 `item`）和 `itemFields` 决定每个属性的位置；未指定的短字符串、数字和布尔值作为属性，其他值作为子元素。Date 默认使用 UTC `toISOString()`，含毫秒与 `Z`；用 `formatDate` 可以选择另一种写法。默认日期写法与来源 Python 的日期写法不同，不承诺一般跨语言逐字节等价。

## 嵌入可信渲染钩子

```ts
import assert from 'node:assert/strict'
import { formatXml, isXmlFormattable, type XmlFormattable } from '@omne-harness-lite/xml-format'

// The caller supplies and owns the validity of this raw XML fragment.
const reference: XmlFormattable = {
  toXml: () => '<reference id="ref-1"/>',
}
assert.equal(isXmlFormattable(reference), true)
const xml = formatXml(
  { reference },
  {
    tag: 'note',
    requiredFields: { reference: {} },
  },
)
assert.equal(xml, '<note>\n  <reference id="ref-1"/>\n</note>')
console.log(xml)
```

`toXml` 提供原样 markup；格式化器不对它转义、解析、校验或沙箱执行。`isXmlFormattable` 只检查是否有可调用钩子，不检查 XML 是否合法。嵌套钩子只接收 `indentSize` 和 `formatDate`，不会收到父级的选字段、override 或手工属性。属性 getter 与 `formatDate` 同样执行调用者代码，其异常原样传播。

## 选项、错误与边界

`indentSize` 是 0 到 8 的整数，默认 2；非法值抛 `RangeError`。`fieldOverrides` 改变已声明字段的呈现方式，`manualAttributes` 追加根属性。未声明的可选字段选择或 override 会抛错。`omitRootTag: true` 返回内片段，丢弃根属性，因此结果不一定是完整 XML 文档。

普通文本与属性路径会转义 XML 元字符，并以 `TypeError` 拒绝非法 XML 1.0 字符，包括禁用的控制字符和未配对 surrogate。生成元素上的重复属性同样抛 `TypeError`，包括与 `manualAttributes` 的冲突。名称只接受保守 ASCII 子集 `[A-Za-z_][A-Za-z0-9_.-]*`，不包含 namespace 前缀。

本包不解析 XML、不解析实体，不提供 canonical XML、namespace 或任意对象的安全执行。普通转义不校验原样钩子输出。调用者负责选择数据、可信钩子以及生成字符串的使用位置。

开发本包时运行该成员的 `build`、`typecheck` 和 `test` 脚本。源码归属与适配记录见 [provenance.json](provenance.json)。

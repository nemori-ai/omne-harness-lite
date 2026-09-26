# @omne-harness-lite/xml-format

[中文](README_ZH.md)

Declarative XML formatting for model-readable text. Select fields from an object
or `Map`, place them in attributes, child elements, or content, and receive a
string. The package has no runtime dependencies and works independently of Cordis.

This is currently a private, unpublished ESM workspace package. Use its public
package import from a workspace consumer after building the checkout; an npm
release is not available. See the [development guide](../../../docs/development.md)
for the Node and pnpm toolchain.

## Public API

| Purpose                 | Exports                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render fields           | `formatXml`, `XmlSchema`, `FieldSpec`, `FieldSpecs`, `FieldPresentation`, `IncludeWhen`                                                                              |
| Rendering options       | `FormattingOptions`, `ResolvedFormattingOptions`, `RuntimeFieldOverride`, `resolveFormattingOptions`, `applyFieldOverride`, `DEFAULT_INDENT_SIZE`, `MAX_INDENT_SIZE` |
| Escaping and names      | `escapeXmlContent`, `escapeXmlAttribute`, `isXmlName`                                                                                                                |
| Trusted rendering hooks | `XmlFormattable`, `isXmlFormattable`                                                                                                                                 |

## Select fields and escape text

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

The schema is a rendering description, rather than a data-validation schema.
Required fields render first, then selected optional fields, in declaration order.
`always` renders nullish values as empty text; `not_nullish` skips them;
`not_empty` also skips empty strings and collections. Zero and `false` are kept.
Dot-separated paths such as `metadata.kind` traverse properties or `Map` keys.

## Render arrays and dates

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

Without `itemTag`, scalar arrays join with `, `. Object arrays use `itemTag`
(default `item`) and `itemFields` to choose each property’s placement; unspecified
short string, number, or boolean properties become attributes, and other values
become child elements. Dates default to UTC `toISOString()`, including milliseconds
and `Z`; supply `formatDate` to choose another spelling. This default differs from
the originating Python date spelling. No general cross-language byte equivalence
is promised.

## Embed a trusted rendering hook

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

`toXml` supplies raw markup; the formatter does not escape, parse, validate, or
sandbox it. `isXmlFormattable` checks for a callable hook, not valid XML. Nested
hooks receive only `indentSize` and `formatDate`, not the parent’s field selection,
overrides, or manual attributes. Property getters and `formatDate` also execute
caller code, and their exceptions propagate unchanged.

## Options, errors, and boundaries

`indentSize` is an integer from 0 to 8, default 2; invalid values throw
`RangeError`. `fieldOverrides` changes a declared field’s presentation.
`manualAttributes` appends root attributes. Unknown optional-field selections or
overrides throw. `omitRootTag: true` returns the inner fragment and discards root
attributes, so the result need not be a complete XML document.

Ordinary text and attribute paths escape XML metacharacters and reject illegal
XML 1.0 characters with `TypeError`, including forbidden control characters and
unpaired surrogates. Duplicate attributes on a generated element also throw
`TypeError`, including collisions with `manualAttributes`. Names use the conservative
ASCII subset `[A-Za-z_][A-Za-z0-9_.-]*`; this excludes namespace prefixes.

The package does not parse XML, resolve entities, or provide canonical XML,
namespaces, or safe execution of arbitrary objects. Ordinary escaping does not
validate raw hook output. Callers choose the data, trusted hooks, and destination
where the generated string is used.

For package development, run this member's `build`, `typecheck`, and `test`
scripts. Source attribution and adaptations are recorded in
[provenance.json](provenance.json).

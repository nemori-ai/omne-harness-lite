# @omne-harness/xml-format

[中文](README_ZH.md)

Pure functions that render a value as XML text from a field declaration. This member is a port of the sealed `packages.0.0.1.legacy/util/xml-format` package. The function names and the tested output bytes are unchanged. The package name is `@omne-harness/xml-format`.

## Responsibility and status

The member owns XML name checks, text escaping, and `formatXml`. It does not own a schema registry, a parser, or an application command. Behavior that the types do not state is in [SPEC.md](SPEC.md). The characterization tests under `tests/` are the pin for output bytes.

## Usage

```ts
import { formatXml, type XmlSchema } from '@omne-harness/xml-format'

const schema: XmlSchema = {
  tag: 'root',
  requiredFields: { x: { presentation: 'attr' } },
}

formatXml({ x: '😀' }, schema)
```

The call above returns `<root x="😀"/>`.

## Contracts

`formatXml(value, schema, options?)` returns one XML element. Attribute and element order follow the field declaration. Text is escaped. A `Set` renders like an array of its values. A list of self-rendering objects is embedded without an extra field element. A mixed list keeps the field element. A nested `toXml` receives only `indentSize` and `formatDate`.

`FieldSpec` separates presentations. `attr` and `content` cannot carry `attrs`, `itemTag`, or `itemFields`. Omitting `presentation` means an element. `escapeXmlContent` and `escapeXmlAttribute` escape text. `isXmlName` reports whether a string is an XML name. Illegal XML 1.0 characters throw `TypeError` on every rendering path. `extraFields` names that are not declared as optional fields throw.

## Design

`src/format.ts` selects fields and renders them. `src/escape.ts` owns escaping and name checks. `src/options.ts` resolves indent and field overrides. `src/types.ts` holds the schema types. `src/index.ts` re-exports the public surface. Callers import the package name, not a source file.

## Configuration and operation

`FormattingOptions` selects indent size and manual attributes. The default indent and the maximum indent are the exported constants `DEFAULT_INDENT_SIZE` and `MAX_INDENT_SIZE`. The functions do not read the environment or the filesystem.

Node `>=24`. There is no runtime dependency.

## Verification

`pnpm test` builds, then runs the characterization suite copied from the sealed package. `pnpm run typecheck` builds, then typechecks the tests. The suite includes the illegal-character cases and the plain-Node import of `dist/index.js`.

## Maintenance

A change to an output string or an error message updates SPEC.md and the matching test in the same change. Do not add a dependency on an application or on `unix-format`. Do not import this package from the sealed tree.

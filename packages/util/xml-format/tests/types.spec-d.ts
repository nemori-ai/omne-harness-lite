import { expectTypeOf, it } from 'vitest'
import {
  DEFAULT_INDENT_SIZE,
  MAX_INDENT_SIZE,
  applyFieldOverride,
  escapeXmlAttribute,
  escapeXmlContent,
  formatXml,
  isXmlFormattable,
  isXmlName,
  resolveFormattingOptions,
  type FieldPresentation,
  type FieldSpec,
  type FieldSpecs,
  type FormattingOptions,
  type IncludeWhen,
  type ResolvedFormattingOptions,
  type RuntimeFieldOverride,
  type XmlFormattable,
  type XmlSchema,
} from '@omne-harness/xml-format'

it('XF7-TYPES consumes all public formatting declarations', () => {
  const presentation: FieldPresentation = 'element'
  const includeWhen: IncludeWhen = 'not_nullish'
  const field: FieldSpec = {
    presentation,
    includeWhen,
    attrs: { a: '1' },
    itemTag: 'item',
    itemFields: { a: 'attr' },
  }
  const fields: FieldSpecs = { value: field }
  const schema: XmlSchema = { tag: 'root', requiredFields: fields, optionalFields: {} }
  const override: RuntimeFieldOverride = { presentation: 'attr' }
  const options: FormattingOptions = {
    indentSize: 0,
    extraFields: new Set<string>(),
    fieldOverrides: { value: override },
    manualAttributes: { a: '1' },
    formatDate: date => date.toISOString(),
  }
  const resolved: ResolvedFormattingOptions = resolveFormattingOptions(options)
  expectTypeOf(resolved.extraFields).toEqualTypeOf<ReadonlySet<string>>()
  expectTypeOf(applyFieldOverride(field, override)).toEqualTypeOf<FieldSpec>()
  expectTypeOf(formatXml({ value: 'text' }, schema, options)).toEqualTypeOf<string>()
  expectTypeOf(escapeXmlAttribute('text')).toEqualTypeOf<string>()
  expectTypeOf(escapeXmlContent('text')).toEqualTypeOf<string>()
  expectTypeOf(isXmlName('root')).toEqualTypeOf<boolean>()
  expectTypeOf(DEFAULT_INDENT_SIZE).toEqualTypeOf<number>()
  expectTypeOf(MAX_INDENT_SIZE).toEqualTypeOf<number>()
  const unknown: unknown = { toXml: () => '<child/>' }
  if (isXmlFormattable(unknown)) expectTypeOf(unknown).toEqualTypeOf<XmlFormattable>()
})

it('XF7-NEGATIVES rejects schema and option shape mismatches', () => {
  // @ts-expect-error schema requires explicit requiredFields
  formatXml({}, { tag: 'root' })
  // @ts-expect-error scalars do not expose declared fields
  formatXml('text', { tag: 'root', requiredFields: {} })
  // @ts-expect-error presentation is a closed declaration
  const field: FieldSpec = { presentation: 'raw' }
  // @ts-expect-error attributes are text, not guessed data conversion
  const attrs: FormattingOptions = { manualAttributes: { a: 1 } }
  // @ts-expect-error formatDate returns text synchronously
  resolveFormattingOptions({ formatDate: () => Promise.resolve('date') })
  // @ts-expect-error explicit undefined is not an absent field
  resolveFormattingOptions({ indentSize: undefined })
  expectTypeOf(field).toEqualTypeOf<FieldSpec>()
  expectTypeOf(attrs).toEqualTypeOf<FormattingOptions>()
})

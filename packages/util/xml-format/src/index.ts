export type { FieldPresentation, FieldSpec, FieldSpecs, IncludeWhen, XmlSchema } from './types.ts'
export {
  DEFAULT_INDENT_SIZE,
  MAX_INDENT_SIZE,
  applyFieldOverride,
  resolveFormattingOptions,
  type FormattingOptions,
  type NestedFormattingOptions,
  type ResolvedFormattingOptions,
  type RuntimeFieldOverride,
} from './options.ts'
export { escapeXmlAttribute, escapeXmlContent, isXmlName } from './escape.ts'
export { formatXml, isXmlFormattable, type XmlFormattable } from './format.ts'

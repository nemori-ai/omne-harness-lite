export type { FieldPresentation, FieldSpec, FieldSpecs, IncludeWhen, XmlSchema } from './types.js'
export {
  DEFAULT_INDENT_SIZE,
  MAX_INDENT_SIZE,
  applyFieldOverride,
  resolveFormattingOptions,
  type FormattingOptions,
  type ResolvedFormattingOptions,
  type RuntimeFieldOverride,
} from './options.js'
export { escapeXmlAttribute, escapeXmlContent, isXmlName } from './escape.js'
export { formatXml, isXmlFormattable, type XmlFormattable } from './format.js'

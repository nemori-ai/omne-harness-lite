/**
 * Runtime options for rendering one object.
 *
 * Options select optional fields, override presentations and decorate the root
 * element. They are resolved and validated once per `formatXml` call; nested
 * objects rendered through their own `toXml` receive only the rendering
 * settings (`indentSize`, `formatDate`), never the field selection of their parent.
 */

import type { FieldPresentation, FieldSpec } from './types.ts'

/** Runtime override of one declared field. */
export interface RuntimeFieldOverride {
  /** Replace the declared presentation. Unset keeps the declaration. */
  readonly presentation?: FieldPresentation
}

/** Options accepted by `formatXml` and by `XmlFormattable.toXml`. */
export interface FormattingOptions {
  /** Spaces per indentation level, an integer from 0 to 8. Defaults to 2. */
  readonly indentSize?: number
  /**
   * Return only the child elements and content, without the root element and
   * without its attributes; the inner text is not indented.
   */
  readonly omitRootTag?: boolean
  /** Names of `optionalFields` to render. Unknown names are rejected. */
  readonly extraFields?: Iterable<string>
  /** Presentation overrides by field path. Paths must be declared by the schema. */
  readonly fieldOverrides?: Readonly<Record<string, RuntimeFieldOverride>>
  /** Extra attributes appended to the root element after the field attributes. */
  readonly manualAttributes?: Readonly<Record<string, string>>
  /** Renders `Date` values. Defaults to `Date.prototype.toISOString` (UTC). */
  readonly formatDate?: (date: Date) => string
}

/** Options with every default applied. */
export interface ResolvedFormattingOptions {
  readonly indentSize: number
  readonly omitRootTag: boolean
  readonly extraFields: ReadonlySet<string>
  readonly fieldOverrides: Readonly<Record<string, RuntimeFieldOverride>>
  readonly manualAttributes: Readonly<Record<string, string>>
  readonly formatDate: (date: Date) => string
}

export const DEFAULT_INDENT_SIZE = 2
export const MAX_INDENT_SIZE = 8

function defaultFormatDate(date: Date): string {
  return date.toISOString()
}

/** Apply defaults and validate `indentSize`. */
export function resolveFormattingOptions(
  options: FormattingOptions = {},
): ResolvedFormattingOptions {
  const indentSize = options.indentSize ?? DEFAULT_INDENT_SIZE
  if (!Number.isInteger(indentSize) || indentSize < 0 || indentSize > MAX_INDENT_SIZE) {
    throw new RangeError(
      `indentSize must be an integer from 0 to ${MAX_INDENT_SIZE}, got ${String(indentSize)}`,
    )
  }
  return {
    indentSize,
    omitRootTag: options.omitRootTag ?? false,
    extraFields: new Set(options.extraFields ?? []),
    fieldOverrides: options.fieldOverrides ?? {},
    manualAttributes: options.manualAttributes ?? {},
    formatDate: options.formatDate ?? defaultFormatDate,
  }
}

/** The rendering settings a nested object inherits from its parent. */
export function nestedFormattingOptions(options: ResolvedFormattingOptions): FormattingOptions {
  return { indentSize: options.indentSize, formatDate: options.formatDate }
}

/** Return `spec` with the override's presentation applied, or `spec` itself when nothing changes. */
export function applyFieldOverride(
  spec: FieldSpec,
  override: RuntimeFieldOverride | undefined,
): FieldSpec {
  if (override?.presentation === undefined) return spec
  return { ...spec, presentation: override.presentation }
}

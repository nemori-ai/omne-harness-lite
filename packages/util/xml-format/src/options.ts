import type { FieldPresentation, FieldSpec } from './types.ts'

export interface RuntimeFieldOverride {
  readonly presentation?: FieldPresentation
}

export interface NestedFormattingOptions {
  readonly indentSize?: number
  readonly formatDate?: (date: Date) => string
}
export interface FormattingOptions {
  readonly indentSize?: number
  readonly omitRootTag?: boolean
  readonly extraFields?: Iterable<string>
  readonly fieldOverrides?: Readonly<Record<string, RuntimeFieldOverride>>
  readonly manualAttributes?: Readonly<Record<string, string>>
  readonly formatDate?: (date: Date) => string
}

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

export function nestedFormattingOptions(
  options: ResolvedFormattingOptions,
): NestedFormattingOptions {
  return { indentSize: options.indentSize, formatDate: options.formatDate }
}

export function applyFieldOverride(
  spec: FieldSpec,
  override: RuntimeFieldOverride | undefined,
): FieldSpec {
  if (override?.presentation === undefined) return spec
  return { ...spec, presentation: override.presentation }
}

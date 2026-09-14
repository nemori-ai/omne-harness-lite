/** Render-time configuration shared by the plain-text renderers. */
export interface UnixFormatOptions {
  /**
   * Upper bound on rendered line width. Tables shrink their last column and
   * numbered lines are cut to stay within it. `0` disables the cap.
   */
  readonly maxWidth?: number
  /** Leading spaces for nested section bodies. */
  readonly indent?: number
  /**
   * When `true`, `formatSection` emits `## HEADING` and other renderers may use
   * Markdown fences; when `false`, headings render as `HEADING:` and the output
   * stays plain indented text.
   */
  readonly markdownCompatible?: boolean
}

/** Options with every default applied. */
export interface ResolvedUnixFormatOptions {
  readonly maxWidth: number
  readonly indent: number
  readonly markdownCompatible: boolean
}

export const DEFAULT_UNIX_FORMAT_OPTIONS: ResolvedUnixFormatOptions = Object.freeze({
  maxWidth: 120,
  indent: 2,
  markdownCompatible: true,
})

/** Apply defaults and reject negative or fractional widths. */
export function resolveUnixFormatOptions(
  options: UnixFormatOptions = {},
): ResolvedUnixFormatOptions {
  const maxWidth = options.maxWidth ?? DEFAULT_UNIX_FORMAT_OPTIONS.maxWidth
  const indent = options.indent ?? DEFAULT_UNIX_FORMAT_OPTIONS.indent
  assertNonNegativeInteger(maxWidth, 'maxWidth')
  assertNonNegativeInteger(indent, 'indent')
  return {
    maxWidth,
    indent,
    markdownCompatible:
      options.markdownCompatible ?? DEFAULT_UNIX_FORMAT_OPTIONS.markdownCompatible,
  }
}

export function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${String(value)}`)
  }
}

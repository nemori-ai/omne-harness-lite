export interface UnixFormatOptions {
  readonly maxWidth?: number
  readonly indent?: number
  readonly markdownCompatible?: boolean
}

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

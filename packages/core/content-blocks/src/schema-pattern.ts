import type { RegExpEngine } from 'ajv/dist/types/index.js'

// Exact frozen InlineBytes pattern only. Do not optimize caller-supplied engines.
const inlineBytesPattern =
  '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)(?![\\s\\S])'

function base64Character(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 43 ||
    code === 47
  )
}
function inlineBytes(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false
  let end = value.length
  if (value.charCodeAt(end - 1) === 61) {
    end--
    if (value.charCodeAt(end - 1) === 61) end--
  }
  // The Schema permits non-zero unused padding bits, but no whitespace or suffix.
  // Scan once instead of using V8's input-sized repeated-group backtracking stack.
  for (let index = 0; index < end; index++) {
    if (!base64Character(value.charCodeAt(index))) return false
  }
  return true
}

export const schemaPattern: RegExpEngine = Object.assign(
  (source: string, flags?: string) =>
    source === inlineBytesPattern && flags === 'u'
      ? { test: inlineBytes, toString: () => `optimized:${JSON.stringify([source, flags])}` }
      : new RegExp(source, flags),
  { code: 'require("@omne-harness-lite/content-blocks/code-runtime").schemaPattern' },
)

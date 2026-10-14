import { createScanner, type JSONScanner } from 'jsonc-parser'
import type {
  JsonEntry,
  JsonFailure,
  JsonLimits,
  JsonPathSegment,
  JsonRead,
  JsonSyntaxReason,
  JsonValue,
} from './types.ts'

// jsonc-parser declares SyntaxKind and ScanError as ambient const enums, which
// verbatimModuleSyntax cannot read, so the codes this reader uses are copied here.
const TOKEN = {
  openBrace: 1,
  closeBrace: 2,
  openBracket: 3,
  closeBracket: 4,
  comma: 5,
  colon: 6,
  null: 7,
  true: 8,
  false: 9,
  string: 10,
  number: 11,
  lineComment: 12,
  blockComment: 13,
  lineBreak: 14,
  whitespace: 15,
  eof: 17,
} as const
const SCAN_OK = 0
const SCAN_END_OF_STRING = 2

/** An open container and the token it accepts next. */
type Frame = ArrayFrame | ObjectFrame
type ArrayFrame = {
  readonly kind: 'array'
  readonly items: JsonValue[]
  next: 'first-item' | 'item' | 'comma'
}
type ObjectFrame = {
  readonly kind: 'object'
  readonly entries: JsonEntry[]
  readonly keys: Set<string>
  /** The key of the member whose value is read next. */
  key: string
  next: 'first-key' | 'key' | 'colon' | 'value' | 'comma'
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** Reads one strict JSON document from UTF-8 bytes within the caller's budgets. */
export function readJsonBytes(bytes: Uint8Array, limits: JsonLimits): JsonRead {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be a Uint8Array')
  const parsed = parseLimits(limits)
  let text: string
  try {
    text = utf8.decode(bytes)
  } catch (error) {
    if (error instanceof TypeError) return { kind: 'utf8' }
    throw error
  }
  return readDecoded(text, bytes.length, parsed)
}

/** Reads one strict JSON document from decoded text within the caller's budgets. */
export function readJsonText(text: string, limits: JsonLimits): JsonRead {
  if (typeof text !== 'string') throw new TypeError('text must be a string')
  const parsed = parseLimits(limits)
  if (!text.isWellFormed()) throw new TypeError('text must not contain a lone surrogate')
  return readDecoded(text, utf8Length(text), parsed)
}

function readDecoded(text: string, byteLength: number, limits: JsonLimits): JsonRead {
  if (text.startsWith('\uFEFF')) return { kind: 'bom' }
  if (byteLength > limits.maxBytes) return { kind: 'budget', name: 'bytes' }
  if (/^[ \t\n\r]*$/.test(text)) return { kind: 'empty' }
  return scanDocument(text, limits)
}

function scanDocument(text: string, limits: JsonLimits): JsonRead {
  const scanner = createScanner(text, false)
  const stack: Frame[] = []
  let root: JsonValue | undefined

  const complete = (value: JsonValue): void => {
    const parent = stack.at(-1)
    if (parent === undefined) {
      root = value
    } else if (parent.kind === 'array') {
      parent.items.push(value)
      parent.next = 'comma'
    } else {
      parent.entries.push({ key: parent.key, value })
      parent.next = 'comma'
    }
  }

  const close = (frame: Frame): void => {
    stack.pop()
    complete(
      frame.kind === 'array'
        ? { kind: 'array', items: frame.items }
        : { kind: 'object', entries: frame.entries },
    )
  }

  const startValue = (token: number): JsonFailure | undefined => {
    switch (token) {
      case TOKEN.openBracket:
        stack.push({ kind: 'array', items: [], next: 'first-item' })
        return undefined
      case TOKEN.openBrace:
        stack.push({ kind: 'object', entries: [], keys: new Set(), key: '', next: 'first-key' })
        return undefined
      case TOKEN.null:
        complete({ kind: 'null' })
        return undefined
      case TOKEN.true:
        complete({ kind: 'boolean', value: true })
        return undefined
      case TOKEN.false:
        complete({ kind: 'boolean', value: false })
        return undefined
      case TOKEN.string: {
        const value = readString(scanner, text)
        if (typeof value !== 'string') return value
        complete({ kind: 'string', value })
        return undefined
      }
      case TOKEN.number: {
        const lexeme = readNumber(text, scanner.getTokenOffset())
        if (typeof lexeme !== 'string') return lexeme
        complete({ kind: 'number', lexeme })
        return undefined
      }
      default:
        return syntax('token')
    }
  }

  const stepArray = (frame: ArrayFrame, token: number): JsonFailure | undefined => {
    switch (frame.next) {
      case 'comma':
        if (token === TOKEN.comma) {
          frame.next = 'item'
          return undefined
        }
        if (token !== TOKEN.closeBracket) return syntax('token')
        close(frame)
        return undefined
      case 'first-item':
        if (token !== TOKEN.closeBracket) return startValue(token)
        close(frame)
        return undefined
      case 'item':
        if (token === TOKEN.closeBracket) return syntax('trailing-comma')
        return startValue(token)
    }
  }

  const stepObject = (frame: ObjectFrame, token: number): JsonFailure | undefined => {
    switch (frame.next) {
      case 'comma':
        if (token === TOKEN.comma) {
          frame.next = 'key'
          return undefined
        }
        if (token !== TOKEN.closeBrace) return syntax('token')
        close(frame)
        return undefined
      case 'first-key':
      case 'key': {
        if (token === TOKEN.closeBrace) {
          if (frame.next === 'key') return syntax('trailing-comma')
          close(frame)
          return undefined
        }
        if (token !== TOKEN.string) return syntax('token')
        const key = readString(scanner, text)
        if (typeof key !== 'string') return key
        if (frame.keys.has(key)) return { kind: 'duplicate-key', path: pathTo(stack), key }
        frame.keys.add(key)
        frame.key = key
        frame.next = 'colon'
        return undefined
      }
      case 'colon':
        if (token !== TOKEN.colon) return syntax('token')
        frame.next = 'value'
        return undefined
      case 'value':
        return startValue(token)
    }
  }

  for (;;) {
    const token: number = scanner.scan()
    if (token === TOKEN.whitespace || token === TOKEN.lineBreak) continue
    if (token === TOKEN.lineComment || token === TOKEN.blockComment) return syntax('comment')
    const top = stack.at(-1)
    if (top === undefined && root !== undefined)
      return token === TOKEN.eof ? { kind: 'ok', value: root } : syntax('trailing-content')
    if (token === TOKEN.eof) return syntax('truncated')
    const failure =
      top === undefined
        ? startValue(token)
        : top.kind === 'array'
          ? stepArray(top, token)
          : stepObject(top, token)
    if (failure !== undefined) return failure
  }
}

/** The keys and indexes from the root down to the innermost open container. */
function pathTo(stack: readonly Frame[]): JsonPathSegment[] {
  return stack.slice(0, -1).map(frame => (frame.kind === 'array' ? frame.items.length : frame.key))
}

function readString(scanner: JSONScanner, text: string): JsonFailure | string {
  const error = scanner.getTokenError()
  if (error === SCAN_OK) return scanner.getTokenValue()
  // The scanner also reports a raw line break as the end of a string, before the end of the text.
  if (error === SCAN_END_OF_STRING && scanner.getPosition() === text.length)
    return syntax('truncated')
  return syntax('token')
}

const RFC_8259_NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/

/**
 * The scanner splits `01` into two numbers and keeps `1.` as one, so the lexeme is
 * the whole run of number characters from the token start, checked against RFC 8259.
 */
function readNumber(text: string, offset: number): JsonFailure | string {
  let end = offset
  while (end < text.length && '0123456789+-.eE'.includes(text.charAt(end))) end += 1
  const lexeme = text.slice(offset, end)
  if (!RFC_8259_NUMBER.test(lexeme)) return syntax('token')
  return lexeme
}

function syntax(reason: JsonSyntaxReason): JsonFailure {
  return { kind: 'syntax', reason }
}

function utf8Length(text: string): number {
  let length = 0
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    // The text is well formed, so each surrogate half is one half of a 4-byte code point.
    length += unit < 0x80 ? 1 : unit < 0x800 || (unit >= 0xd800 && unit <= 0xdfff) ? 2 : 3
  }
  return length
}

function parseLimits(limits: unknown): JsonLimits {
  if (typeof limits !== 'object' || limits === null) throw new TypeError('limits must be an object')
  const limit = (field: keyof JsonLimits): number => {
    const value: unknown = Reflect.get(limits, field)
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
      throw new TypeError(
        `limits.${field} must be an integer from 1 through Number.MAX_SAFE_INTEGER`,
      )
    return value
  }
  return {
    maxBytes: limit('maxBytes'),
    maxDepth: limit('maxDepth'),
    maxItems: limit('maxItems'),
    maxMembers: limit('maxMembers'),
    maxStringLength: limit('maxStringLength'),
    maxNumberLength: limit('maxNumberLength'),
  }
}

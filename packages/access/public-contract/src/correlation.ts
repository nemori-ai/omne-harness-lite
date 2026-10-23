import { readJsonBytes, type JsonLimits, type JsonRead } from '@omne-harness/json-text'
import { createScanner, type JSONScanner } from 'jsonc-parser'

type ObjectFrame = {
  kind: 'object'
  next: 'first' | 'key' | 'colon' | 'value' | 'comma'
  members: number
  key: string
}
type Frame = ObjectFrame | { kind: 'array'; next: 'first' | 'value' | 'comma' }
type Scan = {
  readonly text: string
  readonly scanner: JSONScanner
  readonly limits: JsonLimits
  readonly stack: Frame[]
  started: boolean
  rootObject: boolean
  items: number
  occurrences: number
  messageId: string | undefined
}

export function readRequestDocument(
  bytes: Uint8Array,
  limits: JsonLimits,
): { read: JsonRead; messageId: string | undefined } {
  const read = readJsonBytes(bytes, limits)
  if (read.kind === 'duplicate-key') return { read, messageId: recoverCorrelation(bytes, limits) }
  if (read.kind !== 'ok' || read.value.kind !== 'object') return { read, messageId: undefined }
  const id = read.value.entries.find(entry => entry.key === 'messageId')?.value
  return { read, messageId: id?.kind === 'string' ? id.value : undefined }
}

function validEscape(raw: string, slash: number): number | undefined {
  const escaped = raw.charAt(slash + 1)
  if ('"\\/bfnrt'.includes(escaped)) return slash + 1
  if (escaped !== 'u') return undefined
  for (let i = slash + 2; i < slash + 6; i++) {
    if (i >= raw.length - 1 || !'0123456789abcdefABCDEF'.includes(raw.charAt(i))) return undefined
  }
  return slash + 5
}

function scannedString(scan: Scan): string | undefined {
  const { text, scanner, limits } = scan
  const raw = text.slice(scanner.getTokenOffset(), scanner.getPosition())
  if (scanner.getTokenError() !== 0 || raw[0] !== '"' || raw.at(-1) !== '"') return undefined
  for (let i = 1; i < raw.length - 1; i++) {
    const character = raw.charAt(i)
    if (raw.charCodeAt(i) < 32 || character === '"') return undefined
    if (character !== '\\') continue
    const end = validEscape(raw, i)
    if (end === undefined) return undefined
    i = end
  }
  const decoded = scanner.getTokenValue()
  return decoded.length <= limits.maxStringLength ? decoded : undefined
}

function scannedNumber(scan: Scan): boolean {
  const { text, scanner, limits } = scan
  let end = scanner.getTokenOffset()
  while (end < text.length && '0123456789+-.eE'.includes(text.charAt(end))) end++
  const lexeme = text.slice(scanner.getTokenOffset(), end)
  return (
    lexeme.length <= limits.maxNumberLength &&
    /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(lexeme)
  )
}

function scannedScalar(scan: Scan, token: number, parent: Frame | undefined): boolean {
  if (token === 11) return scannedNumber(scan)
  if (token !== 10) return true
  const decoded = scannedString(scan)
  if (decoded === undefined) return false
  if (scan.stack.length === 1 && parent?.kind === 'object' && parent.key === 'messageId')
    scan.messageId = decoded
  return true
}

function startValue(scan: Scan, token: number, parent: Frame | undefined): boolean {
  if (![1, 3, 7, 8, 9, 10, 11].includes(token)) return false
  if (++scan.items > scan.limits.maxItems) return false
  const container = token === 1 || token === 3
  if (container && scan.stack.length + 1 > scan.limits.maxDepth) return false
  if (!scannedScalar(scan, token, parent)) return false
  if (parent !== undefined) parent.next = 'comma'
  if (!scan.started) {
    scan.started = true
    scan.rootObject = token === 1
  }
  if (token === 1) scan.stack.push({ kind: 'object', next: 'first', members: 0, key: '' })
  if (token === 3) scan.stack.push({ kind: 'array', next: 'first' })
  return true
}

function stepArray(scan: Scan, frame: Extract<Frame, { kind: 'array' }>, token: number): boolean {
  if ((frame.next === 'first' || frame.next === 'comma') && token === 4) {
    scan.stack.pop()
    return true
  }
  if (frame.next !== 'comma') return startValue(scan, token, frame)
  if (token !== 5) return false
  frame.next = 'value'
  return true
}

function stepKey(scan: Scan, frame: ObjectFrame, token: number): boolean {
  if (frame.next === 'first' && token === 2) {
    scan.stack.pop()
    return true
  }
  if (token !== 10) return false
  const key = scannedString(scan)
  if (key === undefined || ++frame.members > scan.limits.maxMembers) return false
  frame.key = key
  if (scan.stack.length === 1 && key === 'messageId') scan.occurrences++
  frame.next = 'colon'
  return true
}

function stepObject(scan: Scan, frame: ObjectFrame, token: number): boolean {
  switch (frame.next) {
    case 'first':
    case 'key':
      return stepKey(scan, frame, token)
    case 'colon':
      if (token !== 6) return false
      frame.next = 'value'
      return true
    case 'value':
      return startValue(scan, token, frame)
    case 'comma':
      if (token === 2) scan.stack.pop()
      else if (token === 5) frame.next = 'key'
      else return false
      return true
  }
}

function recoverCorrelation(bytes: Uint8Array, limits: JsonLimits): string | undefined {
  if (bytes.length > limits.maxBytes) return undefined
  // Strict duplicate failure can occur only after successful UTF-8 decoding.
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  if (text.startsWith('\uFEFF')) return undefined
  const scan: Scan = {
    text,
    scanner: createScanner(text, false),
    limits,
    stack: [],
    started: false,
    rootObject: false,
    items: 0,
    occurrences: 0,
    messageId: undefined,
  }
  for (;;) {
    const token: number = scan.scanner.scan()
    if (token === 14 || token === 15) continue
    if (scan.scanner.getTokenError() !== 0) return undefined
    const frame = scan.stack.at(-1)
    if (frame === undefined) {
      if (scan.started)
        return token === 17 && scan.rootObject && scan.occurrences === 1
          ? scan.messageId
          : undefined
      if (!startValue(scan, token, undefined)) return undefined
    } else if (
      !(frame.kind === 'array' ? stepArray(scan, frame, token) : stepObject(scan, frame, token))
    )
      return undefined
  }
}

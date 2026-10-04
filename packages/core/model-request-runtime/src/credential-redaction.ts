import { LosslessNumber, jsonNumberSource, type JsonValue } from '@omne-harness-lite/content-blocks'
import type {BoundCredentialRedaction, CredentialRedactionConfig, CredentialRedactionHeaders, CredentialRedactionPattern, CredentialRedactionPolicy, CredentialRedactionResult} from './credential-redaction-types.ts'

const marker = '\u2588'
const invalidInput = Object.freeze({ rejected: 'invalidInput' } as const)
// Capture the trusted public read boundary once; receiver prototype traps must not supply its value.
const losslessSourceGetter = Object.getOwnPropertyDescriptor(
  LosslessNumber.prototype,
  'source',
)?.get

/** Controlled static configuration failure; no incoming value or foreign exception is retained. */
export class CredentialRedactionConfigurationError extends TypeError {
  constructor() {
    super('Invalid credential redaction configuration')
    this.name = 'CredentialRedactionConfigurationError'
  }
}

/** D093 openrouter-redaction/1. Callers must explicitly supply this complete snapshot. */
export const openRouterCredentialRedactionConfig: CredentialRedactionConfig = Object.freeze({
  credential_fragment_min_length: 8,
  credential_header_names: Object.freeze([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'api-key',
    'apikey',
    'x-auth-token',
    'x-access-token',
    'x-openrouter-api-key',
    'x-amz-security-token',
  ]),
  credential_patterns: Object.freeze([
    Object.freeze({ kind: 'prefix-token', prefix: 'sk-', alphabet: 'key' } as const),
    Object.freeze({ kind: 'scheme-token', scheme: 'bearer', alphabet: 'auth' } as const),
    Object.freeze({ kind: 'scheme-token', scheme: 'basic', alphabet: 'auth' } as const),
  ]),
})

function ok<T>(value: T): CredentialRedactionResult<T> {
  return Object.freeze({ ok: value })
}

function asciiFold(value: string): string {
  return value.replace(/[A-Z]/g, character => String.fromCharCode(character.charCodeAt(0) + 32))
}

function printable(value: unknown, max?: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    (max === undefined || value.length <= max) &&
    !/[^\x20-\x7e]/.test(value)
  )
}

class InputAdmissionError extends Error {}

/** Only caller reflection failures become admission refusal; allocation/processing defects do not. */
function reflect<T>(read: () => T): T {
  try {
    return read()
  } catch {
    throw new InputAdmissionError()
  }
}

type SnapshotTask =
  | { readonly kind: 'visit'; readonly input: unknown; readonly put: (value: JsonValue) => void }
  | {
      readonly kind: 'finish'
      readonly input: object
      readonly output: JsonValue[] | Record<string, JsonValue>
      readonly put: (value: JsonValue) => void
    }

function snapshotNumber(input: LosslessNumber): LosslessNumber {
  // Reject foreign accessors overriding the core's explicit numeric read boundary.
  let owner: object | null = input
  const owners = new Set<object>()
  while (owner !== null) {
    if (owners.has(owner)) throw new InputAdmissionError()
    owners.add(owner)
    const currentOwner = owner
    const property = reflect(() => Object.getOwnPropertyDescriptor(currentOwner, 'source'))
    if (property !== undefined) {
      if (
        losslessSourceGetter === undefined ||
        property.get !== losslessSourceGetter ||
        'value' in property
      )
        throw new InputAdmissionError()
      const source: unknown = Reflect.apply(losslessSourceGetter, input, [])
      if (typeof source !== 'string') throw new TypeError()
      return new LosslessNumber(source)
    }
    const next: unknown = reflect(() => Object.getPrototypeOf(currentOwner))
    if (next !== null && typeof next !== 'object') throw new InputAdmissionError()
    owner = next
  }
  throw new InputAdmissionError()
}

function snapshotArray(
  input: object,
  put: (value: JsonValue) => void,
  descriptors: PropertyDescriptorMap,
  tasks: SnapshotTask[],
): void {
  const length: unknown = descriptors.length?.value
  if (typeof length !== 'number' || Object.keys(descriptors).length !== length + 1)
    throw new InputAdmissionError()
  const output: JsonValue[] = []
  tasks.push({ kind: 'finish', input, output, put })
  for (let index = length - 1; index >= 0; index--) {
    const property = descriptors[String(index)]
    if (property === undefined || !property.enumerable || !('value' in property))
      throw new InputAdmissionError()
    const item: unknown = property.value
    tasks.push({
      kind: 'visit',
      input: item,
      put: value => {
        output[index] = value
      },
    })
  }
}

function snapshotObject(
  input: object,
  put: (value: JsonValue) => void,
  descriptors: PropertyDescriptorMap,
  tasks: SnapshotTask[],
): void {
  const output: Record<string, JsonValue> = Object.create(null)
  tasks.push({ kind: 'finish', input, output, put })
  const entries = Object.entries(descriptors)
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]
    if (entry === undefined) throw new InputAdmissionError()
    const [key, property] = entry
    if (!property.enumerable || !('value' in property)) throw new InputAdmissionError()
    const item: unknown = property.value
    tasks.push({
      kind: 'visit',
      input: item,
      put: value => {
        Object.defineProperty(output, key, { value, enumerable: true })
      },
    })
  }
}

function snapshotContainer(
  input: object,
  put: (value: JsonValue) => void,
  active: Set<object>,
  tasks: SnapshotTask[],
): void {
  const prototype: unknown = reflect(() => Object.getPrototypeOf(input))
  if (!reflect(() => Array.isArray(input)) && prototype !== Object.prototype && prototype !== null)
    throw new InputAdmissionError()
  if (reflect(() => Object.getOwnPropertySymbols(input)).length !== 0)
    throw new InputAdmissionError()
  const descriptors = reflect(() => Object.getOwnPropertyDescriptors(input))
  active.add(input)
  if (reflect(() => Array.isArray(input))) snapshotArray(input, put, descriptors, tasks)
  else snapshotObject(input, put, descriptors, tasks)
}

/** Admit own data before reading it. Iterative traversal does not consume the JS call stack. */
function snapshot(value: unknown): JsonValue {
  const active = new Set<object>()
  let result: JsonValue = null
  const tasks: SnapshotTask[] = [
    {
      kind: 'visit',
      input: value,
      put: value => {
        result = value
      },
    },
  ]
  while (tasks.length > 0) {
    const task = tasks.pop()
    if (task === undefined) throw new InputAdmissionError()
    if (task.kind === 'finish') {
      active.delete(task.input)
      task.put(Object.freeze(task.output))
      continue
    }
    const input = task.input
    if (input === null || typeof input === 'string' || typeof input === 'boolean') {
      task.put(input)
      continue
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new InputAdmissionError()
      task.put(input)
      continue
    }
    if (typeof input !== 'object' || active.has(input)) throw new InputAdmissionError()
    if (LosslessNumber.is(input)) {
      task.put(snapshotNumber(input))
      continue
    }
    snapshotContainer(input, task.put, active, tasks)
  }
  return result
}

function object(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}

function members(value: Readonly<Record<string, JsonValue>>, names: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === names.length && keys.every(key => names.includes(key))
}

function headerNames(headers: readonly JsonValue[]): string[] {
  const names: string[] = []
  const usedNames = new Set<string>()
  for (const name of headers) {
    if (
      typeof name !== 'string' ||
      name.length < 1 ||
      name.length > 128 ||
      !/^[!#$%&'*+.^_`|~0-9a-z-]+(?![\s\S])/.test(name) ||
      usedNames.has(name)
    )
      throw new TypeError()
    names.push(name)
    usedNames.add(name)
  }
  return names
}

function schemeLiteral(value: JsonValue | undefined): value is string {
  return printable(value, 64) && /^[a-zA-Z]+$/.test(value)
}

function patternDefinition(pattern: JsonValue): CredentialRedactionPattern {
  if (!object(pattern) || (pattern.alphabet !== 'key' && pattern.alphabet !== 'auth'))
    throw new TypeError()
  let definition: CredentialRedactionPattern
  let literal: string
  if (
    pattern.kind === 'prefix-token' &&
    members(pattern, ['kind', 'prefix', 'alphabet']) &&
    printable(pattern.prefix, 64)
  ) {
    literal = pattern.prefix
    definition = Object.freeze({
      kind: 'prefix-token',
      prefix: literal,
      alphabet: pattern.alphabet,
    })
  } else if (
    pattern.kind === 'scheme-token' &&
    members(pattern, ['kind', 'scheme', 'alphabet']) &&
    schemeLiteral(pattern.scheme)
  ) {
    literal = pattern.scheme
    definition = Object.freeze({
      kind: 'scheme-token',
      scheme: literal,
      alphabet: pattern.alphabet,
    })
  } else throw new TypeError()
  return definition
}

function patternDefinitions(patterns: readonly JsonValue[]): CredentialRedactionPattern[] {
  const definitions: CredentialRedactionPattern[] = []
  const usedPatterns = new Set<string>()
  for (const pattern of patterns) {
    const definition = patternDefinition(pattern)
    const literal = definition.kind === 'prefix-token' ? definition.prefix : definition.scheme
    const key = JSON.stringify([definition.kind, literal, definition.alphabet])
    if (usedPatterns.has(key)) throw new TypeError()
    usedPatterns.add(key)
    definitions.push(definition)
  }
  return definitions
}

function configuration(input: unknown): CredentialRedactionConfig {
  const value = snapshot(input)
  if (
    !object(value) ||
    !members(value, [
      'credential_fragment_min_length',
      'credential_header_names',
      'credential_patterns',
    ])
  )
    throw new TypeError()
  const minimum = value.credential_fragment_min_length
  if (typeof minimum !== 'number' || !Number.isSafeInteger(minimum) || minimum < 1 || minimum > 64)
    throw new TypeError()
  const headers = value.credential_header_names
  const patterns = value.credential_patterns
  if (
    !Array.isArray(headers) ||
    headers.length > 128 ||
    !Array.isArray(patterns) ||
    patterns.length > 64
  )
    throw new TypeError()
  const names = headerNames(headers)
  const definitions = patternDefinitions(patterns)
  return Object.freeze({
    credential_fragment_min_length: minimum,
    credential_header_names: Object.freeze(names),
    credential_patterns: Object.freeze(definitions),
  })
}

function asciiAlphanumeric(character: number): boolean {
  return (
    (character >= 65 && character <= 90) ||
    (character >= 97 && character <= 122) ||
    (character >= 48 && character <= 57)
  )
}

function alphabet(character: number, kind: 'key' | 'auth'): boolean {
  return (
    asciiAlphanumeric(character) ||
    character === 95 ||
    character === 45 ||
    (kind === 'auth' &&
      (character === 46 ||
        character === 126 ||
        character === 43 ||
        character === 47 ||
        character === 61))
  )
}

function literalAt(text: string, offset: number, literal: string, fold: boolean): boolean {
  if (offset + literal.length > text.length) return false
  for (let index = 0; index < literal.length; index++) {
    let actual = text.charCodeAt(offset + index)
    let expected = literal.charCodeAt(index)
    if (fold) {
      if (actual >= 65 && actual <= 90) actual += 32
      if (expected >= 65 && expected <= 90) expected += 32
    }
    if (actual !== expected) return false
  }
  return true
}

function replaceMatchedRanges(text: string, ends: Uint32Array): string {
  const output: string[] = []
  let retained = 0
  let offset = 0
  while (offset < text.length) {
    let end = ends[offset] ?? 0
    if (end <= offset) {
      offset++
      continue
    }
    const start = offset
    for (offset++; offset <= end && offset < text.length; offset++)
      end = Math.max(end, ends[offset] ?? 0)
    output.push(text.slice(retained, start), marker)
    retained = end
    offset = end
  }
  output.push(text.slice(retained))
  return output.join('')
}

function patternEnd(
  text: string,
  offset: number,
  pattern: CredentialRedactionPattern,
  keyEnds: Uint32Array,
  authEnds: Uint32Array,
  gapEnds: Uint32Array,
  end: number,
): number {
  const scheme = pattern.kind === 'scheme-token'
  const literal = pattern.kind === 'prefix-token' ? pattern.prefix : pattern.scheme
  if (!literalAt(text, offset, literal, scheme)) return end
  let tail = offset + literal.length
  if (scheme) {
    const gap = gapEnds[tail] ?? tail
    if (gap <= tail) return end
    tail = gap
  }
  const tokenEnd = (pattern.alphabet === 'key' ? keyEnds[tail] : authEnds[tail]) ?? tail
  if (tokenEnd > tail) end = Math.max(end, tokenEnd)
  return end
}

function tokenEnds(
  text: string,
  keyEnds: Uint32Array,
  authEnds: Uint32Array,
  gapEnds: Uint32Array,
): void {
  for (let offset = text.length - 1; offset >= 0; offset--) {
    const character = text.charCodeAt(offset)
    keyEnds[offset] = alphabet(character, 'key') ? keyEnds[offset + 1] || offset + 1 : offset
    authEnds[offset] = alphabet(character, 'auth') ? authEnds[offset + 1] || offset + 1 : offset
    gapEnds[offset] =
      character === 32 || character === 9 ? gapEnds[offset + 1] || offset + 1 : offset
  }
}

function matchKernel(
  config: CredentialRedactionConfig,
  credential: string,
): (text: string) => string {
  // When |V| >= m, the union of its m-windows also covers every complete V match.
  const width = Math.min(credential.length, config.credential_fragment_min_length)
  const windows = new Set<string>()
  for (let offset = 0; offset <= credential.length - width; offset++)
    windows.add(credential.slice(offset, offset + width))
  return text => {
    const keyEnds = new Uint32Array(text.length + 1)
    const authEnds = new Uint32Array(text.length + 1)
    const gapEnds = new Uint32Array(text.length + 1)
    const ends = new Uint32Array(text.length + 1)
    tokenEnds(text, keyEnds, authEnds, gapEnds)
    for (let offset = 0; offset < text.length; offset++) {
      let end = 0
      if (offset + width <= text.length && windows.has(text.slice(offset, offset + width)))
        end = offset + width
      for (const pattern of config.credential_patterns) {
        end = patternEnd(text, offset, pattern, keyEnds, authEnds, gapEnds, end)
      }
      ends[offset] = end
    }
    return replaceMatchedRanges(text, ends)
  }
}

function projectedNames(
  keys: readonly string[],
  text: (value: string) => string,
): readonly string[] {
  const names = keys.map(text)
  const used = new Set(keys.filter((key, index) => names[index] === key))
  for (let index = 0; index < keys.length; index++) {
    let name = names[index]
    if (name === undefined) throw new TypeError()
    if (name === keys[index]) continue
    while (used.has(name)) name += marker
    names[index] = name
    used.add(name)
  }
  return names
}

type ProjectionTask =
  | {
      readonly kind: 'visit'
      readonly input: JsonValue
      readonly put: (value: JsonValue) => void
    }
  | {
      readonly kind: 'finish'
      readonly output: JsonValue[] | Record<string, JsonValue>
      readonly put: (value: JsonValue) => void
    }

function projectArray(
  input: readonly JsonValue[],
  put: (value: JsonValue) => void,
  tasks: ProjectionTask[],
): void {
  const output: JsonValue[] = []
  tasks.push({ kind: 'finish', output, put })
  for (let index = input.length - 1; index >= 0; index--) {
    const item: JsonValue | undefined = input[index]
    if (item === undefined) throw new TypeError()
    tasks.push({
      kind: 'visit',
      input: item,
      put: value => {
        output[index] = value
      },
    })
  }
}

function projectObject(
  input: readonly JsonValue[] | Readonly<Record<string, JsonValue>>,
  put: (value: JsonValue) => void,
  tasks: ProjectionTask[],
  text: (value: string) => string,
): void {
  const entries = Object.entries(input)
  const names = projectedNames(
    entries.map(([key]) => key),
    text,
  )
  const output: Record<string, JsonValue> = Object.create(null)
  tasks.push({ kind: 'finish', output, put })
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]
    const name = names[index]
    if (entry === undefined || name === undefined) throw new TypeError()
    tasks.push({
      kind: 'visit',
      input: entry[1],
      put: value => {
        Object.defineProperty(output, name, { value, enumerable: true })
      },
    })
  }
}

function scalar(input: JsonValue): input is null | boolean | number | LosslessNumber {
  return (
    input === null ||
    typeof input === 'boolean' ||
    typeof input === 'number' ||
    LosslessNumber.is(input)
  )
}

function projectJson(value: JsonValue, text: (value: string) => string): JsonValue {
  let result: JsonValue = null
  const tasks: ProjectionTask[] = [
    {
      kind: 'visit',
      input: value,
      put: value => {
        result = value
      },
    },
  ]
  while (tasks.length > 0) {
    const task = tasks.pop()
    if (task === undefined) throw new TypeError()
    if (task.kind === 'finish') {
      task.put(Object.freeze(task.output))
      continue
    }
    const input = task.input
    if (typeof input === 'string') {
      task.put(text(input))
      continue
    }
    if (scalar(input)) {
      const token =
        input === null
          ? 'null'
          : typeof input === 'boolean'
            ? String(input)
            : jsonNumberSource(input)
      task.put(text(token) === token ? input : marker)
      continue
    }
    if (Array.isArray(input)) projectArray(input, task.put, tasks)
    else projectObject(input, task.put, tasks, text)
  }
  return result
}

function headerInput(input: unknown): CredentialRedactionHeaders {
  const value = snapshot(input)
  if (!object(value)) throw new InputAdmissionError()
  const headers: Record<string, string | readonly string[]> = Object.create(null)
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item !== 'string' &&
      (!Array.isArray(item) || !item.every(element => typeof element === 'string'))
    )
      throw new InputAdmissionError()
    Object.defineProperty(headers, key, { value: item, enumerable: true })
  }
  return Object.freeze(headers)
}

function projectHeaders(
  value: CredentialRedactionHeaders,
  names: ReadonlySet<string>,
  text: (value: string) => string,
): CredentialRedactionHeaders {
  const entries = Object.entries(value).filter(([key]) => !names.has(asciiFold(key)))
  const keys = projectedNames(
    entries.map(([key]) => key),
    text,
  )
  const headers: Record<string, string | readonly string[]> = Object.create(null)
  entries.forEach(([, item], index) => {
    const key = keys[index]
    if (key === undefined) throw new TypeError()
    Object.defineProperty(headers, key, {
      value: typeof item === 'string' ? text(item) : Object.freeze(item.map(text)),
      enumerable: true,
    })
  })
  return Object.freeze(headers)
}

/** Unexpected defects are distinct from normal invalid-input decisions and never return raw data. */
function processingDefect(): Error {
  return new Error('Credential redaction processing failed')
}

export function createCredentialRedactionPolicy(
  config: CredentialRedactionConfig,
): CredentialRedactionPolicy {
  let owned: CredentialRedactionConfig
  try {
    owned = configuration(config)
  } catch {
    throw new CredentialRedactionConfigurationError()
  }
  const headerNames = new Set(owned.credential_header_names)
  return Object.freeze({
    bind(knownCredential: string): CredentialRedactionResult<BoundCredentialRedaction> {
      if (!printable(knownCredential)) return invalidInput
      let text: (value: string) => string
      try {
        text = matchKernel(owned, knownCredential)
      } catch {
        throw processingDefect()
      }
      return ok(
        Object.freeze({
          text(value: string): CredentialRedactionResult<string> {
            if (typeof value !== 'string') return invalidInput
            try {
              return ok(text(value))
            } catch {
              throw processingDefect()
            }
          },
          headers(
            value: CredentialRedactionHeaders,
          ): CredentialRedactionResult<CredentialRedactionHeaders> {
            let captured: CredentialRedactionHeaders
            try {
              captured = headerInput(value)
            } catch (error) {
              if (error instanceof InputAdmissionError) return invalidInput
              throw processingDefect()
            }
            try {
              return ok(projectHeaders(captured, headerNames, text))
            } catch {
              throw processingDefect()
            }
          },
          json(value: JsonValue): CredentialRedactionResult<JsonValue> {
            let captured: JsonValue
            try {
              captured = snapshot(value)
            } catch (error) {
              if (error instanceof InputAdmissionError) return invalidInput
              throw processingDefect()
            }
            try {
              return ok(projectJson(captured, text))
            } catch {
              throw processingDefect()
            }
          },
        }),
      )
    },
  })
}

/** RT5 S60: JSON values and strings, explicit credential and all three parameters, zero effects. */
export function redact(
  value: JsonValue,
  knownCredential: string,
  params: CredentialRedactionConfig,
): CredentialRedactionResult<JsonValue> {
  let policy: CredentialRedactionPolicy
  try {
    policy = createCredentialRedactionPolicy(params)
  } catch {
    return invalidInput
  }
  const bound = policy.bind(knownCredential)
  return 'ok' in bound ? bound.ok.json(value) : invalidInput
}

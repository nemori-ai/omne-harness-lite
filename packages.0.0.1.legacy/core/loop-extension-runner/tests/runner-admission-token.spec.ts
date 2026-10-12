import { expect, test, vi } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { passKeys } from '@omne-harness-lite/loop-extension-runner'
import {
  decodeRunnerAdmissionToken as decodeFormalToken,
  encodeRunnerAdmissionToken as encodeFormalToken,
} from '../src/runner-admission-token.ts'
import { OFFICIAL_ADMISSION_NAME as officialAdmissionName } from '@omne-harness-lite/tool-admission'

const invalid = { invalidInput: true }
function key(anchor = 'action/一') {
  const keys = passKeys({
    position: 'before_action',
    anchor,
    extension: officialAdmissionName,
    occurrence: { kind: 'final' },
  })
  if ('invalidInput' in keys || keys.final === undefined) throw new Error('invalid test key')
  return keys.final
}
function call(args: unknown = {}, callId = 'call/一') {
  return {
    kind: 'tool_call',
    id: 'block',
    callId,
    visibility: { toHuman: true, toModel: true },
    complete: true,
    tool: 'echo',
    arguments: args,
  }
}
function token(args: unknown = {}, callId = 'call/一') {
  const result = encodeFormalToken(call(args, callId), key())
  if (typeof result !== 'string') throw new Error('invalid test token')
  return result
}
function raw(value: unknown) {
  return `admission.2.${Buffer.from(JSON.stringify(value)).toString('base64url')}`
}
const emptyDigest = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'

test('formal locator uses the real runner final key and the known SHA-256 of an empty object', () => {
  const result = token()
  expect(result).toBe(raw(['call/一', emptyDigest, key()]))
  const decoded = decodeFormalToken(result)
  expect(decoded).toEqual({ callId: 'call/一', argumentDigest: emptyDigest, finalKey: key() })
  expect(Object.isFrozen(decoded)).toBe(true)
})

test.each(
  [
    null,
    undefined,
    false,
    10,
    {},
    [],
    '',
    'admission.1.ZmFrZQ',
    'admission.3.ZmFrZQ',
    'admission.2.',
    'admission.2.e30',
    'admission.2.bnVsbA',
    'admission.2.////',
  ].map(value => ({ value })),
)('refuses nonformal or malformed input $value', ({ value }) => {
  expect(decodeFormalToken(value)).toEqual(invalid)
})

test.each(
  [
    [],
    ['call', emptyDigest],
    ['call', emptyDigest, key(), 'extra'],
    ['', emptyDigest, key()],
    [' call', emptyDigest, key()],
    ['call\n', emptyDigest, key()],
    [true, emptyDigest, key()],
    ['call', emptyDigest.toUpperCase(), key()],
    ['call', `${emptyDigest}\n`, key()],
    ['call', emptyDigest.slice(1), key()],
    ['call', 42, key()],
    ['call', emptyDigest, null],
  ].map(tuple => ({ tuple })),
)('refuses invalid tuple members $tuple', ({ tuple }) => {
  expect(decodeFormalToken(raw(tuple))).toEqual(invalid)
})

test.each([
  'runner/6/["final","before_action",null,"anchor","omne-official:admission-judgment"]',
  'runner/5/["ask","before_action",null,"anchor","omne-official:admission-judgment","1"]',
  'runner/5/["final","before_model_call",null,"anchor","omne-official:admission-judgment"]',
  'runner/5/["final","before_action","scope:each","anchor","omne-official:admission-judgment"]',
  'runner/5/["final","before_action",null,"anchor","custom:admission-judgment"]',
  'runner/5/["final","before_action",null," anchor","omne-official:admission-judgment"]',
  'runner/5/["final", "before_action",null,"anchor","omne-official:admission-judgment"]',
  'runner/5/not-json',
  'runner/5/null',
])('refuses a noncanonical or nonofficial final key %s', finalKey => {
  expect(encodeFormalToken(call(), finalKey)).toEqual(invalid)
  expect(decodeFormalToken(raw(['call', emptyDigest, finalKey]))).toEqual(invalid)
})

test('rejects padding, ignored whitespace, noncanonical JSON and invalid UTF-8', () => {
  const canonical = token()
  for (const value of [
    canonical + '=',
    canonical + '\n',
    canonical.replace('admission.2.', 'admission.2. '),
  ])
    expect(decodeFormalToken(value)).toEqual(invalid)
  const spaced = JSON.stringify(['call/一', emptyDigest, key()], null, 2)
  expect(decodeFormalToken(`admission.2.${Buffer.from(spaced).toString('base64url')}`)).toEqual(
    invalid,
  )
  const escaped = JSON.stringify(['call/一', emptyDigest, key()]).replace('call', '\\u0063all')
  expect(decodeFormalToken(`admission.2.${Buffer.from(escaped).toString('base64url')}`)).toEqual(
    invalid,
  )
  const bytes = Buffer.concat([
    Buffer.from('["call'),
    Buffer.from([0xff]),
    Buffer.from(`",${JSON.stringify(emptyDigest)},${JSON.stringify(key())}]`),
  ])
  expect(decodeFormalToken(`admission.2.${bytes.toString('base64url')}`)).toEqual(invalid)
})

test('normalizes equal numbers and object order while preserving array and large integer distinctions', () => {
  expect(token({ a: new LosslessNumber('1.00e2'), b: -0 })).toBe(token({ b: 0, a: 100 }))
  expect(token({ a: new LosslessNumber('1.0') })).toBe(token({ a: 1 }))
  expect(token([1, 2])).not.toBe(token([2, 1]))
  expect(token(new LosslessNumber('9007199254740992'))).not.toBe(
    token(new LosslessNumber('9007199254740993')),
  )
  expect(token({}, 'Call')).not.toBe(token({}, 'call'))
  expect(token({}, 'é')).not.toBe(token({}, 'e\u0301'))
})

test('rejects invalid calls and accessor input without executing the accessor', () => {
  for (const input of [
    null,
    {},
    { ...call(), complete: false },
    { ...call(), callId: ' bad' },
    call(NaN),
    call(1n),
  ])
    expect(encodeFormalToken(input, key())).toEqual(invalid)
  const getter = vi.fn(() => ({}))
  const accessor = Object.defineProperty(call(), 'arguments', { enumerable: true, get: getter })
  expect(encodeFormalToken(accessor, key())).toEqual(invalid)
  expect(getter).not.toHaveBeenCalled()
})

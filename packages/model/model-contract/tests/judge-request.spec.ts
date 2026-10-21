import { describe, expect, it } from 'vitest'
import {
  judgeAdmit,
  judgeFixedModelRequest,
  MODEL_INPUT_LIMITS,
  decodeCredentialId,
  type FixedModelRequest,
} from '@omne-harness/model-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { admission, must, request, scriptedProvider } from './scripted-support.ts'

const adopted = request.source
function withValue(value: unknown) {
  return { ...request, parameters: [{ kind: 'extension', definition: adopted, value }] }
}
function rejection(value: unknown, reason: string) {
  expect(judgeFixedModelRequest(value)).toMatchObject({ failure: { reason } })
}
function nodes(value: unknown): number {
  return (
    1 +
    (typeof value === 'object' && value !== null
      ? Object.values(value).reduce<number>((n, child) => n + nodes(child), 0)
      : 0)
  )
}
function strings(value: unknown): number {
  if (typeof value === 'string') return value.length
  if (typeof value !== 'object' || value === null) return 0
  return Object.entries(value).reduce(
    (n, [key, child]) => n + (Array.isArray(value) ? 0 : key.length) + strings(child),
    0,
  )
}

it('retains typed access, copies DAG occurrences and freezes only owned output', async () => {
  const principal = Object.assign(() => 'identity', { secret: { mutable: true } })
  Object.defineProperty(principal, 'credential', {
    get() {
      throw new Error('must stay opaque')
    },
  })
  const input = {
    ...admission('judge'),
    principal,
    request: { ...request, profile: adopted, source: adopted },
  }
  expect(input.request.profile).toBe(input.request.source)
  const checked = must(judgeAdmit(input))
  expect(checked).toEqual(input)
  expect(checked.principal).toBe(principal)
  expect(checked.tenant).toBe(input.tenant)
  expect(Object.isFrozen(principal)).toBe(false)
  expect(Object.isFrozen(checked)).toBe(true)
  expect(checked.request.profile).not.toBe(input.request.profile)
  expect(checked.request.profile).not.toBe(checked.request.source)
  expect(Object.isFrozen(checked.request.profile)).toBe(true)
  const raw = structuredClone(request)
  const fixed = must(judgeFixedModelRequest(raw))
  Object.defineProperty(raw.profile, 'name', { value: 'changed' })
  expect(fixed.profile.name).not.toBe('changed')
  expect(() => Reflect.set(fixed.profile, 'name', 'changed')).not.toThrow()
  expect(fixed.profile.name).not.toBe('changed')
  const provider = scriptedProvider()
  expect(await provider.provider.runtime.calls.admit(admission('shared-boundary'))).toHaveProperty(
    'ok',
  )
  expect(
    await provider.provider.runtime.calls.admit({
      ...admission('shared-boundary'),
      request: { ...request, parameters: [{ kind: 'temperature', value: 2.1 }] },
    }),
  ).toEqual({ failure: { kind: 'invalid', field: '/request/parameters/0/value', reason: 'range' } })
})

it('accepts every Model union branch and delegates lossless domain values', () => {
  const tenantCredential = { kind: 'tenant', id: must(decodeCredentialId('credential')) } as const
  const json: JsonValue = {
    kind: 'object',
    entries: [
      { key: 'large', value: { kind: 'number', lexeme: '9007199254740993' } },
      { key: 'precise', value: { kind: 'number', lexeme: '1.2300e-100' } },
      { key: 'stops', value: { kind: 'array', items: [{ kind: 'string', value: 'END' }] } },
    ],
  }
  const parameters: FixedModelRequest['parameters'] = [
    { kind: 'temperature', value: 2 },
    { kind: 'top-p', value: 1 },
    { kind: 'max-output-tokens', value: '1' },
    { kind: 'seed', value: '0' },
    { kind: 'stop', value: ['END', 'STOP'] },
    { kind: 'reasoning-effort', value: 'max' },
    { kind: 'frequency-penalty', value: -2 },
    { kind: 'presence-penalty', value: 2 },
    {
      kind: 'extension',
      definition: adopted,
      value: json,
    },
  ]
  for (const credential of [{ kind: 'factory' }, tenantCredential] as const)
    for (const toolChoice of ['none', 'auto', 'required', { name: 'lookup' }] as const) {
      const input = {
        ...request,
        parameters,
        suppliers: [
          { ...request.suppliers[0], credential },
          {
            adoption: { ...adopted, name: 'backup', revision: '2', digest: 'f'.repeat(64) },
            recipient: 'backup-recipient',
            model: 'backup-model',
            credential: credential.kind === 'factory' ? tenantCredential : { kind: 'factory' },
          },
        ],
        fallback: true,
        tools: [
          { name: 'lookup', description: '', argumentsSchema: json },
          { name: 'summarize', description: 'summary', argumentsSchema: { kind: 'null' } },
        ],
        toolChoice,
        parameterAdoptions: [
          {
            supplier: adopted,
            applied: parameters[0],
            origin: { kind: 'default', source: adopted },
          },
          {
            supplier: adopted,
            applied: parameters[0],
            origin: {
              kind: 'explicit',
              requested: { kind: 'temperature', value: 1 },
              source: { ...adopted, name: 'explicit-source' },
            },
          },
        ],
      }
      const result = judgeFixedModelRequest(input)
      expect(result).toEqual({ ok: input })
      const fixed = must(result)
      const assertOwnedCopy = (copy: unknown, original: unknown): void => {
        if (typeof copy !== 'object' || copy === null) return
        if (typeof original !== 'object' || original === null)
          throw new Error('expected matching fixture containers')
        expect(copy).not.toBe(original)
        expect(Object.isFrozen(copy)).toBe(true)
        expect(Object.isFrozen(original)).toBe(false)
        for (const [key, child] of Object.entries(copy))
          assertOwnedCopy(child, Reflect.get(original, key))
      }
      assertOwnedCopy(fixed, input)
      const extension = fixed.parameters[8]
      if (extension?.kind !== 'extension') throw new Error('expected retained extension')
      expect(extension.value).not.toBe(fixed.tools[0]?.argumentsSchema)
    }
  rejection(withValue({ ordinary: 'json' }), 'json')
  rejection({ ...request, parameters: [{ kind: 'temperature', value: 2.1 }] }, 'range')
  expect(
    judgeFixedModelRequest({ ...request, parameters: [{ kind: 'temperature', value: 2.1 }] }),
  ).toEqual({ failure: { field: '/parameters/0/value', reason: 'range' } })
})

describe('parameter values and request-local identities', () => {
  it.each([
    { kind: 'temperature', accepted: [0, 1, 2], outside: [-Number.MIN_VALUE, 2.000001] },
    { kind: 'top-p', accepted: [Number.MIN_VALUE, 0.5, 1], outside: [0, -0.1, 1.000001] },
    { kind: 'frequency-penalty', accepted: [-2, 0, 2], outside: [-2.000001, 2.000001] },
    { kind: 'presence-penalty', accepted: [-2, 0, 2], outside: [-2.000001, 2.000001] },
  ])(
    'keeps $kind endpoints and rejects values outside its finite interval',
    ({ kind, accepted, outside }) => {
      for (const value of accepted) {
        const input = { ...request, parameters: [{ kind, value }] }
        expect(judgeFixedModelRequest(input)).toEqual({ ok: input })
      }
      for (const value of [...outside, NaN, Infinity, -Infinity, '1', true, null, [], {}])
        expect(judgeFixedModelRequest({ ...request, parameters: [{ kind, value }] })).toEqual({
          failure: { field: '/parameters/0/value', reason: 'range' },
        })
    },
  )

  it.each([
    { kind: 'max-output-tokens', accepted: ['1', '9007199254740993'], additionalInvalid: ['0'] },
    { kind: 'seed', accepted: ['0', '1', '9007199254740993'], additionalInvalid: [] },
  ])(
    'preserves canonical $kind text without numeric coercion',
    ({ kind, accepted, additionalInvalid }) => {
      for (const value of accepted) {
        const input = { ...request, parameters: [{ kind, value }] }
        expect(judgeFixedModelRequest(input)).toEqual({ ok: input })
      }
      for (const value of [
        ...additionalInvalid,
        '',
        '01',
        '00',
        '-1',
        '+1',
        '1.0',
        '1e3',
        'x1',
        '1x',
        ' 1',
        '1 ',
        '1\n',
        1,
        0,
        null,
        false,
      ])
        expect(judgeFixedModelRequest({ ...request, parameters: [{ kind, value }] })).toEqual({
          failure: { field: '/parameters/0/value', reason: 'integer' },
        })
    },
  )

  it('retains all five reasoning efforts and rejects other values', () => {
    for (const value of ['none', 'low', 'medium', 'high', 'max']) {
      const input = { ...request, parameters: [{ kind: 'reasoning-effort', value }] }
      expect(judgeFixedModelRequest(input)).toEqual({ ok: input })
    }
    for (const value of ['other', '', 'HIGH', 0, null])
      expect(
        judgeFixedModelRequest({ ...request, parameters: [{ kind: 'reasoning-effort', value }] }),
      ).toEqual({ failure: { field: '/parameters/0/value', reason: 'value' } })
  })

  it.each([
    { value: [], field: '/parameters/0/value', reason: 'value' },
    { value: ['END', 'END'], field: '/parameters/0/value', reason: 'duplicate' },
    { value: ['END', ''], field: '/parameters/0/value/1', reason: 'value' },
  ])('rejects invalid stop sequences with $reason at $field', ({ value, field, reason }) => {
    expect(judgeFixedModelRequest({ ...request, parameters: [{ kind: 'stop', value }] })).toEqual({
      failure: { field, reason },
    })
  })

  it('keys extension uniqueness by the complete adoption and ordinary parameters by kind', () => {
    const first = { kind: 'extension', definition: adopted, value: { kind: 'null' } } as const
    for (const difference of [
      { owner: 'other-owner' },
      { name: 'other-name' },
      { revision: '2' },
      { digest: 'f'.repeat(64) },
    ]) {
      const second = { ...first, definition: { ...adopted, ...difference } }
      const input = { ...request, parameters: [first, second] }
      expect(judgeFixedModelRequest(input)).toEqual({ ok: input })
    }
    expect(
      judgeFixedModelRequest({
        ...request,
        parameters: [
          first,
          { ...first, definition: { ...adopted }, value: { kind: 'boolean', value: true } },
        ],
      }),
    ).toEqual({ failure: { field: '/parameters', reason: 'duplicate' } })
    expect(
      judgeFixedModelRequest({
        ...request,
        parameters: [
          { kind: 'temperature', value: 1 },
          { kind: 'temperature', value: 2 },
        ],
      }),
    ).toEqual({ failure: { field: '/parameters', reason: 'duplicate' } })
  })

  it('rejects equal supplier values, repeated tool names and undeclared tool selections', () => {
    const supplier = request.suppliers[0]
    expect(
      judgeFixedModelRequest({ ...request, suppliers: [supplier, structuredClone(supplier)] }),
    ).toEqual({ failure: { field: '/suppliers', reason: 'duplicate' } })
    const tool = { name: 'lookup', description: '', argumentsSchema: { kind: 'null' } }
    expect(
      judgeFixedModelRequest({ ...request, tools: [tool, { ...tool, description: 'different' }] }),
    ).toEqual({ failure: { field: '/tools', reason: 'duplicate' } })
    expect(
      judgeFixedModelRequest({ ...request, tools: [tool], toolChoice: { name: 'missing' } }),
    ).toEqual({ failure: { field: '/toolChoice/name', reason: 'selection' } })
  })
})

it('closes every Model-owned record and each branch before projecting output', () => {
  const mutations = [
    { ...request, extra: true },
    { ...request, profile: { ...adopted, extra: true } },
    { ...request, suppliers: [{ ...request.suppliers[0], extra: true }] },
    {
      ...request,
      suppliers: [{ ...request.suppliers[0], credential: { kind: 'factory', id: 'ignored' } }],
    },
    { ...request, parameters: [{ kind: 'temperature', value: 1, definition: adopted }] },
    {
      ...request,
      tools: [{ name: 'x', description: '', argumentsSchema: { kind: 'null' }, extra: true }],
    },
    { ...request, toolChoice: { name: 'x', extra: true } },
    {
      ...request,
      parameterAdoptions: [
        {
          supplier: adopted,
          applied: { kind: 'seed', value: '0' },
          origin: { kind: 'default', source: adopted, requested: { kind: 'seed', value: '0' } },
        },
      ],
    },
    {
      ...request,
      parameterAdoptions: [
        {
          supplier: adopted,
          applied: { kind: 'seed', value: '0' },
          origin: {
            kind: 'explicit',
            source: adopted,
            requested: { kind: 'seed', value: '0' },
            extra: true,
          },
        },
      ],
    },
  ]
  for (const input of mutations) rejection(input, 'unknown-field')
  for (const key of Object.keys(request)) {
    const missing: Record<string, unknown> = { ...request }
    delete missing[key]
    rejection(missing, 'missing')
  }
  for (const key of ['consumer', 'capacity'] as const)
    expect(
      judgeAdmit({ ...admission('closed'), [key]: { ...admission('closed')[key], secret: true } }),
    ).toMatchObject({ failure: { field: `/${key}`, reason: 'unknown-field' } })
})

describe('complete records with one invalid leaf', () => {
  it.each(['owner', 'work', 'position', 'purpose'])(
    'rejects invalid consumer %s without changing its other fields',
    key => {
      const input = admission('consumer-leaf')
      for (const value of ['', 17, null, []])
        expect(judgeAdmit({ ...input, consumer: { ...input.consumer, [key]: value } })).toEqual({
          failure: { field: `/consumer/${key}`, reason: 'value' },
        })
    },
  )

  it.each(['bytes', 'blocks', 'attachmentBytes'])(
    'rejects noncanonical capacity %s without changing its other fields',
    key => {
      const input = admission('capacity-leaf')
      for (const value of ['01', '-1', '1.0', '', 1, null])
        expect(judgeAdmit({ ...input, capacity: { ...input.capacity, [key]: value } })).toEqual({
          failure: { field: `/capacity/${key}`, reason: 'integer' },
        })
      if (key !== 'attachmentBytes')
        expect(judgeAdmit({ ...input, capacity: { ...input.capacity, [key]: '0' } })).toEqual({
          failure: { field: `/capacity/${key}`, reason: 'integer' },
        })
    },
  )

  const complete = {
    ...request,
    parameters: [{ kind: 'extension', definition: { ...adopted }, value: { kind: 'null' } }],
    tools: [{ name: 'lookup', description: '', argumentsSchema: { kind: 'null' } }],
    parameterAdoptions: [
      {
        supplier: { ...adopted },
        applied: { kind: 'seed', value: '0' },
        origin: {
          kind: 'explicit',
          requested: { kind: 'seed', value: '0' },
          source: { ...adopted },
        },
      },
    ],
  }
  function replace(path: string, value: unknown): unknown {
    const input = structuredClone(complete)
    const keys = path.slice(1).split('/')
    const last = keys.pop()
    let parent: unknown = input
    for (const key of keys) {
      if (typeof parent !== 'object' || parent === null) throw new Error('fixture parent')
      parent = Reflect.get(parent, key)
    }
    if (typeof parent !== 'object' || parent === null || last === undefined)
      throw new Error('fixture leaf')
    Reflect.set(parent, last, value)
    return input
  }
  function rejectsLeaf(path: string, value: unknown, reason: string) {
    const input = replace(path, value)
    expect(judgeFixedModelRequest(input)).toEqual({ failure: { field: path, reason } })
    expect(judgeAdmit({ ...admission('request-leaf'), request: input })).toEqual({
      failure: { field: `/request${path}`, reason },
    })
  }

  it.each([
    '/profile',
    '/retryPolicy',
    '/representation',
    '/source',
    '/suppliers/0/adoption',
    '/parameters/0/definition',
    '/parameterAdoptions/0/supplier',
    '/parameterAdoptions/0/origin/source',
  ])('validates every adoption leaf at %s', path => {
    expect(judgeFixedModelRequest(complete)).toEqual({ ok: complete })
    for (const key of ['owner', 'name', 'revision'])
      for (const value of ['', 17, null, ['text']]) rejectsLeaf(`${path}/${key}`, value, 'value')
    for (const value of [
      'z',
      'A'.repeat(64),
      'x' + '0'.repeat(64),
      '0'.repeat(64) + 'x',
      ['0'.repeat(64)],
      null,
    ])
      rejectsLeaf(`${path}/digest`, value, 'adoption')
    for (const value of [null, 17, []]) rejectsLeaf(path, value, 'type')
  })

  it.each([
    { path: '/suppliers/0/recipient', value: '', reason: 'value' },
    { path: '/suppliers/0/model', value: '', reason: 'value' },
    { path: '/suppliers/0/credential', value: null, reason: 'type' },
    { path: '/tools/0/name', value: '', reason: 'value' },
    { path: '/tools/0/description', value: 17, reason: 'type' },
    { path: '/tools/0/argumentsSchema', value: { ordinary: 'json' }, reason: 'json' },
    { path: '/parameters/0', value: null, reason: 'type' },
    { path: '/parameterAdoptions/0', value: null, reason: 'type' },
    { path: '/parameterAdoptions/0/origin', value: null, reason: 'type' },
    { path: '/parameterAdoptions/0/applied/value', value: '01', reason: 'integer' },
    { path: '/parameterAdoptions/0/origin/requested/value', value: '01', reason: 'integer' },
    { path: '/fallback', value: 'false', reason: 'type' },
    { path: '/suppliers', value: [], reason: 'value' },
    ...['suppliers', 'parameters', 'system', 'messages', 'tools', 'parameterAdoptions'].map(
      key => ({
        path: `/${key}`,
        value: {},
        reason: 'type',
      }),
    ),
  ])('rejects a complete invalid value at $path', ({ path, value, reason }) => {
    rejectsLeaf(path, value, reason)
  })

  it('rejects credential identity and unknown parameter or origin discriminants precisely', () => {
    const slashCredential = replace('/suppliers/0/credential', { kind: 'tenant', id: 'bad/id' })
    expect(judgeFixedModelRequest(slashCredential)).toEqual({ ok: slashCredential })
    const slashAdmission = { ...admission('slash-credential'), request: slashCredential }
    expect(judgeAdmit(slashAdmission)).toEqual({ ok: slashAdmission })
    const invalids = [
      {
        input: replace('/suppliers/0/credential', { kind: 'other', id: 'credential' }),
        field: '/suppliers/0/credential/kind',
        reason: 'value',
      },
      {
        input: replace('/suppliers/0/credential', { kind: 'tenant', id: 'bad id' }),
        field: '/suppliers/0/credential/id',
        reason: 'identity',
      },
      {
        input: replace('/parameters/0', { kind: 'other', value: 1 }),
        field: '/parameters/0/kind',
        reason: 'value',
      },
      {
        input: replace('/parameterAdoptions/0/origin', { kind: 'other', source: adopted }),
        field: '/parameterAdoptions/0/origin/kind',
        reason: 'value',
      },
    ]
    for (const { input, field, reason } of invalids) {
      expect(judgeFixedModelRequest(input)).toEqual({ failure: { field, reason } })
      expect(judgeAdmit({ ...admission('discriminant'), request: input })).toEqual({
        failure: { field: `/request${field}`, reason },
      })
    }
  })

  it('locates invalid call and operation identities independently', () => {
    const input = admission('identity-leaf')
    for (const key of ['call', 'operation'])
      for (const value of ['', 'bad/id', 17, null])
        expect(judgeAdmit({ ...input, [key]: value })).toEqual({
          failure: { field: `/${key}`, reason: 'identity' },
        })
  })
})

it('never executes getters/toJSON and does not expose unknown keys or trap diagnostics', () => {
  let reads = 0
  const accessor = Object.defineProperty({ ...request }, 'profile', {
    enumerable: true,
    get() {
      reads++
      return adopted
    },
  })
  const hidden = Object.defineProperty({ ...request }, 'profile', {
    value: adopted,
    enumerable: false,
  })
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  const sparse = Array(1)
  const extra = Object.assign([], { surprise: true })
  const inputs: readonly (readonly [unknown, string])[] = [
    [accessor, 'accessor'],
    [hidden, 'non-enumerable'],
    [{ ...request, [Symbol('secret')]: 1 }, 'symbol-key'],
    [Object.assign(Object.create({}), request), 'prototype'],
    [{ ...request, parameters: sparse }, 'sparse'],
    [{ ...request, system: extra }, 'unknown-field'],
    [withValue(cycle), 'cycle'],
    [withValue(new Date()), 'prototype'],
    [withValue(new Map()), 'prototype'],
    [withValue(new Uint8Array()), 'prototype'],
    [withValue(() => 1), 'type'],
    [withValue(undefined), 'type'],
    [withValue(1n), 'type'],
    [withValue(Symbol()), 'type'],
    [
      {
        ...request,
        toJSON() {
          reads++
          return request
        },
      },
      'type',
    ],
  ]
  for (const [input, reason] of inputs) rejection(input, reason)
  for (const trap of ['ownKeys', 'getPrototypeOf', 'getOwnPropertyDescriptor'] as const)
    rejection(
      new Proxy(request, {
        [trap]() {
          throw new Error('private exception')
        },
      }),
      'unreadable',
    )
  expect(judgeFixedModelRequest({ ...request, confidentialUnknownKey: 'secret' })).toEqual({
    failure: { field: '', reason: 'unknown-field' },
  })
  expect(reads).toBe(0)
})

it('rejects malformed admit roots and reports only known descriptor fields', () => {
  const input = admission('root-reflection')
  let getterReads = 0
  for (const value of [null, [], 17])
    expect(Reflect.apply(judgeAdmit, undefined, [value])).toEqual({
      failure: { field: '', reason: 'type' },
    })
  const invalidRoots: readonly { value: unknown; reason: string }[] = [
    { value: { ...input, privateUnknownRoot: 'private value' }, reason: 'unknown-field' },
    { value: { ...input, [Symbol('private symbol')]: 'private value' }, reason: 'symbol-key' },
  ]
  for (const { value, reason } of invalidRoots)
    expect(Reflect.apply(judgeAdmit, undefined, [value])).toEqual({
      failure: { field: '', reason },
    })
  for (const trap of ['ownKeys', 'getPrototypeOf'] as const) {
    let attempts = 0
    const proxy = new Proxy(input, {
      [trap]() {
        attempts++
        throw new Error('private reflection exception')
      },
    })
    expect(judgeAdmit(proxy)).toEqual({ failure: { field: '', reason: 'unreadable' } })
    expect(attempts).toBe(1)
  }
  for (const key of Reflect.ownKeys(input)) {
    for (const reason of ['missing', 'accessor', 'non-enumerable', 'unreadable']) {
      let attempts = 0
      const proxy = new Proxy(input, {
        get() {
          getterReads++
          throw new Error('must not read root values')
        },
        getOwnPropertyDescriptor(target, observed) {
          if (observed !== key) return Reflect.getOwnPropertyDescriptor(target, observed)
          attempts++
          if (reason === 'unreadable') throw new Error('private descriptor exception')
          if (reason === 'missing') return undefined
          if (reason === 'accessor')
            return {
              enumerable: true,
              configurable: true,
              get() {
                getterReads++
                return 'private getter value'
              },
            }
          return { ...Reflect.getOwnPropertyDescriptor(target, observed), enumerable: false }
        },
      })
      expect(judgeAdmit(proxy)).toEqual({ failure: { field: `/${String(key)}`, reason } })
      expect(attempts).toBe(1)
    }
  }
  expect(getterReads).toBe(0)
})

it('rejects real array descriptors and legal Proxy traps without invoking getters', () => {
  let getterReads = 0
  const input = admission('array-reflection')
  const withArray = (value: unknown) => ({
    ...request,
    parameters: [{ kind: 'stop', value }],
  })
  const accepts = withArray(['END'])
  expect(judgeFixedModelRequest(accepts)).toEqual({ ok: accepts })
  const accessor = Object.defineProperty(['END'], '0', {
    enumerable: true,
    configurable: true,
    get() {
      getterReads++
      return 'END'
    },
  })
  const hidden = Object.defineProperty(['END'], '0', { enumerable: false })
  const vanished = new Proxy(['END'], {
    getOwnPropertyDescriptor(target, key) {
      return key === '0' ? undefined : Reflect.getOwnPropertyDescriptor(target, key)
    },
  })
  expect(Object.getOwnPropertyDescriptor(vanished, '0')).toBeUndefined()
  const cases: { value: unknown; reason: string }[] = [
    { value: accessor, reason: 'accessor' },
    { value: hidden, reason: 'non-enumerable' },
    { value: vanished, reason: 'missing' },
    { value: Object.assign(['END'], { privateExtra: 'private value' }), reason: 'unknown-field' },
    { value: Object.assign(['END'], { '01': 'private value' }), reason: 'unknown-field' },
    { value: Object.assign(['END'], { [Symbol('private')]: true }), reason: 'symbol-key' },
    { value: Array(1), reason: 'sparse' },
  ]
  for (const trap of ['ownKeys', 'getPrototypeOf'] as const)
    cases.push({
      value: new Proxy(['END'], {
        [trap]() {
          throw new Error('private array reflection')
        },
      }),
      reason: 'unreadable',
    })
  for (const key of ['length', '0'])
    cases.push({
      value: new Proxy(['END'], {
        getOwnPropertyDescriptor(target, observed) {
          if (observed === key) throw new Error('private array descriptor')
          return Reflect.getOwnPropertyDescriptor(target, observed)
        },
      }),
      reason: 'unreadable',
    })
  // Array length is non-configurable but writable. A Proxy may report a different value.
  for (const length of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
    const value = new Proxy(['END'], {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
        return key === 'length' ? { ...descriptor, value: length } : descriptor
      },
    })
    expect(Array.isArray(value)).toBe(true)
    expect(Object.getOwnPropertyDescriptor(value, 'length')?.value).toBe(length)
    cases.push({ value, reason: 'type' })
  }
  for (const { value, reason } of cases) {
    expect(Array.isArray(value)).toBe(true)
    expect(judgeFixedModelRequest(withArray(value))).toEqual({ failure: { field: '', reason } })
    expect(judgeAdmit({ ...input, request: withArray(value) })).toEqual({
      failure: { field: '/request', reason },
    })
  }
  expect(getterReads).toBe(0)
})

describe('one finite parser budget', () => {
  it('accepts string and array limits and rejects one additional unit', () => {
    const stop = Array.from(
      { length: MODEL_INPUT_LIMITS.maxArrayLength },
      (_, index) => `stop-${index}`,
    )
    expect(
      judgeFixedModelRequest({ ...request, parameters: [{ kind: 'stop', value: stop }] }),
    ).toHaveProperty('ok')
    rejection(
      { ...request, parameters: [{ kind: 'stop', value: [...stop, 'last'] }] },
      'budget-array',
    )
    const big = 'x'.repeat(MODEL_INPUT_LIMITS.maxStringLength)
    expect(
      judgeFixedModelRequest({
        ...request,
        tools: [{ name: 't', description: big, argumentsSchema: { kind: 'null' } }],
      }),
    ).toHaveProperty('ok')
    rejection(
      {
        ...request,
        tools: [{ name: 't', description: big + 'x', argumentsSchema: { kind: 'null' } }],
      },
      'budget-string',
    )
  })
  it('counts all field names and every DAG occurrence against the cumulative string budget', () => {
    const input = {
      ...request,
      tools: [
        { name: 'a', description: '', argumentsSchema: { kind: 'null' } },
        { name: 'b', description: '', argumentsSchema: { kind: 'null' } },
      ],
    }
    const remaining = MODEL_INPUT_LIMITS.maxTotalStringLength - strings(input)
    const half = Math.floor(remaining / 2)
    input.tools[0]!.description = 'x'.repeat(half)
    input.tools[1]!.description = 'y'.repeat(remaining - half)
    expect(strings(input)).toBe(MODEL_INPUT_LIMITS.maxTotalStringLength)
    expect(judgeFixedModelRequest(input)).toHaveProperty('ok')
    expect(judgeAdmit({ ...admission('whole-budget'), request: input })).toMatchObject({
      failure: { reason: 'budget-strings' },
    })
    input.tools[1]!.description += 'z'
    rejection(input, 'budget-strings')
    const shared = { kind: 'string', value: 'x'.repeat(6_000_000) }
    rejection(withValue({ kind: 'array', items: [shared, shared, shared] }), 'budget-strings')
  })
  it('counts container depth including the lossless wrappers', () => {
    let value: JsonValue = { kind: 'null' }
    for (let depth = 0; depth < 30; depth++) value = { kind: 'array', items: [value] }
    expect(judgeFixedModelRequest(withValue(value))).toHaveProperty('ok')
    rejection(withValue({ kind: 'array', items: [value] }), 'budget-depth')
    // A plain but semantically invalid graph can hit exactly depth 65 before domain judging.
    let raw: unknown = null
    for (let depth = 0; depth < 61; depth++) raw = [raw]
    rejection(withValue(raw), 'json')
    rejection(withValue([raw]), 'budget-depth')
  })
  it.each(['fixed', 'admit'])('counts %s nodes at exactly 100000 and 100001', boundary => {
    const leaves: JsonValue[] = []
    const groups: JsonValue[] = Array.from({ length: 4 }, () => ({ kind: 'array', items: [] }))
    const input = withValue({ kind: 'array', items: groups })
    const root = admission('node-budget')
    const payload = {
      call: root.call,
      operation: root.operation,
      request: input,
      consumer: root.consumer,
      capacity: root.capacity,
    }
    // The payload counter's container stands for the admit root. P and tenant stay opaque.
    const counted = boundary === 'fixed' ? input : payload
    const judge = () =>
      boundary === 'fixed' ? judgeFixedModelRequest(input) : judgeAdmit({ ...root, request: input })
    let count = nodes(counted)
    let group = 0
    while (count + 2 <= MODEL_INPUT_LIMITS.maxNodes) {
      const branch = groups[group]
      if (branch?.kind !== 'array') throw new Error('test branch')
      if (branch.items.length === MODEL_INPUT_LIMITS.maxArrayLength) {
        group++
        continue
      }
      const leaf: JsonValue = { kind: 'null' }
      leaves.push(leaf)
      // Constructing mutable fixture data does not mutate the judged output.
      if (!Array.isArray(branch.items)) throw new Error('fixture items')
      branch.items.push(leaf)
      count += 2
    }
    if (count < MODEL_INPUT_LIMITS.maxNodes)
      Object.assign(leaves[0]!, { kind: 'boolean', value: true })
    expect(nodes(counted)).toBe(100_000)
    expect(judge()).toHaveProperty('ok')
    Object.assign(leaves[1]!, { kind: 'boolean', value: true })
    expect(nodes(counted)).toBe(100_001)
    expect(judge()).toEqual({
      failure: { field: boundary === 'fixed' ? '' : '/capacity', reason: 'budget-nodes' },
    })
  })
  it('budgets unknown width/key before business shape, without claiming the boundary is legal', () => {
    const record = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`k${i}`, null]))
    rejection(withValue(record), 'json')
    rejection(withValue({ ...record, another: null }), 'budget-members')
    rejection(withValue({ ['x'.repeat(128)]: null }), 'json')
    rejection(withValue({ ['x'.repeat(129)]: null }), 'budget-key')
  })
})

it('captures one root descriptor snapshot without invoking property reads', () => {
  let observations = 0
  const reads = new Map<PropertyKey, number>()
  const input = admission('snapshot')
  const proxy = new Proxy(input, {
    get() {
      throw new Error('must not read original properties')
    },
    ownKeys(target) {
      observations++
      return Reflect.ownKeys(target)
    },
    getOwnPropertyDescriptor(target, key) {
      reads.set(key, (reads.get(key) ?? 0) + 1)
      return Reflect.getOwnPropertyDescriptor(target, key)
    },
  })
  const checked = must(judgeAdmit(proxy))
  expect(observations).toBe(1)
  expect([...reads.values()]).toEqual(Array(7).fill(1))
  expect(checked.principal).toBe(input.principal)
  expect(checked.tenant).toBe(input.tenant)
  for (const key of Reflect.ownKeys(input)) {
    const missing = { ...input }
    Reflect.deleteProperty(missing, key)
    expect(judgeAdmit(missing)).toMatchObject({ failure: { reason: 'missing' } })
  }
  expect(judgeAdmit({ ...input, tenant: structuredClone(input.tenant) })).toEqual({
    failure: { field: '/tenant', reason: 'identity' },
  })
})

it('reuses the full ContentBlock, MessagePart and lossless JSON vocabulary', () => {
  const visibility = { toHuman: true, toModel: true }
  const ref = { storage: 'unopened', key: 'unopened', mediaType: '', bytes: '0', digest: 'digest' }
  const blocks = [
    { kind: 'text', id: 'text', visibility, text: 'hello' },
    { kind: 'image', id: 'image', visibility, mediaType: '', inline: '' },
    { kind: 'voice', id: 'voice', visibility, mediaType: '', inline: '' },
    { kind: 'file', id: 'file', visibility, storage: 'unopened', key: 'unopened', mediaType: '' },
    ...['image', 'voice', 'file'].map(kind => ({
      kind,
      id: `${kind}-ref`,
      visibility,
      ref,
      transcript: null,
    })),
  ]
  const json: JsonValue = {
    kind: 'object',
    entries: [
      { key: 'null', value: { kind: 'null' } },
      { key: 'boolean', value: { kind: 'boolean', value: true } },
      { key: 'string', value: { kind: 'string', value: 'text' } },
      { key: 'number', value: { kind: 'number', lexeme: '9007199254740993' } },
      { key: 'array', value: { kind: 'array', items: [{ kind: 'null' }] } },
    ],
  }
  const thinking = { kind: 'thinking', id: 'thinking', visibility, text: '' }
  const messages = [
    ...['user', 'tool_internal', 'system_reminder'].map((role, index) => ({
      id: `msg_${'a'.repeat(22)}${index}`,
      role,
      blocks,
    })),
    {
      id: `msg_${'a'.repeat(22)}3`,
      role: 'compaction',
      blocks,
      covers: { from: 'e1', to: 'e2' },
      retained: ['e2'],
      derivation: { owner: 'owner', record: 'record', revision: '1', digest: 'digest' },
    },
    {
      id: `msg_${'b'.repeat(22)}`,
      role: 'assistant',
      blocks: [
        thinking,
        {
          kind: 'tool_call',
          id: 'complete',
          visibility,
          callId: 'call',
          name: 'tool',
          arguments: json,
        },
        {
          kind: 'tool_call_incomplete',
          id: 'partial',
          visibility: { toHuman: false, toModel: false },
          callId: 'call',
          name: 'tool',
          partial: '{',
        },
        {
          kind: 'tool_call_unparsed',
          id: 'unparsed',
          visibility,
          callId: 'call',
          name: 'tool',
          raw: '{',
        },
      ],
    },
    {
      id: `msg_${'c'.repeat(22)}`,
      role: 'tool',
      blocks: [{ kind: 'tool_result', id: 'result', visibility, callId: 'call' }, ...blocks],
    },
  ]
  const system = [thinking, ...blocks]
  const raw = { ...withValue(json), system, messages }
  const fixed = must(judgeFixedModelRequest(raw))
  expect(fixed.system).toEqual(system)
  expect(fixed.messages).toEqual(messages)
  const assertFrozen = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return
    expect(Object.isFrozen(value)).toBe(true)
    for (const child of Object.values(value)) assertFrozen(child)
  }
  assertFrozen(fixed)
  const aliasedRef = fixed.system[5]
  expect(aliasedRef).not.toBe(blocks[5])
  rejection({ ...raw, messages: [{ ...messages[4], role: 'user' }] }, 'message')
  rejection({ ...raw, system: [{ ...blocks[0], secret: true }] }, 'content')
})

it('requires every root field in the same ownKeys snapshot before reading descriptors', () => {
  const input = admission('omitted-own-key')
  for (const omitted of [
    'principal',
    'tenant',
    'call',
    'operation',
    'request',
    'consumer',
    'capacity',
  ]) {
    const proxy = new Proxy(input, {
      ownKeys(target) {
        return Reflect.ownKeys(target).filter(key => key !== omitted)
      },
    })
    expect(judgeAdmit(proxy)).toEqual({ failure: { field: `/${omitted}`, reason: 'missing' } })
  }
})

it('shares the admit string budget across payloads and excludes opaque access entirely', () => {
  const input = admission('access-budget')
  const request = {
    ...input.request,
    tools: [
      { name: 'a', description: '', argumentsSchema: { kind: 'null' } },
      { name: 'b', description: '', argumentsSchema: { kind: 'null' } },
    ],
  }
  const payload = {
    call: input.call,
    operation: input.operation,
    request,
    consumer: input.consumer,
    capacity: input.capacity,
  }
  const remaining = MODEL_INPUT_LIMITS.maxTotalStringLength - strings(payload)
  const [first, second] = request.tools
  if (!first || !second) throw new Error('two tool declarations')
  first.description = 'x'.repeat(Math.floor(remaining / 2))
  second.description = 'y'.repeat(remaining - first.description.length)
  const principal = Object.assign(() => true, {
    credential: 'z'.repeat(MODEL_INPUT_LIMITS.maxStringLength + 1),
  })
  expect(strings(payload)).toBe(MODEL_INPUT_LIMITS.maxTotalStringLength)
  expect(judgeAdmit({ ...input, principal, request })).toHaveProperty('ok')
  second.description += 'x'
  expect(judgeAdmit({ ...input, principal, request })).toMatchObject({
    failure: { reason: 'budget-strings' },
  })
  expect(Object.isFrozen(principal)).toBe(false)
})

it.each([
  { location: 'payload field name', capacity: {}, field: '/capacity/bytes', reason: 'missing' },
  {
    location: 'last nested field name',
    capacity: { bytes: '1', blocks: '1', attachmentBytes: null },
    field: '/capacity/attachmentBytes',
    reason: 'integer',
  },
])('counts the $location at the cumulative string boundary', ({ capacity, field, reason }) => {
  const input = admission('last-key-budget')
  const request = {
    ...input.request,
    tools: [
      { name: 'a', description: '', argumentsSchema: { kind: 'null' } },
      { name: 'b', description: '', argumentsSchema: { kind: 'null' } },
    ],
  }
  const payload = {
    call: input.call,
    operation: input.operation,
    request,
    consumer: input.consumer,
    capacity,
  }
  const remaining = MODEL_INPUT_LIMITS.maxTotalStringLength - strings(payload)
  const [first, second] = request.tools
  if (!first || !second) throw new Error('two tool declarations')
  first.description = 'x'.repeat(Math.floor(remaining / 2))
  second.description = 'y'.repeat(remaining - first.description.length)
  expect(Object.keys(payload).at(-1)).toBe('capacity')
  expect(Object.keys(capacity).at(-1)).toBe(
    'attachmentBytes' in capacity ? 'attachmentBytes' : undefined,
  )
  expect(strings(payload)).toBe(MODEL_INPUT_LIMITS.maxTotalStringLength)
  expect(judgeAdmit({ ...input, request, capacity })).toEqual({ failure: { field, reason } })
  second.description += 'z'
  expect(strings(payload)).toBe(MODEL_INPUT_LIMITS.maxTotalStringLength + 1)
  expect(judgeAdmit({ ...input, request, capacity })).toEqual({
    failure: { field: '/capacity', reason: 'budget-strings' },
  })
})

it('copies null prototypes and refuses a data __proto__ key without changing output prototypes', () => {
  const input = Object.assign(Object.create(null), request)
  expect(judgeFixedModelRequest(input)).toHaveProperty('ok')
  Object.defineProperty(input, '__proto__', { value: { polluted: true }, enumerable: true })
  expect(judgeFixedModelRequest(input)).toEqual({ failure: { field: '', reason: 'unknown-field' } })
  expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
})

it('keeps first rejection across request groups and payload capture', () => {
  const failures = [
    { patch: { profile: null, suppliers: [] }, field: '/profile', reason: 'type' },
    { patch: { suppliers: [], fallback: 'no' }, field: '/suppliers', reason: 'value' },
    { patch: { fallback: 'no', retryPolicy: null }, field: '/fallback', reason: 'type' },
    { patch: { retryPolicy: null, parameters: [{}] }, field: '/retryPolicy', reason: 'type' },
    { patch: { parameters: [{}], system: [null] }, field: '/parameters/0/kind', reason: 'missing' },
    { patch: { system: [null], messages: [null] }, field: '/system/0', reason: 'content' },
    { patch: { messages: [null], tools: [null] }, field: '/messages/0', reason: 'message' },
    { patch: { tools: [null], toolChoice: 'invalid' }, field: '/tools/0', reason: 'type' },
    {
      patch: { toolChoice: 'invalid', representation: null },
      field: '/toolChoice',
      reason: 'type',
    },
    {
      patch: { representation: null, parameterAdoptions: [null] },
      field: '/representation',
      reason: 'type',
    },
    {
      patch: { parameterAdoptions: [null], source: null },
      field: '/parameterAdoptions/0',
      reason: 'type',
    },
  ]
  for (const { patch, field, reason } of failures)
    expect(judgeFixedModelRequest({ ...request, ...patch })).toEqual({ failure: { field, reason } })
  const input = admission('priority')
  expect(
    judgeAdmit({ ...input, call: 'invalid', request: { ...request, secret: () => true } }),
  ).toEqual({
    failure: { field: '/request', reason: 'type' },
  })
})

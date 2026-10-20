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
  const input = { ...admission('judge'), principal }
  const checked = must(judgeAdmit(input))
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
  const parameters: FixedModelRequest['parameters'] = [
    { kind: 'temperature', value: 2 },
    { kind: 'top-p', value: 1 },
    { kind: 'max-output-tokens', value: '1' },
    { kind: 'seed', value: '0' },
    { kind: 'stop', value: ['END'] },
    { kind: 'reasoning-effort', value: 'max' },
    { kind: 'frequency-penalty', value: -2 },
    { kind: 'presence-penalty', value: 2 },
    {
      kind: 'extension',
      definition: adopted,
      value: { kind: 'number', lexeme: '9007199254740993' },
    },
  ]
  for (const credential of [
    { kind: 'factory' },
    { kind: 'tenant', id: must(decodeCredentialId('credential')) },
  ] as const)
    for (const toolChoice of ['none', 'auto', 'required', { name: 'lookup' }] as const) {
      const input = {
        ...request,
        parameters,
        suppliers: [{ ...request.suppliers[0], credential }],
        tools: [
          { name: 'lookup', description: '', argumentsSchema: { kind: 'object', entries: [] } },
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
            origin: { kind: 'explicit', requested: parameters[0], source: adopted },
          },
        ],
      }
      expect(judgeFixedModelRequest(input)).toHaveProperty('ok')
    }
  rejection(withValue({ ordinary: 'json' }), 'json')
  rejection({ ...request, parameters: [{ kind: 'temperature', value: 2.1 }] }, 'range')
  expect(
    judgeFixedModelRequest({ ...request, parameters: [{ kind: 'temperature', value: 2.1 }] }),
  ).toEqual({ failure: { field: '/parameters/0/value', reason: 'range' } })
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
  it('counts nodes on edges, including repeated objects, at exactly 100000 and 100001', () => {
    const leaves: JsonValue[] = []
    const groups: JsonValue[] = Array.from({ length: 4 }, () => ({ kind: 'array', items: [] }))
    const input = withValue({ kind: 'array', items: groups })
    let count = nodes(input)
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
    expect(nodes(input)).toBe(MODEL_INPUT_LIMITS.maxNodes)
    expect(judgeFixedModelRequest(input)).toHaveProperty('ok')
    Object.assign(leaves[1]!, { kind: 'boolean', value: true })
    rejection(input, 'budget-nodes')
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
    { kind: 'thinking', id: 'thinking', visibility, text: '' },
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
  const messages = [
    ...['user', 'tool_internal', 'system_reminder', 'compaction'].map((role, index) => ({
      id: `msg_${'a'.repeat(22)}${index}`,
      role,
      blocks,
    })),
    {
      id: `msg_${'b'.repeat(22)}`,
      role: 'assistant',
      blocks: [
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
  const raw = { ...withValue(json), system: blocks, messages }
  const fixed = must(judgeFixedModelRequest(raw))
  expect(fixed.system).toEqual(blocks)
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

it('copies null prototypes and refuses a data __proto__ key without changing output prototypes', () => {
  const input = Object.assign(Object.create(null), request)
  expect(judgeFixedModelRequest(input)).toHaveProperty('ok')
  Object.defineProperty(input, '__proto__', { value: { polluted: true }, enumerable: true })
  expect(judgeFixedModelRequest(input)).toEqual({ failure: { field: '', reason: 'unknown-field' } })
  expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
})

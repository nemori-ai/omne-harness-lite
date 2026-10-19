import { expect, it } from 'vitest'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import type { FixedModelRequest, Parameter } from '@omne-harness/model-contract'
import { adoption, fixture, unbox } from './memory-fixture.ts'

const numeric = ['temperature', 'top-p', 'frequency-penalty', 'presence-penalty'] as const
for (const kind of numeric) {
  it(`rejects nonfinite ${kind} as a typed reply before binding or unknown injection`, async () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      const f = fixture()
      const { commands, control } = createMemoryModelCommands(f.options)
      control.injectUnknown({ ...f.admit, method: 'admit', effect: 'applied' })
      const invalid = { ...f.admit, request: { ...f.admit.request, parameters: [{ kind, value }] } }
      f.denied.add('admit')
      expect(await commands.admit(invalid)).toMatchObject({ failure: { kind: 'denied' } })
      f.denied.delete('admit')
      const reply = commands.admit(invalid)
      expect(reply).toBeInstanceOf(Promise)
      expect(await reply).toEqual({ failure: { kind: 'invalid', field: kind, reason: 'range' } })
      expect(unbox(await commands.recall({ ...f.admit, admission: f.admit.operation })).kind).toBe(
        'not-accepted',
      )
      const valid = {
        ...f.admit,
        request: { ...f.admit.request, parameters: [{ kind, value: 1 }] },
      }
      expect(await commands.admit(valid)).toMatchObject({ failure: { kind: 'commit-unknown' } })
      expect(await commands.admit(invalid)).toMatchObject({ failure: { kind: 'conflict' } })
      expect(await commands.admit(valid)).toMatchObject({ failure: { kind: 'commit-unknown' } })
      control.reveal({ ...f.admit, result: 'committed' })
      expect(unbox(await commands.admit(valid)).recovered).toBe(true)
      expect(await commands.admit(invalid)).toMatchObject({ failure: { kind: 'conflict' } })
      expect(
        await commands.admit({
          ...valid,
          request: { ...valid.request, parameters: [{ kind, value: 3 }] },
        }),
      ).toMatchObject({ failure: { kind: 'conflict' } })
      expect(
        await commands.admit({
          ...valid,
          request: { ...valid.request, parameters: [{ kind, value: 0.5 }] },
        }),
      ).toMatchObject({ failure: { kind: 'conflict' } })
    }
  })
}

it('accepts the declared parameter families at their legal boundaries', async () => {
  const rows: readonly (readonly Parameter[])[] = [
    [
      { kind: 'temperature', value: 0 },
      { kind: 'top-p', value: Number.MIN_VALUE },
      { kind: 'frequency-penalty', value: -2 },
      { kind: 'presence-penalty', value: -2 },
    ],
    [
      { kind: 'temperature', value: 2 },
      { kind: 'top-p', value: 1 },
      { kind: 'frequency-penalty', value: 2 },
      { kind: 'presence-penalty', value: 2 },
    ],
    [
      { kind: 'max-output-tokens', value: '1' },
      { kind: 'seed', value: '0' },
      { kind: 'stop', value: ['END', 'STOP'] },
      { kind: 'reasoning-effort', value: 'max' },
      {
        kind: 'extension',
        definition: adoption,
        value: {
          kind: 'object',
          entries: [{ key: 'nested', value: { kind: 'array', items: [{ kind: 'null' }] } }],
        },
      },
    ],
  ]
  for (const parameters of rows) {
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    const input = { ...f.admit, request: { ...f.admit.request, parameters } }
    unbox(await commands.admit(input))
    expect(unbox(await commands.loadRecovery(input)).request.parameters).toEqual(parameters)
    expect(unbox(await commands.admit(input)).recovered).toBe(true)
  }
})

it('rejects invalid parameter policies and tool relationships without reserving the operation', async () => {
  const parameters: readonly (readonly unknown[])[] = [
    [{ kind: 'temperature', value: -0.1 }],
    [{ kind: 'temperature', value: 2.1 }],
    [{ kind: 'top-p', value: 0 }],
    [{ kind: 'top-p', value: 1.1 }],
    [{ kind: 'frequency-penalty', value: -2.1 }],
    [{ kind: 'frequency-penalty', value: 2.1 }],
    [{ kind: 'presence-penalty', value: -2.1 }],
    [{ kind: 'presence-penalty', value: 2.1 }],
    [{ kind: 'max-output-tokens', value: '0' }],
    [{ kind: 'max-output-tokens', value: '1.5' }],
    [{ kind: 'seed', value: '-1' }],
    [{ kind: 'stop', value: [] }],
    [{ kind: 'stop', value: ['END', 'END'] }],
    [{ kind: 'stop', value: [''] }],
    [
      { kind: 'temperature', value: 1 },
      { kind: 'temperature', value: 1 },
    ],
    [{ kind: 'extension', definition: adoption, value: NaN }],
    [{ kind: 'extension', definition: { ...adoption, digest: 'invalid' }, value: null }],
    [
      { kind: 'extension', definition: adoption, value: null },
      { kind: 'extension', definition: adoption, value: true },
    ],
  ]
  const tool = {
    name: 'lookup',
    description: 'lookup',
    argumentsSchema: { kind: 'object', entries: [] } as const,
  }
  const f = fixture()
  const requests: unknown[] = [
    ...parameters.map(parameters => ({ ...f.admit.request, parameters })),
    { ...f.admit.request, toolChoice: { name: 'missing' }, tools: [tool] },
    { ...f.admit.request, tools: [tool, tool] },
    { ...f.admit.request, tools: [{ ...tool, argumentsSchema: Infinity }] },
    { ...f.admit.request, suppliers: [f.admit.request.suppliers[0], f.admit.request.suppliers[0]] },
    { ...f.admit.request, profile: { ...adoption, digest: 'invalid' } },
  ]
  for (const request of requests) {
    const local = fixture()
    const { commands } = createMemoryModelCommands(local.options)
    const input = { ...local.admit, request }
    expect(await Reflect.apply(commands.admit, commands, [input])).toMatchObject({
      failure: { kind: 'invalid' },
    })
    expect(unbox(await commands.query(input)).kind).toBe('not-committed')
    unbox(
      await commands.admit({
        ...input,
        request: { ...local.admit.request, tools: [tool], toolChoice: { name: tool.name } },
      }),
    )
  }
})

it('keeps an unknown unapplied admission bound while rejecting different illegal inputs', async () => {
  const f = fixture()
  const { commands, control } = createMemoryModelCommands(f.options)
  const original = {
    ...f.admit,
    request: { ...f.admit.request, parameters: [{ kind: 'temperature', value: 1 }] },
  } satisfies Parameters<typeof commands.admit>[0]
  control.injectUnknown({ ...original, method: 'admit', effect: 'not-applied' })
  expect(await commands.admit(original)).toMatchObject({ failure: { kind: 'commit-unknown' } })
  for (const value of [NaN, Infinity, 3, 0.5])
    expect(
      await commands.admit({
        ...original,
        request: { ...original.request, parameters: [{ kind: 'temperature', value }] },
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
  expect(unbox(await commands.query(original)).kind).toBe('unknown')
  expect(await commands.admit(original)).toMatchObject({ failure: { kind: 'commit-unknown' } })
  control.reveal({ ...original, result: 'rolled-back' })
  unbox(await commands.admit(original))
  expect(unbox(await commands.admit(original)).recovered).toBe(true)
})

function adoptedRequest(
  request: FixedModelRequest,
  location: 'applied' | 'requested',
  parameter: Parameter,
): FixedModelRequest {
  return {
    ...request,
    parameterAdoptions: [
      {
        supplier: request.suppliers[0].adoption,
        applied: location === 'applied' ? parameter : { kind: 'temperature', value: 1 },
        origin:
          location === 'requested'
            ? { kind: 'explicit', requested: parameter, source: request.source }
            : { kind: 'default', source: request.source },
      },
    ],
  }
}
for (const location of ['applied', 'requested'] as const) {
  for (const kind of numeric) {
    it(`validates ${location} ${kind} before committing or consuming an unknown plan`, async () => {
      for (const value of [NaN, Infinity, -Infinity, 3]) {
        const f = fixture()
        const { commands, control } = createMemoryModelCommands(f.options)
        control.injectUnknown({ ...f.admit, method: 'admit', effect: 'applied' })
        const input = {
          ...f.admit,
          request: adoptedRequest(f.admit.request, location, { kind, value }),
        }
        const reply = commands.admit(input)
        expect(reply).toBeInstanceOf(Promise)
        expect(await reply).toEqual({ failure: { kind: 'invalid', field: kind, reason: 'range' } })
        expect(await commands.query(input)).toEqual({ ok: { kind: 'not-committed' } })
        const valid = {
          ...input,
          request: adoptedRequest(f.admit.request, location, { kind, value: 1 }),
        }
        expect(await commands.admit(valid)).toMatchObject({ failure: { kind: 'commit-unknown' } })
      }
    })
    it(`keeps ${location} ${kind} conflicts and current qualification ahead of replay`, async () => {
      for (const mode of ['committed', 'applied', 'not-applied'] as const) {
        const f = fixture()
        const { commands, control } = createMemoryModelCommands(f.options)
        const original = {
          ...f.admit,
          request: adoptedRequest(f.admit.request, location, { kind, value: 1 }),
        }
        if (mode !== 'committed')
          control.injectUnknown({ ...original, method: 'admit', effect: mode })
        await commands.admit(original)
        for (const value of [NaN, Infinity, -Infinity, 3]) {
          const changed = {
            ...original,
            request: adoptedRequest(f.admit.request, location, { kind, value }),
          }
          f.denied.add('facts')
          expect(await commands.admit(changed)).toMatchObject({ failure: { kind: 'denied' } })
          f.denied.delete('facts')
          expect(await commands.admit(changed)).toMatchObject({ failure: { kind: 'conflict' } })
        }
        if (mode === 'committed') expect(unbox(await commands.admit(original)).recovered).toBe(true)
        else {
          expect(await commands.admit(original)).toMatchObject({
            failure: { kind: 'commit-unknown' },
          })
          control.reveal({ ...original, result: mode === 'applied' ? 'committed' : 'rolled-back' })
          unbox(await commands.admit(original))
        }
        expect(unbox(await commands.loadRecovery(original)).request).toEqual(original.request)
      }
    })
  }
  it(`accepts legal ${location} parameter boundaries and rejects malformed adoption records`, async () => {
    const parameters: readonly Parameter[] = [
      { kind: 'temperature', value: 0 },
      { kind: 'temperature', value: 2 },
      { kind: 'top-p', value: Number.MIN_VALUE },
      { kind: 'top-p', value: 1 },
      { kind: 'frequency-penalty', value: -2 },
      { kind: 'frequency-penalty', value: 2 },
      { kind: 'presence-penalty', value: -2 },
      { kind: 'presence-penalty', value: 2 },
      { kind: 'max-output-tokens', value: '1' },
      { kind: 'seed', value: '0' },
      { kind: 'stop', value: ['END'] },
      { kind: 'reasoning-effort', value: 'max' },
      { kind: 'extension', definition: adoption, value: { kind: 'null' } },
    ]
    for (const parameter of parameters) {
      const f = fixture()
      const { commands } = createMemoryModelCommands(f.options)
      const input = { ...f.admit, request: adoptedRequest(f.admit.request, location, parameter) }
      unbox(await commands.admit(input))
      expect(unbox(await commands.loadRecovery(input)).request).toEqual(input.request)
    }
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    const entry = adoptedRequest(f.admit.request, location, { kind: 'temperature', value: 1 })
      .parameterAdoptions[0]
    if (!entry) throw new Error('adoption fixture')
    const badEntries: unknown[] = [
      null,
      { ...entry, supplier: { ...adoption, digest: 'invalid' } },
      { ...entry, origin: { kind: 'other', source: adoption } },
      { ...entry, origin: { kind: 'explicit', source: adoption } },
      { ...entry, origin: { ...entry.origin, source: null } },
      { ...entry, applied: { kind: 'stop', value: [] } },
      { ...entry, applied: { kind: 'extension', definition: null, value: { kind: 'null' } } },
    ]
    for (const bad of badEntries) {
      expect(
        await Reflect.apply(commands.admit, commands, [
          { ...f.admit, request: { ...f.admit.request, parameterAdoptions: [bad] } },
        ]),
      ).toMatchObject({ failure: { kind: 'invalid' } })
      expect(await commands.query(f.admit)).toEqual({ ok: { kind: 'not-committed' } })
    }
    unbox(await commands.admit(f.admit))
  })
}
